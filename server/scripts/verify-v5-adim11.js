#!/usr/bin/env node
/**
 * V5 Adım 11 — görseli doğrulanmamış yer sayfaları noindex + sitemap dışı.
 * Tek kapı: isIndexablePlace(row, lang).
 *
 * Usage: npm run verify:v5-adim11
 */
require('dotenv').config();
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const PORT = process.env.VERIFY_V5_ADIM11_PORT || '31911';

let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) { console.error('  ✗', msg); failed += 1; }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function request(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: 'GET',
      headers: { Accept: 'text/html,application/xml' },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          body: Buffer.concat(chunks).toString('utf8'),
          headers: res.headers,
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function robotsOf(html) {
  const m = String(html || '').match(/<meta\s+name=["']robots["']\s+content=["']([^"']+)["']/i)
    || String(html || '').match(/content=["']([^"']+)["']\s+name=["']robots["']/i);
  return m ? m[1] : '';
}

console.log('verify-v5-adim11-image-index');

// --- static source checks ---
const placeI18n = read('server/lib/place-i18n.js');
const placeIndexable = read('server/lib/place-indexable.js');
const sitemapJs = read('server/lib/sitemap.js');
const indexJs = read('server/index.js');
const appJs = read('public/js/app.js');

if (!/function isIndexablePlace\s*\(/.test(placeI18n)) {
  fail('place-i18n isIndexablePlace yok');
} else ok('isIndexablePlace(row, lang) var');

if (!/meetsIndexablePlaceBase/.test(placeIndexable) || !/imageVerified|image_verified/.test(placeIndexable)) {
  fail('place-indexable imageVerified kapısı yok');
} else ok('place-indexable: yayında + koordinat + TR açıklama + imageVerified');

if (!/isIndexablePlace/.test(sitemapJs) || !/image_verified\s+IS\s+TRUE/i.test(sitemapJs)) {
  fail('sitemap isIndexablePlace / image_verified filtresi yok');
} else ok('sitemap image_verified IS TRUE + isIndexablePlace');

if (!/isIndexablePlace/.test(indexJs) || !/placePageIndexing/.test(indexJs)) {
  fail('place route isIndexablePlace / placePageIndexing bağlamıyor');
} else if (!/noindex:\s*indexing\.noindex/.test(indexJs)) {
  fail('place route noindex indexing.noindex kullanmıyor');
} else ok('place route robots isIndexablePlace / placePageIndexing üzerinden');

if (!/function isIndexablePlace\s*\(/.test(appJs) || !/applyPlaceRobots/.test(appJs)) {
  fail('client isIndexablePlace / applyPlaceRobots yok');
} else if (!/placeImageVerifiedFlag|imageVerified/.test(appJs)) {
  fail('client imageVerified kontrolü yok');
} else ok('client robots isIndexablePlace aynası');

const {
  isIndexablePlace,
  placePageIndexing,
  placeEnSitemapPath,
} = require('../lib/place-i18n');
const { placeSitemapPath, PLACE_DESCRIPTION_MIN_CHARS } = require('../lib/sitemap');

const long = 'A'.repeat(PLACE_DESCRIPTION_MIN_CHARS + 1);
const base = {
  name: 'Ayasofya',
  slug: 'ayasofya-v5-adim11',
  status: 'published',
  lat: 41.0086,
  lng: 28.9802,
  description: long,
  description_en: 'Hagia Sophia is a landmark in Istanbul.',
  image_verified: true,
};

if (!isIndexablePlace(base, 'tr') || !isIndexablePlace(base, 'en')) {
  fail('doğrulanmış yer indexable olmalı');
} else ok('doğrulanmış yer TR+EN indexable');

if (isIndexablePlace({ ...base, image_verified: false }, 'tr')) {
  fail('image_verified false TR hâlâ indexable');
} else ok('image_verified false → TR noindex kapısı');

if (placeSitemapPath({ ...base, image_verified: false }) || placeEnSitemapPath({ ...base, image_verified: false })) {
  fail('doğrulanmamış yer sitemap yoluna girdi');
} else ok('doğrulanmamış yer sitemap dışı');

if (placeSitemapPath(base) !== '/places/ayasofya-v5-adim11') {
  fail('doğrulanmış yer sitemap yolu yok');
} else ok('doğrulanmış yer TR sitemap yolu');

const unverified = placePageIndexing({ ...base, image_verified: false }, 'tr');
if (!unverified.noindex || unverified.enPath) {
  fail(`doğrulanmamış indexing bozuk: ${JSON.stringify(unverified)}`);
} else ok('doğrulanmamış: noindex, EN hreflang yok');

const incompleteEn = placePageIndexing({ ...base, description_en: '', overview_en: '' }, 'en');
if (!incompleteEn.noindex) fail('eksik EN çeviri hâlâ indexable');
else ok('eksik EN çeviri noindex (V4 Adım 8 korunuyor)');

const completeTr = placePageIndexing({ ...base, description_en: '', overview_en: '' }, 'tr');
if (completeTr.noindex) fail('doğrulanmış TR (EN eksik) noindex oldu');
else ok('doğrulanmış TR, EN eksikken indexable kalır');

// client mirror
const client = new Function(`
  let lang = 'tr';
  function setMetaContent(sel, content) { client.metas.push([sel, content]); }
  ${appJs.slice(appJs.indexOf('function placeHasEnglishCopy('), appJs.indexOf('function updateSeoForPlace('))}
  const client = {
    metas: [],
    setLang(next) { lang = next; },
    isIndexablePlace,
    applyPlaceRobots,
    applyPlaceHreflang,
  };
  return client;
`)();

const clientPlace = {
  name: 'Ayasofya',
  slug: 'ayasofya-v5-adim11',
  lat: 41.0086,
  lng: 28.9802,
  description: long,
  descriptionEn: 'English copy here.',
  imageVerified: true,
  status: 'published',
};
if (!client.isIndexablePlace(clientPlace, 'tr')) fail('client doğrulanmış yeri reddetti');
else ok('client isIndexablePlace doğrulanmışı kabul');
if (client.isIndexablePlace({ ...clientPlace, imageVerified: false }, 'tr')) {
  fail('client imageVerified false kabul etti');
} else ok('client imageVerified false reddeder');

client.setLang('tr');
client.applyPlaceRobots({ ...clientPlace, imageVerified: false });
client.applyPlaceRobots(clientPlace);
const clientRobots = client.metas.map((r) => r[1]);
if (clientRobots[0] !== 'noindex, nofollow' || clientRobots[1] !== 'index,follow') {
  fail(`client robots ${clientRobots.join(' | ')}`);
} else ok('client robots: doğrulanmamış noindex, doğrulanmış index');

const pkg = JSON.parse(read('package.json'));
if (pkg.scripts && pkg.scripts['verify:v5-adim11'] === 'node server/scripts/verify-v5-adim11.js') {
  ok('package.json verify:v5-adim11');
} else fail('package.json verify:v5-adim11 eksik');

async function waitHealth(baseUrl) {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await request(`${baseUrl}/api/health`);
      if (res.status === 200) return;
    } catch { /* retry */ }
    await sleep(250);
  }
  throw new Error('server did not start');
}

async function liveChecks() {
  const { initDb, db, closePool } = require('../db');
  await initDb();

  const beforeRow = await db.prepare(`
    SELECT COUNT(*) AS c FROM places
    WHERE COALESCE(NULLIF(TRIM(status), ''), 'published') = 'published'
      AND slug IS NOT NULL AND TRIM(slug) <> ''
      AND lat IS NOT NULL AND lng IS NOT NULL
      AND lat <> 0 AND lng <> 0
      AND GREATEST(
        char_length(btrim(COALESCE(overview, ''))),
        char_length(btrim(COALESCE(description, '')))
      ) > ${PLACE_DESCRIPTION_MIN_CHARS}
  `).get();
  const afterRow = await db.prepare(`
    SELECT COUNT(*) AS c FROM places
    WHERE COALESCE(NULLIF(TRIM(status), ''), 'published') = 'published'
      AND slug IS NOT NULL AND TRIM(slug) <> ''
      AND lat IS NOT NULL AND lng IS NOT NULL
      AND lat <> 0 AND lng <> 0
      AND image_verified IS TRUE
      AND GREATEST(
        char_length(btrim(COALESCE(overview, ''))),
        char_length(btrim(COALESCE(description, '')))
      ) > ${PLACE_DESCRIPTION_MIN_CHARS}
  `).get();
  const beforeCount = Number(beforeRow.c);
  const afterCount = Number(afterRow.c);
  console.log(`  · sitemap yer URL (önce / kalite): ${beforeCount}`);
  console.log(`  · sitemap yer URL (sonra / imageVerified): ${afterCount}`);
  if (!(beforeCount >= afterCount)) fail('sonra sayı önce sayıdan büyük olamaz');
  else ok(`önce→sonra yer URL: ${beforeCount} → ${afterCount}`);

  const slug = `v5-adim11-${Date.now()}`;
  const trText = `V5 Adım 11 doğrulanmamış yer metni ${'x'.repeat(40)}`;
  const maxId = await db.prepare('SELECT COALESCE(MAX(id), 0) AS m FROM places').get();
  const placeId = Number(maxId.m) + 91011;
  let child = null;

  try {
    await db.prepare(`
      INSERT INTO places (
        id, name, slug, country, city, category, status,
        description, description_en, overview_en, lat, lng, image_verified
      ) VALUES (?, ?, ?, ?, ?, ?, 'published', ?, '', '', ?, ?, FALSE)
    `).run(
      placeId,
      'V5 Adım 11 Deneme',
      slug,
      'Turkey',
      'Istanbul',
      'landmark',
      trText,
      41.0082,
      28.9784,
    );

    const { buildSitemapXml } = require('../lib/sitemap');
    const xml = await buildSitemapXml();
    if (xml.includes(`/places/${slug}`)) fail('doğrulanmamış yer sitemap’te');
    else ok('doğrulanmamış yer sitemap dışı (canlı)');

    child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(PORT),
        NODE_ENV: 'development',
        SITEMAP_ON_START: 'false',
        LIVE_DATA_CRON: 'false',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const baseUrl = `http://127.0.0.1:${PORT}`;
    await waitHealth(baseUrl);

    const trPage = await request(`${baseUrl}/places/${slug}`);
    if (trPage.status !== 200) fail(`GET /places/${slug} HTTP ${trPage.status}`);
    else if (!trPage.body.includes('V5 Adım 11 Deneme')) fail('sayfa kullanıcıya açılmadı');
    else if (!/noindex/i.test(robotsOf(trPage.body))) {
      fail(`doğrulanmamış TR robots: ${robotsOf(trPage.body) || '(yok)'}`);
    } else ok('doğrulanmamış yer ziyaretçiye açık + noindex');

    await db.prepare('UPDATE places SET image_verified = TRUE, image_verified_at = NOW() WHERE id = ?').run(placeId);
    // rebuild sitemap memory after flag flip
    const xml2 = await buildSitemapXml();
    if (!xml2.includes(`/places/${slug}`)) fail('doğrulanınca sitemap’e girmedi');
    else ok('imageVerified=true → sitemap’e girer');

    const trPage2 = await request(`${baseUrl}/places/${slug}`);
    // Server HTML is rendered per request from DB row — should now be indexable
    if (robotsOf(trPage2.body) !== 'index,follow') {
      fail(`doğrulandıktan sonra robots: ${robotsOf(trPage2.body)}`);
    } else ok('imageVerified=true → index,follow');
  } finally {
    try {
      await db.prepare('DELETE FROM places WHERE id = ?').run(placeId);
    } catch { /* ignore */ }
    if (child) {
      child.kill('SIGTERM');
      await sleep(200);
    }
    try { await closePool(); } catch { /* ignore */ }
  }
}

liveChecks()
  .then(() => {
    if (failed) {
      console.error(`\nverify-v5-adim11 FAILED (${failed})`);
      process.exit(1);
    }
    console.log('\nverify-v5-adim11 OK');
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    console.error('\nverify-v5-adim11 FAILED');
    process.exit(1);
  });
