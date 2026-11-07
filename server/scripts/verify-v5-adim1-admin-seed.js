#!/usr/bin/env node
/**
 * V5 Adım 1 — startup must not reset an existing admin password.
 *
 * Usage: npm run verify:v5-adim1
 *
 * Needs local Postgres (127.0.0.1 / localhost). Uses a throwaway database.
 * Does not write to the app database.
 */
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const EMAIL = 'v5adim1@test.local';
const LEGACY_EMAIL = 'yasin@touristlio.local';
const DB_NAME = 'touristlio_v5a1';
const PORT = '3187';
const FIRST_PASSWORD = 'ValidPass1';
const OTHER_PASSWORD = 'OtherPass99';
const RESET_PASSWORD = 'ResetAdmin9';
const RETIRED = ['Change', 'Me', '123!'].join('');
const REPORT = path.join(ROOT, '_admin-fix-report.json');

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

function sliceFn(src, name) {
  const start = src.indexOf(`async function ${name}`);
  if (start < 0) return '';
  const next = src.indexOf('\nasync function ', start + 1);
  const exportAt = src.indexOf('\nmodule.exports', start);
  const end = next === -1 ? exportAt : (exportAt !== -1 && exportAt < next ? exportAt : next);
  return src.slice(start, end === -1 ? undefined : end);
}

function redact(text) {
  return String(text || '')
    .split(RETIRED).join('[retired]')
    .split(FIRST_PASSWORD).join('[pw]')
    .split(OTHER_PASSWORD).join('[pw]')
    .split(RESET_PASSWORD).join('[pw]')
    .split('LocalDevAdmin1').join('[dev]');
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
  const result = spawnSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(redact((result.stderr || result.stdout || 'psql başarısız').slice(0, 400)));
  }
}

function childEnv(dbUrl, extra) {
  const env = { ...process.env };
  delete env.ADMIN_PASSWORD;
  return {
    ...env,
    DATABASE_URL: dbUrl,
    ADMIN_EMAIL: EMAIL,
    ADMIN_NAME: 'Test Admin',
    JWT_SECRET: process.env.JWT_SECRET || 'local-test-jwt-secret-not-for-production-use-only-1234567890',
    LOG_LEVEL: 'info',
    SITEMAP_ON_START: 'false',
    LIVE_DATA_CRON: 'false',
    SEED_ON_START: 'false',
    PORT,
    ...extra,
  };
}

const NODE_DB = `
const { initDb, db, closePool } = require('./server/db');
const { seedAdmin, DEV_ONLY_FALLBACK } = require('./server/seed');
const { comparePassword } = require('./server/auth');
(async () => {
  await initDb();
  const email = String(process.env.ADMIN_EMAIL || '').toLowerCase();
  if (process.env.V5_SETUP === '1') {
    const count = Number((await db.prepare('SELECT COUNT(*) AS c FROM places').get()).c || 0);
    if (count < 10) {
      for (let i = 1; i <= 10; i += 1) {
        await db.prepare('INSERT INTO places (id, name) VALUES (?, ?)').run(880000 + i, 'v5a1 ' + i);
      }
    }
  }
  if (process.env.V5_MUTATE === '1') {
    await db.prepare(
      "UPDATE users SET name = 'Keep Name', role = 'editor', email_verified = 0, failed_login_count = 4, locked_until = '2099-01-01 00:00:00' WHERE email = ?"
    ).run(email);
    await db.prepare(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)'
    ).run('Legacy', 'yasin@touristlio.local', 'sentinel-legacy-hash', 'admin');
  }
  if (process.env.V5_CLEAR_USERS === '1') {
    await db.prepare('DELETE FROM users').run();
  }
  if (process.env.V5_LEGACY === '1') {
    await db.prepare(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)'
    ).run('Legacy', 'yasin@touristlio.local', 'sentinel-legacy-hash', 'admin');
  }
  let result = null;
  if (process.env.V5_SKIP_SEED !== '1') {
    result = await seedAdmin();
  }
  const row = await db.prepare(
    'SELECT password_hash, name, role, email_verified, failed_login_count, locked_until FROM users WHERE email = ?'
  ).get(email);
  const legacy = await db.prepare(
    'SELECT password_hash, role FROM users WHERE email = ?'
  ).get('yasin@touristlio.local');
  let passwordOk = null;
  let legacyOk = null;
  if (row && process.env.V5_CHECK_DEV === '1') {
    passwordOk = await comparePassword(DEV_ONLY_FALLBACK, row.password_hash);
  }
  if (process.env.V5_CHECK_RESET === '1') {
    const given = String(process.env.ADMIN_PASSWORD || '');
    if (row) passwordOk = await comparePassword(given, row.password_hash);
    if (legacy) legacyOk = await comparePassword(given, legacy.password_hash);
  }
  const count = Number((await db.prepare('SELECT COUNT(*) AS c FROM users WHERE email = ?').get(email)).c || 0);
  console.log('RESULT ' + JSON.stringify({
    result,
    count,
    row: row ? {
      password_hash: row.password_hash,
      name: row.name,
      role: row.role,
      email_verified: row.email_verified,
      failed_login_count: row.failed_login_count,
      locked_until: row.locked_until,
    } : null,
    legacy: legacy ? { password_hash: legacy.password_hash, role: legacy.role } : null,
    passwordOk,
    legacyOk,
  }));
  await closePool();
})().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
`;

