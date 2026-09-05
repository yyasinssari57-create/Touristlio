const express = require('express');
const { validationResult } = require('express-validator');
const { db } = require('../db');
const { findPlaceRow, PLACE_PARAM_RESERVED } = require('../lib/place-lookup');
const { authOptional, authRequired } = require('../middleware/auth');
const { ok } = require('../lib/apiResponse');
const { normalizeSearch, matchesQuery } = require('../lib/search-normalize');
const { cacheKey, wrap, PLACES_TTL_MS } = require('../lib/cache');
const { getStatsMap } = require('../lib/stats-cache');
const { findNearbyPlaces, findSimilarPlaces } = require('../lib/geo');
const { getWeather } = require('../services/weatherService');
const { currencyForCountry, timezoneForCountry, parseEntryFeeTry } = require('../lib/currency');
const { getLiveData, getAdminPayload, mergeWeather, mergeLocalInfo, mergeInfoPanel } = require('../services/liveDataService');
const placesService = require('../modules/places/places.service');

const router = express.Router();
const { mapPlace: mapPlaceFromService } = placesService;

function mapWithStats(row, statsMap) {
  return mapPlaceFromService(row, statsMap);
}

function validationError(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: errors.array()[0].msg });
    return true;
  }
  return false;
}

async function searchHandler(req, res) {
  const q = req.query.q.trim();
  const limit = Math.min(Number(req.query.limit) || 8, 20);
  const key = cacheKey('search', { q, limit });
  const result = await wrap(key, async () => {
    const rows = await db.prepare('SELECT * FROM places').all();
    const statsMap = await getStatsMap();
    const mapper = (row) => mapWithStats(row, statsMap);
    const qNorm = normalizeSearch(q);
    const matches = rows
      .filter((row) => matchesQuery(mapper(row), qNorm))
      .slice(0, limit)
      .map(mapper);
    return { places: matches, count: matches.length };
  }, PLACES_TTL_MS);
  res.json(result);
}

router.get('/saved/all', authRequired, async (req, res) => {
  const rows = await db.prepare(`
    SELECT p.* FROM saved_places sp
    JOIN places p ON p.id = sp.place_id
    WHERE sp.user_id = ?
    ORDER BY sp.created_at DESC
  `).all(req.user.id);
  const statsMap = await getStatsMap();
  return ok(res, { places: rows.map((r) => mapWithStats(r, statsMap)) });
});

async function resolvePlaceRow(req, res) {
  const key = req.params.id;
  if (PLACE_PARAM_RESERVED.has(String(key || '').toLowerCase())) {
    res.status(404).json({ error: 'Not found' });
    return null;
  }
  const row = await findPlaceRow(key);
  if (!row) {
    res.status(404).json({ error: 'Yer bulunamadı' });
    return null;
  }
  return row;
}

router.get('/:id', authOptional, async (req, res) => {
  const row = await resolvePlaceRow(req, res);
  if (!row) return;
  const statsMap = await getStatsMap();
  const mapper = (r) => mapWithStats(r, statsMap);
  const place = mapper(row);
  const allRows = await db.prepare('SELECT * FROM places').all();
  const nearby = findNearbyPlaces(allRows, row, mapper, 6);
  const similar = findSimilarPlaces(allRows, row, mapper, 6);
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
  const adminPayload = await getAdminPayload(place.id);
  const liveData = await getLiveData(place.id, row, mapper);
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
  const row = await resolvePlaceRow(req, res);
  if (!row) return;
  const lang = req.query.lang === 'en' ? 'en' : 'tr';
  const weather = await getWeather(row.lat, row.lng, lang);
  res.json(weather);
});

router.get('/:id/saved', authRequired, async (req, res) => {
  const row = await resolvePlaceRow(req, res);
  if (!row) return;
  const saved = await db.prepare(`
    SELECT 1 FROM saved_places WHERE user_id = ? AND place_id = ?
  `).get(req.user.id, row.id);
  return ok(res, { saved: !!saved });
});

router.post('/:id/save', authRequired, async (req, res) => {
  const row = await resolvePlaceRow(req, res);
  if (!row) return;
  await db.prepare(`
    INSERT OR IGNORE INTO saved_places (user_id, place_id) VALUES (?, ?)
  `).run(req.user.id, row.id);
  return ok(res, { saved: true, placeId: row.id });
});

router.delete('/:id/save', authRequired, async (req, res) => {
  const row = await resolvePlaceRow(req, res);
  if (!row) return;
  await db.prepare('DELETE FROM saved_places WHERE user_id = ? AND place_id = ?').run(req.user.id, row.id);
  return ok(res, { saved: false, placeId: row.id });
});

module.exports = { router, searchHandler, validationError };
