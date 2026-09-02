const { ok, fail } = require('../../lib/apiResponse');
const analyticsService = require('./analytics.service');
const visitorService = require('./visitor.service');

async function track(req, res) {
  try {
    return ok(res, await visitorService.trackEvent(req, res, req.body || {}));
  } catch (err) {
    return fail(res, err.message || 'Kayıt başarısız', err.status || 500);
  }
}

async function visitors(_req, res) {
  try {
    return ok(res, await visitorService.visitorDashboard());
  } catch (err) {
    return fail(res, 'Ziyaretçi analitiği yüklenemedi', err.status || 500);
  }
}

async function summary(_req, res) {
  try {
    return ok(res, await analyticsService.dashboard());
  } catch (err) {
    return fail(res, 'Özet istatistikler yüklenemedi', err.status || 500);
  }
}

async function quality(_req, res) {
  try {
    return ok(res, await analyticsService.contentQuality());
  } catch (err) {
    return fail(res, 'Kalite metrikleri yüklenemedi', err.status || 500);
  }
}

async function categories(_req, res) {
  try {
    return ok(res, { categories: await analyticsService.byCategory() });
  } catch (err) {
    return fail(res, 'Kategori istatistikleri yüklenemedi', err.status || 500);
  }
}

async function timeseries(_req, res) {
  try {
    return ok(res, await analyticsService.timeseries());
  } catch (err) {
    return fail(res, 'Zaman serisi yüklenemedi', err.status || 500);
  }
}

async function topPlaces(_req, res) {
  try {
    return ok(res, { places: await analyticsService.topPlaces() });
  } catch (err) {
    return fail(res, 'En çok Tiola listesi yüklenemedi', err.status || 500);
  }
}

async function topUsers(_req, res) {
  try {
    return ok(res, { users: await analyticsService.topUsers() });
  } catch (err) {
    return fail(res, 'En aktif kullanıcılar yüklenemedi', err.status || 500);
  }
}

module.exports = {
  track, visitors, summary, quality, categories, timeseries, topPlaces, topUsers,
};
