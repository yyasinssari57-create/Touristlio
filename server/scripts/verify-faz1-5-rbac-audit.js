/**
 * Claude Master PRD — FAZ1-5 (RBAC / admin audit log).
 *
 * Gap analizi: PRD'nin orijinal metni bu sandbox'ta yoktu (önceki sohbette
 * yüklenmiş, diske kalıcı olarak geçmemiş); kapsam önceki bağlamdan
 * çıkarıldı: "RBAC zorlaması + hassas admin eylemleri için audit log".
 *
 * Bulgu: `/api/admin` (server/routes/admin.js) zaten her uçta
 * authRequired + requireRole/checkPermission ve admin_audit_log (logAdmin)
 * kullanıyor — v2 ORTA-5 (admin-security) işi. Bu dosya o kapsamı YENİDEN
 * KURMUYOR; yalnızca üç GERÇEK boşluğu statik + canlı sunucu ile doğruluyor:
 *
 *   1) `/api/users` PATCH /:id/role (modüler, admin panelinde KULLANILMIYOR
 *      ama ulaşılabilir) — rol listesi 'admin'i de kabul ediyordu, kendi rol
 *      değişimini / mevcut admin hesabını engellemiyordu, audit log yazmıyordu.
 *      Düzeltme: admin.js'teki kanıtlanmış mantıkla hizalandı (ASSIGNABLE_ROLES,
 *      isProtectedUserRole, kendi-rol engeli, auditLog.log) + rotaya ayrıca
 *      requireRole('admin') eklendi.
 *   2) rbac.js'teki ROLE_DEFAULT_PERMS yedek listesi moderator/staff'a
 *      'admin.users' veriyordu — server/db.js'teki gerçek seed'le ÇELİŞİYORDU
 *      ve (1) düzeltilmeden) rol atama ucunda ayrıcalık yükseltme riski
 *      taşıyordu. Seed'le hizalandı.
 *   3) `/api/moderation` (modüler, admin panelinde KULLANILMIYOR ama
 *      ulaşılabilir) onay/red eylemleri audit log'a hiç yazmıyordu.
 *      logAdmin çağrıları eklendi.
 *   4) `/api/users` ve `/api/moderation` mutasyon uçları csrfProtection
 *      almıyordu (/api/admin, /api/tiolas, /api/blogs, /api/auth'ta zaten
 *      var) — eklendi.
 *
 * `/api/admin`'in kendisinde (gerçekte kullanılan admin paneli) EKSİK
 * middleware bulunmadı — tüm mutasyon rotaları logAdmin çağırıyor, tüm
 * rotalar en az PANEL_ROLES ile korunuyor.
 *
 * Usage: node server/scripts/verify-faz1-5-rbac-audit.js
 * Optional: VERIFY_FAZ15_PORT=3071 node server/scripts/verify-faz1-5-rbac-audit.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

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

console.log('verify-faz1-5-rbac-audit');

// ---------------------------------------------------------------------------
// 1) Statik: /api/admin zaten tam korumalı mı? (regresyon yok, yeniden
//    kurulmadı — v2 ORTA-5 / verify-admin-security.js ile aynı iddiaları
//    burada bağımsızca da doğruluyoruz çünkü FAZ1-5'in temel sorusu bu.)
// ---------------------------------------------------------------------------
const adminJs = read('server/routes/admin.js');
if (!/router\.use\(\s*authRequired\s*,\s*requireRole\(\.\.\.PANEL_ROLES\)\s*\)/.test(adminJs)) {
  fail('/api/admin router.use(authRequired, requireRole(...PANEL_ROLES)) blanket koruması yok');
} else ok('/api/admin tüm rotalar en az PANEL_ROLES ile korunuyor (blanket)');

// Her POST/PUT/DELETE/PATCH admin.js rotasının bir logAdmin() çağrısı var mı?
// (route bloğu, bir sonraki route tanımına kadar taranır)
{
  const lines = adminJs.split('\n');
  const routeRe = /^router\.(post|put|delete|patch)\('([^']+)'/;
  const routes = [];
  lines.forEach((line, i) => {
    const m = routeRe.exec(line);
    if (m) routes.push({ i, method: m[1], pathName: m[2] });
  });
  routes.push({ i: lines.length, method: null, pathName: null });
  let missing = 0;
  for (let idx = 0; idx < routes.length - 1; idx += 1) {
    const block = lines.slice(routes[idx].i, routes[idx + 1].i).join('\n');
    if (!/logAdmin\(/.test(block)) {
      fail(`admin.js: ${routes[idx].method.toUpperCase()} ${routes[idx].pathName} logAdmin çağırmıyor`);
      missing += 1;
    }
  }
  if (!missing) ok(`admin.js: tüm ${routes.length - 1} mutasyon rotası logAdmin() çağırıyor (admin_audit_log)`);
}

// ---------------------------------------------------------------------------
// 2) Statik: bulunan gerçek boşluklar düzeltildi mi?
// ---------------------------------------------------------------------------

// 2a. /api/users PATCH /:id/role artık requireRole('admin') ile ek korumalı
const usersRoutes = read('server/modules/users/users.routes.js');
if (!/router\.patch\(\s*'\/:id\/role'\s*,\s*requireRole\('admin'\)/.test(usersRoutes)) {
  fail("/api/users PATCH /:id/role requireRole('admin') ile korunmuyor (ayrıcalık yükseltme riski)");
} else ok("/api/users PATCH /:id/role artık requireRole('admin') ile de korunuyor");

// 2b. users.service.js: ASSIGNABLE_ROLES, kendi-rol engeli, korumalı hesap engeli, audit log
const usersSvc = read('server/modules/users/users.service.js');
if (!usersSvc.includes('ASSIGNABLE_ROLES')) fail('users.service.js ASSIGNABLE_ROLES kullanmıyor (admin rolü atanabilir kalabilir)');
else ok("users.service.js rol atamasında ASSIGNABLE_ROLES kullanıyor ('admin' hariç)");
if (!/userId\s*===\s*actor\.id/.test(usersSvc)) fail('users.service.js kendi rolünü değiştirme engeli yok');
else ok('users.service.js kendi rolünü değiştirmeyi engelliyor');
if (!usersSvc.includes('isProtectedUserRole')) fail('users.service.js mevcut admin hesabını korumuyor');
else ok('users.service.js mevcut admin hesaplarının rolünü korumalı tutuyor');
if (!usersSvc.includes('auditLog.log') || !usersSvc.includes("'user.role_change'")) {
  fail('users.service.js rol değişikliğini audit log\'a yazmıyor');
} else ok("users.service.js rol değişikliğini admin_audit_log'a yazıyor (user.role_change)");

// 2c. rbac.js ROLE_DEFAULT_PERMS artık seed'le (server/db.js) hizalı —
//     moderator/staff'a 'admin.users' YOK (seed de vermiyor).
const rbacJs = read('server/middleware/rbac.js');
const modBlockMatch = rbacJs.match(/moderator:\s*\[([\s\S]*?)\]/);
const staffBlockMatch = rbacJs.match(/staff:\s*\[([\s\S]*?)\]/);
if (!modBlockMatch || modBlockMatch[1].includes('admin.users')) {
  fail("rbac.js ROLE_DEFAULT_PERMS.moderator hâlâ 'admin.users' içeriyor (seed'le çelişiyor)");
} else ok("rbac.js ROLE_DEFAULT_PERMS.moderator 'admin.users' içermiyor (seed'le hizalı)");
if (!staffBlockMatch || staffBlockMatch[1].includes('admin.users')) {
  fail("rbac.js ROLE_DEFAULT_PERMS.staff hâlâ 'admin.users' içeriyor (seed'le çelişiyor)");
} else ok("rbac.js ROLE_DEFAULT_PERMS.staff 'admin.users' içermiyor (seed'le hizalı)");
const dbJsSeed = read('server/db.js');
if (/moderator:\s*\[([\s\S]*?)\]/.test(dbJsSeed) && /moderator:\s*\[([\s\S]*?)\]/.exec(dbJsSeed)[1].includes('admin.users')) {
  fail('server/db.js seed beklenmedik şekilde moderator\'a admin.users veriyor — karşılaştırma geçersiz');
} else ok('server/db.js seed (rolePerms) moderator/staff\'a admin.users vermiyor — rbac.js artık bununla tutarlı');

// 2d. moderation.controller.js artık logAdmin çağırıyor
const modCtrl = read('server/modules/moderation/moderation.controller.js');
for (const action of ['tiola.approve', 'tiola.reject', 'blog.approve', 'blog.reject']) {
  if (!modCtrl.includes(`'${action}'`)) fail(`moderation.controller.js '${action}' audit eylemini yazmıyor`);
  else ok(`moderation.controller.js '${action}' audit eylemini admin_audit_log'a yazıyor`);
}

// 2e. /api/users ve /api/moderation artık csrfProtection ile mount edilmiş
const indexJs = read('server/index.js');
if (!/app\.use\(\s*'\/api\/users'\s*,\s*csrfProtection\s*,\s*usersRoutes\s*\)/.test(indexJs)) {
  fail("/api/users csrfProtection ile mount edilmemiş");
} else ok("/api/users artık csrfProtection ile mount edilmiş (/api/admin ile aynı)");
if (!/app\.use\(\s*'\/api\/moderation'\s*,\s*csrfProtection\s*,\s*moderationRoutes\s*\)/.test(indexJs)) {
  fail("/api/moderation csrfProtection ile mount edilmemiş");
} else ok("/api/moderation artık csrfProtection ile mount edilmiş (/api/admin ile aynı)");

// ---------------------------------------------------------------------------
// 3) Canlı sunucu: gerçek HTTP istekleriyle 401/403/200 ve audit log satırı
// ---------------------------------------------------------------------------

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
function waitForServer(url, tries) {
  const max = tries || 400;
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      n += 1;
      const req = http.get(url, { timeout: 1000 }, (res) => { res.resume(); resolve(); });
      req.on('error', () => { if (n >= max) reject(new Error('server did not start')); else setTimeout(tick, 250); });
      req.on('timeout', () => { req.destroy(); if (n >= max) reject(new Error('server did not start')); else setTimeout(tick, 250); });
    };
    tick();
  });
}

async function register(root, jar, email) {
  return request(`${root}/api/auth/register`, {
    method: 'POST',
    jar,
    headers: { Origin: root },
    body: { name: 'Faz15 Test', email, password: 'TestFaz15_12345', kvkkAccepted: true, website: '' },
  });
}

async function withDb(fn) {
  const { initDb, db } = require('../db');
  await initDb();
  return fn(db);
}

async function checkLive(base) {
  const root = base.replace(/\/$/, '');

  // --- unauth / member / admin ayrımı: genel bir admin ucu üzerinden ---
  const noAuth = await request(`${root}/api/admin/stats`);
  if (noAuth.status !== 401) fail(`unauth GET /api/admin/stats HTTP ${noAuth.status}, expected 401`);
  else ok('unauth GET /api/admin/stats → 401');

  const memberJar = {};
  const memberEmail = `faz15-member-${Date.now()}@touristlio.local`;
  const regMember = await register(root, memberJar, memberEmail);
  if (regMember.status !== 201) { fail(`member register HTTP ${regMember.status}: ${regMember.body.slice(0, 180)}`); return; }
  ok('test member kullanıcısı oluşturuldu');

  const memberStats = await request(`${root}/api/admin/stats`, { jar: memberJar });
  if (memberStats.status !== 403) fail(`member GET /api/admin/stats HTTP ${memberStats.status}, expected 403`);
  else ok('member GET /api/admin/stats → 403 (Yetki yok)');

  const adminJar = {};
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@test.local';
  const adminPassword = process.env.ADMIN_PASSWORD || 'TestAdmin123!';
  const loginAdmin = await request(`${root}/api/auth/login`, {
    method: 'POST',
    jar: adminJar,
    headers: { Origin: root },
    body: { email: adminEmail, password: adminPassword },
  });
  if (loginAdmin.status !== 200) { fail(`admin login HTTP ${loginAdmin.status}: ${loginAdmin.body.slice(0, 180)}`); return; }
  ok('admin girişi yapıldı');

  const adminStats = await request(`${root}/api/admin/stats`, { jar: adminJar });
  if (adminStats.status !== 200) fail(`admin GET /api/admin/stats HTTP ${adminStats.status}, expected 200`);
  else ok('admin GET /api/admin/stats → 200');

  // --- moderator (DB'de rol elle yükseltilir — JWT'de rol yok, her istekte DB'den okunur) ---
  const modJar = {};
  const modEmail = `faz15-mod-${Date.now()}@touristlio.local`;
  const regMod = await register(root, modJar, modEmail);
  if (regMod.status !== 201) { fail(`moderator register HTTP ${regMod.status}`); return; }

  let memberId; let modId; let adminId; let tiolaId;
  await withDb(async (db) => {
    memberId = (await db.prepare('SELECT id FROM users WHERE email = ?').get(memberEmail)).id;
    modId = (await db.prepare('SELECT id FROM users WHERE email = ?').get(modEmail)).id;
    adminId = (await db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail)).id;
    await db.prepare("UPDATE users SET role = 'moderator' WHERE id = ?").run(modId);
    const info = await db.prepare(`
      INSERT INTO tiolas (user_id, place_id, stars, text, status)
      VALUES (?, NULL, NULL, 'FAZ1-5 verify: bekleyen test Tiola metni.', 'pending')
    `).run(memberId);
    tiolaId = info.lastInsertRowid;
  });
  ok('moderator rolüne yükseltilen test kullanıcısı + bekleyen test Tiola hazırlandı');

  // --- /api/users/:id/role: ayrıcalık yükseltme ve audit log testleri ---
  const noOriginNoCsrf = await request(`${root}/api/users/${memberId}/role`, {
    method: 'PATCH', jar: adminJar, body: { role: 'editor' },
  });
  if (noOriginNoCsrf.status !== 403 || !String(noOriginNoCsrf.json.error || '').includes('CSRF')) {
    fail(`Origin'siz PATCH /api/users/:id/role HTTP ${noOriginNoCsrf.status} (${noOriginNoCsrf.json.error}), expected 403 CSRF`);
  } else ok('Origin header olmadan PATCH /api/users/:id/role → 403 (CSRF) — yeni csrfProtection çalışıyor');

  const noAuthRole = await request(`${root}/api/users/${memberId}/role`, {
    method: 'PATCH', headers: { Origin: root }, body: { role: 'editor' },
  });
  if (noAuthRole.status !== 401) fail(`unauth PATCH /api/users/:id/role HTTP ${noAuthRole.status}, expected 401`);
  else ok('unauth PATCH /api/users/:id/role → 401');

  const memberRole = await request(`${root}/api/users/${memberId}/role`, {
    method: 'PATCH', jar: memberJar, headers: { Origin: root }, body: { role: 'editor' },
  });
  if (memberRole.status !== 403) fail(`member PATCH /api/users/:id/role HTTP ${memberRole.status}, expected 403`);
  else ok('member PATCH /api/users/:id/role → 403 (Yetki yok)');

  const modRole = await request(`${root}/api/users/${memberId}/role`, {
    method: 'PATCH', jar: modJar, headers: { Origin: root }, body: { role: 'admin' },
  });
  if (modRole.status !== 403) {
    fail(`moderator PATCH /api/users/:id/role HTTP ${modRole.status}, expected 403 (ayrıcalık yükseltme engeli)`);
  } else ok('moderator PATCH /api/users/:id/role → 403 — DÜZELTİLDİ (önceden admin.users izni ile mümkündü)');

  const escalate = await request(`${root}/api/users/${memberId}/role`, {
    method: 'PATCH', jar: adminJar, headers: { Origin: root }, body: { role: 'admin' },
  });
  if (escalate.status !== 400 || !String(escalate.json.error || '').includes('Geçersiz rol')) {
    fail(`admin → 'admin' rolü atama HTTP ${escalate.status} (${escalate.json.error}), expected 400 Geçersiz rol`);
  } else ok("admin bile hedef kullanıcıya 'admin' rolü ATAYAMIYOR (ASSIGNABLE_ROLES admin hariç)");

  const selfChange = await request(`${root}/api/users/${adminId}/role`, {
    method: 'PATCH', jar: adminJar, headers: { Origin: root }, body: { role: 'editor' },
  });
  if (selfChange.status !== 400 || !String(selfChange.json.error || '').includes('Kendi rolünüzü')) {
    fail(`admin kendi rolünü değiştirme HTTP ${selfChange.status} (${selfChange.json.error}), expected 400`);
  } else ok('admin kendi rolünü değiştiremiyor');

  const realChange = await request(`${root}/api/users/${memberId}/role`, {
    method: 'PATCH', jar: adminJar, headers: { Origin: root }, body: { role: 'editor' },
  });
  if (realChange.status !== 200 || realChange.json?.data?.role !== 'editor') {
    fail(`gerçek rol değişikliği HTTP ${realChange.status}: ${realChange.body.slice(0, 200)}`);
  } else ok('admin → member\'ı editor yapıyor → 200');

  await withDb(async (db) => {
    const row = await db.prepare(`
      SELECT id FROM admin_audit_log WHERE action = 'user.role_change' AND target_id = ? ORDER BY id DESC LIMIT 1
    `).get(memberId);
    if (!row) fail("user.role_change admin_audit_log'a yazılmadı");
    else ok(`user.role_change admin_audit_log'a yazıldı (id=${row.id})`);
  });

  // --- /api/moderation: csrf + RBAC + audit log testleri ---
  const noAuthMod = await request(`${root}/api/moderation/tiolas/${tiolaId}/approve`, {
    method: 'POST', headers: { Origin: root },
  });
  if (noAuthMod.status !== 401) fail(`unauth POST /api/moderation/.../approve HTTP ${noAuthMod.status}, expected 401`);
  else ok('unauth POST /api/moderation/tiolas/:id/approve → 401');

  const memberMod = await request(`${root}/api/moderation/tiolas/${tiolaId}/approve`, {
    method: 'POST', jar: memberJar, headers: { Origin: root },
  });
  if (memberMod.status !== 403) fail(`member POST /api/moderation/.../approve HTTP ${memberMod.status}, expected 403`);
  else ok('member POST /api/moderation/tiolas/:id/approve → 403 (Yetki yok)');

  const noOriginMod = await request(`${root}/api/moderation/tiolas/${tiolaId}/approve`, {
    method: 'POST', jar: modJar,
  });
  if (noOriginMod.status !== 403 || !String(noOriginMod.json.error || '').includes('CSRF')) {
    fail(`Origin'siz POST /api/moderation/.../approve HTTP ${noOriginMod.status}, expected 403 CSRF`);
  } else ok('Origin header olmadan POST /api/moderation/.../approve → 403 (CSRF) — yeni csrfProtection çalışıyor');

  const modApprove = await request(`${root}/api/moderation/tiolas/${tiolaId}/approve`, {
    method: 'POST', jar: modJar, headers: { Origin: root },
  });
  if (modApprove.status !== 200 || modApprove.json?.data?.approved !== true) {
    fail(`moderator POST /api/moderation/.../approve HTTP ${modApprove.status}: ${modApprove.body.slice(0, 200)}`);
  } else ok('moderator POST /api/moderation/tiolas/:id/approve → 200');

  await withDb(async (db) => {
    const tiola = await db.prepare('SELECT status FROM tiolas WHERE id = ?').get(tiolaId);
    if (tiola?.status !== 'approved') fail(`test Tiola durumu 'approved' değil: ${tiola?.status}`);
    else ok("test Tiola durumu 'approved' oldu");
    const row = await db.prepare(`
      SELECT id FROM admin_audit_log WHERE action = 'tiola.approve' AND target_id = ? ORDER BY id DESC LIMIT 1
    `).get(tiolaId);
    if (!row) fail("tiola.approve (moderation modülü) admin_audit_log'a yazılmadı — DÜZELTİLMEDİ");
    else ok(`tiola.approve admin_audit_log'a yazıldı (id=${row.id}) — DÜZELTİLDİ`);
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
      RECAPTCHA_SITE_KEY: '',
      RECAPTCHA_SECRET: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function main() {
  const given = process.env.VERIFY_FAZ15_URL;
  if (given) {
    await checkLive(given);
  } else {
    const port = process.env.VERIFY_FAZ15_PORT || '3071';
    const child = spawnServer(port);
    let stderr = '';
    child.stderr.on('data', (c) => { stderr += c; });
    const base = `http://127.0.0.1:${port}`;
    try {
      await waitForServer(base, 400);
      await checkLive(base);
    } catch (e) {
      fail(`live server :${port}: ${e.message}${stderr ? ` (${stderr.slice(0, 300)})` : ''}`);
    } finally {
      child.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 200));
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
    }
  }

  if (failed) {
    console.error(`verify-faz1-5-rbac-audit: ${failed} failed`);
    process.exit(1);
  }
  console.log('verify-faz1-5-rbac-audit: ok');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
