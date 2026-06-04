const { ok } = require('../../lib/apiResponse');

const settingsService = require('./settings.service');



function getPublic(_req, res) {

  return ok(res, settingsService.getPublic());

}



function getAll(_req, res) {

  return ok(res, { settings: settingsService.getAll() });

}



function update(req, res) {

  const body = req.body?.settings || req.body || {};

  Object.entries(body).forEach(([key, value]) => settingsService.set(key, value));

  return ok(res, { settings: settingsService.getAll() });

}



module.exports = { getPublic, getAll, update };

