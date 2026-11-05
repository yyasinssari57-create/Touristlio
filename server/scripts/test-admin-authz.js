/**
 * V4 Adım 14 — yönetici yetki testi (güvenli yöntem).
 *
 * Tüm /api/admin uçlarını ve kullanıcı / moderasyon / ayar mutasyonlarını
 * anonim, üye, editör, moderatör ve staff ile çağırır. Beklenen ret: 401 veya 403.
 * Yetkisi olan rolün veri yazabileceği uçlar o rolle gönderilmez.
 *
 * Canlı adres (TEST_ADMIN_AUTHZ_URL) verilirse yalnızca anonim ve, hesap
 * verilmişse, normal üye çalışır. Silme ve geri yükleme isteği gitmez.
 * Yedek dry-run, checksum, rollback ve yol kaçışı yalnızca yerel veritabanında.
 *
 * Usage:
 *   npm run test:admin-authz
 *   npm run verify:v4-adim14
 *   TEST_ADMIN_AUTHZ_URL=https://ornek TEST_MEMBER_EMAIL=... TEST_MEMBER_PASSWORD=... npm run test:admin-authz
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const REPORT_PATH = path.join(ROOT, 'reports', 'v4-adim14-authz.json');
const PASSWORD = 'Adim14Test1';
const ROLE_FALLBACK = {
  moderator: [
    'admin.dashboard', 'admin.analytics', 'admin.moderate', 'admin.places', 'admin.cities',
    'admin.categories', 'admin.content',
  ],
  editor: ['admin.dashboard', 'admin.analytics', 'admin.content'],
  staff: [
    'admin.dashboard', 'admin.analytics', 'admin.moderate', 'admin.places', 'admin.cities',
    'admin.categories', 'admin.content',
  ],
  member: [],
};

let failed = 0;
const notes = [];

function ok(message) {
  console.log('  ✓', message);
}

function fail(message) {
  console.error('  ✗', message);
  failed += 1;
}

function note(message) {
  notes.push(message);
  console.log('  ·', message);
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function quotedStrings(src) {
  return [...String(src || '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

function parseRoutes(rel, mount) {
  const lines = read(rel).split('\n');
  let blanketPerms = null;
  const routes = [];
  for (const line of lines) {
    const usePerm = line.match(/router\.use\(\s*authRequired\s*,\s*checkPermission\(([^)]*)\)/);
    if (usePerm) blanketPerms = quotedStrings(usePerm[1]);
    const match = line.match(/^router\.(get|post|put|patch|delete)\(\s*'([^']+)'(.*)$/);
    if (!match) continue;
    const rest = match[3];
    const permCall = rest.match(/checkPermission\(([^)]*)\)/);
    const perms = permCall ? quotedStrings(permCall[1]) : (blanketPerms ? blanketPerms.slice() : []);
    const adminOnly = /requireRole\(\s*'admin'\s*\)/.test(rest);
    const method = match[1].toUpperCase();
    const sub = match[2];
    if (mount === '/api/settings' && (sub === '/public' || sub.startsWith('/public'))) continue;
    routes.push({
      method,
      sub,
      mount,
      perms,
      adminOnly,
      source: rel,
      mutation: method !== 'GET' && method !== 'HEAD',
    });
  }
  return routes;
}

function routeKey(route) {
  return `${route.method} ${route.sub}`;
}

/** Empty body would insert or replace real rows. Unauthorized calls still go out. */
function writesOnEmptyBody(route) {
  if (route.mount === '/api/moderation' && route.mutation) return true;
  return [
    'POST /places',
    'POST /places/import',
    'POST /cities',
    'POST /categories',
    'PUT /categories/reorder',
    'POST /blog-categories',
  ].includes(routeKey(route));
}

function isDestructiveLive(route) {
  if (route.method === 'DELETE') return true;
  return route.sub === '/backup/restore' || route.sub.endsWith('/restore');
}

