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
const { blogsSeed, demoBlogBody } = require('../seed');
const {
  planSitemapBlog,
  isTestBlogPollution,
  GENERIC_TR,
  GENERIC_EN,
} = require('../lib/blog-sitemap-body');

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
if (pkg.scripts['verify:blog-sitemap'] !== 'node server/scripts/verify-faz3-5-sitemap.js') {
  fail('package.json missing verify:blog-sitemap');
} else ok('verify:blog-sitemap script');

if (GENERIC_TR.length <= BLOG_BODY_MIN_CHARS) fail(`generic TR note is ${GENERIC_TR.length}`);
else ok(`generic TR note is ${GENERIC_TR.length} chars`);
if (GENERIC_EN.length <= BLOG_BODY_MIN_CHARS) fail(`generic EN note is ${GENERIC_EN.length}`);
else ok(`generic EN note is ${GENERIC_EN.length} chars`);

if (!Array.isArray(blogsSeed) || blogsSeed.length < 1) fail('demo blog seed is empty');
else ok(`demo blog seed has ${blogsSeed.length} posts`);

for (const post of blogsSeed) {
  const stored = demoBlogBody(post);
  const plan = planSitemapBlog({
    title: post.title,
    excerpt: post.excerpt,
    body: post.excerpt,
    status: 'approved',
  });
  const len = String(stored || '').trim().length;
  if (plan.action !== 'expand') fail(`${post.title}: expected expand, got ${plan.action}`);
  else if (len <= BLOG_BODY_MIN_CHARS) fail(`${post.title}: body is ${len} chars`);
  else if (!isQualityBlogBody({ body: stored })) fail(`${post.title}: sitemap helper rejects the new body`);
  else if (!String(stored).trim().startsWith(String(post.excerpt || '').trim())) {
    fail(`${post.title}: stored body dropped the excerpt`);
  } else ok(`seed “${post.title}” body ${len} chars (was ${String(post.excerpt || '').trim().length})`);
}

const pollution = planSitemapBlog({
  title: 'FAZ2-4 verify blog #1-1',
  excerpt: 'Özet',
  body: 'Gövde',
  status: 'approved',
});
if (!isTestBlogPollution({ title: 'FAZ2-4 verify blog #1-1', excerpt: 'Özet', body: 'Gövde' })) {
  fail('FAZ2-4 row was not recognized as test pollution');
} else if (pollution.action !== 'unpublish') fail(`FAZ2-4 row action ${pollution.action}`);
else ok('FAZ2-4 verify blog is rejected, not rewritten');

const duePollution = planSitemapBlog({
  title: 'FAZ2-4 verify blog #due',
  excerpt: 'Özet',
  body: 'Gövde',
  status: 'pending',
  published_at: '2020-01-01 00:00:00',
});
if (duePollution.action !== 'unpublish') fail('scheduled test row would be republished');
else ok('pending test row with published_at is rejected');

const pendingPollution = planSitemapBlog({
  title: 'ORTA-6 Pending',
  excerpt: 'hidden excerpt',
  body: 'hidden body',
  status: 'pending',
});
if (pendingPollution.action !== 'keep') fail('pending test row should stay pending');
else ok('pending test row is not expanded');

const english = planSitemapBlog({
  title: 'A quiet morning walk',
  excerpt: 'This short guide is about an early walk before the crowds.',
  body: 'This short guide is about an early walk before the crowds.',
  status: 'approved',
});
if (english.action !== 'expand' || !english.body.includes(GENERIC_EN)) {
  fail('short English post did not get the English note');
} else if (english.body.trim().length <= BLOG_BODY_MIN_CHARS) fail('English expansion still short');
else ok(`short English post expands to ${english.body.trim().length} chars`);

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

    const seedRows = await db.prepare(`
      SELECT title, slug, status, excerpt, body,
             char_length(btrim(COALESCE(body, ''))) AS body_len
      FROM blogs
      WHERE title = ANY(?::text[])
    `).all(blogsSeed.map((post) => post.title));
    const byTitle = new Map(seedRows.map((row) => [row.title, row]));
    let seedListed = 0;
    for (const post of blogsSeed) {
      const row = byTitle.get(post.title);
      if (!row) continue;
      const len = Number(row.body_len) || 0;
      const pathName = `/blog/${encodeURIComponent(row.slug)}`;
      if (row.status !== 'approved') {
        fail(`demo “${post.title}” is ${row.status}, not approved`);
      } else if (len <= BLOG_BODY_MIN_CHARS) {
        fail(`demo “${post.title}” body is still ${len} chars`);
      } else if (!paths.has(pathName)) {
        fail(`demo “${post.title}” missing from sitemap`);
      } else {
        seedListed += 1;
        ok(`sitemap lists “${post.title}” (${len} chars)`);
      }
    }
    if (!seedRows.length) {
      console.log('  · no demo blog titles in this database');
    } else if (seedListed === blogsSeed.length) {
      ok(`all ${seedListed} demo blogs are in the sitemap`);
    }

    const leftoverTests = await db.prepare(`
      SELECT id, title FROM blogs
      WHERE status = 'approved'
        AND (
          title ILIKE 'FAZ2-4 verify blog%'
          OR title ILIKE 'ORTA-6 Pending%'
          OR (
            btrim(COALESCE(excerpt, '')) = 'Özet'
            AND btrim(COALESCE(body, '')) = 'Gövde'
          )
        )
    `).all();
    if (leftoverTests.length) {
      fail(`${leftoverTests.length} approved test blogs still published`);
    } else ok('approved test blogs are not published');

    const { publishDueBlogs } = require('../lib/blog-scheduler');
    await publishDueBlogs();
    const republished = await db.prepare(`
      SELECT id FROM blogs
      WHERE status = 'approved'
        AND (
          title ILIKE 'FAZ2-4 verify blog%'
          OR title ILIKE 'ORTA-6 Pending%'
          OR (
            btrim(COALESCE(excerpt, '')) = 'Özet'
            AND btrim(COALESCE(body, '')) = 'Gövde'
          )
        )
    `).all();
    if (republished.length) fail(`${republished.length} test blogs republished by the scheduler`);
    else ok('scheduler does not republish test blogs');

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
