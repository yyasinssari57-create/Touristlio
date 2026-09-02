/**
 * Admin page must not crash on missing user.role after Postgres async lookups.
 * Usage: node server/scripts/verify-admin-role.js
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

console.log('verify-admin-role');

const ctrl = fs.readFileSync(path.join(ROOT, 'server/modules/auth/auth.controller.js'), 'utf8');
if (!/async function login/.test(ctrl) || !/await\s+authService\.login\s*\(/.test(ctrl)) {
  fail('login() must await authService.login');
} else ok('login() awaits authService.login');
if (!/async function me/.test(ctrl) || !/await\s+loadUserFromToken\s*\(/.test(ctrl)) {
  fail('me() must await loadUserFromToken');
} else ok('me() awaits loadUserFromToken');

const usersSvc = fs.readFileSync(path.join(ROOT, 'server/modules/users/users.service.js'), 'utf8');
if (!/await usersModel\.listAll\s*\(/.test(usersSvc)) {
  fail('users.service listUsers must await listAll');
} else ok('users.service awaits listAll');

const adminHtml = fs.readFileSync(path.join(ROOT, 'public/admin.html'), 'utf8');
if (!adminHtml.includes('data?.user') || !adminHtml.includes('!PANEL_ROLES.includes(user.role)')) {
  fail('admin.html login must guard data.user before .role');
} else ok('admin.html login guards data.user.role');
if (!/async function showPanel\(user\)[\s\S]*?showLoginScreen\(\)/.test(adminHtml)) {
  fail('showPanel must send missing user to login');
} else ok('showPanel redirects to login when user is missing');
if (!adminHtml.includes('me.user?.role')) {
  fail('restoreAdminSession must use optional role');
} else ok('restoreAdminSession uses me.user?.role');

const seed = fs.readFileSync(path.join(ROOT, 'server/seed.js'), 'utf8');
const ensure = fs.readFileSync(path.join(ROOT, 'server/scripts/ensure-admin.js'), 'utf8');
if (!seed.includes('process.env.ADMIN_EMAIL') || !/await findUserByEmail/.test(seed)) {
  fail('seedAdmin must await findUserByEmail(ADMIN_EMAIL)');
} else ok('seedAdmin awaits ADMIN_EMAIL lookup');
if (!ensure.includes('process.env.ADMIN_EMAIL') || !/await findUserByEmail/.test(ensure)) {
  fail('ensure-admin must await findUserByEmail(ADMIN_EMAIL)');
} else ok('ensure-admin awaits ADMIN_EMAIL lookup');
if (ensure.includes('ADMIN_PASSWORD=') && /ADMIN_PASSWORD=\S+/.test(ensure.replace(/process\.env\.ADMIN_PASSWORD/g, ''))) {
  fail('ensure-admin must not hardcode a production password');
} else ok('ensure-admin does not commit secrets');

if (failed) {
  console.error(`verify-admin-role FAILED (${failed})`);
  process.exit(1);
}
console.log('verify-admin-role OK');
