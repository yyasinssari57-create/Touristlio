const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const multer = require('multer');
const { db } = require('../db');
const { authRequired, requireRole } = require('../middleware/auth');
const { createUser, findUserByEmail, sanitizeUser, passwordPolicyError } = require('../auth');
const { clear: clearCache } = require('../lib/cache');
const { computeUserRiskScore, computeUserRiskReasons, checkPermission, PANEL_ROLES, ASSIGNABLE_ROLES, assertCanManageUser } = require('../middleware/rbac');
const auditLog = require('../lib/auditLog');
const contentFilter = require('../lib/contentFilter');
const { parsePagination, buildTiolaListFilters, buildBlogListFilters } = require('../lib/moderation-query');
const { spawnSync } = require('child_process');
const { adminToolLimiter } = require('../middleware/rateLimit');
const { parsePositiveInt, sanitizeText, sanitizeName } = require('../lib/sanitize');
const notifications = require('../lib/notifications');
const { sendTiolaRejectionEmail, sendBlogRejectionEmail, sendAdminMessageEmail } = require('../lib/mailer');
const moderationHistory = require('../lib/moderation-history');
const blogScheduler = require('../lib/blog-scheduler');
const placesImportExport = require('../lib/places-import-export');
const profileChanges = require('../lib/profile-changes');
const { getUserTiolaLikeCount } = require('../lib/likes');
const { upsertLiveData, applyInfoBoxUpdates, buildInfoBoxesResponse } = require('../services/liveDataService');
const catalogDb = require('../lib/catalog-db');
const blogDb = require('../lib/blog-db');
const settingsService = require('../modules/settings/settings.service');
const adminPlace = require('../lib/admin-place');
const placesService = require('../modules/places/places.service');
const { ok, fail } = require('../lib/apiResponse');
const { mapReport } = require('./reports');
const reportMod = require('../lib/report-moderation');
const { validateUploadedImage } = require('../lib/image-mime');
const { processImageUpload } = require('../middleware/process-image-upload');
const { deleteStoredImage, diskUploadRoot } = require('../lib/image-process');
const { imageUploader } = require('../lib/image-uploader');
const { publicImageUrl } = require('../lib/media-url');
const supabaseStorage = require('../lib/supabase-storage');
const logger = require('../lib/logger');
const { refreshPlaceStatsForTiola } = require('../lib/tiola-stats');

const SCRIPT_TIMEOUT_MS = 120000;
const router = express.Router();
router.use(authRequired, requireRole(...PANEL_ROLES));

async function logAdmin(req, action, targetType, targetId, detail) {
  await auditLog.log({
    adminId: req.user.id,
    adminName: req.user.name,
    action,
    targetType,
    targetId,
    detail,
  });
}

async function logModeration(req, contentType, contentId, action, reason) {
  await moderationHistory.log({
    contentType,
    contentId,
    action,
    adminId: req.user.id,
    adminName: req.user.name,
    reason,
  });
}

const uploadRoot = diskUploadRoot();
if (!fs.existsSync(uploadRoot)) fs.mkdirSync(uploadRoot, { recursive: true });

const upload = imageUploader({ fileSize: 5 * 1024 * 1024, files: 10 });
function mapPendingTiola(row) {
  return {
    id: row.id,
    userName: row.user_name,
    placeName: row.place_name || '(Genel Tiola)',
    stars: row.stars,
    text: row.text,
    photoUrl: publicImageUrl(row.photo_path),
    cityTag: row.city_tag,
    status: row.status,
    createdAt: row.created_at,
  };
}

async function queryTiolaList(req, res, { approvedOnly, pendingOnly }) {
  const { page, limit, offset } = parsePagination(req.query);
  const { where, params } = buildTiolaListFilters(req.query, { approvedOnly, pendingOnly });
  const total = (await db.prepare(`
    SELECT COUNT(*) AS c FROM tiolas t
    JOIN users u ON u.id = t.user_id
    LEFT JOIN places p ON p.id = t.place_id
    ${where}
  `).get(...params)).c;
  const rows = await db.prepare(`
    SELECT t.*, u.name AS user_name, p.name AS place_name
    FROM tiolas t
    JOIN users u ON u.id = t.user_id
    LEFT JOIN places p ON p.id = t.place_id
    ${where}
    ORDER BY t.created_at ${approvedOnly ? 'DESC' : 'ASC'}
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);
  return ok(res, { items: rows.map(mapPendingTiola), total, page, limit });
}

async function queryBlogList(req, res, { approvedOnly, pendingOnly }) {
  const { page, limit, offset } = parsePagination(req.query);
  const { where, params } = buildBlogListFilters(req.query, { approvedOnly, pendingOnly });
  const total = (await db.prepare(`
    SELECT COUNT(*) AS c FROM blogs b
    JOIN users u ON u.id = b.user_id
    ${where}
  `).get(...params)).c;
  const rows = await db.prepare(`
    SELECT b.*, u.name AS user_name FROM blogs b
    JOIN users u ON u.id = b.user_id
    ${where}
    ORDER BY COALESCE(b.published_at, b.created_at) ${approvedOnly ? 'DESC' : 'ASC'}
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);
  return ok(res, {
    items: rows.map((r) => ({
      id: r.id,
      userName: r.user_name,
      title: r.title,
      excerpt: r.excerpt,
      slug: r.slug,
      status: r.status,
      placeId: r.place_id,
      publishedAt: r.published_at,
      createdAt: r.created_at,
    })),
    total,
    page,
    limit,
  });
}

router.get('/pending/tiolas', checkPermission('admin.moderate'), async (req, res) => {
  return await queryTiolaList(req, res, { pendingOnly: true });
});

router.get('/pending/blogs', checkPermission('admin.content'), async (req, res) => {
  await blogScheduler.publishDueBlogs();
  return await queryBlogList(req, res, { pendingOnly: true });
});

function runAdminScript(scriptRel) {
  const cwd = path.join(__dirname, '..', '..');
  const scriptPath = path.join(__dirname, '..', scriptRel);
  return spawnSync(process.execPath, [scriptPath], {
    cwd,
    encoding: 'utf8',
    timeout: SCRIPT_TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024,
  });
}

router.post('/tiolas/:id/approve', checkPermission('admin.moderate'), async (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  await db.prepare(`
    UPDATE tiolas SET status = 'approved', moderated_by = ?, moderated_at = datetime('now')
    WHERE id = ? AND status IN ('pending', 'spam')
  `).run(req.user.id, id);
  await refreshPlaceStatsForTiola(id);
  logAdmin(req, 'tiola.approve', 'tiola', id, null);
  logModeration(req, 'tiola', id, 'approve', null);
  return ok(res, { approved: true });
});

router.get('/approved/tiolas', checkPermission('admin.moderate'), async (req, res) => {
  return await queryTiolaList(req, res, { approvedOnly: true });
});

router.post('/tiolas/:id/remove', checkPermission('admin.moderate'), async (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const reason = sanitizeText(req.body?.reason, 1000);
  if (!reason) return fail(res, 'Kaldırma nedeni gerekli');

  const row = await db.prepare(`
    SELECT t.*, u.email AS user_email, u.name AS user_name, p.name AS place_name
    FROM tiolas t
    JOIN users u ON u.id = t.user_id
    LEFT JOIN places p ON p.id = t.place_id
    WHERE t.id = ?
  `).get(id);
  if (!row) return fail(res, 'Tiola bulunamadı', 404);
  if (row.status !== 'approved') return fail(res, 'Yalnızca yayında olan Tiola kaldırılabilir', 409);

  await db.prepare(`
    UPDATE tiolas SET status = 'rejected', moderated_by = ?, moderated_at = datetime('now'), rejection_reason = ?
    WHERE id = ? AND status = 'approved'
  `).run(req.user.id, reason, id);
  await refreshPlaceStatsForTiola(id);

  const placeLabel = row.place_name || row.city_tag || 'Genel Tiola';
  await notifications.createNotification({
    userId: row.user_id,
    type: 'tiola_removed',
    title: 'Tiola kaldırıldı',
    body: `${placeLabel}: ${reason}`,
    link: '/profile',
  });

  try {
    const siteUrl = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
    await sendTiolaRejectionEmail(row.user_email, {
      userName: row.user_name,
      placeName: placeLabel,
      reason,
      profileUrl: `${siteUrl}/profile`,
    });
  } catch {
    /* e-posta isteğe bağlı */
  }

  logAdmin(req, 'tiola.remove', 'tiola', id, reason);
  logModeration(req, 'tiola', id, 'remove', reason);
  return ok(res, { removed: true, rejectionReason: reason });
});

router.post('/tiolas/:id/reject', checkPermission('admin.moderate'), async (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const reason = sanitizeText(req.body?.reason, 1000);
  if (!reason) return fail(res, 'Red nedeni gerekli');

  const row = await db.prepare(`
    SELECT t.*, u.email AS user_email, u.name AS user_name, p.name AS place_name
    FROM tiolas t
    JOIN users u ON u.id = t.user_id
    LEFT JOIN places p ON p.id = t.place_id
    WHERE t.id = ?
  `).get(id);
  if (!row) return fail(res, 'Tiola bulunamadı', 404);
  if (!['pending', 'spam'].includes(row.status)) {
    return fail(res, 'Bu Tiola zaten işlendi', 409);
  }

  await db.prepare(`
    UPDATE tiolas SET status = 'rejected', moderated_by = ?, moderated_at = datetime('now'), rejection_reason = ?
    WHERE id = ? AND status IN ('pending', 'spam')
  `).run(req.user.id, reason, id);
  await refreshPlaceStatsForTiola(id);

  const placeLabel = row.place_name || row.city_tag || 'Genel Tiola';
  await notifications.createNotification({
    userId: row.user_id,
    type: 'tiola_rejected',
    title: 'Tiola reddedildi',
    body: `${placeLabel}: ${reason}`,
    link: '/profile',
  });

  try {
    const siteUrl = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
    await sendTiolaRejectionEmail(row.user_email, {
      userName: row.user_name,
      placeName: placeLabel,
      reason,
      profileUrl: `${siteUrl}/profile`,
    });
  } catch {
    /* e-posta isteğe bağlı */
  }

  logAdmin(req, 'tiola.reject', 'tiola', id, reason);
  logModeration(req, 'tiola', id, 'reject', reason);
  return ok(res, { rejected: true, rejectionReason: reason });
});

