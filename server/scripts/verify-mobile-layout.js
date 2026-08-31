/**
 * [DÜŞÜK-1] Mobil uyum: 48px dokunma, img max-width, menü scroll kilidi.
 * Usage: node server/scripts/verify-mobile-layout.js
 * Optional: VERIFY_MOBILE_URL=http://127.0.0.1:3061 node server/scripts/verify-mobile-layout.js
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

console.log('verify-mobile-layout');

const css = fs.readFileSync(path.join(ROOT, 'public', 'css', 'style.css'), 'utf8');
const appJs = fs.readFileSync(path.join(ROOT, 'public', 'js', 'app.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const loginHtml = fs.readFileSync(path.join(ROOT, 'public', 'login.html'), 'utf8');

if (!css.includes('max-width:480px') && !css.includes('max-width: 480px')) {
  fail('missing 480px media query');
} else ok('480px breakpoint present');

if (!/img\{[^}]*max-width:\s*100%/.test(css) && !css.includes('img,picture,video{max-width:100%}')) {
  fail('images missing max-width:100%');
} else ok('images max-width:100%');

if (!css.includes('min-height:48px') || !css.includes('min-width:48px')) {
  fail('buttons missing 48px min touch size');
} else ok('48×48 touch min on buttons');

if (!css.includes('html.nav-open') || !css.includes('overflow:hidden')) {
  fail('nav-open scroll lock CSS missing');
} else ok('nav-open overflow:hidden');

if (!css.includes('.nav-toggle') || !/nav-toggle\{[^}]*min-width:48px/.test(css.replace(/\s/g, ''))) {
  fail('nav-toggle not 48px');
} else ok('nav-toggle 48×48');

if (!appJs.includes('classList.toggle(\'nav-open\'') && !appJs.includes('classList.toggle("nav-open"')) {
  fail('JS does not toggle nav-open on html/body');
} else ok('JS toggles nav-open class');

if (!appJs.includes('function setNavMenuOpen') || !appJs.includes('function closeNavMenu')) {
  fail('setNavMenuOpen / closeNavMenu missing');
} else ok('setNavMenuOpen / closeNavMenu');

if (!appJs.includes('closeNavMenu()')) fail('menu not closed on navigation');
else ok('menu closes on tab / auth');

if (!indexHtml.includes('width=device-width')) fail('index missing viewport');
else ok('index viewport');
if (!loginHtml.includes('width=device-width')) fail('login missing viewport');
else ok('login viewport');
if (!indexHtml.includes('aria-expanded="false"') || !indexHtml.includes('id="navToggle"')) {
  fail('nav toggle missing aria-expanded');
} else ok('nav toggle aria-expanded');

const pages = [
  'public/login.html',
  'public/register.html',
  'public/search.html',
  'public/profile.html',
  'public/404.html',
];
for (const rel of pages) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  if (!html.includes('width=device-width')) fail(`${rel} missing viewport`);
  else ok(`${rel} viewport`);
}

const googleLeak = /google\s*rating|googleRating|aggregateRating.*google/i;
if (googleLeak.test(css) || googleLeak.test(appJs)) fail('Google ratings must not appear');
else ok('no Google ratings added');

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
  const routes = ['/', '/explore', '/blog', '/login', '/search'];
  for (const route of routes) {
    try {
      const r = await fetchText(base + route);
      if (r.status !== 200) fail(`${route} → ${r.status}`);
      else if (!r.body.includes('width=device-width')) fail(`${route} HTML missing viewport`);
      else ok(`HTTP ${route} 200 + viewport`);
    } catch (e) {
      fail(`${route} ${e.message}`);
    }
  }
  try {
    const r = await fetchText(base + '/api/places?limit=1');
    const data = JSON.parse(r.body);
    const payload = data.data || data;
    const list = payload.items || payload.places || [];
    const first = Array.isArray(list) ? list[0] : null;
    const slug = first && (first.slug || first.id);
    if (!slug) {
      ok('no place slug in API (skip detail HTTP)');
    } else {
      const d = await fetchText(base + '/places/' + encodeURIComponent(slug));
      if (d.status !== 200) fail(`/places/${slug} → ${d.status}`);
      else if (!d.body.includes('width=device-width')) fail('place detail missing viewport');
      else ok(`HTTP /places/${slug} 200 + viewport`);
    }
  } catch (e) {
    fail('place detail check: ' + e.message);
  }
}

(async () => {
  const external = process.env.VERIFY_MOBILE_URL;
  if (external) {
    await checkRoutes(external.replace(/\/$/, ''));
  } else {
    const port = process.env.VERIFY_MOBILE_PORT || '3061';
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
    console.error(`verify-mobile-layout: ${failed} failed`);
    process.exit(1);
  }
  console.log('verify-mobile-layout: ok');
})();
