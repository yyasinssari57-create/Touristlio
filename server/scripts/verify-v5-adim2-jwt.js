#!/usr/bin/env node
/**
 * V5 Adım 2 — JWT secret comes only from the environment.
 *
 * Usage: npm run verify:v5-adim2
 *
 * Production with a missing, short, or weak JWT_SECRET must exit.
 * A strong secret must boot, and login/logout must work.
 * The old database copy is not read or overwritten.
 * Needs local Postgres. Uses a throwaway database. Does not write to the app database.
 */
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const RETIRED = ['dev', 'secret', 'change', 'me'].join('-');
const EMAIL = 'v5adim2@test.local';
const PASSWORD = 'ValidPass1';
const DB_NAME = 'touristlio_v5a2';
const PORT = '3192';
const STRONG = 'v5-adim2-jwt-secret-not-for-production-use-only-0123456789';
const WEAK = 'change-this-to-a-long-random-string';
const SHORT = 'kisa-anahtar';
const DB_SECRET = crypto.randomBytes(32).toString('hex');
const SETTING_KEY = 'auth_jwt_secret_fallback';

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

function redact(text) {
  return String(text || '')
    .split(STRONG).join('[jwt]')
    .split(DB_SECRET).join('[dbjwt]')
    .split(PASSWORD).join('[pw]')
    .split(RETIRED).join('[retired]');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function databaseUrl() {
  require('dotenv').config({ path: path.join(ROOT, '.env') });
  const url = String(process.env.DATABASE_URL || '').trim();
  if (!url) throw new Error('DATABASE_URL yok');
  return url;
}

function isLocalDatabase(url) {
  try {
    const parsed = new URL(url.replace(/^postgresql:/, 'http:'));
    return parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
  } catch {
    return false;
  }
}

function swapDatabase(url, name) {
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error('geçersiz veritabanı adı');
  const parsed = new URL(url.replace(/^postgresql:/, 'http:'));
  const auth = parsed.username
    ? `${parsed.username}${parsed.password ? `:${parsed.password}` : ''}@`
    : '';
  const port = parsed.port ? `:${parsed.port}` : '';
  return `postgresql://${auth}${parsed.hostname}${port}/${name}`;
}

function psql(url, sql) {
  const result = spawnSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-tAc', sql], { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(redact((result.stderr || result.stdout || 'psql başarısız').slice(0, 400)));
  }
  return (result.stdout || '').trim();
}

function serverEnv(dbUrl, extra) {
  const env = { ...process.env };
  delete env.ADMIN_RATE_LIMIT_MAX;
  delete env.ADMIN_IP_RATE_LIMIT_MAX;
  delete env.ADMIN_USER_RATE_LIMIT_MAX;
  delete env.ADMIN_READ_RATE_LIMIT_MAX;
  return {
    ...env,
    DATABASE_URL: dbUrl,
    NODE_ENV: 'production',
    JWT_SECRET: STRONG,
    ADMIN_EMAIL: EMAIL,
    ADMIN_PASSWORD: PASSWORD,
    ADMIN_NAME: 'V5 Adim2',
    PORT,
    SITEMAP_ON_START: 'false',
    LIVE_DATA_CRON: 'false',
    SEED_ON_START: 'false',
    REQUIRE_EMAIL_VERIFICATION: 'false',
    LOG_LEVEL: 'info',
    ...extra,
  };
}

function nodeScript(body) {
  return `
const { initDb, db, closePool } = require('./server/db');
(async () => {
  await initDb();
  ${body}
  await closePool();
})().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
`;
}

const NODE_SETUP = nodeScript(`
  const { seedAdmin } = require('./server/seed');
  await db.prepare(
    'INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(${JSON.stringify(SETTING_KEY)}, process.env.V5_DB_SECRET);
  const created = await seedAdmin();
  const row = await db.prepare('SELECT value FROM site_settings WHERE key = ?').get(${JSON.stringify(SETTING_KEY)});
  console.log('RESULT ' + JSON.stringify({
    action: created && created.action,
    sameAsPlanted: !!(row && row.value === process.env.V5_DB_SECRET),
    sameAsJwt: !!(row && row.value === process.env.JWT_SECRET),
  }));
`);

