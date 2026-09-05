/**
 * site-audit-fix: EN sitemap twins, duplicate-URL 301s, auth/404 titles, robots.
 * Usage: npm run verify:audit
 * Optional: VERIFY_AUDIT_URL=http://127.0.0.1:3071 npm run verify:audit
 */
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { buildSeoHead } = require('../lib/seo');
const { buildRobotsTxt, englishAlternateLoc, withEnglishAlternates, SITEMAP_CACHE_CONTROL } = require('../lib/sitemap');
const { canonicalPageTarget, PAGE_REDIRECTS } = require('../middleware/canonical-page-redirects');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}

console.log('verify-site-audit');

if (englishAlternateLoc('https://www.touristlio.com/blog/foo', 'https://www.touristlio.com')
  !== 'https://www.touristlio.com/en/blog/foo') {
  fail('EN blog loc');
} else ok('EN blog loc');

const paired = withEnglishAlternates(
  [{ loc: 'https://www.touristlio.com/search', priority: '0.6' }],
  'https://www.touristlio.com',
);
if (paired.length !== 2 || paired[1].loc !== 'https://www.touristlio.com/en/search') {
  fail('withEnglishAlternates search');
} else ok('withEnglishAlternates adds /en/search');

const robots = buildRobotsTxt();
if (!robots.includes('Disallow: /login') || !robots.includes('Disallow: /en/admin')) {
  fail('robots private paths incomplete');
} else ok('robots lists auth + /en/admin');

if (canonicalPageTarget('/about', 'tr') !== '/legal/about.html') fail('TR about redirect');
else ok('TR /about → /legal/about.html');
if (canonicalPageTarget('/kvkk', 'en', '?x=1') !== '/en/legal/kvkk.html?x=1') fail('EN kvkk query');
else ok('EN /kvkk keeps query');
if (PAGE_REDIRECTS['/index.html'] !== '/') fail('index.html redirect map');
else ok('/index.html in redirect map');

const login = buildSeoHead({ pathname: '/login', noindex: true });
if (!login.includes('<title>Giriş — Touristlio</title>')) fail('login <title>');
else ok('login <title> not homepage');
if (login.includes('hreflang=')) fail('login still has hreflang');
else ok('login has no hreflang');

if (!SITEMAP_CACHE_CONTROL.includes('max-age=')) fail('SITEMAP_CACHE_CONTROL');
else ok('sitemap cache constant');

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 8000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({
        status: res.statusCode,
        body,
        location: res.headers.location || '',
        cache: res.headers['cache-control'] || '',
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

function titleOf(html) {
  const m = String(html).match(/<title>([^<]*)<\/title>/i);
  return m ? m[1] : '';
}

async function checkLive(base) {
  const loginPage = await fetchText(`${base}/login`);
  if (loginPage.status !== 200) fail(`/login HTTP ${loginPage.status}`);
  else if (titleOf(loginPage.body) !== 'Giriş — Touristlio') {
    fail(`/login title ${titleOf(loginPage.body)}`);
  } else ok('GET /login title Giriş');
  if (!/noindex/.test(loginPage.body)) fail('/login missing noindex');
  else ok('GET /login noindex');

  const about = await fetchText(`${base}/about`);
  if (about.status !== 301 || !String(about.location).includes('/legal/about.html')) {
    fail(`/about → ${about.status} ${about.location}`);
  } else ok('GET /about 301');

  const enAbout = await fetchText(`${base}/en/about`);
  if (enAbout.status !== 301 || !String(enAbout.location).includes('/en/legal/about.html')) {
    fail(`/en/about → ${enAbout.status} ${enAbout.location}`);
  } else ok('GET /en/about 301');

  const indexHtml = await fetchText(`${base}/index.html`);
  if (indexHtml.status !== 301 || !/\/$/.test(String(indexHtml.location).split('?')[0])) {
    fail(`/index.html → ${indexHtml.status} ${indexHtml.location}`);
  } else ok('GET /index.html 301 → /');

  const missing = await fetchText(`${base}/this-page-does-not-exist-audit`);
  if (missing.status !== 404) fail(`unknown → ${missing.status}`);
  else if (!titleOf(missing.body).includes('Sayfa bulunamadı')) fail(`404 title ${titleOf(missing.body)}`);
  else ok('unknown path 404 + title');

  const sm = await fetchText(`${base}/sitemap.xml`);
  if (sm.status !== 200) fail(`sitemap HTTP ${sm.status}`);
  else if (!sm.body.includes('/en/gezilecek-yerler') || !sm.body.includes('/en/search')) {
    fail('sitemap missing EN listing twins');
  } else ok('sitemap has EN listing twins');
  if (!/max-age=/.test(sm.cache)) fail(`sitemap Cache-Control ${sm.cache}`);
  else ok('sitemap Cache-Control max-age');
}

(async () => {
  const external = process.env.VERIFY_AUDIT_URL;
  if (external) {
    await checkLive(external.replace(/\/$/, ''));
  } else {
    const port = process.env.VERIFY_AUDIT_PORT || '3071';
    const base = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: port,
        NODE_ENV: 'test',
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
    console.error(`verify-site-audit: ${failed} failed`);
    process.exit(1);
  }
  console.log('verify-site-audit: ok');
})();
