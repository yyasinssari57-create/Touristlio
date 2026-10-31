/**
 * FAZ2-1 — JS code splitting: avatar-crop.js (and the already-lazy Leaflet/map
 * bundle from Gemini Faz 3) must not load on initial paint of public pages.
 * Usage: node server/scripts/verify-faz2-1-code-split.js
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

console.log('verify-faz2-1-code-split');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

const indexHtml = read('public/index.html');
const profileHtml = read('public/profile.html');
const appJs = read('public/js/app.js');

// ---- static checks ----

if (/<script[^>]+src="\/js\/avatar-crop\.js/.test(indexHtml)) {
  fail('index.html still eager-loads avatar-crop.js');
} else ok('index.html does not eager-load avatar-crop.js');

if (/<script[^>]+src="\/js\/avatar-crop\.js/.test(profileHtml)) {
  fail('profile.html still eager-loads avatar-crop.js');
} else ok('profile.html does not eager-load avatar-crop.js');

if (!appJs.includes('function ensureAvatarCropLib')) {
  fail('app.js missing ensureAvatarCropLib() lazy-loader');
} else ok('app.js has ensureAvatarCropLib() lazy-loader');

if (!/avatarFile[\s\S]{0,400}ensureAvatarCropLib/.test(appJs)) {
  fail('app.js avatar file input does not await ensureAvatarCropLib() before opening cropper');
} else ok('app.js avatar upload trigger awaits the lazy-loader');

if (!profileHtml.includes('function ensureAvatarCropLib')) {
  fail('profile.html missing ensureAvatarCropLib() lazy-loader');
} else ok('profile.html has ensureAvatarCropLib() lazy-loader');

// ---- make sure we did not touch the already-completed map lazy-load ----
if (/<script[^>]+src="\/vendor\/leaflet\/leaflet\.js/.test(indexHtml)
  || /<script[^>]+src="\/js\/map\.js/.test(indexHtml)) {
  fail('Leaflet / map.js became eager on homepage (regression of Gemini Faz 3)');
} else ok('Leaflet / map.js still lazy on homepage (untouched)');

if (!indexHtml.includes('/js/map-loader.js?v=')) {
  fail('index.html lost map-loader.js (regression)');
} else ok('index.html still loads map-loader.js');

const pkg = JSON.parse(read('package.json'));
if (pkg.scripts['verify:faz2-1'] !== 'node server/scripts/verify-faz2-1-code-split.js') {
  fail('package.json missing verify:faz2-1 script');
} else ok('verify:faz2-1 script registered');

// ---- live checks ----

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 10000 }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8'),
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

async function checkLive(base) {
  const home = await fetchText(`${base}/`);
  if (home.status !== 200) fail(`GET / HTTP ${home.status}`);
  else ok('GET / 200');
  if (/<script[^>]+src="[^"]*\/js\/avatar-crop\.js/.test(home.body)) {
    fail('live homepage still eager-loads avatar-crop.js');
  } else ok('live homepage does not eager-load avatar-crop.js');

  const profile = await fetchText(`${base}/profile`);
  if (profile.status !== 200) fail(`GET /profile HTTP ${profile.status}`);
  else ok('GET /profile 200');
  if (/<script[^>]+src="[^"]*\/js\/avatar-crop\.js/.test(profile.body)) {
    fail('live /profile still eager-loads avatar-crop.js');
  } else ok('live /profile does not eager-load avatar-crop.js');

  const cropFile = await fetchText(`${base}/js/avatar-crop.js`);
  if (cropFile.status !== 200) fail(`GET /js/avatar-crop.js HTTP ${cropFile.status} (must stay reachable for on-demand load)`);
  else ok('/js/avatar-crop.js still reachable for on-demand load');
}

(async () => {
  const external = process.env.VERIFY_FAZ2_1_URL;
  if (external) {
    await checkLive(external.replace(/\/$/, ''));
  } else {
    const port = process.env.VERIFY_FAZ2_1_PORT || '3081';
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
    console.error(`verify-faz2-1-code-split FAILED (${failed})`);
    process.exit(1);
  }
  console.log('verify-faz2-1-code-split OK');
})();