function runDb(dbUrl, extra) {
  const result = spawnSync(process.execPath, ['-e', NODE_DB], {
    cwd: ROOT,
    env: childEnv(dbUrl, extra),
    encoding: 'utf8',
    timeout: 60000,
  });
  const output = redact(`${result.stdout || ''}\n${result.stderr || ''}`);
  if (result.status !== 0) {
    throw new Error(output.slice(-2000));
  }
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

async function bootServer(dbUrl, extra, expectText) {
  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT,
    env: childEnv(dbUrl, extra),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let buf = '';
  child.stdout.on('data', (chunk) => { buf += chunk.toString(); });
  child.stderr.on('data', (chunk) => { buf += chunk.toString(); });
  let exited = null;
  child.on('exit', (code) => { exited = code; });
  const started = Date.now();
  let healthy = false;
  while (Date.now() - started < 30000) {
    if (exited !== null) {
      throw new Error(`sunucu kapandı (${exited})\n${redact(buf).slice(-2000)}`);
    }
    if (!healthy) healthy = await probe(PORT);
    if (healthy && buf.includes(expectText)) {
      const still = await probe(PORT);
      if (!still || exited !== null) throw new Error('sağlık kontrolü düştü');
      return { child, log: buf };
    }
    await sleep(200);
  }
  child.kill('SIGKILL');
  throw new Error(`zaman aşımı healthy=${healthy}\n${redact(buf).slice(-2000)}`);
}

async function stopServer(child) {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    const started = Date.now();
    while (child.exitCode === null && Date.now() - started < 5000) {
      await sleep(100);
    }
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  const started = Date.now();
  while (await probe(PORT) && Date.now() - started < 5000) {
    await sleep(100);
  }
}

function sameRow(before, after) {
  if (!before || !after) return false;
  return before.password_hash === after.password_hash
    && before.name === after.name
    && before.role === after.role
    && String(before.email_verified) === String(after.email_verified)
    && String(before.failed_login_count) === String(after.failed_login_count)
    && String(before.locked_until) === String(after.locked_until);
}

function staticChecks() {
  console.log('verify-v5-adim1-admin-seed');
  const seed = read('server/seed.js');
  const startup = read('server/lib/startup-seed.js');
  const ensure = read('server/scripts/ensure-admin.js');
  const seedAdmin = sliceFn(seed, 'seedAdmin');
  const runFull = sliceFn(seed, 'runFullSeed');
  if (!seedAdmin.includes('Admin already exists')) fail('seedAdmin mevcut hesapta log yazmıyor');
  else ok('seedAdmin mevcut hesapta yalnızca "zaten var" der');
  if (/password_hash|clearLockout|SET name/.test(seedAdmin)) fail('seedAdmin mevcut hesabı güncelliyor');
  else ok('seedAdmin şifre, ad, rol veya kilit yazmıyor');
  if (runFull.includes('syncLegacyAdminPassword') || startup.includes('syncLegacyAdminPassword')) {
    fail('şifre eşitleme hâlâ açılışta veya seed komutunda');
  } else ok('syncLegacyAdminPassword açılışta ve npm run seed içinde yok');
  if (!ensure.includes('syncLegacyAdminPassword') || !ensure.includes('resolveAdminPassword')) {
    fail('admin:ensure bilinçli sıfırlamayı taşımıyor');
  } else ok('admin:ensure şifreyi bilinçli sıfırlar');

  const { DEV_ONLY_FALLBACK, RETIRED_DEFAULT_SHA256 } = require('../seed');
  const { passwordPolicyError } = require('../lib/password-policy');
  const digest = crypto.createHash('sha256').update(RETIRED, 'utf8').digest('hex');
  if (digest !== RETIRED_DEFAULT_SHA256) fail('eski varsayılanın özeti koddaki sabitle uyuşmuyor');
  else ok('eski varsayılan düz metin olarak durmuyor; üretimde özetle reddedilir');
  if (passwordPolicyError(DEV_ONLY_FALLBACK)) fail('geliştirme yedeği şifre kuralına uymuyor');
  else ok('geliştirme yedeği kurala uyar ve yalnızca üretim dışında kullanılır');

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
      if (!entry.isFile() || entry.name.endsWith('.png') || entry.name.endsWith('.webp') || entry.name.endsWith('.jpg')) continue;
      let text = '';
      try {
        text = fs.readFileSync(full, 'utf8');
      } catch {
        continue;
      }
      if (text.includes('\0')) continue;
      if (text.includes(RETIRED)) hits.push(path.relative(ROOT, full));
    }
  }
  walk(ROOT);
  if (hits.length) fail(`eski varsayılan şifre duruyor: ${hits.join(', ')}`);
  else ok('depoda eski varsayılan şifre yok');
}