router.post('/tiolas/bulk', checkPermission('admin.moderate'), async (req, res) => {
  const { ids, action, reason } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) return fail(res, 'ID listesi gerekli');
  if (!['approve', 'reject', 'remove'].includes(action)) return fail(res, 'Geçersiz işlem');

  const cleanReason = sanitizeText(reason, 1000);
  if (['reject', 'remove'].includes(action) && !cleanReason) {
    return fail(res, 'Neden gerekli');
  }

  let processed = 0;
  const errors = [];

  for (const rawId of ids) {
    const id = Number(rawId);
    if (!Number.isFinite(id)) {
      errors.push({ id: rawId, error: 'Geçersiz ID' });
      continue;
    }
    try {
      if (action === 'approve') {
        const r = await db.prepare(`
          UPDATE tiolas SET status = 'approved', moderated_by = ?, moderated_at = datetime('now')
          WHERE id = ? AND status IN ('pending', 'spam')
        `).run(req.user.id, id);
        if (!r.changes) { errors.push({ id, error: 'Onaylanamadı' }); continue; }
        await refreshPlaceStatsForTiola(id);
        logAdmin(req, 'tiola.approve', 'tiola', id, 'bulk');
        logModeration(req, 'tiola', id, 'approve', 'bulk');
        processed += 1;
      } else if (action === 'reject') {
        const row = await db.prepare(`
          SELECT t.*, u.email AS user_email, u.name AS user_name, p.name AS place_name
          FROM tiolas t JOIN users u ON u.id = t.user_id LEFT JOIN places p ON p.id = t.place_id
          WHERE t.id = ?
        `).get(id);
        if (!row || !['pending', 'spam'].includes(row.status)) {
          errors.push({ id, error: 'Reddedilemedi' });
          continue;
        }
        await db.prepare(`
          UPDATE tiolas SET status = 'rejected', moderated_by = ?, moderated_at = datetime('now'), rejection_reason = ?
          WHERE id = ? AND status IN ('pending', 'spam')
        `).run(req.user.id, cleanReason, id);
        await refreshPlaceStatsForTiola(id);
        const placeLabel = row.place_name || row.city_tag || 'Genel Tiola';
        await notifications.createNotification({
          userId: row.user_id,
          type: 'tiola_rejected',
          title: 'Tiola reddedildi',
          body: `${placeLabel}: ${cleanReason}`,
          link: '/profile',
        });
        try {
          const siteUrl = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
          await sendTiolaRejectionEmail(row.user_email, {
            userName: row.user_name,
            placeName: placeLabel,
            reason: cleanReason,
            profileUrl: `${siteUrl}/profile`,
          });
        } catch { /* optional */ }
        logAdmin(req, 'tiola.reject', 'tiola', id, cleanReason);
        logModeration(req, 'tiola', id, 'reject', cleanReason);
        processed += 1;
      } else if (action === 'remove') {
        const row = await db.prepare(`
          SELECT t.*, u.email AS user_email, u.name AS user_name, p.name AS place_name
          FROM tiolas t JOIN users u ON u.id = t.user_id LEFT JOIN places p ON p.id = t.place_id
          WHERE t.id = ?
        `).get(id);
        if (!row || row.status !== 'approved') {
          errors.push({ id, error: 'Kaldırılamadı' });
          continue;
        }
        await db.prepare(`
          UPDATE tiolas SET status = 'rejected', moderated_by = ?, moderated_at = datetime('now'), rejection_reason = ?
          WHERE id = ? AND status = 'approved'
        `).run(req.user.id, cleanReason, id);
        await refreshPlaceStatsForTiola(id);
        const placeLabel = row.place_name || row.city_tag || 'Genel Tiola';
        await notifications.createNotification({
          userId: row.user_id,
          type: 'tiola_removed',
          title: 'Tiola kaldırıldı',
          body: `${placeLabel}: ${cleanReason}`,
          link: '/profile',
        });
        try {
          const siteUrl = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
          await sendTiolaRejectionEmail(row.user_email, {
            userName: row.user_name,
            placeName: placeLabel,
            reason: cleanReason,
            profileUrl: `${siteUrl}/profile`,
          });
        } catch { /* optional */ }
        logAdmin(req, 'tiola.remove', 'tiola', id, cleanReason);
        logModeration(req, 'tiola', id, 'remove', cleanReason);
        processed += 1;
      }
    } catch (err) {
      errors.push({ id, error: err.message || 'Hata' });
    }
  }

  return ok(res, { processed, errors });
});

router.post('/blogs/:id/approve', checkPermission('admin.content'), async (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  await db.prepare(`
    UPDATE blogs SET status = 'approved', moderated_by = ?, moderated_at = datetime('now'),
      published_at = COALESCE(published_at, datetime('now'))
    WHERE id = ? AND status IN ('pending', 'spam')
  `).run(req.user.id, id);
  logAdmin(req, 'blog.approve', 'blog', id, null);
  logModeration(req, 'blog', id, 'approve', null);
  return ok(res, { approved: true });
});

router.get('/approved/blogs', checkPermission('admin.content'), async (req, res) => {
  return await queryBlogList(req, res, { approvedOnly: true });
});

router.post('/blogs/:id/remove', checkPermission('admin.content'), async (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const reason = sanitizeText(req.body?.reason, 1000);
  if (!reason) return fail(res, 'Kaldırma nedeni gerekli');

  const row = await db.prepare(`
    SELECT b.*, u.email AS user_email, u.name AS user_name
    FROM blogs b
    JOIN users u ON u.id = b.user_id
    WHERE b.id = ?
  `).get(id);
  if (!row) return fail(res, 'Blog bulunamadı', 404);
  if (row.status !== 'approved') return fail(res, 'Yalnızca yayında olan blog kaldırılabilir', 409);

  await db.prepare(`
    UPDATE blogs SET status = 'rejected', moderated_by = ?, moderated_at = datetime('now'),
      rejection_reason = ?, published_at = NULL
    WHERE id = ? AND status = 'approved'
  `).run(req.user.id, reason, id);

  await notifications.createNotification({
    userId: row.user_id,
    type: 'blog_removed',
    title: 'Blog kaldırıldı',
    body: `${row.title}: ${reason}`,
    link: '/profile',
  });

  try {
    const siteUrl = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
    await sendBlogRejectionEmail(row.user_email, {
      userName: row.user_name,
      title: row.title,
      reason,
      profileUrl: `${siteUrl}/profile`,
    });
  } catch {
    /* e-posta isteğe bağlı */
  }

  logAdmin(req, 'blog.remove', 'blog', id, reason);
  logModeration(req, 'blog', id, 'remove', reason);
  return ok(res, { removed: true, rejectionReason: reason });
});

router.post('/blogs/:id/reject', checkPermission('admin.content'), async (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const reason = sanitizeText(req.body?.reason, 1000);
  if (!reason) return fail(res, 'Red nedeni gerekli');

  const row = await db.prepare(`
    SELECT b.*, u.email AS user_email, u.name AS user_name
    FROM blogs b
    JOIN users u ON u.id = b.user_id
    WHERE b.id = ?
  `).get(id);
  if (!row) return fail(res, 'Blog bulunamadı', 404);
  if (!['pending', 'spam'].includes(row.status)) return fail(res, 'Bu blog zaten işlendi', 409);

  await db.prepare(`
    UPDATE blogs SET status = 'rejected', moderated_by = ?, moderated_at = datetime('now'), rejection_reason = ?
    WHERE id = ? AND status IN ('pending', 'spam')
  `).run(req.user.id, reason, id);

  await notifications.createNotification({
    userId: row.user_id,
    type: 'blog_rejected',
    title: 'Blog reddedildi',
    body: `${row.title}: ${reason}`,
    link: '/profile',
  });

  try {
    const siteUrl = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
    await sendBlogRejectionEmail(row.user_email, {
      userName: row.user_name,
      title: row.title,
      reason,
      profileUrl: `${siteUrl}/profile`,
    });
  } catch {
    /* e-posta isteğe bağlı */
  }

  logAdmin(req, 'blog.reject', 'blog', id, reason);
  logModeration(req, 'blog', id, 'reject', reason);
  return ok(res, { rejected: true, rejectionReason: reason });
});

router.post('/blogs/bulk', checkPermission('admin.content'), async (req, res) => {
  const { ids, action, reason } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) return fail(res, 'ID listesi gerekli');
  if (!['approve', 'reject', 'remove'].includes(action)) return fail(res, 'Geçersiz işlem');

  const cleanReason = sanitizeText(reason, 1000);
  if (['reject', 'remove'].includes(action) && !cleanReason) {
    return fail(res, 'Neden gerekli');
  }

  let processed = 0;
  const errors = [];

  for (const rawId of ids) {
    const id = Number(rawId);
    if (!Number.isFinite(id)) {
      errors.push({ id: rawId, error: 'Geçersiz ID' });
      continue;
    }
    try {
      if (action === 'approve') {
        const r = await db.prepare(`
          UPDATE blogs SET status = 'approved', moderated_by = ?, moderated_at = datetime('now'),
            published_at = COALESCE(published_at, datetime('now'))
          WHERE id = ? AND status IN ('pending', 'spam')
        `).run(req.user.id, id);
        if (!r.changes) { errors.push({ id, error: 'Onaylanamadı' }); continue; }
        logAdmin(req, 'blog.approve', 'blog', id, 'bulk');
        logModeration(req, 'blog', id, 'approve', 'bulk');
        processed += 1;
      } else if (action === 'reject') {
        const row = await db.prepare(`
          SELECT b.*, u.email AS user_email, u.name AS user_name
          FROM blogs b JOIN users u ON u.id = b.user_id WHERE b.id = ?
        `).get(id);
        if (!row || !['pending', 'spam'].includes(row.status)) {
          errors.push({ id, error: 'Reddedilemedi' });
          continue;
        }
        await db.prepare(`
          UPDATE blogs SET status = 'rejected', moderated_by = ?, moderated_at = datetime('now'), rejection_reason = ?
          WHERE id = ? AND status IN ('pending', 'spam')
        `).run(req.user.id, cleanReason, id);
        await notifications.createNotification({
          userId: row.user_id,
          type: 'blog_rejected',
          title: 'Blog reddedildi',
          body: `${row.title}: ${cleanReason}`,
          link: '/profile',
        });
        try {
          const siteUrl = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
          await sendBlogRejectionEmail(row.user_email, {
            userName: row.user_name,
            title: row.title,
            reason: cleanReason,
            profileUrl: `${siteUrl}/profile`,
          });
        } catch { /* optional */ }
        logAdmin(req, 'blog.reject', 'blog', id, cleanReason);
        logModeration(req, 'blog', id, 'reject', cleanReason);
        processed += 1;
      } else if (action === 'remove') {
        const row = await db.prepare(`
          SELECT b.*, u.email AS user_email, u.name AS user_name
          FROM blogs b JOIN users u ON u.id = b.user_id WHERE b.id = ?
        `).get(id);
        if (!row || row.status !== 'approved') {
          errors.push({ id, error: 'Kaldırılamadı' });
          continue;
        }
        await db.prepare(`
          UPDATE blogs SET status = 'rejected', moderated_by = ?, moderated_at = datetime('now'),
            rejection_reason = ?, published_at = NULL
          WHERE id = ? AND status = 'approved'
        `).run(req.user.id, cleanReason, id);
        await notifications.createNotification({
          userId: row.user_id,
          type: 'blog_removed',
          title: 'Blog kaldırıldı',
          body: `${row.title}: ${cleanReason}`,
          link: '/profile',
        });
        try {
          const siteUrl = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
          await sendBlogRejectionEmail(row.user_email, {
            userName: row.user_name,
            title: row.title,
            reason: cleanReason,
            profileUrl: `${siteUrl}/profile`,
          });
        } catch { /* optional */ }
        logAdmin(req, 'blog.remove', 'blog', id, cleanReason);
        logModeration(req, 'blog', id, 'remove', cleanReason);
        processed += 1;
      }
    } catch (err) {
      errors.push({ id, error: err.message || 'Hata' });
    }
  }

  return ok(res, { processed, errors });
});

