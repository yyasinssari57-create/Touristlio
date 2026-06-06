const { db } = require('../db');
const { fail } = require('../lib/apiResponse');

function rolePermissions(roleSlug) {
  return db.prepare(`
    SELECT permission_slug FROM role_permissions WHERE role_slug = ?
  `).all(roleSlug).map((r) => r.permission_slug);
}

function checkPermission(...required) {
  return (req, res, next) => {
    if (!req.user) return fail(res, 'Giriş gerekli', 401);
    const perms = rolePermissions(req.user.role);
    if (req.user.role === 'admin') return next();
    if (required.some((p) => perms.includes(p))) return next();
    return fail(res, 'Yetki yok', 403);
  };
}

function computeUserRiskScore(userId) {
  const user = db.prepare('SELECT created_at FROM users WHERE id = ?').get(userId);
  if (!user) return 0;
  const ageDays = (Date.now() - new Date(user.created_at + 'Z').getTime()) / 86400000;
  const pending = db.prepare("SELECT COUNT(*) AS c FROM tiolas WHERE user_id = ? AND status = 'pending'").get(userId).c;
  const rejected = db.prepare("SELECT COUNT(*) AS c FROM tiolas WHERE user_id = ? AND status = 'rejected'").get(userId).c;
  let score = 0;
  if (ageDays < 2) score += 30;
  if (pending > 3) score += 20;
  if (rejected > 1) score += 25;
  db.prepare('UPDATE users SET risk_score = ? WHERE id = ?').run(score, userId);
  return score;
}

module.exports = { rolePermissions, checkPermission, computeUserRiskScore };
