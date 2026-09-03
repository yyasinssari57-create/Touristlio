/**
 * [ORTA-7] User system: login/register errors, JWT expiry logout, favorites,
 * profile (Tiolas / favorites / countries / badges), password reset, email verify.
 * Usage: node server/scripts/verify-user-system.js
 * Optional: VERIFY_USER_URL=http://127.0.0.1:3058 node server/scripts/verify-user-system.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { db, initDb } = require('../db');
const { SESSION_EXPIRED_MSG } = require('../middleware/auth');
const { isArgon2idHash } = require('../auth');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}

console.log('verify-user-system');

const { isValidPreset } = require('../lib/avatars');
if (!isValidPreset('fox') || !isValidPreset('none') || !isValidPreset('traveler') || isValidPreset('not-a-preset')) {
  fail('isValidPreset missing PRESET_IDS (avatar save 500)');
} else ok('avatar presets validate (fox/none/traveler)');

const { isConfigured, smtpStatus } = require('../lib/mailer');
const smtpNow = smtpStatus();
ok(`smtp status configured=${smtpNow.configured} reason=${smtpNow.reason || 'ok'}`);
const prevSmtp = {
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
};
process.env.SMTP_HOST = 'smtp-relay.brevo.com';
process.env.SMTP_USER = 'your-brevo-login@email.com';
process.env.SMTP_PASS = 'your-brevo-smtp-key-here';
if (isConfigured()) fail('placeholder SMTP treated as configured');
else ok('placeholder SMTP is not treated as configured');
const { isConnError } = require('../lib/mailer');
if (!isConnError({ code: 'ETIMEDOUT', message: 'Connection timeout' })) fail('isConnError misses ETIMEDOUT');
else ok('SMTP timeout treated as connection error');
process.env.SMTP_HOST = prevSmtp.SMTP_HOST;
process.env.SMTP_USER = prevSmtp.SMTP_USER;
process.env.SMTP_PASS = prevSmtp.SMTP_PASS;

const appJs = fs.readFileSync(path.join(ROOT, 'public/js/app.js'), 'utf8');
if (!appJs.includes('handleSessionExpired') || !appJs.includes('sessionExpired')) {
  fail('app.js missing session-expire logout');
} else ok('app.js logs out when session expires');
if (!appJs.includes('authFormError') || !appJs.includes('showAuthFormError')) {
  fail('app.js missing inline login/register errors');
} else ok('SPA auth form shows inline errors');
if (!appJs.includes('reloadSavedIds')) fail('app.js missing saved-id reload after login');
else ok('login reloads saved favorites');
if (/googleRating|google_rating|gRating/.test(appJs)) fail('Google rating leaked');
else ok('no Google ratings');

const loginHtml = fs.readFileSync(path.join(ROOT, 'public/login.html'), 'utf8');
const registerHtml = fs.readFileSync(path.join(ROOT, 'public/register.html'), 'utf8');
const resetHtml = fs.readFileSync(path.join(ROOT, 'public/reset-password.html'), 'utf8');
const profileHtml = fs.readFileSync(path.join(ROOT, 'public/profile.html'), 'utf8');
const authClient = fs.readFileSync(path.join(ROOT, 'public/js/auth-client.js'), 'utf8');

if (!loginHtml.includes('authFormError') || !registerHtml.includes('authFormError')) {
  fail('login/register pages missing inline error box');
} else ok('login.html + register.html inline errors');
if (!authClient.includes('parseError') || !authClient.includes('isSessionExpired')) {
  fail('auth-client.js incomplete');
} else ok('auth-client.js parseError + session helper');
if (!resetHtml.includes('authFormError') || !resetHtml.includes('/api/auth/reset-password')) {
  fail('reset-password page incomplete');
} else ok('reset-password.html posts token + password');
if (!profileHtml.includes('profBadges') || !profileHtml.includes('myTiolaList') || !profileHtml.includes('visitedCountries')) {
  fail('profile.html missing Tiolas / badges / countries');
} else ok('profile.html has Tiolas, badges, visited countries, favorites');
if (!profileHtml.includes('/auth/profile')) fail('profile.html does not load GET /auth/profile');
else ok('profile.html uses GET /auth/profile');
if (/AES-?256/i.test(`${loginHtml}\n${registerHtml}\n${profileHtml}`)) fail('AES-256 still in auth HTML');
else ok('login/register/profile have no AES-256 copy');

const routes = fs.readFileSync(path.join(ROOT, 'server/modules/auth/auth.routes.js'), 'utf8');
if (!routes.includes("router.get('/me'") || routes.includes("router.get('/me', authRequired")) {
  fail('GET /auth/me should be optional (no authRequired)');
} else ok('GET /auth/me is optional');
if (!routes.includes("router.get('/profile'")) fail('GET /auth/profile missing');
else ok('GET /auth/profile');

const mw = fs.readFileSync(path.join(ROOT, 'server/middleware/auth.js'), 'utf8');
if (!mw.includes('TokenExpiredError') || !mw.includes('sessionExpired')) {
  fail('auth middleware missing expired-token handling');
} else ok('expired JWT returns sessionExpired');

const authCtrl = fs.readFileSync(path.join(ROOT, 'server/modules/auth/auth.controller.js'), 'utf8');
if (!/await\s+authService\.login\s*\(/.test(authCtrl) || !/await\s+loadUserFromToken\s*\(/.test(authCtrl)) {
  fail('auth.controller must await login and loadUserFromToken (Postgres async)');
} else ok('auth.controller awaits login + /me user lookup');

const adminHtml = fs.readFileSync(path.join(ROOT, 'public/admin.html'), 'utf8');
if (!adminHtml.includes('data?.user') || !/!PANEL_ROLES\.includes\(user\.role\)/.test(adminHtml) || !/showLoginScreen\(\)/.test(adminHtml)) {
  fail('admin.html must guard missing user.role and return to login');
} else ok('admin.html guards user.role and redirects to login');

const placesLegacy = fs.readFileSync(path.join(ROOT, 'server/routes/places-legacy.js'), 'utf8');
if (!placesLegacy.includes("INSERT OR IGNORE INTO saved_places") || !placesLegacy.includes("DELETE FROM saved_places")) {
  fail('favorite save/delete SQL missing');
} else ok('favorites persist in saved_places');

function mergeCookies(jar, setCookie) {
  const list = !setCookie ? [] : (Array.isArray(setCookie) ? setCookie : [setCookie]);
  for (const line of list) {
    const part = String(line).split(';')[0];
    const eq = part.indexOf('=');
    if (eq < 1) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1);
    if (!value) delete jar[name];
    else jar[name] = value;
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
      timeout: 20000,
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

function unwrap(json) {
  if (json && json.success === true && json.data != null) return json.data;
  return json;
}

function errMsg(json) {
  if (typeof json?.error === 'string') return json.error;
  return '';
}

function waitForServer(url, tries) {
  const max = tries || 240;
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
        else setTimeout(tick, 400);
      });
      req.on('timeout', () => {
        req.destroy();
        if (n >= max) reject(new Error('server did not start'));
        else setTimeout(tick, 400);
      });
    };
    tick();
  });
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
      FORM_RATE_LIMIT_MAX: '80',
      AUTH_RATE_LIMIT_MAX: '80',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function checkLive(base) {
  await initDb();
  const root = base.replace(/\/$/, '');
  const origin = root;
  const jar = {};

  const pages = ['/login', '/register', '/profile', '/reset-password', '/verify-email'];
  for (const p of pages) {
    const res = await request(`${root}${p}`);
    if (res.status !== 200) fail(`GET ${p} HTTP ${res.status}`);
    else ok(`GET ${p} → 200`);
  }

  const anonMe = await request(`${root}/api/auth/me`);
  const anonUser = unwrap(anonMe.json);
  if (anonMe.status !== 200 || anonUser.user != null) {
    fail(`GET /auth/me anonymous expected 200 user:null got ${anonMe.status} ${anonMe.body.slice(0, 160)}`);
  } else ok('GET /auth/me without cookie → 200 user:null');

  const shortPw = await request(`${root}/api/auth/register`, {
    method: 'POST',
    jar,
    headers: { Origin: origin },
    body: {
      name: 'Yasin',
      email: `short-${Date.now()}@touristlio.local`,
      password: 'Short1',
      kvkkAccepted: true,
      website: '',
    },
  });
  if (shortPw.status !== 400 || !/12/.test(errMsg(shortPw.json))) {
    fail(`short password expected 400 / 12 chars, got ${shortPw.status} ${shortPw.body.slice(0, 180)}`);
  } else ok('register short password → 400 with min-12 message');

  const noKvkk = await request(`${root}/api/auth/register`, {
    method: 'POST',
    headers: { Origin: origin },
    body: {
      name: 'Yasin',
      email: `kvkk-${Date.now()}@touristlio.local`,
      password: 'ValidPass12345',
      kvkkAccepted: false,
      website: '',
    },
  });
  if (noKvkk.status !== 400 || !/KVKK/i.test(errMsg(noKvkk.json))) {
    fail(`KVKK required expected 400, got ${noKvkk.status} ${noKvkk.body.slice(0, 180)}`);
  } else ok('register without KVKK → 400');

  const badEmail = await request(`${root}/api/auth/register`, {
    method: 'POST',
    headers: { Origin: origin },
    body: {
      name: 'Yasin',
      email: 'not-an-email',
      password: 'ValidPass12345',
      kvkkAccepted: true,
      website: '',
    },
  });
  if (badEmail.status !== 400) fail(`invalid email expected 400 got ${badEmail.status}`);
  else ok('register invalid email → 400');

  const email = `user7-${Date.now()}@touristlio.local`;
  const password = 'UserSystem1234';
  const register = await request(`${root}/api/auth/register`, {
    method: 'POST',
    jar,
    headers: { Origin: origin },
    body: {
      name: 'Orta Yedi',
      email,
      password,
      kvkkAccepted: true,
      website: '',
    },
  });
  if (register.status !== 201) {
    fail(`register HTTP ${register.status}: ${register.body.slice(0, 200)}`);
    return;
  }
  ok('register → 201');
  const regUser = unwrap(register.json).user;
  if (!regUser || !regUser.id) fail('register missing user');
  else ok('register returns user');
  if (!jar.tl_token) fail('auth cookie missing after register');
  else ok('auth cookie set after register');
  const regCookies = register.headers['set-cookie'] || [];
  const tokenCookie = [].concat(regCookies).find((c) => /^tl_token=/i.test(String(c)));
  if (!tokenCookie || !/HttpOnly/i.test(String(tokenCookie))) {
    fail(`register Set-Cookie is not HttpOnly: ${String(tokenCookie || '').slice(0, 120)}`);
  } else ok('register JWT cookie is HttpOnly');
  if (unwrap(register.json).token) fail('register JSON still returns a JWT body token');
  else ok('register JSON does not return a JWT');

  const stored = await db.prepare('SELECT password_hash FROM users WHERE email = ?').get(email);
  if (!stored || !isArgon2idHash(stored.password_hash)) {
    fail(`new user hash is not Argon2id: ${String(stored?.password_hash || '').slice(0, 24)}`);
  } else ok('new user password stored as Argon2id');

  const av = await request(`${root}/api/auth/avatar`, {
    method: 'PATCH',
    jar,
    headers: { Origin: origin },
    body: { avatarPreset: 'fox', avatarColor: '#7c3aed' },
  });
  const avPayload = unwrap(av.json);
  if (av.status !== 200) {
    fail(`PATCH /auth/avatar HTTP ${av.status}: ${av.body.slice(0, 180)}`);
  } else if (avPayload.user?.avatarPreset !== 'fox' || avPayload.user?.avatarColor !== '#7c3aed') {
    fail(`avatar not saved: ${JSON.stringify(avPayload.user)}`);
  } else ok('PATCH /auth/avatar saves fox + color');
  const meAv = await request(`${root}/api/auth/me`, { jar });
  const meAvUser = unwrap(meAv.json).user;
  if (meAvUser?.avatarPreset !== 'fox' || meAvUser?.avatarColor !== '#7c3aed') {
    fail(`GET /me after avatar: ${JSON.stringify(meAvUser)}`);
  } else ok('GET /me returns saved avatar');

  const dup = await request(`${root}/api/auth/register`, {
    method: 'POST',
    headers: { Origin: origin },
    body: {
      name: 'Orta Yedi',
      email,
      password,
      kvkkAccepted: true,
      website: '',
    },
  });
  if (dup.status !== 409) fail(`duplicate email expected 409 got ${dup.status}`);
  else ok('duplicate email → 409');

  const wrong = await request(`${root}/api/auth/login`, {
    method: 'POST',
    headers: { Origin: origin },
    body: { email, password: 'WrongPass12345', website: '' },
  });
  if (wrong.status !== 401 || !/E-posta veya şifre/i.test(errMsg(wrong.json))) {
    fail(`wrong password expected 401, got ${wrong.status} ${wrong.body.slice(0, 180)}`);
  } else ok('login wrong password → 401 with clear message');

  const loginOk = await request(`${root}/api/auth/login`, {
    method: 'POST',
    jar,
    headers: { Origin: origin },
    body: { email, password, website: '' },
  });
  const loginUser = unwrap(loginOk.json).user;
  if (loginOk.status !== 200 || !loginUser || !loginUser.role) {
    fail(`login expected user.role, got ${loginOk.status} ${loginOk.body.slice(0, 180)}`);
  } else ok('login returns user.role (admin page safe)');

  const bcryptEmail = `bcrypt7-${Date.now()}@touristlio.local`;
  const bcryptPass = 'UserSystem1234';
  const bcryptHash = bcrypt.hashSync(bcryptPass, 12);
  await db.prepare(
    'INSERT INTO users (name, email, password_hash, role, avatar_color) VALUES (?, ?, ?, ?, ?)',
  ).run('Bcrypt Legacy', bcryptEmail, bcryptHash, 'member', '#0ea5e9');
  const bcryptJar = {};
  const bcryptLogin = await request(`${root}/api/auth/login`, {
    method: 'POST',
    jar: bcryptJar,
    headers: { Origin: origin },
    body: { email: bcryptEmail, password: bcryptPass, website: '' },
  });
  if (bcryptLogin.status !== 200 || !unwrap(bcryptLogin.json).user) {
    fail(`bcrypt login expected 200, got ${bcryptLogin.status} ${bcryptLogin.body.slice(0, 180)}`);
  } else ok('legacy bcrypt password still logs in');
  const upgraded = await db.prepare('SELECT password_hash FROM users WHERE email = ?').get(bcryptEmail);
  if (!upgraded || !isArgon2idHash(upgraded.password_hash)) {
    fail(`bcrypt hash was not upgraded to Argon2id: ${String(upgraded?.password_hash || '').slice(0, 24)}`);
  } else ok('successful bcrypt login rehashes to Argon2id');

  const me = await request(`${root}/api/auth/me`, { jar });
  const meUser = unwrap(me.json).user;
  if (me.status !== 200 || !meUser || meUser.email !== email) {
    fail(`GET /auth/me logged-in failed ${me.status}`);
  } else ok('GET /auth/me with cookie → user');

  const secret = process.env.JWT_SECRET || 'dev-secret-change-me';
  const expired = jwt.sign(
    { id: meUser.id, email: meUser.email, role: meUser.role, name: meUser.name },
    secret,
    { expiresIn: -1 },
  );
  const expiredJar = { tl_token: expired };
  const expiredMe = await request(`${root}/api/auth/me`, { jar: expiredJar });
  if (expiredMe.status !== 401 || expiredMe.json.sessionExpired !== true || expiredMe.json.error !== SESSION_EXPIRED_MSG) {
    fail(`expired JWT /me expected 401 sessionExpired, got ${expiredMe.status} ${expiredMe.body.slice(0, 200)}`);
  } else ok('expired JWT → 401 sessionExpired');
  const expiredSet = String(expiredMe.headers['set-cookie'] || '');
  if (!/tl_token=;/i.test(expiredSet) && !/Max-Age=0/i.test(expiredSet) && expiredJar.tl_token) {
    /* clearCookie may send empty value */
    if (expiredJar.tl_token && expiredJar.tl_token === expired) {
      fail('expired JWT did not clear tl_token cookie');
    } else ok('expired JWT clears auth cookie');
  } else ok('expired JWT clears auth cookie');

  const placesRes = await request(`${root}/api/places?page=1&limit=20`);
  const places = unwrap(placesRes.json).places || [];
  if (placesRes.status !== 200 || !places.length) {
    fail('need at least one place for favorite tests');
    return;
  }
  const placeId = places[0].id;
  const save = await request(`${root}/api/places/${placeId}/save`, {
    method: 'POST',
    jar,
    headers: { Origin: origin },
  });
  if (save.status !== 200 || unwrap(save.json).saved !== true) {
    fail(`POST save expected 200 saved:true, got ${save.status} ${save.body.slice(0, 180)}`);
  } else ok('POST /places/:id/save → saved');

  const row = await db.prepare('SELECT 1 AS ok FROM saved_places WHERE user_id = ? AND place_id = ?').get(meUser.id, placeId);
  if (!row) fail('favorite not persisted in saved_places');
  else ok('favorite row in saved_places');

  const savedList = await request(`${root}/api/places/saved/all`, { jar });
  const savedPlaces = unwrap(savedList.json).places || [];
  if (!savedPlaces.some((p) => p.id === placeId)) fail('GET /places/saved/all missing saved place');
  else ok('GET /places/saved/all returns favorite');

  const unsave = await request(`${root}/api/places/${placeId}/save`, {
    method: 'DELETE',
    jar,
    headers: { Origin: origin },
  });
  if (unsave.status !== 200 || unwrap(unsave.json).saved !== false) {
    fail(`DELETE save expected saved:false, got ${unsave.status}`);
  } else ok('DELETE /places/:id/save removes favorite');
  const gone = await db.prepare('SELECT 1 AS ok FROM saved_places WHERE user_id = ? AND place_id = ?').get(meUser.id, placeId);
  if (gone) fail('favorite still in DB after delete');
  else ok('favorite removed from DB');

  await request(`${root}/api/places/${placeId}/save`, {
    method: 'POST',
    jar,
    headers: { Origin: origin },
  });

  const userRow = await db.prepare('SELECT verification_token FROM users WHERE id = ?').get(meUser.id);
  if (!userRow?.verification_token) fail('verification token missing after register');
  else {
    const verify = await request(`${root}/api/auth/verify-email`, {
      method: 'POST',
      headers: { Origin: origin },
      body: { token: userRow.verification_token },
    });
    if (verify.status !== 200) fail(`verify-email HTTP ${verify.status}`);
    else ok('POST /auth/verify-email → 200');
    const verified = await db.prepare('SELECT email_verified FROM users WHERE id = ?').get(meUser.id);
    if (!verified?.email_verified) fail('email_verified not set');
    else ok('email marked verified');
  }

  const forgot = await request(`${root}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { Origin: origin },
    body: { email, website: '' },
  });
  if (forgot.status !== 200) fail(`forgot-password HTTP ${forgot.status}`);
  else ok('forgot-password → 200 (generic message)');
  const resetRow = await db.prepare(`
    SELECT token FROM password_reset_tokens
    WHERE user_id = ? AND used = 0
    ORDER BY id DESC LIMIT 1
  `).get(meUser.id);
  if (!resetRow?.token) fail('reset token not stored');
  else {
    const newPass = 'ResetPass12345';
    const reset = await request(`${root}/api/auth/reset-password`, {
      method: 'POST',
      headers: { Origin: origin },
      body: { token: resetRow.token, password: newPass },
    });
    if (reset.status !== 200) fail(`reset-password HTTP ${reset.status} ${reset.body.slice(0, 180)}`);
    else ok('reset-password → 200');

    const oldLogin = await request(`${root}/api/auth/login`, {
      method: 'POST',
      headers: { Origin: origin },
      body: { email, password, website: '' },
    });
    if (oldLogin.status !== 401) fail(`old password after reset expected 401 got ${oldLogin.status}`);
    else ok('old password rejected after reset');

    const loginJar = {};
    const newLogin = await request(`${root}/api/auth/login`, {
      method: 'POST',
      jar: loginJar,
      headers: { Origin: origin },
      body: { email, password: newPass, website: '' },
    });
    if (newLogin.status !== 200 || !unwrap(newLogin.json).user) {
      fail(`login with new password failed ${newLogin.status}`);
    } else ok('login with reset password → 200');

    const stale = await request(`${root}/api/auth/me`, { jar });
    if (stale.status !== 401 || stale.json.sessionExpired !== true) {
      fail(`old session after reset expected 401 sessionExpired, got ${stale.status}`);
    } else ok('old JWT invalid after password reset');
  }

  const dashJar = {};
  const dashLogin = await request(`${root}/api/auth/login`, {
    method: 'POST',
    jar: dashJar,
    headers: { Origin: origin },
    body: { email, password: 'ResetPass12345', website: '' },
  });
  if (dashLogin.status !== 200) {
    fail('dashboard login failed');
  } else {
    const dash = await request(`${root}/api/auth/profile?lang=tr`, { jar: dashJar });
    const payload = unwrap(dash.json);
    if (dash.status !== 200) fail(`GET /auth/profile HTTP ${dash.status}`);
    else ok('GET /auth/profile → 200');
    if (!payload.user || !Array.isArray(payload.tiolas) || !Array.isArray(payload.favorites)) {
      fail('profile missing user / tiolas / favorites');
    } else ok('profile includes user, tiolas, favorites');
    if (!payload.visitedStats || !Array.isArray(payload.visitedStats.countries) || !Array.isArray(payload.badges)) {
      fail('profile missing visitedStats.countries or badges');
    } else ok('profile includes visited countries + badges');
    if (!payload.favorites.some((p) => p.id === placeId)) fail('profile favorites missing saved place');
    else ok('profile favorites include saved place');
  }
}

async function main() {
  const preset = process.env.VERIFY_USER_URL;
  if (preset) {
    await checkLive(preset);
  } else {
    const port = 3058;
    const child = spawnServer(port);
    let stderr = '';
    let stdout = '';
    child.stderr.on('data', (c) => { stderr += c; });
    child.stdout.on('data', (c) => { stdout += c; });
    const base = `http://127.0.0.1:${port}`;
    try {
      await waitForServer(`${base}/api/health`, 240);
      await checkLive(base);
    } catch (e) {
      const extra = `${stderr}${stdout}`.trim().slice(0, 280);
      fail(`live server :${port}: ${e.message}${extra ? ` (${extra})` : ''}`);
    } finally {
      child.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 200));
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
    }
  }

  if (failed) {
    console.error(`verify-user-system FAILED (${failed})`);
    process.exit(1);
  }
  console.log('verify-user-system OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
