/**
 * [v2 YÜKSEK-5] Sitemap quality filter.
 * Usage: npm run verify:sitemap
 */
const fs = require('fs');
const path = require('path');
const {
  siteBaseUrl,
  buildSitemapXml,
  buildRobotsTxt,
  isValidSitemapCoord,
  isPublishedPlaceStatus,
  placeSitemapPath,
  englishAlternateLoc,
} = require('../lib/sitemap');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}

function extractLocs(xml) {
  return [...String(xml).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

function pathnameOf(loc) {
  try {
    return new URL(loc).pathname;
  } catch {
    return loc;
  }
}

console.log('verify-sitemap');

if (!isValidSitemapCoord(41.0082, 28.9784)) fail('Istanbul coords should be valid');
else ok('Istanbul coords valid');
if (isValidSitemapCoord(0, 0)) fail('0,0 should be excluded');
else ok('0,0 excluded');
if (isValidSitemapCoord(41, 0)) fail('lng 0 should be excluded');
else ok('lng 0 excluded');
if (isValidSitemapCoord(null, 29)) fail('null lat should be excluded');
else ok('null lat excluded');
if (isValidSitemapCoord(91, 29)) fail('lat 91 should be excluded');
else ok('out-of-range lat excluded');

if (!isPublishedPlaceStatus(null) || !isPublishedPlaceStatus('') || !isPublishedPlaceStatus('published')) {
  fail('empty/null status should count as published');
} else ok('empty status treated as published');
if (isPublishedPlaceStatus('draft') || isPublishedPlaceStatus('archived')) {
  fail('draft/archived must not be published');
} else ok('draft and archived excluded');

const goodPlace = { slug: 'ayasofya-istanbul', status: 'published', lat: 41.0086, lng: 28.9802 };
if (placeSitemapPath(goodPlace) !== '/places/ayasofya-istanbul') fail('published slug path');
else ok('published slug → /places/{slug}');
if (placeSitemapPath({ ...goodPlace, slug: '' })) fail('slugless place should drop');
else ok('slugless place dropped (no /places/{id})');
if (placeSitemapPath({ ...goodPlace, status: 'draft' })) fail('draft place should drop');
else ok('draft place dropped');
if (placeSitemapPath({ ...goodPlace, lat: 0, lng: 29 })) fail('zero lat should drop');
else ok('zero-coord place dropped');

const src = fs.readFileSync(path.join(ROOT, 'server', 'lib', 'sitemap.js'), 'utf8');
if (!src.includes("= 'published'") || src.includes("!= 'archived'")) {
  fail('places query must require published (not merely exclude archived)');
} else ok('places SQL requires status published');
if (!/lat <> 0/.test(src) || !/lng <> 0/.test(src)) fail('places SQL must exclude lat/lng 0');
else ok('places SQL excludes lat/lng 0');
if (!src.includes("status = 'approved'")) fail('blogs must filter status = approved');
else ok('blogs SQL status = approved');
if (/places\/\$\{p\.id\}/.test(src) || /places\/\$\{row\.id\}/.test(src)) {
  fail('must not emit /places/{id} fallback');
} else ok('no /places/{id} fallback');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
if (pkg.scripts && pkg.scripts['verify:sitemap'] === 'node server/scripts/verify-sitemap.js') {
  ok('package.json verify:sitemap');
} else fail('package.json missing verify:sitemap');

const indexSrc = fs.readFileSync(path.join(ROOT, 'server', 'index.js'), 'utf8');
if (!indexSrc.includes("app.get('/sitemap.xml'") || !indexSrc.includes('buildSitemapXml')) {
  fail('GET /sitemap.xml must use buildSitemapXml');
} else ok('dynamic GET /sitemap.xml');

const robots = buildRobotsTxt();
const base = siteBaseUrl();
if (!robots.includes(`Sitemap: ${base}/sitemap.xml`)) fail('robots.txt missing Sitemap line');
else ok('robots.txt points at /sitemap.xml');
if (!robots.includes('Disallow: /admin')) fail('robots.txt should disallow /admin');
else ok('robots.txt disallows /admin');
if (!robots.includes('Disallow: /login') || !robots.includes('Disallow: /en/login')) {
  fail('robots.txt should disallow /login and /en/login');
} else ok('robots.txt disallows login (tr+en)');
if (!robots.includes('Disallow: /register') || !robots.includes('Disallow: /profile')) {
  fail('robots.txt should disallow register/profile');
} else ok('robots.txt disallows register/profile');

if (englishAlternateLoc('https://www.touristlio.com/places/ayasofya-istanbul', 'https://www.touristlio.com')
  !== 'https://www.touristlio.com/en/places/ayasofya-istanbul') {
  fail('englishAlternateLoc place path');
} else ok('englishAlternateLoc /places → /en/places');
if (englishAlternateLoc('https://www.touristlio.com/en/blog/x', 'https://www.touristlio.com')) {
  fail('englishAlternateLoc must skip already-EN locs');
} else ok('englishAlternateLoc skips /en/*');

async function checkDatabase() {
  const { initDb, db, closePool } = require('../db');
  await initDb();
  try {
    const xml = await buildSitemapXml();
    if (!xml.includes('<urlset') || !xml.includes('<?xml')) fail('xml missing urlset');
    else ok('xml has urlset');

    const locs = extractLocs(xml);
    if (!locs.length) fail('sitemap has no loc entries');
    else ok(`${locs.length} loc entries`);

    const banned = locs.filter((loc) => {
      const p = pathnameOf(loc);
      return p === '/admin' || p.startsWith('/admin/') || p.startsWith('/api/') || p === '/login' || p.startsWith('/login');
    });
    if (banned.length) fail(`private URLs in sitemap: ${banned.slice(0, 3).join(', ')}`);
    else ok('no /admin /api /login in sitemap');

    const placeLocs = locs.filter((loc) => /\/places\//.test(pathnameOf(loc)));
    const idOnly = placeLocs.filter((loc) => /\/places\/\d+$/.test(pathnameOf(loc)));
    if (idOnly.length) fail(`numeric place ids in sitemap: ${idOnly.slice(0, 3).join(', ')}`);
    else ok('place locs use slugs, not ids');

    const locSet = new Set(locs.map((loc) => pathnameOf(loc)));
    if (!locSet.has('/en/') || !locSet.has('/en/blog') || !locSet.has('/en/gezilecek-yerler') || !locSet.has('/en/search')) {
      fail('sitemap missing EN listing pages');
    } else ok('EN listing pages in sitemap');
    if (!locSet.has('/en/legal/about.html') || !locSet.has('/en/legal/contact.html')) {
      fail('sitemap missing EN legal pages');
    } else ok('EN legal pages in sitemap');
    if (locs.some((loc) => pathnameOf(loc).startsWith('/en/en/'))) fail('sitemap has /en/en/ paths');
    else ok('no /en/en/ duplicate prefix');

    const places = await db.prepare('SELECT slug, lat, lng, status FROM places').all();
    let expectedPlaces = 0;
    let leaked = 0;
    let missing = 0;
    for (const row of places) {
      const pathName = placeSitemapPath(row);
      if (pathName) {
        expectedPlaces += 1;
        if (!locSet.has(pathName)) missing += 1;
        if (!locSet.has(`/en${pathName}`)) missing += 1;
      } else {
        const slug = String(row.slug || '').trim();
        if (slug && locSet.has(`/places/${encodeURIComponent(slug)}`)) leaked += 1;
        if (row.id != null && locSet.has(`/places/${row.id}`)) leaked += 1;
      }
    }
    if (missing) fail(`${missing} published+coord places missing from sitemap`);
    else ok(`all ${expectedPlaces} published+coord places listed`);
    if (leaked) fail(`${leaked} draft/archived/invalid places leaked into sitemap`);
    else ok('draft/archived/invalid places not listed');

    const blogs = await db.prepare('SELECT slug, status FROM blogs').all();
    let expectedBlogs = 0;
    let blogLeaked = 0;
    let blogMissing = 0;
    for (const row of blogs) {
      const slug = String(row.slug || '').trim();
      const pathName = slug ? `/blog/${encodeURIComponent(slug)}` : null;
      const publicBlog = row.status === 'approved' && pathName;
      if (publicBlog) {
        expectedBlogs += 1;
        if (!locSet.has(pathName) || !locSet.has(`/en${pathName}`)) blogMissing += 1;
      } else if (pathName && (locSet.has(pathName) || locSet.has(`/en${pathName}`))) {
        blogLeaked += 1;
      }
    }
    if (blogMissing) fail(`${blogMissing} approved blogs missing from sitemap`);
    else ok(`all ${expectedBlogs} approved blogs listed`);
    if (blogLeaked) fail(`${blogLeaked} unapproved blogs leaked into sitemap`);
    else ok('unapproved blogs not listed');

    const placePriority = xml.match(/\/places\/[^<]+<\/loc>\s*<lastmod>[^<]+<\/lastmod>\s*<changefreq>weekly<\/changefreq>\s*<priority>0\.8<\/priority>/);
    if (expectedPlaces && !placePriority) fail('published places should use priority 0.8 weekly');
    else if (expectedPlaces) ok('place entries priority 0.8 weekly');

    const blogPriority = xml.match(/\/blog\/[^<]+<\/loc>\s*<lastmod>[^<]+<\/lastmod>\s*<changefreq>monthly<\/changefreq>\s*<priority>0\.7<\/priority>/);
    if (expectedBlogs && !blogPriority) fail('approved blogs should use priority 0.7 monthly');
    else if (expectedBlogs) ok('blog entries priority 0.7 monthly');
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
    const xml = await buildSitemapXml();
    if (!xml.includes('<urlset')) fail('static xml missing urlset');
    else ok('static xml has urlset (no DB)');
    if (!xml.includes('/en/gezilecek-yerler') || !xml.includes('/en/search') || !xml.includes('/en/legal/about.html')) {
      fail('static sitemap missing EN twins');
    } else ok('static sitemap has EN listing + legal twins');
  }

  if (failed) {
    console.error(`verify-sitemap FAILED (${failed})`);
    process.exit(1);
  }
  console.log('verify-sitemap OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
