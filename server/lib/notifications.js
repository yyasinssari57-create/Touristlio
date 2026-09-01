const { db } = require('../db');

async function createNotification({ userId, type, title, body, link }) {
  const info = await db.prepare(`
    INSERT INTO user_notifications (user_id, type, title, body, link)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, type, title, body, link || null);
  return info.lastInsertRowid;
}

async function listForUser(userId, { unreadOnly = false, limit = 30 } = {}) {
  let sql = 'SELECT * FROM user_notifications WHERE user_id = ?';
  if (unreadOnly) sql += ' AND read_at IS NULL';
  sql += ' ORDER BY created_at DESC LIMIT ?';
  return (await db.prepare(sql).all(userId, limit)).map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    readAt: row.read_at,
    createdAt: row.created_at,
  }));
}

async function markRead(id, userId) {
  return await db.prepare(`
    UPDATE user_notifications SET read_at = datetime('now')
    WHERE id = ? AND user_id = ?
  `).run(id, userId);
}

async function markAllRead(userId) {
  return await db.prepare(`
    UPDATE user_notifications SET read_at = datetime('now')
    WHERE user_id = ? AND read_at IS NULL
  `).run(userId);
}

module.exports = {
  createNotification,
  listForUser,
  markRead,
  markAllRead,
};
