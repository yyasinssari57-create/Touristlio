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

/**
 * Same as log(), but writes every entry in a single multi-row INSERT —
 * used by bulk admin actions (/tiolas/bulk, /blogs/bulk) so moderation
 * history stays per-item while avoiding one DB round-trip per item
 * (Claude Master PRD FAZ2-4 — N+1 query cleanup).
 */
async function logBatch(entries) {
  const rows = (entries || [])
    .filter((e) => e && e.contentType && e.contentId && e.action && e.adminId)
    .map((e) => [
      sanitizeText(e.contentType, 20),
      Number(e.contentId),
      sanitizeText(e.action, 40),
      e.adminId,
      e.adminName ? sanitizeText(e.adminName, 120) : null,
      e.reason != null ? sanitizeText(String(e.reason), 2000) : null,
    ]);
  if (!rows.length) return;
  const placeholders = rows.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
  await db.prepare(`
    INSERT INTO moderation_history (content_type, content_id, action, admin_id, admin_name, reason)
    VALUES ${placeholders}
  `).run(...rows.flat());
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

module.exports = { log, logBatch, listForContent, actionLabel, ACTION_LABELS };
