/**
 * Cursor V4 Adım 2 — blog is actually bilingual.
 * EN reads only *_en fields. Empty English does not fall back to Turkish.
 * Usage: node server/scripts/verify-v4-adim2-blog-i18n.js
 */
require('dotenv').config();
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

console.log('verify-v4-adim2-blog-i18n');

const {
  localizeBlog,
  blogEnFields,
  blogAuthorName,
  blogEnSitemapPath,
  UNTRANSLATED_NOTE,
  EN_UNTRANSLATED_TITLE,
} = require('../lib/blog-i18n');
const { articleSchema } = require('../lib/jsonld');
const { generateMeta, buildSeoHead } = require('../lib/seo');
const { withEnglishAlternates, isBlogDetailPath } = require('../lib/sitemap');

const trOnly = {
  title: 'Ayasofya rehberi',
  excerpt: 'Kısa Türkçe özet',
  body: 'Uzun Türkçe gövde',
  slug: 'ayasofya-rehberi',
  title_en: null,
  excerpt_en: '',
  body_en: null,
  slug_en: null,
};
const locEn = localizeBlog(trOnly, 'en');
if (locEn.translated !== false) fail('empty EN fields were marked translated');
else if (locEn.title || locEn.excerpt || locEn.body || locEn.slug) {
  fail(`EN localize fell back to Turkish: ${JSON.stringify(locEn)}`);
} else if (locEn.titleTr !== 'Ayasofya rehberi' || locEn.slugTr !== 'ayasofya-rehberi') {
  fail('TR fields were dropped from the localized object');
} else ok('lang=en does not fall back to Turkish title, excerpt, body, or slug');

const partial = localizeBlog({
  ...trOnly,
  title_en: 'Hagia Sophia guide',
  excerpt_en: 'A short English excerpt',
}, 'en');
if (partial.translated !== false || partial.title !== 'Hagia Sophia guide' || partial.body) {
  fail('partial EN translation fell back or was marked complete');
} else ok('partial EN stays partial and translated=false');

const full = localizeBlog({
  ...trOnly,
  title_en: 'Hagia Sophia guide',
  excerpt_en: 'A short English excerpt',
  body_en: 'The English article body.',
  slug_en: 'hagia-sophia-guide',
}, 'en');
if (!full.translated || full.title !== 'Hagia Sophia guide' || full.slug !== 'hagia-sophia-guide') {
  fail('complete EN fields were not used');
} else if (full.title.includes('Ayasofya') || full.excerpt.includes('Türkçe')) {
  fail('complete EN response still contains Turkish copy');
} else ok('complete EN fields win and translated=true');

const trView = localizeBlog(full && {
  title: 'Ayasofya rehberi',
  excerpt: 'Kısa Türkçe özet',
  body: 'Uzun Türkçe gövde',
  slug: 'ayasofya-rehberi',
  title_en: 'Hagia Sophia guide',
  excerpt_en: 'A short English excerpt',
  body_en: 'The English article body.',
  slug_en: 'hagia-sophia-guide',
}, 'tr');
if (trView.title !== 'Ayasofya rehberi' || trView.slug !== 'ayasofya-rehberi' || !trView.translated) {
  fail('Turkish view changed');
} else ok('lang=tr still returns the Turkish fields');

if (blogEnSitemapPath(trOnly) !== null) fail('untranslated blog got an EN sitemap path');
else if (blogEnSitemapPath({
  title_en: 'Hagia Sophia guide',
  excerpt_en: 'A short English excerpt',
  body_en: 'The English article body.',
  slug_en: 'hagia sophia',
}) !== '/en/blog/hagia%20sophia') fail('EN sitemap path was not slug_en');
else ok('EN sitemap path only when every English field is filled');

if (blogAuthorName({}, 'en') !== 'Anonymous' || blogAuthorName({}, 'tr') !== 'Anonim') {
  fail('author fallback is not language-specific');
} else if (blogAuthorName({ author_name: 'Yasin' }, 'en') !== 'Yasin') {
  fail('named author was translated');
} else ok('author fallback is Anonymous in English and Anonim in Turkish');

const legacy = articleSchema({ title: 'Hello', slug: 'hello-world', excerpt: 'A short excerpt' }, 'en');
if (legacy?.inLanguage !== 'en' || !/\/en\/blog\/hello-world$/.test(legacy.url || '')) {
  fail('legacy EN Article builder broke');
} else ok('Article builder still accepts an already-English post');

