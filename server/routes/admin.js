const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { db } = require('../db');
const { authRequired, requireRole } = require('../middleware/auth');
const { createUser, findUserByEmail, sanitizeUser } = require('../auth');
const { clear: clearCache } = require('../lib/cache');
const { computeUserRiskScore, checkPermission } = require('../middleware/rbac');
const { execSync } = require('child_process');

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
  res.json({ items: rows.map(mapPendingTiola) });
});

router.get('/pending/blogs', (_req, res) => {
  const rows = db.prepare(`
    SELECT b.*, u.name AS user_name FROM blogs b
    JOIN users u ON u.id = b.user_id
    WHERE b.status = 'pending'
    ORDER BY b.created_at ASC
  `).all();
  res.json({
    items: rows.map((r) => ({
      id: r.id,
      userName: r.user_name,
      title: r.title,
      excerpt: r.excerpt,
      createdAt: r.created_at,
    })),
  });
});

router.post('/tiolas/:id/approve', (req, res) => {
  db.prepare(`
    UPDATE tiolas SET status = 'approved', moderated_by = ?, moderated_at = datetime('now')
    WHERE id = ? AND status = 'pending'
  `).run(req.user.id, req.params.id);
  res.json({ ok: true });
});

router.post('/tiolas/:id/reject', (req, res) => {
  db.prepare(`
    UPDATE tiolas SET status = 'rejected', moderated_by = ?, moderated_at = datetime('now')
    WHERE id = ? AND status = 'pending'
  `).run(req.user.id, req.params.id);
  res.json({ ok: true });
});

router.post('/blogs/:id/approve', (req, res) => {
  db.prepare(`
    UPDATE blogs SET status = 'approved', moderated_by = ?, moderated_at = datetime('now')
    WHERE id = ? AND status = 'pending'
  `).run(req.user.id, req.params.id);
  res.json({ ok: true });
});

router.post('/blogs/:id/reject', (req, res) => {
  db.prepare(`
    UPDATE blogs SET status = 'rejected', moderated_by = ?, moderated_at = datetime('now')
    WHERE id = ? AND status = 'pending'
  `).run(req.user.id, req.params.id);
  res.json({ ok: true });
});

router.post('/moderators', requireRole('admin'), (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Ad, e-posta ve şifre gerekli' });
  }
  if (findUserByEmail(email)) {
    return res.status(409).json({ error: 'E-posta zaten kayıtlı' });
  }
  const user = createUser({ name, email, password, role: 'moderator' });
  res.status(201).json({ user: sanitizeUser(user) });
});

