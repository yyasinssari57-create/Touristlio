#!/usr/bin/env node
/**
 * V5 Adım 9 — sitemap DB hatasında cache/503; lastmod fallback yok; blogs.updated_at.
 *
 * Usage: npm run verify:v5-adim9
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) { console.error('  ✗', msg); failed += 1; }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

console.log('verify-v5-adim9-sitemap-harden');

const sitemapJs = read('server/lib/sitemap.js');
const sitemapCode = stripComments(sitemapJs);
const indexJs = read('server/index.js');
const adminJs = read('server/routes/admin.js');
const migration = read('db/migrations/021_v5_adim9_blog_updated_at.js');

// --- loadPlaceUrls / loadBlogUrls must propagate DB errors (no empty catch → []) ---
function fnBody(src, name) {
  const re = new RegExp(`async function ${name}\\s*\\([^)]*\\)\\s*\\{`);
  const m = re.exec(src);
  if (!m) return null;
  let i = m.index + m[0].length;
  let depth = 1;
  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    i += 1;
  }
  return src.slice(m.index, i);
}

for (const name of ['loadPlaceUrls', 'loadBlogUrls']) {
  const body = fnBody(sitemapCode, name);
  if (!body) {
    fail(`${name} bulunamadı`);
    continue;
  }
  if (/\.all\(\)\s*;[\s\S]*catch\s*\([^)]*\)\s*\{\s*\}/.test(body)
    || /catch\s*\([^)]*\)\s*\{\s*return\s*\[\s*\]\s*;?\s*\}/.test(body)
    || /catch\s*\{\s*return\s*\[\s*\]\s*;?\s*\}/.test(body)) {
    fail(`${name} DB hatalarını yutuyor (boş dizi)`);
  } else if (/catch\s*\(/.test(body) || /catch\s*\{/.test(body)) {
    // catch present — must rethrow
    if (!/throw\s/.test(body)) fail(`${name} catch var ama yeniden fırlatmıyor`);
    else ok(`${name} hataları yutmuyor`);
  } else {
    ok(`${name} try/catch yok — hatalar yayılır`);
  }
}

// --- no CONTENT_SNAPSHOT_DATE as place/blog lastmod fallback ---
const placeLastmod = /recordLastmod\([^)]*\)/.exec(
  fnBody(sitemapCode, 'loadPlaceUrls') || '',
);
const blogLastmod = /recordLastmod\([^)]*\)/.exec(
  fnBody(sitemapCode, 'loadBlogUrls') || '',
);
if (!placeLastmod) fail('loadPlaceUrls recordLastmod çağırmıyor');
else if (/CONTENT_SNAPSHOT_DATE/.test(placeLastmod[0])) {
  fail('places lastmod CONTENT_SNAPSHOT_DATE fallback kullanıyor');
} else ok('places lastmod sabit snapshot fallback yok');

if (!blogLastmod) fail('loadBlogUrls recordLastmod çağırmıyor');
else if (/CONTENT_SNAPSHOT_DATE/.test(blogLastmod[0])) {
  fail('blogs lastmod CONTENT_SNAPSHOT_DATE fallback kullanıyor');
} else ok('blogs lastmod sabit snapshot fallback yok');

if (/recordLastmod\([^)]*CONTENT_SNAPSHOT_DATE/.test(sitemapCode)) {
  fail('recordLastmod hâlâ CONTENT_SNAPSHOT_DATE alıyor (dinamik satırlar)');
} else ok('dinamik lastmod CONTENT_SNAPSHOT_DATE kullanmıyor');

const {
  recordLastmod,
  renderUrlSet,
  CONTENT_SNAPSHOT_DATE,
  getCachedSitemapXml,
  SITEMAP_RETRY_AFTER_SEC,
} = require('../lib/sitemap');

if (typeof recordLastmod !== 'function') fail('recordLastmod export yok');
else if (recordLastmod(null, null, '2025-04-01 12:00:00') !== '2025-04-01') {
  fail('recordLastmod çoklu argüman (published_at/created_at) desteklemiyor');
} else if (recordLastmod('2026-01-15', '2025-04-01') !== '2026-01-15') {
  fail('recordLastmod ilk geçerli tarihi seçmedi');
} else if (recordLastmod(null, '', undefined) !== null) {
  fail('recordLastmod boşken null dönmeli (lastmod omit)');
} else ok('recordLastmod çoklu argüman + null omit');

const xmlNoMod = renderUrlSet([{ loc: 'https://example.com/x', priority: '0.5', changefreq: 'weekly' }]);
if (/<lastmod>/.test(xmlNoMod)) fail('falsy lastmod hâlâ <lastmod> yazıyor');
else ok('renderUrlSet lastmod yoksa etiketi atlar');

const xmlStatic = renderUrlSet([{
  loc: 'https://example.com/',
  lastmod: CONTENT_SNAPSHOT_DATE,
  priority: '1.0',
  changefreq: 'daily',
}]);
if (!xmlStatic.includes(`<lastmod>${CONTENT_SNAPSHOT_DATE}</lastmod>`)) {
  fail('statik sayfalar CONTENT_SNAPSHOT_DATE lastmod kullanmalı');
} else ok(`statik lastmod ${CONTENT_SNAPSHOT_DATE} korunuyor`);

// --- 503 path / getCachedSitemapXml ---
if (typeof getCachedSitemapXml !== 'function') fail('getCachedSitemapXml yok');
else ok('getCachedSitemapXml export');

if (!Number.isFinite(SITEMAP_RETRY_AFTER_SEC) || SITEMAP_RETRY_AFTER_SEC <= 0) {
  fail('SITEMAP_RETRY_AFTER_SEC geçersiz');
} else ok(`SITEMAP_RETRY_AFTER_SEC=${SITEMAP_RETRY_AFTER_SEC}`);

const sitemapRoute = indexJs.match(/app\.get\('\/sitemap\.xml'[\s\S]*?\n\}\);/);
if (!sitemapRoute) fail('/sitemap.xml route yok');
else {
  const block = sitemapRoute[0];
  if (!/getCachedSitemapXml/.test(block)) fail('sitemap hata yolunda getCachedSitemapXml yok');
  else ok('sitemap hata → cache kontrolü');
  if (!/status\(503\)/.test(block) || !/Retry-After/.test(block)) {
    fail('cache yokken 503 + Retry-After eksik');
  } else ok('cache yok → 503 + Retry-After');
  if (!/X-Sitemap-Cache/.test(block) && !/stale/.test(block)) {
    fail('stale cache yanıtı işaretlenmiyor');
  } else ok('stale cache yolu var');
}

if (!/lastGoodSitemapXml\s*=\s*xml/.test(sitemapCode) && !/lastGoodSitemapXml = xml/.test(sitemapJs)) {
  fail('başarılı XML lastGoodSitemapXml’e yazılmıyor');
} else ok('başarılı sitemap bellekte cache’leniyor');

// --- blogs.updated_at migration ---
if (!/021_v5_adim9_blog_updated_at/.test(migration)) fail('migration id yanlış');
else if (!/addColumnIfMissing[\s\S]*blogs[\s\S]*updated_at/.test(migration)
  && !/blogs',\s*'updated_at'/.test(migration)) {
  fail('migration blogs.updated_at eklemiyor');
} else ok('migration 021 blogs.updated_at');

// --- admin blog updates touch updated_at ---
const blogUpdateBlocks = [...adminJs.matchAll(/UPDATE blogs SET[\s\S]*?WHERE[\s\S]*?;/gi)];
if (!blogUpdateBlocks.length) fail('admin.js içinde blogs UPDATE yok');
else {
  let missing = 0;
  for (const m of blogUpdateBlocks) {
    const sql = m[0];
    if (!/updated_at\s*=\s*(?:NOW\(\)|datetime\('now'\))/.test(sql)) {
      missing += 1;
      if (missing <= 3) fail(`admin blogs UPDATE updated_at dokunmuyor: ${sql.slice(0, 80).replace(/\s+/g, ' ')}…`);
    }
  }
  if (missing === 0) ok(`admin blogs UPDATE hepsi updated_at dokunuyor (${blogUpdateBlocks.length})`);
  else if (missing > 3) fail(`… ve ${missing - 3} UPDATE daha updated_at eksik`);
}

// places main edit path already touches updated_at (admin-place)
const adminPlace = read('server/lib/admin-place.js');
if (!/updated_at\s*=\s*(?:NOW\(\)|datetime\('now'\))/.test(adminPlace)) {
  fail('admin-place.js places updated_at dokunmuyor');
} else ok('admin-place places updated_at dokunuyor');

if (failed) {
  console.error(`\nverify-v5-adim9 FAILED (${failed})`);
  process.exit(1);
}
console.log('\nverify-v5-adim9 OK');