router.post('/moderators', requireRole('admin'), async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return fail(res, 'Ad, e-posta ve şifre gerekli');
  }
  const pwErr = passwordPolicyError(password);
  if (pwErr) {
    return fail(res, pwErr);
  }
  if (await findUserByEmail(email)) {
    return fail(res, 'E-posta zaten kayıtlı', 409);
  }
  const user = await createUser({ name, email, password, role: 'moderator' });
  logAdmin(req, 'moderator.create', 'user', user.id, `${name} (${email})`);
  return ok(res, { user: await sanitizeUser(user) }, 201);
});

/* ── Places CRUD ── */
router.get('/places', checkPermission('admin.places'), async (req, res) => {
  try {
    const q = req.query.q || '';
    const limit = Number(req.query.limit) || 100;
    const offset = Number(req.query.offset) || 0;
    const issue = req.query.issue || null;
    const data = await adminPlace.listAdminPlaces({
      q, limit, offset, issue, includeArchived: req.query.all === '1',
    });
    return ok(res, data);
  } catch (err) {
    return fail(res, err.message || 'Yerler getirilemedi', 500);
  }
});

router.get('/places/export', checkPermission('admin.places'), async (req, res) => {
  const format = String(req.query.format || 'json').toLowerCase();
  if (format === 'csv') {
    const csv = await placesImportExport.exportPlacesCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="places-export.csv"');
    return res.send(`\uFEFF${csv}`);
  }
  const places = await placesImportExport.exportPlacesJson();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="places-export.json"');
  return res.json(places);
});

const placesImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

router.post('/places/import', checkPermission('admin.places'), placesImportUpload.single('file'), async (req, res) => {
  try {
    const items = placesImportExport.parseImportPayload(req.body, req.file);
    const result = await placesImportExport.importPlaces(items, {
      updateExisting: req.body?.updateExisting !== false && req.body?.updateExisting !== '0',
    });
    clearCache('places-list');
    clearCache('search');
    logAdmin(req, 'places.import', 'place', null, `${result.created} yeni, ${result.updated} güncellendi`);
    return ok(res, result);
  } catch (err) {
    return fail(res, err.message || 'İçe aktarma başarısız');
  }
});

router.get('/places/:id', checkPermission('admin.places'), async (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const place = await adminPlace.getAdminPlace(id);
  if (!place) return fail(res, 'Yer bulunamadı', 404);
  return ok(res, { place });
});

router.post('/places', checkPermission('admin.places'), async (req, res) => {
  try {
    const created = await adminPlace.insertPlace(req.body || {});
    logAdmin(req, 'place.create', 'place', created.id, created.name || null);
    clearCache('places-list');
    clearCache('search');
    return ok(res, created, 201);
  } catch (err) {
    return fail(res, err.message || 'Yer eklenemedi');
  }
});

router.put('/places/:id', checkPermission('admin.places'), async (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  try {
    const updated = await adminPlace.updatePlace(id, req.body || {});
    if (!updated) return fail(res, 'Yer bulunamadı', 404);
    logAdmin(req, 'place.update', 'place', id, updated.name || null);
    clearCache('places-list');
    clearCache('search');
    return ok(res, { place: updated });
  } catch (err) {
    return fail(res, err.message || 'Yer güncellenemedi');
  }
});

router.delete('/places/:id', checkPermission('admin.places'), async (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const preview = await adminPlace.getAdminPlace(id);
  if (!preview) return fail(res, 'Yer bulunamadı', 404);
  const result = await adminPlace.deletePlace(id);
  logAdmin(req, 'place.delete', 'place', id, preview.name || null);
  clearCache('places-list');
  clearCache('search');
  return ok(res, result);
});