function fillPath(sub, memberId) {
  let next = sub.replace(':contentType', 'tiola');
  if (sub.includes('/role') && memberId) next = next.replace(':id', String(memberId));
  return next.replace(/:[A-Za-z]+/g, '0');
}

function requestUrl(route, memberId) {
  const sub = fillPath(route.sub, memberId);
  if (sub === '/') return route.mount;
  return route.mount + sub;
}

function expectsDeny(route, role, permsByRole) {
  if (role === 'anon' || role === 'member') return true;
  if (route.adminOnly) return true;
  if (!route.perms.length) return false;
  const have = permsByRole[role] || [];
  return !route.perms.some((perm) => have.includes(perm));
}

function bodyFor(route) {
  if (!route.mutation) return undefined;
  if (route.sub.includes('/role')) return { role: 'admin' };
  if (route.mount === '/api/settings' && route.method === 'PUT') {
    return { settings: { adim14_probe: 'no' } };
  }
  return {};
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
  return Object.entries(jar).map(([key, value]) => `${key}=${value}`).join('; ');
}

function request(url, { method = 'GET', body, bodyRaw, headers, jar } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    let payload = null;
    if (bodyRaw != null) payload = Buffer.isBuffer(bodyRaw) ? bodyRaw : Buffer.from(bodyRaw);
    else if (body != null) payload = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const hdrs = { ...(headers || {}) };
    if (jar && Object.keys(jar).length) hdrs.Cookie = cookieHeader(jar);
    if (payload != null && bodyRaw == null && !hdrs['Content-Type']) hdrs['Content-Type'] = 'application/json';
    if (payload != null) hdrs['Content-Length'] = payload.length;
    const req = http.request({
      hostname: target.hostname,
      port: target.port,
      path: target.pathname + target.search,
      method,
      headers: hdrs,
      timeout: 30000,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        if (jar) mergeCookies(jar, res.headers['set-cookie']);
        const text = Buffer.concat(chunks).toString('utf8');
        let json = {};
        try { json = JSON.parse(text); } catch { /* not json */ }
        resolve({ status: res.statusCode, json, body: text, headers: res.headers });
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
      const req = http.get(url, { timeout: 1000 }, (res) => { res.resume(); resolve(); });
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

function adminDatabaseUrl(url) {
  return swapDatabase(url, 'postgres');
}

function psql(url, sql, { tuples = true } = {}) {
  const args = [url, '-v', 'ON_ERROR_STOP=1'];
  if (tuples) args.push('-t', '-A');
  args.push('-c', sql);
  const result = spawnSync('psql', args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'psql başarısız').slice(0, 400));
  }
  return result.stdout.trim();
}

function loadRolePerms(url) {
  const perms = { member: [] };
  for (const role of ['editor', 'moderator', 'staff']) {
    const raw = psql(url, `SELECT permission_slug FROM role_permissions WHERE role_slug = '${role}' ORDER BY 1`);
    const list = raw ? raw.split('\n').map((line) => line.trim()).filter(Boolean) : [];
    perms[role] = list.length ? list : (ROLE_FALLBACK[role] || []);
  }
  return perms;
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
      SEED_ON_START: 'false',
      RECAPTCHA_SITE_KEY: '',
      RECAPTCHA_SECRET: '',
      FORM_RATE_LIMIT_MAX: '80',
      AUTH_RATE_LIMIT_MAX: '80',
      ADMIN_IP_RATE_LIMIT_MAX: '10000',
      ADMIN_TOOL_RATE_LIMIT_MAX: '100',
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function stopServer(child) {
  if (!child || child.killed) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 300));
  try { child.kill('SIGKILL'); } catch { /* already gone */ }
}

async function register(root, jar, email) {
  return request(`${root}/api/auth/register`, {
    method: 'POST',
    jar,
    headers: { Origin: root },
    body: { name: 'Adim14 Test', email, password: PASSWORD, kvkkAccepted: true, website: '' },
  });
}

