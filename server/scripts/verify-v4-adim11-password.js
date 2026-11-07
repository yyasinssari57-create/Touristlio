/**
 * V4 Adım 11 — one password rule everywhere a password is created or changed.
 * At least 9 characters, one uppercase letter, one digit.
 * Login does not apply the rule. Argon2id settings stay as they are.
 *
 * Usage: npm run verify:v4-adim11
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const vm = require('vm');
const { spawn } = require('child_process');
const {
  MIN_PASSWORD_LENGTH,
  HTML_PATTERN,
  copyFor,
  passwordPolicyError,
  clientScript,
  decoratePasswordPolicyHtml,
} = require('../lib/password-policy');
const { ARGON2_OPTS } = require('../auth');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

console.log('verify-v4-adim11-password');

const TR = copyFor('tr').message;
const EN = copyFor('en').message;
const SHORT = 'Abcdef12';
const NO_UPPER = 'abcdefg12';
const NO_DIGIT = 'Abcdefghi';
const VALID = 'Abcdefg12';
const LEGACY = 'legacy7';

if (MIN_PASSWORD_LENGTH !== 9) fail(`minimum is ${MIN_PASSWORD_LENGTH}, expected 9`);
else ok('minimum length is 9');

if (TR !== 'Şifre en az 9 karakter, bir büyük harf ve bir rakam içermelidir.') {
  fail(`Turkish sentence drifted: ${TR}`);
} else ok('Turkish sentence is the shared rule');
if (EN !== 'Password must be at least 9 characters with one uppercase letter and one number.') {
  fail(`English sentence drifted: ${EN}`);
} else ok('English sentence is the shared rule');

const samples = [SHORT, NO_UPPER, NO_DIGIT, VALID, LEGACY, '', 'Zz1234567', 'A1aaaaaaa'];
for (const lang of ['tr', 'en']) {
  const sentence = lang === 'en' ? EN : TR;
  for (const pw of samples) {
    const err = passwordPolicyError(pw, lang);
    const valid = pw === VALID || pw === 'Zz1234567' || pw === 'A1aaaaaaa';
    if (valid && err) fail(`${lang} rejected a valid password (${pw.length} chars)`);
    if (!valid && err !== sentence) fail(`${lang} bad password did not return the one sentence`);
  }
}
if (!failed) ok('8 chars, no uppercase, and no digit are rejected; a valid 9-char password is accepted');

const htmlRule = new RegExp(`^(?:${HTML_PATTERN})$`);
const patternDrift = samples.filter((pw) => htmlRule.test(pw) !== (passwordPolicyError(pw, 'tr') == null));
if (patternDrift.length) fail('HTML pattern and server rule disagree');
else ok('HTML pattern matches the server rule');

const context = { window: null, console };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(clientScript(), context);
const client = context.TL_PASSWORD;
if (!client) fail('client script did not set TL_PASSWORD');
else {
  let drift = 0;
  for (const lang of ['tr', 'en']) {
    for (const pw of samples) {
      const serverMsg = passwordPolicyError(pw, lang) || '';
      if (client.error(pw, lang) !== serverMsg) drift += 1;
    }
    if (client.message(lang) !== (lang === 'en' ? EN : TR)) drift += 1;
    if (client.label(lang) !== copyFor(lang).label) drift += 1;
    if (client.newLabel(lang) !== copyFor(lang).newLabel) drift += 1;
  }
  if (client.minLength !== 9 || client.pattern !== HTML_PATTERN) drift += 1;
  if (drift) fail('browser copy drifted from server/lib/password-policy.js');
  else ok('browser TL_PASSWORD matches the server module');
}

vm.runInContext(read('public/js/i18n.js'), context);
const i18n = context.TL_I18N;
if (!i18n || i18n.t('tr', 'settingsNote') !== TR || i18n.t('en', 'settingsNote') !== EN) {
  fail('i18n settingsNote is not the shared sentence');
} else if (i18n.t('tr', 'authPassMin') !== copyFor('tr').label || i18n.t('en', 'settingsNewPassword') !== copyFor('en').newLabel) {
  fail('i18n password labels are not fed by TL_PASSWORD');
} else ok('i18n password text comes from TL_PASSWORD');

if (ARGON2_OPTS.memoryCost !== 65536 || ARGON2_OPTS.timeCost !== 3 || ARGON2_OPTS.parallelism !== 1) {
  fail(`Argon2id options changed: m=${ARGON2_OPTS.memoryCost} t=${ARGON2_OPTS.timeCost} p=${ARGON2_OPTS.parallelism}`);
} else ok('Argon2id options unchanged (m=65536, t=3, p=1)');

const authSrc = read('server/auth.js');
if (/MIN_PASSWORD_LENGTH\s*=\s*12/.test(authSrc) || /en az bir büyük harf içermeli/.test(authSrc)) {
  fail('server/auth.js still has its own password rule');
} else ok('server/auth.js uses the shared policy');
if (!authSrc.includes('memoryCost: ARGON2_MEMORY_KIB') || !authSrc.includes('const ARGON2_MEMORY_KIB = 65536;')) {
  fail('Argon2id memory setting missing from server/auth.js');
} else ok('Argon2id memory setting still lives in server/auth.js');

const routes = read('server/modules/auth/auth.routes.js');
const loginBlock = routes.split("router.post('/login'")[1].split('router.post(')[0];
if (loginBlock.includes('passwordRules') || loginBlock.includes('passwordPolicyError') || !loginBlock.includes('notEmpty()')) {
  fail('login applies the new-password rule');
} else ok('login only checks that a password was sent');
for (const routeName of ['/register', '/reset-password', '/change-password']) {
  const block = routes.split(`router.post('${routeName}'`)[1].split('router.post(')[0];
  if (!block.includes('passwordRules()')) fail(`${routeName} does not use the shared rule`);
}
if (!failed) ok('register, reset, and change-password use the shared rule');

const appJs = read('public/js/app.js');
const loginPass = (appJs.split('id="loginPass"')[1] || '').split('/>')[0];
if (loginPass.includes('data-pw-policy') || loginPass.includes('minlength')) {
  fail('login field carries the new-password rule');
} else ok('login field does not carry the new-password rule');
if (!appJs.includes('TL_PASSWORD?.error(password, lang)') || !appJs.includes('passwordFieldAttrs()')) {
  fail('register modal does not use TL_PASSWORD');
} else ok('register modal uses TL_PASSWORD');
const resetRaw = read('public/reset-password.html');
if (resetRaw.includes('pw.length < 12') || resetRaw.includes('/[A-Z]/')) {
  fail('reset page still has its own password check');
} else ok('reset page asks TL_PASSWORD instead of a private check');

const banned = [
  'min 12 karakter',
  'min 12 character',
  'en az 12 karakter',
  'at least 12 character',
  'Şifre en az bir büyük harf',
  'Şifre en az bir rakam',
];
const scanned = [
  'public/index.html',
  'public/profile.html',
  'public/register.html',
  'public/reset-password.html',
  'public/login.html',
  'public/admin.html',
  'public/js/app.js',
  'public/js/i18n.js',
  'server/auth.js',
  'server/modules/auth/auth.routes.js',
  'server/lib/password-policy.js',
];
for (const rel of scanned) {
  const src = read(rel);
  for (const phrase of banned) {
    if (src.includes(phrase)) fail(`${rel} still says “${phrase}”`);
  }
}
if (!failed) ok('old 12-character copy is gone from the password screens');

function inputTag(html, id) {
  const re = new RegExp(`<input\\b[^>]*\\bid="${id}"[^>]*>`, 'i');
  return (html.match(re) || [''])[0];
}

function expectNewPassword(html, id, label) {
  const tag = inputTag(html, id);
  if (!tag) {
    fail(`${label} #${id} missing`);
    return;
  }
  if (!tag.includes('minlength="9"') || !tag.includes(`pattern="${HTML_PATTERN}"`) || !tag.includes('data-pw-policy="new"')) {
    fail(`${label} #${id} is missing minlength/pattern from the policy`);
  }
  if (!tag.includes(`title="${TR}"`)) fail(`${label} #${id} title is not the shared sentence`);
}

function expectCurrentPassword(html, id, label) {
  const tag = inputTag(html, id);
  if (!tag) return;
  if (tag.includes('data-pw-policy') || tag.includes('minlength=')) {
    fail(`${label} #${id} is treated as a new password`);
  }
}

const pages = {
  'public/register.html': (html) => {
    expectNewPassword(html, 'regPass', 'register');
    if (!html.includes(`>${TR}<`) && !html.includes(`>${TR}</`)) {
      if (!html.includes(TR)) fail('register page is missing the shared sentence');
    }
  },
  'public/reset-password.html': (html) => {
    expectNewPassword(html, 'resetPass', 'reset');
    expectNewPassword(html, 'resetPassConfirm', 'reset confirm');
    if (!html.includes(TR)) fail('reset page is missing the shared sentence');
  },
  'public/index.html': (html) => {
    expectNewPassword(html, 'pwdNew', 'settings');
    expectCurrentPassword(html, 'pwdCurrent', 'settings');
    expectCurrentPassword(html, 'emailPass', 'email change');
    if (!html.includes(TR)) fail('settings note is missing the shared sentence');
  },
  'public/profile.html': (html) => {
    expectNewPassword(html, 'pwdNew', 'profile settings');
    expectCurrentPassword(html, 'pwdCurrent', 'profile settings');
  },
  'public/admin.html': (html) => {
    expectNewPassword(html, 'modPass', 'moderator');
    if (!html.includes(TR)) fail('moderator form is missing the shared sentence');
  },
  'public/login.html': (html) => {
    expectCurrentPassword(html, 'loginPass', 'login');
    if (html.includes('data-pw-policy')) fail('login page marks a field as a new password');
  },
};

for (const [rel, check] of Object.entries(pages)) {
  const raw = read(rel);
  if (rel !== 'public/login.html' && !raw.includes('__PW_MIN__')) {
    fail(`${rel} hardcodes the length instead of the policy placeholder`);
  }
  const served = decoratePasswordPolicyHtml(raw);
  if (served.includes('__PW_')) fail(`${rel} left a password placeholder`);
  if (!served.includes('data-tl-password-policy')) fail(`${rel} did not receive TL_PASSWORD`);
  if (!served.includes(TR) || !served.includes(EN)) fail(`${rel} script is missing a language`);
  check(served);
}
if (!failed) ok('served HTML minlength, pattern, and sentence come from the policy');

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
      timeout: 20000,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        if (jar) mergeCookies(jar, res.headers['set-cookie']);
        const text = Buffer.concat(chunks).toString('utf8');
        let json = {};
        try { json = JSON.parse(text); } catch { /* html */ }
        resolve({ status: res.statusCode, json, body: text, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (payload != null) req.write(payload);
    req.end();
  });
}