function isExternalPhotoUrl(url) {
  const u = String(url || '').trim();
  if (!/^https?:\/\//i.test(u)) return false;
  if (/\/uploads\//i.test(u)) return false;
  if (/supabase\.co\/storage\//i.test(u)) return false;
  return true;
}

router.post('/places/:id/photos', checkPermission('admin.places'), upload.array('photos', 10), validateUploadedImage(), processImageUpload({ destRel: (req) => `places/${req.params.id}` }), async (req, res) => {
  const placeId = parsePositiveInt(req.params.id, res);
  if (!placeId) return;
  const row = await db.prepare('SELECT * FROM places WHERE id = ?').get(placeId);
  if (!row) return fail(res, 'Yer bulunamadı', 404);
  if (!req.files?.length) return fail(res, 'Görsel gerekli', 400);

  const newUrls = (req.files || []).map((f) => f.publicUrl || publicImageUrl(f.storageKey));
  let existing = [];
  try { existing = JSON.parse(row.photos || '[]'); } catch { existing = []; }

  if (req.query.stripExternal === '1') {
    existing = existing.filter((u) => !isExternalPhotoUrl(u));
  }

  const merged = [...newUrls, ...existing];
  const seen = new Set();
  const photos = merged.filter((u) => {
    if (!u || seen.has(u)) return false;
    seen.add(u);
    return true;
  });

  const imageUrl = newUrls[0];
  await db.prepare('UPDATE places SET photos = ?, image_url = ? WHERE id = ?').run(
    JSON.stringify(photos),
    imageUrl,
    placeId,
  );
  clearCache('places-list');
  clearCache('search');
  return ok(res, { photos, imageUrl, uploaded: newUrls.length });
});

const mediaUpload = imageUploader({ fileSize: 5 * 1024 * 1024, files: 1 });

router.post('/media', checkPermission('admin.places', 'admin.cities'), mediaUpload.single('image'), validateUploadedImage(), processImageUpload({ destRel: 'media' }), async (req, res) => {
  if (!req.file) return fail(res, 'Görsel gerekli', 400);
  const url = req.file.publicUrl || publicImageUrl(req.file.storageKey);
  return ok(res, { url });
});

/* ── Cities CRUD ── */
router.get('/cities', checkPermission('admin.cities'), async (req, res) => {
  try {
    const cities = await catalogDb.listCities({ includeInactive: req.query.all === '1' });
    return ok(res, { cities });
  } catch (err) {
    return fail(res, err.message || 'Şehirler getirilemedi', 500);
  }
});

router.get('/cities/:id', checkPermission('admin.cities'), async (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const city = await catalogDb.getCityById(id);
  if (!city) return fail(res, 'Şehir bulunamadı', 404);
  return ok(res, { city });
});

router.post('/cities', checkPermission('admin.cities'), async (req, res) => {
  try {
    const city = await catalogDb.createCity(req.body || {});
    clearCache('places-list');
    logAdmin(req, 'city.create', 'city', city.id, city.name || city.slug || null);
    return ok(res, { city }, 201);
  } catch (err) {
    return fail(res, err.message || 'Şehir eklenemedi');
  }
});

router.put('/cities/:id', checkPermission('admin.cities'), async (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  try {
    const city = await catalogDb.updateCity(id, req.body || {});
    if (!city) return fail(res, 'Şehir bulunamadı', 404);
    clearCache('places-list');
    clearCache('search');
    logAdmin(req, 'city.update', 'city', id, city.name || city.slug || null);
    return ok(res, { city });
  } catch (err) {
    return fail(res, err.message || 'Şehir güncellenemedi');
  }
});

router.delete('/cities/:id', checkPermission('admin.cities'), async (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const preview = await catalogDb.getCityById(id);
  const result = await catalogDb.deleteCity(id, { hard: true });
  if (!result.ok) return fail(res, result.error, result.error?.includes('kayıtlı') ? 409 : 404);
  clearCache('places-list');
  logAdmin(req, 'city.delete', 'city', id, preview?.name || preview?.slug || null);
  return ok(res, result);
});

/* ── Categories CRUD ── */
router.get('/categories', checkPermission('admin.categories'), async (req, res) => {
  try {
    const categories = await catalogDb.listCategories({ includeInactive: req.query.all === '1' });
    return ok(res, { categories });
  } catch (err) {
    return fail(res, err.message || 'Kategoriler getirilemedi', 500);
  }
});

function invalidateCategoryCaches() {
  placesService.invalidateMetaCategories();
  placesService.invalidatePlacesCache();
  clearCache('search');
}

router.post('/categories', checkPermission('admin.categories'), async (req, res) => {
  try {
    const category = await catalogDb.createCategory(req.body || {});
    invalidateCategoryCaches();
    logAdmin(req, 'category.create', 'category', category.id, category.nameTr || category.slug || null);
    return ok(res, { category }, 201);
  } catch (err) {
    return fail(res, err.message || 'Kategori eklenemedi');
  }
});

router.put('/categories/reorder', checkPermission('admin.categories'), async (req, res) => {
  try {
    const categories = await catalogDb.reorderCategories(req.body?.orderedIds || req.body?.ids);
    invalidateCategoryCaches();
    logAdmin(req, 'category.reorder', 'category', null, `${categories.length} kategori`);
    return ok(res, { categories });
  } catch (err) {
    return fail(res, err.message || 'Sıralama güncellenemedi');
  }
});

router.put('/categories/:id', checkPermission('admin.categories'), async (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  try {
    const category = await catalogDb.updateCategory(id, req.body || {});
    if (!category) return fail(res, 'Kategori bulunamadı', 404);
    invalidateCategoryCaches();
    logAdmin(req, 'category.update', 'category', id, category.nameTr || category.slug || null);
    return ok(res, { category });
  } catch (err) {
    return fail(res, err.message || 'Kategori güncellenemedi');
  }
});

router.delete('/categories/:id', checkPermission('admin.categories'), async (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const reassignTo = req.body?.reassignTo || req.query.reassignTo;
  const preview = (await catalogDb.listCategories({ includeInactive: true })).find((c) => c.id === id);
  const result = await catalogDb.deleteCategory(id, { reassignTo });
  if (!result.ok) return fail(res, result.error, result.placeCount ? 409 : 404);
  invalidateCategoryCaches();
  logAdmin(req, 'category.delete', 'category', id, preview?.nameTr || preview?.slug || null);
  return ok(res, result);
});

/* ── Users & roles ── */
router.get('/users', checkPermission('admin.moderate', 'admin.users'), async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const total = (await db.prepare('SELECT COUNT(*) AS c FROM users').get()).c;
  const rows = await db.prepare(`
    SELECT id, name, email, role, email_verified, is_blocked, created_at FROM users
    ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(limit, offset);
  return ok(res, {
    users: rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      emailVerified: !!r.email_verified,
      isBlocked: !!r.is_blocked,
      createdAt: r.created_at,
    })),
    total,
    limit,
    offset,
  });
});

router.get('/users/:id', checkPermission('admin.moderate', 'admin.users'), async (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const row = await db.prepare(`
    SELECT id, name, email, role, email_verified, is_blocked, avatar_color, avatar_url, avatar_preset,
           risk_score, created_at, failed_login_count, locked_until
    FROM users WHERE id = ?
  `).get(id);
  if (!row) return fail(res, 'Kullanıcı bulunamadı', 404);

  const tiolaCount = (await db.prepare('SELECT COUNT(*) AS c FROM tiolas WHERE user_id = ?').get(id)).c;
  const tiolaApproved = (await db.prepare("SELECT COUNT(*) AS c FROM tiolas WHERE user_id = ? AND status = 'approved'").get(id)).c;
  const tiolaPending = (await db.prepare("SELECT COUNT(*) AS c FROM tiolas WHERE user_id = ? AND status = 'pending'").get(id)).c;
  const tiolaRejected = (await db.prepare("SELECT COUNT(*) AS c FROM tiolas WHERE user_id = ? AND status = 'rejected'").get(id)).c;
  const tiolaSpam = (await db.prepare("SELECT COUNT(*) AS c FROM tiolas WHERE user_id = ? AND status = 'spam'").get(id)).c;
  const blogCount = (await db.prepare('SELECT COUNT(*) AS c FROM blogs WHERE user_id = ?').get(id)).c;
  const blogApproved = (await db.prepare("SELECT COUNT(*) AS c FROM blogs WHERE user_id = ? AND status = 'approved'").get(id)).c;
  const blogPending = (await db.prepare("SELECT COUNT(*) AS c FROM blogs WHERE user_id = ? AND status = 'pending'").get(id)).c;
  const blogRejected = (await db.prepare("SELECT COUNT(*) AS c FROM blogs WHERE user_id = ? AND status = 'rejected'").get(id)).c;
  const reportCount = (await db.prepare('SELECT COUNT(*) AS c FROM reports WHERE reporter_id = ?').get(id)).c;
  const reportedCount = (await db.prepare(`
    SELECT COUNT(*) AS c FROM reports
    WHERE (target_type = 'profile' AND target_id = ?)
       OR (target_type = 'tiola' AND target_id IN (SELECT id FROM tiolas WHERE user_id = ?))
       OR (target_type = 'blog' AND target_id IN (SELECT id FROM blogs WHERE user_id = ?))
  `).get(id, id, id)).c;
  const recentTiolas = await db.prepare(`
    SELECT t.id, t.text, t.status, t.stars, t.place_id, t.created_at, t.moderated_at, t.rejection_reason,
           p.name AS place_name, m.name AS moderated_by_name
    FROM tiolas t
    LEFT JOIN places p ON p.id = t.place_id
    LEFT JOIN users m ON m.id = t.moderated_by
    WHERE t.user_id = ? AND t.parent_id IS NULL
    ORDER BY t.created_at DESC LIMIT 15
  `).all(id);
  const recentBlogs = await db.prepare(`
    SELECT b.id, b.title, b.status, b.created_at, b.published_at, b.moderated_at, b.rejection_reason,
           m.name AS moderated_by_name
    FROM blogs b
    LEFT JOIN users m ON m.id = b.moderated_by
    WHERE b.user_id = ?
    ORDER BY b.created_at DESC LIMIT 10
  `).all(id);
  const reportsMade = await db.prepare(`
    SELECT r.id, r.target_type, r.target_id, r.reason, r.note, r.status, r.created_at,
           r.action_taken, r.resolution_reason, r.resolved_at, res.name AS resolved_by_name
    FROM reports r
    LEFT JOIN users res ON res.id = r.resolved_by
    WHERE r.reporter_id = ?
    ORDER BY r.created_at DESC LIMIT 50
  `).all(id);
  const reportsReceived = await db.prepare(`
    SELECT r.id, r.target_type, r.target_id, r.reason, r.note, r.status, r.created_at,
           r.action_taken, r.resolution_reason, r.resolved_at,
           rep.name AS reporter_name, res.name AS resolved_by_name
    FROM reports r
    JOIN users rep ON rep.id = r.reporter_id
    LEFT JOIN users res ON res.id = r.resolved_by
    WHERE (r.target_type = 'profile' AND r.target_id = ?)
       OR (r.target_type = 'tiola' AND r.target_id IN (SELECT id FROM tiolas WHERE user_id = ?))
       OR (r.target_type = 'blog' AND r.target_id IN (SELECT id FROM blogs WHERE user_id = ?))
    ORDER BY r.created_at DESC LIMIT 50
  `).all(id, id, id);
  const pendingProfileChanges = (await db.prepare(`
    SELECT id, change_type, payload, status, created_at, rejection_reason
    FROM profile_change_requests
    WHERE user_id = ? AND status = 'pending'
    ORDER BY created_at DESC
  `).all(id)).map((pcr) => {
    let payload = {};
    try { payload = JSON.parse(pcr.payload || '{}'); } catch { /* ignore */ }
    return {
      id: pcr.id,
      changeType: pcr.change_type,
      payload,
      status: pcr.status,
      createdAt: pcr.created_at,
      rejectionReason: pcr.rejection_reason,
    };
  });
  const profileChangeHistory = (await db.prepare(`
    SELECT id, change_type, payload, status, created_at, reviewed_at, rejection_reason
    FROM profile_change_requests
    WHERE user_id = ?
    ORDER BY created_at DESC LIMIT 10
  `).all(id)).map((pcr) => {
    let payload = {};
    try { payload = JSON.parse(pcr.payload || '{}'); } catch { /* ignore */ }
    return {
      id: pcr.id,
      changeType: pcr.change_type,
      payload,
      status: pcr.status,
      createdAt: pcr.created_at,
      reviewedAt: pcr.reviewed_at,
      rejectionReason: pcr.rejection_reason,
    };
  });
  const moderationHistory = await db.prepare(`
    SELECT 'tiola' AS kind, t.id AS content_id, t.status, t.rejection_reason, t.moderated_at,
           m.name AS moderator_name, COALESCE(p.name, t.city_tag, 'Genel Tiola') AS label
    FROM tiolas t
    LEFT JOIN users m ON m.id = t.moderated_by
    LEFT JOIN places p ON p.id = t.place_id
    WHERE t.user_id = ? AND t.moderated_at IS NOT NULL
    UNION ALL
    SELECT 'blog' AS kind, b.id AS content_id, b.status, b.rejection_reason, b.moderated_at,
           m.name AS moderator_name, b.title AS label
    FROM blogs b
    LEFT JOIN users m ON m.id = b.moderated_by
    WHERE b.user_id = ? AND b.moderated_at IS NOT NULL
    ORDER BY moderated_at DESC
    LIMIT 20
  `).all(id, id);
  const savedPlacesCount = (await db.prepare('SELECT COUNT(*) AS c FROM saved_places WHERE user_id = ?').get(id)).c;
  const visitedCount = (await db.prepare('SELECT COUNT(*) AS c FROM visited_places WHERE user_id = ?').get(id)).c;

  const REASON_LABELS = {
    spam: 'Spam', uygunsuz: 'Uygunsuz içerik', taciz: 'Taciz',
    sahte: 'Sahte hesap', telif: 'Telif', diger: 'Diğer',
  };

  return ok(res, {
    user: {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      emailVerified: !!row.email_verified,
      isBlocked: !!row.is_blocked,
      avatarColor: row.avatar_color,
      avatarUrl: row.avatar_url || null,
      avatarPreset: row.avatar_preset || null,
      riskScore: await computeUserRiskScore(id),
      riskScoreReasons: await computeUserRiskReasons(id),
      createdAt: row.created_at,
      failedLoginCount: row.failed_login_count || 0,
      lockedUntil: row.locked_until || null,
      likeCount: await getUserTiolaLikeCount(id),
      stats: {
        tiolaCount,
        tiolaApproved,
        tiolaPending,
        tiolaRejected,
        tiolaSpam,
        blogCount,
        blogApproved,
        blogPending,
        blogRejected,
        reportsMade: reportCount,
        reportsAgainst: reportedCount,
        savedPlaces: savedPlacesCount,
        visitedPlaces: visitedCount,
      },
      recentTiolas: recentTiolas.map((t) => ({
        id: t.id,
        text: t.text?.slice(0, 120),
        status: t.status,
        stars: t.stars,
        placeId: t.place_id,
        placeName: t.place_name,
        createdAt: t.created_at,
        moderatedAt: t.moderated_at,
        moderatedByName: t.moderated_by_name,
        rejectionReason: t.rejection_reason,
      })),
      recentBlogs: recentBlogs.map((b) => ({
        id: b.id,
        title: b.title,
        status: b.status,
        createdAt: b.created_at,
        publishedAt: b.published_at,
        moderatedAt: b.moderated_at,
        moderatedByName: b.moderated_by_name,
        rejectionReason: b.rejection_reason,
      })),
      reportsMade: reportsMade.map((r) => ({
        id: r.id,
        targetType: r.target_type,
        targetId: r.target_id,
        reason: r.reason,
        reasonLabel: REASON_LABELS[r.reason] || r.reason,
        note: r.note,
        status: r.status,
        actionTaken: r.action_taken,
        resolutionReason: r.resolution_reason,
        resolvedAt: r.resolved_at,
        resolvedByName: r.resolved_by_name,
        createdAt: r.created_at,
      })),
      reportsReceived: reportsReceived.map((r) => ({
        id: r.id,
        targetType: r.target_type,
        targetId: r.target_id,
        reason: r.reason,
        reasonLabel: REASON_LABELS[r.reason] || r.reason,
        note: r.note,
        status: r.status,
        actionTaken: r.action_taken,
        resolutionReason: r.resolution_reason,
        resolvedAt: r.resolved_at,
        resolvedByName: r.resolved_by_name,
        reporterName: r.reporter_name,
        createdAt: r.created_at,
      })),
      pendingProfileChanges,
      profileChangeHistory,
      moderationHistory: moderationHistory.map((m) => ({
        kind: m.kind,
        contentId: m.content_id,
        status: m.status,
        label: m.label,
        rejectionReason: m.rejection_reason,
        moderatedAt: m.moderated_at,
        moderatorName: m.moderator_name,
      })),
    },
  });
});

router.get('/profile-changes', requireRole('admin'), async (_req, res) => {
  return ok(res, { requests: await profileChanges.listPending() });
});

router.post('/profile-changes/:id/approve', requireRole('admin'), async (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const pending = await db.prepare('SELECT user_id, change_type FROM profile_change_requests WHERE id = ?').get(id);
  const result = await profileChanges.approve(id, req.user.id);
  if (!result.ok) return fail(res, result.error, result.error?.includes('bulunamadı') ? 404 : 409);
  logAdmin(req, 'profile.approve', 'profile_change', id, pending?.change_type || null);
  const row = await db.prepare('SELECT user_id FROM profile_change_requests WHERE id = ?').get(id);
  if (row) {
    await notifications.createNotification({
      userId: row.user_id,
      type: 'profile_approved',
      title: 'Profil güncellemesi onaylandı',
      body: 'Profil değişikliğiniz yayına alındı.',
      link: '/profile',
    });
  }
  return ok(res, { approved: true });
});

router.post('/profile-changes/:id/reject', requireRole('admin'), async (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const reason = sanitizeText(req.body?.reason, 500) || 'Reddedildi';
  const pending = await db.prepare('SELECT user_id, change_type FROM profile_change_requests WHERE id = ?').get(id);
  const result = await profileChanges.reject(id, req.user.id, reason);
  if (!result.ok) return fail(res, result.error, result.error?.includes('bulunamadı') ? 404 : 409);
  logAdmin(req, 'profile.reject', 'profile_change', id, `${pending?.change_type || 'profil'}: ${reason}`);
  const row = await db.prepare('SELECT user_id FROM profile_change_requests WHERE id = ?').get(id);
  if (row) {
    await notifications.createNotification({
      userId: row.user_id,
      type: 'profile_rejected',
      title: 'Profil güncellemesi reddedildi',
      body: reason,
      link: '/profile',
    });
  }
  return ok(res, { rejected: true, rejectionReason: reason });
});

router.put('/places/:id/info-boxes', checkPermission('admin.places'), async (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const place = await db.prepare('SELECT id FROM places WHERE id = ?').get(id);
  if (!place) return fail(res, 'Yer bulunamadı', 404);

  const existing = await db.prepare('SELECT payload FROM place_live_data WHERE place_id = ?').get(id);
  let payload = {};
  try { payload = JSON.parse(existing?.payload || '{}'); } catch { /* ignore */ }

  payload = applyInfoBoxUpdates(payload, req.body || {});
  upsertLiveData(id, payload);
  return ok(res, { saved: true, infoBoxes: buildInfoBoxesResponse(payload) });
});

router.get('/places/:id/info-boxes', checkPermission('admin.places'), async (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const row = await db.prepare('SELECT payload FROM place_live_data WHERE place_id = ?').get(id);
  let payload = {};
  try { payload = JSON.parse(row?.payload || '{}'); } catch { /* ignore */ }
  return ok(res, { infoBoxes: buildInfoBoxesResponse(payload) });
});

router.post('/users/:id/block', checkPermission('admin.moderate', 'admin.users'), async (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  if (id === req.user.id) return fail(res, 'Kendi hesabınızı engelleyemezsiniz', 400);

  const target = await db.prepare('SELECT id, is_blocked, role FROM users WHERE id = ?').get(id);
  if (!target) return fail(res, 'Kullanıcı bulunamadı', 404);
  if (!assertCanManageUser(req.user, target.role, res, fail)) return;

  const blocked = req.body?.blocked === true || req.body?.blocked === 1;
  if (blocked && target.role === 'admin') {
    return fail(res, 'Yönetici hesabı engellenemez', 403);
  }
  await db.prepare('UPDATE users SET is_blocked = ? WHERE id = ?').run(blocked ? 1 : 0, id);
  logAdmin(req, blocked ? 'user.block' : 'user.unblock', 'user', id, null);
  return ok(res, { id, blocked });
});

router.post('/users/:id/send-message', checkPermission('admin.moderate', 'admin.users'), async (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const subject = sanitizeText(req.body?.subject, 200);
  const body = sanitizeText(req.body?.body, 5000);
  if (!subject || !body) return fail(res, 'Konu ve mesaj gerekli');

  const target = await db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(id);
  if (!target) return fail(res, 'Kullanıcı bulunamadı', 404);
  if (!assertCanManageUser(req.user, target.role, res, fail)) return;

  const siteUrl = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
  let emailSent = false;
  try {
    emailSent = await sendAdminMessageEmail(target.email, {
      userName: target.name,
      subject,
      body,
      siteUrl,
    });
  } catch (err) {
    return fail(res, err.message || 'E-posta gönderilemedi', 500);
  }

  await notifications.createNotification({
    userId: target.id,
    type: 'admin_message',
    title: subject,
    body: body.slice(0, 500),
    link: '/profile',
  });

  logAdmin(req, 'user.send_message', 'user', id, subject);
  return ok(res, { sent: true, emailSent });
});

router.post('/users/:id/remove-avatar', checkPermission('admin.moderate', 'admin.users'), async (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  if (id === req.user.id) return fail(res, 'Kendi profil fotoğrafınızı bu yolla kaldıramazsınız', 400);

  const target = await db.prepare('SELECT id, role FROM users WHERE id = ?').get(id);
  if (!target) return fail(res, 'Kullanıcı bulunamadı', 404);
  if (!assertCanManageUser(req.user, target.role, res, fail)) return;

  const reason = sanitizeText(req.body?.reason, 500) || 'Moderasyon kararı';
  const removal = await reportMod.removeProfilePhoto(id);
  if (!removal.ok) return fail(res, removal.error, 400);

  if (removal.hadPhoto) {
    await notifications.createNotification({
      userId: id,
      type: 'profile_avatar_removed',
      title: 'Profil fotoğrafı kaldırıldı',
      body: reason,
      link: '/profile',
    });
  }

  logAdmin(req, 'user.remove_avatar', 'user', id, reason);
  logModeration(req, 'profile', id, 'remove_avatar', reason);
  return ok(res, { id, removed: !!removal.hadPhoto, alreadyRemoved: !!removal.alreadyRemoved });
});

router.patch('/users/:id/name', checkPermission('admin.moderate', 'admin.users'), async (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;

  const target = await db.prepare('SELECT id, role, name FROM users WHERE id = ?').get(id);
  if (!target) return fail(res, 'Kullanıcı bulunamadı', 404);
  if (!assertCanManageUser(req.user, target.role, res, fail)) return;

  const name = sanitizeName(req.body?.name);
  if (!name) return fail(res, 'Geçersiz görünen ad', 400);

  await db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, id);
  const reason = sanitizeText(req.body?.reason, 500) || null;
  logAdmin(req, 'user.rename', 'user', id, reason || `${target.name} → ${name}`);
  if (reason) {
    await notifications.createNotification({
      userId: id,
      type: 'profile_name_changed',
      title: 'Görünen adınız güncellendi',
      body: reason,
      link: '/profile',
    });
  }
  return ok(res, { id, name });
});

router.patch('/users/:id/role', requireRole('admin'), async (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  if (id === req.user.id) return fail(res, 'Kendi rolünüzü değiştiremezsiniz', 400);

  const role = String(req.body?.role || '').trim();
  if (!ASSIGNABLE_ROLES.includes(role)) {
    return fail(res, 'Geçersiz rol (member, editor, moderator, staff)', 400);
  }

  const target = await db.prepare('SELECT id, role, name FROM users WHERE id = ?').get(id);
  if (!target) return fail(res, 'Kullanıcı bulunamadı', 404);
  if (!assertCanManageUser(req.user, target.role, res, fail)) return;
  if (target.role === 'admin') return fail(res, 'Yönetici rolü değiştirilemez', 403);

  const prevRole = target.role;
  await db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
  logAdmin(req, 'user.role_change', 'user', id, `${prevRole} → ${role}`);
  return ok(res, { id, role, previousRole: prevRole });
});

router.get('/roles', requireRole('admin'), async (_req, res) => {
  const roles = await db.prepare('SELECT slug, name FROM roles ORDER BY slug').all();
  const permissions = await db.prepare('SELECT slug, name FROM permissions ORDER BY slug').all();
  const rolePermissions = await db.prepare('SELECT role_slug, permission_slug FROM role_permissions').all();
  const byRole = {};
  for (const rp of rolePermissions) {
    if (!byRole[rp.role_slug]) byRole[rp.role_slug] = [];
    byRole[rp.role_slug].push(rp.permission_slug);
  }
  return ok(res, {
    roles: roles.map((r) => ({ slug: r.slug, name: r.name, permissions: byRole[r.slug] || [] })),
    permissions: permissions.map((p) => ({ slug: p.slug, name: p.name })),
  });
});

router.get('/stats', checkPermission('admin.dashboard'), async (_req, res) => {
  const { isEphemeralStorage } = require('../db');
  const stats = {
    storageEphemeral: isEphemeralStorage(),
    users: (await db.prepare('SELECT COUNT(*) AS c FROM users').get()).c,
    places: (await db.prepare('SELECT COUNT(*) AS c FROM places').get()).c,
    tiolasApproved: (await db.prepare("SELECT COUNT(*) AS c FROM tiolas WHERE status = 'approved'").get()).c,
    tiolasPending: (await db.prepare("SELECT COUNT(*) AS c FROM tiolas WHERE status = 'pending'").get()).c,
    tiolasSpam: (await db.prepare("SELECT COUNT(*) AS c FROM tiolas WHERE status = 'spam'").get()).c,
    blogsPending: (await db.prepare("SELECT COUNT(*) AS c FROM blogs WHERE status = 'pending'").get()).c,
    travelLists: (await db.prepare('SELECT COUNT(*) AS c FROM travel_lists').get()).c,
    visitedRecords: (await db.prepare('SELECT COUNT(*) AS c FROM visited_places').get()).c,
    contactMessages: (await db.prepare('SELECT COUNT(*) AS c FROM contact_messages').get()).c,
  };
  return ok(res, stats);
});

router.get('/content-quality', checkPermission('admin.dashboard'), async (_req, res) => {
  const total = (await db.prepare('SELECT COUNT(*) AS c FROM places').get()).c;
  const noPhoto = (await db.prepare("SELECT COUNT(*) AS c FROM places WHERE photos IS NULL OR photos = '[]' OR photos = ''").get()).c;
  const noFaq = (await db.prepare("SELECT COUNT(*) AS c FROM places WHERE faq_tr IS NULL OR faq_tr = '[]'").get()).c;
  const noCoords = (await db.prepare('SELECT COUNT(*) AS c FROM places WHERE lat IS NULL OR lng IS NULL').get()).c;
  const shortDesc = (await db.prepare('SELECT COUNT(*) AS c FROM places WHERE length(description) < 80').get()).c;
  return ok(res, {
    total,
    issues: {
      noPhoto: { count: noPhoto, label: 'Fotoğraf eksik' },
      noFaq: { count: noFaq, label: 'FAQ eksik' },
      noCoords: { count: noCoords, label: 'Koordinat eksik' },
      shortDesc: { count: shortDesc, label: 'Kısa açıklama' },
    },
    score: Math.round(100 - ((noPhoto + noFaq + noCoords + shortDesc) / Math.max(total, 1)) * 25),
  });
});

router.get('/contact-messages', checkPermission('admin.dashboard'), async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const total = (await db.prepare('SELECT COUNT(*) AS c FROM contact_messages').get()).c;
  const rows = await db.prepare(`
    SELECT id, name, email, subject, message, created_at AS createdAt
    FROM contact_messages
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);
  return ok(res, { items: rows, total, page, limit });
});

router.get('/moderation-history/:contentType/:contentId', checkPermission('admin.moderate', 'admin.content'), async (req, res) => {
  const contentType = String(req.params.contentType || '').trim();
  const contentId = parsePositiveInt(req.params.contentId, res);
  if (!contentId) return;
  if (!['tiola', 'blog'].includes(contentType)) {
    return fail(res, 'Geçersiz içerik türü', 400);
  }
  const items = await moderationHistory.listForContent(contentType, contentId);
  return ok(res, { items });
});

const DB_BACKUP_MAX_BYTES = 100 * 1024 * 1024;

function backupFilename() {
  const date = new Date().toISOString().slice(0, 10);
  return `touristlio-backup-${date}.sql`;
}

function writePgDump(destPath) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL gerekli');
  const result = spawnSync('pg_dump', [url, '-f', destPath], {
    encoding: 'utf8',
    timeout: SCRIPT_TIMEOUT_MS,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || 'pg_dump başarısız').slice(0, 500));
  }
}

