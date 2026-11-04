/**
 * V4 Adım 9 — botların JS çalıştırmadan gördüğü ham HTML.
 * Salt okunur. Sayfa üretmez, prerender eklemez, veritabanına yazmaz.
 *
 * Çalıştırma: npm run audit:bot-html
 * BOT_AUDIT_BASE=https://www.touristlio.com (varsayılan)
 * Çıktı (gitignore): reports/v4-adim9-bot-html.json
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DEFAULT_BASE = 'https://www.touristlio.com';
const AUDIT_PATHS = [
  { id: 'home', path: '/' },
  { id: 'place', path: '/places/ayasofya-istanbul' },
  { id: 'blog', path: '/blog' },
];

function decodeBasic(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function collapse(value) {
  return decodeBasic(String(value || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function attr(tag, name) {
  const re = new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i');
  const match = String(tag || '').match(re);
  return match ? decodeBasic(match[2]) : '';
}

function tags(html, name) {
  return String(html || '').match(new RegExp(`<${name}\\b[^>]*>`, 'gi')) || [];
}

function metaContent(html, key) {
  for (const tag of tags(html, 'meta')) {
    const name = attr(tag, 'name') || attr(tag, 'property');
    if (name.toLowerCase() === key.toLowerCase()) return attr(tag, 'content');
  }
  return '';
}

function linkHref(html, rel) {
  const found = [];
  for (const tag of tags(html, 'link')) {
    if (attr(tag, 'rel').toLowerCase() !== rel) continue;
    found.push({
      hreflang: attr(tag, 'hreflang'),
      href: attr(tag, 'href'),
    });
  }
  return found;
}

function innerById(html, id) {
  const open = new RegExp(`<([a-z0-9]+)\\b[^>]*\\bid=["']${id}["'][^>]*>`, 'i').exec(html);
  if (!open) return null;
  const tag = open[1].toLowerCase();
  const rest = html.slice(open.index + open[0].length);
  const token = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  let depth = 1;
  let match;
  while ((match = token.exec(rest))) {
    depth += match[1] ? -1 : 1;
    if (depth === 0) return rest.slice(0, match.index);
  }
  return null;
}

function openTagById(html, id) {
  const match = String(html || '').match(new RegExp(`<[^>]*\\bid=["']${id}["'][^>]*>`, 'i'));
  return match ? match[0] : '';
}

function isHidden(tag) {
  const attrs = String(tag || '').replace(/\baria-hidden\s*=\s*(["']).*?\1/gi, '');
  return /\bhidden\b/i.test(attrs);
}

function anchors(html) {
  const out = [];
  const re = /<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1/gi;
  let match;
  const source = String(html || '');
  while ((match = re.exec(source))) out.push(decodeBasic(match[2]));
  return out;
}

function pathnameOf(href) {
  try {
    return new URL(href, 'https://touristlio.local').pathname || '';
  } catch {
    return '';
  }
}

function isPlaceHref(href) {
  return /^\/(?:en\/)?places\/[^/?#]+/.test(pathnameOf(href));
}

function isBlogArticleHref(href) {
  return /^\/(?:en\/)?blog\/[^/?#]+/.test(pathnameOf(href));
}

function headings(html, level) {
  const re = new RegExp(`<h${level}\\b[^>]*>([\\s\\S]*?)</h${level}>`, 'gi');
  const out = [];
  let match;
  while ((match = re.exec(String(html || '')))) out.push(collapse(match[1]));
  return out;
}

function jsonLdBlocks(html) {
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const blocks = [];
  let match;
  while ((match = re.exec(String(html || '')))) {
    const raw = match[1].trim();
    try {
      blocks.push(JSON.parse(raw));
    } catch {
      blocks.push({ '@type': null, parseError: true });
    }
  }
  return blocks;
}

function topTypes(data) {
  if (!data || typeof data !== 'object') return [];
  if (Array.isArray(data)) return data.flatMap(topTypes);
  if (Array.isArray(data['@graph'])) return data['@graph'].flatMap(topTypes);
  if (data['@type']) return [data['@type']];
  return [];
}

function inspectHtml(html, pageUrl) {
  const source = String(html || '');
  const h1 = headings(source, 1);
  const ld = jsonLdBlocks(source);
  const hrefs = anchors(source);
  const placeHrefs = hrefs.filter(isPlaceHref);
  const blogHrefs = hrefs.filter(isBlogArticleHref);
  const sections = ['page-explore', 'page-places', 'page-blog', 'page-detail'].map((id) => {
    const tag = openTagById(source, id);
    return { id, present: Boolean(tag), hidden: tag ? isHidden(tag) : null };
  });
  const pgrid = innerById(source, 'pgrid');
  const blogGrid = innerById(source, 'blogGrid');
  const pdTitle = innerById(source, 'pdTitle');
  const pdOverview = innerById(source, 'pdOverview');
  const pdHist = innerById(source, 'pdHist');
  const blogDetail = innerById(source, 'blogDetailBody');
  const resCnt = innerById(source, 'resCnt');
  const discoverCount = innerById(source, 'discoverPlaceCount');
  const visible = sections.find((section) => section.present && section.hidden === false);
  return {
    url: pageUrl || '',
    title: collapse((source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || ''),
    description: metaContent(source, 'description'),
    robots: metaContent(source, 'robots'),
    canonical: (linkHref(source, 'canonical')[0] || {}).href || '',
    hreflang: linkHref(source, 'alternate')
      .filter((link) => link.hreflang)
      .map((link) => ({ hreflang: link.hreflang, href: link.href })),
    h1Count: h1.length,
    h1: h1,
    jsonLdTypes: ld.flatMap(topTypes),
    jsonLd: ld.map((block) => ({
      type: topTypes(block),
      name: typeof block.name === 'string' ? block.name : (typeof block.headline === 'string' ? block.headline : ''),
      descriptionLength: typeof block.description === 'string' ? block.description.length : 0,
      hasImage: Boolean(block.image),
      parseError: block.parseError === true,
    })),
    anchorCount: hrefs.length,
    placeAnchorCount: placeHrefs.length,
    placeAnchors: placeHrefs,
    blogArticleAnchorCount: blogHrefs.length,
    blogArticleAnchors: blogHrefs,
    resCnt: collapse(resCnt || ''),
    discoverPlaceCount: collapse(discoverCount || ''),
    pgridEmpty: pgrid != null && collapse(pgrid) === '',
    blogGridEmpty: blogGrid != null && collapse(blogGrid) === '',
    placeTitleEmpty: pdTitle != null && collapse(pdTitle) === '',
    placeOverviewEmpty: pdOverview != null && collapse(pdOverview) === '',
    placeHistoryEmpty: pdHist != null && collapse(pdHist) === '',
    blogDetailEmpty: blogDetail != null && collapse(blogDetail) === '',
    visibleSection: visible ? visible.id : '',
    sections,
  };
}

function contentNote(id, page) {
  if (id === 'home') {
    return page.pgridEmpty && page.placeAnchorCount === 0
      ? 'Slogan HTML’de. Yer listesi ve mekân linki yok; liste JS ile geliyor.'
      : 'Yer listesi veya mekân linki ham HTML’de var.';
  }
  if (id === 'place') {
    return page.placeTitleEmpty && page.placeOverviewEmpty
      ? 'Başlık, açıklama ve JSON-LD sunucuda. Mekân adı h1 değil. Gövde metni JS ile geliyor.'
      : 'Mekân gövdesi ham HTML’de dolu.';
  }
  return page.blogGridEmpty && page.blogArticleAnchorCount === 0
    ? 'Blog başlığı sunucuda. Yazı listesi ve yazı linki yok; liste JS ile geliyor.'
    : 'Blog listesi ham HTML’de dolu.';
}

async function fetchRaw(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      Accept: 'text/html',
      'User-Agent': 'TouristlioBotAudit/1.0 (raw HTML, no JavaScript)',
    },
  });
  const html = await response.text();
  return { status: response.status, finalUrl: response.url, html };
}

function resolveBase(argv) {
  const flag = argv.indexOf('--base');
  if (flag !== -1 && argv[flag + 1]) return argv[flag + 1];
  return process.env.BOT_AUDIT_BASE || DEFAULT_BASE;
}

function printPage(entry) {
  const page = entry.page;
  console.log(`\n${entry.path}  HTTP ${entry.status}`);
  console.log(`  title: ${page.title}`);
  console.log(`  description (${page.description.length}): ${page.description}`);
  console.log(`  robots: ${page.robots}`);
  console.log(`  canonical: ${page.canonical}`);
  console.log(`  hreflang: ${page.hreflang.map((link) => `${link.hreflang} ${link.href}`).join(' | ')}`);
  console.log(`  h1 (${page.h1Count}): ${page.h1.join(' / ')}`);
  console.log(`  JSON-LD: ${page.jsonLdTypes.join(', ') || '(yok)'}`);
  console.log(`  <a href="/places/...">: ${page.placeAnchorCount}`);
  console.log(`  <a href="/blog/...">: ${page.blogArticleAnchorCount}`);
  console.log(`  #resCnt: ${page.resCnt || '(yok)'}`);
  console.log(`  #pgrid boş: ${page.pgridEmpty ? 'evet' : 'hayır'}`);
  console.log(`  #blogGrid boş: ${page.blogGridEmpty ? 'evet' : 'hayır'}`);
  console.log(`  #pdTitle boş: ${page.placeTitleEmpty ? 'evet' : 'hayır'}`);
  console.log(`  #pdOverview boş: ${page.placeOverviewEmpty ? 'evet' : 'hayır'}`);
  console.log(`  görünen bölüm: ${page.visibleSection || '(yok)'}`);
  console.log(`  sonuç: ${entry.note}`);
}

async function audit(base) {
  const root = String(base || DEFAULT_BASE).replace(/\/$/, '');
  const pages = [];
  for (const item of AUDIT_PATHS) {
    const url = new URL(item.path, `${root}/`).toString();
    const fetched = await fetchRaw(url);
    const page = inspectHtml(fetched.html, fetched.finalUrl || url);
    pages.push({
      id: item.id,
      path: item.path,
      status: fetched.status,
      bytes: Buffer.byteLength(fetched.html),
      note: contentNote(item.id, page),
      page,
    });
  }
  return {
    generatedAt: new Date().toISOString(),
    base: root,
    javascript: false,
    pages,
  };
}

async function main() {
  const base = resolveBase(process.argv.slice(2));
  const report = await audit(base);
  const outDir = path.join(ROOT, 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'v4-adim9-bot-html.json');
  fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`V4 Adım 9 — ham HTML (JS yok)`);
  console.log(`Kaynak: ${report.base}`);
  for (const entry of report.pages) printPage(entry);
  console.log(`\nRapor: ${path.relative(ROOT, outFile)}`);
  console.log('Bu adım yalnızca denetler. Öneri AUDIT_FOLLOWUPS.md içindedir.');
  const failed = report.pages.some((entry) => entry.status !== 200);
  if (failed) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err && err.message ? err.message : err);
    process.exit(1);
  });
}

module.exports = {
  AUDIT_PATHS,
  DEFAULT_BASE,
  inspectHtml,
  isPlaceHref,
  isBlogArticleHref,
  contentNote,
  audit,
};
