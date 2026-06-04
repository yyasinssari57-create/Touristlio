const express = require('express');
const { validationResult } = require('express-validator');
const { db } = require('../db');
const { authOptional, authRequired } = require('../middleware/auth');
const { normalizeSearch, matchesQuery } = require('../lib/search-normalize');
const { cacheKey, wrap } = require('../lib/cache');
const { findNearbyPlaces, findSimilarPlaces } = require('../lib/geo');
const { getWeather } = require('../services/weatherService');
const { currencyForCountry, timezoneForCountry, parseEntryFeeTry } = require('../lib/currency');
const { getLiveData } = require('../services/liveDataService');
const placesService = require('../modules/places/places.service');

const router = express.Router();
const { mapPlace } = placesService;

function validationError(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: errors.array()[0].msg });
    return true;
  }
  return false;
}

function searchHandler(req, res) {
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
}

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
  if (['meta', 'map', 'search', 'saved', 'cities'].includes(req.params.id)) {
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

module.exports = { router, searchHandler, validationError };