router.get('/backup/download', requireRole('admin'), adminToolLimiter, async (req, res) => {
  const filename = backupFilename();
  const tmpPath = path.join(os.tmpdir(), `touristlio-backup-${Date.now()}.sql`);
  try {
    writePgDump(tmpPath);
    logAdmin(req, 'db.backup_download', 'database', null, filename);
    res.setHeader('Content-Type', 'application/sql');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    const stream = fs.createReadStream(tmpPath);
    stream.on('error', (err) => {
      try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
      if (!res.headersSent) fail(res, err.message || 'Yedek indirilemedi', 500);
    });
    stream.on('end', () => {
      try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    });
    stream.pipe(res);
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    return fail(res, err.message || 'Yedek indirilemedi (pg_dump). Supabase Dashboard → Database → Backups kullanın.', 500);
  }
});

const dbRestoreUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: DB_BACKUP_MAX_BYTES, files: 1 },
});

router.post('/backup/restore', requireRole('admin'), adminToolLimiter, dbRestoreUpload.single('file'), async (_req, res) => {
  return fail(
    res,
    'SQLite .db geri yükleme kaldırıldı. PostgreSQL için Supabase Dashboard → SQL Editor / Backups kullanın, veya sunucuda pg_restore çalıştırın.',
    400,
  );
});

