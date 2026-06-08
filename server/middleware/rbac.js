const { db } = require('../db');
const { fail } = require('../lib/apiResponse');

const PANEL_ROLES = ['admin', 'moderator', 'editor', 'staff'];
const ASSIGNABLE_ROLES = ['member', 'editor', 'moderator', 'staff'];
const PROTECTED_USER_ROLES = ['admin'];

const ROLE_DEFAULT_PERMS = {
  moderator: [
    'admin.dashboard', 'admin.analytics', 'admin.moderate', 'admin.users', 'admin.places', 'admin.cities',
    'admin.categories', 'admin.content',
  ],
  editor: ['admin.dashboard', 'admin.analytics', 'admin.content'],
  staff: [
    'admin.dashboard', 'admin.analytics', 'admin.moderate', 'admin.users', 'admin.places', 'admin.cities',
    'admin.categories', 'admin.content',
  ],
};

function isProtectedUserRole(role) {
  return PROTECTED_USER_ROLES.includes(role);
}

function assertCanManageUser(actor, targetRole, res, failFn) {
  if (isProtectedUserRole(targetRole) && actor.role !== 'admin') {
    failFn(res, 'Yönetici hesapları üzerinde işlem yapılamaz', 403);
    return false;
  }
  return true;
}

function rolePermissions(roleSlug) {
  return db.prepare(`
    SELECT permission_slug FROM role_permissions WHERE role_slug = ?
  `).all(roleSlug).map((r) => r.permission_slug);
}

function effectivePermissions(roleSlug) {
  const perms = rolePermissions(roleSlug);
  if (perms.length) return perms;
  return ROLE_DEFAULT_PERMS[roleSlug] || [];
}

function checkPermission(...required) {
  return (req, res, next) => {
    if (!req.user) return fail(res, 'Giriş gerekli', 401);
    if (req.user.role === 'admin') return next();
    const perms = effectivePermissions(req.user.role);
    if (required.some((p) => perms.includes(p))) return next();
    return fail(res, 'Yetki yok', 403);
  };
}

function computeUserRiskReasons(userId) {
  const user = db.prepare('SELECT created_at FROM users WHERE id = ?').get(userId);
  if (!user) return [];
  const reasons = [];
  const ageDays = (Date.now() - new Date(user.created_at + 'Z').getTime()) / 86400000;
  if (ageDays < 2) {
    reasons.push({ code: 'new_account', label: 'Hesap 2 günden yeni', points: 30 });
  }
  const pending = db.prepare("SELECT COUNT(*) AS c FROM tiolas WHERE user_id = ? AND status = 'pending'").get(userId).c;
  if (pending > 3) {
    reasons.push({ code: 'many_pending', label: `${pending} bekleyen Tiola`, points: 20 });
  }
  const rejected = db.prepare("SELECT COUNT(*) AS c FROM tiolas WHERE user_id = ? AND status = 'rejected'").get(userId).c;
  if (rejected > 1) {
    reasons.push({ code: 'rejected_history', label: `${rejected} reddedilen Tiola`, points: 25 });
  }
  return reasons;
}

function computeUserRiskScore(userId) {
  const reasons = computeUserRiskReasons(userId);
  const score = reasons.reduce((sum, r) => sum + r.points, 0);
  db.prepare('UPDATE users SET risk_score = ? WHERE id = ?').run(score, userId);
  return score;
}

module.exports = {
  rolePermissions,
  effectivePermissions,
  checkPermission,
  computeUserRiskScore,
  computeUserRiskReasons,
  ROLE_DEFAULT_PERMS,
  PANEL_ROLES,
  ASSIGNABLE_ROLES,
  isProtectedUserRole,
  assertCanManageUser,
};
