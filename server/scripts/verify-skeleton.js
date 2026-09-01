/**
 * [DÜŞÜK-3] Loading states: place-card skeletons + button spinner.
 * Usage: node server/scripts/verify-skeleton.js
 * Optional: VERIFY_SKELETON_URL=http://127.0.0.1:3063 node server/scripts/verify-skeleton.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}

console.log('verify-skeleton');

const css = fs.readFileSync(path.join(ROOT, 'public', 'css', 'style.css'), 'utf8');
const skJs = fs.readFileSync(path.join(ROOT, 'public', 'js', 'skeleton.js'), 'utf8');
const appJs = fs.readFileSync(path.join(ROOT, 'public', 'js', 'app.js'), 'utf8');
const i18n = fs.readFileSync(path.join(ROOT, 'public', 'js', 'i18n.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const searchHtml = fs.readFileSync(path.join(ROOT, 'public', 'search.html'), 'utf8');
const loginHtml = fs.readFileSync(path.join(ROOT, 'public', 'login.html'), 'utf8');
const contactHtml = fs.readFileSync(path.join(ROOT, 'public', 'legal', 'contact.html'), 'utf8');

if (!css.includes('.btn-spinner') || !css.includes('@keyframes btn-spin')) {
  fail('CSS missing button spinner');
} else ok('button spinner CSS');

if (!css.includes('.sk-shimmer') || !css.includes('var(--l2)')) {
  fail('skeleton shimmer missing palette colors');
} else ok('skeleton uses --l2 palette');

if (!css.includes('rgba(110,198,255') && !css.includes('var(--brand-accent)')) {
  fail('skeleton highlight not palette-aligned');
} else ok('skeleton highlight uses brand accent');

if (!css.includes('prefers-reduced-motion')) fail('missing reduced-motion for skeleton/spinner');
else ok('prefers-reduced-motion respected');

if (!skJs.includes('function card') || !skJs.includes('function button') || !skJs.includes('fillCards')) {
  fail('skeleton.js missing card / button / fillCards');
} else ok('skeleton.js helpers');

if (!skJs.includes('aria-busy') || !skJs.includes('btn-spinner')) {
  fail('skeleton.js missing aria-busy or spinner markup');
} else ok('skeleton.js busy + spinner markup');

const sandbox = { window: {}, localStorage: { getItem: () => 'tr' } };
sandbox.window = sandbox;
vm.runInNewContext(skJs, sandbox);
const api = sandbox.window.TL_SKELETON;
if (!api || typeof api.card !== 'function' || typeof api.button !== 'function') {
  fail('TL_SKELETON did not export card/button');
} else {
  const html = api.card(3);
  const n = (html.match(/class="pc sk/g) || []).length;
  if (n !== 3) fail(`card(3) rendered ${n} cards`);
  else ok('card(3) renders 3 place skeletons');
  if (!html.includes('sk-shimmer') || !html.includes('sk-block')) fail('card HTML missing shimmer blocks');
  else ok('card HTML has shimmer blocks');
}

if (!appJs.includes('showGridSkeleton') || !appJs.includes('fillCards')) {
  fail('app.js does not show grid skeleton during API');
} else ok('explore grid uses skeleton during API');

if (!appJs.includes('toggleSave') || !appJs.includes("button(btn, true, { replace: true })")) {
  fail('favorite toggle missing spinner');
} else ok('favorite button spinner');

if (!appJs.includes('doLoginSubmit') || !appJs.includes("button(btn, true)")) {
  fail('form submit missing spinner wiring');
} else ok('form submit spinner wiring in app.js');

if (!appJs.includes('postTiola') || !appJs.includes('rfSendBtn')) {
  fail('Tiola submit missing spinner');
} else ok('Tiola submit spinner');

if (!indexHtml.includes('skeleton.js') || !indexHtml.includes('id="pgrid"')) {
  fail('index missing skeleton.js or pgrid');
} else ok('index loads skeleton.js');

if (!searchHtml.includes('skeleton.js') || !searchHtml.includes('fillCards')) {
  fail('search page missing skeleton during fetch');
} else ok('search page skeleton during API');

if (!loginHtml.includes('skeleton.js') || !loginHtml.includes('loginSubmit')) {
  fail('login.html missing spinner hook');
} else ok('login.html spinner hook');

if (!contactHtml.includes('skeleton.js') || !contactHtml.includes('TL_SKELETON')) {
  fail('contact form missing spinner');
} else ok('contact form spinner');

if (!i18n.includes('loadingAria:') || !i18n.includes('Loading')) {
  fail('i18n missing loadingAria TR/EN');
} else ok('i18n loadingAria');

const googleLeak = /google\s*rating|googleRating|aggregateRating.*google/i;
if (googleLeak.test(css) || googleLeak.test(skJs) || googleLeak.test(appJs)) {
  fail('Google ratings must not appear');
} else ok('no Google ratings added');

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 8000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function waitForServer(base, max = 50) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      fetchText(base + '/').then((r) => {
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

async function checkRoutes(base) {
  const routes = [
    ['/', ['skeleton.js', 'id="pgrid"']],
    ['/css/style.css', ['.btn-spinner', '.sk-shimmer', 'var(--l2)']],
    ['/js/skeleton.js', ['fillCards', 'btn-spinner', 'function card']],
    ['/search', ['skeleton.js', 'searchGrid']],
    ['/login', ['skeleton.js', 'loginSubmit']],
    ['/legal/contact.html', ['skeleton.js', 'contactSubmit']],
  ];
  for (const [route, needles] of routes) {
    try {
      const r = await fetchText(base + route);
      if (r.status !== 200) fail(`${route} → ${r.status}`);
      else {
        const missing = needles.filter((n) => !r.body.includes(n));
        if (missing.length) fail(`${route} missing ${missing.join(', ')}`);
        else ok(`HTTP ${route} 200 + skeleton assets`);
      }
    } catch (e) {
      fail(`${route} ${e.message}`);
    }
  }
}

(async () => {
  const external = process.env.VERIFY_SKELETON_URL;
  if (external) {
    await checkRoutes(external.replace(/\/$/, ''));
  } else {
    const port = process.env.VERIFY_SKELETON_PORT || '3063';
    const base = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
      env: { ...process.env, PORT: port, NODE_ENV: 'test' },
      stdio: 'ignore',
    });
    try {
      await waitForServer(base);
      await checkRoutes(base);
    } catch (e) {
      fail('local server: ' + e.message);
    } finally {
      child.kill('SIGTERM');
    }
  }

  if (failed) {
    console.error(`verify-skeleton: ${failed} failed`);
    process.exit(1);
  }
  console.log('verify-skeleton: ok');
})();