router.post('/places', requireRole('admin', 'moderator'), (req, res) => {
  const {
    name, location, country, city, district, category,
    imageUrl, entryFee, entryFeeEn, bestTime, bestTimeEn,
    description, descriptionEn, overview, overviewEn,
    history, historyEn, thingsToDo, thingsToDoEn,
    cultureFood, cultureFoodEn, travelTips, travelTipsEn,
    tips, tipsEn, tags, searchAliases, categories, isLocal, lat, lng,
  } = req.body || {};
  if (!name || !country || !city || !category) {
    return res.status(400).json({ error: 'Ad, ülke, şehir ve kategori zorunlu' });
  }
  const { enrichContentFields } = require('../lib/place-content');
  const maxId = db.prepare('SELECT MAX(id) AS m FROM places').get().m || 0;
  const id = maxId + 1;
  const enriched = enrichContentFields({
    id,
    name,
    location: location || `${city}, ${country}`,
    country,
    city,
    district: district || city,
    category,
    imageUrl: imageUrl || 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=600&q=80',
    isLocal: !!isLocal,
    entryFee: entryFee || 'Ücretli',
    entryFeeEn,
    bestTime: bestTime || 'Sabah erken',
    bestTimeEn,
    description: description || name,
    descriptionEn,
    overview,
    overviewEn,
    history: history || '',
    historyEn,
    thingsToDo,
    thingsToDoEn,
    cultureFood,
    cultureFoodEn,
    travelTips: travelTips || tips,
    travelTipsEn: travelTipsEn || tipsEn,
    tips: tips || travelTips,
    tipsEn,
    tags: tags || [],
    searchAliases: searchAliases || [],
    categories,
    lat,
    lng,
  }, id);

  db.prepare(`
    INSERT INTO places
    (id, name, location, country, city, district, category,
     image_url, is_local, entry_fee, entry_fee_en, best_time, best_time_en,
     description, description_en, overview, overview_en,
     history, history_en, things_to_do, things_to_do_en,
     culture_food, culture_food_en, travel_tips, travel_tips_en,
     how_to_get_there, how_to_get_there_en, photos,
     tips, tips_en, tags, search_aliases, categories, lat, lng, popularity)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    enriched.name,
    enriched.location,
    enriched.country,
    enriched.city,
    enriched.district,
    enriched.category,
    enriched.imageUrl,
    enriched.isLocal ? 1 : 0,
    enriched.entryFee,
    enriched.entryFeeEn || null,
    enriched.bestTime,
    enriched.bestTimeEn || null,
    enriched.description,
    enriched.descriptionEn || null,
    enriched.overview,
    enriched.overviewEn || null,
    enriched.history,
    enriched.historyEn || null,
    JSON.stringify(enriched.thingsToDo || []),
    JSON.stringify(enriched.thingsToDoEn || []),
    enriched.cultureFood || null,
    enriched.cultureFoodEn || null,
    enriched.travelTips,
    enriched.travelTipsEn || null,
    enriched.howToGetThere || null,
    enriched.howToGetThereEn || null,
    JSON.stringify(enriched.photos || (enriched.imageUrl ? [enriched.imageUrl] : [])),
    enriched.tips,
    enriched.tipsEn || null,
    JSON.stringify(enriched.tags || []),
    JSON.stringify(enriched.searchAliases || []),
    JSON.stringify(enriched.categories || [category]),
    enriched.lat,
    enriched.lng,
    0,
  );
  res.status(201).json({ id, name });
  clearCache('places-list');
  clearCache('search');
});

router.get('/users', requireRole('admin'), (_req, res) => {
  const rows = db.prepare(`
    SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC LIMIT 200
  `).all();
  res.json({
    users: rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      createdAt: r.created_at,
    })),
  });
});

router.post('/places/:id/photos', requireRole('admin', 'moderator'), upload.array('photos', 10), (req, res) => {
  const placeId = req.params.id;
  const row = db.prepare('SELECT * FROM places WHERE id = ?').get(placeId);
  if (!row) return res.status(404).json({ error: 'Yer bulunamadı' });

  const newPaths = (req.files || []).map((f) => `${placeId}/${f.filename}`);
  const existing = JSON.parse(row.photos || '[]');
  const merged = [...existing, ...newPaths.map((p) => `/uploads/${p}`)];
  db.prepare('UPDATE places SET photos = ? WHERE id = ?').run(JSON.stringify(merged), placeId);
  clearCache('places-list');
  clearCache('search');
  res.json({ photos: merged, uploaded: newPaths.length });
});

router.get('/stats', checkPermission('admin.dashboard'), (_req, res) => {
  const stats = {
    users: db.prepare('SELECT COUNT(*) AS c FROM users').get().c,
    places: db.prepare('SELECT COUNT(*) AS c FROM places').get().c,
    tiolasApproved: db.prepare("SELECT COUNT(*) AS c FROM tiolas WHERE status = 'approved'").get().c,
    tiolasPending: db.prepare("SELECT COUNT(*) AS c FROM tiolas WHERE status = 'pending'").get().c,
    blogsPending: db.prepare("SELECT COUNT(*) AS c FROM blogs WHERE status = 'pending'").get().c,
    tripPlans: db.prepare('SELECT COUNT(*) AS c FROM trip_plans').get().c,
    visitedRecords: db.prepare('SELECT COUNT(*) AS c FROM visited_places').get().c,
  };
  res.json(stats);
});

router.get('/content-quality', checkPermission('admin.dashboard'), (_req, res) => {
  const total = db.prepare('SELECT COUNT(*) AS c FROM places').get().c;
  const noPhoto = db.prepare("SELECT COUNT(*) AS c FROM places WHERE photos IS NULL OR photos = '[]' OR photos = ''").get().c;
  const noFaq = db.prepare("SELECT COUNT(*) AS c FROM places WHERE faq_tr IS NULL OR faq_tr = '[]'").get().c;
  const noCoords = db.prepare('SELECT COUNT(*) AS c FROM places WHERE lat IS NULL OR lng IS NULL').get().c;
  const shortDesc = db.prepare('SELECT COUNT(*) AS c FROM places WHERE length(description) < 80').get().c;
  res.json({
    total,
    issues: { noPhoto, noFaq, noCoords, shortDesc },
    score: Math.round(100 - ((noPhoto + noFaq + noCoords + shortDesc) / Math.max(total, 1)) * 25),
  });
});

router.post('/tools/cache-clear', requireRole('admin'), (_req, res) => {
  clearCache();
  res.json({ ok: true, message: 'Cache temizlendi' });
});

router.post('/tools/sitemap', requireRole('admin'), (_req, res) => {
  try {
    execSync('node server/scripts/generate-sitemap.js', { cwd: path.join(__dirname, '..', '..'), stdio: 'pipe' });
    res.json({ ok: true, message: 'Sitemap yenilendi' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/tools/validate', requireRole('admin'), (_req, res) => {
  try {
    const out = execSync('node server/scripts/validate-places.js', { cwd: path.join(__dirname, '..', '..'), stdio: 'pipe' }).toString();
    res.json({ ok: true, output: out.slice(0, 2000) });
  } catch (e) {
    res.status(500).json({ error: e.stderr?.toString() || e.message });
  }
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
  res.json({ users: scored });
});

module.exports = router;
