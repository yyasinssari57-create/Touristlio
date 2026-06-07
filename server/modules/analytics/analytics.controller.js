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
  return ok(res, visitorService.visitorDashboard());
}

function summary(_req, res) {

  return ok(res, analyticsService.dashboard());

}



function quality(_req, res) {

  return ok(res, analyticsService.contentQuality());

}



function categories(_req, res) {

  return ok(res, { categories: analyticsService.byCategory() });

}

function timeseries(_req, res) {
  return ok(res, analyticsService.timeseries());
}

function topPlaces(_req, res) {
  return ok(res, { places: analyticsService.topPlaces() });
}

function topUsers(_req, res) {
  return ok(res, { users: analyticsService.topUsers() });
}

module.exports = {
  track, visitors, summary, quality, categories, timeseries, topPlaces, topUsers,
};