const NODE_READ = nodeScript(`
  const row = await db.prepare('SELECT value FROM site_settings WHERE key = ?').get(${JSON.stringify(SETTING_KEY)});
  const admin = await db.prepare('SELECT email FROM users WHERE email = ?').get(process.env.ADMIN_EMAIL);
  console.log('RESULT ' + JSON.stringify({
    sameAsPlanted: !!(row && row.value === process.env.V5_DB_SECRET),
    sameAsJwt: !!(row && row.value === process.env.JWT_SECRET),
    admin: !!(admin && admin.email),
  }));
`);

function runNode(dbUrl, source) {
  const result = spawnSync(process.execPath, ['-e', source], {
    cwd: ROOT,
    env: serverEnv(dbUrl, { V5_DB_SECRET: DB_SECRET }),
    encoding: 'utf8',
    timeout: 60000,
  });
  const output = redact(`${result.stdout || ''}\n${result.stderr || ''}`);
  if (result.status !== 0) throw new Error(output.slice(-2000));
  const line = (result.stdout || '').split('\n').map((item) => item.trim()).filter((item) => item.startsWith('RESULT ')).pop();
  if (!line) throw new Error(output.slice(-2000) || 'RESULT satırı yok');
  return JSON.parse(line.slice('RESULT '.length));
}

