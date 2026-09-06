/**
 * [YÜKSEK-7] Form security: XSS sanitization, email regex, honeypot, rate limit, optional reCAPTCHA.
 * Usage: node server/scripts/verify-form-security.js
 * Optional: VERIFY_FORMS_URL=http://127.0.0.1:3047 node server/scripts/verify-form-security.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const {
  sanitizeText,
  sanitizeName,
  isValidEmail,
  EMAIL_RE,
  escapeHtml,
} = require('../lib/sanitize');
const { isHoneypotFilled } = require('../middleware/honeypot');
const { recaptchaConfig, publicRecaptchaConfig, tokenFromRequest } = require('../middleware/recaptcha');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}

console.log('verify-form-security');

const xss = '<script>alert(1)</script>Merhaba';
const cleaned = sanitizeText(xss, 2000);
if (cleaned.includes('<script') || cleaned.includes('alert(1)')) fail('sanitizeText left script markup');
else ok('sanitizeText strips script tags');
if (!cleaned.includes('Merhaba')) fail('sanitizeText dropped surrounding text');
else ok('sanitizeText keeps plain text');

const img = sanitizeText('<img src=x onerror=alert(1)>Tiola yorumu', 2000);
if (/onerror|<|>/i.test(img) && img.includes('onerror')) fail('sanitizeText left event handler');
else ok('sanitizeText strips img onerror');
if (!img.includes('Tiola yorumu')) fail('sanitizeText dropped Tiola text');
else ok('sanitizeText keeps Tiola user text');

const named = sanitizeName('<b>Yasin</b>');
if (named !== 'Yasin') fail(`sanitizeName expected Yasin, got ${JSON.stringify(named)}`);
else ok('sanitizeName strips tags');

if (!EMAIL_RE.test('yasin@touristlio.com')) fail('EMAIL_RE rejected valid address');
else ok('EMAIL_RE accepts valid email');
if (EMAIL_RE.test('not-an-email') || EMAIL_RE.test('a@b') || isValidEmail('<script>@x.com')) {
  fail('email validator too loose');
} else ok('email validator rejects invalid / XSS');
if (!isValidEmail('user@example.com')) fail('isValidEmail rejected user@example.com');
else ok('isValidEmail matches audit regex');

if (!isHoneypotFilled({ website: 'http://spam.example' })) fail('honeypot missed website field');
else ok('honeypot detects website');
if (isHoneypotFilled({ website: '' }) || isHoneypotFilled({ name: 'Yasin' })) fail('honeypot false positive');
else ok('empty honeypot is ignored');

if (escapeHtml('<x>').includes('<')) fail('escapeHtml left bracket');
else ok('escapeHtml encodes brackets');

const prevSite = process.env.RECAPTCHA_SITE_KEY;
const prevSecret = process.env.RECAPTCHA_SECRET;
delete process.env.RECAPTCHA_SITE_KEY;
delete process.env.RECAPTCHA_SECRET;
if (recaptchaConfig().enabled) fail('reCAPTCHA enabled without keys');
else ok('reCAPTCHA skipped when keys missing');
if (publicRecaptchaConfig().recaptchaSiteKey) fail('public config leaked site key without enable');
else ok('public config hides site key when disabled');
process.env.RECAPTCHA_SITE_KEY = 'site-for-test-not-secret';
process.env.RECAPTCHA_SECRET = 'secret-for-test-not-a-real-key';
if (!recaptchaConfig().enabled) fail('reCAPTCHA should enable when both env vars set');
else ok('reCAPTCHA enables when both env vars set');
if (tokenFromRequest({ body: { recaptchaToken: 'abc' }, headers: {} }) !== 'abc') {
  fail('tokenFromRequest missed recaptchaToken');
} else ok('tokenFromRequest reads body token');
if (prevSite == null) delete process.env.RECAPTCHA_SITE_KEY;
else process.env.RECAPTCHA_SITE_KEY = prevSite;
if (prevSecret == null) delete process.env.RECAPTCHA_SECRET;
else process.env.RECAPTCHA_SECRET = prevSecret;

const contactHtml = fs.readFileSync(path.join(ROOT, 'public', 'legal', 'contact.html'), 'utf8');
if (!contactHtml.includes('name="website"') || !contactHtml.includes('tl-hp') || !contactHtml.includes('aria-hidden="true"')) {
  fail('contact form missing honeypot');
} else ok('contact honeypot markup');
if (!contactHtml.includes('/js/form-security.js')) fail('contact.html missing form-security.js');
else ok('contact loads form-security.js');
if (!contactHtml.includes('[^\\s@]+@') || !contactHtml.includes('EMAIL_RE')) {
  fail('contact.html missing email regex');
} else ok('contact client email regex');

const adminHtml = fs.readFileSync(path.join(ROOT, 'public', 'admin.html'), 'utf8');
if (!adminHtml.includes('id="adm-contact"') || !adminHtml.includes('loadContactInbox')) {
  fail('admin contact inbox UI missing');
} else ok('admin contact inbox UI');
const adminRoutes = fs.readFileSync(path.join(ROOT, 'server', 'routes', 'admin.js'), 'utf8');
if (!adminRoutes.includes('/contact-messages') || !adminRoutes.includes('FROM contact_messages')) {
  fail('GET /api/admin/contact-messages missing');
} else ok('admin contact-messages API');

const fsJs = fs.readFileSync(path.join(ROOT, 'public', 'js', 'form-security.js'), 'utf8');
if (!fsJs.includes('grecaptcha') || !fsJs.includes('recaptchaSiteKey')) fail('form-security.js missing reCAPTCHA client');
else ok('form-security.js reCAPTCHA helper');

const indexHtml = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
if (!indexHtml.includes('/js/form-security.js')) fail('index.html missing form-security.js');
else ok('index.html loads form-security.js');
if (!indexHtml.includes('id="rfTxt"') || !indexHtml.includes('name="website"') || !indexHtml.includes('class="tl-hp"')) {
  fail('place Tiola form missing honeypot');
} else ok('place Tiola form honeypot markup');
if (!indexHtml.includes('aria-hidden="true"') || !fsJs.includes('aria-hidden="true"')) {
  fail('honeypot missing aria-hidden');
} else ok('honeypot aria-hidden on markup + helper');

const authRoutes = fs.readFileSync(path.join(ROOT, 'server', 'modules', 'auth', 'auth.routes.js'), 'utf8');
const loginBlock = authRoutes.match(/router\.post\(\s*'\/login'[\s\S]*?controller\.login\s*\)/);
if (!loginBlock) fail('POST /api/auth/login route missing');
else if (loginBlock[0].includes('recaptchaGuard')) {
  fail('POST /api/auth/login must not require reCAPTCHA (admin /admin has no widget)');
} else ok('POST /api/auth/login has no recaptchaGuard');
if (!authRoutes.includes("recaptchaGuard('register')") || !authRoutes.includes("recaptchaGuard('forgot')")) {
  fail('register/forgot must keep recaptchaGuard');
} else ok('register + forgot keep recaptchaGuard');

const tiolaRoutes = fs.readFileSync(path.join(ROOT, 'server', 'routes', 'tiolas.js'), 'utf8');
if (!tiolaRoutes.includes("recaptchaGuard('tiola')")) fail('POST /api/tiolas missing recaptchaGuard');
else ok('POST /api/tiolas recaptchaGuard(tiola)');
if (!tiolaRoutes.includes('honeypotGuard(TIOLA_OK)') || !tiolaRoutes.includes('tiolaFormLimiter')) {
  fail('POST /api/tiolas missing honeypot fake-200 or form limiter');
} else ok('POST /api/tiolas honeypot fake 200 + 3/5 min limiter');
if (!tiolaRoutes.includes('tiolaVoteLimiter')) fail('like route missing tiolaVoteLimiter');
else ok('Tiola like keeps 5/min vote limiter');

const rlJs = fs.readFileSync(path.join(ROOT, 'server', 'middleware', 'rateLimit.js'), 'utf8');
if (!rlJs.includes('tiolaFormLimiter') || !rlJs.includes('5 * 60 * 1000')) {
  fail('tiolaFormLimiter missing 5 min window');
} else ok('tiolaFormLimiter 3 / 5 min');

const appJs = fs.readFileSync(path.join(ROOT, 'public', 'js', 'app.js'), 'utf8');
if (!appJs.includes("attach(fd, 'tiola')")) fail('app.js postTiola missing recaptcha attach');
else ok('app.js attaches recaptcha token to Tiola POST');

if (!fsJs.includes('querySelectorAll') || !fsJs.includes('input[name="website"]')) {
  fail('form-security honeypotValue should scan all website fields');
} else ok('honeypotValue reads any filled website field');

function postJson(url, body, extraHeaders) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = JSON.stringify(body);
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

function fetchJson(url) {
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

async function checkLive(base) {
  const root = base.replace(/\/$/, '');
  const cfg = await fetchJson(`${root}/api/config/public`);
  if (cfg.status !== 200) fail(`GET /api/config/public HTTP ${cfg.status}`);
  else ok('GET /api/config/public HTTP 200');
  if (cfg.json.recaptchaEnabled) fail('recaptchaEnabled should be false without keys');
  else ok('recaptchaEnabled false without keys');
  if (cfg.json.recaptchaSiteKey) fail('site key exposed without enable');
  else ok('site key omitted when disabled');

  const contactPage = await fetchJson(`${root}/legal/contact.html`);
  if (contactPage.status !== 200) fail(`GET contact.html HTTP ${contactPage.status}`);
  else ok('GET /legal/contact.html 200');
  if (!contactPage.body.includes('name="website"')) fail('served contact missing honeypot');
  else ok('served contact includes honeypot');
  if (!contactPage.body.includes('form-security.js')) fail('served contact missing form-security.js');
  else ok('served contact includes form-security.js');

  const badEmail = await postJson(`${root}/api/contact`, {
    name: 'Yasin Test',
    email: 'not-an-email',
    subject: 'Form güvenlik testi',
    message: 'Bu mesaj e-posta doğrulaması için yeterince uzun.',
  });
  if (badEmail.status !== 400) fail(`invalid email HTTP ${badEmail.status}, expected 400`);
  else ok('invalid email rejected 400');

  const xssBody = await postJson(`${root}/api/contact`, {
    name: '<script>alert(1)</script>Yasin',
    email: 'form-security-verify@touristlio.local',
    subject: '<img src=x onerror=alert(1)>Konu',
    message: '<script>document.cookie</script>Gezi hakkında bir mesaj yazıyorum.',
  });
  if (xssBody.status !== 200) fail(`sanitized XSS contact HTTP ${xssBody.status}: ${xssBody.body.slice(0, 180)}`);
  else ok('XSS payload accepted after sanitization (200)');

  const honey = await postJson(`${root}/api/contact`, {
    name: 'Bot User',
    email: 'bot@example.com',
    subject: 'Spam subject here',
    message: 'This is a honeypot filled spam message.',
    website: 'https://spam.example',
  });
  if (honey.status !== 200) fail(`honeypot HTTP ${honey.status}`);
  else ok('honeypot returns fake success');
  if (!honey.json.ok && !honey.json.message) fail('honeypot missing success payload');
  else ok('honeypot success payload');

  const fourth = await postJson(`${root}/api/contact`, {
    name: 'Yasin',
    email: 'yasin-rate@touristlio.local',
    subject: 'Rate limit check',
    message: 'Dördüncü gönderim rate limit için.',
  });
  if (fourth.status !== 429) fail(`4th form POST HTTP ${fourth.status}, expected 429`);
  else ok('4th submission rate-limited 429 (3 / 5 min)');
}

async function checkRecaptchaRequired(base) {
  const root = base.replace(/\/$/, '');
  const missing = await postJson(`${root}/api/contact`, {
    name: 'Yasin',
    email: 'yasin@touristlio.local',
    subject: 'reCAPTCHA required',
    message: 'Anahtar varken token zorunlu olmalı.',
  });
  if (missing.status !== 400) fail(`keys-on missing token HTTP ${missing.status}, expected 400`);
  else ok('reCAPTCHA required when keys set (missing token → 400)');
  if (!String(missing.json.error || '').toLowerCase().includes('güvenlik')) {
    fail(`expected güvenlik error, got ${JSON.stringify(missing.json)}`);
  } else ok('reCAPTCHA error copy');

  const loginNoToken = await postJson(`${root}/api/auth/login`, {
    email: 'admin-login-verify@touristlio.local',
    password: 'WrongPassNotUsed123',
  });
  const loginErr = String(loginNoToken.json.error || '');
  if (loginNoToken.status === 400 && /güvenlik/i.test(loginErr)) {
    fail('login must not return recaptcha güvenlik error when token is missing');
  } else if (loginNoToken.status !== 401) {
    fail(`login without recaptcha expected 401, got ${loginNoToken.status} ${loginNoToken.body.slice(0, 180)}`);
  } else if (!/E-posta veya şifre/i.test(loginErr)) {
    fail(`wrong password should say E-posta veya şifre, got ${JSON.stringify(loginNoToken.json)}`);
  } else ok('login without recaptcha token is normal 401 (not güvenlik)');
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
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}

function sessionRequest(url, { method = 'GET', body, headers, jar } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body == null ? null : JSON.stringify(body);
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
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (jar) mergeCookies(jar, res.headers['set-cookie']);
        let json = {};
        try { json = JSON.parse(data); } catch { /* ignore */ }
        resolve({ status: res.statusCode, json, body: data });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (payload != null) req.write(payload);
    req.end();
  });
}

