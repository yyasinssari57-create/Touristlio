const { ok } = require('../../lib/apiResponse');
const moderationService = require('./moderation.service');

async function pendingTiolas(_req, res) {
  return ok(res, { items: await moderationService.listPendingTiolas() });
}

async function pendingBlogs(_req, res) {
  return ok(res, { items: await moderationService.listPendingBlogs() });
}

async function approveTiola(req, res) {
  await moderationService.approveTiola(req.params.id, req.user.id);
  return ok(res, { approved: true });
}

async function rejectTiola(req, res) {
  await moderationService.rejectTiola(req.params.id, req.user.id);
  return ok(res, { rejected: true });
}

async function approveBlog(req, res) {
  await moderationService.approveBlog(req.params.id, req.user.id);
  return ok(res, { approved: true });
}

async function rejectBlog(req, res) {
  await moderationService.rejectBlog(req.params.id, req.user.id);
  return ok(res, { rejected: true });
}

async function risk(_req, res) {
  return ok(res, { users: await moderationService.riskQueue() });
}

module.exports = {
  pendingTiolas,
  pendingBlogs,
  approveTiola,
  rejectTiola,
  approveBlog,
  rejectBlog,
  risk,
};