async function login(root, jar, email, password) {
  return request(`${root}/api/auth/login`, {
    method: 'POST',
    jar,
    headers: { Origin: root },
    body: { email, password },
  });
}

function sqlQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function recreateDatabase(baseUrl, name) {
  const adminUrl = adminDatabaseUrl(baseUrl);
  psql(adminUrl, `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${name}' AND pid <> pg_backend_pid()`, { tuples: false });
  psql(adminUrl, `DROP DATABASE IF EXISTS ${name}`, { tuples: false });
  psql(adminUrl, `CREATE DATABASE ${name}`, { tuples: false });
}

function dropDatabase(baseUrl, name) {
  const adminUrl = adminDatabaseUrl(baseUrl);
  try {
    psql(adminUrl, `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${name}' AND pid <> pg_backend_pid()`, { tuples: false });
    psql(adminUrl, `DROP DATABASE IF EXISTS ${name}`, { tuples: false });
  } catch (err) {
    note(`geçici veritabanı silinemedi: ${err.message}`);
  }
}

function prepareThrowaway(url) {
  const script = `
    const { initDb, db, closePool } = require('./server/db');
    const { seedAdmin } = require('./server/seed');
    (async () => {
      await initDb();
      for (let i = 1; i <= 10; i += 1) {
        await db.prepare('INSERT INTO places (id, name) VALUES (?, ?)').run(910000 + i, 'adim14 ' + i);
      }
      await db.prepare("INSERT INTO site_settings (key, value) VALUES ('adim14_sentinel', 'before') ON CONFLICT (key) DO UPDATE SET value = 'before'").run();
      await seedAdmin();
      await closePool();
    })().catch((err) => { console.error(err.message); process.exit(1); });
  `;
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: url },
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'geçici veritabanı hazırlanamadı').slice(0, 500));
  }
}

