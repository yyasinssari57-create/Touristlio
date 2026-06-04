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



module.exports = { summary, quality, categories };

