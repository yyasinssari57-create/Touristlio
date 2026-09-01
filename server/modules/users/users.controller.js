const { ok, fail } = require('../../lib/apiResponse');
const usersService = require('./users.service');

async function list(_req, res) {
  return ok(res, { users: await usersService.listUsers() });
}

async function updateRole(req, res) {
  const role = req.body?.role;
  const result = await usersService.setUserRole(Number(req.params.id), role);
  if (result.error) return fail(res, result.error, result.status);
  return ok(res, result);
}

module.exports = { list, updateRole };
