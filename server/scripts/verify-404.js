/**
 * [v2 DÜŞÜK-3] Custom 404: HTTP 404 (not soft 200 SPA), branded page, noindex, i18n title.
 * Usage: npm run verify:404
 * Optional: VERIFY_404_URL=http://127.0.0.1:3072 npm run verify:404
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { notFoundCopy, pageDefaults, buildSeoHead } = require('../lib/seo');

const ROOT = path.join(__dirname, '..', '..');
const PUBLIC = path.join(ROOT, 'public');
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}

console.log('verify-404');

const fourHtml = fs.readFileSync(path.join(PUBLIC, '404.html'), 'utf8');
const i18nJs = fs.readFileSync(path.join(PUBLIC, 'js', 'i18n.js'), 'utf8');
const sender = fs.readFileSync(path.join(ROOT, 'server', 'lib', 'send-public-html.js'), 'utf8');
const indexJs = fs.readFileSync(path.join(ROOT, 'server', 'index.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

if (!fourHtml.includes('noindex')) fail('404.html missing noindex');
else ok('404.html robots noindex');

if (!/Sayfa Bulunamadı — Touristlio/.test(fourHtml)) fail('404.html title not “Sayfa Bulunamadı”');
else ok('404.html branded title');

if (!fourHtml.includes('href="/"') || !/Ana sayfaya dön|errHome/.test(fourHtml)) {
  fail('404.html missing home CTA');
} else ok('404.html home CTA');

if (!fourHtml.includes('/gezilecek-yerler') || !/errPlaces/.test(fourHtml)) {
  fail('404.html missing places CTA');
} else ok('404.html places CTA');

if (!fourHtml.includes('/legal/about.html') || !fourHtml.includes('/legal/contact.html')) {
  fail('404.html missing legal links');
} else ok('404.html legal links');

if (!i18nJs.includes("err404Title: 'Sayfa Bulunamadı — Touristlio'")) {
  fail('i18n missing TR err404Title');
} else ok('i18n TR err404Title');

if (!i18nJs.includes("err404Title: 'Page not found — Touristlio'")) {
  fail('i18n missing EN err404Title');
} else ok('i18n EN err404Title');

if (!i18nJs.includes("errorH1 === '404'")) {
  fail('i18n.apply still overwrites 404 title with homepage slogan');
} else ok('i18n.apply keeps 404 title');

if (!sender.includes("relativePath === '404.html'") || !sender.includes('res.status(404)')) {
  fail('sendPublicHtml must force HTTP 404 for 404.html');
} else ok('sendPublicHtml sets 404 for 404.html');

const catchAll = indexJs.slice(indexJs.lastIndexOf("app.get('*'"));
const catchFn = catchAll.split('app.use((err')[0] || catchAll;
if (!catchFn.includes('404.html') || catchFn.includes("'index.html'")) {
  fail('unknown paths must serve 404.html, not index.html');
} else ok('Express catch-all serves 404.html');

if (!pkg.scripts['verify:404']) fail('package.json missing verify:404');
else ok('verify:404 script');

const trCopy = notFoundCopy('tr');
const enCopy = notFoundCopy('en');
if (trCopy.title !== 'Sayfa Bulunamadı — Touristlio') fail(`notFoundCopy TR: ${trCopy.title}`);
else ok('notFoundCopy TR title');
if (enCopy.title !== 'Page not found — Touristlio') fail(`notFoundCopy EN: ${enCopy.title}`);
else ok('notFoundCopy EN title');

if (pageDefaults('/404', 'tr').title !== trCopy.title) fail('pageDefaults /404');
else ok('pageDefaults /404');

const homeTitle = pageDefaults('/', 'tr').title;
if (/Bulunamadı|not found/i.test(homeTitle)) fail('homepage title became 404');
else ok('homepage title unchanged');

const head = buildSeoHead({
  pathname: '/404',
  lang: 'tr',
  title: trCopy.title,
  description: trCopy.description,
  noindex: true,
});
if (!head.includes('noindex, nofollow')) fail('404 SEO missing noindex');
else ok('404 SEO noindex');
if (!head.includes('Sayfa Bulunamadı — Touristlio')) fail('404 SEO title');
else ok('404 SEO title');

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 8000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({
        status: res.statusCode,
        body,
        robots: res.headers['x-robots-tag'] || '',
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

function assertNotFoundPage(label, res, { title }) {
  if (res.status !== 404) {
    fail(`${label} → ${res.status} (want 404)`);
    return;
  }
  ok(`${label} HTTP 404`);
  if (!res.body.includes(title)) fail(`${label} missing title ${title}`);
  else ok(`${label} title`);
  if (!/noindex/i.test(res.body)) fail(`${label} missing noindex`);
  else ok(`${label} noindex`);
  if (!res.body.includes('href="/"') || !/Ana sayfaya dön|errHome|Back to home/.test(res.body)) {
    fail(`${label} missing home CTA`);
  } else ok(`${label} home CTA`);
  if (/<h1[^>]*>\s*Sadece Ziyaret Etme/.test(res.body) || res.body.includes('id="pgrid"')) {
    fail(`${label} looks like soft-200 SPA homepage`);
  } else ok(`${label} not SPA homepage`);
}

async function checkLive(base) {
  const home = await fetchText(`${base}/`);
  if (home.status !== 200) fail(`GET / → ${home.status}`);
  else ok('GET / still 200');

  assertNotFoundPage(
    'unknown path',
    await fetchText(`${base}/this-page-does-not-exist-tl-dusuk3`),
    { title: 'Sayfa Bulunamadı — Touristlio' },
  );
  assertNotFoundPage('GET /404', await fetchText(`${base}/404`), { title: 'Sayfa Bulunamadı — Touristlio' });
  assertNotFoundPage('GET /404.html', await fetchText(`${base}/404.html`), { title: 'Sayfa Bulunamadı — Touristlio' });
  assertNotFoundPage(
    'GET /en/this-page-does-not-exist-tl-dusuk3',
    await fetchText(`${base}/en/this-page-does-not-exist-tl-dusuk3`),
    { title: 'Page not found — Touristlio' },
  );
  assertNotFoundPage(
    'missing place',
    await fetchText(`${base}/places/not-a-real-place-tl-dusuk3`),
    { title: 'Sayfa Bulunamadı — Touristlio' },
  );
  assertNotFoundPage(
    'missing blog',
    await fetchText(`${base}/blog/not-a-real-post-tl-dusuk3`),
    { title: 'Sayfa Bulunamadı — Touristlio' },
  );
}

(async () => {
  const external = process.env.VERIFY_404_URL;
  if (external) {
    await checkLive(external.replace(/\/$/, ''));
  } else {
    const port = process.env.VERIFY_404_PORT || '3072';
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
    console.error(`verify-404: ${failed} failed`);
    process.exit(1);
  }
  console.log('verify-404: ok');
})();
