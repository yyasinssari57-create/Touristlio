const express = require('express');
const { validationResult } = require('express-validator');
const { db, allPlaceStats } = require('../db');
const { findPlaceRow, PLACE_PARAM_RESERVED } = require('../lib/place-lookup');
const { authOptional, authRequired } = require('../middleware/auth');
const { normalizeSearch, matchesQuery } = require('../lib/search-normalize');
const { cacheKey, wrap } = require('../lib/cache');
const { findNearbyPlaces, findSimilarPlaces } = require('../lib/geo');
const { getWeather } = require('../services/weatherService');
const { currencyForCountry, timezoneForCountry, parseEntryFeeTry } = require('../lib/currency');
const { getLiveData, getAdminPayload, mergeWeather, mergeLocalInfo, mergeInfoPanel } = require('../services/liveDataService');
const placesService = require('../modules/places/places.service');

const router = express.Router();
const { mapPlace: mapPlaceFromService } = placesService;

let legacyStatsCache = null;
let legacyStatsCacheAt = 0;

function getLegacyStats() {
  const now = Date.now();
  if (legacyStatsCache && now - legacyStatsCacheAt < 120000) return legacyStatsCache;
  legacyStatsCache = allPlaceStats();
  legacyStatsCacheAt = now;
  return legacyStatsCache;
}

function mapPlace(row) {
  return mapPlaceFromService(row, getLegacyStats());
}

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

function resolvePlaceRow(req, res) {
  const key = req.params.id;
  if (PLACE_PARAM_RESERVED.has(String(key || '').toLowerCase())) {
    res.status(404).json({ error: 'Not found' });
    return null;
  }
  const row = findPlaceRow(key);
  if (!row) {
    res.status(404).json({ error: 'Yer bulunamadı' });
    return null;
  }
  return row;
}

router.get('/:id', authOptional, async (req, res) => {
  const row = resolvePlaceRow(req, res);
  if (!row) return;
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
  const adminPayload = getAdminPayload(place.id);
  const liveData = getLiveData(place.id, row, mapPlace);
  let mergedPlace = mergeInfoPanel(place, adminPayload, lang);
  const mergedWeather = mergeWeather(weather, adminPayload);
  const mergedLocalInfo = mergeLocalInfo({
    timezone: tz,
    currency: cur,
    entryTryEstimate: entryTry,
    localTime: new Date().toLocaleString(lang === 'en' ? 'en-GB' : 'tr-TR', { timeZone: tz }),
  }, adminPayload);
  res.json({
    place: {
      ...mergedPlace,
      affiliateHotelUrl: affiliateEnabled ? mergedPlace.affiliateHotelUrl : null,
      affiliateBookingUrl: affiliateEnabled ? mergedPlace.affiliateBookingUrl : null,
    },
    nearby,
    similar,
    weather: mergedWeather,
    localInfo: mergedLocalInfo,
    liveData,
  });
});

router.get('/:id/weather', authOptional, async (req, res) => {
  const row = resolvePlaceRow(req, res);
  if (!row) return;
  const lang = req.query.lang === 'en' ? 'en' : 'tr';
  const weather = await getWeather(row.lat, row.lng, lang);
  res.json(weather);
});

router.get('/:id/saved', authRequired, (req, res) => {
  const row = resolvePlaceRow(req, res);
  if (!row) return;
  const saved = db.prepare(`
    SELECT 1 FROM saved_places WHERE user_id = ? AND place_id = ?
  `).get(req.user.id, row.id);
  res.json({ saved: !!saved });
});

router.post('/:id/save', authRequired, (req, res) => {
  const row = resolvePlaceRow(req, res);
  if (!row) return;
  db.prepare(`
    INSERT OR IGNORE INTO saved_places (user_id, place_id) VALUES (?, ?)
  `).run(req.user.id, row.id);
  res.json({ saved: true });
});

router.delete('/:id/save', authRequired, (req, res) => {
  const row = resolvePlaceRow(req, res);
  if (!row) return;
  db.prepare('DELETE FROM saved_places WHERE user_id = ? AND place_id = ?').run(req.user.id, row.id);
  res.json({ saved: false });
});

module.exports = { router, searchHandler, validationError };