const mixed = articleSchema({
  title: 'Ayasofya rehberi',
  titleEn: 'Hagia Sophia guide',
  excerpt: 'Kısa Türkçe özet',
  excerptEn: 'A short English excerpt',
  slug: 'ayasofya-rehberi',
  slugEn: 'hagia-sophia-guide',
  translated: true,
}, 'en');
if (!mixed || mixed.headline.includes('Ayasofya') || mixed.description.includes('Türkçe') || !/\/en\/blog\/hagia-sophia-guide$/.test(mixed.url || '')) {
  fail(`EN Article used Turkish fields: ${JSON.stringify(mixed && { headline: mixed.headline, url: mixed.url })}`);
} else if (mixed.inLanguage !== 'en') fail('EN Article inLanguage is not en');
else ok('EN Article JSON-LD uses English headline, description, and slug');

if (articleSchema({ ...trOnly, translated: false }, 'en') !== null) {
  fail('untranslated EN Article was emitted');
} else ok('untranslated EN page does not emit Article JSON-LD');

const meta = generateMeta('blog', { post: { ...trOnly, translated: false, titleEn: '', excerptEn: '' } }, 'en');
if (meta.title !== EN_UNTRANSLATED_TITLE || /Ayasofya|Türkçe/.test(`${meta.title} ${meta.description}`)) {
  fail(`EN meta fell back to Turkish: ${meta.title}`);
} else ok('EN meta for an untranslated post is the English notice');

const head = buildSeoHead({
  pathname: '/blog/ayasofya-rehberi',
  lang: 'tr',
  title: 'Ayasofya rehberi — Touristlio Blog',
  description: 'Kısa Türkçe özet',
  alternates: { tr: '/blog/ayasofya-rehberi', en: null },
});
if (head.includes('hreflang="en"')) fail('untranslated TR page still advertises an EN hreflang');
else if (!head.includes('hreflang="tr"') || !head.includes('hreflang="x-default"')) {
  fail('TR hreflang missing when EN is omitted');
} else ok('hreflang omits en when the post has no English translation');

const base = 'https://www.touristlio.com';
const mirrored = withEnglishAlternates([
  { loc: `${base}/blog/ayasofya-rehberi`, priority: '0.7', changefreq: 'monthly' },
  { loc: `${base}/explore`, priority: '0.9', changefreq: 'daily' },
], base);
if (mirrored.some((u) => String(u.loc).includes('/en/blog/ayasofya-rehberi'))) {
  fail('sitemap still mirrors every blog URL to /en/blog');
} else if (!mirrored.some((u) => String(u.loc).endsWith('/en/explore'))) {
  fail('sitemap stopped mirroring non-blog pages');
} else if (!isBlogDetailPath('/blog/ayasofya-rehberi')) fail('blog detail path detector');
else ok('blind /en/blog twins are not generated; /en/explore still is');

const migration = read('db/migrations/016_blog_en_fields.js');
if (!migration.includes('title_en') || !migration.includes('excerpt_en') || !migration.includes('body_en') || !migration.includes('slug_en')) {
  fail('migration 016 missing English columns');
} else if (/UPDATE\s+blogs\s+SET/i.test(migration)) fail('migration 016 writes existing rows');
else ok('migration adds nullable English columns and does not touch existing rows');

const adminHtml = read('public/admin.html');
for (const id of ['edBlogTitleEn', 'edBlogExcerptEn', 'edBlogBodyEn', 'bpTitleEn', 'bpExcerptEn', 'bpBodyEn']) {
  if (!adminHtml.includes(`id="${id}"`)) fail(`admin form missing ${id}`);
}
if (!failed) ok('admin create and edit forms have English title, excerpt, and body');

const appJs = read('public/js/app.js');
if (!appJs.includes(UNTRANSLATED_NOTE) || !appJs.includes('Türkçe sürüm')) {
  fail('blog detail does not show the untranslated note and Turkish link');
} else if (!appJs.includes("en-US") || !appJs.includes("tr-TR")) {
  fail('dates are not formatted with en-US and tr-TR');
} else if (!appJs.includes("b.translated !== true")) {
  fail('EN list does not hide untranslated posts');
} else ok('public blog UI: note, Turkish link, locale dates, EN list filter');

const blogsJs = read('server/routes/blogs.js');
if (!blogsJs.includes('blogEnReadySql') || !blogsJs.includes('localizeBlog')) {
  fail('public blog API does not filter or localize English');
} else ok('public blog API uses the shared English rule');

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 8000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function waitForServer(base, max = 400) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      n += 1;
      const req = http.get(`${base}/api/health`, { timeout: 1000 }, (res) => {
        res.resume();
        if (res.statusCode >= 200 && res.statusCode < 500) resolve();
        else if (n >= max) reject(new Error('server did not start'));
        else setTimeout(tick, 150);
      });
      req.on('error', () => {
        if (n >= max) reject(new Error('server did not start'));
        else setTimeout(tick, 150);
      });
    };
    tick();
  });
}

