/**
 * HEAD for not-found pages must match GET (404). Real pages stay 200.
 * Usage: npm run verify:head-404
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');
const {
  htmlPageRoutesMiddleware,
  publicHtmlMiddleware,
  publicHtmlStatus,
  sendPublicHtml,
} = require('../lib/send-public-html');
const { canonicalPageRedirectMiddleware } = require('../middleware/canonical-page-redirects');

const ROOT = path.join(__dirname, '..', '..');
const PUBLIC = path.join(ROOT, 'public');
let failed = 0;

function ok(msg) { console.log('  ✓', msg); }
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}

console.log('verify-head-404');

if (publicHtmlStatus('404.html', 200) !== 404) fail('404.html default status');
else ok('404.html with status 200 → 404');
if (publicHtmlStatus('404.html', 404) !== 404) fail('404.html already 404');
else ok('404.html keeps 404');
if (publicHtmlStatus('404.html', 500) !== 500) fail('404.html must not override 500');
else ok('404.html leaves an existing 500 alone');
if (publicHtmlStatus('index.html', 200) !== 200) fail('index.html status');
else ok('index.html stays 200');
if (publicHtmlStatus('login.html', 200) !== 200) fail('login.html status');
else ok('login.html stays 200');
if (publicHtmlStatus('legal/about.html', 200) !== 200) fail('about.html status');
else ok('legal/about.html stays 200');

const sender = fs.readFileSync(path.join(ROOT, 'server', 'lib', 'send-public-html.js'), 'utf8');
if (sender.includes('res.status(200).end()')) fail('HEAD still hardcodes 200');
else ok('HEAD no longer hardcodes 200');

const indexJs = fs.readFileSync(path.join(ROOT, 'server', 'index.js'), 'utf8');
const catchAll = indexJs.slice(indexJs.lastIndexOf("app.get('*'"));
const catchFn = catchAll.split('app.use((err')[0] || catchAll;
if (!catchFn.includes('res.status(404)') || !catchFn.includes("'404.html'")) {
  fail('unknown paths must answer 404.html');
} else ok('Express catch-all still serves 404.html');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
if (pkg.scripts['verify:head-404'] !== 'node server/scripts/verify-head-404.js') {
  fail('package.json missing verify:head-404');
} else ok('verify:head-404 script');

function fetchRaw(base, method, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${base}${urlPath}`, { method, timeout: 8000 }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        body: Buffer.concat(chunks).toString('utf8'),
        type: res.headers['content-type'] || '',
      }));
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`timeout ${method} ${urlPath}`));
    });
    req.end();
  });
}

function startApp() {
  const app = express();
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const pathOnly = req.path || '';
    if (pathOnly.startsWith('/api')) return next();
    if (pathOnly === '/en' || pathOnly === '/en/') {
      req.tlLang = 'en';
      const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      req.url = `/${q}`;
      return next();
    }
    if (pathOnly.startsWith('/en/')) {
      req.tlLang = 'en';
      req.url = req.url.replace(/^\/en/, '') || '/';
      return next();
    }
    return next();
  });
  app.use(canonicalPageRedirectMiddleware());
  app.use(htmlPageRoutesMiddleware(PUBLIC));
  app.use(publicHtmlMiddleware(PUBLIC));
  app.get('*', async (req, res, next) => {
    try {
      if (req.path.startsWith('/api/')) return next();
      res.status(404);
      await sendPublicHtml(res, PUBLIC, '404.html');
    } catch (err) {
      next(err);
    }
  });
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

const CASES = [
  { path: '/404', status: 404, title: true },
  { path: '/404.html', status: 404, title: true },
  { path: '/', status: 200, headOnly: true },
  { path: '/login', status: 200 },
  { path: '/legal/about.html', status: 200 },
  { path: '/this-page-does-not-exist-head', status: 404, title: true },
  { path: '/no-such-file.html', status: 404, title: true },
  { path: '/en/404', status: 404, titleText: 'Page not found — Touristlio' },
  { path: '/en/login', status: 200 },
];

(async () => {
  const { server, base } = await startApp();
  try {
    for (const item of CASES) {
      const head = await fetchRaw(base, 'HEAD', item.path);
      if (head.status !== item.status) fail(`HEAD ${item.path} → ${head.status} (want ${item.status})`);
      else if (head.body.length !== 0) fail(`HEAD ${item.path} sent a body`);
      else if (item.status === 200 && !/text\/html/i.test(head.type)) {
        fail(`HEAD ${item.path} content-type ${head.type}`);
      } else ok(`HEAD ${item.path} → ${head.status}`);

      if (item.headOnly) continue;

      const get = await fetchRaw(base, 'GET', item.path);
      if (get.status !== item.status) fail(`GET ${item.path} → ${get.status} (want ${item.status})`);
      else if (get.status !== head.status) fail(`GET/HEAD mismatch ${item.path}`);
      else if (item.title && !get.body.includes('Sayfa bulunamadı — Touristlio')) {
        fail(`GET ${item.path} missing 404 title`);
      } else if (item.titleText && !get.body.includes(item.titleText)) {
        fail(`GET ${item.path} missing title ${item.titleText}`);
      } else if (!item.title && !item.titleText && get.body.length === 0) fail(`GET ${item.path} empty body`);
      else ok(`GET ${item.path} → ${get.status} (same as HEAD)`);
    }
  } catch (err) {
    fail(err.message);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  if (failed) {
    console.error(`verify-head-404: ${failed} failed`);
    process.exit(1);
  }
  console.log('verify-head-404: ok');
})();
