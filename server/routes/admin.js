const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { db } = require('../db');
const { authRequired, requireRole } = require('../middleware/auth');
const { createUser, findUserByEmail, sanitizeUser } = require('../auth');
const { clear: clearCache } = require('../lib/cache');
const { computeUserRiskScore, checkPermission } = require('../middleware/rbac');
const { spawnSync } = require('child_process');
const { adminToolLimiter } = require('../middleware/rateLimit');
const { parsePositiveInt, sanitizeText } = require('../lib/sanitize');
const notifications = require('../lib/notifications');
const { sendTiolaRejectionEmail, sendBlogRejectionEmail } = require('../lib/mailer');
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
const { imageFileFilter, validateUploadedImage } = require('../lib/image-mime');

const SCRIPT_TIMEOUT_MS = 120000;
const router = express.Router();
router.use(authRequired, requireRole('admin', 'moderator', 'editor'));

const uploadRoot = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadRoot)) fs.mkdirSync(uploadRoot, { recursive: true });

function placeUploadDir(placeId) {
  const dir = path.join(uploadRoot, String(placeId));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    cb(null, placeUploadDir(req.params.id));
  },
  filename(_req, file, cb) {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 10 },
  fileFilter: imageFileFilter,
});
function mapPendingTiola(row) {
  return {
    id: row.id,
    userName: row.user_name,
    placeName: row.place_name || '(Genel Tiola)',
    stars: row.stars,
    text: row.text,
    photoUrl: row.photo_path ? `/uploads/${row.photo_path}` : null,
    cityTag: row.city_tag,
    status: row.status,
    createdAt: row.created_at,
  };
}

router.get('/pending/tiolas', checkPermission('admin.moderate'), (_req, res) => {
  const rows = db.prepare(`
    SELECT t.*, u.name AS user_name, p.name AS place_name
    FROM tiolas t
    JOIN users u ON u.id = t.user_id
    LEFT JOIN places p ON p.id = t.place_id
    WHERE t.status IN ('pending', 'spam')
    ORDER BY t.created_at ASC
  `).all();
  return ok(res, { items: rows.map(mapPendingTiola) });
});