async function checkDatabase() {
  const { initDb, db, closePool } = require('../db');
  await initDb();
  const stamp = Date.now();
  const trTitle = `V4A2 Turkce yalniz ${stamp}`;
  const enTrTitle = `V4A2 Turkce kaynak ${stamp}`;
  const enTitle = `V4A2 English title ${stamp}`;
  const trSlug = `v4a2-tr-only-${stamp}`;
  const bothSlug = `v4a2-both-tr-${stamp}`;
  const enSlug = `v4a2-both-en-${stamp}`;
  const longTr = `Türkçe gövde ${stamp}. `.repeat(20);
  const longEn = `English body ${stamp}. `.repeat(12);
  const user = await db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get();
  if (!user) {
    fail('no user row to attach verify blogs');
    await closePool();
    return;
  }
  const applied = await db.prepare('SELECT 1 AS ok FROM schema_migrations WHERE id = ?').get('016_blog_en_fields');
  if (!applied) fail('schema_migrations missing 016_blog_en_fields');
  else ok('016_blog_en_fields is applied');

  const before = new Set((await db.prepare(`
    SELECT id FROM blogs WHERE title_en IS NOT NULL AND btrim(title_en) <> ''
  `).all()).map((row) => row.id));

  const insert = await db.prepare(`
    INSERT INTO blogs (
      user_id, category, title, slug, excerpt, body, status, published_at,
      title_en, excerpt_en, body_en, slug_en
    ) VALUES (?, 'guide', ?, ?, ?, ?, 'approved', datetime('now'), ?, ?, ?, ?)
  `);
  const only = await insert.run(user.id, trTitle, trSlug, 'Türkçe özet', longTr, null, null, null, null);
  const both = await insert.run(
    user.id, enTrTitle, bothSlug, 'Türkçe özet kaynak', longTr,
    enTitle, 'English excerpt', longEn, enSlug,
  );
  const ids = [only.lastInsertRowid, both.lastInsertRowid];
  let child;
  try {
    const { buildSitemapXml } = require('../lib/sitemap');
    const xml = await buildSitemapXml();
    if (xml.includes(`/en/blog/${trSlug}`)) fail('untranslated post is in the EN sitemap');
    else ok('untranslated post is absent from the EN sitemap');
    if (!xml.includes(`/blog/${trSlug}`) || !xml.includes(`/blog/${bothSlug}`)) {
      fail('Turkish blog URLs missing from sitemap');
    } else ok('Turkish blog URLs stay in the sitemap');
    if (!xml.includes(`/en/blog/${enSlug}`)) fail('translated post missing from the EN sitemap');
    else ok('translated post is in the EN sitemap under slug_en');
    if (xml.includes('[object Object]')) fail('sitemap contains [object Object]');

    const port = 3097;
    child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(port),
        NODE_ENV: 'development',
        SITEMAP_ON_START: 'false',
        LIVE_DATA_CRON: 'false',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    child.stdout.on('data', (c) => { log += c; });
    child.stderr.on('data', (c) => { log += c; });
    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForServer(baseUrl);

    const enList = await fetchText(`${baseUrl}/api/blogs?lang=en`);
    const enJson = JSON.parse(enList.body);
    const enBlogs = enJson.blogs || [];
    if (enList.status !== 200) fail(`GET /api/blogs?lang=en HTTP ${enList.status}`);
    else if (enBlogs.some((b) => b.title === trTitle || b.excerpt === 'Türkçe özet')) {
      fail('EN list returned a Turkish-only title or excerpt');
    } else if (!enBlogs.some((b) => b.title === enTitle && b.translated === true && b.slug === enSlug)) {
      fail('EN list omitted the translated post');
    } else if (enBlogs.some((b) => String(b.title).includes('[object ') || String(b.categoryLabel).includes('[object '))) {
      fail('EN list has [object Object]');
    } else ok('GET /api/blogs?lang=en lists only translated English titles');

    const trList = await fetchText(`${baseUrl}/api/blogs?lang=tr`);
    const trJson = JSON.parse(trList.body);
    if (!(trJson.blogs || []).some((b) => b.title === trTitle)) fail('TR list lost the Turkish-only post');
    else ok('GET /api/blogs?lang=tr still lists Turkish posts');

    const enDetail = await fetchText(`${baseUrl}/api/blogs/${trSlug}?lang=en`);
    const enOne = JSON.parse(enDetail.body).blog;
    if (!enOne || enOne.translated !== false || enOne.title || enOne.excerpt || enOne.body) {
      fail(`EN detail of an untranslated post fell back: ${JSON.stringify(enOne && { title: enOne.title, translated: enOne.translated })}`);
    } else if (enOne.authorName !== 'Anonymous' && enOne.authorName !== 'Anonim' && !enOne.authorName) {
      fail('EN detail missing an author name');
    } else ok('EN detail of an untranslated post is translated:false and has no Turkish copy');

    const enPage = await fetchText(`${baseUrl}/en/blog/${trSlug}`);
    if (enPage.status !== 200) fail(`GET /en/blog/${trSlug} HTTP ${enPage.status}`);
    else if (!enPage.body.includes(UNTRANSLATED_NOTE) || !enPage.body.includes(`/blog/${trSlug}`)) {
      fail('EN HTML missing the untranslated note or the Turkish link');
    } else if (!/name="robots" content="noindex/.test(enPage.body)) {
      fail('EN HTML of an untranslated post is not noindex');
    } else if (enPage.body.includes('hreflang="en"') || enPage.body.includes(trTitle)) {
      fail('untranslated EN HTML still has hreflang en or the Turkish title');
    } else if (enPage.body.includes('"@type":"Article"') || enPage.body.includes('"@type": "Article"')) {
      fail('untranslated EN HTML emitted Article JSON-LD');
    } else ok('GET /en/blog/:slug untranslated: note, Turkish link, noindex, no EN hreflang, no Article');

    const trPage = await fetchText(`${baseUrl}/blog/${trSlug}`);
    if (!trPage.body.includes('hreflang="tr"') || trPage.body.includes('hreflang="en"')) {
      fail('Turkish page of an untranslated post still publishes an EN hreflang');
    } else ok('Turkish page does not advertise an EN hreflang without a translation');

    const enArticle = await fetchText(`${baseUrl}/en/blog/${enSlug}`);
    if (!enArticle.body.includes(enTitle) || enArticle.body.includes(enTrTitle)) {
      fail('translated EN HTML is missing the English title or still shows the Turkish title');
    } else if (!enArticle.body.includes('"inLanguage":"en"') && !enArticle.body.includes('"inLanguage": "en"')) {
      fail('translated EN HTML Article is not inLanguage en');
    } else if (enArticle.body.includes('[object Object]')) fail('translated EN HTML has [object Object]');
    else ok('GET /en/blog/:slugEn uses the English article');

    const trTranslated = await fetchText(`${baseUrl}/blog/${bothSlug}`);
    if (!trTranslated.body.includes(`/en/blog/${enSlug}`)) {
      fail('translated Turkish page hreflang does not point at slug_en');
    } else ok('translated post hreflang en uses slug_en');

    const metaRes = await fetchText(`${baseUrl}/api/blogs/meta?lang=en`);
    const guide = (JSON.parse(metaRes.body).categories || []).find((c) => c.slug === 'guide');
    if (!guide || !String(guide.label).includes('Guides') || String(guide.label).includes('Rehberler')) {
      fail(`EN category label is not English: ${guide && guide.label}`);
    } else ok('EN category label uses the English name');

    const search = await fetchText(`${baseUrl}/api/blogs?lang=en&q=${encodeURIComponent(trTitle)}`);
    const found = JSON.parse(search.body).blogs || [];
    if (found.some((b) => b.title === trTitle || b.slug === trSlug)) {
      fail('EN search matched a Turkish-only post');
    } else ok('EN search does not match Turkish-only copy');
    if (log.includes('Migration: add column failed')) fail('column migration failed during boot');
  } finally {
    if (child) {
      child.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 200));
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
    }
    await db.prepare('DELETE FROM blogs WHERE id = ? OR id = ?').run(ids[0], ids[1]);
    const after = new Set((await db.prepare(`
      SELECT id FROM blogs WHERE title_en IS NOT NULL AND btrim(title_en) <> ''
    `).all()).map((row) => row.id));
    let drifted = false;
    for (const id of before) if (!after.has(id)) drifted = true;
    for (const id of after) if (!before.has(id)) drifted = true;
    if (drifted) fail('existing blog English fields changed');
    else ok('existing rows kept their English fields (verify rows removed)');
    await closePool();
  }
}

async function main() {
  if (!String(process.env.DATABASE_URL || '').trim()) {
    fail('DATABASE_URL missing; live blog checks skipped');
  } else {
    try {
      await checkDatabase();
    } catch (err) {
      fail(`database checks: ${err.message}`);
    }
  }
  if (failed) {
    console.error(`verify-v4-adim2-blog-i18n: ${failed} failed`);
    process.exit(1);
  }
  console.log('verify-v4-adim2-blog-i18n: ok');
}

main();