router.post('/tools/cache-clear', requireRole('admin'), adminToolLimiter, async (_req, res) => {
  clearCache();
  return ok(res, { message: 'Cache temizlendi' });
});

router.post('/tools/sitemap', requireRole('admin'), adminToolLimiter, async (_req, res) => {
  const result = runAdminScript('scripts/generate-sitemap.js');
  if (result.error) {
    return fail(res, result.error.message || 'Sitemap hatası', 500);
  }
  if (result.status !== 0) {
    return fail(res, (result.stderr || result.stdout || 'Sitemap hatası').slice(0, 500), 500);
  }
  return ok(res, { message: 'Sitemap yenilendi' });
});

router.post('/tools/validate', requireRole('admin'), adminToolLimiter, async (_req, res) => {
  const result = runAdminScript('scripts/validate-places.js');
  if (result.error) {
    return fail(res, result.error.message || 'Doğrulama hatası', 500);
  }
  if (result.status !== 0) {
    return fail(res, (result.stderr || result.stdout || 'Doğrulama hatası').slice(0, 500), 500);
  }
  return ok(res, { output: (result.stdout || '').slice(0, 2000) });
});

async function mapAdminBlog(row) {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    authorName: row.author_name || row.user_name,
    category: row.category,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    body: row.body,
    imageUrl: row.image_url,
    placeId: row.place_id,
    tags: await blogDb.parseTagsStored(row.tags),
    featured: !!row.featured,
    status: row.status,
    publishedAt: row.published_at,
    createdAt: row.created_at,
  };
}

/* ── Blog page settings ── */
router.get('/blog-page', checkPermission('admin.content'), async (_req, res) => {
  return ok(res, { page: await settingsService.getBlogPageSettings() });
});

router.put('/blog-page', checkPermission('admin.content'), async (req, res) => {
  const page = await settingsService.setBlogPageSettings(req.body?.page || req.body || {});
  return ok(res, { page });
});

/* ── Blog categories ── */
router.get('/blog-categories', checkPermission('admin.content'), async (req, res) => {
  const categories = await blogDb.listBlogCategories({ includeInactive: req.query.all === '1' });
  return ok(res, { categories });
});

router.post('/blog-categories', checkPermission('admin.content'), async (req, res) => {
  try {
    const category = await blogDb.createBlogCategory(req.body || {});
    logAdmin(req, 'blog_category.create', 'blog_category', category.id, category.nameTr || category.slug || null);
    return ok(res, { category }, 201);
  } catch (err) {
    return fail(res, err.message || 'Blog kategorisi eklenemedi');
  }
});

router.put('/blog-categories/:id', checkPermission('admin.content'), async (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  try {
    const category = await blogDb.updateBlogCategory(id, req.body || {});
    if (!category) return fail(res, 'Kategori bulunamadı', 404);
    logAdmin(req, 'blog_category.update', 'blog_category', id, category.nameTr || category.slug || null);
    return ok(res, { category });
  } catch (err) {
    return fail(res, err.message || 'Kategori güncellenemedi');
  }
});

router.delete('/blog-categories/:id', checkPermission('admin.content'), async (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const reassignTo = req.body?.reassignTo || req.query.reassignTo;
  const preview = (await blogDb.listBlogCategories({ includeInactive: true })).find((c) => c.id === id);
  const result = await blogDb.deleteBlogCategory(id, { reassignTo });
  if (!result.ok) return fail(res, result.error, result.postCount ? 409 : 404);
  logAdmin(req, 'blog_category.delete', 'blog_category', id, preview?.nameTr || preview?.slug || null);
  return ok(res, result);
});

/* ── Blogs CRUD ── */
router.get('/blogs/scheduled', checkPermission('admin.content'), async (_req, res) => {
  const published = await blogScheduler.publishDueBlogs();
  const blogs = await blogScheduler.listScheduled();
  return ok(res, { blogs, published });
});

router.get('/blogs', checkPermission('admin.content'), async (req, res) => {
  await blogScheduler.publishDueBlogs();
  const { status, category, q } = req.query;
  const params = [];
  let where = 'WHERE 1=1';
  if (status && status !== 'all') {
    where += ' AND b.status = ?';
    params.push(status);
  }
  if (category && category !== 'all') {
    where += ' AND b.category = ?';
    params.push(category);
  }
  if (q && String(q).trim()) {
    where += ' AND (b.title LIKE ? OR b.slug LIKE ? OR b.excerpt LIKE ?)';
    const like = `%${sanitizeText(q, 80)}%`;
    params.push(like, like, like);
  }
  const rows = await db.prepare(`
    SELECT b.*, u.name AS user_name FROM blogs b
    JOIN users u ON u.id = b.user_id
    ${where}
    ORDER BY b.featured DESC, COALESCE(b.published_at, b.created_at) DESC
  `).all(...params);
  return ok(res, { blogs: await Promise.all(rows.map(mapAdminBlog)) });
});

