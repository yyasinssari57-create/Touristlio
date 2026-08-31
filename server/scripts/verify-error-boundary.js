/**
 * [YÜKSEK-6] Vanilla error boundary: global handlers, fallback copy, section zones, 500 page.
 * Usage: node server/scripts/verify-error-boundary.js
 * Optional: VERIFY_ERRORS_URL=http://127.0.0.1:3046 node server/scripts/verify-error-boundary.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const {
  injectClientErrorBoundary,
  injectErrorDetail,
} = require('../lib/send-public-html');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}

console.log('verify-error-boundary');

const ebPath = path.join(ROOT, 'public', 'js', 'error-boundary.js');
const eb = fs.readFileSync(ebPath, 'utf8');
if (!eb.includes('addEventListener(\'error\'') && !eb.includes('addEventListener("error"')) {
  fail('error-boundary.js must listen for window error');
} else ok('window error listener');
if (!eb.includes('unhandledrejection')) fail('missing unhandledrejection handler');
else ok('unhandledrejection handler');
if (!eb.includes('Bir şeyler ters gitti')) fail('missing fallback title copy');
else ok('fallback title copy');
if (!eb.includes('Ana Sayfaya Dön')) fail('missing home CTA copy');
else ok('home CTA copy');
if (!eb.includes('Sayfayı Yenile')) fail('missing reload CTA copy');
else ok('reload CTA copy');
if (!eb.includes('isDev') || !eb.includes('tl-error-detail')) fail('dev-only error detail missing');
else ok('dev-only error detail gated');
if (!eb.includes("showSection") || !eb.includes("data-error-boundary")) {
  fail('section fallback API missing');
} else ok('section fallback API');
if (!eb.includes("capture('map'") && !eb.includes("zone === 'map'") && !eb.includes("'map'")) {
  fail('map zone not referenced');
} else ok('map / tiolas / form zones present');
['map', 'tiolas', 'form'].forEach((z) => {
  if (!eb.includes(`'${z}'`) && !eb.includes(`"${z}"`)) fail(`zone ${z} missing`);
  else ok(`zone ${z} referenced`);
});

const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
if (!html.includes('/js/error-boundary.js')) fail('index.html does not load error-boundary.js');
else ok('index.html loads error-boundary.js');
const firstScript = html.match(/<script\b[^>]*src="([^"]+)"/);
if (!firstScript || !firstScript[1].includes('error-boundary.js')) {
  fail(`first script src should be error-boundary.js, got ${firstScript && firstScript[1]}`);
} else ok('error-boundary.js is the first script');

function hasZone(attr) {
  return html.includes(`data-error-boundary="${attr}"`);
}
if (!hasZone('map')) fail('index.html missing data-error-boundary="map"');
else ok('map ErrorBoundary wrap');
if (!hasZone('tiolas')) fail('index.html missing data-error-boundary="tiolas"');
else ok('tiolas ErrorBoundary wrap');
if (!hasZone('form')) fail('index.html missing data-error-boundary="form"');
else ok('form ErrorBoundary wrap');

const five = fs.readFileSync(path.join(ROOT, 'public', '500.html'), 'utf8');
if (!five.includes('Bir şeyler ters gitti')) fail('500.html missing friendly title');
else ok('500.html friendly title');
if (!five.includes('Ana Sayfaya Dön')) fail('500.html missing home button');
else ok('500.html home button');
if (!five.includes('Sayfayı Yenile')) fail('500.html missing reload button');
else ok('500.html reload button');
if (!five.includes('<!-- TL_ERROR_DETAIL -->')) fail('500.html missing error-detail token');
else ok('500.html error-detail token');

const contact = fs.readFileSync(path.join(ROOT, 'public', 'legal', 'contact.html'), 'utf8');
if (!contact.includes('data-error-boundary="form"')) fail('contact form not wrapped');
else ok('contact form wrapped');

const sendSrc = fs.readFileSync(path.join(ROOT, 'server', 'lib', 'send-public-html.js'), 'utf8');
if (!sendSrc.includes('injectClientErrorBoundary')) fail('send-public-html missing inject');
else ok('send-public-html injects error-boundary');

const idxSrc = fs.readFileSync(path.join(ROOT, 'server', 'index.js'), 'utf8');
if (!idxSrc.includes("500.html") || !idxSrc.includes('errorDetail')) {
  fail('Express 500 handler must pass errorDetail');
} else ok('Express 500 handler injects errorDetail');
if (!idxSrc.includes('/__error-test')) fail('missing dev 500 test route');
else ok('dev 500 test route');

const sample = '<html lang="tr"><head></head><body></body></html>';
const injected = injectClientErrorBoundary(sample);
if (!injected.includes('data-tl-dev=')) fail('inject did not set data-tl-dev');
else ok('inject sets data-tl-dev');
if (!injected.includes('/js/error-boundary.js')) fail('inject did not add script');
else ok('inject adds error-boundary.js');
const twice = injectClientErrorBoundary(injected);
const count = (twice.match(/error-boundary\.js/g) || []).length;
if (count !== 1) fail(`script injected ${count} times`);
else ok('inject is idempotent');

const withToken = '<div><!-- TL_ERROR_DETAIL --></div>';
const prevEnv = process.env.NODE_ENV;
process.env.NODE_ENV = 'development';
const detailed = injectErrorDetail(withToken, 'TypeError: boom\n    at x');
if (!detailed.includes('TypeError: boom') || !detailed.includes('tl-server-error-detail')) {
  fail('dev injectErrorDetail should render stack');
} else ok('dev 500 includes error detail');
process.env.NODE_ENV = 'production';
const stripped = injectErrorDetail(withToken, 'TypeError: boom');
if (stripped.includes('TypeError: boom')) fail('production 500 leaked stack');
else ok('production 500 strips error detail');
process.env.NODE_ENV = prevEnv;

const mapJs = fs.readFileSync(path.join(ROOT, 'public', 'js', 'map.js'), 'utf8');
if (!mapJs.includes("capture('map'") && !mapJs.includes("captureMapError")) {
  fail('map.js does not capture into map boundary');
} else ok('map.js captures map errors');

const appJs = fs.readFileSync(path.join(ROOT, 'public', 'js', 'app.js'), 'utf8');
if (!appJs.includes("capture('tiolas'")) fail('app.js does not capture tiola errors');
else ok('app.js captures tiola errors');
if (!appJs.includes("capture('form'")) fail('app.js does not capture form errors');
else ok('app.js captures form errors');
if (!appJs.includes('TL_ERROR_BOUNDARY') || !appJs.includes('init().catch')) {
  fail('app.js init is not guarded');
} else ok('app.js init is guarded');

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 10000 }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function waitForServer(url, tries) {
  const max = tries || 40;
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      n += 1;
      const req = http.get(url, { timeout: 1000 }, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (n >= max) reject(new Error('server did not start'));
        else setTimeout(tick, 150);
      });
      req.on('timeout', () => {
        req.destroy();
        if (n >= max) reject(new Error('server did not start'));
        else setTimeout(tick, 150);
      });
    };
    tick();
  });
}

async function checkLive(base) {
  const root = base.replace(/\/$/, '');
  const home = await fetchText(`${root}/`);
  if (home.status !== 200) fail(`GET / HTTP ${home.status}`);
  else ok('GET / HTTP 200');
  if (!home.body.includes('/js/error-boundary.js')) fail('served index missing error-boundary.js');
  else ok('served index includes error-boundary.js');
  if (!/data-tl-dev="1"/.test(home.body) && !home.body.includes('data-tl-dev=\'1\'')) {
    fail('served index missing data-tl-dev=1 in development');
  } else ok('served index data-tl-dev=1');
  if (!home.body.includes('data-error-boundary="map"')) fail('served index missing map wrap');
  else ok('served map wrap');

  const errPage = await fetchText(`${root}/__error-test`);
  if (errPage.status !== 500) fail(`GET /__error-test HTTP ${errPage.status}, expected 500`);
  else ok('GET /__error-test HTTP 500');
  if (!errPage.body.includes('Bir şeyler ters gitti')) fail('500 body missing friendly title');
  else ok('500 body friendly title');
  if (!errPage.body.includes('Ana Sayfaya Dön')) fail('500 body missing home CTA');
  else ok('500 body home CTA');
  if (!errPage.body.includes('Sayfayı Yenile')) fail('500 body missing reload CTA');
  else ok('500 body reload CTA');
  if (!errPage.body.includes('YÜKSEK-6 test 500')) fail('dev 500 missing error detail');
  else ok('dev 500 shows error detail');

  const overlay = await fetchText(`${root}/?tl_error_test=global`);
  if (overlay.status !== 200) fail(`GET /?tl_error_test=global HTTP ${overlay.status}`);
  else ok('self-test query is served');
  if (!overlay.body.includes('tl_error_test') && !overlay.body.includes('maybeSelfTest') && !overlay.body.includes('error-boundary.js')) {
    fail('self-test page missing error-boundary');
  } else ok('self-test page loads error-boundary');
}

async function withServer(fn) {
  const given = process.env.VERIFY_ERRORS_URL;
  if (given) {
    await fn(given);
    return;
  }
  const port = process.env.VERIFY_ERRORS_PORT || '3046';
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
  let stderr = '';
  child.stderr.on('data', (c) => { stderr += c; });
  const base = `http://127.0.0.1:${port}`;
  try {
    await waitForServer(base, 50);
    await fn(base);
  } catch (e) {
    fail(`live server: ${e.message}${stderr ? ` (${stderr.slice(0, 200)})` : ''}`);
  } finally {
    child.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 200));
    try { child.kill('SIGKILL'); } catch { /* ignore */ }
  }
}

withServer(checkLive).then(() => {
  if (failed) {
    console.error(`verify-error-boundary: ${failed} failed`);
    process.exit(1);
  }
  console.log('verify-error-boundary: ok');
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