function probe(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/health`, { timeout: 1000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

function staticChecks() {
  console.log('verify-v5-adim2-jwt');
  const authJs = read('server/auth.js');
  const rateJs = read('server/middleware/rateLimit.js');
  const indexJs = read('server/index.js');
  const startJs = read('server/scripts/start-prod.js');
  const migrations = read('server/lib/migrations.js');
  const proposal = read('server/migrations/proposed/v5-adim2-jwt-secret-fallback.sql');

  if (!/function getJwtSecret\(/.test(authJs) || !/getJwtSecret,/.test(authJs)) {
    fail('auth.js getJwtSecret dışa aktarmıyor');
  } else ok('auth.js tek getJwtSecret kaynağı');
  if (/wasJwtSecretAutoGenerated|adoptPersistedJwtSecret|jwt-secret-store|process\.env\.JWT_SECRET\s*=/.test(authJs)) {
    fail('auth.js hâlâ sırrı üretip ortama veya veritabanına yazıyor');
  } else ok('auth.js sırrı üretip process.env veya veritabanına yazmıyor');
  if (!/will not invent a secret/.test(authJs)) fail('üretim hata metni eksik');
  else ok('üretim hata metni anahtar üretilmeyeceğini söylüyor');
  if (!/getJwtSecret\(/.test(rateJs) || /process\.env\.JWT_SECRET/.test(rateJs)) {
    fail('rateLimit kendi JWT kaynağını kullanıyor');
  } else ok('rateLimit jwt.verify için getJwtSecret kullanıyor');
  if (/reconcileJwtSecret|jwt-secret-store|auth_jwt_secret_fallback/.test(indexJs)) {
    fail('index.js JWT sırrını veritabanıyla eşliyor');
  } else ok('index.js veritabanındaki JWT yedeğini okumuyor');
  if (/process\.env\.JWT_SECRET\s*=/.test(startJs) || /randomBytes/.test(startJs)) {
    fail('start-prod JWT_SECRET üretiyor');
  } else ok('start-prod JWT_SECRET üretmiyor');
  if (fs.existsSync(path.join(ROOT, 'server/lib/jwt-secret-store.js'))) {
    fail('jwt-secret-store.js duruyor');
  } else ok('jwt-secret-store.js yok');
  if (!proposal.includes(SETTING_KEY) || !proposal.includes('DELETE FROM site_settings') || !proposal.includes('ONAYSIZ')) {
    fail('önerilen temizlik dosyası eksik');
  } else ok('temizlik SQL’i öneri olarak duruyor');
  if (/^DELETE FROM/m.test(proposal) || /^SELECT /m.test(proposal)) {
    fail('temizlik SQL’i yorum satırı dışında');
  } else ok('temizlik SQL’i yorumda; kendi kendine çalışmaz');
  if (migrations.includes(SETTING_KEY) || migrations.includes('v5-adim2-jwt-secret-fallback')) {
    fail('açılış migration’ı JWT yedeğini siliyor');
  } else ok('açılış migration’ı bu satıra dokunmuyor');

  const skipDirs = new Set(['node_modules', '.git', 'reports', 'backups', 'vendor']);
  const hits = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skipDirs.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (/\.(png|webp|jpg|jpeg|gif|ico|woff2?)$/i.test(entry.name)) continue;
      let text = '';
      try { text = fs.readFileSync(full, 'utf8'); } catch { continue; }
      if (text.includes('\0')) continue;
      if (text.includes(RETIRED)) hits.push(path.relative(ROOT, full));
    }
  }
  walk(ROOT);
  if (hits.length) fail(`eski JWT yedeği duruyor: ${hits.join(', ')}`);
  else ok('depoda eski JWT yedeği yok');
}

function runRefused(entry, secretMode) {
  const code = `
    const Module = require('module');
    const orig = Module.prototype.require;
    Module.prototype.require = function (id) {
      if (id === 'dotenv') return { config() { return {}; } };
      return orig.apply(this, arguments);
    };
    process.env.NODE_ENV = 'production';
    if (process.env.V5_SECRET_MODE === 'missing') delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = process.env.V5_SECRET_VALUE;
    require(${JSON.stringify(entry)});
    console.log('STARTED');
  `;
  const env = { ...process.env, NODE_ENV: 'production', V5_SECRET_MODE: secretMode };
  delete env.JWT_SECRET;
  if (secretMode === 'short') env.V5_SECRET_VALUE = SHORT;
  else if (secretMode === 'weak') env.V5_SECRET_VALUE = WEAK;
  else if (secretMode === 'retired') env.V5_SECRET_VALUE = RETIRED;
  else delete env.V5_SECRET_VALUE;
  return spawnSync(process.execPath, ['-e', code], {
    cwd: ROOT,
    env,
    encoding: 'utf8',
    timeout: 15000,
  });
}

function expectRefuse(entry, secretMode, label) {
  const result = runRefused(entry, secretMode);
  const output = redact(`${result.stdout || ''}\n${result.stderr || ''}`);
  const refused = result.status !== 0 && result.status !== null
    && /will not invent a secret/.test(output)
    && !/STARTED/.test(result.stdout || '')
    && !/auto-generated/.test(output);
  if (!refused) {
    fail(`${label} başlamaması gerekirken çıktı (kod ${result.status}): ${output.slice(-500)}`);
  } else ok(`${label} başlamaz`);
}

function devSecret(given) {
  const code = `
    const Module = require('module');
    const orig = Module.prototype.require;
    Module.prototype.require = function (id) {
      if (id === 'dotenv') return { config() { return {}; } };
      return orig.apply(this, arguments);
    };
    process.env.NODE_ENV = 'development';
    process.env.LOG_LEVEL = 'silent';
    if (process.env.V5_HAS_GIVEN === '1') process.env.JWT_SECRET = process.env.V5_GIVEN_SECRET;
    else delete process.env.JWT_SECRET;
    const { getJwtSecret } = require('./server/auth');
    const a = getJwtSecret();
    const b = getJwtSecret();
    if (a !== b || typeof a !== 'string' || a.length < 32) process.exit(3);
    process.stdout.write(a);
  `;
  const env = { ...process.env, NODE_ENV: 'development', V5_HAS_GIVEN: given ? '1' : '0' };
  delete env.JWT_SECRET;
  if (given) env.V5_GIVEN_SECRET = given;
  else delete env.V5_GIVEN_SECRET;
  return spawnSync(process.execPath, ['-e', code], {
    cwd: ROOT,
    env,
    encoding: 'utf8',
    timeout: 20000,
  });
}

function devChecks() {
  const first = devSecret();
  const second = devSecret();
  if (first.status !== 0 || second.status !== 0) {
    fail(`geliştirmede geçici anahtar üretilemedi (${first.status}/${second.status})`);
    return;
  }
  if (!first.stdout || first.stdout.length < 32 || first.stdout === second.stdout) {
    fail('geliştirmede her süreç ayrı rastgele anahtar almıyor');
  } else ok('geliştirmede her süreç ayrı geçici anahtar alır');
  if (first.stdout === RETIRED || second.stdout === RETIRED) fail('geliştirme eski sabit yedeği kullandı');
  else ok('geliştirme eski sabit yedeği kullanmaz');

  const kept = devSecret(STRONG);
  if (kept.status !== 0 || kept.stdout !== STRONG) fail('geliştirme verilen güçlü anahtarı kullanmadı');
  else ok('geliştirme ortamda verilen güçlü anahtarı kullanır');

  const replaced = devSecret(RETIRED);
  if (replaced.status !== 0 || replaced.stdout === RETIRED || replaced.stdout.length < 32) {
    fail('geliştirme kısa/eski yedeği olduğu gibi kullandı');
  } else ok('geliştirme kısa veya eski yedeği yok sayıp geçici anahtar üretir');
}

async function bootServer(dbUrl) {
  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT,
    env: serverEnv(dbUrl),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (chunk) => { log += chunk.toString(); });
  child.stderr.on('data', (chunk) => { log += chunk.toString(); });
  let exited = null;
  child.on('exit', (code) => { exited = code; });
  const started = Date.now();
  while (Date.now() - started < 30000) {
    if (exited !== null) throw new Error(`sunucu kapandı (${exited})\n${redact(log).slice(-2000)}`);
    if (await probe(PORT)) return { child, log: () => log };
    await sleep(200);
  }
  child.kill('SIGKILL');
  throw new Error(`zaman aşımı\n${redact(log).slice(-2000)}`);
}

async function stopServer(child) {
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM');
    const started = Date.now();
    while (child.exitCode === null && Date.now() - started < 5000) await sleep(100);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  const started = Date.now();
  while (await probe(PORT) && Date.now() - started < 5000) await sleep(100);
}

function mergeCookies(jar, lines) {
  for (const line of lines || []) {
    const part = line.split(';')[0];
    const eq = part.indexOf('=');
    if (eq < 1) continue;
    jar[part.slice(0, eq).trim()] = part.slice(eq + 1);
  }
}

function cookieHeader(jar) {
  return Object.entries(jar).map(([key, value]) => `${key}=${value}`).join('; ');
}

async function request(url, { method = 'GET', body, jar, headers } = {}) {
  const hdrs = { ...(headers || {}) };
  if (jar && Object.keys(jar).length) hdrs.Cookie = cookieHeader(jar);
  const payload = body == null ? null : JSON.stringify(body);
  if (payload != null) hdrs['Content-Type'] = 'application/json';
  const res = await fetch(url, { method, headers: hdrs, body: payload });
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  if (jar) mergeCookies(jar, setCookie);
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch { /* ignore */ }
  const limit = res.headers.get('ratelimit-limit') || res.headers.get('ratelimit');
  const limitNumber = limit ? Number(String(limit).match(/\d+/)?.[0]) : null;
  return { status: res.status, json, text, limit: limitNumber };
}

async function liveChecks(dbUrl) {
  const { resolveAdminRateLimits } = require('../middleware/rateLimit');
  const caps = resolveAdminRateLimits(serverEnv(dbUrl));
  if (!(caps.read > caps.ip)) {
    fail('admin okuma limiti IP limitinden büyük değil; aynı anahtar testi ayırt edilemez');
    return;
  }

  const setup = runNode(dbUrl, NODE_SETUP);
  if (setup.action !== 'created' || setup.sameAsPlanted !== true || setup.sameAsJwt !== false) {
    fail('deneme veritabanına admin veya eski JWT satırı yazılamadı');
    return;
  }
  ok('deneme veritabanında admin ve eski JWT satırı hazır');

  const booted = await bootServer(dbUrl);
  const base = `http://127.0.0.1:${PORT}`;
  const jwt = require('jsonwebtoken');
  try {
    const jar = {};
    const login = await request(`${base}/api/auth/login`, {
      method: 'POST',
      jar,
      headers: { Origin: base },
      body: { email: EMAIL, password: PASSWORD },
    });
    const user = login.json?.data?.user;
    if (login.status !== 200 || !user || user.email !== EMAIL) {
      fail(`giriş olmadı: HTTP ${login.status} ${redact(login.text).slice(0, 180)}`);
    } else ok('güçlü JWT_SECRET ile giriş çalışır');

    const me = await request(`${base}/api/auth/me`, { jar });
    if (me.status !== 200 || me.json?.data?.user?.email !== EMAIL) fail('girişten sonra /me kullanıcıyı göstermiyor');
    else ok('giriş çerezi /me ile doğrulanır');

    const logout = await request(`${base}/api/auth/logout`, {
      method: 'POST',
      jar,
      headers: { Origin: base },
    });
    if (logout.status !== 200 || logout.json?.data?.loggedOut !== true) fail('çıkış olmadı');
    else ok('çıkış çalışır');

    const after = await request(`${base}/api/auth/me`, { jar });
    if (after.json?.data?.user) fail('çıkıştan sonra oturum duruyor');
    else ok('çıkıştan sonra oturum yok');

    const session = {};
    const again = await request(`${base}/api/auth/login`, {
      method: 'POST',
      jar: session,
      headers: { Origin: base },
      body: { email: EMAIL, password: PASSWORD },
    });
    if (again.status !== 200) fail('çıkıştan sonra yeniden giriş olmadı');
    else ok('çıkıştan sonra yeniden giriş çalışır');

    const stats = await request(`${base}/api/admin/stats`, { jar: session });
    if (again.status !== 200 || stats.limit !== caps.read) {
      fail(`panel çerezi okuma limitine girmedi (HTTP ${stats.status}, limit ${stats.limit}, beklenen ${caps.read})`);
    } else ok('rate limit, girişle aynı JWT sırrını panel oturumu sayar');

    if (user && user.id != null) {
      const foreign = jwt.sign(
        { id: user.id, email: EMAIL, role: 'admin', name: 'V5 Adim2' },
        DB_SECRET,
        { expiresIn: '1h' },
      );
      const rejected = await request(`${base}/api/admin/stats`, {
        headers: { Authorization: `Bearer ${foreign}` },
      });
      if (rejected.limit !== caps.ip) {
        fail(`veritabanındaki eski sır panel oturumu sayıldı (limit ${rejected.limit}, beklenen ${caps.ip})`);
      } else ok('veritabanındaki eski sır oturum açmaz');
    }

    const stored = runNode(dbUrl, NODE_READ);
    if (stored.sameAsPlanted !== true || stored.sameAsJwt !== false || stored.admin !== true) {
      fail('sunucu eski JWT satırını değiştirdi veya admin kaydını sildi');
    } else ok('sunucu eski JWT satırını okumaz ve üzerine yazmaz');
  } finally {
    const log = redact(booted.log());
    if (/auto-generated|Reused previously-generated|Persisted this process|jwt-secret-store/.test(log)) {
      fail('sunucu logu hâlâ otomatik veya veritabanı JWT sırrından söz ediyor');
    } else ok('sunucu logu otomatik JWT üretmiyor');
    if (log.includes(STRONG) || log.includes(DB_SECRET)) fail('sunucu logu JWT sırrını yazdı');
    await stopServer(booted.child);
  }
}

