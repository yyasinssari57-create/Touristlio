/**
 * Claude Master PRD — FAZ3-5 (sitemap kalite filtresi).
 * Usage: node server/scripts/verify-faz3-5-sitemap.js
 *
 * PRD sütunları bu şemada yok: verification_status, deleted_at, description_tr,
 * updated_at, blog_posts, is_published. Karşılıklar places.status / overview /
 * description ve blogs.status / body. Sayfa görünümü değişmez.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
require('dotenv').config({ path: path.join(ROOT, '.env') });

const {
  buildSitemapXml,
  isQualityPlaceDescription,
  isQualityBlogBody,
  placeSitemapPath,
  PLACE_DESCRIPTION_MIN_CHARS,
  BLOG_BODY_MIN_CHARS,
  SITEMAP_PLACE_LIMIT,
  SITEMAP_CACHE_CONTROL,
} = require('../lib/sitemap');

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

console.log('verify-faz3-5');

if (PLACE_DESCRIPTION_MIN_CHARS !== 50) fail('place blurb minimum must be 50');
else ok('place blurb minimum is 50');
if (BLOG_BODY_MIN_CHARS !== 200) fail('blog body minimum must be 200');
else ok('blog body minimum is 200');
if (SITEMAP_PLACE_LIMIT !== 10000) fail('place cap must be 10000');
else ok('place cap is 10000');
if (SITEMAP_CACHE_CONTROL !== 'public, max-age=3600') fail('sitemap cache header');
else ok('sitemap cache is public, max-age=3600');

const fifty = 'A'.repeat(50);
const fiftyOne = 'A'.repeat(51);
if (isQualityPlaceDescription({ description: fifty, overview: '' })) fail('50-char description must fail');
else ok('50-char description excluded');
if (!isQualityPlaceDescription({ description: fiftyOne })) fail('51-char description must pass');
else ok('51-char description included');
if (!isQualityPlaceDescription({ overview: `  ${fiftyOne}  `, description: '' })) fail('trimmed overview must pass');
else ok('trimmed overview included');
if (isQualityPlaceDescription({ overview: 'kısa', description: '  kısa  ', description_en: fiftyOne })) {
  fail('English text must not satisfy the Turkish blurb rule');
} else ok('description_en does not count');
if (isQualityBlogBody({ body: fiftyOne })) fail('short blog body must fail');
else ok('blog body under 200 excluded');
if (!isQualityBlogBody({ body: `\n${'B'.repeat(201)}\n` })) fail('201-char blog body must pass');
else ok('blog body over 200 included');

const place = {
  slug: 'ince-yer',
  status: 'published',
  lat: 41.01,
  lng: 29.01,
  description: fifty,
};
if (placeSitemapPath(place)) fail('thin published place must stay out of the sitemap');
else ok('thin place has no sitemap path');
if (placeSitemapPath({ ...place, overview: fiftyOne }) !== '/places/ince-yer') {
  fail('long overview should produce a place path');
} else ok('long overview place path');

const src = read('server/lib/sitemap.js');
const sqlSrc = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const indexSrc = read('server/index.js');
if (!src.includes('> ${PLACE_DESCRIPTION_MIN_CHARS}')) fail('places query missing blurb length');
else ok('places query uses the 50-char constant');
if (!src.includes('> ${BLOG_BODY_MIN_CHARS}')) fail('blogs query missing body length');
else ok('blogs query uses the 200-char constant');
if (!src.includes('LIMIT ${SITEMAP_PLACE_LIMIT}')) fail('places query missing limit');
else ok('places query uses the 10000 cap');
if (sqlSrc.includes('deleted_at') || sqlSrc.includes('description_tr') || sqlSrc.includes('verification_status')) {
  fail('sitemap SQL must not reference columns this schema does not have');
} else ok('no deleted_at / description_tr / verification_status in sitemap SQL');
if (!src.includes("status = 'approved'")) fail('blogs must stay on status approved');
else ok('blogs stay on status = approved');
if (!src.includes(`${'${base}'}/explore`)) fail('static sitemap missing /explore');
else ok('static list includes /explore');
if (!src.includes('/legal/about.html') || !src.includes('/legal/contact.html')) {
  fail('real legal URLs must stay (they 200; PRD sample omitted .html)');
} else ok('legal URLs stay on the .html paths that return 200');
if (!indexSrc.includes('SITEMAP_CACHE_CONTROL') || !indexSrc.includes("app.get('/sitemap.xml'")) {
  fail('GET /sitemap.xml must send the shared cache header');
} else ok('GET /sitemap.xml uses the shared cache header');

const pkg = JSON.parse(read('package.json'));
if (pkg.scripts['verify:faz3-5'] !== 'node server/scripts/verify-faz3-5-sitemap.js') {
  fail('package.json missing verify:faz3-5');
} else ok('verify:faz3-5 script');

async function checkDatabase() {
  const { initDb, db, closePool } = require('../db');
  await initDb();
  try {
    const xml = await buildSitemapXml();
    const paths = new Set(pathnames(xml));
    if (!paths.has('/explore') || !paths.has('/en/explore')) fail('live sitemap missing /explore');
    else ok('live sitemap lists /explore and /en/explore');
    if (paths.has('/legal/about') || paths.has('/legal/contact')) fail('extensionless legal URLs must not be listed');
    else ok('extensionless /legal/about is not listed');
    if ([...paths].some((p) => p === '/admin' || p.startsWith('/admin/') || p === '/login')) {
      fail('private URL in sitemap');
    } else ok('live sitemap has no admin or login');

    const thinBlogs = await db.prepare(`
      SELECT slug FROM blogs
      WHERE status = 'approved'
        AND slug IS NOT NULL AND TRIM(slug) <> ''
        AND (body IS NULL OR char_length(btrim(body)) <= ?)
    `).all(BLOG_BODY_MIN_CHARS);
    const leakedBlog = thinBlogs.filter((row) => paths.has(`/blog/${encodeURIComponent(row.slug)}`));
    if (leakedBlog.length) fail(`${leakedBlog.length} thin blogs still in sitemap`);
    else ok(`thin approved blogs excluded (${thinBlogs.length} in this database)`);

    const qualityBlogs = await db.prepare(`
      SELECT slug FROM blogs
      WHERE status = 'approved'
        AND slug IS NOT NULL AND TRIM(slug) <> ''
        AND body IS NOT NULL AND char_length(btrim(body)) > ?
    `).all(BLOG_BODY_MIN_CHARS);
    const missingBlog = qualityBlogs.filter((row) => !paths.has(`/blog/${encodeURIComponent(row.slug)}`));
    if (missingBlog.length) fail(`${missingBlog.length} long blogs missing from sitemap`);
    else ok(`long approved blogs listed (${qualityBlogs.length} in this database)`);

    const thinPlaces = await db.prepare(`
      SELECT slug FROM places
      WHERE COALESCE(NULLIF(TRIM(status), ''), 'published') = 'published'
        AND slug IS NOT NULL AND TRIM(slug) <> ''
        AND lat IS NOT NULL AND lng IS NOT NULL AND lat <> 0 AND lng <> 0
        AND GREATEST(
          char_length(btrim(COALESCE(overview, ''))),
          char_length(btrim(COALESCE(description, '')))
        ) <= ?
    `).all(PLACE_DESCRIPTION_MIN_CHARS);
    const leakedPlace = thinPlaces.filter((row) => paths.has(`/places/${encodeURIComponent(row.slug)}`));
    if (leakedPlace.length) fail(`${leakedPlace.length} thin places still in sitemap`);
    else ok(`thin places excluded (${thinPlaces.length} in this database)`);
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
    console.error(`verify-faz3-5 FAILED (${failed})`);
    process.exit(1);
  }
  console.log('verify-faz3-5 OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
