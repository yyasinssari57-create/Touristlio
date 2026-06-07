const { ok, fail } = require('../../lib/apiResponse');

const analyticsService = require('./analytics.service');
const visitorService = require('./visitor.service');

function track(req, res) {
  try {
    return ok(res, visitorService.trackEvent(req, res, req.body || {}));
  } catch (err) {
    return fail(res, err.message || 'Kayıt başarısız', err.status || 500);
  }
}

function visitors(_req, res) {
  try {
    return ok(res, visitorService.visitorDashboard());
  } catch (err) {
    return fail(res, 'Ziyaretçi analitiği yüklenemedi', err.status || 500);
  }
}

function summary(_req, res) {
  try {
    return ok(res, analyticsService.dashboard());
  } catch (err) {
    return fail(res, 'Özet istatistikler yüklenemedi', err.status || 500);
  }
}

function quality(_req, res) {
  try {
    return ok(res, analyticsService.contentQuality());
  } catch (err) {
    return fail(res, 'Kalite metrikleri yüklenemedi', err.status || 500);
  }
}



function categories(_req, res) {

  return ok(res, { categories: analyticsService.byCategory() });

}

function timeseries(_req, res) {
  try {
    return ok(res, analyticsService.timeseries());
  } catch (err) {
    return fail(res, 'Zaman serisi yüklenemedi', err.status || 500);
  }
}

function topPlaces(_req, res) {
  try {
    return ok(res, { places: analyticsService.topPlaces() });
  } catch (err) {
    return fail(res, 'En çok Tiola listesi yüklenemedi', err.status || 500);
  }
}

function topUsers(_req, res) {
  try {
    return ok(res, { users: analyticsService.topUsers() });
  } catch (err) {
    return fail(res, 'En aktif kullanıcılar yüklenemedi', err.status || 500);
  }
}

module.exports = {
  track, visitors, summary, quality, categories, timeseries, topPlaces, topUsers,
};

