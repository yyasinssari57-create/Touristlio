/**
 * V4 Adım 10 — performance: long cache where the URL is versioned,
 * hero slides after the first one stay off the first load,
 * Leaflet CSS loads with the map instead of the homepage.
 *
 * Usage: npm run verify:v4-adim10
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

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

console.log('verify-v4-adim10-perf');

const indexHtml = read('public/index.html');
const heroJs = read('public/js/hero-carousel.js');
const mapLoader = read('public/js/map-loader.js');
const storage = read('server/lib/supabase-storage.js');
const sender = read('server/lib/send-public-html.js');
const { staticAssetHeaders, DAY_CACHE, VERSIONED_ASSET_CACHE, HTML_NO_CACHE } = require('../middleware/static-cache');

if (/<link[^>]+href="\/vendor\/leaflet\/leaflet\.css/.test(indexHtml)) {
  fail('index.html still eager-loads Leaflet CSS');
} else ok('index.html does not eager-load Leaflet CSS');

if (!indexHtml.includes('/js/map-loader.js?v=')) fail('index.html lost map-loader.js');
else ok('map-loader.js still ships on the page');

if (!mapLoader.includes('/vendor/leaflet/leaflet.css')
  || !mapLoader.includes('MarkerCluster.css')
  || !mapLoader.includes('MarkerCluster.Default.css')
  || !mapLoader.includes('loadCss(')) {
  fail('map-loader does not inject Leaflet CSS');
} else ok('map-loader injects Leaflet CSS when ensure() runs');

for (const rel of [
  'public/vendor/leaflet/leaflet.css',
  'public/vendor/leaflet.markercluster/MarkerCluster.css',
  'public/vendor/leaflet.markercluster/MarkerCluster.Default.css',
]) {
  if (!fs.existsSync(path.join(ROOT, rel))) fail(`missing ${rel}`);
}
if (!failed) ok('Leaflet CSS files still on disk');

const eagerSlides = indexHtml.match(/<div class="hero-slide"(?![^>]*\bactive\b)[^>]*style=/g) || [];
if (eagerSlides.length) fail('a later hero slide still has an inline style');
else ok('later hero slides have no inline background');

if ((indexHtml.match(/data-bg="https:\/\/images\.unsplash\.com\//g) || []).length !== 4) {
  fail('expected 4 deferred Unsplash slides');
} else ok('4 later slides keep data-bg');

if (!/class="hero-slide hbg active"/.test(indexHtml)) fail('first slide is no longer .hbg.active');
else ok('first slide stays .hbg.active');

if (!indexHtml.includes('rel="preload" as="image" href="/images/hero.webp"')
  || !indexHtml.includes('fetchpriority="high"')) {
  fail('default hero preload lost fetchpriority=high');
} else ok('default hero preload stays high priority');

if (!heroJs.includes('PRELOAD_AFTER_LOAD_MS') || !heroJs.includes("addEventListener('load'")) {
  fail('hero-carousel does not wait for window load');
} else ok('later slides start downloading after window load');
if (!heroJs.includes('INTERVAL_MS = 5000')) fail('carousel interval changed');
else ok('carousel still advances every 5 seconds');

if (!storage.includes('OBJECT_CACHE_CONTROL')
  || !storage.includes('public, max-age=31536000, immutable')
  || !storage.includes('cacheControl: OBJECT_CACHE_CONTROL')) {
  fail('Supabase uploads do not set a long Cache-Control');
} else ok('new Supabase uploads send a 1-year Cache-Control');

if (!sender.includes('no-cache, no-store, must-revalidate')) fail('HTML no-store removed');
else ok('HTML stays no-store');
if (!sender.includes('fetchpriority="high"') || !sender.includes('tl-hero-bg')) {
  fail('custom hero no longer retargets the preload');
} else ok('custom hero preload follows the visible first image');

function headerOf(res, name) {
  return res.headers[String(name).toLowerCase()];
}
function fakeRes(url) {
  const headers = {};
  return {
    req: { url },
    headers,
    setHeader(key, value) { headers[String(key).toLowerCase()] = value; },
  };
}

const plainImg = fakeRes('/images/hero.webp');
staticAssetHeaders(plainImg, '/tmp/hero.webp');
if (headerOf(plainImg, 'cache-control') !== DAY_CACHE) {
  fail(`unversioned image cache ${headerOf(plainImg, 'cache-control')}`);
} else ok('unversioned /images stay at 1 day');

const versionedImg = fakeRes('/images/logo-round.webp?v=6');
staticAssetHeaders(versionedImg, '/tmp/logo-round.webp');
if (headerOf(versionedImg, 'cache-control') !== VERSIONED_ASSET_CACHE) {
  fail(`versioned image cache ${headerOf(versionedImg, 'cache-control')}`);
} else ok('image URLs with ?v= get 1-year immutable cache');

const htmlRes = fakeRes('/');
staticAssetHeaders(htmlRes, '/tmp/index.html');
if (headerOf(htmlRes, 'cache-control') !== HTML_NO_CACHE) fail('HTML header helper changed');
else ok('HTML helper still no-store');

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
  if (!/no-store/i.test(cacheControl(home.headers))) fail(`GET / cache ${cacheControl(home.headers)}`);
  else ok('GET / is no-store');
  if (/<link[^>]+rel="stylesheet"[^>]+href="[^"]*leaflet\.css/.test(home.body)) {
    fail('served homepage still includes Leaflet CSS');
  } else ok('served homepage has no Leaflet stylesheet');
  if (/<div class="hero-slide"[^>]*style="background-image/.test(home.body)) {
    fail('served homepage still eager-loads later slides');
  } else ok('served homepage does not eager-load later slides');
  if ((home.body.match(/data-bg="https:\/\/images\.unsplash\.com\//g) || []).length !== 4) {
    fail('served homepage lost deferred slide URLs');
  } else ok('served homepage keeps 4 data-bg slides');

  const heroBg = home.body.match(/id="tl-hero-bg"[^>]*>\.hbg\{background-image:url\("([^"]+)"\)/);
  const preload = home.body.match(/<link rel="preload" as="image" href="([^"]+)"[^>]*fetchpriority="high"/);
  if (!preload) fail('served homepage lost the high-priority image preload');
  else if (heroBg && preload[1] !== heroBg[1].replace(/&amp;/g, '&')) {
    fail(`preload ${preload[1]} does not match visible hero ${heroBg[1]}`);
  } else ok(heroBg ? 'custom hero preload matches the visible first image' : 'default hero preload kept');

  const css = await fetchText(`${base}/css/style.css`);
  if (css.status !== 200 || !/max-age=31536000/.test(cacheControl(css.headers))) {
    fail(`GET /css/style.css ${css.status} ${cacheControl(css.headers)}`);
  } else ok('GET /css/style.css is 1-year immutable');

  const js = await fetchText(`${base}/js/app.js`);
  if (js.status !== 200 || !/max-age=31536000/.test(cacheControl(js.headers))) {
    fail(`GET /js/app.js ${js.status} ${cacheControl(js.headers)}`);
  } else ok('GET /js/app.js is 1-year immutable');

  const img = await fetchText(`${base}/images/hero.webp`);
  if (img.status !== 200 || !/max-age=86400/.test(cacheControl(img.headers))) {
    fail(`GET /images/hero.webp ${img.status} ${cacheControl(img.headers)}`);
  } else ok('GET /images/hero.webp stays 1 day (stable filename)');

  const logo = await fetchText(`${base}/images/logo-round.webp?v=6`);
  if (logo.status !== 200 || !/max-age=31536000/.test(cacheControl(logo.headers))) {
    fail(`GET /images/logo-round.webp?v=6 ${logo.status} ${cacheControl(logo.headers)}`);
  } else ok('GET /images/logo-round.webp?v=6 is 1-year immutable');
}

(async () => {
  const port = process.env.VERIFY_V4_ADIM10_PORT || '3108';
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
  } catch (err) {
    fail(`local server: ${err.message}`);
  } finally {
    child.kill('SIGTERM');
  }

  if (failed) {
    console.error(`verify-v4-adim10-perf FAILED (${failed})`);
    process.exit(1);
  }
  console.log('verify-v4-adim10-perf OK');
})();
