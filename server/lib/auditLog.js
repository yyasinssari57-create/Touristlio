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

function list({ page = 1, limit = 50, action, adminId, targetType, dateFrom, dateTo } = {}) {
  const pg = Math.max(Number(page) || 1, 1);
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const offset = (pg - 1) * lim;
  const params = [];
  let where = 'WHERE 1=1';

  if (action) {
    where += ' AND a.action = ?';
    params.push(sanitizeText(action, 80));
  }
  if (adminId && Number.isFinite(Number(adminId))) {
    where += ' AND a.admin_id = ?';
    params.push(Number(adminId));
  }
  if (targetType) {
    where += ' AND a.target_type = ?';
    params.push(sanitizeText(targetType, 40));
  }
  if (dateFrom) {
    const from = sanitizeText(String(dateFrom), 32);
    if (from) {
      where += ' AND a.created_at >= ?';
      params.push(from.length === 10 ? `${from} 00:00:00` : from);
    }
  }
  if (dateTo) {
    const to = sanitizeText(String(dateTo), 32);
    if (to) {
      where += ' AND a.created_at <= ?';
      params.push(to.length === 10 ? `${to} 23:59:59` : to);
    }
  }

  const total = db.prepare(`
    SELECT COUNT(*) AS c FROM admin_audit_log a ${where}
  `).get(...params).c;
  const rows = db.prepare(`
    SELECT a.id, a.admin_id, a.admin_name, a.action, a.target_type, a.target_id, a.detail, a.created_at,
           u.email AS admin_email, u.role AS admin_role
    FROM admin_audit_log a
    LEFT JOIN users u ON u.id = a.admin_id
    ${where}
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, lim, offset);

  return {
    items: rows.map((r) => ({
      id: r.id,
      adminId: r.admin_id,
      adminName: r.admin_name,
      adminEmail: r.admin_email || null,
      adminRole: r.admin_role || null,
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
