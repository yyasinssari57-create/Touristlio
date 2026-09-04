/**
 * [v2 ORTA-1 / DÜŞÜK-2] Accessibility: skip link, alt, labels, aria-live, focus.
 * Usage: node server/scripts/verify-accessibility.js
 * Optional: VERIFY_A11Y_URL=http://127.0.0.1:3062 node server/scripts/verify-accessibility.js
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

console.log('verify-accessibility');

const css = fs.readFileSync(path.join(ROOT, 'public', 'css', 'style.css'), 'utf8');
const a11yJs = fs.readFileSync(path.join(ROOT, 'public', 'js', 'a11y.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const loginHtml = fs.readFileSync(path.join(ROOT, 'public', 'login.html'), 'utf8');
const i18n = fs.readFileSync(path.join(ROOT, 'public', 'js', 'i18n.js'), 'utf8');

if (!css.includes('.skip-link')) fail('CSS missing .skip-link');
else ok('skip-link CSS');

if (!css.includes(':focus-visible')) fail('CSS missing :focus-visible');
else ok('focus-visible outline');

if (!css.includes('--t3:#5a7894') && !css.includes('--t3: #5a7894')) {
  fail('muted text --t3 still too light for contrast');
} else ok('muted text contrast (--t3 darkened)');

if (!a11yJs.includes('ensureLabels') || !a11yJs.includes('ensureSkipLink')) {
  fail('a11y.js missing ensureLabels / ensureSkipLink');
} else ok('a11y.js helpers');

if (!a11yJs.includes('keydown')) fail('a11y.js missing keyboard handler');
else ok('keyboard handler for widgets');

if (!indexHtml.includes('class="skip-link"') || !indexHtml.includes('id="main-content"')) {
  fail('index.html missing skip-link or main-content');
} else ok('index skip-link + main');

if (!indexHtml.includes('id="results-count"') || !indexHtml.includes('aria-live="polite"')) {
  fail('index missing #results-count live region');
} else ok('index #results-count aria-live');

if (!indexHtml.includes('Touristlio ana sayfaya git') || !indexHtml.includes('data-i18n-alt="logoHomeAlt"')) {
  fail('nav logo alt should be “Touristlio ana sayfaya git”');
} else ok('nav logo alt homepage text');

if (!indexHtml.includes('for="heroSearch"') || !indexHtml.includes('for="loginEmail"') === false) {
  /* loginEmail is in JS form; heroSearch must have label */
}
if (!indexHtml.includes('for="heroSearch"')) fail('hero search missing <label>');
else ok('hero search label');

if (!indexHtml.includes('aria-label="Kapat"') && !indexHtml.includes("aria-label='Kapat'")) {
  fail('auth close button missing aria-label');
} else ok('icon button aria-label (auth close)');

if (!indexHtml.includes('alt="Touristlio"')) fail('index logos missing descriptive alt');
else ok('index logo alt text');

if (!loginHtml.includes('for="loginEmail"') || !loginHtml.includes('for="loginPass"')) {
  fail('login.html inputs missing <label>');
} else ok('login labels');

if (!loginHtml.includes('class="skip-link"')) fail('login.html missing skip-link');
else ok('login skip-link');

if (!i18n.includes('skipLink:') || !i18n.includes('Skip to content')) {
  fail('i18n missing skipLink TR/EN');
} else ok('i18n skipLink');

if (!i18n.includes("logoHomeAlt: 'Touristlio ana sayfaya git'")
  || !i18n.includes("logoHomeAlt: 'Touristlio go to homepage'")) {
  fail('i18n missing logoHomeAlt TR/EN');
} else ok('i18n logoHomeAlt');

const appJs = fs.readFileSync(path.join(ROOT, 'public', 'js', 'app.js'), 'utf8');
if (!appJs.includes('function favoriteAria') || !appJs.includes('`${base}: ${name}`')) {
  fail('favorite aria-label must include place name');
} else ok('favorite aria-label includes place name');

if (!css.includes('.tour-field input:focus-visible')) {
  fail('tour-field missing :focus-visible outline restore');
} else ok('tour-field focus-visible');

const searchHtml = fs.readFileSync(path.join(ROOT, 'public', 'search.html'), 'utf8');
if (!searchHtml.includes('id="results-count"')) fail('search.html missing #results-count');
else ok('search #results-count');

const pages = [
  'public/login.html',
  'public/register.html',
  'public/search.html',
  'public/profile.html',
  'public/reset-password.html',
  'public/legal/contact.html',
  'public/404.html',
  'public/index.html',
];
for (const rel of pages) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  if (!html.includes('skip-link')) fail(`${rel} missing skip-link`);
  else ok(`${rel} skip-link`);
}

const labeledPages = [
  ['public/register.html', ['for="regName"', 'for="regEmail"', 'for="regPass"']],
  ['public/reset-password.html', ['for="resetPass"', 'for="resetPassConfirm"']],
  ['public/legal/contact.html', ['for="contactName"', 'for="contactEmail"']],
  ['public/search.html', ['for="searchQ"', 'for="searchCat"']],
];
for (const [rel, needles] of labeledPages) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const missing = needles.filter((n) => !html.includes(n));
  if (missing.length) fail(`${rel} missing labels: ${missing.join(', ')}`);
  else ok(`${rel} form labels`);
}

const emptyLogo = /<img[^>]*class="[^"]*brand-mark[^"]*"[^>]*alt=""|<img[^>]*alt=""[^>]*class="[^"]*brand-mark/;
if (emptyLogo.test(indexHtml) || emptyLogo.test(loginHtml)) fail('brand-mark still has empty alt');
else ok('brand-mark alt not empty');

const googleLeak = /google\s*rating|googleRating|aggregateRating.*google/i;
if (googleLeak.test(css) || googleLeak.test(a11yJs) || googleLeak.test(indexHtml)) {
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
  const routes = ['/', '/login', '/register', '/search', '/legal/contact.html'];
  for (const route of routes) {
    try {
      const r = await fetchText(base + route);
      if (r.status !== 200) fail(`${route} → ${r.status}`);
      else if (!r.body.includes('skip-link')) fail(`${route} HTML missing skip-link`);
      else if (!r.body.includes('a11y.js')) fail(`${route} missing a11y.js`);
      else ok(`HTTP ${route} 200 + skip-link + a11y.js`);
    } catch (e) {
      fail(`${route} ${e.message}`);
    }
  }
}

(async () => {
  const external = process.env.VERIFY_A11Y_URL;
  if (external) {
    await checkRoutes(external.replace(/\/$/, ''));
  } else {
    const port = process.env.VERIFY_A11Y_PORT || '3062';
    const base = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
      env: { ...process.env, PORT: port, NODE_ENV: 'test' },
      stdio: 'ignore',
    });
    try {
      await waitForServer(base, 400);
      await checkRoutes(base);
    } catch (e) {
      fail('local server: ' + e.message);
    } finally {
      child.kill('SIGTERM');
    }
  }

  if (failed) {
    console.error(`verify-accessibility: ${failed} failed`);
    process.exit(1);
  }
  console.log('verify-accessibility: ok');
})();
