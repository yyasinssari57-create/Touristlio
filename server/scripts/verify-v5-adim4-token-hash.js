#!/usr/bin/env node
/**
 * V5 Adım 4 — tokens not logged; stored hashed; verify expiry + single-use.
 *
 * Usage: npm run verify:v5-adim4
 */
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const {
  AUTH_TOKEN_HASH_PREFIX,
  hashAuthToken,
  isHashedAuthToken,
  verificationExpiresAt,
} = require('../lib/token-hash');
const { requestLogPath } = require('../lib/request-log-path');
const { migrateAuthTokenHashes } = require('../lib/migrate-auth-token-hashes');

const ROOT = path.join(__dirname, '..', '..');
const PORT = process.env.VERIFY_V5_ADIM4_PORT || '3194';

let failed = 0;

function ok(message) {
  console.log('  ✓', message);
}

function fail(message) {
  console.error('  ✗', message);
  failed += 1;
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function request(url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body == null ? null : Buffer.from(JSON.stringify(body));
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method,
      headers: {
        Accept: 'application/json',
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* ignore */ }
        resolve({ status: res.statusCode, body: text, json });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function staticChecks() {
  console.log('verify-v5-adim4-token-hash');
  const indexJs = read('server/index.js');
  const modelJs = read('server/modules/auth/auth.model.js');
  const antiBot = read('server/lib/anti-bot-log.js');
  const mig = read('db/migrations/020_v5_adim4_token_hash.js');

  if (!/requestLogPath/.test(indexJs)) fail('index.js requestLogPath kullanmıyor');
  else ok('istek logu requestLogPath kullanıyor');
  if (/logger\.info\(\{ method: req\.method, url: req\.url/.test(indexJs)) {
    fail('istek logu hâlâ req.url yazıyor');
  } else ok('istek logu req.url yazmıyor');

  if (!/hashAuthToken/.test(modelJs) || !/verification_token_expires_at/.test(modelJs)) {
    fail('auth.model hash / expiry eksik');
  } else ok('auth.model token hash + expiry');

  if (!/requestLogPath/.test(antiBot)) fail('anti-bot-log query string sızdırabilir');
  else ok('anti-bot-log path redakte');

  if (!mig.includes('migrateAuthTokenHashes')) fail('020 migration eksik');
  else ok('020_v5_adim4_token_hash migration var');

  const fakeReq = { originalUrl: '/verify-email?token=SECRETVALUE&code=1', url: '/verify-email?token=SECRETVALUE' };
  const logged = requestLogPath(fakeReq);
  if (logged.includes('token=') || logged.includes('SECRETVALUE') || logged.includes('?')) {
    fail(`requestLogPath query bırakıyor: ${logged}`);
  } else ok(`requestLogPath → ${logged}`);

  const raw = 'abc123rawtoken';
  const hashed = hashAuthToken(raw);
  if (!hashed.startsWith(AUTH_TOKEN_HASH_PREFIX) || hashed.includes(raw)) {
    fail('hashAuthToken beklenen biçimde değil');
  } else ok('hashAuthToken sha256$ önekli');
  if (!isHashedAuthToken(hashed) || isHashedAuthToken(raw)) fail('isHashedAuthToken hatalı');
  else ok('isHashedAuthToken doğru');
}

async function waitHealth(base) {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await request(`${base}/api/health`);
      if (res.status === 200) return;
    } catch { /* retry */ }
    await sleep(250);
  }
  throw new Error('sunucu ayağa kalkmadı');
}

async function runtimeChecks(base) {
  require('dotenv').config({ path: path.join(ROOT, '.env') });
  const { initDb, db } = require('../db');
  await initDb();

  // Dry-run migration preview (no write beyond column ensure which boot already did)
  const dry = await migrateAuthTokenHashes(db, { dryRun: true });
  ok(`migration dry-run: verify=${dry.verificationToHash} resetHash=${dry.resetToHash} resetDel=${dry.resetExpiredDeleted}`);

  const stamp = Date.now();
  const email = `v5adim4-${stamp}@touristlio.local`;
  const password = 'ValidPass1';
  const origin = base;

  const reg = await request(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { Origin: origin },
    body: { name: 'V5 Adim4', email, password, website: '', kvkkAccepted: true },
  });
  if (reg.status !== 201) {
    fail(`register HTTP ${reg.status} ${(reg.body || '').slice(0, 160)}`);
    return;
  }
  ok('kayıt 201');

  const user = await db.prepare('SELECT id, verification_token, verification_token_expires_at FROM users WHERE email = ?').get(email);
  if (!user?.id) {
    fail('kayıtlı kullanıcı yok');
    return;
  }
  if (!isHashedAuthToken(user.verification_token)) fail('DB’de ham doğrulama token’ı var');
  else ok('doğrulama token’ı DB’de hash’li');
  if (!user.verification_token_expires_at) fail('verification_token_expires_at boş');
  else ok(`doğrulama süresi var: ${user.verification_token_expires_at}`);

  // Capture raw token by rewriting with known raw (simulates email link)
  const rawVerify = crypto.randomBytes(24).toString('hex');
  await db.prepare(`
    UPDATE users SET verification_token = ?, verification_token_expires_at = ?, email_verified = 0 WHERE id = ?
  `).run(hashAuthToken(rawVerify), verificationExpiresAt(), user.id);

  const verify1 = await request(`${base}/api/auth/verify-email`, {
    method: 'POST',
    headers: { Origin: origin },
    body: { token: rawVerify },
  });
  if (verify1.status !== 200) fail(`verify-email 1 HTTP ${verify1.status}`);
  else ok('doğrulama linki çalışır');

  const after = await db.prepare('SELECT email_verified, verification_token FROM users WHERE id = ?').get(user.id);
  if (!after?.email_verified || after.verification_token) fail('tek kullanımlık doğrulama başarısız');
  else ok('doğrulama tek kullanımlık (token silindi)');

  const verify2 = await request(`${base}/api/auth/verify-email`, {
    method: 'POST',
    headers: { Origin: origin },
    body: { token: rawVerify },
  });
  if (verify2.status === 200) fail('ikinci doğrulama kabul edildi');
  else ok(`ikinci doğrulama reddedildi (${verify2.status})`);

  // Expired verification
  const rawExpired = crypto.randomBytes(24).toString('hex');
  const past = new Date(Date.now() - 60_000).toISOString().slice(0, 19).replace('T', ' ');
  await db.prepare(`
    UPDATE users SET verification_token = ?, verification_token_expires_at = ?, email_verified = 0 WHERE id = ?
  `).run(hashAuthToken(rawExpired), past, user.id);
  const verifyExp = await request(`${base}/api/auth/verify-email`, {
    method: 'POST',
    headers: { Origin: origin },
    body: { token: rawExpired },
  });
  if (verifyExp.status === 200) fail('süresi dolmuş doğrulama kabul edildi');
  else ok(`süresi dolmuş doğrulama reddedildi (${verifyExp.status})`);

  const forgot = await request(`${base}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { Origin: origin },
    body: { email, website: '' },
  });
  if (forgot.status !== 200) fail(`forgot-password HTTP ${forgot.status}`);
  else ok('şifre sıfırlama isteği 200');

  const resetStored = await db.prepare(`
    SELECT id, token FROM password_reset_tokens WHERE user_id = ? AND used = 0 ORDER BY id DESC LIMIT 1
  `).get(user.id);
  if (!resetStored?.token || !isHashedAuthToken(resetStored.token)) {
    fail('sıfırlama token’ı hash’li saklanmadı');
  } else ok('sıfırlama token’ı DB’de hash’li');

  const rawReset = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 3600000).toISOString().slice(0, 19).replace('T', ' ');
  await db.prepare('UPDATE password_reset_tokens SET token = ?, expires_at = ? WHERE id = ?')
    .run(hashAuthToken(rawReset), expires, resetStored.id);

  const newPass = 'ResetPass99';
  const reset1 = await request(`${base}/api/auth/reset-password`, {
    method: 'POST',
    headers: { Origin: origin },
    body: { token: rawReset, password: newPass },
  });
  if (reset1.status !== 200) fail(`reset-password HTTP ${reset1.status} ${(reset1.body || '').slice(0, 160)}`);
  else ok('şifre sıfırlama çalışır');

  const reset2 = await request(`${base}/api/auth/reset-password`, {
    method: 'POST',
    headers: { Origin: origin },
    body: { token: rawReset, password: 'AnotherPass1' },
  });
  if (reset2.status === 200) fail('ikinci sıfırlama kabul edildi');
  else ok(`ikinci sıfırlama reddedildi (${reset2.status})`);

  const login = await request(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { Origin: origin },
    body: { email, password: newPass, website: '' },
  });
  if (login.status !== 200) fail(`yeni şifreyle giriş HTTP ${login.status}`);
  else ok('yeni şifreyle giriş OK');

  // Plaintext must not remain for this user
  const leftoverVerify = await db.prepare(`
    SELECT verification_token AS t FROM users WHERE id = ? AND verification_token IS NOT NULL AND verification_token NOT LIKE ?
  `).get(user.id, `${AUTH_TOKEN_HASH_PREFIX}%`);
  const leftoverReset = await db.prepare(`
    SELECT token AS t FROM password_reset_tokens WHERE user_id = ? AND token NOT LIKE ?
  `).get(user.id, `${AUTH_TOKEN_HASH_PREFIX}%`);
  if (leftoverVerify || leftoverReset) fail('DB’de ham token kaldı');
  else ok('bu kullanıcı için DB’de ham token yok');
}

async function main() {
  staticChecks();

  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'development',
      SITEMAP_ON_START: 'false',
      LIVE_DATA_CRON: 'false',
      SEED_ON_START: 'false',
      REQUIRE_EMAIL_VERIFICATION: 'false',
      AUTH_RATE_LIMIT_MAX: '200',
      FORM_RATE_LIMIT_MAX: '200',
      RECAPTCHA_SITE_KEY: '',
      RECAPTCHA_SECRET: '',
      LOG_LEVEL: 'info',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let logBuf = '';
  child.stdout.on('data', (c) => { logBuf += c.toString('utf8'); });
  child.stderr.on('data', (c) => { logBuf += c.toString('utf8'); });

  const base = `http://127.0.0.1:${PORT}`;
  try {
    await waitHealth(base);
    await runtimeChecks(base);

    // Hit a URL with token query and ensure server log buffer has no secret
    const secret = `logprobe-${crypto.randomBytes(8).toString('hex')}`;
    await request(`${base}/verify-email?token=${secret}`);
    await sleep(300);
    if (logBuf.includes(secret) || /token=[0-9a-f]{16,}/i.test(logBuf)) {
      fail('sunucu logunda token= değeri göründü');
    } else ok('istek logunda token= değeri yok');
  } catch (err) {
    fail(err.message || String(err));
  } finally {
    child.kill('SIGTERM');
    await sleep(400);
    try { child.kill('SIGKILL'); } catch { /* ignore */ }
  }

  if (failed) {
    console.error(`\nverify-v5-adim4 FAILED (${failed})`);
    process.exit(1);
  }
  console.log('\nverify-v5-adim4 OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
