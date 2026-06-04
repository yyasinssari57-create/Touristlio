const { validationResult } = require('express-validator');
const { ok, fail } = require('../../lib/apiResponse');
const placesService = require('./places.service');

function validationError(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    fail(res, errors.array()[0].msg, 400);
    return true;
  }
  return false;
}

function list(req, res) {
  try {
    const payload = placesService.listPlaces(req.query);
    return ok(res, payload);
  } catch (e) {
    return fail(res, e.message || 'Liste alınamadı', 500);
  }
}

function markers(req, res) {
  try {
    const lang = req.query.lang === 'en' ? 'en' : 'tr';
    const markers = placesService.listMarkers(req.query, lang);
    return ok(res, { markers });
  } catch (e) {
    return fail(res, e.message || 'Harita verisi alınamadı', 500);
  }
}

function cities(req, res) {
  try {
    const list = placesService.citiesWithCounts(req.query.country);
    return ok(res, { cities: list });
  } catch (e) {
    return fail(res, e.message || 'Şehirler alınamadı', 500);
  }
}

function metaCategories(_req, res) {
  return ok(res, {
    groups: ['cities', 'historical', 'nature', 'museums', 'restaurants', 'hotels', 'activities'],
    discover: placesService.DISCOVER_CATEGORIES,
    legacy: ['landmark', 'museum', 'restaurant', 'cafe', 'beach', 'nature', 'park', 'viewpoint', 'religious', 'market', 'shopping', 'nightlife', 'adventure', 'spa', 'hotel', 'city'],
  });
}

module.exports = {
  list,
  markers,
  cities,
  metaCategories,
  validationError,
};
