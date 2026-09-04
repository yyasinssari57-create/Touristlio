/**
 * [ORTA-4] Anti-bot / fake vote: Redis/memory 5/min limiter, CSRF token, duplicate vote.
 * Usage: node server/scripts/verify-anti-bot.js
 * Optional: VERIFY_VOTES_URL=http://127.0.0.1:3055 node server/scripts/verify-anti-bot.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { memoryIncrement, resetMemory, backendName } = require('../lib/rate-limit-store');
const { tokensEqual, CSRF_COOKIE } = require('../middleware/csrf');
const { TIOLA_VOTE_MAX, TIOLA_VOTE_WINDOW_MS } = require('../middleware/tiolaVoteLimit');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}

console.log('verify-anti-bot');

if (TIOLA_VOTE_MAX !== 5) fail(`vote max expected 5 got ${TIOLA_VOTE_MAX}`);
else ok('Tiola vote limit is 5 / minute');
if (TIOLA_VOTE_WINDOW_MS !== 60 * 1000) fail(`window expected 60000 got ${TIOLA_VOTE_WINDOW_MS}`);
else ok('vote window is 60s');

resetMemory();
const k = 'verify:tiola:vote:test';
const w = 60 * 1000;
for (let i = 1; i <= 5; i += 1) {
  const r = memoryIncrement(k, w);
  if (r.count !== i) fail(`memory increment ${i} got ${r.count}`);
}
ok('memory store counts 1..5');
const sixth = memoryIncrement(k, w);
if (sixth.count !== 6) fail(`6th increment expected 6 got ${sixth.count}`);
else ok('6th increment is 6 (over limit)');
if (sixth.backend !== 'memory') fail(`expected memory backend, got ${sixth.backend}`);
else ok('unit store backend=memory');
resetMemory();

if (!tokensEqual('aa', 'aa') || tokensEqual('aa', 'ab') || tokensEqual('aa', 'aaa')) {
  fail('tokensEqual mismatch');
} else ok('CSRF tokensEqual constant-time compare');

const routes = fs.readFileSync(path.join(ROOT, 'server', 'routes', 'tiolas.js'), 'utf8');
if (!routes.includes('csrfTokenRequired') || !routes.includes('tiolaVoteLimiter')) {
  fail('tiolas routes missing CSRF token or vote limiter');
} else ok('Tiola mutating routes use CSRF token + like vote limiter');
if (!routes.includes('tiolaFormLimiter') || !routes.includes("recaptchaGuard('tiola')") || !routes.includes('honeypotGuard(TIOLA_OK)')) {
  fail('POST /api/tiolas missing form limiter, recaptcha, or honeypot fake 200');
} else ok('POST /api/tiolas uses 3/5 min form limiter + recaptcha + honeypot 200');
if (!routes.includes("kind: 'duplicate_vote'")) fail('duplicate vote not logged');
else ok('duplicate vote writes anti-bot log');
if (!routes.includes('idx_tiolas_unique_user_place_vote') && !fs.readFileSync(path.join(ROOT, 'db/migrations/007_tiola_unique_vote.js'), 'utf8').includes('idx_tiolas_unique_user_place_vote')) {
  fail('unique vote index migration missing');
} else ok('unique vote index migration');

const csrfMw = fs.readFileSync(path.join(ROOT, 'server/middleware/csrf.js'), 'utf8');
if (!csrfMw.includes('csrfTokenRequired') || !csrfMw.includes('timingSafeEqual')) {
  fail('csrf token middleware incomplete');
} else ok('CSRF token middleware uses timingSafeEqual');

const appJs = fs.readFileSync(path.join(ROOT, 'public/js/app.js'), 'utf8');
if (!appJs.includes('X-CSRF-Token')) fail('app.js api() missing CSRF header');
else ok('app.js sends X-CSRF-Token');
if (/googleRating|google_rating|gRating/.test(appJs)) fail('Google rating leaked');
else ok('no Google ratings');

const fsJs = fs.readFileSync(path.join(ROOT, 'public/js/form-security.js'), 'utf8');
if (!fsJs.includes('ensureCsrf') || !fsJs.includes('csrfToken')) fail('form-security missing CSRF helper');
else ok('form-security.js CSRF helper');

const idx = fs.readFileSync(path.join(ROOT, 'server/index.js'), 'utf8');
if (!idx.includes("app.get('/api/csrf'") && !idx.includes('csrfTokenHandler')) {
  fail('GET /api/csrf missing');
} else ok('GET /api/csrf');

const { initDb, db } = require('../db');
async function checkUniqueIndex() {
  try {
    await initDb();
    const row = await db.prepare(`
      SELECT indexname AS name FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = 'idx_tiolas_unique_user_place_vote'
    `).get();
    if (!row || !row.name) fail('unique vote index not applied');
    else ok('idx_tiolas_unique_user_place_vote exists');
  } catch (e) {
    console.log('  · skipped unique index DB check:', e.message);
  }
}

function mergeCookies(jar, setCookie) {
  const list = !setCookie ? [] : (Array.isArray(setCookie) ? setCookie : [setCookie]);
  for (const line of list) {
    const part = String(line).split(';')[0];
    const eq = part.indexOf('=');
    if (eq < 1) continue;
    jar[part.slice(0, eq).trim()] = part.slice(eq + 1);
  }
}

function cookieHeader(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}

function request(url, { method = 'GET', body, headers, jar } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body == null ? null : (typeof body === 'string' ? body : JSON.stringify(body));
    const hdrs = { ...(headers || {}) };
    if (jar && Object.keys(jar).length) hdrs.Cookie = cookieHeader(jar);
    if (payload != null && !hdrs['Content-Type']) hdrs['Content-Type'] = 'application/json';
    if (payload != null) hdrs['Content-Length'] = Buffer.byteLength(payload);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method,
      headers: hdrs,
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (jar) mergeCookies(jar, res.headers['set-cookie']);
        let json = {};
        try { json = JSON.parse(data); } catch { /* ignore */ }
        resolve({ status: res.statusCode, json, body: data, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (payload != null) req.write(payload);
    req.end();
  });
}

