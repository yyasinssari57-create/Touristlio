#!/usr/bin/env node
/**
 * V5 Adım 5 — CSRF on settings / travel-lists / trip-plans / reports / notifications.
 *
 * Usage: npm run verify:v5-adim5
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const PORT = process.env.VERIFY_V5_ADIM5_PORT || '3195';

let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) { console.error('  ✗', msg); failed += 1; }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

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
  console.log('verify-v5-adim5-csrf');
  const indexJs = read('server/index.js');
  const mounts = [
    '/api/settings',
    '/api/travel-lists',
    '/api/trip-plans',
    '/api/reports',
    '/api/notifications',
  ];
  for (const m of mounts) {
    const re = new RegExp(`app\\.use\\(\\s*'${m.replace(/\//g, '\\/')}'\\s*,\\s*csrfProtection\\s*,`);
    if (!re.test(indexJs)) fail(`${m} csrfProtection ile mount edilmemiş`);
    else ok(`${m} → csrfProtection`);
  }
  if (/app\.use\(\s*'\/api\/analytics'\s*,\s*csrfProtection\s*,/.test(indexJs)) {
    fail('/api/analytics yanlışlıkla csrfProtection aldı (track dokunulmamalı)');
  } else ok('/api/analytics CSRF’siz kaldı (track)');
  if (!/app\.use\(\s*'\/api\/analytics'\s*,\s*analyticsRoutes\s*\)/.test(indexJs)) {
    fail('/api/analytics mount bulunamadı');
  } else ok('/api/analytics mount duruyor');
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
  const origin = base;
  const evil = 'https://evil.example';

  const probes = [
    { path: '/api/notifications/read-all', method: 'POST', body: {} },
    { path: '/api/reports', method: 'POST', body: { targetType: 'tiola', targetId: 1, reason: 'spam' } },
    { path: '/api/travel-lists', method: 'POST', body: { name: 'CSRF Test' } },
    { path: '/api/trip-plans', method: 'POST', body: { name: 'CSRF Test' } },
    { path: '/api/settings', method: 'PUT', body: { site_name: 'x' } },
  ];

  // GET should still work (settings public read if any)
  const getSettings = await request(`${base}/api/settings`);
  if (![200, 401, 403, 404].includes(getSettings.status)) {
    fail(`GET /api/settings beklenmeyen ${getSettings.status}`);
  } else ok(`GET /api/settings → ${getSettings.status} (CSRF engellemedi)`);

  for (const p of probes) {
    const noOrigin = await request(`${base}${p.path}`, {
      method: p.method,
      body: p.body,
    });
    if (noOrigin.status !== 403 || !String(noOrigin.json?.error || noOrigin.body || '').includes('CSRF')) {
      fail(`${p.method} ${p.path} Origin yok → ${noOrigin.status} (${noOrigin.json?.error || noOrigin.body.slice(0, 80)}), expected 403 CSRF`);
    } else ok(`${p.method} ${p.path} Origin yok → 403 CSRF`);

    const badOrigin = await request(`${base}${p.path}`, {
      method: p.method,
      headers: { Origin: evil },
      body: p.body,
    });
    // CORS katmanı CSRF'den önce 403 verebilir; her iki 403 de kabul (farklı Origin reddi).
    const badErr = String(badOrigin.json?.error || badOrigin.body || '');
    if (badOrigin.status !== 403 || !(badErr.includes('CSRF') || badErr.includes('CORS'))) {
      fail(`${p.method} ${p.path} evil Origin → ${badOrigin.status} (${badErr.slice(0, 80)}), expected 403`);
    } else ok(`${p.method} ${p.path} evil Origin → 403 (${badErr.includes('CORS') ? 'CORS' : 'CSRF'})`);

    const goodOrigin = await request(`${base}${p.path}`, {
      method: p.method,
      headers: { Origin: origin },
      body: p.body,
    });
    // CSRF geçmeli; auth/validation 401/400/403(yetki) olabilir — CSRF 403 metni olmamalı
    const err = String(goodOrigin.json?.error || '');
    if (goodOrigin.status === 403 && err.includes('CSRF')) {
      fail(`${p.method} ${p.path} aynı Origin hâlâ CSRF 403`);
    } else ok(`${p.method} ${p.path} aynı Origin CSRF geçti → ${goodOrigin.status}`);
  }

  // Analytics track must NOT require CSRF
  const trackNoOrigin = await request(`${base}/api/analytics/track`, {
    method: 'POST',
    body: { path: '/', event: 'page_view' },
  });
  if (trackNoOrigin.status === 403 && String(trackNoOrigin.json?.error || '').includes('CSRF')) {
    fail('POST /api/analytics/track CSRF ile engellendi (istemiyoruz)');
  } else ok(`POST /api/analytics/track CSRF’siz → ${trackNoOrigin.status}`);
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
      AUTH_RATE_LIMIT_MAX: '200',
      FORM_RATE_LIMIT_MAX: '200',
      RECAPTCHA_SITE_KEY: '',
      RECAPTCHA_SECRET: '',
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
    console.error(`\nverify-v5-adim5 FAILED (${failed})`);
    process.exit(1);
  }
  console.log('\nverify-v5-adim5 OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
