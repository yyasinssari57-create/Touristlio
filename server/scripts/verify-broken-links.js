/**
 * [DÜŞÜK-4] Internal link checker: footer/menu hrefs, aliases, dead #anchors, 404 CTA.
 * Usage: node server/scripts/verify-broken-links.js
 * Optional: VERIFY_LINKS_URL=http://127.0.0.1:3064 node server/scripts/verify-broken-links.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { HTML_PAGE_ROUTES } = require('../lib/send-public-html');
const { PAGE_REDIRECTS, canonicalPageTarget } = require('../middleware/canonical-page-redirects');

const ROOT = path.join(__dirname, '..', '..');
const PUBLIC = path.join(ROOT, 'public');
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}

console.log('verify-broken-links');

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    if (name.name === 'vendor') continue;
    const full = path.join(dir, name.name);
    if (name.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

const htmlFiles = walk(PUBLIC).filter((f) => f.endsWith('.html') && !path.basename(f).startsWith('_'));

const indexHtml = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
const fourHtml = fs.readFileSync(path.join(PUBLIC, '404.html'), 'utf8');
const appJs = fs.readFileSync(path.join(PUBLIC, 'js', 'app.js'), 'utf8');
const searchHtml = fs.readFileSync(path.join(PUBLIC, 'search.html'), 'utf8');
const profileHtml = fs.readFileSync(path.join(PUBLIC, 'profile.html'), 'utf8');
const loginHtml = fs.readFileSync(path.join(PUBLIC, 'login.html'), 'utf8');
const indexJs = fs.readFileSync(path.join(ROOT, 'server', 'index.js'), 'utf8');

if (indexHtml.indexOf('class="site-footer"') < indexHtml.indexOf('id="page-profile"')) {
  fail('footer still inside an early SPA page (should sit after all .page tabs)');
} else ok('footer is outside SPA pages so legal links stay visible');

if (!fourHtml.includes('href="/"') || !/Ana sayfaya dön|errHome/.test(fourHtml)) {
  fail('404.html missing home CTA');
} else ok('404.html has home button');

if (!fourHtml.includes('/gezilecek-yerler')) fail('404.html missing places CTA');
else ok('404.html has Gezilecek Yerler CTA');

const catchAll = indexJs.slice(indexJs.lastIndexOf("app.get('*'"));
const catchFn = catchAll.split('app.use((err')[0] || catchAll;
if (!catchFn.includes('404.html') || catchFn.includes("'index.html'")) {
  fail('unknown paths must serve 404.html, not index.html');
} else ok('Express catch-all serves 404.html');

if (!HTML_PAGE_ROUTES['/'] || HTML_PAGE_ROUTES['/'] !== 'index.html') {
  fail('GET / must be in HTML_PAGE_ROUTES');
} else ok('GET / serves index.html');

['/about', '/contact', '/privacy', '/terms', '/kvkk'].forEach((alias) => {
  const dest = PAGE_REDIRECTS[alias];
  if (!dest || !dest.startsWith('/legal/')) fail(`missing 301 alias ${alias}`);
  else ok(`alias ${alias} → 301 ${dest}`);
});
if (canonicalPageTarget('/about', 'en') !== '/en/legal/about.html') {
  fail('EN /about should 301 to /en/legal/about.html');
} else ok('EN /about → /en/legal/about.html');
if (canonicalPageTarget('/index.html', 'tr') !== '/') fail('/index.html should 301 to /');
else ok('/index.html → /');
if (canonicalPageTarget('/search.html', 'en') !== '/en/search') fail('/en/search.html map');
else ok('/search.html EN → /en/search');

if (searchHtml.includes('/?place=') || profileHtml.includes('/?place=')) {
  fail('old /?place= links still in search/profile HTML');
} else ok('search/profile use /places/:slug routes');

if (searchHtml.includes('/#explore/map')) fail('search still uses /#explore/map');
else ok('search map CTA uses /explore#explore/map');

if (/href=["']#["']/.test(loginHtml) || /href=["']#["']/.test(appJs)) {
  fail('dead href="#" still present in login or app.js');
} else ok('no href="#" dead anchors in login / app.js');

const googleLeak = /google\s*rating|googleRating|aggregateRating.*google/i;
if (googleLeak.test(indexHtml) || googleLeak.test(appJs)) fail('Google ratings must not appear');
else ok('no Google ratings added');

function idsIn(html) {
  const set = new Set();
  const re = /\bid=["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(html))) set.add(m[1]);
  return set;
}

function checkDeadAnchors(file, html) {
  const ids = idsIn(html);
  const re = /href=["']#([^"']+)["']/g;
  let m;
  let broken = 0;
  while ((m = re.exec(html))) {
    const id = m[1];
    if (!id) {
      fail(`${path.relative(ROOT, file)} dead href="#"`);
      broken += 1;
      continue;
    }
    if (!ids.has(id)) {
      fail(`${path.relative(ROOT, file)} dead anchor #${id}`);
      broken += 1;
    }
  }
  return broken;
}

let dead = 0;
for (const file of htmlFiles) {
  dead += checkDeadAnchors(file, fs.readFileSync(file, 'utf8'));
}
if (!dead) ok('no dead #anchors in public HTML');

const FOOTER_HREFS = [
  '/legal/about.html',
  '/legal/contact.html',
  '/legal/privacy.html',
  '/legal/kvkk.html',
  '/legal/terms.html',
];
for (const href of FOOTER_HREFS) {
  if (!indexHtml.includes(`href="${href}"`)) fail(`footer missing ${href}`);
  else ok(`footer href ${href}`);
}

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

async function checkHttp(base) {
  const expect200 = [
    '/',
    '/explore',
    '/gezilecek-yerler',
    '/blog',
    '/search',
    '/login',
    '/register',
    '/legal/about.html',
    '/legal/contact.html',
    '/legal/privacy.html',
    '/legal/kvkk.html',
    '/legal/terms.html',
    '/en/legal/contact.html',
  ];
  for (const route of expect200) {
    try {
      const r = await fetchText(base + route);
      if (r.status !== 200) fail(`${route} → ${r.status}`);
      else ok(`HTTP ${route} 200`);
    } catch (e) {
      fail(`${route} ${e.message}`);
    }
  }

  const expect301 = [
    ['/about', '/legal/about.html'],
    ['/contact', '/legal/contact.html'],
    ['/privacy', '/legal/privacy.html'],
    ['/terms', '/legal/terms.html'],
    ['/kvkk', '/legal/kvkk.html'],
    ['/legal/about', '/legal/about.html'],
    ['/index.html', '/'],
    ['/search.html', '/search'],
    ['/login.html', '/login'],
    ['/en/about', '/en/legal/about.html'],
    ['/en/index.html', '/en/'],
  ];
  for (const [route, dest] of expect301) {
    try {
      const r = await fetchText(base + route);
      if (r.status !== 301 && r.status !== 302) fail(`${route} → ${r.status} (want 301)`);
      else if (!String(r.location).split('?')[0].endsWith(dest)) {
        fail(`${route} Location ${r.location} (want ${dest})`);
      } else ok(`HTTP ${route} 301 → ${dest}`);
    } catch (e) {
      fail(`${route} ${e.message}`);
    }
  }

  const home = await fetchText(base + '/');
  for (const href of FOOTER_HREFS) {
    if (!home.body.includes(`href="${href}"`)) fail(`GET / HTML missing footer ${href}`);
  }

  const unknown = await fetchText(base + '/this-page-does-not-exist-tl-dusuk4');
  if (unknown.status !== 404) fail(`unknown path → ${unknown.status} (want 404)`);
  else ok('unknown path HTTP 404');
  if (!unknown.body.includes('href="/"') || !/Ana sayfaya dön|errHome/.test(unknown.body)) {
    fail('404 response missing home CTA');
  } else ok('404 response includes home CTA');

  const missingHtml = await fetchText(base + '/legal/missing-page.html');
  if (missingHtml.status !== 404) fail(`missing .html → ${missingHtml.status}`);
  else ok('missing .html HTTP 404');

  const fourFile = await fetchText(base + '/404.html');
  if (fourFile.status !== 404) fail(`/404.html → ${fourFile.status} (want 404)`);
  else ok('/404.html HTTP 404');

  const placesSlash = await fetchText(base + '/places');
  if (placesSlash.status !== 302 && placesSlash.status !== 301) {
    fail(`/places → ${placesSlash.status} (want redirect)`);
  } else if (!String(placesSlash.location).includes('gezilecek-yerler')) {
    fail(`/places Location ${placesSlash.location}`);
  } else ok('/places redirects to /gezilecek-yerler');
}

(async () => {
  const external = process.env.VERIFY_LINKS_URL;
  if (external) {
    await checkHttp(external.replace(/\/$/, ''));
  } else {
    const port = process.env.VERIFY_LINKS_PORT || '3064';
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
      await checkHttp(base);
    } catch (e) {
      fail('local server: ' + e.message);
    } finally {
      child.kill('SIGTERM');
    }
  }

  if (failed) {
    console.error(`verify-broken-links: ${failed} failed`);
    process.exit(1);
  }
  console.log('verify-broken-links: ok');
})();