function waitForServer(url, tries) {
  const max = tries || 400;
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      n += 1;
      const req = http.get(url, { timeout: 1000 }, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (n >= max) reject(new Error('server did not start'));
        else setTimeout(tick, 250);
      });
      req.on('timeout', () => {
        req.destroy();
        if (n >= max) reject(new Error('server did not start'));
        else setTimeout(tick, 250);
      });
    };
    tick();
  });
}

function unwrap(json) {
  if (json && json.success === true && json.data != null) return json.data;
  return json;
}

async function checkLive(base) {
  const root = base.replace(/\/$/, '');
  const origin = root;
  const jar = {};

  const csrfGet = await request(`${root}/api/csrf`, { jar });
  if (csrfGet.status !== 200 || !csrfGet.json.csrfToken) {
    fail(`GET /api/csrf HTTP ${csrfGet.status}`);
  } else ok('GET /api/csrf returns token');
  if (!jar[CSRF_COOKIE]) fail('tl_csrf cookie not set');
  else ok('tl_csrf cookie set');

  const cfg = await request(`${root}/api/config/public`, { jar });
  if (cfg.status !== 200) fail(`GET /api/config/public HTTP ${cfg.status}`);
  else if (!cfg.json.csrfToken) fail('public config missing csrfToken');
  else ok('GET /api/config/public includes csrfToken');

  const email = `antibot-${Date.now()}@touristlio.local`;
  const register = await request(`${root}/api/auth/register`, {
    method: 'POST',
    jar,
    headers: { Origin: origin },
    body: {
      name: 'Anti Bot',
      email,
      password: 'TestVote12345',
      kvkkAccepted: true,
      website: '',
    },
  });
  if (register.status !== 201) {
    fail(`register HTTP ${register.status}: ${register.body.slice(0, 180)}`);
    return;
  }
  ok('registered test user');
  if (!jar.tl_token) fail('auth cookie missing after register');
  else ok('auth cookie set');

  const placesRes = await request(`${root}/api/places?page=1&limit=20`);
  const placesPay = unwrap(placesRes.json);
  const places = placesPay.places || placesPay.items || [];
  if (placesRes.status !== 200 || places.length < 2) {
    fail(`need ≥2 places for vote tests, got ${places.length}`);
    return;
  }
  ok(`${places.length} places for vote tests`);

  const csrf = jar[CSRF_COOKIE];
  const noToken = await request(`${root}/api/tiolas`, {
    method: 'POST',
    jar,
    headers: { Origin: origin },
    body: {
      text: 'CSRF korumasız Tiola denemesi yeterli uzunlukta.',
      stars: 5,
      placeId: places[0].id,
      website: '',
    },
  });
  if (noToken.status !== 403) fail(`missing CSRF token HTTP ${noToken.status}, expected 403`);
  else ok('Tiola POST without CSRF token → 403');

  const badToken = await request(`${root}/api/tiolas`, {
    method: 'POST',
    jar,
    headers: { Origin: origin, 'X-CSRF-Token': '0'.repeat(64) },
    body: {
      text: 'Yanlış CSRF token ile Tiola denemesi.',
      stars: 5,
      placeId: places[0].id,
      website: '',
    },
  });
  if (badToken.status !== 403) fail(`bad CSRF token HTTP ${badToken.status}, expected 403`);
  else ok('Tiola POST with mismatched CSRF token → 403');

  async function postTiola(placeId, stars, extraBody) {
    return request(`${root}/api/tiolas`, {
      method: 'POST',
      jar,
      headers: { Origin: origin, 'X-CSRF-Token': csrf },
      body: {
        text: `ORTA-4 anti-bot verify Tiola for place ${placeId}`,
        stars,
        placeId,
        website: '',
        ...extraBody,
      },
    });
  }

  const honey = await postTiola(places[0].id, 5, { website: 'https://spam.example' });
  if (honey.status !== 200) fail(`tiola honeypot HTTP ${honey.status}`);
  else ok('Tiola honeypot returns fake 200');
  if (!honey.json.ok || honey.json.tiola) fail('tiola honeypot should not create a row');
  else ok('Tiola honeypot payload has no tiola');

  const first = await postTiola(places[0].id, 5);
  if (first.status !== 201) fail(`first vote HTTP ${first.status}: ${first.body.slice(0, 200)}`);
  else ok('first Tiola vote accepted (201)');

  const dup = await postTiola(places[0].id, 4);
  if (dup.status !== 409) fail(`duplicate vote HTTP ${dup.status}, expected 409`);
  else ok('duplicate vote rejected 409');
  const dupMsg = String(dup.json.error || '');
  if (!dupMsg.toLowerCase().includes('zaten')) fail(`duplicate message: ${dupMsg}`);
  else ok('duplicate vote copy mentions existing rating');

  const limited = await postTiola(places[1].id, 5);
  if (limited.status !== 429) fail(`4th Tiola POST HTTP ${limited.status}, expected 429`);
  else ok('4th Tiola POST rate-limited 429 (3 / 5 min)');
  if (!String(limited.json.error || '').includes('5 dakika')) {
    fail(`rate limit message: ${limited.json.error}`);
  } else ok('rate limit error mentions 5 minute window');
}

function spawnServer(port) {
  return spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'development',
      SITEMAP_ON_START: 'false',
      LIVE_DATA_CRON: 'false',
      RECAPTCHA_SITE_KEY: '',
      RECAPTCHA_SECRET: '',
      REDIS_URL: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function main() {
  await checkUniqueIndex();
  const given = process.env.VERIFY_VOTES_URL;
  if (given) {
    await checkLive(given);
  } else {
    const port = process.env.VERIFY_VOTES_PORT || '3055';
    const child = spawnServer(port);
    let stderr = '';
    child.stderr.on('data', (c) => { stderr += c; });
    const base = `http://127.0.0.1:${port}`;
    try {
      await waitForServer(base, 400);
      await checkLive(base);
    } catch (e) {
      fail(`live server :${port}: ${e.message}${stderr ? ` (${stderr.slice(0, 240)})` : ''}`);
    } finally {
      child.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 200));
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
    }
  }

  console.log(`  store backend (this process): ${backendName()}`);
  if (failed) {
    console.error(`verify-anti-bot: ${failed} failed`);
    process.exit(1);
  }
  console.log('verify-anti-bot: ok');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
