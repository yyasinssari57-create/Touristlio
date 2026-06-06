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
const { sendTiolaRejectionEmail } = require('../lib/mailer');
const catalogDb = require('../lib/catalog-db');
const blogDb = require('../lib/blog-db');
const settingsService = require('../modules/settings/settings.service');
const adminPlace = require('../lib/admin-place');
const placesService = require('../modules/places/places.service');
const { ok, fail } = require('../lib/apiResponse');
const { mapReport } = require('./reports');

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
  fileFilter(_req, file, cb) {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Yalnızca görsel yüklenebilir'));
  },
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

router.post('/blogs/:id/reject', checkPermission('admin.content'), (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  db.prepare(`
    UPDATE blogs SET status = 'rejected', moderated_by = ?, moderated_at = datetime('now')
    WHERE id = ? AND status = 'pending'
  `).run(req.user.id, id);
  return ok(res, { rejected: true });
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

router.post('/places/:id/photos', checkPermission('admin.places'), upload.array('photos', 10), (req, res) => {
  const placeId = parsePositiveInt(req.params.id, res);
  if (!placeId) return;
  const row = db.prepare('SELECT * FROM places WHERE id = ?').get(placeId);
  if (!row) return fail(res, 'Yer bulunamadı', 404);

  const newPaths = (req.files || []).map((f) => `${placeId}/${f.filename}`);
  const existing = JSON.parse(row.photos || '[]');
  const merged = [...existing, ...newPaths.map((p) => `/uploads/${p}`)];
  db.prepare('UPDATE places SET photos = ? WHERE id = ?').run(JSON.stringify(merged), placeId);
  clearCache('places-list');
  clearCache('search');
  return ok(res, { photos: merged, uploaded: newPaths.length });
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
router.get('/users', requireRole('admin'), (_req, res) => {
  const rows = db.prepare(`
    SELECT id, name, email, role, email_verified, is_blocked, created_at FROM users ORDER BY created_at DESC LIMIT 200
  `).all();
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
  });
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
  let targetLabel = `#${row.target_id}`;
  let targetUserId = null;
  let targetUserName = null;
  if (row.target_type === 'profile') {
    const u = db.prepare('SELECT id, name FROM users WHERE id = ?').get(row.target_id);
    if (u) {
      targetLabel = u.name;
      targetUserId = u.id;
      targetUserName = u.name;
    }
  } else if (row.target_type === 'tiola') {
    const t = db.prepare(`
      SELECT t.id, t.text, u.id AS uid, u.name AS uname
      FROM tiolas t JOIN users u ON u.id = t.user_id WHERE t.id = ?
    `).get(row.target_id);
    if (t) {
      targetLabel = (t.text || '').slice(0, 60) + ((t.text || '').length > 60 ? '…' : '');
      targetUserId = t.uid;
      targetUserName = t.uname;
    }
  } else if (row.target_type === 'blog') {
    const b = db.prepare(`
      SELECT b.id, b.title, u.id AS uid, u.name AS uname
      FROM blogs b JOIN users u ON u.id = b.user_id WHERE b.id = ?
    `).get(row.target_id);
    if (b) {
      targetLabel = b.title || `#${b.id}`;
      targetUserId = b.uid;
      targetUserName = b.uname;
    }
  }
  return mapReport({
    ...row,
    target_label: targetLabel,
    target_user_id: targetUserId,
    target_user_name: targetUserName,
  });
}

router.get('/reports', checkPermission('admin.moderate'), (req, res) => {
  const status = String(req.query.status || 'all');
  const params = [];
  let where = 'WHERE 1=1';
  if (status === 'pending') {
    where += " AND r.status = 'pending'";
  } else if (status === 'resolved') {
    where += " AND r.status IN ('reviewed', 'dismissed', 'actioned')";
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

router.patch('/reports/:id', checkPermission('admin.moderate'), (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
  if (!row) return fail(res, 'Şikayet bulunamadı', 404);

  const status = String(req.body?.status || '').trim();
  const allowed = ['reviewed', 'dismissed', 'actioned'];
  if (!allowed.includes(status)) return fail(res, 'Geçersiz durum', 400);

  db.prepare(`
    UPDATE reports SET status = ?, resolved_by = ?, resolved_at = datetime('now')
    WHERE id = ?
  `).run(status, req.user.id, id);

  const updated = db.prepare(`
    SELECT r.*, rep.name AS reporter_name, res.name AS resolved_by_name
    FROM reports r
    JOIN users rep ON rep.id = r.reporter_id
    LEFT JOIN users res ON res.id = r.resolved_by
    WHERE r.id = ?
  `).get(id);
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
