/**
 * Sekme ikonu: /favicon.ico 200, SVG ve apple-touch duruyor,
 * sendPublicHtml herkese açık sayfalara link ekler.
 * Usage: npm run verify:favicon
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');
const sharp = require('sharp');
const {
  sendPublicHtml,
  htmlPageRoutesMiddleware,
  publicHtmlMiddleware,
  injectFaviconLinks,
  FAVICON_LINKS,
} = require('../lib/send-public-html');
const { staticAssetHeaders, DAY_CACHE } = require('../middleware/static-cache');

const ROOT = path.join(__dirname, '..', '..');
const PUBLIC = path.join(ROOT, 'public');
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
let failed = 0;

function ok(msg) { console.log('  ✓', msg); }
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}

console.log('verify-favicon');

function readAsset(name) {
  const file = path.join(PUBLIC, name);
  if (!fs.existsSync(file)) {
    fail(`missing public/${name}`);
    return null;
  }
  return fs.readFileSync(file);
}

function pngsInIco(buf) {
  if (!buf || buf.length < 6 || buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) {
    return null;
  }
  const count = buf.readUInt16LE(4);
  if (count < 1 || buf.length < 6 + count * 16) return null;
  const images = [];
  for (let i = 0; i < count; i += 1) {
    const entry = 6 + i * 16;
    const size = buf.readUInt32LE(entry + 8);
    const offset = buf.readUInt32LE(entry + 12);
    if (offset + size > buf.length) return null;
    const png = buf.subarray(offset, offset + size);
    if (!png.subarray(0, 8).equals(PNG_SIG)) return null;
    images.push(png);
  }
  return images;
}

const ico = readAsset('favicon.ico');
const svg = readAsset('favicon.svg');
const apple = readAsset('apple-touch-icon.png');

if (ico) {
  const pngs = pngsInIco(ico);
  if (!pngs) fail('favicon.ico is not a PNG-based ICO');
  else ok(`favicon.ico is an ICO with ${pngs.length} PNG image(s)`);
}

if (svg) {
  const text = svg.toString('utf8');
  if (!text.includes('<svg') || !text.includes('<path') || !text.includes('fill="#000"') || !text.includes('fill="#fff"')) {
    fail('favicon.svg is not the black/white Touristlio mark');
  } else if (!text.includes('aria-label="Touristlio"')) {
    fail('favicon.svg missing Touristlio label');
  } else ok('favicon.svg is the existing mark');
}

if (!FAVICON_LINKS.includes('href="/favicon.ico"')
  || !FAVICON_LINKS.includes('href="/favicon.svg"')
  || !FAVICON_LINKS.includes('href="/apple-touch-icon.png"')) {
  fail('FAVICON_LINKS missing an expected href');
} else ok('FAVICON_LINKS points at ico, svg, and apple-touch');

const already = injectFaviconLinks(`<head>\n${FAVICON_LINKS}\n</head>`);
if ((already.match(/rel="icon"/g) || []).length !== 2) {
  fail('injectFaviconLinks duplicated an existing icon link');
} else ok('injectFaviconLinks does not duplicate links');

const injected = injectFaviconLinks('<html><head><title>Touristlio</title></head><body></body></html>');
if (!injected.includes('href="/favicon.ico"') || !injected.includes('href="/favicon.svg"') || !injected.includes('apple-touch-icon.png')) {
  fail('injectFaviconLinks did not add the icon links');
} else if (!injected.includes('</head>')) fail('injectFaviconLinks dropped </head>');
else ok('injectFaviconLinks adds the three links before </head>');

const sender = fs.readFileSync(path.join(ROOT, 'server', 'lib', 'send-public-html.js'), 'utf8');
const nonceAt = sender.indexOf('html = injectNonce(');
const favAt = sender.indexOf('html = injectFaviconLinks(');
if (favAt < 0 || nonceAt < 0 || favAt > nonceAt) {
  fail('sendPublicHtml must inject favicon links before the nonce');
} else ok('sendPublicHtml injects favicon links');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
if (pkg.scripts['verify:favicon'] !== 'node server/scripts/verify-favicon.js') {
  fail('package.json missing verify:favicon');
} else ok('verify:favicon script');

function headerOf(res, name) {
  const fake = { headers: {}, setHeader(key, value) { this.headers[String(key).toLowerCase()] = value; } };
  staticAssetHeaders(fake, res);
  return fake.headers[name.toLowerCase()] || '';
}
if (headerOf('/tmp/favicon.ico', 'cache-control') !== DAY_CACHE) {
  fail('favicon.ico cache is not the 1-day static image policy');
} else ok('favicon.ico uses the 1-day image cache');

function fetchRaw(base, method, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${base}${urlPath}`, { method, timeout: 8000 }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        body: Buffer.concat(chunks),
        type: res.headers['content-type'] || '',
        cache: res.headers['cache-control'] || '',
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
  app.use(htmlPageRoutesMiddleware(PUBLIC));
  app.use(publicHtmlMiddleware(PUBLIC));
  app.use(express.static(PUBLIC, {
    index: false,
    setHeaders: staticAssetHeaders,
  }));
  app.get('*', async (req, res, next) => {
    try {
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

function htmlHasIcons(body) {
  const text = body.toString('utf8');
  return text.includes('rel="icon" href="/favicon.ico"')
    && text.includes('rel="icon" href="/favicon.svg"')
    && text.includes('rel="apple-touch-icon" href="/apple-touch-icon.png"');
}

(async () => {
  if (apple) {
    try {
      const meta = await sharp(apple).metadata();
      if (meta.format !== 'png' || meta.width !== 180 || meta.height !== 180) {
        fail(`apple-touch-icon.png is ${meta.format} ${meta.width}x${meta.height}`);
      } else ok('apple-touch-icon.png is 180x180 PNG');
    } catch (err) {
      fail(`apple-touch-icon.png unreadable: ${err.message}`);
    }
  }

  if (ico) {
    const pngs = pngsInIco(ico);
    if (pngs) {
      const dims = [];
      for (const png of pngs) {
        const meta = await sharp(png).metadata();
        dims.push(meta.width);
      }
      const want = [16, 32, 48];
      if (want.some((n) => !dims.includes(n))) fail(`favicon.ico sizes ${dims.join(',')} missing 16/32/48`);
      else ok(`favicon.ico sizes ${dims.join(', ')}`);
    }
  }

  const { server, base } = await startApp();
  try {
    const getIco = await fetchRaw(base, 'GET', '/favicon.ico');
    if (getIco.status !== 200) fail(`GET /favicon.ico → ${getIco.status}`);
    else if (!pngsInIco(getIco.body)) fail('GET /favicon.ico body is not an ICO');
    else if (!/icon/i.test(getIco.type)) fail(`GET /favicon.ico content-type ${getIco.type}`);
    else if (getIco.cache !== DAY_CACHE) fail(`GET /favicon.ico cache ${getIco.cache}`);
    else ok(`GET /favicon.ico → 200 ${getIco.type}`);

    const headIco = await fetchRaw(base, 'HEAD', '/favicon.ico');
    if (headIco.status !== 200) fail(`HEAD /favicon.ico → ${headIco.status}`);
    else if (headIco.body.length !== 0) fail('HEAD /favicon.ico sent a body');
    else ok('HEAD /favicon.ico → 200');

    const getSvg = await fetchRaw(base, 'GET', '/favicon.svg');
    if (getSvg.status !== 200 || !/svg/i.test(getSvg.type)) {
      fail(`GET /favicon.svg → ${getSvg.status} ${getSvg.type}`);
    } else ok('GET /favicon.svg → 200');

    const getApple = await fetchRaw(base, 'GET', '/apple-touch-icon.png');
    if (getApple.status !== 200 || !/png/i.test(getApple.type)) {
      fail(`GET /apple-touch-icon.png → ${getApple.status} ${getApple.type}`);
    } else ok('GET /apple-touch-icon.png → 200');

    const pages = ['/', '/login', '/admin', '/legal/about.html', '/404.html'];
    for (const page of pages) {
      const res = await fetchRaw(base, 'GET', page);
      const expect = page === '/404.html' ? 404 : 200;
      if (res.status !== expect) fail(`GET ${page} → ${res.status} (want ${expect})`);
      else if (!htmlHasIcons(res.body)) fail(`GET ${page} missing favicon links`);
      else ok(`GET ${page} → ${res.status} with favicon links`);
    }

    const missing = await fetchRaw(base, 'GET', '/this-page-does-not-exist');
    if (missing.status !== 404) fail(`unknown path → ${missing.status}`);
    else if (!htmlHasIcons(missing.body)) fail('404 page missing favicon links');
    else ok('unknown path stays 404 and still links the icon');
  } catch (err) {
    fail(err.message);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  if (failed) {
    console.error(`verify-favicon: ${failed} failed`);
    process.exit(1);
  }
  console.log('verify-favicon: ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
