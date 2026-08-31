const express = require('express');
const { query, validationResult } = require('express-validator');
const { mapPlaceRow } = require('../lib/place-map');
const { normalizeSearch } = require('../lib/search-normalize');
const { matchesFilterGroup } = require('../lib/place-content');
const { searchLimiter } = require('../middleware/rateLimit');
const { cacheKey, wrap } = require('../lib/cache');
const { getStatsMap, STATS_CACHE_TTL } = require('../lib/stats-cache');
const { searchPlacesRows } = require('../lib/places-search');
const { parseListPagination, paginationMeta } = require('../lib/pagination');

const router = express.Router();

function mapPlace(row) {
  const stats = getStatsMap().get(row.id) || { tiolaCount: 0, tiolaRating: null };
  return mapPlaceRow(row, stats);
}

function filterAndSort(req) {
  const {
    q, category, group, country, city, sort,
  } = req.query;
  const qNorm = q ? normalizeSearch(String(q)) : '';
  const categoryFilter = category && category !== 'all' ? String(category) : undefined;

  let rows = searchPlacesRows({ q, country, city, category: categoryFilter });

  if (group && group !== 'all') {
    rows = rows.filter((r) => matchesFilterGroup(mapPlace(r).categories, group));
  }

  let places = rows.map(mapPlace);
  const minScore = Number(req.query.score || req.query.minTiola);
  if (Number.isFinite(minScore) && minScore > 0) {
    places = places.filter((p) => p.tiolaRating != null && p.tiolaRating >= minScore);
  }
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

  const { page, limit, offset } = parseListPagination(req.query, { defaultLimit: 20, maxLimit: 48 });
  const key = cacheKey('search-route', { ...req.query, page, limit, offset });

  const payload = wrap(key, () => {
    const { places, qNorm } = filterAndSort(req);
    const slice = places.slice(offset, offset + limit);
    const meta = paginationMeta({
      total: places.length,
      page,
      limit,
      offset,
      count: slice.length,
    });
    return {
      places: slice,
      ...meta,
      query: req.query.q || '',
      osmHint: qNorm && !places.length,
    };
  }, STATS_CACHE_TTL);

  res.json(payload);
});

module.exports = router;