async function main() {
  staticChecks();
  devChecks();
  for (const entry of ['./server/index.js', './server/scripts/start-prod.js']) {
    const name = entry.includes('start-prod') ? 'start-prod' : 'index';
    expectRefuse(entry, 'missing', `${name} + JWT_SECRET yok`);
    expectRefuse(entry, 'short', `${name} + kısa JWT_SECRET`);
    expectRefuse(entry, 'weak', `${name} + zayıf JWT_SECRET`);
    expectRefuse(entry, 'retired', `${name} + eski sabit yedek`);
  }

  const base = databaseUrl();
  if (!isLocalDatabase(base)) {
    fail('DATABASE_URL yerel değil; geçici veritabanı açılmadı');
    process.exit(1);
  }
  const adminUrl = swapDatabase(base, 'postgres');
  const dbUrl = swapDatabase(base, DB_NAME);
  psql(adminUrl, `DROP DATABASE IF EXISTS ${DB_NAME}`);
  psql(adminUrl, `CREATE DATABASE ${DB_NAME}`);
  let child = null;
  try {
    await liveChecks(dbUrl);
  } finally {
    if (child) await stopServer(child);
    try {
      psql(adminUrl, `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid()`);
      psql(adminUrl, `DROP DATABASE IF EXISTS ${DB_NAME}`);
    } catch (err) {
      console.error('  · geçici veritabanı silinemedi:', redact(err.message));
    }
  }

  if (failed) {
    console.error(`verify-v5-adim2 FAILED (${failed})`);
    process.exit(1);
  }
  console.log('verify-v5-adim2 OK');
}

main().catch((err) => {
  console.error(redact(err && err.stack ? err.stack : err));
  process.exit(1);
});
