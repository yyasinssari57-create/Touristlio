/**
 * [v2 DÜŞÜK-2] Cache-Control: HTML/API no-store, versioned JS/CSS long cache, uploads.
 * Usage: npm run verify:cache
 * Optional: VERIFY_CACHE_URL=http://127.0.0.1:3068 npm run verify:cache
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const {
  staticAssetHeaders,
  apiNoStoreHeaders,
  isPublicPlacesListGet,
  HTML_NO_CACHE,
  API_NO_STORE,
  PLACES_PUBLIC_GET_CACHE,
  VERSIONED_ASSET_CACHE,
  DAY_CACHE,
} = require('../middleware/static-cache');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}

console.log('verify-cache-headers');

function fakeRes() {
  const headers = {};
  return {
    headers,
    setHeader(name, value) { headers[String(name).toLowerCase()] = String(value); },
  };
}

function headerOf(res, name) {
  return String(res.headers[String(name).toLowerCase()] || '');
}

const htmlRes = fakeRes();
staticAssetHeaders(htmlRes, '/tmp/index.html');
if (headerOf(htmlRes, 'Cache-Control') !== HTML_NO_CACHE) {
  fail(`HTML Cache-Control: ${headerOf(htmlRes, 'Cache-Control')}`);
} else ok('HTML static: no-store');

const jsRes = fakeRes();
staticAssetHeaders(jsRes, '/tmp/app.js');
if (headerOf(jsRes, 'Cache-Control') !== VERSIONED_ASSET_CACHE) {
  fail(`JS Cache-Control: ${headerOf(jsRes, 'Cache-Control')}`);
} else ok('JS: 1y immutable (versioned ?v=)');

const cssRes = fakeRes();
staticAssetHeaders(cssRes, '/tmp/style.css');
if (headerOf(cssRes, 'Cache-Control') !== VERSIONED_ASSET_CACHE) {
  fail(`CSS Cache-Control: ${headerOf(cssRes, 'Cache-Control')}`);
} else ok('CSS: 1y immutable (versioned ?v=)');

const imgRes = fakeRes();
staticAssetHeaders(imgRes, '/tmp/hero.webp');
if (headerOf(imgRes, 'Cache-Control') !== DAY_CACHE) {
  fail(`image Cache-Control: ${headerOf(imgRes, 'Cache-Control')}`);
} else ok('images: 1 day (hero not hashed)');

const apiRes = fakeRes();
let nextCalled = false;
apiNoStoreHeaders({}, apiRes, () => { nextCalled = true; });
if (headerOf(apiRes, 'Cache-Control') !== API_NO_STORE) {
  fail(`API middleware Cache-Control: ${headerOf(apiRes, 'Cache-Control')}`);
} else ok('API middleware: no-store');
if (!nextCalled) fail('apiNoStoreHeaders did not call next');
else ok('apiNoStoreHeaders calls next');

if (isPublicPlacesListGet({ method: 'GET', path: '/places' })
  && isPublicPlacesListGet({ method: 'GET', path: '/places/search' })
  && isPublicPlacesListGet({ method: 'GET', path: '/places/map/markers' })) {
  ok('public GET places list/search/markers allowlisted');
} else fail('isPublicPlacesListGet missed list/search/markers');
if (isPublicPlacesListGet({ method: 'POST', path: '/places' })
  || isPublicPlacesListGet({ method: 'GET', path: '/places/saved/all' })
  || isPublicPlacesListGet({ method: 'GET', path: '/places/42' })
  || isPublicPlacesListGet({ method: 'GET', path: '/health' })) {
  fail('isPublicPlacesListGet leaked auth/detail/other API');
} else ok('saved/detail/POST/other API stay off the places allowlist');

const placesMw = fakeRes();
placesMw.writeHead = function writeHead(code) {
  this.statusCode = code;
  return this;
};
apiNoStoreHeaders({ method: 'GET', path: '/places' }, placesMw, () => {});
if (typeof placesMw.writeHead !== 'function') fail('places GET middleware did not wrap writeHead');
else {
  placesMw.writeHead(200);
  if (headerOf(placesMw, 'Cache-Control') !== PLACES_PUBLIC_GET_CACHE) {
    fail(`places 200 Cache-Control: ${headerOf(placesMw, 'Cache-Control')}`);
  } else ok('public GET /places 200 → max-age=30 swr=120');
  placesMw.setHeader('Cache-Control', API_NO_STORE);
  placesMw.writeHead(500);
  if (headerOf(placesMw, 'Cache-Control') !== API_NO_STORE) {
    fail(`places 500 Cache-Control: ${headerOf(placesMw, 'Cache-Control')}`);
  } else ok('public GET /places 500 stays no-store');
}

const indexJs = fs.readFileSync(path.join(ROOT, 'server', 'index.js'), 'utf8');
if (!indexJs.includes('apiNoStoreHeaders')) fail('index.js missing apiNoStoreHeaders');
else ok('index.js mounts apiNoStoreHeaders');
if (!indexJs.includes('staticAssetHeaders')) fail('index.js missing staticAssetHeaders');
else ok('index.js uses staticAssetHeaders');

const uploadsJs = fs.readFileSync(path.join(ROOT, 'server', 'middleware', 'uploads-static.js'), 'utf8');
if (!uploadsJs.includes('Cache-Control') || !uploadsJs.includes('DAY_CACHE')) {
  fail('uploads-static missing Cache-Control');
} else ok('uploads-static sets Cache-Control');

const sender = fs.readFileSync(path.join(ROOT, 'server', 'lib', 'send-public-html.js'), 'utf8');
if (!sender.includes(HTML_NO_CACHE) && !sender.includes("no-cache, no-store, must-revalidate")) {
  fail('sendPublicHtml missing HTML no-cache headers');
} else ok('sendPublicHtml HTML no-cache');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
if (!pkg.scripts['verify:cache']) fail('package.json missing verify:cache');
else ok('verify:cache script');

function cacheControl(headers) {
  return String(headers['cache-control'] || '');
}

function hasNoStore(cc) {
  return /\bno-store\b/i.test(cc);
}

function maxAgeSeconds(cc) {
  const m = String(cc).match(/max-age=(\d+)/i);
  return m ? Number(m[1]) : 0;
}

function fetchHeaders(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 8000 }, (res) => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function waitForServer(base, max = 400) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      fetchHeaders(`${base}/api/health`).then((r) => {
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

async function checkLive(base) {
  const home = await fetchHeaders(`${base}/`);
  if (home.status !== 200) fail(`GET / HTTP ${home.status}`);
  else if (!hasNoStore(cacheControl(home.headers))) {
    fail(`GET / Cache-Control=${cacheControl(home.headers)}`);
  } else ok('GET / HTML no-store');

  const login = await fetchHeaders(`${base}/login`);
  if (login.status !== 200) fail(`GET /login HTTP ${login.status}`);
  else if (!hasNoStore(cacheControl(login.headers))) {
    fail(`GET /login Cache-Control=${cacheControl(login.headers)}`);
  } else ok('GET /login HTML no-store');

  const js = await fetchHeaders(`${base}/js/app.js`);
  if (js.status !== 200) fail(`GET /js/app.js HTTP ${js.status}`);
  else if (maxAgeSeconds(cacheControl(js.headers)) < 86400) {
    fail(`GET /js/app.js Cache-Control=${cacheControl(js.headers)}`);
  } else ok('GET /js/app.js cached');

  const css = await fetchHeaders(`${base}/css/style.css`);
  if (css.status !== 200) fail(`GET /css/style.css HTTP ${css.status}`);
  else if (maxAgeSeconds(cacheControl(css.headers)) < 86400) {
    fail(`GET /css/style.css Cache-Control=${cacheControl(css.headers)}`);
  } else ok('GET /css/style.css cached');

  const img = await fetchHeaders(`${base}/images/hero.webp`);
  if (img.status !== 200) fail(`GET /images/hero.webp HTTP ${img.status}`);
  else if (maxAgeSeconds(cacheControl(img.headers)) < 60) {
    fail(`GET /images/hero.webp Cache-Control=${cacheControl(img.headers)}`);
  } else ok('GET /images/hero.webp cached');

  const health = await fetchHeaders(`${base}/api/health`);
  if (!hasNoStore(cacheControl(health.headers))) {
    fail(`GET /api/health Cache-Control=${cacheControl(health.headers)}`);
  } else ok('GET /api/health no-store');

  const stats = await fetchHeaders(`${base}/api/stats`);
  if (!hasNoStore(cacheControl(stats.headers))) {
    fail(`GET /api/stats Cache-Control=${cacheControl(stats.headers)}`);
  } else ok('GET /api/stats no-store');

  const cfg = await fetchHeaders(`${base}/api/config/public`);
  if (!hasNoStore(cacheControl(cfg.headers))) {
    fail(`GET /api/config/public Cache-Control=${cacheControl(cfg.headers)}`);
  } else ok('GET /api/config/public no-store');

  const places = await fetchHeaders(`${base}/api/places?limit=1`);
  const placesCc = cacheControl(places.headers);
  if (places.status >= 200 && places.status < 400) {
    if (!/max-age=30/i.test(placesCc) || !/stale-while-revalidate=120/i.test(placesCc)) {
      fail(`GET /api/places Cache-Control=${placesCc}`);
    } else ok('GET /api/places public max-age=30 swr=120');
  } else if (!hasNoStore(placesCc)) {
    fail(`GET /api/places HTTP ${places.status} Cache-Control=${placesCc}`);
  } else ok('GET /api/places error stays no-store');

  const saved = await fetchHeaders(`${base}/api/places/saved/all`);
  if (!hasNoStore(cacheControl(saved.headers))) {
    fail(`GET /api/places/saved/all Cache-Control=${cacheControl(saved.headers)}`);
  } else ok('GET /api/places/saved/all no-store');

  const sitemap = await fetchHeaders(`${base}/sitemap.xml`);
  if (sitemap.status !== 200) fail(`GET /sitemap.xml HTTP ${sitemap.status}`);
  else if (maxAgeSeconds(cacheControl(sitemap.headers)) < 60) {
    fail(`GET /sitemap.xml Cache-Control=${cacheControl(sitemap.headers)}`);
  } else ok('GET /sitemap.xml cached');

  const robots = await fetchHeaders(`${base}/robots.txt`);
  if (robots.status !== 200) fail(`GET /robots.txt HTTP ${robots.status}`);
  else if (maxAgeSeconds(cacheControl(robots.headers)) < 60) {
    fail(`GET /robots.txt Cache-Control=${cacheControl(robots.headers)}`);
  } else ok('GET /robots.txt cached');
}

(async () => {
  const external = process.env.VERIFY_CACHE_URL;
  if (external) {
    await checkLive(external.replace(/\/$/, ''));
  } else {
    const port = process.env.VERIFY_CACHE_PORT || '3068';
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

  if (failed) {
    console.error(`verify-cache-headers: ${failed} failed`);
    process.exit(1);
  }
  console.log('verify-cache-headers: ok');
})();
