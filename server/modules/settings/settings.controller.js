const { ok } = require('../../lib/apiResponse');
const settingsService = require('./settings.service');

async function getPublic(_req, res) {
  return ok(res, await settingsService.getPublic());
}

async function getAll(_req, res) {
  return ok(res, { settings: await settingsService.getAll() });
}

async function update(req, res) {
  const body = req.body?.settings || req.body || {};
  for (const [key, value] of Object.entries(body)) {
    await settingsService.set(key, value);
  }
  return ok(res, { settings: await settingsService.getAll() });
}

module.exports = { getPublic, getAll, update };
