const { db } = require('../db');
const { sanitizeText } = require('./sanitize');

async function log({ contentType, contentId, action, adminId, adminName, reason }) {
  if (!contentType || !contentId || !action || !adminId) return;
  await db.prepare(`
    INSERT INTO moderation_history (content_type, content_id, action, admin_id, admin_name, reason)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    sanitizeText(contentType, 20),
    Number(contentId),
    sanitizeText(action, 40),
    adminId,
    adminName ? sanitizeText(adminName, 120) : null,
    reason != null ? sanitizeText(String(reason), 2000) : null,
  );
}

async function listForContent(contentType, contentId, limit = 30) {
  const rows = await db.prepare(`
    SELECT mh.*, u.name AS admin_display_name
    FROM moderation_history mh
    LEFT JOIN users u ON u.id = mh.admin_id
    WHERE mh.content_type = ? AND mh.content_id = ?
    ORDER BY mh.created_at DESC
    LIMIT ?
  `).all(sanitizeText(contentType, 20), Number(contentId), Math.min(limit, 100));
  return rows.map((r) => ({
    id: r.id,
    contentType: r.content_type,
    contentId: r.content_id,
    action: r.action,
    adminId: r.admin_id,
    adminName: r.admin_name || r.admin_display_name,
    reason: r.reason,
    createdAt: r.created_at,
  }));
}

const ACTION_LABELS = {
  approve: 'Onayladı',
  reject: 'Reddetti',
  remove: 'Kaldırdı',
};

function actionLabel(action) {
  return ACTION_LABELS[action] || action;
}

module.exports = { log, listForContent, actionLabel, ACTION_LABELS };