async function checkTiolaForms(base) {
  const root = base.replace(/\/$/, '');
  const origin = root;
  const jar = {};
  const csrfGet = await sessionRequest(`${root}/api/csrf`, { jar });
  if (csrfGet.status !== 200 || !csrfGet.json.csrfToken) {
    fail(`tiola csrf HTTP ${csrfGet.status}`);
    return;
  }
  ok('tiola test: GET /api/csrf');

  const email = `forms-tiola-${Date.now()}@touristlio.local`;
  const register = await sessionRequest(`${root}/api/auth/register`, {
    method: 'POST',
    jar,
    headers: { Origin: origin },
    body: {
      name: 'Form Tiola',
      email,
      password: 'TestVote12345',
      kvkkAccepted: true,
      website: '',
    },
  });
  if (register.status !== 201) {
    fail(`tiola test register HTTP ${register.status}: ${register.body.slice(0, 180)}`);
    return;
  }
  ok('tiola test: registered user');

  const csrf = jar.tl_csrf;
  const honey = await sessionRequest(`${root}/api/tiolas`, {
    method: 'POST',
    jar,
    headers: { Origin: origin, 'X-CSRF-Token': csrf },
    body: {
      text: 'Honeypot bot Tiola mesajı yeterince uzun olmalı.',
      website: 'https://spam.example',
    },
  });
  if (honey.status !== 200) fail(`tiola honeypot HTTP ${honey.status}: ${honey.body.slice(0, 180)}`);
  else ok('tiola honeypot fake 200');
  if (!honey.json.ok || honey.json.tiola) fail('tiola honeypot created a row');
  else ok('tiola honeypot did not return a tiola');

  async function postTiola(n) {
    return sessionRequest(`${root}/api/tiolas`, {
      method: 'POST',
      jar,
      headers: { Origin: origin, 'X-CSRF-Token': csrf },
      body: {
        text: `YÜKSEK-2 form limiter Tiola ${n} yeterince uzun.`,
        website: '',
      },
    });
  }

  const a = await postTiola(1);
  if (a.status !== 201) fail(`tiola 1 HTTP ${a.status}: ${a.body.slice(0, 180)}`);
  else ok('tiola 1 accepted (201)');
  const b = await postTiola(2);
  if (b.status !== 201) fail(`tiola 2 HTTP ${b.status}: ${b.body.slice(0, 180)}`);
  else ok('tiola 2 accepted (201)');
  const limited = await postTiola(3);
  if (limited.status !== 429) fail(`tiola 3 HTTP ${limited.status}, expected 429 (honeypot used a slot)`);
  else ok('3rd real Tiola after honeypot is 429 (3 / 5 min)');
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

async function main() {
  const given = process.env.VERIFY_FORMS_URL;
  if (given) {
    await checkLive(given);
    await checkTiolaForms(given);
  } else {
    await withServer(process.env.VERIFY_FORMS_PORT || '3047', {}, checkLive);
    await withServer(process.env.VERIFY_FORMS_RECAPTCHA_PORT || '3048', {
      RECAPTCHA_SITE_KEY: 'test-site-key-not-secret',
      RECAPTCHA_SECRET: 'test-secret-not-a-real-key',
    }, checkRecaptchaRequired);
    await withServer(process.env.VERIFY_FORMS_TIOLA_PORT || '3049', {}, checkTiolaForms);
  }
  if (failed) {
    console.error(`verify-form-security: ${failed} failed`);
    process.exit(1);
  }
  console.log('verify-form-security: ok');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