router.get('/pending/blogs', checkPermission('admin.content'), (_req, res) => {
  const rows = db.prepare(`
    SELECT b.*, u.name AS user_name FROM blogs b
    JOIN users u ON u.id = b.user_id
    WHERE b.status = 'pending'
    ORDER BY b.created_at ASC
  `).all();
  return ok(res, {
    items: rows.map((r) => ({
      id: r.id,
      userName: r.user_name,
      title: r.title,
      excerpt: r.excerpt,
      createdAt: r.created_at,
    })),
  });
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

router.post('/tiolas/:id/approve', checkPermission('admin.moderate'), (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  db.prepare(`
    UPDATE tiolas SET status = 'approved', moderated_by = ?, moderated_at = datetime('now')
    WHERE id = ? AND status IN ('pending', 'spam')
  `).run(req.user.id, id);
  return ok(res, { approved: true });
});

router.get('/approved/tiolas', checkPermission('admin.moderate'), (req, res) => {
  const q = sanitizeText(req.query.q, 80);
  const params = [];
  let where = "WHERE t.status = 'approved' AND t.parent_id IS NULL";
  if (q) {
    where += ' AND (t.text LIKE ? OR u.name LIKE ? OR p.name LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  const rows = db.prepare(`
    SELECT t.*, u.name AS user_name, p.name AS place_name
    FROM tiolas t
    JOIN users u ON u.id = t.user_id
    LEFT JOIN places p ON p.id = t.place_id
    ${where}
    ORDER BY t.created_at DESC
    LIMIT 100
  `).all(...params);
  return ok(res, { items: rows.map(mapPendingTiola) });
});

router.post('/tiolas/:id/remove', checkPermission('admin.moderate'), async (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const reason = sanitizeText(req.body?.reason, 1000);
  if (!reason) return fail(res, 'Kaldırma nedeni gerekli');

  const row = db.prepare(`
    SELECT t.*, u.email AS user_email, u.name AS user_name, p.name AS place_name
    FROM tiolas t
    JOIN users u ON u.id = t.user_id
    LEFT JOIN places p ON p.id = t.place_id
    WHERE t.id = ?
  `).get(id);
  if (!row) return fail(res, 'Tiola bulunamadı', 404);
  if (row.status !== 'approved') return fail(res, 'Yalnızca yayında olan Tiola kaldırılabilir', 409);

  db.prepare(`
    UPDATE tiolas SET status = 'rejected', moderated_by = ?, moderated_at = datetime('now'), rejection_reason = ?
    WHERE id = ? AND status = 'approved'
  `).run(req.user.id, reason, id);

  const placeLabel = row.place_name || row.city_tag || 'Genel Tiola';
  notifications.createNotification({
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

  return ok(res, { removed: true, rejectionReason: reason });
});

router.post('/tiolas/:id/reject', checkPermission('admin.moderate'), async (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const reason = sanitizeText(req.body?.reason, 1000);
  if (!reason) return fail(res, 'Red nedeni gerekli');

  const row = db.prepare(`
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

  db.prepare(`
    UPDATE tiolas SET status = 'rejected', moderated_by = ?, moderated_at = datetime('now'), rejection_reason = ?
    WHERE id = ? AND status IN ('pending', 'spam')
  `).run(req.user.id, reason, id);

  const placeLabel = row.place_name || row.city_tag || 'Genel Tiola';
  notifications.createNotification({
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

  return ok(res, { rejected: true, rejectionReason: reason });
});

router.post('/blogs/:id/approve', checkPermission('admin.content'), (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  db.prepare(`
    UPDATE blogs SET status = 'approved', moderated_by = ?, moderated_at = datetime('now'),
      published_at = COALESCE(published_at, datetime('now'))
    WHERE id = ? AND status = 'pending'
  `).run(req.user.id, id);
  return ok(res, { approved: true });
});

router.get('/approved/blogs', checkPermission('admin.content'), (req, res) => {
  const q = sanitizeText(req.query.q, 80);
  const params = [];
  let where = "WHERE b.status = 'approved'";
  if (q) {
    where += ' AND (b.title LIKE ? OR b.excerpt LIKE ? OR u.name LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  const rows = db.prepare(`
    SELECT b.*, u.name AS user_name FROM blogs b
    JOIN users u ON u.id = b.user_id
    ${where}
    ORDER BY datetime(COALESCE(b.published_at, b.created_at)) DESC
    LIMIT 100
  `).all(...params);
  return ok(res, {
    items: rows.map((r) => ({
      id: r.id,
      userName: r.user_name,
      title: r.title,
      excerpt: r.excerpt,
      slug: r.slug,
      publishedAt: r.published_at,
      createdAt: r.created_at,
    })),
  });
});

router.post('/blogs/:id/remove', checkPermission('admin.content'), async (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const reason = sanitizeText(req.body?.reason, 1000);
  if (!reason) return fail(res, 'Kaldırma nedeni gerekli');

  const row = db.prepare(`
    SELECT b.*, u.email AS user_email, u.name AS user_name
    FROM blogs b
    JOIN users u ON u.id = b.user_id
    WHERE b.id = ?
  `).get(id);
  if (!row) return fail(res, 'Blog bulunamadı', 404);
  if (row.status !== 'approved') return fail(res, 'Yalnızca yayında olan blog kaldırılabilir', 409);

  db.prepare(`
    UPDATE blogs SET status = 'rejected', moderated_by = ?, moderated_at = datetime('now'),
      rejection_reason = ?, published_at = NULL
    WHERE id = ? AND status = 'approved'
  `).run(req.user.id, reason, id);

  notifications.createNotification({
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

  return ok(res, { removed: true, rejectionReason: reason });
});

router.post('/blogs/:id/reject', checkPermission('admin.content'), async (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const reason = sanitizeText(req.body?.reason, 1000);
  if (!reason) return fail(res, 'Red nedeni gerekli');

  const row = db.prepare(`
    SELECT b.*, u.email AS user_email, u.name AS user_name
    FROM blogs b
    JOIN users u ON u.id = b.user_id
    WHERE b.id = ?
  `).get(id);
  if (!row) return fail(res, 'Blog bulunamadı', 404);
  if (row.status !== 'pending') return fail(res, 'Bu blog zaten işlendi', 409);

  db.prepare(`
    UPDATE blogs SET status = 'rejected', moderated_by = ?, moderated_at = datetime('now'), rejection_reason = ?
    WHERE id = ? AND status = 'pending'
  `).run(req.user.id, reason, id);

  notifications.createNotification({
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

  return ok(res, { rejected: true, rejectionReason: reason });
});

router.post('/moderators', requireRole('admin'), (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return fail(res, 'Ad, e-posta ve şifre gerekli');
  }
  if (findUserByEmail(email)) {
    return fail(res, 'E-posta zaten kayıtlı', 409);
  }
  const user = createUser({ name, email, password, role: 'moderator' });
  return ok(res, { user: sanitizeUser(user) }, 201);
});

/* ── Places CRUD ── */
router.get('/places', checkPermission('admin.places'), (req, res) => {
  try {
    const q = req.query.q || '';
    const limit = Number(req.query.limit) || 100;
    const offset = Number(req.query.offset) || 0;
    const data = adminPlace.listAdminPlaces({ q, limit, offset, includeArchived: req.query.all === '1' });
    return ok(res, data);
  } catch (err) {
    return fail(res, err.message || 'Yerler getirilemedi', 500);
  }
});

router.get('/places/:id', checkPermission('admin.places'), (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const place = adminPlace.getAdminPlace(id);
  if (!place) return fail(res, 'Yer bulunamadı', 404);
  return ok(res, { place });
});

router.post('/places', checkPermission('admin.places'), (req, res) => {
  try {
    const created = adminPlace.insertPlace(req.body || {});
    clearCache('places-list');
    clearCache('search');
    return ok(res, created, 201);
  } catch (err) {
    return fail(res, err.message || 'Yer eklenemedi');
  }
});

router.put('/places/:id', checkPermission('admin.places'), (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  try {
    const updated = adminPlace.updatePlace(id, req.body || {});
    if (!updated) return fail(res, 'Yer bulunamadı', 404);
    clearCache('places-list');
    clearCache('search');
    return ok(res, { place: updated });
  } catch (err) {
    return fail(res, err.message || 'Yer güncellenemedi');
  }
});

router.delete('/places/:id', checkPermission('admin.places'), (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const preview = adminPlace.getAdminPlace(id);
  if (!preview) return fail(res, 'Yer bulunamadı', 404);
  const result = adminPlace.deletePlace(id);
  clearCache('places-list');
  clearCache('search');
  return ok(res, result);
});

function isExternalPhotoUrl(url) {
  const u = String(url || '').trim();
  return /^https?:\/\//i.test(u) && !/\/uploads\//i.test(u);
}

router.post('/places/:id/photos', checkPermission('admin.places'), upload.array('photos', 10), validateUploadedImage(), (req, res) => {
  const placeId = parsePositiveInt(req.params.id, res);
  if (!placeId) return;
  const row = db.prepare('SELECT * FROM places WHERE id = ?').get(placeId);
  if (!row) return fail(res, 'Yer bulunamadı', 404);
  if (!req.files?.length) return fail(res, 'Görsel gerekli', 400);

  const newUrls = (req.files || []).map((f) => `/uploads/${placeId}/${f.filename}`);
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
  db.prepare('UPDATE places SET photos = ?, image_url = ? WHERE id = ?').run(
    JSON.stringify(photos),
    imageUrl,
    placeId,
  );
  clearCache('places-list');
  clearCache('search');
  return ok(res, { photos, imageUrl, uploaded: newUrls.length });
});

const mediaRoot = path.join(uploadRoot, 'media');
if (!fs.existsSync(mediaRoot)) fs.mkdirSync(mediaRoot, { recursive: true });

const mediaUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, mediaRoot),
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: imageFileFilter,
});

router.post('/media', checkPermission('admin.places', 'admin.cities'), mediaUpload.single('image'), validateUploadedImage(), (req, res) => {
  if (!req.file) return fail(res, 'Görsel gerekli', 400);
  const url = `/uploads/media/${req.file.filename}`;
  return ok(res, { url });
});

/* ── Cities CRUD ── */
router.get('/cities', checkPermission('admin.cities'), (req, res) => {
  try {
    const cities = catalogDb.listCities({ includeInactive: req.query.all === '1' });
    return ok(res, { cities });
  } catch (err) {
    return fail(res, err.message || 'Şehirler getirilemedi', 500);
  }
});

router.get('/cities/:id', checkPermission('admin.cities'), (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const city = catalogDb.getCityById(id);
  if (!city) return fail(res, 'Şehir bulunamadı', 404);
  return ok(res, { city });
});

router.post('/cities', checkPermission('admin.cities'), (req, res) => {
  try {
    const city = catalogDb.createCity(req.body || {});
    clearCache('places-list');
    return ok(res, { city }, 201);
  } catch (err) {
    return fail(res, err.message || 'Şehir eklenemedi');
  }
});

router.put('/cities/:id', checkPermission('admin.cities'), (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  try {
    const city = catalogDb.updateCity(id, req.body || {});
    if (!city) return fail(res, 'Şehir bulunamadı', 404);
    clearCache('places-list');
    clearCache('search');
    return ok(res, { city });
  } catch (err) {
    return fail(res, err.message || 'Şehir güncellenemedi');
  }
});

router.delete('/cities/:id', checkPermission('admin.cities'), (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const result = catalogDb.deleteCity(id, { hard: true });
  if (!result.ok) return fail(res, result.error, result.error?.includes('kayıtlı') ? 409 : 404);
  clearCache('places-list');
  return ok(res, result);
});

/* ── Categories CRUD ── */
router.get('/categories', checkPermission('admin.categories'), (req, res) => {
  try {
    const categories = catalogDb.listCategories({ includeInactive: req.query.all === '1' });
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

router.post('/categories', checkPermission('admin.categories'), (req, res) => {
  try {
    const category = catalogDb.createCategory(req.body || {});
    invalidateCategoryCaches();
    return ok(res, { category }, 201);
  } catch (err) {
    return fail(res, err.message || 'Kategori eklenemedi');
  }
});

router.put('/categories/reorder', checkPermission('admin.categories'), (req, res) => {
  try {
    const categories = catalogDb.reorderCategories(req.body?.orderedIds || req.body?.ids);
    invalidateCategoryCaches();
    return ok(res, { categories });
  } catch (err) {
    return fail(res, err.message || 'Sıralama güncellenemedi');
  }
});

router.put('/categories/:id', checkPermission('admin.categories'), (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  try {
    const category = catalogDb.updateCategory(id, req.body || {});
    if (!category) return fail(res, 'Kategori bulunamadı', 404);
    invalidateCategoryCaches();
    return ok(res, { category });
  } catch (err) {
    return fail(res, err.message || 'Kategori güncellenemedi');
  }
});

router.delete('/categories/:id', checkPermission('admin.categories'), (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const reassignTo = req.body?.reassignTo || req.query.reassignTo;
  const result = catalogDb.deleteCategory(id, { reassignTo });
  if (!result.ok) return fail(res, result.error, result.placeCount ? 409 : 404);
  invalidateCategoryCaches();
  return ok(res, result);
});

/* ── Users & roles (admin only) ── */
router.get('/users', requireRole('admin'), (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const total = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const rows = db.prepare(`
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

router.get('/users/:id', requireRole('admin'), (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const row = db.prepare(`
    SELECT id, name, email, role, email_verified, is_blocked, avatar_color, avatar_url, avatar_preset,
           risk_score, created_at, failed_login_count, locked_until
    FROM users WHERE id = ?
  `).get(id);
  if (!row) return fail(res, 'Kullanıcı bulunamadı', 404);

  const tiolaCount = db.prepare('SELECT COUNT(*) AS c FROM tiolas WHERE user_id = ?').get(id).c;
  const tiolaApproved = db.prepare("SELECT COUNT(*) AS c FROM tiolas WHERE user_id = ? AND status = 'approved'").get(id).c;
  const tiolaPending = db.prepare("SELECT COUNT(*) AS c FROM tiolas WHERE user_id = ? AND status = 'pending'").get(id).c;
  const tiolaRejected = db.prepare("SELECT COUNT(*) AS c FROM tiolas WHERE user_id = ? AND status = 'rejected'").get(id).c;
  const tiolaSpam = db.prepare("SELECT COUNT(*) AS c FROM tiolas WHERE user_id = ? AND status = 'spam'").get(id).c;
  const blogCount = db.prepare('SELECT COUNT(*) AS c FROM blogs WHERE user_id = ?').get(id).c;
  const blogApproved = db.prepare("SELECT COUNT(*) AS c FROM blogs WHERE user_id = ? AND status = 'approved'").get(id).c;
  const blogPending = db.prepare("SELECT COUNT(*) AS c FROM blogs WHERE user_id = ? AND status = 'pending'").get(id).c;
  const blogRejected = db.prepare("SELECT COUNT(*) AS c FROM blogs WHERE user_id = ? AND status = 'rejected'").get(id).c;
  const reportCount = db.prepare('SELECT COUNT(*) AS c FROM reports WHERE reporter_id = ?').get(id).c;
  const reportedCount = db.prepare(`
    SELECT COUNT(*) AS c FROM reports
    WHERE (target_type = 'profile' AND target_id = ?)
       OR (target_type = 'tiola' AND target_id IN (SELECT id FROM tiolas WHERE user_id = ?))
       OR (target_type = 'blog' AND target_id IN (SELECT id FROM blogs WHERE user_id = ?))
  `).get(id, id, id).c;
  const recentTiolas = db.prepare(`
    SELECT t.id, t.text, t.status, t.stars, t.place_id, t.created_at, t.moderated_at, t.rejection_reason,
           p.name AS place_name, m.name AS moderated_by_name
    FROM tiolas t
    LEFT JOIN places p ON p.id = t.place_id
    LEFT JOIN users m ON m.id = t.moderated_by
    WHERE t.user_id = ? AND t.parent_id IS NULL
    ORDER BY t.created_at DESC LIMIT 15
  `).all(id);
  const recentBlogs = db.prepare(`
    SELECT b.id, b.title, b.status, b.created_at, b.published_at, b.moderated_at, b.rejection_reason,
           m.name AS moderated_by_name
    FROM blogs b
    LEFT JOIN users m ON m.id = b.moderated_by
    WHERE b.user_id = ?
    ORDER BY b.created_at DESC LIMIT 10
  `).all(id);
  const reportsMade = db.prepare(`
    SELECT r.id, r.target_type, r.target_id, r.reason, r.note, r.status, r.created_at,
           r.action_taken, r.resolution_reason, r.resolved_at, res.name AS resolved_by_name
    FROM reports r
    LEFT JOIN users res ON res.id = r.resolved_by
    WHERE r.reporter_id = ?
    ORDER BY r.created_at DESC LIMIT 50
  `).all(id);
  const reportsReceived = db.prepare(`
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
  const pendingProfileChanges = db.prepare(`
    SELECT id, change_type, payload, status, created_at, rejection_reason
    FROM profile_change_requests
    WHERE user_id = ? AND status = 'pending'
    ORDER BY created_at DESC
  `).all(id).map((pcr) => {
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
  const profileChangeHistory = db.prepare(`
    SELECT id, change_type, payload, status, created_at, reviewed_at, rejection_reason
    FROM profile_change_requests
    WHERE user_id = ?
    ORDER BY created_at DESC LIMIT 10
  `).all(id).map((pcr) => {
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
  const moderationHistory = db.prepare(`
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
  const savedPlacesCount = db.prepare('SELECT COUNT(*) AS c FROM saved_places WHERE user_id = ?').get(id).c;
  const visitedCount = db.prepare('SELECT COUNT(*) AS c FROM visited_places WHERE user_id = ?').get(id).c;

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
      riskScore: row.risk_score || 0,
      createdAt: row.created_at,
      failedLoginCount: row.failed_login_count || 0,
      lockedUntil: row.locked_until || null,
      likeCount: getUserTiolaLikeCount(id),
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

router.get('/profile-changes', requireRole('admin'), (_req, res) => {
  return ok(res, { requests: profileChanges.listPending() });
});

router.post('/profile-changes/:id/approve', requireRole('admin'), (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const result = profileChanges.approve(id, req.user.id);
  if (!result.ok) return fail(res, result.error, result.error?.includes('bulunamadı') ? 404 : 409);
  const row = db.prepare('SELECT user_id FROM profile_change_requests WHERE id = ?').get(id);
  if (row) {
    notifications.createNotification({
      userId: row.user_id,
      type: 'profile_approved',
      title: 'Profil güncellemesi onaylandı',
      body: 'Profil değişikliğiniz yayına alındı.',
      link: '/profile',
    });
  }
  return ok(res, { approved: true });
});

router.post('/profile-changes/:id/reject', requireRole('admin'), (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const reason = sanitizeText(req.body?.reason, 500) || 'Reddedildi';
  const result = profileChanges.reject(id, req.user.id, reason);
  if (!result.ok) return fail(res, result.error, result.error?.includes('bulunamadı') ? 404 : 409);
  const row = db.prepare('SELECT user_id FROM profile_change_requests WHERE id = ?').get(id);
  if (row) {
    notifications.createNotification({
      userId: row.user_id,
      type: 'profile_rejected',
      title: 'Profil güncellemesi reddedildi',
      body: reason,
      link: '/profile',
    });
  }
  return ok(res, { rejected: true, rejectionReason: reason });
});

router.put('/places/:id/info-boxes', checkPermission('admin.places'), (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const place = db.prepare('SELECT id FROM places WHERE id = ?').get(id);
  if (!place) return fail(res, 'Yer bulunamadı', 404);

  const existing = db.prepare('SELECT payload FROM place_live_data WHERE place_id = ?').get(id);
  let payload = {};
  try { payload = JSON.parse(existing?.payload || '{}'); } catch { /* ignore */ }

  payload = applyInfoBoxUpdates(payload, req.body || {});
  upsertLiveData(id, payload);
  return ok(res, { saved: true, infoBoxes: buildInfoBoxesResponse(payload) });
});

router.get('/places/:id/info-boxes', checkPermission('admin.places'), (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const row = db.prepare('SELECT payload FROM place_live_data WHERE place_id = ?').get(id);
  let payload = {};
  try { payload = JSON.parse(row?.payload || '{}'); } catch { /* ignore */ }
  return ok(res, { infoBoxes: buildInfoBoxesResponse(payload) });
});

router.post('/users/:id/block', requireRole('admin'), (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  if (id === req.user.id) return fail(res, 'Kendi hesabınızı engelleyemezsiniz', 400);

  const target = db.prepare('SELECT id, is_blocked, role FROM users WHERE id = ?').get(id);
  if (!target) return fail(res, 'Kullanıcı bulunamadı', 404);

  const blocked = req.body?.blocked === true || req.body?.blocked === 1;
  if (blocked && target.role === 'admin') {
    return fail(res, 'Yönetici hesabı engellenemez', 403);
  }
  db.prepare('UPDATE users SET is_blocked = ? WHERE id = ?').run(blocked ? 1 : 0, id);
  return ok(res, { id, blocked });
});

router.get('/roles', requireRole('admin'), (_req, res) => {
  const roles = db.prepare('SELECT slug, name FROM roles ORDER BY slug').all();
  const permissions = db.prepare('SELECT slug, name FROM permissions ORDER BY slug').all();
  const rolePermissions = db.prepare('SELECT role_slug, permission_slug FROM role_permissions').all();
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

router.get('/stats', checkPermission('admin.dashboard'), (_req, res) => {
  const stats = {
    users: db.prepare('SELECT COUNT(*) AS c FROM users').get().c,
    places: db.prepare('SELECT COUNT(*) AS c FROM places').get().c,
    tiolasApproved: db.prepare("SELECT COUNT(*) AS c FROM tiolas WHERE status = 'approved'").get().c,
    tiolasPending: db.prepare("SELECT COUNT(*) AS c FROM tiolas WHERE status = 'pending'").get().c,
    tiolasSpam: db.prepare("SELECT COUNT(*) AS c FROM tiolas WHERE status = 'spam'").get().c,
    blogsPending: db.prepare("SELECT COUNT(*) AS c FROM blogs WHERE status = 'pending'").get().c,
    travelLists: db.prepare('SELECT COUNT(*) AS c FROM travel_lists').get().c,
    visitedRecords: db.prepare('SELECT COUNT(*) AS c FROM visited_places').get().c,
  };
  return ok(res, stats);
});

router.get('/content-quality', checkPermission('admin.dashboard'), (_req, res) => {
  const total = db.prepare('SELECT COUNT(*) AS c FROM places').get().c;
  const noPhoto = db.prepare("SELECT COUNT(*) AS c FROM places WHERE photos IS NULL OR photos = '[]' OR photos = ''").get().c;
  const noFaq = db.prepare("SELECT COUNT(*) AS c FROM places WHERE faq_tr IS NULL OR faq_tr = '[]'").get().c;
  const noCoords = db.prepare('SELECT COUNT(*) AS c FROM places WHERE lat IS NULL OR lng IS NULL').get().c;
  const shortDesc = db.prepare('SELECT COUNT(*) AS c FROM places WHERE length(description) < 80').get().c;
  return ok(res, {
    total,
    issues: { noPhoto, noFaq, noCoords, shortDesc },
    score: Math.round(100 - ((noPhoto + noFaq + noCoords + shortDesc) / Math.max(total, 1)) * 25),
  });
});

router.post('/tools/cache-clear', requireRole('admin'), adminToolLimiter, (_req, res) => {
  clearCache();
  return ok(res, { message: 'Cache temizlendi' });
});

router.post('/tools/sitemap', requireRole('admin'), adminToolLimiter, (_req, res) => {
  const result = runAdminScript('scripts/generate-sitemap.js');
  if (result.error) {
    return fail(res, result.error.message || 'Sitemap hatası', 500);
  }
  if (result.status !== 0) {
    return fail(res, (result.stderr || result.stdout || 'Sitemap hatası').slice(0, 500), 500);
  }
  return ok(res, { message: 'Sitemap yenilendi' });
});

router.post('/tools/validate', requireRole('admin'), adminToolLimiter, (_req, res) => {
  const result = runAdminScript('scripts/validate-places.js');
  if (result.error) {
    return fail(res, result.error.message || 'Doğrulama hatası', 500);
  }
  if (result.status !== 0) {
    return fail(res, (result.stderr || result.stdout || 'Doğrulama hatası').slice(0, 500), 500);
  }
  return ok(res, { output: (result.stdout || '').slice(0, 2000) });
});

function mapAdminBlog(row) {
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
    tags: blogDb.parseTagsStored(row.tags),
    featured: !!row.featured,
    status: row.status,
    publishedAt: row.published_at,
    createdAt: row.created_at,
  };
}

/* ── Blog page settings ── */
router.get('/blog-page', checkPermission('admin.content'), (_req, res) => {
  return ok(res, { page: settingsService.getBlogPageSettings() });
});

router.put('/blog-page', checkPermission('admin.content'), (req, res) => {
  const page = settingsService.setBlogPageSettings(req.body?.page || req.body || {});
  return ok(res, { page });
});

/* ── Blog categories ── */
router.get('/blog-categories', checkPermission('admin.content'), (req, res) => {
  const categories = blogDb.listBlogCategories({ includeInactive: req.query.all === '1' });
  return ok(res, { categories });
});

router.post('/blog-categories', checkPermission('admin.content'), (req, res) => {
  try {
    const category = blogDb.createBlogCategory(req.body || {});
    return ok(res, { category }, 201);
  } catch (err) {
    return fail(res, err.message || 'Blog kategorisi eklenemedi');
  }
});

router.put('/blog-categories/:id', checkPermission('admin.content'), (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  try {
    const category = blogDb.updateBlogCategory(id, req.body || {});
    if (!category) return fail(res, 'Kategori bulunamadı', 404);
    return ok(res, { category });
  } catch (err) {
    return fail(res, err.message || 'Kategori güncellenemedi');
  }
});

router.delete('/blog-categories/:id', checkPermission('admin.content'), (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const reassignTo = req.body?.reassignTo || req.query.reassignTo;
  const result = blogDb.deleteBlogCategory(id, { reassignTo });
  if (!result.ok) return fail(res, result.error, result.postCount ? 409 : 404);
  return ok(res, result);
});

/* ── Blogs CRUD ── */
router.get('/blogs', checkPermission('admin.content'), (req, res) => {
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
  const rows = db.prepare(`
    SELECT b.*, u.name AS user_name FROM blogs b
    JOIN users u ON u.id = b.user_id
    ${where}
    ORDER BY b.featured DESC, datetime(COALESCE(b.published_at, b.created_at)) DESC
  `).all(...params);
  return ok(res, { blogs: rows.map(mapAdminBlog) });
});

router.post('/blogs', checkPermission('admin.content'), (req, res) => {
  const {
    title, excerpt, body: bodyText, category, imageUrl, placeId,
    slug, tags, featured, authorName, status, userId,
  } = req.body || {};
  const cleanTitle = sanitizeText(title, 200);
  const cleanBody = sanitizeText(bodyText, 20000);
  if (!cleanTitle || !cleanBody) return fail(res, 'Başlık ve içerik zorunlu');
  const cleanExcerpt = sanitizeText(excerpt || cleanBody, 500);
  const baseSlug = sanitizeText(slug, 120) || blogDb.slugify(cleanTitle) || `blog-${Date.now()}`;
  const uniqueSlug = blogDb.uniqueBlogSlug(db, baseSlug);
  const nextStatus = ['pending', 'approved', 'rejected', 'draft'].includes(status) ? status : 'approved';
  const publishedAt = nextStatus === 'approved' ? new Date().toISOString() : null;
  const info = db.prepare(`
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
    blogDb.serializeTags(tags),
    featured ? 1 : 0,
    authorName ? sanitizeText(authorName, 80) : null,
    nextStatus,
    publishedAt,
  );
  const row = db.prepare(`
    SELECT b.*, u.name AS user_name FROM blogs b
    JOIN users u ON u.id = b.user_id WHERE b.id = ?
  `).get(info.lastInsertRowid);
  return ok(res, { blog: mapAdminBlog(row) }, 201);
});

router.get('/blogs/:id', checkPermission('admin.content'), (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const row = db.prepare(`
    SELECT b.*, u.name AS user_name FROM blogs b
    JOIN users u ON u.id = b.user_id WHERE b.id = ?
  `).get(id);
  if (!row) return fail(res, 'Blog bulunamadı', 404);
  return ok(res, { blog: mapAdminBlog(row) });
});

router.put('/blogs/:id', checkPermission('admin.content'), (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const existing = db.prepare('SELECT * FROM blogs WHERE id = ?').get(id);
  if (!existing) return fail(res, 'Blog bulunamadı', 404);
  const {
    title, excerpt, body: bodyText, category, imageUrl, status,
    slug, tags, featured, authorName, placeId,
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
    const base = sanitizeText(slug, 120) || blogDb.slugify(cleanTitle);
    nextSlug = blogDb.uniqueBlogSlug(db, base, id);
  } else if (!nextSlug) {
    nextSlug = blogDb.uniqueBlogSlug(db, blogDb.slugify(cleanTitle) || `blog-${id}`, id);
  }
  let publishedAt = existing.published_at;
  if (nextStatus === 'approved' && existing.status !== 'approved') {
    publishedAt = new Date().toISOString();
  } else if (nextStatus !== 'approved') {
    publishedAt = null;
  }
  db.prepare(`
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
    tags != null ? blogDb.serializeTags(tags) : existing.tags,
    featured != null ? (featured ? 1 : 0) : existing.featured,
    authorName != null ? (authorName ? sanitizeText(authorName, 80) : null) : existing.author_name,
    nextStatus,
    publishedAt,
    id,
  );
  const row = db.prepare(`
    SELECT b.*, u.name AS user_name FROM blogs b
    JOIN users u ON u.id = b.user_id WHERE b.id = ?
  `).get(id);
  return ok(res, { blog: mapAdminBlog(row) });
});

router.delete('/blogs/:id', checkPermission('admin.content'), (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const existing = db.prepare('SELECT id FROM blogs WHERE id = ?').get(id);
  if (!existing) return fail(res, 'Blog bulunamadı', 404);
  db.prepare('DELETE FROM blogs WHERE id = ?').run(id);
  return ok(res, { deleted: true });
});

function enrichReportRow(row) {
  const content = reportMod.getTargetContent(row.target_type, row.target_id);
  return mapReport({
    ...row,
    target_label: content?.label || `#${row.target_id}`,
    target_user_id: content?.userId || null,
    target_user_name: content?.userName || null,
    target_content_status: content?.status || null,
    target_content_preview: content?.preview || null,
  });
}

function fetchReportRow(id) {
  return db.prepare(`
    SELECT r.*, rep.name AS reporter_name, res.name AS resolved_by_name
    FROM reports r
    JOIN users rep ON rep.id = r.reporter_id
    LEFT JOIN users res ON res.id = r.resolved_by
    WHERE r.id = ?
  `).get(id);
}

router.get('/reports', checkPermission('admin.moderate'), (req, res) => {
  const status = String(req.query.status || 'all');
  const params = [];
  let where = 'WHERE 1=1';
  if (status === 'pending') {
    where += " AND r.status IN ('pending', 'reviewed')";
  } else if (status === 'resolved') {
    where += " AND r.status IN ('reviewed', 'resolved_dismissed', 'resolved_removed', 'dismissed', 'actioned')";
  }
  const rows = db.prepare(`
    SELECT r.*,
           rep.name AS reporter_name,
           res.name AS resolved_by_name
    FROM reports r
    JOIN users rep ON rep.id = r.reporter_id
    LEFT JOIN users res ON res.id = r.resolved_by
    ${where}
    ORDER BY r.created_at DESC
    LIMIT 200
  `).all(...params);
  return ok(res, { reports: rows.map(enrichReportRow) });
});

router.get('/reports/:id', checkPermission('admin.moderate'), (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const row = fetchReportRow(id);
  if (!row) return fail(res, 'Şikayet bulunamadı', 404);
  return ok(res, { report: enrichReportRow(row) });
});

router.post('/reports/:id/resolve-remove', checkPermission('admin.moderate'), async (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const reason = sanitizeText(req.body?.reason, 1000);
  if (!reason) return fail(res, 'Kaldırma nedeni gerekli', 400);

  const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
  if (!row) return fail(res, 'Şikayet bulunamadı', 404);

  const content = reportMod.getTargetContent(row.target_type, row.target_id);
  if (!content) return fail(res, 'Şikayet edilen içerik bulunamadı', 404);

  if (reportMod.isResolvedStatus(row.status) && row.action_taken === 'content_removed') {
    return fail(res, 'Bu şikayet zaten içerik kaldırılarak çözüldü', 409);
  }

  if (reportMod.isResolvedStatus(row.status) && row.action_taken === 'dismissed') {
    reportMod.restoreReportedContent(row);
  }

  const removal = reportMod.removeReportedContent(content, req.user.id, reason);
  if (!removal.ok) return fail(res, removal.error, 400);

  if (!removal.alreadyRemoved) {
    await reportMod.notifyContentOwnerRemoved(content, reason);
  }

  reportMod.setReportRemoved(id, req.user.id, reason, removal.prevStatus);
  const updated = fetchReportRow(id);
  return ok(res, { report: enrichReportRow(updated), contentRemoved: !removal.alreadyRemoved });
});

router.post('/reports/:id/dismiss', checkPermission('admin.moderate'), (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const note = sanitizeText(req.body?.note, 1000) || null;

  const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
  if (!row) return fail(res, 'Şikayet bulunamadı', 404);

  if (reportMod.isResolvedStatus(row.status) && row.action_taken === 'dismissed') {
    return fail(res, 'Bu şikayet zaten göz ardı edildi', 409);
  }

  if (reportMod.isResolvedStatus(row.status) && row.action_taken === 'content_removed') {
    reportMod.restoreReportedContent(row);
  }

  reportMod.setReportDismissed(id, req.user.id, note);
  const updated = fetchReportRow(id);
  return ok(res, { report: enrichReportRow(updated) });
});

router.post('/reports/:id/reopen', checkPermission('admin.moderate'), (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;

  const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
  if (!row) return fail(res, 'Şikayet bulunamadı', 404);
  if (!reportMod.isResolvedStatus(row.status) && row.status !== reportMod.REPORT_STATUSES.REVIEWED) {
    return fail(res, 'Yalnızca çözülmüş şikayetler yeniden açılabilir', 409);
  }

  if (row.action_taken === 'content_removed') {
    reportMod.restoreReportedContent(row);
  }

  reportMod.clearReportResolution(id);
  const updated = fetchReportRow(id);
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

  const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
  if (!row) return fail(res, 'Şikayet bulunamadı', 404);
  if (!reportMod.isResolvedStatus(row.status)) {
    return fail(res, 'Karar değişikliği yalnızca çözülmüş şikayetlerde yapılabilir', 409);
  }

  if (decision === 'dismiss') {
    if (row.action_taken === 'content_removed') {
      reportMod.restoreReportedContent(row);
    }
    reportMod.setReportDismissed(id, req.user.id, note || row.resolution_reason);
    const updated = fetchReportRow(id);
    return ok(res, { report: enrichReportRow(updated) });
  }

  if (!reason) return fail(res, 'İçerik kaldırma nedeni gerekli', 400);

  const content = reportMod.getTargetContent(row.target_type, row.target_id);
  if (!content) return fail(res, 'Şikayet edilen içerik bulunamadı', 404);

  const removal = reportMod.removeReportedContent(content, req.user.id, reason);
  if (!removal.ok) return fail(res, removal.error, 400);

  if (!removal.alreadyRemoved) {
    await reportMod.notifyContentOwnerRemoved(content, reason);
  }

  reportMod.setReportRemoved(id, req.user.id, reason, removal.prevStatus);
  const updated = fetchReportRow(id);
  return ok(res, { report: enrichReportRow(updated), contentRemoved: !removal.alreadyRemoved });
});

router.patch('/reports/:id', checkPermission('admin.moderate'), (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
  if (!row) return fail(res, 'Şikayet bulunamadı', 404);

  const status = String(req.body?.status || '').trim();
  const allowed = ['reviewed', 'resolved_dismissed', 'resolved_removed', 'dismissed', 'actioned'];
  if (!allowed.includes(status)) return fail(res, 'Geçersiz durum', 400);

  const normalized = reportMod.normalizeReportStatus(status);
  db.prepare(`
    UPDATE reports SET status = ?, resolved_by = ?, resolved_at = datetime('now')
    WHERE id = ?
  `).run(normalized === 'reviewed' ? 'reviewed' : normalized, req.user.id, id);

  const updated = fetchReportRow(id);
  return ok(res, { report: enrichReportRow(updated) });
});

router.get('/moderation/risk', checkPermission('admin.moderate'), (_req, res) => {
  const pendingUsers = db.prepare(`
    SELECT DISTINCT u.id, u.name, u.email, u.created_at, u.risk_score
    FROM users u JOIN tiolas t ON t.user_id = u.id WHERE t.status = 'pending'
    LIMIT 50
  `).all();
  const scored = pendingUsers.map((u) => ({
    ...u,
    riskScore: computeUserRiskScore(u.id),
  })).sort((a, b) => b.riskScore - a.riskScore);
  return ok(res, { users: scored });
});

module.exports = router;