router.post('/blogs', checkPermission('admin.content'), async (req, res) => {
  const {
    title, excerpt, body: bodyText, category, imageUrl, placeId,
    slug, tags, featured, authorName, status, userId, publishedAt: rawPublishedAt,
  } = req.body || {};
  const cleanTitle = sanitizeText(title, 200);
  const cleanBody = sanitizeText(bodyText, 20000);
  if (!cleanTitle || !cleanBody) return fail(res, 'Başlık ve içerik zorunlu');
  const cleanExcerpt = sanitizeText(excerpt || cleanBody, 500);
  const baseSlug = sanitizeText(slug, 120) || await blogDb.slugify(cleanTitle) || `blog-${Date.now()}`;
  const uniqueSlug = await blogDb.uniqueBlogSlug(db, baseSlug);
  let nextStatus = ['pending', 'approved', 'rejected', 'draft'].includes(status) ? status : 'approved';
  const publishedAtInput = blogScheduler.normalizePublishedAt(rawPublishedAt);
  let publishedAt = null;
  if (publishedAtInput && blogScheduler.isFutureDate(publishedAtInput)) {
    publishedAt = publishedAtInput;
    if (nextStatus === 'approved') nextStatus = 'draft';
  } else if (nextStatus === 'approved') {
    publishedAt = publishedAtInput || new Date().toISOString();
  } else if (publishedAtInput) {
    publishedAt = publishedAtInput;
  }
  const info = await db.prepare(`
    INSERT INTO blogs (
      user_id, category, title, slug, excerpt, body, image_url, place_id,
      tags, featured, author_name, status, published_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId ? Number(userId) : req.user.id,
    category || 'guide',
    cleanTitle,
    uniqueSlug,
    cleanExcerpt,
    cleanBody,
    imageUrl || null,
    placeId ? Number(placeId) : null,
    await blogDb.serializeTags(tags),
    featured ? 1 : 0,
    authorName ? sanitizeText(authorName, 80) : null,
    nextStatus,
    publishedAt,
  );
  const row = await db.prepare(`
    SELECT b.*, u.name AS user_name FROM blogs b
    JOIN users u ON u.id = b.user_id WHERE b.id = ?
  `).get(info.lastInsertRowid);
  logAdmin(req, 'blog.create', 'blog', info.lastInsertRowid, cleanTitle);
  return ok(res, { blog: mapAdminBlog(row) }, 201);
});

router.get('/blogs/:id', checkPermission('admin.content'), async (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const row = await db.prepare(`
    SELECT b.*, u.name AS user_name FROM blogs b
    JOIN users u ON u.id = b.user_id WHERE b.id = ?
  `).get(id);
  if (!row) return fail(res, 'Blog bulunamadı', 404);
  return ok(res, { blog: mapAdminBlog(row) });
});

router.put('/blogs/:id', checkPermission('admin.content'), async (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const existing = await db.prepare('SELECT * FROM blogs WHERE id = ?').get(id);
  if (!existing) return fail(res, 'Blog bulunamadı', 404);
  const {
    title, excerpt, body: bodyText, category, imageUrl, status,
    slug, tags, featured, authorName, placeId, publishedAt: rawPublishedAt,
  } = req.body || {};
  const cleanTitle = title != null ? sanitizeText(title, 200) : existing.title;
  const cleanBody = bodyText != null ? sanitizeText(bodyText, 20000) : existing.body;
  if (!cleanTitle || !cleanBody) return fail(res, 'Başlık ve içerik zorunlu');
  const cleanExcerpt = excerpt != null ? sanitizeText(excerpt, 500) : existing.excerpt;
  const nextStatus = status && ['pending', 'approved', 'rejected', 'draft'].includes(status)
    ? status
    : existing.status;
  let nextSlug = existing.slug;
  if (slug != null) {
    const base = sanitizeText(slug, 120) || await blogDb.slugify(cleanTitle);
    nextSlug = await blogDb.uniqueBlogSlug(db, base, id);
  } else if (!nextSlug) {
    nextSlug = await blogDb.uniqueBlogSlug(db, await blogDb.slugify(cleanTitle) || `blog-${id}`, id);
  }
  let publishedAt = existing.published_at;
  if (rawPublishedAt !== undefined) {
    publishedAt = blogScheduler.normalizePublishedAt(rawPublishedAt);
  }
  if (publishedAt && blogScheduler.isFutureDate(publishedAt) && nextStatus === 'approved') {
    nextStatus = 'draft';
  }
  if (nextStatus === 'approved' && existing.status !== 'approved') {
    if (!publishedAt || !blogScheduler.isFutureDate(publishedAt)) {
      publishedAt = publishedAt || new Date().toISOString();
    }
  } else if (nextStatus !== 'approved' && rawPublishedAt === null) {
    publishedAt = null;
  }
  await db.prepare(`
    UPDATE blogs SET
      category = ?, title = ?, slug = ?, excerpt = ?, body = ?, image_url = ?,
      place_id = ?, tags = ?, featured = ?, author_name = ?, status = ?, published_at = ?
    WHERE id = ?
  `).run(
    category || existing.category,
    cleanTitle,
    nextSlug,
    cleanExcerpt,
    cleanBody,
    imageUrl != null ? (imageUrl || null) : existing.image_url,
    placeId != null ? (placeId ? Number(placeId) : null) : existing.place_id,
    tags != null ? await blogDb.serializeTags(tags) : existing.tags,
    featured != null ? (featured ? 1 : 0) : existing.featured,
    authorName != null ? (authorName ? sanitizeText(authorName, 80) : null) : existing.author_name,
    nextStatus,
    publishedAt,
    id,
  );
  const row = await db.prepare(`
    SELECT b.*, u.name AS user_name FROM blogs b
    JOIN users u ON u.id = b.user_id WHERE b.id = ?
  `).get(id);
  logAdmin(req, 'blog.update', 'blog', id, cleanTitle);
  return ok(res, { blog: mapAdminBlog(row) });
});

router.delete('/blogs/:id', checkPermission('admin.content'), async (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const existing = await db.prepare('SELECT id FROM blogs WHERE id = ?').get(id);
  if (!existing) return fail(res, 'Blog bulunamadı', 404);
  await db.prepare('DELETE FROM blogs WHERE id = ?').run(id);
  logAdmin(req, 'blog.delete', 'blog', id, null);
  return ok(res, { deleted: true });
});

async function enrichReportRow(row) {
  const content = await reportMod.getTargetContent(row.target_type, row.target_id);
  return mapReport({
    ...row,
    target_label: content?.label || `#${row.target_id}`,
    target_user_id: content?.userId || null,
    target_user_name: content?.userName || null,
    target_content_status: content?.status || null,
    target_content_preview: content?.preview || null,
  });
}

async function fetchReportRow(id) {
  return await db.prepare(`
    SELECT r.*,
           COALESCE(rep.name, 'Silinmiş kullanıcı') AS reporter_name,
           res.name AS resolved_by_name
    FROM reports r
    LEFT JOIN users rep ON rep.id = r.reporter_id
    LEFT JOIN users res ON res.id = r.resolved_by
    WHERE r.id = ?
  `).get(id);
}

router.get('/reports', checkPermission('admin.moderate'), async (req, res) => {
  const status = String(req.query.status || 'all');
  const params = [];
  let where = 'WHERE 1=1';
  if (status === 'pending') {
    where += " AND r.status IN ('pending', 'reviewed')";
  } else if (status === 'resolved') {
    where += " AND r.status IN ('resolved_dismissed', 'resolved_removed', 'dismissed', 'actioned')";
  }
  const rows = await db.prepare(`
    SELECT r.*,
           COALESCE(rep.name, 'Silinmiş kullanıcı') AS reporter_name,
           res.name AS resolved_by_name
    FROM reports r
    LEFT JOIN users rep ON rep.id = r.reporter_id
    LEFT JOIN users res ON res.id = r.resolved_by
    ${where}
    ORDER BY r.created_at DESC
    LIMIT 200
  `).all(...params);
  return ok(res, { reports: await Promise.all(rows.map(enrichReportRow)) });
});

router.get('/reports/:id', checkPermission('admin.moderate'), async (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const row = await fetchReportRow(id);
  if (!row) return fail(res, 'Şikayet bulunamadı', 404);
  return ok(res, { report: enrichReportRow(row) });
});

router.post('/reports/:id/resolve-remove', checkPermission('admin.moderate'), async (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const reason = sanitizeText(req.body?.reason, 1000);
  if (!reason) return fail(res, 'Kaldırma nedeni gerekli', 400);

  const row = await db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
  if (!row) return fail(res, 'Şikayet bulunamadı', 404);

  const content = await reportMod.getTargetContent(row.target_type, row.target_id);
  if (!content) return fail(res, 'Şikayet edilen içerik bulunamadı', 404);

  if (await reportMod.isResolvedStatus(row.status) && row.action_taken === 'content_removed') {
    return fail(res, 'Bu şikayet zaten içerik kaldırılarak çözüldü', 409);
  }

  if (await reportMod.isResolvedStatus(row.status) && row.action_taken === 'dismissed') {
    await reportMod.restoreReportedContent(row);
  }

  const removal = await reportMod.removeReportedContent(content, req.user.id, reason);
  if (!removal.ok) return fail(res, removal.error, 400);

  if (!removal.alreadyRemoved) {
    await reportMod.notifyContentOwnerRemoved(content, reason);
  }

  await reportMod.setReportRemoved(id, req.user.id, reason, removal.prevStatus);
  logAdmin(req, 'report.resolve_remove', 'report', id, reason);
  const updated = await fetchReportRow(id);
  return ok(res, { report: enrichReportRow(updated), contentRemoved: !removal.alreadyRemoved });
});

router.post('/reports/:id/dismiss', checkPermission('admin.moderate'), async (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const note = sanitizeText(req.body?.note, 1000) || null;

  const row = await db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
  if (!row) return fail(res, 'Şikayet bulunamadı', 404);

  if (await reportMod.isResolvedStatus(row.status) && row.action_taken === 'dismissed') {
    return fail(res, 'Bu şikayet zaten göz ardı edildi', 409);
  }

  if (await reportMod.isResolvedStatus(row.status) && row.action_taken === 'content_removed') {
    await reportMod.restoreReportedContent(row);
  }

  await reportMod.setReportDismissed(id, req.user.id, note);
  logAdmin(req, 'report.dismiss', 'report', id, note);
  const updated = await fetchReportRow(id);
  return ok(res, { report: enrichReportRow(updated) });
});

router.post('/reports/:id/reopen', checkPermission('admin.moderate'), async (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;

  const row = await db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
  if (!row) return fail(res, 'Şikayet bulunamadı', 404);
  if (!await reportMod.isResolvedStatus(row.status) && row.status !== reportMod.REPORT_STATUSES.REVIEWED) {
    return fail(res, 'Yalnızca çözülmüş şikayetler yeniden açılabilir', 409);
  }

  if (row.action_taken === 'content_removed') {
    await reportMod.restoreReportedContent(row);
  }

  await reportMod.clearReportResolution(id);
  logAdmin(req, 'report.reopen', 'report', id, null);
  const updated = await fetchReportRow(id);
  return ok(res, { report: enrichReportRow(updated) });
});

router.post('/reports/:id/change-decision', checkPermission('admin.moderate'), async (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const decision = String(req.body?.decision || '').trim();
  const reason = sanitizeText(req.body?.reason, 1000);
  const note = sanitizeText(req.body?.note, 1000) || null;

  if (!['dismiss', 'remove'].includes(decision)) {
    return fail(res, 'Geçersiz karar (dismiss veya remove)', 400);
  }

  const row = await db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
  if (!row) return fail(res, 'Şikayet bulunamadı', 404);
  if (!await reportMod.isResolvedStatus(row.status)) {
    return fail(res, 'Karar değişikliği yalnızca çözülmüş şikayetlerde yapılabilir', 409);
  }

  if (decision === 'dismiss') {
    if (row.action_taken === 'content_removed') {
      await reportMod.restoreReportedContent(row);
    }
    await reportMod.setReportDismissed(id, req.user.id, note || row.resolution_reason);
    logAdmin(req, 'report.change_decision', 'report', id, 'dismiss');
    const updated = await fetchReportRow(id);
    return ok(res, { report: enrichReportRow(updated) });
  }

  if (!reason) return fail(res, 'İçerik kaldırma nedeni gerekli', 400);

  const content = await reportMod.getTargetContent(row.target_type, row.target_id);
  if (!content) return fail(res, 'Şikayet edilen içerik bulunamadı', 404);

  const removal = await reportMod.removeReportedContent(content, req.user.id, reason);
  if (!removal.ok) return fail(res, removal.error, 400);

  if (!removal.alreadyRemoved) {
    await reportMod.notifyContentOwnerRemoved(content, reason);
  }

  await reportMod.setReportRemoved(id, req.user.id, reason, removal.prevStatus);
  logAdmin(req, 'report.change_decision', 'report', id, `remove: ${reason}`);
  const updated = await fetchReportRow(id);
  return ok(res, { report: enrichReportRow(updated), contentRemoved: !removal.alreadyRemoved });
});

