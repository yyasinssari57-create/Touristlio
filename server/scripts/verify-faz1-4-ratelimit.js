/**
 * Claude Master PRD — FAZ1-4 (rate limiting / tüm kritik endpoint'ler).
 * Gap analysis sonucu: auth, passwordReset, tiola, search, contact ve genel
 * `/api/*` limiterları mevcuttu. 2026 ayarı: paylaşılan 300/15 dk IP kovası
 * gezinme / yazma / izleme / admin olarak ayrıldı. Giriş (20/15 dk), iletişim
 * ve Tiola formu (3/5 dk), arama (60/dk) ve Tiola oyu (5/dk) sıkı duruyor.
 *
 * Usage: node server/scripts/verify-faz1-4-ratelimit.js
 * Optional: VERIFY_RL_URL=http://127.0.0.1:3061 node server/scripts/verify-faz1-4-ratelimit.js
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

console.log('verify-faz1-4-ratelimit');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// --- 1. Limiter tavanları (kaynak metin). express-rate-limit v7 options'ı dışa açmaz. ---
const {
  authLimiter,
  searchLimiter,
  contactLimiter,
  formLimiter,
  tiolaFormLimiter,
  apiLimiter,
  browseLimiter,
  writeLimiter,
  trackLimiter,
  adminIpLimiter,
  adminLimiter,
} = require('../middleware/rateLimit');
const { TIOLA_VOTE_MAX, TIOLA_VOTE_WINDOW_MS } = require('../middleware/tiolaVoteLimit');

const rlSrcForConfig = read('server/middleware/rateLimit.js');

function assertIncludes(snippet, label) {
  if (!rlSrcForConfig.includes(snippet)) fail(`${label} bulunamadı`);
  else ok(label);
}

assertIncludes("envMax(['AUTH_RATE_LIMIT_MAX'], 20)", 'authLimiter 20 / 15 dk (giriş koruması duruyor)');
assertIncludes('windowMs: WINDOW_15', '15 dk pencereli kovalar duruyor');
assertIncludes("envMax(['SEARCH_RATE_LIMIT_MAX'], 60)", 'searchLimiter 60 / dk (değişmedi)');
assertIncludes("envMax(['FORM_RATE_LIMIT_MAX'], 3)", 'formLimiter / tiolaFormLimiter 3 / 5 dk (değişmedi)');
assertIncludes('5 * 60 * 1000', 'form penceresi 5 dk');
assertIncludes("envMax(['BROWSE_RATE_LIMIT_MAX', 'RATE_LIMIT_MAX'], 600)", 'browseLimiter 600 / 15 dk (RATE_LIMIT_MAX hâlâ bu kovayı ezer)');
assertIncludes("envMax(['WRITE_RATE_LIMIT_MAX'], 120)", 'writeLimiter 120 / 15 dk');
assertIncludes("envMax(['TRACK_RATE_LIMIT_MAX'], 180)", 'trackLimiter 180 / 15 dk');
assertIncludes("envMax(['ADMIN_RATE_LIMIT_MAX'], 400)", 'admin IP + oturum limiti 400 / 15 dk');
assertIncludes("envMax(['ADMIN_TOOL_RATE_LIMIT_MAX'], 30)", 'adminToolLimiter 30 / 15 dk');
assertIncludes("startsWithPath(path, '/api/auth')", 'giriş istekleri genel kovaya yazılmıyor');
assertIncludes("startsWithPath(path, '/api/contact')", 'iletişim istekleri genel kovaya yazılmıyor');
assertIncludes('return adminIpLimiter(req, res, next)', 'personel API ayrı IP kovasında');
assertIncludes('return browseLimiter(req, res, next)', 'GET/HEAD gezinme kovasında');
assertIncludes('return writeLimiter(req, res, next)', 'diğer yazmalar kendi kovasında');
assertIncludes('retryAfterSeconds', 'limit yanıtı kaç saniye bekleneceğini söyler');
assertIncludes('standardHeaders: true', 'standardHeaders açık — 429 Retry-After başlığı gider');

if (contactLimiter !== formLimiter) fail('contactLimiter formLimiter ile aynı kova olmaktan çıkmış');
else ok('contactLimiter === formLimiter (iletişim/kayıt/şifre-unuttum ortak IP kovası, değişmedi)');

const exported = {
  authLimiter,
  searchLimiter,
  apiLimiter,
  browseLimiter,
  writeLimiter,
  trackLimiter,
  adminIpLimiter,
  adminLimiter,
};
for (const [name, fn] of Object.entries(exported)) {
  if (typeof fn !== 'function') fail(`${name} middleware olarak export edilmemiş`);
}
if (!failed) ok('auth / search / browse / write / track / admin kovaları export ediliyor');

if (TIOLA_VOTE_MAX !== 5) fail(`tiolaVoteLimiter max değişmiş (beklenen 5, gelen ${TIOLA_VOTE_MAX})`);
else ok('tiolaVoteLimiter 5 / dk (ORTA-4, değişmedi)');
if (TIOLA_VOTE_WINDOW_MS !== 60 * 1000) fail('tiolaVoteLimiter window değişmiş');
else ok('tiolaVoteLimiter window 60 sn (değişmedi)');

// --- 2. Route wiring: limiterlar doğru endpoint'lere bağlı mı? ---

const authRoutes = read('server/modules/auth/auth.routes.js');
const criticalAuthRoutes = ['/register', '/login', '/forgot-password', '/reset-password', '/verify-email', '/change-password', '/change-email', '/resend-verification'];
for (const route of criticalAuthRoutes) {
  const re = new RegExp(`router\\.post\\(\\s*'${route.replace('/', '\\/')}'[\\s\\S]{0,160}?authLimiter`);
  if (!re.test(authRoutes)) fail(`${route} authLimiter kullanmıyor`);
  else ok(`${route} → authLimiter bağlı`);
}

const searchRoutes = read('server/routes/search.js');
if (!searchRoutes.includes('searchLimiter')) fail('GET /api/search searchLimiter kullanmıyor');
else ok('GET /api/search → searchLimiter bağlı');
const placesRoutes = read('server/modules/places/places.routes.js');
if (!placesRoutes.includes("router.get('/search', searchLimiter")) fail('GET /api/places/search searchLimiter kullanmıyor');
else ok('GET /api/places/search → searchLimiter bağlı');

const contactRoutes = read('server/routes/contact.js');
if (!contactRoutes.includes('contactLimiter')) fail('POST /api/contact contactLimiter kullanmıyor');
else ok('POST /api/contact → contactLimiter bağlı');

const tiolaRoutes = read('server/routes/tiolas.js');
if (!tiolaRoutes.includes('tiolaFormLimiter')) fail('POST /api/tiolas tiolaFormLimiter kullanmıyor');
else ok('POST /api/tiolas → tiolaFormLimiter bağlı');
if (!tiolaRoutes.includes('tiolaVoteLimiter')) fail('POST /api/tiolas/:id/like tiolaVoteLimiter kullanmıyor');
else ok('POST /api/tiolas/:id/like → tiolaVoteLimiter bağlı (5/dk)');

const indexJs = read('server/index.js');
if (!/app\.use\(\s*'\/api\/'\s*,\s*apiLimiter\s*\)/.test(indexJs)) {
  fail("app.use('/api/', apiLimiter) bulunamadı — genel catch-all kayboldu");
} else ok("app.use('/api/', apiLimiter) duruyor — /api/* kova yönlendiricisi altında");

const adminRoutesSrc = read('server/routes/admin.js');
if (!/router\.use\(\s*adminLimiter\s*\)/.test(adminRoutesSrc)) {
  fail('adminLimiter oturumdan sonra bağlı değil');
} else ok('adminLimiter auth sonrası (kullanıcı kovası)');

// --- 3. Bilinçli karar: bot User-Agent skip EKLENMEDİ (PRD'nin aksine) ---
// Gerekçe: UA her istemci tarafından serbestçe ayarlanabilir; "Googlebot" taklidi
// yapan bir kötüye kullanım, tam da apiLimiter'ın durdurmaya çalıştığı trafiği
// limitsiz hale getirir. Bu, arama motoru botlarını korumaktan çok bypass riski
// yaratır. Gezinme kovası (varsayılan 600/15 dk) gerçek botlar için yeterli;
// ayrıca search/contact/tiola gibi kritik uçlar kendi route-özel limiterlarına
// sahip olduğundan UA bazlı istisnaya hiç ihtiyaç yok.
const rlSrc = read('server/middleware/rateLimit.js');
if (/user-agent|googlebot|bingbot/i.test(rlSrc)) {
  fail('rateLimit.js içinde beklenmeyen UA-bazlı bot istisnası bulundu (bilinçli olarak eklenmemeliydi)');
} else ok('apiLimiter UA-bazlı bot istisnası eklenmedi (spoofing riski, bilinçli karar — AUDIT_FOLLOWUPS.md)');

// --- 4. Canlı sunucu: authLimiter ve searchLimiter gerçekten 429 döndürüyor mu? ---

function postJson(url, body, extraHeaders) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = JSON.stringify(body || {});
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        Origin: `${u.protocol}//${u.host}`,
        ...(extraHeaders || {}),
      },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let json = {};
        try { json = JSON.parse(data); } catch { /* ignore */ }
        resolve({ status: res.statusCode, json, body: data, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(payload);
    req.end();
  });
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 10000 }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        let json = {};
        try { json = JSON.parse(body); } catch { /* ignore */ }
        resolve({ status: res.statusCode, json, body, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
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

function spawnServer(port, extraEnv) {
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
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function withServer(port, extraEnv, fn) {
  const child = spawnServer(port, extraEnv);
  let stderr = '';
  child.stderr.on('data', (c) => { stderr += c; });
  const base = `http://127.0.0.1:${port}`;
  try {
    await waitForServer(base, 400);
    await fn(base);
  } catch (e) {
    fail(`live server :${port}: ${e.message}${stderr ? ` (${stderr.slice(0, 220)})` : ''}`);
  } finally {
    child.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 200));
    try { child.kill('SIGKILL'); } catch { /* ignore */ }
  }
}

/** Kendi test sunucusunda düşük bir tavanla gerçek 429 yanıtı doğrulanır (prod DB'ye dokunmaz). */
async function checkAuthLimiter(base) {
  const root = base.replace(/\/$/, '');
  for (let i = 1; i <= 2; i += 1) {
    const r = await postJson(`${root}/api/auth/login`, {
      email: `faz1-4-${i}@touristlio.local`,
      password: 'WrongPassNotUsed123',
    });
    if (r.status !== 401) fail(`login attempt ${i} HTTP ${r.status}, expected 401 (yanlış şifre)`);
    else ok(`login attempt ${i}/2 kota içinde, 401 (yanlış şifre)`);
  }
  const third = await postJson(`${root}/api/auth/login`, {
    email: 'faz1-4-3@touristlio.local',
    password: 'WrongPassNotUsed123',
  });
  if (third.status !== 429) fail(`3rd login HTTP ${third.status}, expected 429 (AUTH_RATE_LIMIT_MAX=2 test)`);
  else ok('3. giriş denemesi 429 (authLimiter çalışıyor)');
  if (!third.headers['retry-after']) fail('auth 429 Retry-After yok');
  else ok('auth 429 Retry-After başlığı var');
  if (!/dakika/.test(String(third.json.error || ''))) fail(`auth 429 mesajı: ${third.json.error}`);
  else ok('auth 429 mesajı kaç dakika bekleneceğini söylüyor');
}

async function checkSearchLimiter(base) {
  const root = base.replace(/\/$/, '');
  for (let i = 1; i <= 2; i += 1) {
    const r = await getJson(`${root}/api/search?q=istanbul`);
    if (r.status !== 200) fail(`search ${i} HTTP ${r.status}, expected 200`);
    else ok(`arama isteği ${i}/2 kota içinde, 200`);
  }
  const third = await getJson(`${root}/api/search?q=istanbul`);
  if (third.status !== 429) fail(`3rd search HTTP ${third.status}, expected 429 (SEARCH_RATE_LIMIT_MAX=2 test)`);
  else ok('3. arama isteği 429 (searchLimiter çalışıyor)');
}

/** Gezinme kotası dolunca giriş hâlâ kendi kovasında kalır. */
async function checkBrowseSeparateFromLogin(base) {
  const root = base.replace(/\/$/, '');
  for (let i = 1; i <= 2; i += 1) {
    const r = await getJson(`${root}/api/config/public`);
    if (r.status !== 200) fail(`browse ${i} HTTP ${r.status}, expected 200`);
    else ok(`gezinme isteği ${i}/2 kota içinde, 200`);
  }
  const third = await getJson(`${root}/api/config/public`);
  if (third.status !== 429) fail(`3rd browse HTTP ${third.status}, expected 429 (BROWSE_RATE_LIMIT_MAX=2)`);
  else ok('3. gezinme isteği 429 (browseLimiter)');
  if (!third.headers['retry-after']) fail('browse 429 Retry-After yok');
  else ok(`browse 429 Retry-After=${third.headers['retry-after']}`);
  if (!/dakika/.test(String(third.json.error || ''))) fail(`browse 429 mesajı: ${third.json.error}`);
  else ok('browse 429 mesajı dakika söylüyor');

  const login = await postJson(`${root}/api/auth/login`, {
    email: 'bucket-split@touristlio.local',
    password: 'WrongPassNotUsed123',
  });
  if (login.status === 429) fail('giriş, gezinme kovasına yazılmış (429)');
  else if (login.status !== 401) fail(`login after browse cap HTTP ${login.status}, expected 401`);
  else ok('gezinme kotası doluyken giriş 401 (ayrı kova)');
}

/** Admin IP kovası gezinme kovasını doldurmaz. */
async function checkAdminSeparateFromBrowse(base) {
  const root = base.replace(/\/$/, '');
  for (let i = 1; i <= 2; i += 1) {
    const r = await getJson(`${root}/api/admin/stats`);
    if (r.status === 429) fail(`admin ${i} beklenmedik 429`);
    else if (r.status !== 401 && r.status !== 403) fail(`admin ${i} HTTP ${r.status}, expected 401`);
    else ok(`admin isteği ${i}/2 kota içinde, ${r.status}`);
  }
  const third = await getJson(`${root}/api/admin/stats`);
  if (third.status !== 429) fail(`3rd admin HTTP ${third.status}, expected 429 (ADMIN_RATE_LIMIT_MAX=2)`);
  else ok('3. admin isteği 429 (adminIpLimiter)');
  if (!/dakika/.test(String(third.json.error || ''))) fail(`admin 429 mesajı: ${third.json.error}`);
  else ok('admin 429 mesajı dakika söylüyor');
  const browse = await getJson(`${root}/api/config/public`);
  if (browse.status !== 200) fail(`browse after admin cap HTTP ${browse.status}, expected 200`);
  else ok('admin kotası gezinme kovasını doldurmadı');
}

async function main() {
  const given = process.env.VERIFY_RL_URL;
  if (given) {
    await checkAuthLimiter(given);
  } else {
    await withServer(process.env.VERIFY_RL_AUTH_PORT || '3061', {
      AUTH_RATE_LIMIT_MAX: '2',
    }, checkAuthLimiter);
    await withServer(process.env.VERIFY_RL_SEARCH_PORT || '3062', {
      SEARCH_RATE_LIMIT_MAX: '2',
    }, checkSearchLimiter);
    await withServer(process.env.VERIFY_RL_BROWSE_PORT || '3063', {
      BROWSE_RATE_LIMIT_MAX: '2',
    }, checkBrowseSeparateFromLogin);
    await withServer(process.env.VERIFY_RL_ADMIN_PORT || '3064', {
      ADMIN_RATE_LIMIT_MAX: '2',
    }, checkAdminSeparateFromBrowse);
  }
  if (failed) {
    console.error(`verify-faz1-4-ratelimit: ${failed} failed`);
    process.exit(1);
  }
  console.log('verify-faz1-4-ratelimit: ok');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
