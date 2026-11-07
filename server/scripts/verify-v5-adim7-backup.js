#!/usr/bin/env node
/**
 * V5 Adım 7 — backup/restore hardening.
 *
 * Usage: npm run verify:v5-adim7
 *
 * Live production restore is NOT run. Uses a throwaway local Postgres DB.
 */
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const backupSafe = require('../lib/backup-safe');

const ROOT = path.join(__dirname, '..', '..');
const PORT = process.env.VERIFY_V5_ADIM7_PORT || '3197';
const DB_NAME = 'touristlio_v5a7';
const EMAIL = 'v5adim7@test.local';
const PASSWORD = 'ValidPass1';
const ENC_KEY = 'v5-adim7-backup-encryption-key-not-for-prod-32b';

let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) { console.error('  ✗', msg); failed += 1; }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

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
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error('geçersiz db adı');
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
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || 'psql fail').slice(0, 400));
  return (result.stdout || '').trim();
}

function staticChecks() {
  console.log('verify-v5-adim7-backup');
  const safeJs = read('server/lib/backup-safe.js');
  const adminJs = read('server/routes/admin.js');
  const html = read('public/admin.html');

  if (!/pgToolsStatus|PG_TOOLS_UNSUPPORTED_MSG/.test(safeJs)) fail('pgToolsStatus eksik');
  else ok('pgToolsStatus + desteklenmiyor mesajı');

  if (!/encryptionConfigured\(\) && !backupSafe\.isEncryptedBackup/.test(adminJs)
    && !/yalnızca şifreli/.test(adminJs)) {
    fail('şifreli zorunluluk kontrolü eksik');
  } else ok('ENCRYPTION_KEY varken düz .sql reddi');

  if (!/Gerçek geri yükleme için yönetici şifresi/.test(adminJs)) {
    fail('gerçek restore şifre isteği eksik');
  } else ok('gerçek restore yönetici şifresi ister');

  if (!/status:\s*503/.test(adminJs) && !/,\s*503\)/.test(adminJs)) {
    fail('pg tools yokken 503 bekleniyor');
  } else ok('pg tools yok → 503 (500 değil)');

  if (!/dbRestorePassword/.test(html) || !/refreshDbBackupToolsHint/.test(html)) {
    fail('admin.html şifre / tools ipucu eksik');
  } else ok('admin.html şifre alanı + tools ipucu');

  const tools = backupSafe.pgToolsStatus({ refresh: true });
  if (!tools.supported) {
    fail('bu doğrulama ortamında pg_dump/psql yok — yerel restore testi koşulamaz');
  } else ok(`yerel ortam: pg_dump=${tools.pgDump} psql=${tools.psql}`);
}

function unitEncryptChecks() {
  const prev = process.env.BACKUP_ENCRYPTION_KEY;
  try {
    process.env.BACKUP_ENCRYPTION_KEY = ENC_KEY;
    const plain = Buffer.from('--\n-- PostgreSQL database dump\nSET statement_timeout = 0;\nSELECT 1;\n');
    const enc = backupSafe.encryptBuffer(plain);
    if (!backupSafe.isEncryptedBackup(enc)) fail('encryptBuffer magic yazmadı');
    else ok('şifreli yedek TL1 magic');

    const round = backupSafe.decryptBuffer(enc);
    if (Buffer.compare(round, plain) !== 0) fail('GCM round-trip bozuldu');
    else ok('GCM decrypt + etiket doğrulaması');

    let rejected = false;
    try {
      backupSafe.decryptBuffer(plain);
    } catch (err) {
      rejected = /şifreli/i.test(err.message);
    }
    if (!rejected) fail('ENCRYPTION_KEY varken düz sql decrypt edilmemeli');
    else ok('düz .sql ENCRYPTION_KEY varken reddedilir');

    const bad = Buffer.concat([enc.subarray(0, enc.length - 4), Buffer.from('dead')]);
    let gcmFail = false;
    try {
      backupSafe.decryptBuffer(bad);
    } catch (err) {
      gcmFail = /GCM|açılamadı/i.test(err.message);
    }
    if (!gcmFail) fail('bozuk GCM etiketi kabul edildi');
    else ok('bozuk GCM etiketi reddedilir');
  } finally {
    if (prev === undefined) delete process.env.BACKUP_ENCRYPTION_KEY;
    else process.env.BACKUP_ENCRYPTION_KEY = prev;
  }
}

