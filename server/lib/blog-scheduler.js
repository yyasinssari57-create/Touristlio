const { db } = require('../db');
const logger = require('./logger');

async function publishDueBlogs() {
  const due = await db.prepare(`
    SELECT id FROM blogs
    WHERE status IN ('draft', 'pending')
      AND published_at IS NOT NULL
      AND datetime(published_at) <= datetime('now')
  `).all();

  if (!due.length) return 0;

  const result = await db.prepare(`
    UPDATE blogs SET
      status = 'approved',
      moderated_at = COALESCE(moderated_at, datetime('now')),
      published_at = COALESCE(published_at, datetime('now'))
    WHERE status IN ('draft', 'pending')
      AND published_at IS NOT NULL
      AND datetime(published_at) <= datetime('now')
  `).run();

  if (result.changes) {
    logger.info({ msg: 'Scheduled blogs published', count: result.changes });
  }
  return result.changes;
}

async function listScheduled() {
  await publishDueBlogs();
  const rows = await db.prepare(`
    SELECT b.id, b.title, b.slug, b.status, b.published_at, b.created_at,
           u.name AS user_name
    FROM blogs b
    JOIN users u ON u.id = b.user_id
    WHERE b.status IN ('draft', 'pending')
      AND b.published_at IS NOT NULL
      AND datetime(b.published_at) > datetime('now')
    ORDER BY datetime(b.published_at) ASC
  `).all();
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
    status: r.status,
    publishedAt: r.published_at,
    createdAt: r.created_at,
    userName: r.user_name,
  }));
}

function normalizePublishedAt(value) {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function isFutureDate(iso) {
  if (!iso) return false;
  return new Date(iso).getTime() > Date.now();
}

module.exports = { publishDueBlogs, listScheduled, normalizePublishedAt, isFutureDate };
