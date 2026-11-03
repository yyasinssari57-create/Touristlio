/**
 * V4 Adım 3 — sitemap only lists real, quality URLs.
 * Usage: node server/scripts/verify-v4-adim3-sitemap.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
require('dotenv').config({ path: path.join(ROOT, '.env') });

const {
  buildSitemapXml,
  renderUrlSet,
  isoDate,
  recordLastmod,
  staticUrls,
  withEnglishAlternates,
  englishAlternateLoc,
  CONTENT_SNAPSHOT_DATE,
  siteBaseUrl,
} = require('../lib/sitemap');
const { placeHasEnglishCopy, placeEnSitemapPath } = require('../lib/place-i18n');
const { shouldNoindexPath } = require('../lib/seo');

let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function pathnames(xml) {
  return [...String(xml).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => {
    try { return new URL(m[1]).pathname; } catch { return m[1]; }
  });
}

function lastmods(xml) {
  return [...String(xml).matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]);
}

console.log('verify-v4-adim3');

const src = read('server/lib/sitemap.js');
const sqlSrc = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
if (/new Date\(/.test(sqlSrc)) fail('sitemap.js still stamps the generation day');
else ok('sitemap.js does not call new Date');
if (sqlSrc.includes('deleted_at') || sqlSrc.includes('verification_status') || sqlSrc.includes('description_tr')) {
  fail('sitemap SQL names columns this schema does not have');
} else ok('sitemap SQL stays on real columns');

if (isoDate(null) !== null || isoDate('') !== null || isoDate('not-a-date') !== null) {
  fail('isoDate must not invent a day');
} else ok('isoDate returns null when there is no timestamp');
if (isoDate('2024-03-01 18:40:00') !== '2024-03-01') fail('isoDate dropped the calendar day');
else ok('isoDate keeps YYYY-MM-DD from a stored timestamp');
if (recordLastmod(null, '2025-07-19 00:00:00') !== '2025-07-19') fail('recordLastmod skipped created_at');
else ok('recordLastmod uses the first real timestamp');

const base = siteBaseUrl();
const today = new Date().toISOString().slice(0, 10);
const pages = staticUrls(base);
const locs = pages.map((u) => u.loc);
if (locs.some((loc) => loc.endsWith('/search'))) fail('static list still has /search');
else ok('static list has no /search');
if (!locs.some((loc) => loc.endsWith('/explore')) || !locs.some((loc) => loc.endsWith('/gezilecek-yerler'))) {
  fail('explore and gezilecek-yerler must both stay');
} else ok('/explore and /gezilecek-yerler both stay (different sections)');
if (pages.some((u) => u.lastmod !== CONTENT_SNAPSHOT_DATE)) fail('static lastmod is not the fixed snapshot date');
else ok(`static lastmod is ${CONTENT_SNAPSHOT_DATE}`);

const mirrored = withEnglishAlternates(pages, base);
if (mirrored.some((u) => String(u.loc).includes('/search'))) fail('English mirror reintroduced /search');
else if (!mirrored.some((u) => String(u.loc).endsWith('/en/explore'))) fail('EN explore missing');
else if (!mirrored.some((u) => String(u.loc).endsWith('/en/gezilecek-yerler'))) fail('EN places directory missing');
else ok('EN mirrors keep explore and the places directory, not search');

if (englishAlternateLoc(`${base}/search`, base) !== null) fail('englishAlternateLoc still builds /en/search');
else ok('englishAlternateLoc refuses /search');

const thin = { slug: 'sadece-turkce', description_en: '  ', overview_en: '' };
const ready = { slug: 'hagia-sophia', description_en: 'A real English description.', overview_en: '' };
if (placeHasEnglishCopy(thin) || placeEnSitemapPath(thin)) fail('empty English copy was treated as translated');
else ok('empty English copy has no EN sitemap path');
if (placeEnSitemapPath(ready) !== '/en/places/hagia-sophia') fail('translated place EN path');
else ok('description_en produces /en/places/{slug}');
if (!placeHasEnglishCopy({ description_en: '', overview_en: 'English overview' })) {
  fail('overview_en alone should count as English copy');
} else ok('overview_en alone counts as English copy');

const sample = renderUrlSet([
  { loc: `${base}/places/a`, lastmod: '2024-03-01', changefreq: 'weekly', priority: '0.8' },
  { loc: `${base}/blog/b`, lastmod: '2025-07-19', changefreq: 'monthly', priority: '0.7' },
]);
if (!sample.startsWith('<?xml') || !sample.includes('<urlset') || !sample.includes('</urlset>')) {
  fail('renderUrlSet is not an urlset document');
} else ok('renderUrlSet is XML');
if (!sample.includes('<lastmod>2024-03-01</lastmod>') || !sample.includes('<lastmod>2025-07-19</lastmod>')) {
  fail('distinct lastmod values were dropped');
} else ok('lastmod values stay distinct');
if (today !== '2024-03-01' && today !== '2025-07-19' && sample.includes(`<lastmod>${today}</lastmod>`)) {
  fail('renderUrlSet injected today');
} else ok('renderUrlSet does not inject today');

const untranslatedHead = require('../lib/seo').buildSeoHead({
  pathname: '/places/sadece-turkce',
  lang: 'tr',
  alternates: { tr: '/places/sadece-turkce', en: null },
});
if (untranslatedHead.includes('hreflang="en"')) fail('untranslated place still advertises en hreflang');
else if (!untranslatedHead.includes('hreflang="tr"')) fail('TR hreflang missing');
else ok('hreflang omits en when the place has no English copy');

if (!shouldNoindexPath('/search', {}) || !shouldNoindexPath('/en/search', {})) {
  fail('/search is still indexable');
} else ok('/search and /en/search are noindex');
if (shouldNoindexPath('/explore', {}) || shouldNoindexPath('/gezilecek-yerler', {})) {
  fail('explore or the places directory became noindex');
} else ok('clean /explore and /gezilecek-yerler stay indexable');

const migration = read('db/migrations/017_place_timestamps.js');
if (!migration.includes('created_at') || !migration.includes('updated_at')) fail('migration 017 missing timestamps');
else if (/UPDATE\s+places\s+SET/i.test(migration)) fail('migration 017 stamps existing rows');
else ok('migration 017 adds empty timestamp columns and does not rewrite rows');

const appJs = read('public/js/app.js');
if (!appJs.includes('function placeHasEnglishCopy') || !appJs.includes('applyPlaceHreflang')) {
  fail('place pages do not adjust hreflang');
} else ok('place pages set hreflang from English copy');

async function checkDatabase() {
  const { initDb, db, closePool } = require('../db');
  await initDb();
  try {
    const xml = await buildSitemapXml();
    const paths = pathnames(xml);
    const mods = lastmods(xml);
    const distinct = [...new Set(mods)].sort();
    console.log(`  · sitemap URLs: ${paths.length}`);
    console.log(`  · distinct lastmod (${distinct.length}): ${distinct.join(', ') || '(none)'}`);
    console.log('  · first 20 lines:');
    xml.split('\n').slice(0, 20).forEach((line) => console.log(`    ${line}`));

    if (!xml.includes('<urlset') || !xml.includes('</urlset>') || !xml.startsWith('<?xml')) {
      fail('live sitemap is not valid XML');
    } else ok('live sitemap is an XML urlset');
    if ((xml.match(/<url>/g) || []).length !== paths.length) fail('url and loc counts differ');
    else ok('every url has one loc');
    if (mods.length !== paths.length) fail('a url is missing lastmod');
    else ok('every url has lastmod');
    if (paths.some((p) => p === '/search' || p === '/en/search')) fail('live sitemap lists /search');
    else ok('live sitemap has no /search');
    if (!paths.includes('/explore') || !paths.includes('/gezilecek-yerler')) {
      fail('live sitemap dropped explore or the places directory');
    } else ok('live sitemap keeps both explore and gezilecek-yerler');
    if (distinct.length < 2) fail(`lastmod values are not different: ${distinct.join(', ')}`);
    else ok(`${distinct.length} different lastmod values`);
    if (distinct.length === 1 && distinct[0] === today) fail('the only lastmod is today');
    else if (distinct.every((d) => d === today)) fail('every lastmod is today');
    else ok('lastmod is not today on every URL');

    const places = await db.prepare(`
      SELECT slug, status, lat, lng, overview, description, description_en, overview_en
      FROM places
    `).all();
    const { placeSitemapPath } = require('../lib/sitemap');
    let untranslatedEn = 0;
    let missingTranslated = 0;
    let leakedUntranslated = 0;
    for (const row of places) {
      const tr = placeSitemapPath(row);
      if (!tr) continue;
      const en = placeEnSitemapPath(row);
      if (en && !paths.includes(en)) missingTranslated += 1;
      if (!en) {
        untranslatedEn += 1;
        if (paths.includes(`/en${tr}`)) leakedUntranslated += 1;
      }
    }
    if (missingTranslated) fail(`${missingTranslated} translated places missing from the EN sitemap`);
    else ok('translated places are in the EN sitemap');
    if (leakedUntranslated) fail(`${leakedUntranslated} untranslated place EN URLs leaked`);
    else ok(`untranslated place EN URLs absent (${untranslatedEn} quality places have no English copy)`);

    const blogs = await db.prepare(`
      SELECT slug, slug_en, title_en, excerpt_en, body_en, status, body
      FROM blogs
    `).all();
    const { blogEnFields } = require('../lib/blog-i18n');
    const { isQualityBlogBody } = require('../lib/sitemap');
    for (const row of blogs) {
      if (row.status !== 'approved' || !isQualityBlogBody(row)) continue;
      const en = blogEnFields(row);
      const bare = `/en/blog/${encodeURIComponent(row.slug)}`;
      if (!en.translated && paths.includes(bare)) {
        fail(`untranslated blog listed at ${bare}`);
      }
      if (en.translated) {
        const enPath = `/en/blog/${encodeURIComponent(en.slug)}`;
        if (!paths.includes(enPath)) fail(`translated blog missing ${enPath}`);
      }
    }
    if (!failed) ok('untranslated blog EN URLs absent');

    const before = paths.length + 2 + untranslatedEn;
    console.log(`  · before/after URL count: ${before} → ${paths.length} (removed /search, /en/search, and ${untranslatedEn} untranslated place EN URLs)`);
  } finally {
    await closePool();
  }
}

async function main() {
  if (String(process.env.DATABASE_URL || '').trim()) {
    try {
      await checkDatabase();
    } catch (err) {
      fail(`database checks: ${err.message}`);
    }
  } else {
    console.log('  · skipped live DB checks (DATABASE_URL not set)');
  }
  if (failed) {
    console.error(`verify-v4-adim3 FAILED (${failed})`);
    process.exit(1);
  }
  console.log('verify-v4-adim3 OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