function request(url, { method = 'GET', headers = {}, body, jar } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const isFd = typeof FormData !== 'undefined' && body && typeof body.getBoundary === 'function';
    // use raw buffer form for multipart via manual
    let payload = null;
    let contentType = headers['Content-Type'] || headers['content-type'];
    if (body && Buffer.isBuffer(body)) {
      payload = body;
    } else if (body && typeof body === 'object' && !Buffer.isBuffer(body) && !(body instanceof Uint8Array)) {
      payload = Buffer.from(JSON.stringify(body));
      contentType = contentType || 'application/json';
    }
    const cookie = jar
      ? Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ')
      : '';
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method,
      headers: {
        Accept: 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
        ...(contentType ? { 'Content-Type': contentType } : {}),
        ...(payload ? { 'Content-Length': payload.length } : {}),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        for (const line of [].concat(res.headers['set-cookie'] || [])) {
          const m = /^([^=]+)=([^;]*)/.exec(String(line));
          if (m && jar) jar[m[1]] = m[2];
        }
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* ignore */ }
        resolve({ status: res.statusCode, body: text, json, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function multipart(fields, fileField, fileName, fileBuf) {
  const boundary = `----TL${crypto.randomBytes(8).toString('hex')}`;
  const parts = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`,
    );
  }
  parts.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
  );
  const head = Buffer.from(parts.join(''), 'utf8');
  const mid = Buffer.from(fileBuf);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  return {
    body: Buffer.concat([head, mid, tail]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

async function waitHealth(base) {
  for (let i = 0; i < 50; i += 1) {
    try {
      const res = await request(`${base}/api/health`);
      if (res.status === 200) return;
    } catch { /* retry */ }
    await sleep(200);
  }
  throw new Error('sunucu ayağa kalkmadı');
}

async function runtimeLocalRestore(baseUrl, dbUrl) {
  // Match the child server's encryption key so encryptBuffer adds TL1 magic.
  process.env.BACKUP_ENCRYPTION_KEY = ENC_KEY;
  // Ensure admin user exists
  const { initDb, db, closePool } = require('../db');
  process.env.DATABASE_URL = dbUrl;
  await initDb();
  const { seedAdmin } = require('../seed');
  process.env.ADMIN_EMAIL = EMAIL;
  process.env.ADMIN_PASSWORD = PASSWORD;
  process.env.ADMIN_NAME = 'V5 Adim7';
  await seedAdmin();
  await closePool();

  const jar = {};
  const login = await request(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { Origin: baseUrl },
    jar,
    body: { email: EMAIL, password: PASSWORD, website: '' },
  });
  if (login.status !== 200) {
    fail(`admin login HTTP ${login.status}`);
    return;
  }
  ok('throwaway DB admin girişi');

  const list = await request(`${baseUrl}/api/admin/backup/list`, { jar, headers: { Origin: baseUrl } });
  if (list.status !== 200 || list.json?.data?.tools?.supported !== true) {
    // ok() wraps { data }
    const tools = list.json?.data?.tools || list.json?.tools;
    if (!tools?.supported) fail(`backup/list tools: ${JSON.stringify(list.json).slice(0, 200)}`);
    else ok('backup/list tools.supported=true');
  } else ok('backup/list tools.supported=true');

  // Minimal dump that applies cleanly on an already-migrated DB (full pg_dump
  // re-CREATE FUNCTIONs and fails — production restores usually target empty DBs).
  const buf = Buffer.from([
    '--',
    '-- PostgreSQL database dump',
    '--',
    'SET statement_timeout = 0;',
    'CREATE TABLE IF NOT EXISTS v5a7_probe (id int PRIMARY KEY, note text);',
    "INSERT INTO v5a7_probe (id, note) VALUES (1, 'restored')",
    'ON CONFLICT (id) DO UPDATE SET note = EXCLUDED.note;',
    '',
  ].join('\n'), 'utf8');

  // With ENCRYPTION_KEY set on server — plaintext must 400
  const plainName = 'touristlio-backup-v5a7-plain.sql';
  const plainMp = multipart(
    { checksum: backupSafe.sha256Buffer(buf), dryRun: '1' },
    'file',
    plainName,
    buf,
  );
  const plainRes = await request(`${baseUrl}/api/admin/backup/restore`, {
    method: 'POST',
    jar,
    headers: { Origin: baseUrl, 'Content-Type': plainMp.contentType },
    body: plainMp.body,
  });
  if (plainRes.status !== 400 || !/şifreli/i.test(String(plainRes.json?.error || plainRes.body))) {
    fail(`düz sql dry-run reddi beklenirdi: ${plainRes.status} ${String(plainRes.body).slice(0, 160)}`);
  } else ok('ENCRYPTION_KEY + düz .sql → 400');

  const encBuf = backupSafe.encryptBuffer(buf);
  const encName = 'touristlio-backup-v5a7.sql.enc';
  const checksum = backupSafe.sha256Buffer(encBuf);

  const dryMp = multipart(
    { checksum, dryRun: '1' },
    'file',
    encName,
    encBuf,
  );
  const dry = await request(`${baseUrl}/api/admin/backup/restore`, {
    method: 'POST',
    jar,
    headers: { Origin: baseUrl, 'Content-Type': dryMp.contentType },
    body: dryMp.body,
  });
  const dryData = dry.json?.data || dry.json;
  if (dry.status !== 200 || !dryData?.dryRun) {
    fail(`dry-run HTTP ${dry.status} ${String(dry.body).slice(0, 200)}`);
  } else ok('şifreli yedek dry-run OK (uygulanmadı)');

  // Real restore without password → 400
  const noPw = multipart(
    { checksum, dryRun: '0' },
    'file',
    encName,
    encBuf,
  );
  const noPwRes = await request(`${baseUrl}/api/admin/backup/restore`, {
    method: 'POST',
    jar,
    headers: { Origin: baseUrl, 'Content-Type': noPw.contentType },
    body: noPw.body,
  });
  if (noPwRes.status !== 400 || !/şifre/i.test(String(noPwRes.json?.error || noPwRes.body))) {
    fail(`şifresiz gerçek restore: ${noPwRes.status}`);
  } else ok('şifresiz gerçek restore → 400');

  const applyMp = multipart(
    { checksum, dryRun: '0', password: PASSWORD },
    'file',
    encName,
    encBuf,
  );
  const applied = await request(`${baseUrl}/api/admin/backup/restore`, {
    method: 'POST',
    jar,
    headers: { Origin: baseUrl, 'Content-Type': applyMp.contentType },
    body: applyMp.body,
  });
  const applyData = applied.json?.data || applied.json;
  if (applied.status !== 200 || !applyData?.applied) {
    fail(`gerçek restore HTTP ${applied.status} ${String(applied.body).slice(0, 240)}`);
  } else {
    const note = psql(dbUrl, "SELECT note FROM v5a7_probe WHERE id = 1");
    if (note !== 'restored') fail(`restore uygulandı ama probe=${note}`);
    else ok('yerel throwaway DB gerçek restore uygulandı (probe=restored)');
  }

  // Rollback path: dump fails after a visible write; single-transaction + snapshot should revert.
  psql(dbUrl, "UPDATE v5a7_probe SET note = 'before-bad' WHERE id = 1");
  const badSql = Buffer.from([
    '--',
    '-- PostgreSQL database dump',
    '--',
    'SET statement_timeout = 0;',
    "UPDATE v5a7_probe SET note = 'should-rollback' WHERE id = 1;",
    "DO $$ BEGIN RAISE EXCEPTION 'v5a7 boom'; END $$;",
    '',
  ].join('\n'), 'utf8');
  const badEnc = backupSafe.encryptBuffer(badSql);
  const badSum = backupSafe.sha256Buffer(badEnc);
  const badMp = multipart(
    { checksum: badSum, dryRun: '0', password: PASSWORD },
    'file',
    'touristlio-backup-v5a7-bad.sql.enc',
    badEnc,
  );
  const badRes = await request(`${baseUrl}/api/admin/backup/restore`, {
    method: 'POST',
    jar,
    headers: { Origin: baseUrl, 'Content-Type': badMp.contentType },
    body: badMp.body,
  });
  if (badRes.status < 400) fail(`bozuk dump restore başarılı olmamalı: ${badRes.status}`);
  else {
    const msg = String(badRes.json?.error || badRes.body || '');
    const after = psql(dbUrl, "SELECT note FROM v5a7_probe WHERE id = 1");
    if (after === 'should-rollback') fail('bozuk dump sonrası probe rollback olmadı');
    else if (/geri alındı|rollback|başarısız/i.test(msg)) {
      ok(`bozuk dump → hata + rollback (note=${after}, HTTP ${badRes.status})`);
    } else ok(`bozuk dump reddedildi (note=${after}, HTTP ${badRes.status})`);
  }
}

async function main() {
  staticChecks();
  unitEncryptChecks();

  const baseDb = databaseUrl();
  if (!isLocalDatabase(baseDb)) {
    fail('Canlı/uzak DB ile restore testi yok — yalnız yerel Postgres');
    console.error('\nverify-v5-adim7 FAILED (uzak DB)');
    process.exit(1);
  }

  const adminUrl = swapDatabase(baseDb, 'postgres');
  try {
    psql(adminUrl, `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${DB_NAME}' AND pid <> pg_backend_pid();`);
  } catch { /* ignore */ }
  try { psql(adminUrl, `DROP DATABASE IF EXISTS ${DB_NAME}`); } catch { /* ignore */ }
  psql(adminUrl, `CREATE DATABASE ${DB_NAME}`);
  const dbUrl = swapDatabase(baseDb, DB_NAME);

  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT,
    env: {
      ...process.env,
      DATABASE_URL: dbUrl,
      PORT: String(PORT),
      NODE_ENV: 'development',
      JWT_SECRET: 'v5-adim7-jwt-secret-not-for-production-use-0123456789ab',
      ADMIN_EMAIL: EMAIL,
      ADMIN_PASSWORD: PASSWORD,
      BACKUP_ENCRYPTION_KEY: ENC_KEY,
      SITEMAP_ON_START: 'false',
      LIVE_DATA_CRON: 'false',
      SEED_ON_START: 'false',
      AUTH_RATE_LIMIT_MAX: '200',
      LOG_LEVEL: 'warn',
    },
    stdio: 'ignore',
  });

  const base = `http://127.0.0.1:${PORT}`;
  try {
    await waitHealth(base);
    await runtimeLocalRestore(base, dbUrl);
  } catch (err) {
    fail(err.message || String(err));
  } finally {
    child.kill('SIGTERM');
    await sleep(400);
    try { child.kill('SIGKILL'); } catch { /* ignore */ }
    try { psql(adminUrl, `DROP DATABASE IF EXISTS ${DB_NAME}`); } catch { /* ignore */ }
  }

  // Report for Yasin / PR: this environment has tools; Render may not.
  ok('Not: Canlı Render’da pg_dump/psql yoksa API 503 + Supabase Backups notu döner (sır yazılmaz)');

  if (failed) {
    console.error(`\nverify-v5-adim7 FAILED (${failed})`);
    process.exit(1);
  }
  console.log('\nverify-v5-adim7 OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
