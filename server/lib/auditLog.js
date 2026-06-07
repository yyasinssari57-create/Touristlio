const { db } = require('../db');
const { sanitizeText } = require('./sanitize');

function log({ adminId, adminName, action, targetType, targetId, detail }) {
  if (!adminId || !action) return;
  const cleanAction = sanitizeText(action, 80);
  const cleanTargetType = targetType ? sanitizeText(targetType, 40) : null;
  const cleanDetail = detail != null ? sanitizeText(String(detail), 2000) : null;
  const cleanName = adminName ? sanitizeText(adminName, 120) : null;
  const tid = targetId != null && Number.isFinite(Number(targetId)) ? Number(targetId) : null;

  db.prepare(`
    INSERT INTO admin_audit_log (admin_id, admin_name, action, target_type, target_id, detail)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(adminId, cleanName, cleanAction, cleanTargetType, tid, cleanDetail);
}

function list({ page = 1, limit = 50, action, adminId, targetType } = {}) {
  const pg = Math.max(Number(page) || 1, 1);
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const offset = (pg - 1) * lim;
  const params = [];
  let where = 'WHERE 1=1';

  if (action) {
    where += ' AND action = ?';
    params.push(sanitizeText(action, 80));
  }
  if (adminId && Number.isFinite(Number(adminId))) {
    where += ' AND admin_id = ?';
    params.push(Number(adminId));
  }
  if (targetType) {
    where += ' AND target_type = ?';
    params.push(sanitizeText(targetType, 40));
  }

  const total = db.prepare(`SELECT COUNT(*) AS c FROM admin_audit_log ${where}`).get(...params).c;
  const rows = db.prepare(`
    SELECT id, admin_id, admin_name, action, target_type, target_id, detail, created_at
    FROM admin_audit_log
    ${where}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, lim, offset);

  return {
    items: rows.map((r) => ({
      id: r.id,
      adminId: r.admin_id,
      adminName: r.admin_name,
      action: r.action,
      targetType: r.target_type,
      targetId: r.target_id,
      detail: r.detail,
      createdAt: r.created_at,
    })),
    total,
    page: pg,
    limit: lim,
  };
}

module.exports = { log, list };
