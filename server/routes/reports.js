const express = require('express');
const { db } = require('../db');
const { authRequired } = require('../middleware/auth');
const { reportLimiter } = require('../middleware/rateLimit');
const { ok, fail } = require('../lib/apiResponse');
const { sanitizeText } = require('../lib/sanitize');

const router = express.Router();

const VALID_REASONS = ['spam', 'uygunsuz', 'taciz', 'sahte', 'telif', 'diger'];
const VALID_TARGET_TYPES = ['profile', 'tiola', 'blog'];

const REASON_LABELS = {
  spam: 'Spam',
  uygunsuz: 'Uygunsuz içerik',
  taciz: 'Taciz',
  sahte: 'Sahte hesap',
  telif: 'Telif',
  diger: 'Diğer',
};

function parsePositiveInt(val) {
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

async function targetExists(type, id) {
  if (type === 'profile') {
    return await db.prepare('SELECT id, name FROM users WHERE id = ?').get(id);
  }
  if (type === 'tiola') {
    return await db.prepare('SELECT id, user_id, text FROM tiolas WHERE id = ?').get(id);
  }
  if (type === 'blog') {
    return await db.prepare('SELECT id, user_id, title FROM blogs WHERE id = ?').get(id);
  }
  return null;
}

function mapReport(row) {
  return {
    id: row.id,
    reporterId: row.reporter_id,
    reporterName: row.reporter_name,
    targetType: row.target_type,
    targetId: row.target_id,
    targetLabel: row.target_label,
    targetUserId: row.target_user_id || null,
    targetUserName: row.target_user_name || null,
    targetContentStatus: row.target_content_status || null,
    targetContentPreview: row.target_content_preview || null,
    reason: row.reason,
    reasonLabel: REASON_LABELS[row.reason] || row.reason,
    note: row.note,
    status: row.status,
    actionTaken: row.action_taken || null,
    resolutionReason: row.resolution_reason || null,
    contentPrevStatus: row.content_prev_status || null,
    createdAt: row.created_at,
    resolvedBy: row.resolved_by,
    resolvedByName: row.resolved_by_name || null,
    resolvedAt: row.resolved_at,
  };
}

router.post('/', authRequired, reportLimiter, async (req, res) => {
  const targetType = String(req.body?.targetType || '').trim();
  const targetId = parsePositiveInt(req.body?.targetId);
  const reason = String(req.body?.reason || '').trim();
  const note = sanitizeText(req.body?.note, 500);
  if (!note || note.length < 10) {
    return fail(res, 'Lütfen en az 10 karakterlik bir açıklama yazın', 400);
  }

  if (!VALID_TARGET_TYPES.includes(targetType)) {
    return fail(res, 'Geçersiz hedef türü', 400);
  }
  if (!targetId) return fail(res, 'Geçersiz hedef', 400);
  if (!VALID_REASONS.includes(reason)) return fail(res, 'Geçersiz şikayet nedeni', 400);

  const target = targetExists(targetType, targetId);
  if (!target) return fail(res, 'Şikayet edilen içerik bulunamadı', 404);

  if (targetType === 'profile' && target.id === req.user.id) {
    return fail(res, 'Kendi profilinizi şikayet edemezsiniz', 400);
  }
  if (targetType === 'tiola' && target.user_id === req.user.id) {
    return fail(res, 'Kendi içeriğinizi şikayet edemezsiniz', 400);
  }
  if (targetType === 'blog' && target.user_id === req.user.id) {
    return fail(res, 'Kendi içeriğinizi şikayet edemezsiniz', 400);
  }

  const dup = await db.prepare(`
    SELECT id FROM reports
    WHERE reporter_id = ? AND target_type = ? AND target_id = ? AND status = 'pending'
  `).get(req.user.id, targetType, targetId);
  if (dup) return fail(res, 'Bu içerik için zaten bekleyen bir şikayetiniz var', 409);

  const info = await db.prepare(`
    INSERT INTO reports (reporter_id, target_type, target_id, reason, note, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `).run(req.user.id, targetType, targetId, reason, note);

  return ok(res, { id: info.lastInsertRowid, message: 'Şikayetiniz alındı. İnceleme sonrası bilgilendirileceksiniz.' }, 201);
});

module.exports = { router, mapReport, REASON_LABELS, VALID_REASONS, VALID_TARGET_TYPES };
