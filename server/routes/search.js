const express = require('express');
const { query, validationResult } = require('express-validator');
const { db, placeStats } = require('../db');
const { mapPlaceRow } = require('../lib/place-map');
const { normalizeSearch, matchesQuery } = require('../lib/search-normalize');
const { matchesFilterGroup } = require('../lib/place-content');
const { searchLimiter } = require('../middleware/rateLimit');

const router = express.Router();

function mapPlace(row) {
  return mapPlaceRow(row, placeStats(row.id));
}

function filterAndSort(req) {
  const {
    q, category, group, country, city, sort,
  } = req.query;
  const qNorm = q ? normalizeSearch(String(q)) : '';
  let rows = db.prepare('SELECT * FROM places').all();
  if (qNorm) rows = rows.filter((r) => matchesQuery(mapPlace(r), qNorm));
  if (group && group !== 'all') {
    rows = rows.filter((r) => matchesFilterGroup(mapPlace(r).categories, group));
  } else if (category && category !== 'all') {
    rows = rows.filter((r) => r.category === category || (mapPlace(r).categories || []).includes(category));
  }
  if (country) rows = rows.filter((r) => r.country === country);
  if (city) rows = rows.filter((r) => r.city === city);
  let places = rows.map(mapPlace);
  if (sort === 'az') places.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  else if (sort === 'popularity') places.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  else places.sort((a, b) => (b.tiolaRating || 0) - (a.tiolaRating || 0));
  return { places, qNorm };
}

router.get('/', searchLimiter, [
  query('q').optional().trim(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
  const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 48);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const { places, qNorm } = filterAndSort(req);
  const page = places.slice(offset, offset + limit);
  res.json({
    places: page,
    total: places.length,
    limit,
    offset,
    query: req.query.q || '',
    osmHint: qNorm && !places.length,
  });
});

module.exports = router;