async function main() {
  staticChecks();
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
    const created = runDb(dbUrl, {
      NODE_ENV: 'production',
      ADMIN_PASSWORD: FIRST_PASSWORD,
      V5_SETUP: '1',
    });
    if (created.result?.action !== 'created' || created.count !== 1) {
      fail(`üretimde uygun şifreyle admin oluşmadı: ${created.result?.action}`);
    } else ok('üretimde uygun ADMIN_PASSWORD ile admin bir kez oluşur');

    runDb(dbUrl, { NODE_ENV: 'production', ADMIN_PASSWORD: FIRST_PASSWORD, V5_MUTATE: '1', V5_SKIP_SEED: '1' });
    const before = runDb(dbUrl, { NODE_ENV: 'production', ADMIN_PASSWORD: OTHER_PASSWORD, V5_SKIP_SEED: '1' });
    const hash = before.row && before.row.password_hash;
    if (!hash || before.row.name !== 'Keep Name' || before.row.role !== 'editor') {
      fail('karşılaştırma öncesi hesap hazır değil');
    }

    for (let i = 1; i <= 2; i += 1) {
      child = (await bootServer(dbUrl, {
        NODE_ENV: 'production',
        ADMIN_PASSWORD: OTHER_PASSWORD,
      }, 'Admin already exists')).child;
      const still = await probe(PORT);
      if (!still) fail(`yeniden başlatma ${i} sonrasında sağlık kontrolü yok`);
      await stopServer(child);
      child = null;
      const after = runDb(dbUrl, { NODE_ENV: 'production', ADMIN_PASSWORD: OTHER_PASSWORD, V5_SKIP_SEED: '1' });
      if (!sameRow(before.row, after.row)) fail(`yeniden başlatma ${i} şifre veya hesap alanını değiştirdi`);
      else ok(`yeniden başlatma ${i}: şifre hash'i, ad, rol ve kilit aynı`);
      if (!after.legacy || after.legacy.password_hash !== 'sentinel-legacy-hash') {
        fail(`yeniden başlatma ${i} eski admin şifresini eşitledi`);
      } else ok(`yeniden başlatma ${i}: eski hesap şifresi eşitlemesi çalışmadı`);
    }

    const missing = runDb(dbUrl, {
      NODE_ENV: 'production',
      ADMIN_PASSWORD: '',
      V5_CLEAR_USERS: '1',
    });
    if (missing.result?.action !== 'skipped' || missing.count !== 0) {
      fail('şifresiz üretimde admin oluşturuldu');
    } else ok('şifresiz üretimde seedAdmin admin oluşturmaz ve hata fırlatmaz');

    child = (await bootServer(dbUrl, {
      NODE_ENV: 'production',
      ADMIN_PASSWORD: '',
    }, 'Admin not created')).child;
    const up = await probe(PORT);
    const during = runDb(dbUrl, { NODE_ENV: 'production', ADMIN_PASSWORD: '', V5_SKIP_SEED: '1' });
    const upAgain = await probe(PORT);
    if (!up || !upAgain || during.count !== 0) fail('şifresiz üretimde uygulama ayakta kalmadı veya admin oluştu');
    else ok('şifresiz üretimde uygulama ayakta; yeni admin yok');
    await stopServer(child);
    child = null;

    const weak = runDb(dbUrl, { NODE_ENV: 'production', ADMIN_PASSWORD: 'short', V5_CLEAR_USERS: '1' });
    if (weak.result?.action !== 'skipped' || weak.count !== 0) fail('zayıf şifreyle üretimde admin oluştu');
    else ok('zayıf ADMIN_PASSWORD ile üretimde admin oluşmaz');

    const retired = runDb(dbUrl, { NODE_ENV: 'production', ADMIN_PASSWORD: RETIRED, V5_CLEAR_USERS: '1' });
    if (retired.result?.action !== 'skipped' || retired.count !== 0) fail('eski varsayılan şifreyle üretimde admin oluştu');
    else ok('eski varsayılan şifre üretimde kabul edilmez');

    const dev = runDb(dbUrl, {
      NODE_ENV: 'development',
      ADMIN_PASSWORD: '',
      V5_CLEAR_USERS: '1',
      V5_CHECK_DEV: '1',
    });
    if (dev.result?.action !== 'created' || dev.passwordOk !== true) fail('geliştirmede boş şifre ilk admini oluşturmadı');
    else ok('geliştirmede boş ADMIN_PASSWORD ilk admini yerel yedekle oluşturur');
    const devHash = dev.row.password_hash;
    const devAgain = runDb(dbUrl, { NODE_ENV: 'development', ADMIN_PASSWORD: '', V5_CHECK_DEV: '1' });
    if (devAgain.result?.action !== 'exists' || devAgain.row.password_hash !== devHash) {
      fail('ikinci seedAdmin geliştirmede hash değiştirdi');
    } else ok('ikinci seedAdmin geliştirmede hash bırakır');

    const refused = spawnSync(process.execPath, [path.join(ROOT, 'server/scripts/ensure-admin.js')], {
      cwd: ROOT,
      env: childEnv(dbUrl, { NODE_ENV: 'production', ADMIN_PASSWORD: '' }),
      encoding: 'utf8',
      timeout: 30000,
    });
    const afterRefuse = runDb(dbUrl, { NODE_ENV: 'production', ADMIN_PASSWORD: '', V5_SKIP_SEED: '1' });
    if (refused.status === 0 || afterRefuse.row.password_hash !== devHash) {
      fail('üretimde şifresiz admin:ensure yazdı veya başarı döndü');
    } else ok('üretimde şifresiz admin:ensure yazmadan hata verir');

    const refusedRetired = spawnSync(process.execPath, [path.join(ROOT, 'server/scripts/ensure-admin.js')], {
      cwd: ROOT,
      env: childEnv(dbUrl, { NODE_ENV: 'production', ADMIN_PASSWORD: RETIRED }),
      encoding: 'utf8',
      timeout: 30000,
    });
    const afterRetired = runDb(dbUrl, { NODE_ENV: 'production', ADMIN_PASSWORD: '', V5_SKIP_SEED: '1' });
    if (refusedRetired.status === 0 || afterRetired.row.password_hash !== devHash) {
      fail('üretimde eski varsayılan admin:ensure ile yazıldı');
    } else ok('üretimde eski varsayılan admin:ensure ile yazılmaz');

    runDb(dbUrl, { NODE_ENV: 'development', ADMIN_PASSWORD: '', V5_LEGACY: '1', V5_SKIP_SEED: '1' });
    const ensured = spawnSync(process.execPath, [path.join(ROOT, 'server/scripts/ensure-admin.js')], {
      cwd: ROOT,
      env: childEnv(dbUrl, { NODE_ENV: 'development', ADMIN_PASSWORD: RESET_PASSWORD }),
      encoding: 'utf8',
      timeout: 60000,
    });
    const reset = runDb(dbUrl, {
      NODE_ENV: 'development',
      ADMIN_PASSWORD: RESET_PASSWORD,
      V5_SKIP_SEED: '1',
      V5_CHECK_RESET: '1',
    });
    if (ensured.status !== 0 || reset.passwordOk !== true || reset.row.role !== 'admin' || reset.row.password_hash === devHash) {
      fail(`admin:ensure şifreyi sıfırlamadı\n${redact(ensured.stdout)}\n${redact(ensured.stderr)}`);
    } else ok('admin:ensure verilen şifreyi yazar');
    if (!reset.legacy || reset.legacyOk !== true || reset.legacy.password_hash === 'sentinel-legacy-hash') {
      fail('admin:ensure eski admin şifresini eşitlemedi');
    } else ok('admin:ensure eski admin şifresini de eşitler');
  } finally {
    if (child) await stopServer(child);
    try { fs.unlinkSync(REPORT); } catch { /* yoksa sorun değil */ }
    try {
      psql(adminUrl, `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid()`);
      psql(adminUrl, `DROP DATABASE IF EXISTS ${DB_NAME}`);
    } catch (err) {
      console.error('  · geçici veritabanı silinemedi:', redact(err.message));
    }
  }

  if (failed) {
    console.error(`verify-v5-adim1 FAILED (${failed})`);
    process.exit(1);
  }
  console.log('verify-v5-adim1 OK');
}

main().catch((err) => {
  console.error(redact(err && err.stack ? err.stack : err));
  process.exit(1);
});
