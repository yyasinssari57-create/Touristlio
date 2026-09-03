/**
 * [KRİTİK-4] apex→www 301, production HTTP→HTTPS, www canonicals.
 * Usage: node server/scripts/verify-www-redirect.js
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');
const {
  canonicalHostMiddleware,
  shouldRedirectApexToWww,
  shouldRedirectHttpToHttps,
  canonicalTarget,
  hostnameFromReq,
  protoFromReq,
} = require('../middleware/canonical-host');
const { siteBaseUrl } = require('../lib/sitemap');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}

console.log('verify-www-redirect');

function fakeReq({ host, xfHost, xfProto, url = '/', secure = false, protocol = 'http' }) {
  const headers = {
    host: host || '',
    'x-forwarded-host': xfHost || '',
    'x-forwarded-proto': xfProto || '',
  };
  return {
    originalUrl: url,
    hostname: host,
    secure,
    protocol,
    get(name) { return headers[String(name).toLowerCase()] || ''; },
  };
}

function request(port, { path: p = '/', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: p,
      method: 'GET',
      headers,
    }, (res) => {
      res.resume();
      resolve({ status: res.statusCode, location: res.headers.location || '' });
    });
    req.on('error', reject);
    req.end();
  });
}

async function withApp(fn) {
  const app = express();
  app.use(canonicalHostMiddleware());
  app.get('*', (_req, res) => res.status(200).send('ok'));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address();
  try {
    await fn(port);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

async function main() {
  if (!shouldRedirectApexToWww('touristlio.com')) fail('apex should redirect to www');
  else ok('apex touristlio.com → www');
  if (shouldRedirectApexToWww('www.touristlio.com')) fail('www should not redirect');
  else ok('www host is left alone');
  if (shouldRedirectApexToWww('localhost')) fail('localhost should not redirect');
  else ok('localhost is not redirected');
  if (canonicalTarget('/places/ayasofya-istanbul') !== 'https://www.touristlio.com/places/ayasofya-istanbul') {
    fail(`canonicalTarget path wrong: ${canonicalTarget('/places/ayasofya-istanbul')}`);
  } else ok('apex Location keeps path + uses https www');

  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const httpWww = fakeReq({ host: 'www.touristlio.com', xfProto: 'http' });
  if (!shouldRedirectHttpToHttps(httpWww, 'www.touristlio.com')) fail('production http www should upgrade');
  else ok('production HTTP www → HTTPS');
  const httpsWww = fakeReq({ host: 'www.touristlio.com', xfProto: 'https' });
  if (shouldRedirectHttpToHttps(httpsWww, 'www.touristlio.com')) fail('https www should not upgrade');
  else ok('HTTPS www is left alone');
  process.env.NODE_ENV = 'development';
  if (shouldRedirectHttpToHttps(httpWww, 'www.touristlio.com')) fail('dev should not force HTTPS');
  else ok('development does not force HTTPS');
  process.env.NODE_ENV = prev;

  const apexReq = fakeReq({ host: 'touristlio.com', xfHost: 'touristlio.com', url: '/places/x?q=1' });
  if (hostnameFromReq(apexReq) !== 'touristlio.com') fail('hostnameFromReq missed apex');
  else ok('X-Forwarded-Host is used for public host');
  if (protoFromReq(fakeReq({ host: 'www.touristlio.com', xfProto: 'https, http' })) !== 'https') {
    fail('protoFromReq should take first forwarded proto');
  } else ok('X-Forwarded-Proto first value wins');

  process.env.NODE_ENV = 'production';
  await withApp(async (port) => {
    const apex = await request(port, {
      path: '/places/ayasofya-istanbul?lang=tr',
      headers: { Host: 'touristlio.com', 'X-Forwarded-Host': 'touristlio.com', 'X-Forwarded-Proto': 'https' },
    });
    if (apex.status !== 301 || apex.location !== 'https://www.touristlio.com/places/ayasofya-istanbul?lang=tr') {
      fail(`apex 301 expected, got ${apex.status} ${apex.location}`);
    } else ok('HTTP app: apex Host → 301 https://www… + path');

    const both = await request(port, {
      path: '/legal/contact.html',
      headers: { Host: 'touristlio.com', 'X-Forwarded-Host': 'touristlio.com', 'X-Forwarded-Proto': 'http' },
    });
    if (both.status !== 301 || both.location !== 'https://www.touristlio.com/legal/contact.html') {
      fail(`http+apex should be one hop, got ${both.status} ${both.location}`);
    } else ok('HTTP + apex → single 301 to https www');

    const proto = await request(port, {
      path: '/explore',
      headers: { Host: 'www.touristlio.com', 'X-Forwarded-Host': 'www.touristlio.com', 'X-Forwarded-Proto': 'http' },
    });
    if (proto.status !== 301 || proto.location !== 'https://www.touristlio.com/explore') {
      fail(`http www expected 301 https, got ${proto.status} ${proto.location}`);
    } else ok('HTTP www → 301 https www');

    const stay = await request(port, {
      path: '/',
      headers: { Host: 'www.touristlio.com', 'X-Forwarded-Host': 'www.touristlio.com', 'X-Forwarded-Proto': 'https' },
    });
    if (stay.status !== 200) fail(`www https should 200, got ${stay.status}`);
    else ok('https www stays 200');

    const local = await request(port, {
      path: '/',
      headers: { Host: '127.0.0.1', 'X-Forwarded-Proto': 'http' },
    });
    if (local.status !== 200) fail(`loopback should 200, got ${local.status}`);
    else ok('loopback is not redirected');
  });
  process.env.NODE_ENV = prev;

  const indexJs = fs.readFileSync(path.join(ROOT, 'server/index.js'), 'utf8');
  const firstUse = indexJs.indexOf('app.use(canonicalHostMiddleware())');
  const helmetUse = indexJs.indexOf('app.use(helmet');
  if (firstUse < 0 || helmetUse < 0 || firstUse > helmetUse) {
    fail('canonicalHostMiddleware must be mounted before helmet');
  } else ok('redirect middleware is first (before helmet)');

  const base = siteBaseUrl();
  if (base !== 'https://www.touristlio.com' && !/localhost|127\.0\.0\.1/.test(base)) {
    if (!base.includes('www.touristlio.com')) fail(`siteBaseUrl is not www: ${base}`);
    else ok(`siteBaseUrl www (${base})`);
  } else ok(`siteBaseUrl uses www (${base})`);

  const htmlFiles = [
    'public/index.html',
    'public/search.html',
    'public/login.html',
    'public/register.html',
    'public/profile.html',
  ];
  for (const rel of htmlFiles) {
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) continue;
    const html = fs.readFileSync(file, 'utf8');
    if (html.includes('rel="canonical"') && /href="https:\/\/touristlio\.com\/?"/.test(html)) {
      fail(`${rel} canonical is apex, not www`);
    } else if (html.includes('https://touristlio.com/') && /rel="canonical"/.test(html) && !/www\.touristlio\.com/.test(html)) {
      fail(`${rel} canonical missing www`);
    } else ok(`${rel} canonical is www or injected`);
  }

  const indexHtml = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
  if (!indexHtml.includes('href="https://www.touristlio.com/"')) {
    fail('index.html static canonical is not https://www.touristlio.com/');
  } else ok('index.html static canonical is www');

  const appJs = fs.readFileSync(path.join(ROOT, 'public/js/app.js'), 'utf8');
  if (!appJs.includes("return 'https://www.touristlio.com'") || !appJs.includes("replace('://touristlio.com'")) {
    fail('app.js setCanonical does not force www');
  } else ok('client setCanonical rewrites apex to www');

  if (failed) {
    console.error(`verify-www-redirect FAILED (${failed})`);
    process.exit(1);
  }
  console.log('verify-www-redirect OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