router.patch('/reports/:id', checkPermission('admin.moderate'), async (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const row = await db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
  if (!row) return fail(res, 'Şikayet bulunamadı', 404);

  const status = String(req.body?.status || '').trim();
  const allowed = ['reviewed', 'resolved_dismissed', 'resolved_removed', 'dismissed', 'actioned'];
  if (!allowed.includes(status)) return fail(res, 'Geçersiz durum', 400);

  const normalized = await reportMod.normalizeReportStatus(status);
  await db.prepare(`
    UPDATE reports SET status = ?, resolved_by = ?, resolved_at = datetime('now')
    WHERE id = ?
  `).run(normalized === 'reviewed' ? 'reviewed' : normalized, req.user.id, id);
  logAdmin(req, 'report.status_change', 'report', id, status);

  const updated = await fetchReportRow(id);
  return ok(res, { report: enrichReportRow(updated) });
});

router.get('/audit-log', async (req, res) => {
  const isAdmin = req.user?.role === 'admin';
  const isStaffViewer = ['moderator', 'staff', 'editor'].includes(req.user?.role);
  if (!isAdmin && !isStaffViewer) {
    return fail(res, 'Yetki yok', 403);
  }
  let adminId = req.query.adminId;
  if (!isAdmin) {
    adminId = String(req.user.id);
  }
  const data = await auditLog.list({
    page: req.query.page,
    limit: req.query.limit,
    action: req.query.action,
    adminId,
    targetType: req.query.targetType,
    dateFrom: req.query.dateFrom,
    dateTo: req.query.dateTo,
  });
  return ok(res, { ...data, scope: isAdmin ? 'all' : 'self' });
});

router.get('/banned-words', requireRole('admin'), async (_req, res) => {
  const rows = await db.prepare(`
    SELECT bw.id, bw.word, bw.created_at, u.name AS added_by_name
    FROM banned_words bw
    LEFT JOIN users u ON u.id = bw.added_by
    ORDER BY bw.word ASC
  `).all();
  return ok(res, {
    words: rows.map((r) => ({
      id: r.id,
      word: r.word,
      addedByName: r.added_by_name,
      createdAt: r.created_at,
    })),
  });
});

router.post('/banned-words', requireRole('admin'), async (req, res) => {
  const word = sanitizeText(req.body?.word, 80)?.toLowerCase().trim();
  if (!word || word.length < 2) return fail(res, 'Kelime en az 2 karakter olmalı');
  try {
    const info = await db.prepare('INSERT INTO banned_words (word, added_by) VALUES (?, ?)').run(word, req.user.id);
    contentFilter.invalidateCache();
    logAdmin(req, 'banned_word.add', 'banned_word', info.lastInsertRowid, word);
    return ok(res, { id: info.lastInsertRowid, word }, 201);
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return fail(res, 'Kelime zaten listede', 409);
    return fail(res, err.message || 'Eklenemedi');
  }
});

router.delete('/banned-words/:id', requireRole('admin'), async (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const row = await db.prepare('SELECT word FROM banned_words WHERE id = ?').get(id);
  if (!row) return fail(res, 'Kelime bulunamadı', 404);
  await db.prepare('DELETE FROM banned_words WHERE id = ?').run(id);
  contentFilter.invalidateCache();
  logAdmin(req, 'banned_word.delete', 'banned_word', id, row.word);
  return ok(res, { deleted: true });
});

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

function scanUploadsDir(dir, baseRel, placeIdFilter, q, acc) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      const subRel = baseRel ? `${baseRel}/${ent.name}` : ent.name;
      if (/^\d+$/.test(ent.name)) {
        const pid = Number(ent.name);
        if (placeIdFilter && pid !== placeIdFilter) continue;
      }
      scanUploadsDir(full, subRel, placeIdFilter, q, acc);
      continue;
    }
    const ext = path.extname(ent.name).toLowerCase();
    if (!IMAGE_EXT.has(ext)) continue;
    const relPath = baseRel ? `${baseRel}/${ent.name}` : ent.name;
    const urlPath = `/uploads/${relPath.replace(/\\/g, '/')}`;
    let linkedPlaceId = null;
    const placeMatch = relPath.match(/^(\d+)\//);
    if (placeMatch) linkedPlaceId = Number(placeMatch[1]);
    if (placeIdFilter && linkedPlaceId !== placeIdFilter) continue;
    if (q && !ent.name.toLowerCase().includes(q.toLowerCase()) && !relPath.toLowerCase().includes(q.toLowerCase())) {
      continue;
    }
    let size = 0;
    try { size = fs.statSync(full).size; } catch { /* ignore */ }
    acc.push({
      path: relPath.replace(/\\/g, '/'),
      url: urlPath,
      filename: ent.name,
      placeId: linkedPlaceId,
      sizeBytes: size,
      modifiedAt: fs.statSync(full).mtime.toISOString(),
    });
  }
}

router.get('/media', checkPermission('admin.places', 'admin.content'), async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query, 24);
  const q = sanitizeText(req.query.q, 80);
  const placeId = Number(req.query.placeId);
  const placeIdFilter = Number.isFinite(placeId) && placeId > 0 ? placeId : null;

  const all = [];
  if (supabaseStorage.isEnabled()) {
    try {
      const objects = await supabaseStorage.listAllObjects('', 1000);
      for (const obj of objects) {
        if (!obj || obj.id == null && !obj.name) continue;
        if (obj.metadata && obj.metadata.mimetype && !String(obj.metadata.mimetype).startsWith('image/')) continue;
        const name = obj.name;
        if (!name || name.endsWith('/')) continue;
        const ext = path.extname(name).toLowerCase();
        if (ext && !IMAGE_EXT.has(ext)) continue;
        const relPath = name.replace(/\\/g, '/');
        if (/-\d+w\.webp$/i.test(relPath)) continue;
        let linkedPlaceId = null;
        const placeMatch = relPath.match(/^(?:places\/)?(\d+)\//);
        if (placeMatch) linkedPlaceId = Number(placeMatch[1]);
        if (placeIdFilter && linkedPlaceId !== placeIdFilter) continue;
        if (q && !name.toLowerCase().includes(q.toLowerCase())) continue;
        all.push({
          path: relPath,
          url: publicImageUrl(relPath),
          filename: path.posix.basename(relPath),
          placeId: linkedPlaceId,
          sizeBytes: Number(obj.metadata?.size || obj.metadata?.contentLength || 0),
          modifiedAt: obj.updated_at || obj.created_at || new Date().toISOString(),
        });
      }
    } catch (err) {
      logger.warn({ msg: 'Storage media list failed', err: err.message });
    }
  } else {
    scanUploadsDir(uploadRoot, '', placeIdFilter, q, all);
  }
  all.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
  const total = all.length;
  const totalBytes = all.reduce((sum, f) => sum + (f.sizeBytes || 0), 0);
  const items = all.slice(offset, offset + limit);

  return ok(res, { items, total, page, limit, totalBytes });
});

router.delete('/media', checkPermission('admin.places', 'admin.content'), async (req, res) => {
  const relPath = String(req.body?.path || '').trim().replace(/\\/g, '/');
  if (!relPath || relPath.includes('..') || relPath.startsWith('/')) {
    return fail(res, 'Geçersiz dosya yolu', 400);
  }

  const normalized = path.normalize(relPath).replace(/\\/g, '/');
  if (normalized.startsWith('..')) return fail(res, 'Geçersiz dosya yolu', 400);

  if (!supabaseStorage.isEnabled()) {
    const fullPath = path.join(uploadRoot, normalized);
    const resolved = path.resolve(fullPath);
    const rootResolved = path.resolve(uploadRoot);
    if (!resolved.startsWith(rootResolved + path.sep) && resolved !== rootResolved) {
      return fail(res, 'Geçersiz dosya yolu', 400);
    }
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      return fail(res, 'Dosya bulunamadı', 404);
    }
  }

  const urlPath = publicImageUrl(normalized) || `/uploads/${normalized.replace(/\\/g, '/')}`;
  const placeMatch = normalized.match(/^(?:places\/)?(\d+)\//);
  if (placeMatch) {
    const placeId = Number(placeMatch[1]);
    const row = await db.prepare('SELECT id, photos, image_url FROM places WHERE id = ?').get(placeId);
    if (row) {
      let photos = [];
      try { photos = JSON.parse(row.photos || '[]'); } catch { photos = []; }
      const nextPhotos = photos.filter((u) => u !== urlPath && !String(u).endsWith(`/${path.posix.basename(normalized)}`));
      let nextImage = row.image_url;
      if (nextImage === urlPath || String(nextImage || '').endsWith(`/${path.posix.basename(normalized)}`)) {
        nextImage = nextPhotos[0] || null;
      }
      await db.prepare('UPDATE places SET photos = ?, image_url = ? WHERE id = ?').run(
        JSON.stringify(nextPhotos),
        nextImage,
        placeId,
      );
      clearCache('places-list');
      clearCache('search');
    }
  }

  await deleteStoredImage(normalized);
  logAdmin(req, 'media.delete', 'media', null, normalized);
  return ok(res, { deleted: true, path: normalized });
});

router.get('/moderation/risk', checkPermission('admin.moderate'), async (_req, res) => {
  const pendingUsers = await db.prepare(`
    SELECT DISTINCT u.id, u.name, u.email, u.created_at, u.risk_score
    FROM users u JOIN tiolas t ON t.user_id = u.id WHERE t.status = 'pending'
    LIMIT 50
  `).all();
  const scored = [];
  for (const u of pendingUsers) {
    scored.push({
      ...u,
      riskScore: await computeUserRiskScore(u.id),
    });
  }
  scored.sort((a, b) => b.riskScore - a.riskScore);
  return ok(res, { users: scored });
});

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE'
      ? 'Yedek dosyası en fazla 100 MB olabilir'
      : (err.message || 'Yükleme hatası');
    return fail(res, msg, 400);
  }
  if (err?.message === 'Yalnızca .db dosyası yüklenebilir') {
    return fail(res, err.message, 400);
  }
  return next(err);
});

module.exports = router;
