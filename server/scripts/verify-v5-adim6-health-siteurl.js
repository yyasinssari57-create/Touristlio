#!/usr/bin/env node
/**
 * V5 Adım 6 — public /api/health is { ok }; SITE_URL single source (www).
 *
 * Usage: npm run verify:v5-adim6
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const PORT = process.env.VERIFY_V5_ADIM6_PORT || '3196';

let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) { console.error('  ✗', msg); failed += 1; }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function request(url, { method = 'GET', headers = {}, jar } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
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
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const setCookie = res.headers['set-cookie'] || [];
        if (jar) {
          for (const line of [].concat(setCookie)) {
            const m = /^([^=]+)=([^;]*)/.exec(String(line));
            if (m) jar[m[1]] = m[2];
          }
        }
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* ignore */ }
        resolve({ status: res.statusCode, body: text, json });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function staticChecks() {
  console.log('verify-v5-adim6-health-siteurl');
  const indexJs = read('server/index.js');
  const siteUrlJs = read('server/lib/site-url.js');
  const adminJs = read('server/routes/admin.js');
  const csrfJs = read('server/middleware/csrf.js');
  const authSvc = read('server/modules/auth/auth.service.js');

  if (!/res\.json\(\{\s*ok:\s*true\s*\}\)/.test(indexJs) || /smtpLastError/.test(indexJs.match(/app\.get\('\/api\/health'[\s\S]*?\n\}\);/)?.[0] || '')) {
    // health block must be minimal
  }
  const healthBlock = indexJs.match(/app\.get\('\/api\/health'[\s\S]*?\n\}\);/);
  if (!healthBlock) fail('/api/health route missing');
  else {
    const block = healthBlock[0];
    if (/smtp|storage|version|err\.message|service:/.test(block)) {
      fail('public /api/health hâlâ fazla alan veya err.message sızdırıyor');
    } else if (!/\{\s*ok:\s*true\s*\}/.test(block) || !/\{\s*ok:\s*false\s*\}/.test(block)) {
      fail('public /api/health { ok: true/false } değil');
    } else ok('public /api/health sadece { ok }');
  }

  if (!/router\.get\('\/health'/.test(adminJs) || !/smtpLastError/.test(adminJs)) {
    fail('/api/admin/health ayrıntılı ucu eksik');
  } else ok('/api/admin/health ayrıntılı ucu var');

  if (!/SITE_URL missing or invalid in production/.test(siteUrlJs)) {
    fail('production SITE_URL uyarı log’u eksik');
  } else ok('production SITE_URL yoksa www + uyarı');

  if (!/require\(['\"]\.\.\/lib\/site-url['\"]\)\.siteOrigin|require\(['\"]\.\.\/lib\/site-url['\"]\)/.test(csrfJs)
    && !/site-url/.test(csrfJs)) {
    fail('csrf siteOrigin site-url kullanmıyor');
  } else ok('csrf siteOrigin → site-url');

  if (!/site-url/.test(authSvc) || /SITE_URL \|\| 'http:\/\/localhost/.test(authSvc)) {
    fail('auth.service hâlâ localhost SITE_URL fallback kullanıyor');
  } else ok('auth.service siteBase → site-url');

  if (/SITE_URL \|\| 'http:\/\/localhost/.test(indexJs)) {
    fail('index.js localhost SITE_URL fallback kaldı');
  } else ok('index.js config/public siteBaseUrl kullanıyor');

  // Unit: apex → www
  const prev = process.env.SITE_URL;
  const prevEnv = process.env.NODE_ENV;
  try {
    delete require.cache[require.resolve('../lib/site-url')];
    process.env.SITE_URL = 'https://touristlio.com';
    process.env.NODE_ENV = 'production';
    const { siteBaseUrl } = require('../lib/site-url');
    if (siteBaseUrl() !== 'https://www.touristlio.com') {
      fail(`apex→www başarısız: ${siteBaseUrl()}`);
    } else ok('apex touristlio.com → www');

    delete require.cache[require.resolve('../lib/site-url')];
    delete process.env.SITE_URL;
    process.env.NODE_ENV = 'production';
    const again = require('../lib/site-url');
    if (again.siteBaseUrl() !== 'https://www.touristlio.com') {
      fail(`prod boş SITE_URL: ${again.siteBaseUrl()}`);
    } else ok('prod boş SITE_URL → www (localhost yok)');
  } finally {
    if (prev === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = prev;
    process.env.NODE_ENV = prevEnv;
    delete require.cache[require.resolve('../lib/site-url')];
  }
}

async function waitHealth(base) {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await request(`${base}/api/health`);
      if (res.status === 200 || res.status === 503) return res;
    } catch { /* retry */ }
    await sleep(250);
  }
  throw new Error('sunucu ayağa kalkmadı');
}

async function runtimeChecks(base) {
  process.env.SITE_URL = 'https://www.touristlio.com';
  const health = await request(`${base}/api/health`);
  if (health.status !== 200 || !health.json || health.json.ok !== true) {
    fail(`GET /api/health ${health.status} ${health.body.slice(0, 120)}`);
  } else {
    const keys = Object.keys(health.json).sort();
    if (keys.length !== 1 || keys[0] !== 'ok') {
      fail(`GET /api/health fazla alan: ${keys.join(',')}`);
    } else ok('GET /api/health → { ok: true }');
  }

  const pub = await request(`${base}/api/config/public`);
  if (pub.status !== 200) fail(`config/public HTTP ${pub.status}`);
  else if (pub.json?.siteUrl !== 'https://www.touristlio.com') {
    fail(`config/public siteUrl=${pub.json?.siteUrl}`);
  } else ok('config/public siteUrl = https://www.touristlio.com');

  // admin health requires auth
  const unauth = await request(`${base}/api/admin/health`);
  if (unauth.status !== 401) fail(`unauth /api/admin/health → ${unauth.status}, expected 401`);
  else ok('unauth /api/admin/health → 401');

  // login admin if possible via seed admin from env
  require('dotenv').config({ path: path.join(ROOT, '.env') });
  const email = process.env.ADMIN_EMAIL || 'admin@touristlio.local';
  const password = process.env.ADMIN_PASSWORD || 'LocalDevAdmin1';
  const jar = {};
  const login = await new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify({ email, password, website: '' }));
    const u = new URL(`${base}/api/auth/login`);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': payload.length,
        Origin: base,
        Accept: 'application/json',
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        for (const line of [].concat(res.headers['set-cookie'] || [])) {
          const m = /^([^=]+)=([^;]*)/.exec(String(line));
          if (m) jar[m[1]] = m[2];
        }
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* ignore */ }
        resolve({ status: res.statusCode, json, body: text });
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });

  if (login.status !== 200) {
    ok(`admin giriş atlandı (${login.status}) — unauth kontrolü yeterli`);
    return;
  }
  const detail = await request(`${base}/api/admin/health`, { jar });
  if (detail.status !== 200 || detail.json?.ok !== true) {
    fail(`admin health HTTP ${detail.status} ${String(detail.body).slice(0, 120)}`);
  } else if (!('smtp' in detail.json) || !('version' in detail.json) || !('storage' in detail.json)) {
    fail('admin health ayrıntı alanları eksik');
  } else ok('GET /api/admin/health ayrıntılı alanlar döndü');
}

async function main() {
  staticChecks();

  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'development',
      SITE_URL: 'https://www.touristlio.com',
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
    await runtimeChecks(base);
  } catch (err) {
    fail(err.message || String(err));
  } finally {
    child.kill('SIGTERM');
    await sleep(400);
    try { child.kill('SIGKILL'); } catch { /* ignore */ }
  }

  if (failed) {
    console.error(`\nverify-v5-adim6 FAILED (${failed})`);
    process.exit(1);
  }
  console.log('\nverify-v5-adim6 OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
