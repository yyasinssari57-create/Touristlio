/**
 * [v2 ORTA-5] Admin panel security.
 * Server role checks, 5/15 login lock + failed-login logs,
 * soft delete (status / is_active), admin_audit_log.
 * High-level source checks only — no login brute-force or exploit payloads.
 * Usage: node server/scripts/verify-admin-security.js
 */
const fs = require('fs');
const path = require('path');

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

console.log('verify-admin-security');

const authMw = read('server/middleware/auth.js');
if (!authMw.includes('function requireRole') || !authMw.includes("fail(res, 'Yetki yok', 403)")) {
  fail('requireRole must reject missing/wrong role with 403');
} else ok('requireRole returns 403 Yetki yok');
if (!authMw.includes('function authRequired')) {
  fail('authRequired missing');
} else ok('authRequired present');

const adminJs = read('server/routes/admin.js');
if (!/router\.use\(\s*authRequired\s*,\s*requireRole\(\.\.\.PANEL_ROLES\)\s*\)/.test(adminJs)) {
  fail('all /api/admin routes must use authRequired + requireRole(PANEL_ROLES)');
} else ok('admin router gated by auth + panel role');
if (!adminJs.includes("requireRole('admin')")) {
  fail('sensitive admin tools must use requireRole(\'admin\')');
} else ok('admin-only routes use requireRole(\'admin\')');

const indexJs = read('server/index.js');
if (!indexJs.includes("app.use('/api/admin'") || !indexJs.includes('csrfProtection') || !indexJs.includes('adminLimiter')) {
  fail('/api/admin must mount csrfProtection + adminLimiter');
} else ok('/api/admin has CSRF + adminLimiter');

const authSvc = read('server/modules/auth/auth.service.js');
if (!/const MAX_FAILED\s*=\s*5/.test(authSvc) || !/const LOCK_MINUTES\s*=\s*15/.test(authSvc)) {
  fail('login lock must be 5 failures / 15 minutes');
} else ok('login lock is 5 failures / 15 minutes');
if (!authSvc.includes('recordFailedLogin') || !authSvc.includes('isLocked')) {
  fail('failed login counter / lock check missing');
} else ok('failed login counter and lock check');
if (!authSvc.includes("event: 'failed_login'") || !authSvc.includes('logFailedLogin')) {
  fail('failed logins must be logged (event failed_login)');
} else ok('failed logins logged as event failed_login');
const failedLogFn = authSvc.match(/function logFailedLogin[\s\S]*?^function /m)
  || authSvc.match(/function logFailedLogin[\s\S]*?async function login/);
if (!failedLogFn || /password\s*:/.test(failedLogFn[0])) {
  fail('failed-login log must not include password');
} else ok('failed-login log does not include password');

if (!adminJs.includes("router.delete('/places/:id'") || !adminJs.includes('archivePlace') || /adminPlace\.deletePlace\(/.test(adminJs)) {
  fail('DELETE /places/:id must archive (soft), not hard-delete');
} else ok('place DELETE archives (status=archived)');

if (!adminJs.includes("router.delete('/blogs/:id'") || !adminJs.includes("status = 'deleted'") || /DELETE FROM blogs/.test(adminJs)) {
  fail('DELETE /blogs/:id must set status=deleted, not DELETE FROM');
} else ok('blog DELETE is status=deleted');

if (/deleteCity\(id,\s*\{\s*hard:\s*true/.test(adminJs)) {
  fail('city DELETE must not force hard:true');
} else ok('city DELETE uses soft is_active=0');

const catDb = read('server/lib/catalog-db.js');
if (!catDb.includes("UPDATE place_categories SET is_active = 0") || /DELETE FROM place_categories WHERE id/.test(catDb)) {
  fail('place category delete must deactivate, not DELETE FROM');
} else ok('place category delete sets is_active=0');

const blogDb = read('server/lib/blog-db.js');
if (!blogDb.includes("UPDATE blog_categories SET is_active = 0") || /DELETE FROM blog_categories WHERE id/.test(blogDb)) {
  fail('blog category delete must deactivate, not DELETE FROM');
} else ok('blog category delete sets is_active=0');

const auditLib = read('server/lib/auditLog.js');
if (!auditLib.includes('INSERT INTO admin_audit_log')) {
  fail('admin_audit_log insert missing');
} else ok('admin_audit_log writes (maps audit admin_logs)');
if (!adminJs.includes('async function logAdmin') || !adminJs.includes("logAdmin(req, 'place.archive'")) {
  fail('admin mutations must write audit log');
} else ok('admin mutations call logAdmin');
for (const action of ['tools.cache_clear', 'tools.sitemap', 'place.info_boxes', 'settings.blog_page']) {
  if (!adminJs.includes(`'${action}'`)) fail(`missing audit action ${action}`);
  else ok(`audit action ${action}`);
}

const adminHtml = read('public/admin.html');
if (adminHtml.includes('Kalıcı sil') || adminHtml.includes('Tiola yorumunu kalıcı olarak')) {
  fail('admin UI still promises permanent place delete');
} else ok('admin UI copy is archive / deactivate');
if (!adminHtml.includes('Yeri arşivle') || !adminHtml.includes("'Arşivle'")) {
  fail('place modal must say archive');
} else ok('place modal archives instead of hard delete');

const pkg = JSON.parse(read('package.json'));
if (pkg.scripts['verify:admin-security'] !== 'node server/scripts/verify-admin-security.js') {
  fail('package.json missing verify:admin-security');
} else ok('verify:admin-security script');

const secrets = [authSvc, adminJs, read('server/scripts/ensure-admin.js'), read('server/seed.js')].join('\n');
if (/ADMIN_PASSWORD\s*=\s*['"][^'"]+['"]/.test(secrets.replace(/process\.env\.ADMIN_PASSWORD/g, ''))) {
  fail('must not hardcode ADMIN_PASSWORD');
} else ok('no hardcoded admin password');

if (failed) {
  console.error(`verify-admin-security FAILED (${failed})`);
  process.exit(1);
}
console.log('verify-admin-security OK');
