const path = require('path');
const { db } = require('../db');
const authModel = require('../modules/auth/auth.model');
const { sanitizeText, sanitizeName } = require('./sanitize');
const { isValidPreset, isValidColor } = require('./avatars');
const { unlinkImageAndVariants } = require('./image-process');

const VALID_TYPES = new Set(['avatar_preset', 'avatar_photo', 'display_name']);
const VALID_STATUS = new Set(['pending', 'approved', 'rejected']);

function mapRequest(row, userRow) {
  let payload = {};
  try { payload = JSON.parse(row.payload || '{}'); } catch { /* ignore */ }
  return {
    id: row.id,
    userId: row.user_id,
    userName: userRow?.name || null,
    userEmail: userRow?.email || null,
    changeType: row.change_type,
    payload,
    status: row.status,
    rejectionReason: row.rejection_reason || null,
    reviewedAt: row.reviewed_at || null,
    createdAt: row.created_at,
  };
}

async function listPending() {
  const rows = await db.prepare(`
    SELECT pcr.*, u.name AS user_name, u.email AS user_email
    FROM profile_change_requests pcr
    JOIN users u ON u.id = pcr.user_id
    WHERE pcr.status = 'pending'
    ORDER BY pcr.created_at ASC
  `).all();
  return rows.map((r) => mapRequest(r, { name: r.user_name, email: r.user_email }));
}

async function listForUser(userId) {
  const rows = await db.prepare(`
    SELECT * FROM profile_change_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 20
  `).all(userId);
  const user = await db.prepare('SELECT name, email FROM users WHERE id = ?').get(userId);
  return rows.map((r) => mapRequest(r, user));
}

async function hasPendingOfType(userId, changeType) {
  return !!await db.prepare(`
    SELECT id FROM profile_change_requests
    WHERE user_id = ? AND change_type = ? AND status = 'pending'
  `).get(userId, changeType);
}

async function createRequest(userId, changeType, payload) {
  if (!VALID_TYPES.has(changeType)) throw new Error('Geçersiz profil değişiklik türü');
  if (hasPendingOfType(userId, changeType)) {
    throw new Error('Bu alan için zaten bekleyen bir talebiniz var');
  }
  const info = await db.prepare(`
    INSERT INTO profile_change_requests (user_id, change_type, payload, status)
    VALUES (?, ?, ?, 'pending')
  `).run(userId, changeType, JSON.stringify(payload || {}));
  const row = await db.prepare('SELECT * FROM profile_change_requests WHERE id = ?').get(info.lastInsertRowid);
  const user = await db.prepare('SELECT name, email FROM users WHERE id = ?').get(userId);
  return mapRequest(row, user);
}

async function applyApproved(row) {
  const payload = JSON.parse(row.payload || '{}');
  const userId = row.user_id;
  if (row.change_type === 'avatar_preset') {
    if (!isValidPreset(payload.avatarPreset)) throw new Error('Geçersiz avatar');
    const color = payload.avatarColor && isValidColor(payload.avatarColor) ? payload.avatarColor : null;
    const existing = await authModel.findById(userId);
    await authModel.updateAvatarPreset(userId, payload.avatarPreset, color || existing?.avatar_color || '#0ea5e9');
  } else if (row.change_type === 'avatar_photo') {
    if (!payload.avatarUrl) throw new Error('Görsel URL eksik');
    const existing = await authModel.findById(userId);
    if (existing?.avatar_url && existing.avatar_url !== payload.avatarUrl) {
      const oldPath = path.join(__dirname, '..', '..', existing.avatar_url.replace(/^\//, ''));
      try { unlinkImageAndVariants(oldPath); } catch { /* ignore */ }
    }
    await authModel.updateAvatarUrl(userId, payload.avatarUrl);
  } else if (row.change_type === 'display_name') {
    const name = sanitizeName(payload.name);
    if (!name) throw new Error('Geçersiz ad');
    await db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, userId);
  }
}

async function approve(id, reviewerId) {
  const row = await db.prepare('SELECT * FROM profile_change_requests WHERE id = ?').get(id);
  if (!row) return { ok: false, error: 'Talep bulunamadı' };
  if (row.status !== 'pending') return { ok: false, error: 'Talep zaten işlendi' };
  try {
    applyApproved(row);
  } catch (err) {
    return { ok: false, error: err.message };
  }
  await db.prepare(`
    UPDATE profile_change_requests
    SET status = 'approved', reviewed_by = ?, reviewed_at = datetime('now')
    WHERE id = ?
  `).run(reviewerId, id);
  return { ok: true };
}

async function reject(id, reviewerId, reason) {
  const row = await db.prepare('SELECT * FROM profile_change_requests WHERE id = ?').get(id);
  if (!row) return { ok: false, error: 'Talep bulunamadı' };
  if (row.status !== 'pending') return { ok: false, error: 'Talep zaten işlendi' };
  const rejectionReason = sanitizeText(reason, 500) || 'Reddedildi';
  await db.prepare(`
    UPDATE profile_change_requests
    SET status = 'rejected', rejection_reason = ?, reviewed_by = ?, reviewed_at = datetime('now')
    WHERE id = ?
  `).run(rejectionReason, reviewerId, id);
  return { ok: true, rejectionReason };
}

module.exports = {
  listPending,
  listForUser,
  createRequest,
  approve,
  reject,
  hasPendingOfType,
};
