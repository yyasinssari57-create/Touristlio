const express = require('express');
const { db, placeStats } = require('../db');
const { authOptional, authRequired } = require('../middleware/auth');
const { normalizeSearch, matchesQuery } = require('../lib/search-normalize');
const { resolvePlaceImageUrl } = require('../lib/place-image');

const router = express.Router();

function mapPlace(row) {
  const stats = placeStats(row.id);
  let searchAliases = [];
  try {
    searchAliases = JSON.parse(row.search_aliases || '[]');
  } catch {
    searchAliases = [];
  }
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    country: row.country,
    city: row.city,
    district: row.district,
    category: row.category,
    imageUrl: resolvePlaceImageUrl(row.image_url, row.category, row.id),
    isLocal: !!row.is_local,
    entryFee: row.entry_fee,
    entryFeeEn: row.entry_fee_en,
    bestTime: row.best_time,
    bestTimeEn: row.best_time_en,
    description: row.description,
    descriptionEn: row.description_en,
    history: row.history,
    historyEn: row.history_en,
    tips: row.tips,
    tipsEn: row.tips_en,
    tags: JSON.parse(row.tags || '[]'),
    searchAliases,
    tiolaRating: stats.tiolaRating,
    tiolaCount: stats.tiolaCount,
  };
}

router.get('/', authOptional, (req, res) => {
  const {
    q, category, country, city, district, localOnly, entry, sort, minTiola,
  } = req.query;

  let rows = db.prepare('SELECT * FROM places').all();
  const qNorm = q ? normalizeSearch(q) : '';

  if (qNorm) {
    rows = rows.filter((row) => matchesQuery(mapPlace(row), qNorm));
  }
  if (category && category !== 'all') {
    rows = rows.filter((r) => r.category === category);
  }
  if (country) {
    rows = rows.filter((r) => r.country === country);
  }
  if (city) {
    rows = rows.filter((r) => r.city === city || r.city?.toLowerCase() === String(city).toLowerCase());
  }
  if (district) {
    rows = rows.filter((r) => r.district === district);
  }
  if (localOnly === '1') {
    rows = rows.filter((r) => r.is_local === 1);
  }
  if (entry === 'free') {
    rows = rows.filter((r) => r.entry_fee && r.entry_fee.includes('Ücretsiz'));
  } else if (entry === 'paid') {
    rows = rows.filter((r) => r.entry_fee && !r.entry_fee.includes('Ücretsiz'));
  }

  let places = rows.map(mapPlace);

  if (minTiola) {
    const min = Number(minTiola);
    places = places.filter((p) => p.tiolaRating != null && p.tiolaRating >= min);
  }

  if (sort === 'reviewed') {
    places.sort((a, b) => (b.tiolaCount || 0) - (a.tiolaCount || 0));
  } else if (sort === 'local') {
    places.sort((a, b) => (b.isLocal ? 1 : 0) - (a.isLocal ? 1 : 0));
  } else if (sort === 'az') {
    places.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    places.sort((a, b) => (b.tiolaRating || 0) - (a.tiolaRating || 0));
  }

  res.json({
    places,
    count: places.length,
    osmHint: qNorm && places.length === 0,
  });
});

router.get('/saved/all', authRequired, (req, res) => {
  const rows = db.prepare(`
    SELECT p.* FROM saved_places sp
    JOIN places p ON p.id = sp.place_id
    WHERE sp.user_id = ?
    ORDER BY sp.created_at DESC
  `).all(req.user.id);
  res.json({ places: rows.map(mapPlace) });
});

router.get('/:id', authOptional, (req, res) => {
  const row = db.prepare('SELECT * FROM places WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Yer bulunamadı' });
  const place = mapPlace(row);
  const nearby = db.prepare(`
    SELECT * FROM places WHERE country = ? AND id != ? LIMIT 3
  `).all(row.country, row.id).map(mapPlace);
  res.json({ place, nearby });
});

router.get('/:id/saved', authRequired, (req, res) => {
  const saved = db.prepare(`
    SELECT 1 FROM saved_places WHERE user_id = ? AND place_id = ?
  `).get(req.user.id, req.params.id);
  res.json({ saved: !!saved });
});

router.post('/:id/save', authRequired, (req, res) => {
  db.prepare(`
    INSERT OR IGNORE INTO saved_places (user_id, place_id) VALUES (?, ?)
  `).run(req.user.id, req.params.id);
  res.json({ saved: true });
});

router.delete('/:id/save', authRequired, (req, res) => {
  db.prepare('DELETE FROM saved_places WHERE user_id = ? AND place_id = ?').run(req.user.id, req.params.id);
  res.json({ saved: false });
});

module.exports = router;
