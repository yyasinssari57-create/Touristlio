/**
 * Gemini Faz 3 — Core Web Vitals: map lazy-load, already-split JS, public places cache.
 * Usage: node server/scripts/verify-gemini-faz3.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}

console.log('verify-gemini-faz3');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

const indexHtml = read('public/index.html');
const mapLoader = read('public/js/map-loader.js');
const appJs = read('public/js/app.js');
const discoverJs = read('public/js/discover-places.js');
const cacheJs = read('server/lib/cache.js');
const staticCache = read('server/middleware/static-cache.js');
const placesService = read('server/modules/places/places.service.js');

if (/React\.lazy|from ['"]react['"]|require\(['"]react['"]\)/.test(indexHtml + appJs + mapLoader)) {
  fail('React added (forbidden on this stack)');
} else ok('no React / React.lazy');

if (/<script[^>]+src="\/vendor\/leaflet\/leaflet\.js/.test(indexHtml)
  || /<script[^>]+src="\/js\/map\.js/.test(indexHtml)
  || /<script[^>]+src="\/js\/map-discover\.js/.test(indexHtml)) {
  fail('Leaflet / map.js still eager on homepage');
} else ok('homepage does not eager-load Leaflet or map.js');

if (!indexHtml.includes('/vendor/leaflet/leaflet.css')
  || !indexHtml.includes('/vendor/leaflet.markercluster/MarkerCluster.css')) {
  fail('Leaflet CSS removed from homepage (would layout-shift)');
} else ok('Leaflet CSS stays in head');

if (!indexHtml.includes('/js/map-loader.js?v=')) fail('index.html missing map-loader.js');
else ok('index.html loads map-loader.js');

if (!mapLoader.includes('import(') || !mapLoader.includes('/js/map.js') || !mapLoader.includes('leaflet.js')) {
  fail('map-loader missing dynamic import() / Leaflet path');
} else ok('map-loader uses import() after classic Leaflet');

if (!appJs.includes('ensureMapLibs') || !appJs.includes('TL_MAP_LOADER')) {
  fail('app.js does not wait for map-loader');
} else ok('app.js waits for map-loader on map tab / detail');

if (!discoverJs.includes('TL_MAP_LOADER') || !discoverJs.includes('ensureMapLibs')) {
  fail('discover-places.js does not lazy-load the map');
} else ok('discover map waits for map-loader');

if (/supercluster|maplibre|mapbox-gl/i.test(indexHtml + mapLoader + appJs)) {
  fail('Supercluster / MapLibre rewrite landed');
} else ok('MarkerCluster kept (no Supercluster rewrite)');

if (!staticCache.includes('PLACES_PUBLIC_GET_CACHE')
  || !staticCache.includes('stale-while-revalidate=120')
  || !staticCache.includes('isPublicPlacesListGet')) {
  fail('static-cache missing public GET /api/places exception');
} else ok('API no-store has narrow places GET exception');

if (!cacheJs.includes('REDIS_URL') || !cacheJs.includes('PLACES_TTL_MS') || !cacheJs.includes('redisSet')) {
  fail('cache.js missing Redis fallback / 30s places TTL');
} else ok('in-memory + optional Redis wrap (30s)');

if (!placesService.includes('places-markers-') || !placesService.includes('PLACES_TTL_MS')) {
  fail('listMarkers not wrapped in short TTL cache');
} else ok('markers list uses short TTL cache');
if (!placesService.includes("clear('search:") && !placesService.includes('clear("search:')) {
  fail('place writes do not drop search cache');
} else ok('invalidatePlacesCache drops list/markers/search');

const pkg = JSON.parse(read('package.json'));
if (pkg.scripts['verify:faz3'] !== 'node server/scripts/verify-gemini-faz3.js') {
  fail('package.json missing verify:faz3');
} else ok('verify:faz3 script');

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 10000 }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function waitForServer(base, max = 400) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      fetchText(`${base}/api/health`).then((r) => {
        if (r.status && r.status < 500) resolve();
        else retry();
      }).catch(retry);
    };
    function retry() {
      n += 1;
      if (n > max) reject(new Error('server did not start'));
      else setTimeout(tick, 200);
    }
    tick();
  });
}

function cacheControl(headers) {
  return String(headers['cache-control'] || '');
}

async function checkLive(base) {
  const home = await fetchText(`${base}/`);
  if (home.status !== 200) fail(`GET / HTTP ${home.status}`);
  else ok('GET / 200');
  if (/<script[^>]+src="[^"]*\/vendor\/leaflet\/leaflet\.js/.test(home.body)) {
    fail('live homepage still has eager leaflet.js');
  } else ok('live homepage has no eager leaflet.js');
  if (!home.body.includes('/js/map-loader.js')) fail('live homepage missing map-loader.js');
  else ok('live homepage includes map-loader.js');
  if (!home.body.includes('/vendor/leaflet/leaflet.css')) fail('live homepage dropped Leaflet CSS');
  else ok('live homepage still has Leaflet CSS');

  const places = await fetchText(`${base}/api/places?limit=1`);
  const placesCc = cacheControl(places.headers);
  if (places.status >= 200 && places.status < 400) {
    if (!/max-age=30/i.test(placesCc) || !/stale-while-revalidate=120/i.test(placesCc)) {
      fail(`GET /api/places Cache-Control=${placesCc} HTTP ${places.status}`);
    } else ok('GET /api/places Cache-Control public max-age=30 swr=120');
  } else if (!/\bno-store\b/i.test(placesCc)) {
    fail(`GET /api/places HTTP ${places.status} Cache-Control=${placesCc}`);
  } else ok('GET /api/places error stays no-store');

  const markers = await fetchText(`${base}/api/places/map/markers`);
  const markersCc = cacheControl(markers.headers);
  if (markers.status >= 200 && markers.status < 400) {
    if (!/max-age=30/i.test(markersCc)) fail(`GET markers Cache-Control=${markersCc}`);
    else ok('GET /api/places/map/markers cached');
  } else if (!/\bno-store\b/i.test(markersCc)) {
    fail(`GET markers HTTP ${markers.status} Cache-Control=${markersCc}`);
  } else ok('GET markers error stays no-store');

  const search = await fetchText(`${base}/api/places/search?q=istanbul`);
  const searchCc = cacheControl(search.headers);
  if (search.status >= 200 && search.status < 400) {
    if (!/max-age=30/i.test(searchCc)) fail(`GET search Cache-Control=${searchCc}`);
    else ok('GET /api/places/search cached');
  } else if (!/\bno-store\b/i.test(searchCc)) {
    fail(`GET search HTTP ${search.status} Cache-Control=${searchCc}`);
  } else ok('GET /api/places/search error stays no-store');

  const health = await fetchText(`${base}/api/health`);
  if (!/\bno-store\b/i.test(cacheControl(health.headers))) {
    fail(`GET /api/health Cache-Control=${cacheControl(health.headers)}`);
  } else ok('GET /api/health still no-store');

  const saved = await fetchText(`${base}/api/places/saved/all`);
  if (!/\bno-store\b/i.test(cacheControl(saved.headers))) {
    fail(`GET /api/places/saved/all Cache-Control=${cacheControl(saved.headers)}`);
  } else ok('GET /api/places/saved/all still no-store');
}

(async () => {
  const external = process.env.VERIFY_FAZ3_URL;
  if (external) {
    await checkLive(external.replace(/\/$/, ''));
  } else {
    const port = process.env.VERIFY_FAZ3_PORT || '3073';
    const base = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: port,
        NODE_ENV: 'development',
        SITEMAP_ON_START: 'false',
        LIVE_DATA_CRON: 'false',
      },
      stdio: 'ignore',
    });
    try {
      await waitForServer(base);
      await checkLive(base);
    } catch (e) {
      fail('local server: ' + e.message);
    } finally {
      child.kill('SIGTERM');
    }
  }

  const cache = spawnSync(process.execPath, [path.join(ROOT, 'server/scripts/verify-cache-headers.js')], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, VERIFY_CACHE_PORT: '3074' },
  });
  if (cache.status !== 0) {
    fail(`verify:cache failed\n${(cache.stdout + cache.stderr).slice(0, 800)}`);
  } else ok('verify:cache passed');

  if (failed) {
    console.error(`verify-gemini-faz3 FAILED (${failed})`);
    process.exit(1);
  }
  console.log('verify-gemini-faz3 OK');
})();
