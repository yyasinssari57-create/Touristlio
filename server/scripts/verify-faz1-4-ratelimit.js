/**
 * Claude Master PRD — FAZ1-4 (rate limiting / tüm kritik endpoint'ler).
 * Gap analysis sonucu: auth, passwordReset, tiola, search, contact ve genel
 * `/api/*` limiterları ZATEN mevcuttu (v1 YÜKSEK-7, v2 YÜKSEK-2, ORTA-4, v2
 * ORTA-5). Bu script mevcut limiterların ayarlarının DEĞİŞMEDİĞİNİ ve doğru
 * route'lara bağlı olduğunu doğrular — yeni bir limiter eklenmedi.
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

// --- 1. Mevcut limiter ayarları değişmemiş mi? (statik config kontrolü) ---
// express-rate-limit v7 middleware'leri çalışma zamanında options'ı dışa
// açmıyor; bu yüzden tanım bloklarını kaynak metinden ayıklayıp kontrol
// ediyoruz (verify-form-security.js'deki `rlJs.includes(...)` deseniyle aynı
// mantık, burada daha sağlam bir blok ayıklayıcıyla).
const {
  authLimiter,
  searchLimiter,
  contactLimiter,
  formLimiter,
  tiolaFormLimiter,
  apiLimiter,
} = require('../middleware/rateLimit');
const { TIOLA_VOTE_MAX, TIOLA_VOTE_WINDOW_MS } = require('../middleware/tiolaVoteLimit');

const rlSrcForConfig = read('server/middleware/rateLimit.js');

function extractLimiterBlock(src, varName) {
  const startMatch = src.match(new RegExp(`const ${varName}\\s*=\\s*rateLimit\\(\\{`));
  if (!startMatch) return null;
  const braceStart = startMatch.index + startMatch[0].length - 1;
  let depth = 0;
  for (let i = braceStart; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(braceStart, i + 1);
    }
  }
  return null;
}

function assertBlock(varName, { windowExpr, maxExpr, label }) {
  const block = extractLimiterBlock(rlSrcForConfig, varName);
  if (!block) {
    fail(`${varName} tanımı rateLimit.js içinde bulunamadı`);
    return;
  }
  if (!block.includes(windowExpr)) fail(`${varName} windowMs değişmiş (beklenen: ${windowExpr})`);
  else if (!block.includes(maxExpr)) fail(`${varName} max değişmiş (beklenen: ${maxExpr})`);
  else ok(label);
}

assertBlock('authLimiter', {
  windowExpr: '15 * 60 * 1000',
  maxExpr: "process.env.AUTH_RATE_LIMIT_MAX) || 20",
  label: 'authLimiter 20 / 15 dk (değişmedi, hesap kilidi 5 hata → 15 dk ayrı duruyor)',
});
assertBlock('searchLimiter', {
  windowExpr: '60 * 1000',
  maxExpr: "process.env.SEARCH_RATE_LIMIT_MAX) || 60",
  label: 'searchLimiter 60 / dk (değişmedi, PRD değeriyle zaten aynı)',
});
assertBlock('formLimiter', {
  windowExpr: '5 * 60 * 1000',
  maxExpr: "process.env.FORM_RATE_LIMIT_MAX) || 3",
  label: 'formLimiter (contactLimiter) 3 / 5 dk (değişmedi)',
});
assertBlock('tiolaFormLimiter', {
  windowExpr: '5 * 60 * 1000',
  maxExpr: "process.env.FORM_RATE_LIMIT_MAX) || 3",
  label: 'tiolaFormLimiter 3 / 5 dk (değişmedi, kayıt/iletişim kovasından ayrı)',
});
assertBlock('apiLimiter', {
  windowExpr: '15 * 60 * 1000',
  maxExpr: "process.env.RATE_LIMIT_MAX) || 300",
  label: "apiLimiter 300 / 15 dk, genel /api/* catch-all zaten mevcut — PRD madde 6 zaten karşılanıyor",
});

if (contactLimiter !== formLimiter) fail('contactLimiter formLimiter ile aynı kova olmaktan çıkmış');
else ok('contactLimiter === formLimiter (iletişim/kayıt/şifre-unuttum ortak IP kovası, değişmedi)');

if (typeof authLimiter !== 'function' || typeof searchLimiter !== 'function' || typeof apiLimiter !== 'function') {
  fail('limiter middleware export edilmemiş fonksiyon');
} else ok('authLimiter / searchLimiter / apiLimiter çalışan Express middleware olarak export ediliyor');

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
} else ok("app.use('/api/', apiLimiter) duruyor — tüm /api/* zaten genel limit altında");

// --- 3. Bilinçli karar: bot User-Agent skip EKLENMEDİ (PRD'nin aksine) ---
// Gerekçe: UA her istemci tarafından serbestçe ayarlanabilir; "Googlebot" taklidi
// yapan bir kötüye kullanım, tam da apiLimiter'ın durdurmaya çalıştığı trafiği
// limitsiz hale getirir. Bu, arama motoru botlarını korumaktan çok bypass riski
// yaratır. Mevcut 300/15dk (≈20/dk) payı zaten Googlebot/Bingbot için yeterli;
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
        resolve({ status: res.statusCode, json, body: data });
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
        resolve({ status: res.statusCode, json, body });
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
