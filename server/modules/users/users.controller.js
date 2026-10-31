const { ok, fail } = require('../../lib/apiResponse');
const usersService = require('./users.service');

async function list(_req, res) {
  return ok(res, { users: await usersService.listUsers() });
}

async function updateRole(req, res) {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return fail(res, 'Geçersiz id', 400);
  const role = String(req.body?.role || '').trim();
  const result = await usersService.setUserRole(req.user, id, role);
  if (result.error) return fail(res, result.error, result.status);
  return ok(res, result);
}

module.exports = { list, updateRole };
