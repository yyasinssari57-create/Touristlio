const { ok } = require('../../lib/apiResponse');

const analyticsService = require('./analytics.service');



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

module.exports = { summary, quality, categories, timeseries, topPlaces, topUsers };

