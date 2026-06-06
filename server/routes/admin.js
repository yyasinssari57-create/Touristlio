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
const { parsePositiveInt } = require('../lib/sanitize');
const catalogDb = require('../lib/catalog-db');
const adminPlace = require('../lib/admin-place');
const placesService = require('../modules/places/places.service');
const { ok, fail } = require('../lib/apiResponse');

const SCRIPT_TIMEOUT_MS = 120000;
const router = express.Router();
router.use(authRequired, requireRole('admin', 'moderator'));

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

router.get('/pending/tiolas', (_req, res) => {
  const rows = db.prepare(`
    SELECT t.*, u.name AS user_name, p.name AS place_name
    FROM tiolas t
    JOIN users u ON u.id = t.user_id
    LEFT JOIN places p ON p.id = t.place_id
    WHERE t.status = 'pending'
    ORDER BY t.created_at ASC
  `).all();
  return ok(res, { items: rows.map(mapPendingTiola) });
});

router.get('/pending/blogs', (_req, res) => {
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

router.post('/tiolas/:id/approve', (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  db.prepare(`
    UPDATE tiolas SET status = 'approved', moderated_by = ?, moderated_at = datetime('now')
    WHERE id = ? AND status IN ('pending', 'spam')
  `).run(req.user.id, id);
  return ok(res, { approved: true });
});

router.post('/tiolas/:id/reject', (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  db.prepare(`
    UPDATE tiolas SET status = 'rejected', moderated_by = ?, moderated_at = datetime('now')
    WHERE id = ? AND status IN ('pending', 'spam')
  `).run(req.user.id, id);
  return ok(res, { rejected: true });
});

router.post('/blogs/:id/approve', (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  db.prepare(`
    UPDATE blogs SET status = 'approved', moderated_by = ?, moderated_at = datetime('now')
    WHERE id = ? AND status = 'pending'
  `).run(req.user.id, id);
  return ok(res, { approved: true });
});

router.post('/blogs/:id/reject', (req, res) => {
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

router.post('/categories', checkPermission('admin.categories'), (req, res) => {
  try {
    const category = catalogDb.createCategory(req.body || {});
    placesService.invalidatePlacesCache();
    clearCache('search');
    return ok(res, { category }, 201);
  } catch (err) {
    return fail(res, err.message || 'Kategori eklenemedi');
  }
});

router.put('/categories/reorder', checkPermission('admin.categories'), (req, res) => {
  try {
    const categories = catalogDb.reorderCategories(req.body?.orderedIds || req.body?.ids);
    placesService.invalidatePlacesCache();
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
    placesService.invalidatePlacesCache();
    clearCache('search');
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
  placesService.invalidatePlacesCache();
  clearCache('search');
  return ok(res, result);
});

/* ── Users & roles (admin only) ── */
router.get('/users', requireRole('admin'), (_req, res) => {
  const rows = db.prepare(`
    SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC LIMIT 200
  `).all();
  return ok(res, {
    users: rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      createdAt: r.created_at,
    })),
  });
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
