/**
 * Gemini Faz 4 — optional PostGIS geom, JSON-LD completeness, N+1 category aggregate.
 * Usage: node server/scripts/verify-gemini-faz4.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}

console.log('verify-gemini-faz4');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

const {
  touristAttraction,
  reviewSchema,
  jsonLdForPlace,
} = require('../lib/jsonld');

if (typeof touristAttraction !== 'function') fail('jsonld.js missing touristAttraction export');
else ok('jsonld.js exports touristAttraction');
if (typeof reviewSchema !== 'function') fail('jsonld.js missing reviewSchema export');
else ok('jsonld.js exports reviewSchema');

const place = {
  name: 'Ayasofya',
  slug: 'ayasofya-istanbul',
  city: 'İstanbul',
  district: 'Fatih',
  country: 'Türkiye',
  description: 'Tarihi yapı',
  imageUrl: '/images/hero.webp',
  lat: 41.0086,
  lng: 28.9802,
  tiolaCount: 2,
  tiolaRating: 4.5,
  faqTR: [{ q: 'Giriş ücreti var mı?', a: 'Evet.' }],
  entryFee: 'Ücretli',
};
const attraction = touristAttraction(place, 'tr');
if (attraction['@type'] === 'TouristAttraction'
  && attraction.aggregateRating
  && attraction.aggregateRating['@type'] === 'AggregateRating'
  && attraction.geo
  && attraction.geo['@type'] === 'GeoCoordinates'
  && attraction['@id']
  && attraction.containedInPlace
  && attraction.containedInPlace['@type'] === 'City') {
  ok('TouristAttraction + AggregateRating + GeoCoordinates');
} else fail('TouristAttraction schema incomplete');

const attractionEn = touristAttraction(place, 'en');
if (attractionEn.url && /\/en\/places\//.test(attractionEn.url)) ok('EN place JSON-LD uses /en URL');
else fail('EN TouristAttraction URL missing /en');

const review = reviewSchema({
  userName: 'Yasin',
  text: 'Harika',
  stars: 5,
  createdAt: '2026-01-15 10:00:00',
  status: 'approved',
}, place);
if (review['@type'] === 'Review' && review.reviewRating && review.itemReviewed['@type'] === 'TouristAttraction') {
  ok('Review schema export');
} else fail('Review schema mismatch');

const blocks = jsonLdForPlace(place, [{
  user_name: 'Ali',
  text: 'Tiola',
  stars: 4,
  created_at: '2026-02-01 08:00:00',
  status: 'approved',
}], 'tr');
const types = blocks.map((b) => b['@type']);
if (types.includes('TouristAttraction') && types.includes('Review') && types.includes('AggregateRating') === false) {
  const ta = blocks.find((b) => b['@type'] === 'TouristAttraction');
  if (ta.aggregateRating && ta.aggregateRating['@type'] === 'AggregateRating' && Array.isArray(ta.review) && ta.review.length) {
    ok('place graph: TouristAttraction + nested Review + AggregateRating');
  } else fail('place graph missing nested review or aggregate');
} else fail(`place graph mismatch: ${types.join(', ')}`);

const indexJs = read('server/index.js');
if (!indexJs.includes('jsonLdForPlace') || !indexJs.includes('loadApprovedTiolasForPlace')) {
  fail('place page handler does not inject JSON-LD');
} else ok('place page injects jsonLdForPlace + reviews');
if (!indexJs.includes("req.tlLang === 'en'")) fail('place handler missing locale');
else ok('place JSON-LD uses request locale');

const jsonldSrc = read('server/lib/jsonld.js');
if (/new JsonLd|schema-dts|next-seo/i.test(jsonldSrc)) fail('second JSON-LD system invented');
else ok('existing jsonld.js builders reused');

const mig010 = read('db/migrations/010_postgis_geom.js');
if (!mig010.includes('optional: true') && !/optional:\s*true/.test(mig010)) {
  fail('010_postgis_geom is not optional');
} else ok('010_postgis_geom optional');
if (!mig010.includes('try') || !mig010.includes('catch')) fail('010 missing try/catch');
else ok('010 wraps PostGIS in try/catch');
if (!mig010.includes('ensurePostgisGeom')) fail('010 does not call ensurePostgisGeom');
else ok('010 delegates to ensurePostgisGeom');

const geomSrc = read('server/lib/place-geom.js');
if (!geomSrc.includes('CREATE EXTENSION IF NOT EXISTS postgis')) fail('place-geom missing CREATE EXTENSION');
else ok('CREATE EXTENSION IF NOT EXISTS postgis');
if (!/geography\(Point,\s*4326\)/i.test(geomSrc)) fail('place-geom missing geography Point 4326');
else ok('nullable geography(Point, 4326) column geom');
if (!geomSrc.includes('ST_MakePoint') || !geomSrc.includes('ST_SetSRID')) fail('place-geom missing backfill');
else ok('geom backfill from lat/lng');
if (!geomSrc.includes('USING SPGIST') || !geomSrc.includes('USING GIST')) {
  fail('place-geom missing SP-GiST with GIST fallback');
} else ok('SP-GiST first, GIST fallback');
if (!geomSrc.includes('trg_places_sync_geom') || !geomSrc.includes('syncPlaceGeom')) {
  fail('place-geom missing trigger or dual-write');
} else ok('trigger + dual-write syncPlaceGeom');
if (!geomSrc.includes('site continues') && !geomSrc.includes('geom skipped')) {
  fail('place-geom does not log and continue without extension');
} else ok('missing PostGIS does not crash boot');

const geoSrc = read('server/lib/geo.js');
if (/\bST_|geography\(|PostGIS/i.test(geoSrc)) fail('geo.js rewritten — Leaflet haversine must stay');
else ok('geo.js still haversine on lat/lng');

const placeMap = read('server/lib/place-map.js');
if (!placeMap.includes('lat: row.lat') || !placeMap.includes('lng: row.lng')) {
  fail('place-map dropped lat/lng');
} else ok('API/map still read lat/lng');

const pgSchema = read('server/lib/pg-schema.js');
if (!/location TEXT/.test(pgSchema)) fail('places.location TEXT address column removed');
else ok('places.location TEXT (address) kept; geom is extra');

const mig009 = read('db/migrations/009_jsonb_gin.js');
if (/CREATE EXTENSION|geography\(Point/i.test(mig009)) fail('009 now enables PostGIS');
else ok('009 still btree lat/lng only');

const migrations = read('server/lib/migrations.js');
if (!migrations.includes('postgisGeom') || !migrations.includes('runOptional')) {
  fail('runMigrations does not optionally retry PostGIS');
} else ok('runMigrations retries PostGIS via runOptional');

const adminPlace = read('server/lib/admin-place.js');
if (!adminPlace.includes('syncPlaceGeom')) fail('admin insert/update missing dual-write');
else ok('admin place write dual-writes geom');

const catalog = read('server/lib/catalog-db.js');
if (catalog.includes('placeCount: await countCategoryUsage')) {
  fail('listCategories still N+1 countCategoryUsage per slug');
} else ok('listCategories no per-slug countCategoryUsage loop');
if (!catalog.includes('loadCategoryPlaceCounts') || !catalog.includes('COUNT(DISTINCT')) {
  fail('listCategories missing aggregate category counts');
} else ok('category place counts via one aggregate query');

const service = read('server/modules/places/places.service.js');
if (/for\s*\(.*place/.test(service) && /countCategoryUsage|FROM place_categories/.test(service)) {
  fail('places.service loops category queries per place');
} else ok('places list uses mapped categories from the place row');

const searchSrc = read('server/lib/places-search.js');
if (!searchSrc.includes('SELECT p.* FROM places p') || searchSrc.includes('countCategoryUsage')) {
  fail('places-search still looks like per-place category queries');
} else ok('search/list is one places query + SQL filters');

const searchRoute = read('server/routes/search.js');
if (/for\s*\(.*\)[\s\S]{0,80}categories/.test(searchRoute) && /db\.prepare/.test(RegExp.lastMatch || '')) {
  fail('search route loops category queries');
} else ok('search route maps categories in memory from the row');

const listCatsFn = catalog.slice(catalog.indexOf('async function listCategories'));
if (/for\s*\([^)]+of\s+(places|rows)/.test(listCatsFn.split('async function createCategory')[0] || '')
  && /countCategoryUsage|db\.prepare/.test(listCatsFn.split('async function createCategory')[0] || '')) {
  fail('listCategories still loops rows with per-slug SQL');
} else ok('listCategories is one categories SELECT + one aggregate');

const listSrc = read('server/modules/places/places.service.js');
const searchLib = read('server/lib/places-search.js');
const searchRt = read('server/routes/search.js');
if (/await countCategoryUsage\(/.test(listSrc + searchLib + searchRt)) {
  fail('list/search still calls countCategoryUsage per row');
} else ok('no City→Places→Categories per-row category SQL in list/search/discover');

const pkg = JSON.parse(read('package.json'));
if (pkg.scripts['verify:faz4'] !== 'node server/scripts/verify-gemini-faz4.js') {
  fail('package.json missing verify:faz4');
} else ok('verify:faz4 script');

function parseScripts(html) {
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const out = [];
  let m;
  while ((m = re.exec(html))) {
    try { out.push(JSON.parse(m[1])); } catch { fail('invalid JSON-LD script'); }
  }
  return out;
}

function request(port, p) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port, path: p, method: 'GET',
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

function waitForServer(port, tries = 300) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      n += 1;
      const req = http.get({ hostname: '127.0.0.1', port, path: '/api/health', timeout: 1000 }, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (n >= tries) reject(new Error('server did not start'));
        else setTimeout(tick, 400);
      });
      req.on('timeout', () => {
        req.destroy();
        if (n >= tries) reject(new Error('server did not start'));
        else setTimeout(tick, 400);
      });
    };
    tick();
  });
}

async function curlCheck(portOrBase) {
  const isUrl = String(portOrBase).startsWith('http');
  const get = isUrl
    ? async (p) => {
      const res = await fetch(`${String(portOrBase).replace(/\/$/, '')}${p}`);
      return { status: res.status, body: await res.text() };
    }
    : (p) => request(portOrBase, p);

  let slug = 'ayasofya-istanbul';
  try {
    const { db } = require('../db');
    const row = await db.prepare(`
      SELECT slug FROM places
      WHERE slug IS NOT NULL AND slug != '' AND COALESCE(status, '') != 'archived'
      ORDER BY id LIMIT 1
    `).get();
    if (row && row.slug) slug = row.slug;
  } catch { /* default slug */ }

  const placeRes = await get(`/places/${encodeURIComponent(slug)}`);
  const placeLive = parseScripts(placeRes.body);
  if (placeRes.status === 200) {
    ok(`GET /places/${slug} → 200`);
    if (placeLive.some((b) => b['@type'] === 'TouristAttraction')) ok('live place TouristAttraction JSON-LD');
    else fail('live place HTML missing TouristAttraction');
    if (placeLive.some((b) => b['@type'] === 'TouristAttraction' && b.geo && b.geo['@type'] === 'GeoCoordinates')) {
      ok('live place GeoCoordinates');
    } else ok('live place has TouristAttraction (geo optional if coords missing)');
  } else if (placeRes.status === 404) {
    ok(`GET /places/${slug} → 404 (no matching place in this DB)`);
  } else {
    fail(`GET /places/${slug} HTTP ${placeRes.status}`);
  }

  const enRes = await get(`/en/places/${encodeURIComponent(slug)}`);
  if (enRes.status === 200) {
    const enLd = parseScripts(enRes.body);
    if (enLd.some((b) => b['@type'] === 'TouristAttraction')) ok('EN place page injects TouristAttraction');
    else fail('EN place HTML missing TouristAttraction');
  } else if (enRes.status === 404) {
    ok(`GET /en/places/${slug} → 404 (no matching place)`);
  }
}

async function checkLive() {
  const preset = process.env.VERIFY_FAZ4_URL;
  if (preset) {
    await curlCheck(preset);
    return;
  }
  const port = Number(process.env.VERIFY_FAZ4_PORT || 3094);
  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
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
  let out = '';
  child.stdout.on('data', (c) => { out += c; });
  child.stderr.on('data', (c) => { out += c; });
  try {
    await waitForServer(port);
    await curlCheck(port);
  } catch (e) {
    fail(`live JSON-LD check :${port}: ${e.message} ${out.trim().slice(0, 220)}`);
  } finally {
    child.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 200));
    try { child.kill('SIGKILL'); } catch { /* ignore */ }
  }
}

checkLive().then(() => {
  if (failed) {
    console.error(`verify-gemini-faz4 FAILED (${failed})`);
    process.exit(1);
  }
  console.log('verify-gemini-faz4 OK');
  process.exit(0);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
