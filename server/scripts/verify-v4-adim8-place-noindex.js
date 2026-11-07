/**
 * V4 Adım 8 — EN place pages: noindex when the translation is incomplete.
 * The visitor still sees the Turkish fallback. Google does not.
 * Usage: node server/scripts/verify-v4-adim8-place-noindex.js
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

console.log('verify-v4-adim8-place-noindex');

const {
  placeEnTranslationComplete,
  placeHasEnglishCopy,
  placeEnSitemapPath,
  placePageIndexing,
  PLACE_EN_MISSING_SQL,
} = require('../lib/place-i18n');
const { buildSeoHead, generateMeta } = require('../lib/seo');

const indexableBase = {
  status: 'published',
  lat: 41.0086,
  lng: 28.9802,
  description: 'A'.repeat(60),
  image_verified: true,
};
const thin = { slug: 'sadece-turkce', description_en: '  ', overview_en: '', ...indexableBase };
const ready = {
  slug: 'hagia-sophia',
  description_en: 'A real English description.',
  overview_en: '',
  ...indexableBase,
};
if (placeEnTranslationComplete(thin) || placeHasEnglishCopy(thin) || placeEnSitemapPath(thin)) {
  fail('whitespace English copy was treated as complete');
} else ok('empty English copy is incomplete and has no EN sitemap path');
if (placeEnSitemapPath(ready) !== '/en/places/hagia-sophia') fail('description_en lost its EN sitemap path');
else ok('description_en still produces /en/places/{slug} (Adım 3)');
if (!placeEnTranslationComplete({ description_en: '', overview_en: 'English overview' })) {
  fail('overview_en alone no longer counts');
} else ok('overview_en alone still counts as English copy');

const namedGap = {
  name: 'Ayasofya',
  slug: 'ayasofya-istanbul',
  description_en: '',
  overview_en: '   ',
  ...indexableBase,
};
if (placeEnTranslationComplete(namedGap)) fail('a named place with no English text was complete');
else ok('name alone does not complete the translation');

const namedReady = {
  name: 'Ayasofya',
  slug: 'ayasofya-istanbul',
  description_en: 'Hagia Sophia is a landmark.',
  overview_en: '',
  ...indexableBase,
};
if (!placeEnTranslationComplete(namedReady)) fail('name + description_en was incomplete');
else ok('stored name plus description_en is complete (no name_en column)');

const blankName = { name: '  ', name_en: '', description_en: 'English text', slug: 'blank' };
if (placeEnTranslationComplete(blankName) || placeEnSitemapPath(blankName)) {
  fail('an empty name_en was accepted');
} else ok('an explicit empty name_en is incomplete');

const enName = { name: 'Ayasofya', name_en: 'Hagia Sophia', description_en: 'A landmark.', slug: 'ayasofya' };
if (!placeEnTranslationComplete(enName)) fail('name_en + description_en was incomplete');
else ok('name_en + description_en is complete');

const enPage = placePageIndexing(namedGap, 'en');
const trPage = placePageIndexing(namedGap, 'tr');
if (!enPage.noindex || enPage.enPath || enPage.trPath !== '/places/ayasofya-istanbul') {
  fail(`EN incomplete indexing ${JSON.stringify(enPage)}`);
} else ok('incomplete /en/places/:slug is noindex and has no en alternate');
if (trPage.noindex || trPage.enPath) fail('Turkish page of an incomplete place was closed or still advertised en');
else ok('Turkish page stays indexable and does not advertise hreflang en');

const done = placePageIndexing(namedReady, 'en');
if (done.noindex || done.enPath !== '/en/places/ayasofya-istanbul') {
  fail(`complete EN indexing ${JSON.stringify(done)}`);
} else ok('complete English page stays indexable');

function headFor(row, lang) {
  const indexing = placePageIndexing(row, lang);
  const pathname = lang === 'en' ? (indexing.enPath || indexing.trPath) : indexing.trPath;
  return buildSeoHead({
    pathname: lang === 'en' && !indexing.complete ? `/en${indexing.trPath}` : pathname,
    lang,
    noindex: indexing.noindex,
    alternates: { tr: indexing.trPath, en: indexing.enPath },
  });
}

const enHead = headFor(namedGap, 'en');
if (!enHead.includes('name="robots" content="noindex')) fail('EN head is not noindex');
else if (enHead.includes('hreflang="en"')) fail('noindex EN head still has hreflang en');
else ok('EN head is noindex and has no en hreflang');

const trHead = headFor(namedGap, 'tr');
if (!trHead.includes('name="robots" content="index,follow"')) fail('TR head is not index,follow');
else if (trHead.includes('hreflang="en"')) fail('TR head advertised en');
else if (!trHead.includes('hreflang="tr"')) fail('TR head lost hreflang tr');
else ok('TR head stays index,follow with tr hreflang only');

const readyHead = headFor(namedReady, 'en');
if (!readyHead.includes('name="robots" content="index,follow"')) fail('complete EN head is not indexable');
else if (!readyHead.includes('hreflang="en"') || !readyHead.includes('/en/places/ayasofya-istanbul')) {
  fail('complete EN head lost hreflang en');
} else ok('complete EN head is indexable and has hreflang en');

const fallback = generateMeta('place', {
  place: {
    name: 'Ayasofya',
    city: 'Istanbul',
    description: 'Türkçe yedek açıklama burada durur.',
    descriptionEn: '',
    overviewEn: '',
  },
}, 'en');
if (!fallback.description.includes('Türkçe yedek açıklama')) fail('EN meta stopped falling back to Turkish');
else if (!fallback.title.includes('Ayasofya')) fail('EN title dropped the place name');
else ok('visitor-facing EN meta still falls back to Turkish');

if (PLACE_EN_MISSING_SQL.includes('name_en')) fail('admin SQL names a column this schema does not have');
else if (!PLACE_EN_MISSING_SQL.includes('description_en') || !PLACE_EN_MISSING_SQL.includes('overview_en')) {
  fail('admin SQL does not check the English description fields');
} else ok('admin filter SQL uses description_en and overview_en');

const indexJs = read('server/index.js');
if (!indexJs.includes('placePageIndexing')) {
  fail('place route does not pass noindex from placePageIndexing');
} else if (!/noindex:\s*indexing\.noindex/.test(indexJs)
  && !/noindex:\s*indexing\.noindex\s*\|\|/.test(indexJs)) {
  fail('place route does not pass noindex from placePageIndexing');
} else ok('place route sets noindex from the translation check');

const appJs = read('public/js/app.js');
const detail = appJs.match(/else if \(tab === 'detail'\) \{[\s\S]{0,280}/);
if (!detail || !detail[0].includes('applyPlaceRobots(activePlace)')) {
  fail('detail tab does not apply place robots');
} else if (detail[0].includes('index,follow')) fail('detail tab forces index,follow');
else ok('detail tab does not force index,follow');
if (!appJs.includes('p.overviewEn || p.descriptionEn || p.overview || p.description')) {
  fail('place page stopped falling back to Turkish text');
} else ok('place page still shows Turkish text when English is empty');

const client = new Function(`
  let lang = 'tr';
  function setMetaContent(sel, content) { client.metas.push([sel, content]); }
  ${appJs.slice(appJs.indexOf('function placeHasEnglishCopy('), appJs.indexOf('function applyPlaceHreflang('))}
  const client = { metas: [], setLang(next) { lang = next; }, placeHasEnglishCopy, applyPlaceRobots };
  return client;
`)();
if (client.placeHasEnglishCopy({ name: 'Ayasofya', descriptionEn: '', overviewEn: '' })) {
  fail('client treated an empty English description as complete');
} else if (!client.placeHasEnglishCopy({ name: 'Ayasofya', descriptionEn: 'English text' })) {
  fail('client rejected descriptionEn');
} else if (!client.placeHasEnglishCopy({ descriptionEn: '', overviewEn: 'Overview only' })) {
  fail('client rejected overviewEn (Adım 3)');
} else if (client.placeHasEnglishCopy({ name: 'Ayasofya', nameEn: '', descriptionEn: 'English text' })) {
  fail('client accepted an empty nameEn');
} else ok('client completeness matches the server rule');
const clientBase = {
  name: 'Ayasofya',
  lat: 41.0086,
  lng: 28.9802,
  description: 'A'.repeat(60),
  imageVerified: true,
  status: 'published',
};
client.setLang('en');
client.applyPlaceRobots({ ...clientBase, descriptionEn: '' });
client.setLang('tr');
client.applyPlaceRobots({ ...clientBase, descriptionEn: '' });
client.setLang('en');
client.applyPlaceRobots({ ...clientBase, descriptionEn: 'English text' });
const robots = client.metas.map((row) => row[1]);
if (robots[0] !== 'noindex, nofollow' || robots[1] !== 'index,follow' || robots[2] !== 'index,follow') {
  fail(`client robots ${robots.join(' | ')}`);
} else ok('client sets noindex only on the incomplete English page');

const adminHtml = read('public/admin.html');
if (!adminHtml.includes('id="placeEnFilter"') || !adminHtml.includes('>EN çeviri eksik<')) {
  fail('admin list is missing the EN filter');
} else if (!adminHtml.includes('enTranslationMissing')) fail('admin list does not render the missing label');
else ok('admin list has the EN çeviri eksik filter and label');
const adminRoute = read('server/routes/admin.js');
if (!adminRoute.includes("req.query.en === 'missing'")) fail('admin API ignores en=missing');
else ok('admin API accepts en=missing');

const places = JSON.parse(read('server/data/places.json'));
let jsonMissing = 0;
for (const row of places) {
  if (!placeEnTranslationComplete({
    name: row.name,
    description_en: row.descriptionEn,
    overview_en: row.overviewEn,
  })) jsonMissing += 1;
}
console.log(`  · places.json: ${places.length} kayıt, EN çevirisi eksik ${jsonMissing}`);

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

function robotsOf(html) {
  const m = String(html).match(/<meta\s+name="robots"\s+content="([^"]+)"/i);
  return m ? m[1] : '';
}

async function checkDatabase() {
  if (!String(process.env.DATABASE_URL || '').trim()) {
    console.log('  · DATABASE_URL yok, canlı sayfa atlandı');
    return;
  }
  const { initDb, db, closePool } = require('../db');
  await initDb();
  const slug = 'v4-adim8-eksik-ceviri';
  const trText = 'Bu deneme kaydının Türkçe açıklaması İngilizce sayfada yedek olarak durur ve en az elli karakter içerir.';
  let placeId = null;
  let child = null;
  try {
    const rows = await db.prepare('SELECT name, description_en, overview_en, status FROM places').all();
    let jsMissing = 0;
    for (const row of rows) {
      if (!placeEnTranslationComplete(row)) jsMissing += 1;
    }
    const sqlMissing = await db.prepare(`SELECT COUNT(*) AS c FROM places WHERE ${PLACE_EN_MISSING_SQL}`).get();
    console.log(`  · veritabanı: ${rows.length} mekân, EN çevirisi eksik ${jsMissing}`);
    if (Number(sqlMissing.c) !== jsMissing) fail(`SQL filter ${sqlMissing.c} != JS ${jsMissing}`);
    else ok('admin SQL filter matches the completeness check');

    await db.prepare('DELETE FROM places WHERE slug = ?').run(slug);
    const max = await db.prepare('SELECT MAX(id) AS m FROM places').get();
    placeId = (Number(max && max.m) || 0) + 1;
    await db.prepare(`
      INSERT INTO places (
        id, name, slug, country, city, category, status,
        description, description_en, overview_en, lat, lng, image_verified
      ) VALUES (?, ?, ?, ?, ?, ?, 'published', ?, '', '', ?, ?, TRUE)
    `).run(
      placeId,
      'V4 Adım 8 Deneme',
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
    if (xml.includes(`/en/places/${slug}`)) fail('incomplete place entered the EN sitemap');
    else ok('incomplete place is absent from the EN sitemap');
    if (!xml.includes(`/places/${slug}`)) fail('incomplete place dropped out of the Turkish sitemap');
    else ok('Turkish URL of the incomplete place stays in the sitemap');

    const sample = await db.prepare(`
      SELECT slug FROM places
      WHERE slug IS NOT NULL AND btrim(slug) <> ''
        AND COALESCE(NULLIF(TRIM(status), ''), 'published') = 'published'
        AND image_verified IS TRUE
        AND btrim(COALESCE(description_en, '')) <> ''
        AND GREATEST(
          char_length(btrim(COALESCE(overview, ''))),
          char_length(btrim(COALESCE(description, '')))
        ) > 50
        AND lat IS NOT NULL AND lng IS NOT NULL AND lat <> 0 AND lng <> 0
        AND slug <> ?
      ORDER BY id
      LIMIT 1
    `).get(slug);

    const port = 3108;
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
    const base = `http://127.0.0.1:${port}`;
    await waitForServer(base);

    const enPageRes = await fetchText(`${base}/en/places/${slug}`);
    if (enPageRes.status !== 200) fail(`GET /en/places/${slug} HTTP ${enPageRes.status}`);
    else if (robotsOf(enPageRes.body) !== 'noindex, nofollow') {
      fail(`incomplete EN robots: ${robotsOf(enPageRes.body) || '(none)'}`);
    } else if (enPageRes.body.includes('hreflang="en"')) fail('incomplete EN HTML has hreflang en');
    else if (!enPageRes.body.includes(trText)) fail('incomplete EN HTML hid the Turkish fallback');
    else if (!enPageRes.body.includes('V4 Adım 8 Deneme')) fail('incomplete EN HTML hid the place name');
    else ok('GET /en/places/:slug incomplete: fallback text, noindex, no en hreflang');

    const trPageRes = await fetchText(`${base}/places/${slug}`);
    if (trPageRes.status !== 200) fail(`GET /places/${slug} HTTP ${trPageRes.status}`);
    else if (robotsOf(trPageRes.body) !== 'index,follow') fail(`TR robots: ${robotsOf(trPageRes.body)}`);
    else if (trPageRes.body.includes('hreflang="en"')) fail('TR HTML advertised en');
    else if (!trPageRes.body.includes('hreflang="tr"')) fail('TR HTML lost hreflang tr');
    else ok('GET /places/:slug stays indexable without an en hreflang');

    if (sample && sample.slug) {
      const readyRes = await fetchText(`${base}/en/places/${encodeURIComponent(sample.slug)}`);
      if (readyRes.status !== 200) fail(`GET /en/places/${sample.slug} HTTP ${readyRes.status}`);
      else if (robotsOf(readyRes.body) !== 'index,follow') {
        fail(`complete EN robots: ${robotsOf(readyRes.body)}`);
      } else if (!readyRes.body.includes('hreflang="en"')) fail('complete EN HTML lost hreflang en');
      else ok(`GET /en/places/${sample.slug} stays indexable`);
    } else ok('no published place with English copy to compare');

    if (log.includes('Migration: add column failed')) fail('column migration failed during boot');
  } finally {
    if (child) {
      child.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 200));
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
    }
    if (placeId) {
      await db.prepare('DELETE FROM places WHERE id = ? AND slug = ?').run(placeId, slug);
      const left = await db.prepare('SELECT id FROM places WHERE slug = ?').get(slug);
      if (left) fail('test place was not removed');
      else ok('test place removed');
    }
    await closePool();
  }
}

async function main() {
  try {
    await checkDatabase();
  } catch (err) {
    const message = String(err && err.message || err);
    const safe = /postgres(ql)?:\/\//i.test(message) ? 'veritabanı bağlantısı kurulamadı' : message;
    fail(safe);
  }
  if (failed) {
    console.error(`verify-v4-adim8-place-noindex: ${failed} failed`);
    process.exit(1);
  }
  console.log('verify-v4-adim8-place-noindex: ok');
}

main();
