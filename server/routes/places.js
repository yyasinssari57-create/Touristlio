const express = require('express');
const { query, validationResult } = require('express-validator');
const { db, placeStats } = require('../db');
const { authOptional, authRequired } = require('../middleware/auth');
const { normalizeSearch, matchesQuery } = require('../lib/search-normalize');
const { matchesFilterGroup } = require('../lib/place-content');
const { mapPlaceRow, mapMarker } = require('../lib/place-map');
const { cacheKey, wrap } = require('../lib/cache');
const { searchLimiter } = require('../middleware/rateLimit');
const { findNearbyPlaces, findSimilarPlaces } = require('../lib/geo');
const { getWeather } = require('../services/weatherService');
const { currencyForCountry, timezoneForCountry, parseEntryFeeTry } = require('../lib/currency');
const { getLiveData } = require('../services/liveDataService');

const router = express.Router();

function mapPlace(row) {
  return mapPlaceRow(row, placeStats(row.id));
}

function validationError(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: errors.array()[0].msg });
    return true;
  }
  return false;
}

function filterPlaces(rows, queryParams) {
  const {
    q, category, group, country, city, district, localOnly, entry, minTiola,
  } = queryParams;
  const qNorm = q ? normalizeSearch(q) : '';
  let filtered = rows;

  if (qNorm) {
    filtered = filtered.filter((row) => matchesQuery(mapPlace(row), qNorm));
  }
  if (group && group !== 'all') {
    filtered = filtered.filter((r) => {
      const p = mapPlace(r);
      return matchesFilterGroup(p.categories, group);
    });
  } else if (category && category !== 'all') {
    filtered = filtered.filter((r) => {
      const cats = mapPlace(r).categories;
      return r.category === category || (cats || []).includes(category);
    });
  }
  if (country) {
    filtered = filtered.filter((r) => r.country === country);
  }
  if (city) {
    filtered = filtered.filter((r) => r.city === city || r.city?.toLowerCase() === String(city).toLowerCase());
  }
  if (district) {
    filtered = filtered.filter((r) => r.district === district);
  }
  if (localOnly === '1') {
    filtered = filtered.filter((r) => r.is_local === 1);
  }
  if (entry === 'free') {
    filtered = filtered.filter((r) => r.entry_fee && r.entry_fee.includes('Ücretsiz'));
  } else if (entry === 'paid') {
    filtered = filtered.filter((r) => r.entry_fee && !r.entry_fee.includes('Ücretsiz'));
  }

  let places = filtered.map(mapPlace);

  if (minTiola) {
    const min = Number(minTiola);
    places = places.filter((p) => p.tiolaRating != null && p.tiolaRating >= min);
  }

  return { places, qNorm };
}

function sortPlaces(places, sort) {
  const list = [...places];
  if (sort === 'reviewed') {
    list.sort((a, b) => (b.tiolaCount || 0) - (a.tiolaCount || 0));
  } else if (sort === 'local') {
    list.sort((a, b) => (b.isLocal ? 1 : 0) - (a.isLocal ? 1 : 0));
  } else if (sort === 'az') {
    list.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  } else if (sort === 'popularity') {
    list.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  } else {
    list.sort((a, b) => (b.tiolaRating || 0) - (a.tiolaRating || 0));
  }
  return list;
}

router.get('/meta/categories', (_req, res) => {
  res.json({
    groups: ['cities', 'historical', 'nature', 'museums', 'restaurants', 'hotels', 'activities'],
    legacy: ['landmark', 'museum', 'restaurant', 'cafe', 'beach', 'nature', 'park', 'viewpoint', 'religious', 'market', 'shopping', 'nightlife', 'adventure', 'spa', 'hotel', 'city'],
  });
});

router.get('/search', searchLimiter, [
  query('q').trim().notEmpty().withMessage('Arama terimi gerekli'),
], (req, res) => {
  if (validationError(req, res)) return;
  const q = req.query.q.trim();
  const limit = Math.min(Number(req.query.limit) || 8, 20);
  const key = cacheKey('search', { q, limit });
  const result = wrap(key, () => {
    const rows = db.prepare('SELECT * FROM places').all();
    const qNorm = normalizeSearch(q);
    const matches = rows
      .filter((row) => matchesQuery(mapPlace(row), qNorm))
      .slice(0, limit)
      .map(mapPlace);
    return { places: matches, count: matches.length };
  });
  res.json(result);
});

router.get('/map/markers', authOptional, (req, res) => {
  const { city, country, category, group, q } = req.query;
  let rows = db.prepare('SELECT * FROM places WHERE lat IS NOT NULL AND lng IS NOT NULL').all();
  if (!rows.length) rows = db.prepare('SELECT * FROM places').all();

  const { places } = filterPlaces(rows, req.query);
  const lang = req.query.lang === 'en' ? 'en' : 'tr';
  res.json({ markers: places.slice(0, 500).map((p) => mapMarker(p, lang)) });
});

router.get('/', authOptional, (req, res) => {
  const { sort } = req.query;
  const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const cacheParams = { ...req.query, limit, offset };
  const key = cacheKey('places-list', cacheParams);

  const payload = wrap(key, () => {
    const rows = db.prepare('SELECT * FROM places').all();
    let { places, qNorm } = filterPlaces(rows, req.query);
    places = sortPlaces(places, sort);
    const total = places.length;
    const page = places.slice(offset, offset + limit);
    return {
      places: page,
      count: page.length,
      total,
      limit,
      offset,
      osmHint: qNorm && total === 0,
    };
  });

  res.json(payload);
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

router.get('/:id', authOptional, async (req, res) => {
  if (['meta', 'map', 'search', 'saved'].includes(req.params.id)) {
    return res.status(404).json({ error: 'Not found' });
  }
  const row = db.prepare('SELECT * FROM places WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Yer bulunamadı' });
  const place = mapPlace(row);
  const allRows = db.prepare('SELECT * FROM places').all();
  const nearby = findNearbyPlaces(allRows, row, mapPlace, 6);
  const similar = findSimilarPlaces(allRows, row, mapPlace, 6);
  const lang = req.query.lang === 'en' ? 'en' : 'tr';
  let weather = null;
  try {
    weather = await getWeather(place.lat, place.lng, lang);
  } catch {
    weather = { fallback: true, label: lang === 'en' ? 'Unavailable' : 'Mevcut değil' };
  }
  const cur = currencyForCountry(place.country);
  const tz = place.timezone || timezoneForCountry(place.country);
  const entryTry = parseEntryFeeTry(place.entryFee);
  const affiliateEnabled = process.env.AFFILIATE_ENABLED === 'true';
  const liveData = getLiveData(place.id, row, mapPlace);
  res.json({
    place: {
      ...place,
      affiliateHotelUrl: affiliateEnabled ? place.affiliateHotelUrl : null,
      affiliateBookingUrl: affiliateEnabled ? place.affiliateBookingUrl : null,
    },
    nearby,
    similar,
    weather,
    localInfo: {
      timezone: tz,
      currency: cur,
      entryTryEstimate: entryTry,
      localTime: new Date().toLocaleString(lang === 'en' ? 'en-GB' : 'tr-TR', { timeZone: tz }),
    },
    liveData,
  });
});

router.get('/:id/weather', authOptional, async (req, res) => {
  const row = db.prepare('SELECT lat, lng FROM places WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Yer bulunamadı' });
  const lang = req.query.lang === 'en' ? 'en' : 'tr';
  const weather = await getWeather(row.lat, row.lng, lang);
  res.json(weather);
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
