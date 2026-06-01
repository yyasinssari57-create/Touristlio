const express = require('express');
const { db } = require('../db');
const { authRequired, requireRole } = require('../middleware/auth');
const { createUser, findUserByEmail, sanitizeUser } = require('../auth');

const router = express.Router();
router.use(authRequired, requireRole('admin', 'moderator'));

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
    imageUrl, entryFee, bestTime,
    description, history, tips, tags, searchAliases, isLocal,
  } = req.body || {};
  if (!name || !country || !city || !category) {
    return res.status(400).json({ error: 'Ad, ülke, şehir ve kategori zorunlu' });
  }
  const maxId = db.prepare('SELECT MAX(id) AS m FROM places').get().m || 0;
  const id = maxId + 1;
  db.prepare(`
    INSERT INTO places
    (id, name, location, country, city, district, category, google_rating, google_count,
     image_url, is_local, entry_fee, best_time, description, history, tips, tags, search_aliases)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    name,
    location || `${city}, ${country}`,
    country,
    city,
    district || city,
    category,
    null,
    null,
    imageUrl || 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=600&q=80',
    isLocal ? 1 : 0,
    entryFee || 'Ücretli',
    bestTime || 'Sabah erken',
    description || name,
    history || '',
    tips || '',
    JSON.stringify(tags || []),
    JSON.stringify(searchAliases || []),
  );
  res.status(201).json({ id, name });
});

router.get('/stats', (_req, res) => {
  const stats = {
    users: db.prepare('SELECT COUNT(*) AS c FROM users').get().c,
    places: db.prepare('SELECT COUNT(*) AS c FROM places').get().c,
    tiolasApproved: db.prepare("SELECT COUNT(*) AS c FROM tiolas WHERE status = 'approved'").get().c,
    tiolasPending: db.prepare("SELECT COUNT(*) AS c FROM tiolas WHERE status = 'pending'").get().c,
    blogsPending: db.prepare("SELECT COUNT(*) AS c FROM blogs WHERE status = 'pending'").get().c,
  };
  res.json(stats);
});

module.exports = router;