function errMsg(json) {
  return typeof json?.error === 'string' ? json.error : '';
}

function waitForServer(url) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      n += 1;
      const req = http.get(url, { timeout: 1000 }, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve();
        else retry();
      });
      req.on('error', retry);
      req.on('timeout', () => { req.destroy(); retry(); });
    };
    function retry() {
      if (n >= 240) reject(new Error('server did not start'));
      else setTimeout(tick, 250);
    }
    tick();
  });
}

async function expectReject(res, sentence, label) {
  if (res.status !== 400 || errMsg(res.json) !== sentence) {
    fail(`${label} expected 400 and the shared sentence, got ${res.status} ${errMsg(res.json).slice(0, 140)}`);
    return false;
  }
  ok(`${label} → 400, same sentence`);
  return true;
}

async function checkLive(base) {
  const origin = base;
  const home = await request(`${base}/`);
  if (home.status !== 200 || !home.body.includes('data-tl-password-policy') || !home.body.includes('minlength="9"')) {
    fail(`GET / did not include the password policy (${home.status})`);
  } else if (!/nonce="[^"]+"/.test(home.body.match(/<script\b[^>]*data-tl-password-policy[\s\S]*?>/)?.[0] || '')) {
    fail('password policy script has no CSP nonce');
  } else ok('GET / inlines the policy script with a nonce');

  const loginPage = await request(`${base}/login`);
  if (loginPage.body.includes('data-pw-policy')) fail('GET /login applies the new-password rule');
  else ok('GET /login does not apply the new-password rule');

  const stamp = Date.now();
  const email = `adim11-${stamp}@touristlio.local`;
  const headers = { Origin: origin, 'X-TL-Lang': 'tr' };
  const enHeaders = { Origin: origin, 'X-TL-Lang': 'en' };

  await expectReject(await request(`${base}/api/auth/register`, {
    method: 'POST', headers, body: {
      name: 'Yasin', email: `short-${stamp}@touristlio.local`, password: SHORT, kvkkAccepted: true, website: '',
    },
  }), TR, 'register 8 characters');
  await expectReject(await request(`${base}/api/auth/register`, {
    method: 'POST', headers, body: {
      name: 'Yasin', email: `upper-${stamp}@touristlio.local`, password: NO_UPPER, kvkkAccepted: true, website: '',
    },
  }), TR, 'register without uppercase');
  await expectReject(await request(`${base}/api/auth/register`, {
    method: 'POST', headers, body: {
      name: 'Yasin', email: `digit-${stamp}@touristlio.local`, password: NO_DIGIT, kvkkAccepted: true, website: '',
    },
  }), TR, 'register without a digit');
  await expectReject(await request(`${base}/api/auth/register`, {
    method: 'POST', headers: enHeaders, body: {
      name: 'Yasin', email: `en-${stamp}@touristlio.local`, password: SHORT, kvkkAccepted: true, website: '',
    },
  }), EN, 'register English sentence');

  const jar = {};
  const created = await request(`${base}/api/auth/register`, {
    method: 'POST', jar, headers, body: {
      name: 'Yasin', email, password: VALID, kvkkAccepted: true, website: '',
    },
  });
  if (created.status !== 201) fail(`valid 9-char register HTTP ${created.status} ${errMsg(created.json).slice(0, 160)}`);
  else ok('register accepts Abcdefg12');

  await expectReject(await request(`${base}/api/auth/change-password`, {
    method: 'POST', jar, headers, body: { currentPassword: VALID, password: SHORT },
  }), TR, 'change-password 8 characters');
  await expectReject(await request(`${base}/api/auth/change-password`, {
    method: 'POST', jar, headers, body: { currentPassword: VALID, password: NO_UPPER },
  }), TR, 'change-password without uppercase');
  await expectReject(await request(`${base}/api/auth/change-password`, {
    method: 'POST', jar, headers: enHeaders, body: { currentPassword: VALID, password: NO_DIGIT },
  }), EN, 'change-password English sentence');

  const changed = await request(`${base}/api/auth/change-password`, {
    method: 'POST', jar, headers, body: { currentPassword: VALID, password: 'Tourist1a' },
  });
  if (changed.status !== 200) fail(`valid change-password HTTP ${changed.status} ${errMsg(changed.json).slice(0, 160)}`);
  else ok('change-password accepts Tourist1a');

  const oldLogin = await request(`${base}/api/auth/login`, {
    method: 'POST', headers, body: { email, password: VALID, website: '' },
  });
  if (oldLogin.status !== 401) fail(`old password after change expected 401, got ${oldLogin.status}`);
  else ok('previous password no longer logs in');

  const { db, initDb } = require('../db');
  const { createUser } = require('../auth');
  await initDb();
  const legacyEmail = `legacy-${stamp}@touristlio.local`;
  const legacyUser = await createUser({ name: 'Legacy', email: legacyEmail, password: LEGACY, role: 'member' });
  const legacyRow = await db.prepare('SELECT password_hash FROM users WHERE id = ?').get(legacyUser.id);
  const hash = String(legacyRow?.password_hash || '');
  if (!hash.startsWith('$argon2id$') || !hash.includes('m=65536') || !hash.includes('t=3') || !hash.includes('p=1')) {
    fail('new hash is not Argon2id m=65536 t=3 p=1');
  } else ok('hashing is still Argon2id m=65536 t=3 p=1');
  if (!passwordPolicyError(LEGACY, 'tr')) fail('legacy sample unexpectedly passes the new rule');
  const legacyLogin = await request(`${base}/api/auth/login`, {
    method: 'POST', headers, body: { email: legacyEmail, password: LEGACY, website: '' },
  });
  if (legacyLogin.status !== 200) fail(`existing short password login HTTP ${legacyLogin.status}`);
  else ok('existing short password still logs in');

  const forgot = await request(`${base}/api/auth/forgot-password`, {
    method: 'POST', headers, body: { email, website: '' },
  });
  if (forgot.status !== 200) fail(`forgot-password HTTP ${forgot.status}`);
  const resetRow = await db.prepare(`
    SELECT token FROM password_reset_tokens
    WHERE user_id = (SELECT id FROM users WHERE email = ?) AND used = 0
    ORDER BY id DESC LIMIT 1
  `).get(email);
  if (!resetRow?.token) {
    fail('reset token was not stored');
    return;
  }
  await expectReject(await request(`${base}/api/auth/reset-password`, {
    method: 'POST', headers, body: { token: resetRow.token, password: SHORT },
  }), TR, 'reset 8 characters');
  await expectReject(await request(`${base}/api/auth/reset-password`, {
    method: 'POST', headers, body: { token: resetRow.token, password: NO_UPPER },
  }), TR, 'reset without uppercase');
  await expectReject(await request(`${base}/api/auth/reset-password`, {
    method: 'POST', headers: enHeaders, body: { token: resetRow.token, password: NO_DIGIT },
  }), EN, 'reset English sentence');
  const reset = await request(`${base}/api/auth/reset-password`, {
    method: 'POST', headers, body: { token: resetRow.token, password: VALID },
  });
  if (reset.status !== 200) fail(`valid reset HTTP ${reset.status} ${errMsg(reset.json).slice(0, 160)}`);
  else ok('reset accepts Abcdefg12');
  const resetLogin = await request(`${base}/api/auth/login`, {
    method: 'POST', headers, body: { email, password: VALID, website: '' },
  });
  if (resetLogin.status !== 200) fail(`login after reset HTTP ${resetLogin.status}`);
  else ok('login works with the reset password');
}

(async () => {
  const port = process.env.VERIFY_V4_ADIM11_PORT || '3111';
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'development',
      SITEMAP_ON_START: 'false',
      LIVE_DATA_CRON: 'false',
      FORM_RATE_LIMIT_MAX: '80',
      AUTH_RATE_LIMIT_MAX: '80',
      RECAPTCHA_SITE_KEY: '',
      RECAPTCHA_SECRET: '',
    },
    stdio: 'ignore',
  });
  try {
    await waitForServer(`${base}/api/health`);
    await checkLive(base);
  } catch (err) {
    fail(`local server: ${err.message}`);
  } finally {
    child.kill('SIGTERM');
  }

  if (failed) {
    console.error(`verify-v4-adim11-password FAILED (${failed})`);
    process.exit(1);
  }
  console.log('verify-v4-adim11-password OK');
})();
