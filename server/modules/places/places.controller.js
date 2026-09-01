const { validationResult } = require('express-validator');
const { ok, fail } = require('../../lib/apiResponse');
const placesService = require('./places.service');
const { getHomepageStats } = require('../../lib/stats-cache');

function validationError(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    fail(res, errors.array()[0].msg, 400);
    return true;
  }
  return false;
}

async function list(req, res) {
  try {
    const payload = await placesService.listPlaces(req.query);
    return ok(res, payload);
  } catch (e) {
    return fail(res, e.message || 'Liste alınamadı', 500);
  }
}

async function markers(req, res) {
  try {
    const lang = req.query.lang === 'en' ? 'en' : 'tr';
    const markers = await placesService.listMarkers(req.query, lang);
    return ok(res, { markers });
  } catch (e) {
    return fail(res, e.message || 'Harita verisi alınamadı', 500);
  }
}

async function cities(req, res) {
  try {
    const list = await placesService.citiesWithCounts(req.query.country);
    return ok(res, { cities: list });
  } catch (e) {
    return fail(res, e.message || 'Şehirler alınamadı', 500);
  }
}

async function metaCategories(_req, res) {
  try {
    const payload = await placesService.getMetaCategories();
    return ok(res, payload);
  } catch (e) {
    return fail(res, e.message || 'Kategori meta alınamadı', 500);
  }
}

async function homepageStats(_req, res) {
  try {
    return ok(res, await getHomepageStats());
  } catch {
    return ok(res, { countries: 0, places: 0, tiolas: 0 });
  }
}

module.exports = {
  list,
  markers,
  cities,
  metaCategories,
  homepageStats,
  validationError,
};