function multipartBody(fields, file) {
  const boundary = `----adim14${crypto.randomBytes(8).toString('hex')}`;
  const chunks = [];
  for (const [key, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`,
    ));
  }
  if (file) {
    chunks.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    ));
    chunks.push(file.buffer);
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

function dumpBuffer(sqlAfterHeader) {
  return Buffer.from(`--\n-- PostgreSQL database dump\n--\nSET statement_timeout = 0;\n${sqlAfterHeader || 'SELECT 1;\n'}`);
}

function testPathLibrary() {
  const backupSafe = require('../lib/backup-safe');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adim14-backups-'));
  const outside = path.join(os.tmpdir(), `adim14-outside-${process.pid}.sql`);
  const prev = process.env.BACKUP_DIR;
  process.env.BACKUP_DIR = dir;
  try {
    try { fs.unlinkSync(outside); } catch { /* absent */ }
    const attacks = [
      '../etc/passwd',
      '..\\..\\windows\\system32\\config\\sam',
      '/etc/passwd',
      '/tmp/touristlio-backup-2026-09-05.sql',
      'touristlio-backup-x.sql/../../etc/passwd',
      'touristlio-backup-..sql',
      `../${path.basename(outside)}`,
      `..\\${path.basename(outside)}`,
    ];
    let escaped = 0;
    for (const name of attacks) {
      const resolved = backupSafe.resolveBackupFile(name);
      if (backupSafe.safeBackupBasename(name) != null || resolved != null) {
        fail(`yol kabul edildi: ${name}`);
        escaped += 1;
      }
    }
    if (!escaped) ok('yedek adı üst klasöre, mutlak yola ve .. içeren ada kapalı');
    const safeName = 'touristlio-backup-adim14-probe.sql';
    const full = backupSafe.resolveBackupFile(safeName);
    if (!full || !full.startsWith(`${dir}${path.sep}`)) {
      fail('geçerli yedek adı klasörün içinde çözülmedi');
    } else {
      fs.writeFileSync(full, 'probe');
      if (fs.existsSync(outside)) fail('deneme dosyası yedek klasörünün dışına yazıldı');
      else ok('yazma denemesi yalnızca yedek klasörünün içinde kaldı');
    }
    const hex = backupSafe.sha256Buffer(Buffer.from('adim14'));
    if (!backupSafe.checksumsMatch(hex, hex) || backupSafe.checksumsMatch(hex, 'ab'.repeat(32))) {
      fail('checksum karşılaştırması bozuk');
    } else ok('checksum aynı özü kabul eder, farklı özü reddeder');
  } finally {
    if (prev === undefined) delete process.env.BACKUP_DIR;
    else process.env.BACKUP_DIR = prev;
    fs.rmSync(dir, { recursive: true, force: true });
    try { fs.unlinkSync(outside); } catch { /* absent */ }
  }
}

async function sweep(root, routes, identities, permsByRole, { live }) {
  const unexpected = [];
  const allowedOther = [];
  const skipped = [];
  let deniedCalls = 0;
  let deniedOk = 0;

  for (const identity of identities) {
    for (const route of routes) {
      const deny = expectsDeny(route, identity.role, permsByRole);
      if (live && isDestructiveLive(route)) {
        skipped.push(`${identity.role} ${route.method} ${requestUrl(route, identity.memberId)} (canlıda silme/geri yükleme yok)`);
        continue;
      }
      if (!deny && writesOnEmptyBody(route)) {
        skipped.push(`${identity.role} ${route.method} ${requestUrl(route, identity.memberId)} (yetkili rol, boş gövde kayıt açabilir)`);
        continue;
      }
      const url = `${root}${requestUrl(route, identity.memberId)}`;
      const res = await request(url, {
        method: route.method,
        jar: identity.jar,
        headers: { Origin: root },
        body: bodyFor(route),
      });
      if (deny) {
        deniedCalls += 1;
        if (res.status === 401 || res.status === 403) deniedOk += 1;
        else {
          unexpected.push(`${identity.role} ${route.method} ${requestUrl(route, identity.memberId)} → ${res.status}`);
          fail(`${identity.role} ${route.method} ${requestUrl(route, identity.memberId)} → HTTP ${res.status}, beklenen 401/403`);
        }
      } else if (res.status === 401 || res.status === 403) {
        unexpected.push(`${identity.role} ${route.method} ${requestUrl(route, identity.memberId)} → ${res.status} (yetkisi var sanılıyordu)`);
        note(`${identity.role} ${route.method} ${requestUrl(route, identity.memberId)} → ${res.status} (rol izni var, kapı kapalı)`);
      } else {
        allowedOther.push(`${identity.role} ${route.method} ${requestUrl(route, identity.memberId)} → ${res.status}`);
      }
    }
  }

  if (deniedCalls && deniedOk === deniedCalls) {
    ok(`yetkisiz çağrılar ${deniedOk}/${deniedCalls} → 401 veya 403`);
  }
  return { unexpected, allowedOther, skipped, deniedCalls, deniedOk };
}

async function assertNoEscalation(url, root, identities, memberId) {
  for (const identity of identities) {
    if (identity.role === 'anon') continue;
    for (const prefix of ['/api/admin/users', '/api/users']) {
      const res = await request(`${root}${prefix}/${memberId}/role`, {
        method: 'PATCH',
        jar: identity.jar,
        headers: { Origin: root },
        body: { role: 'admin' },
      });
      if (res.status !== 403 && res.status !== 401) {
        fail(`${identity.role} PATCH ${prefix}/:id/role → ${res.status} (admin rolü verilmemeli)`);
      }
    }
    const settings = await request(`${root}/api/settings`, {
      method: 'PUT',
      jar: identity.jar,
      headers: { Origin: root },
      body: { settings: { adim14_probe: 'no' } },
    });
    if (settings.status !== 403 && settings.status !== 401) {
      fail(`${identity.role} PUT /api/settings → ${settings.status} (ayar kilitli kalmalı)`);
    }
  }
  const roleNow = psql(url, `SELECT role FROM users WHERE id = ${Number(memberId)}`);
  if (roleNow !== 'member') {
    psql(url, `UPDATE users SET role = 'member' WHERE id = ${Number(memberId)}`, { tuples: false });
    fail(`üye rolü değişmiş: ${roleNow}. Geri member yapıldı.`);
  } else ok('üye rolü admin yapılmadı (admin ve kullanıcı uçları)');
  const probe = psql(url, "SELECT COUNT(*) FROM site_settings WHERE key = 'adim14_probe'");
  if (probe !== '0') {
    psql(url, "DELETE FROM site_settings WHERE key = 'adim14_probe'", { tuples: false });
    fail('adim14_probe ayarı yazıldı. Satır silindi.');
  } else ok('ayar anahtarı kilitli: moderatör, editör, staff ve üye yazamadı');
}

async function assertAdminCannotGrantAdmin(url, root, adminJar, memberId) {
  const res = await request(`${root}/api/users/${memberId}/role`, {
    method: 'PATCH',
    jar: adminJar,
    headers: { Origin: root },
    body: { role: 'admin' },
  });
  const roleNow = psql(url, `SELECT role FROM users WHERE id = ${Number(memberId)}`);
  if (res.status === 200 || roleNow === 'admin') {
    psql(url, `UPDATE users SET role = 'member' WHERE id = ${Number(memberId)}`, { tuples: false });
    fail('admin, başka hesaba admin rolü verebildi. Geri alındı.');
    return;
  }
  if (res.status !== 400) fail(`admin → admin rolü HTTP ${res.status}, beklenen 400`);
  else ok('admin bile hedefe admin rolü veremiyor');
}

function auditSamples(url) {
  const raw = psql(url, `
    SELECT id || '|' || action || '|' || COALESCE(target_type, '') || '|' || COALESCE(target_id::text, '') || '|' || COALESCE(left(detail, 60), '') || '|' || created_at
    FROM admin_audit_log
    ORDER BY id DESC
    LIMIT 6
  `);
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map((line) => {
    const [id, action, targetType, targetId, detail, createdAt] = line.split('|');
    return { id, action, targetType, targetId, detail, createdAt };
  });
}

async function testBackupHttp(baseUrl) {
  const name = 'touristlio_adim14';
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adim14-http-backups-'));
  const outside = path.join(os.tmpdir(), `adim14-http-outside-${process.pid}.sql`);
  const url = swapDatabase(baseUrl, name);
  const port = process.env.TEST_ADMIN_AUTHZ_BACKUP_PORT || '3095';
  const root = `http://127.0.0.1:${port}`;
  let child = null;
  try {
    try { fs.unlinkSync(outside); } catch { /* absent */ }
    recreateDatabase(baseUrl, name);
    prepareThrowaway(url);
    child = spawnServer(port, { DATABASE_URL: url, BACKUP_DIR: backupDir });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    await waitForServer(`${root}/`, 400);
    const adminJar = {};
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@test.local';
    const adminPassword = process.env.ADMIN_PASSWORD || 'TestAdmin123!';
    const loggedIn = await login(root, adminJar, adminEmail, adminPassword);
    if (loggedIn.status !== 200) {
      fail(`yedek testi admin girişi HTTP ${loggedIn.status}`);
      if (stderr) note(stderr.slice(-300));
      return { samples: [] };
    }
    ok('geçici yerel veritabanında admin girişi');

    const backupSafe = require('../lib/backup-safe');
    const benign = dumpBuffer('SELECT 1;\n');
    const benignHex = backupSafe.sha256Buffer(benign);
    const dry = multipartBody(
      { checksum: benignHex, dryRun: 'true' },
      { name: 'touristlio-backup-adim14.sql', buffer: benign },
    );
    const dryRes = await request(`${root}/api/admin/backup/restore`, {
      method: 'POST',
      jar: adminJar,
      headers: { Origin: root, 'Content-Type': dry.contentType },
      bodyRaw: dry.body,
    });
    const afterDry = psql(url, "SELECT value FROM site_settings WHERE key = 'adim14_sentinel'");
    if (dryRes.status !== 200 || dryRes.json?.data?.applied !== false || afterDry !== 'before') {
      fail(`dry-run HTTP ${dryRes.status} applied=${dryRes.json?.data?.applied} sentinel=${afterDry} ${dryRes.body.slice(0, 180)}`);
    } else ok('dry-run checksum ve dump başlığını doğruladı, veritabanına yazmadı');

    const mismatch = multipartBody(
      { checksum: 'ab'.repeat(32), dryRun: 'true' },
      { name: 'touristlio-backup-adim14.sql', buffer: benign },
    );
    const mismatchRes = await request(`${root}/api/admin/backup/restore`, {
      method: 'POST',
      jar: adminJar,
      headers: { Origin: root, 'Content-Type': mismatch.contentType },
      bodyRaw: mismatch.body,
    });
    const afterMismatch = psql(url, "SELECT value FROM site_settings WHERE key = 'adim14_sentinel'");
    if (mismatchRes.status !== 400 || afterMismatch !== 'before') {
      fail(`yanlış checksum HTTP ${mismatchRes.status} sentinel=${afterMismatch}`);
    } else ok('yanlış checksum reddedildi, sentinel duruyor');

    const evil = multipartBody(
      { checksum: benignHex, dryRun: 'true' },
      { name: `../../../../tmp/${path.basename(outside)}`, buffer: benign },
    );
    const evilRes = await request(`${root}/api/admin/backup/restore`, {
      method: 'POST',
      jar: adminJar,
      headers: { Origin: root, 'Content-Type': evil.contentType },
      bodyRaw: evil.body,
    });
    const download = await request(
      `${root}/api/admin/backup/download?name=${encodeURIComponent(`../${path.basename(outside)}`)}`,
      { jar: adminJar, headers: { Origin: root } },
    );
    if (evilRes.status === 401 || evilRes.status === 403 || download.status === 401 || download.status === 403) {
      fail('admin yol denemesinde yetki kapısına takıldı');
    } else if (fs.existsSync(outside) || evilRes.status === 200 || download.status === 200) {
      fail(`yol kaçışı HTTP restore ${evilRes.status} download ${download.status}`);
    } else ok(`yol kaçışı reddedildi (restore ${evilRes.status}, indirme ${download.status}), dış dosya yok`);

    const badSql = dumpBuffer(`
INSERT INTO site_settings (key, value) VALUES ('adim14_sentinel', 'hacked')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
SELECT 1/0;
`);
    const rollback = multipartBody(
      { checksum: backupSafe.sha256Buffer(badSql), dryRun: 'false' },
      { name: 'touristlio-backup-adim14-bad.sql', buffer: badSql },
    );
    const rollbackRes = await request(`${root}/api/admin/backup/restore`, {
      method: 'POST',
      jar: adminJar,
      headers: { Origin: root, 'Content-Type': rollback.contentType },
      bodyRaw: rollback.body,
    });
    const afterRollback = psql(url, "SELECT value FROM site_settings WHERE key = 'adim14_sentinel'");
    if (afterRollback !== 'before') {
      fail(`hatalı geri yükleme sentinel=${afterRollback} HTTP ${rollbackRes.status} (veri geri gelmedi)`);
    } else ok(`hatalı geri yükleme sentinel'i before bıraktı (HTTP ${rollbackRes.status})`);

    const cache = await request(`${root}/api/admin/tools/cache-clear`, {
      method: 'POST',
      jar: adminJar,
      headers: { Origin: root },
      body: {},
    });
    if (cache.status !== 200) note(`önbellek temizleme HTTP ${cache.status} (örnek audit için)`);
    else ok('yönetici önbellek temizleme audit kaydı için çalıştı');

    const samples = auditSamples(url);
    if (!samples.length) fail('admin_audit_log boş');
    else {
      ok(`audit log örneği ${samples.length} satır`);
      for (const row of samples) {
        console.log(`    #${row.id} ${row.action} ${row.targetType || '-'} ${row.detail || ''}`.trim());
      }
    }
    const actions = new Set(samples.map((row) => row.action));
    if (!actions.has('db.restore_dry_run')) fail('db.restore_dry_run audit kaydı yok');
    if (!actions.has('db.restore_checksum_mismatch')) fail('db.restore_checksum_mismatch audit kaydı yok');
    if (!actions.has('db.restore_rollback_ok')) fail('db.restore_rollback_ok audit kaydı yok');
    if (!actions.has('tools.cache_clear')) fail('tools.cache_clear audit kaydı yok');
    return { samples, rollbackStatus: rollbackRes.status, sentinel: afterRollback };
  } finally {
    await stopServer(child);
    dropDatabase(baseUrl, name);
    fs.rmSync(backupDir, { recursive: true, force: true });
    try { fs.unlinkSync(outside); } catch { /* absent */ }
  }
}

function writeReport(report) {
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
}

async function main() {
  console.log('test-admin-authz (V4 Adım 14)');
  const routes = [
    ...parseRoutes('server/routes/admin.js', '/api/admin'),
    ...parseRoutes('server/modules/users/users.routes.js', '/api/users'),
    ...parseRoutes('server/modules/moderation/moderation.routes.js', '/api/moderation'),
    ...parseRoutes('server/modules/settings/settings.routes.js', '/api/settings'),
  ];
  console.log(`Uç listesi: ${routes.length}`);
  for (const route of routes) {
    const gate = route.adminOnly ? 'admin' : (route.perms.join(',') || 'panel');
    console.log(`  ${route.method.padEnd(6)} ${route.mount}${route.sub === '/' ? '' : route.sub}  [${gate}]`);
  }

  const ungated = routes.filter((route) => route.mutation && !route.adminOnly && !route.perms.length && route.mount === '/api/admin');
  if (ungated.length) {
    for (const route of ungated) fail(`mutasyon izinsiz: ${route.method} ${route.sub}`);
  } else ok('her admin mutasyonu requireRole(admin) veya checkPermission taşıyor');

  testPathLibrary();

  const liveUrl = String(process.env.TEST_ADMIN_AUTHZ_URL || '').trim().replace(/\/$/, '');
  const report = {
    routes: routes.map((route) => ({
      method: route.method,
      path: `${route.mount}${route.sub === '/' ? '' : route.sub}`,
      perms: route.perms,
      adminOnly: route.adminOnly,
    })),
    live: Boolean(liveUrl),
  };

  if (liveUrl) {
    if (!/^https?:\/\//.test(liveUrl)) {
      fail('TEST_ADMIN_AUTHZ_URL http(s) olmalı');
    } else {
      note(`canlı yetkisiz çağrı: ${liveUrl} (silme ve geri yükleme yok)`);
      const identities = [{ role: 'anon', jar: null, memberId: null }];
      const email = process.env.TEST_MEMBER_EMAIL;
      const password = process.env.TEST_MEMBER_PASSWORD;
      if (email && password) {
        const jar = {};
        const loggedIn = await login(liveUrl, jar, email, password);
        if (loggedIn.status !== 200) fail(`canlı üye girişi HTTP ${loggedIn.status}`);
        else {
          const me = await request(`${liveUrl}/api/auth/me`, { jar, headers: { Origin: liveUrl } });
          const memberId = me.json?.data?.id || me.json?.user?.id || me.json?.id || null;
          identities.push({ role: 'member', jar, memberId });
          ok('canlı test üyesi ile çağrı');
        }
      } else note('canlı üye hesabı verilmedi (TEST_MEMBER_EMAIL / TEST_MEMBER_PASSWORD). Yalnızca anonim.');
      const sweepResult = await sweep(liveUrl, routes, identities, {
        member: [], editor: [], moderator: [], staff: [],
      }, { live: true });
      report.sweep = {
        deniedOk: sweepResult.deniedOk,
        deniedCalls: sweepResult.deniedCalls,
        unexpected: sweepResult.unexpected,
        skipped: sweepResult.skipped.length,
      };
      note('canlıda yedek uygulanmadı');
    }
  } else {
    const baseUrl = databaseUrl();
    if (!isLocalDatabase(baseUrl)) {
      fail('DATABASE_URL yerel değil. Geri yükleme denemesi yapılmadı. Canlı için TEST_ADMIN_AUTHZ_URL kullanın.');
    } else {
      const port = process.env.TEST_ADMIN_AUTHZ_PORT || '3094';
      const root = `http://127.0.0.1:${port}`;
      const child = spawnServer(port, {});
      let stderr = '';
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      try {
        await waitForServer(`${root}/`, 400);
        const permsByRole = loadRolePerms(baseUrl);
        const stamp = Date.now();
        const emails = {
          member: `adim14-member-${stamp}@touristlio.local`,
          editor: `adim14-editor-${stamp}@touristlio.local`,
          moderator: `adim14-mod-${stamp}@touristlio.local`,
          staff: `adim14-staff-${stamp}@touristlio.local`,
        };
        const identities = [{ role: 'anon', jar: null, memberId: null }];
        for (const role of ['member', 'editor', 'moderator', 'staff']) {
          const jar = {};
          const created = await register(root, jar, emails[role]);
          if (created.status !== 201) {
            fail(`${role} kayıt HTTP ${created.status}: ${created.body.slice(0, 160)}`);
            continue;
          }
          identities.push({ role, jar, memberId: null });
        }
        const memberId = Number(psql(baseUrl, `SELECT id FROM users WHERE email = ${sqlQuote(emails.member)}`));
        if (!memberId) fail('üye id okunamadı');
        else {
          for (const identity of identities) identity.memberId = memberId;
          for (const role of ['editor', 'moderator', 'staff']) {
            psql(baseUrl, `UPDATE users SET role = '${role}' WHERE email = ${sqlQuote(emails[role])}`, { tuples: false });
          }
          ok('üyeler hazır: member, editor, moderator, staff');
        }
        const sweepResult = await sweep(root, routes, identities, permsByRole, { live: false });
        report.sweep = {
          deniedOk: sweepResult.deniedOk,
          deniedCalls: sweepResult.deniedCalls,
          unexpected: sweepResult.unexpected,
          allowedOther: sweepResult.allowedOther.length,
          skipped: sweepResult.skipped,
        };
        if (sweepResult.allowedOther.length) {
          note(`yetkili rol, 401/403 değil: ${sweepResult.allowedOther.length} çağrı (kapı açık, yazma yok veya doğrulama durdu)`);
        }
        if (memberId) {
          await assertNoEscalation(baseUrl, root, identities, memberId);
          const adminJar = {};
          const adminEmail = process.env.ADMIN_EMAIL || 'admin@test.local';
          const adminPassword = process.env.ADMIN_PASSWORD || 'TestAdmin123!';
          const adminLogin = await login(root, adminJar, adminEmail, adminPassword);
          if (adminLogin.status !== 200) fail(`yerel admin girişi HTTP ${adminLogin.status}`);
          else await assertAdminCannotGrantAdmin(baseUrl, root, adminJar, memberId);
        }
      } catch (err) {
        fail(`yerel sunucu :${port}: ${err.message}${stderr ? ` (${stderr.slice(-300)})` : ''}`);
      } finally {
        await stopServer(child);
      }

      try {
        report.backup = await testBackupHttp(baseUrl) || {};
      } catch (err) {
        fail(`yedek testi: ${err.message}`);
      }
    }
  }

  report.failed = failed;
  report.notes = notes;
  writeReport(report);

  if (failed) {
    console.error(`test-admin-authz: ${failed} failed`);
    process.exit(1);
  }
  console.log('test-admin-authz: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
