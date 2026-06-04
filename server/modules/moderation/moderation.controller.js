const { ok } = require('../../lib/apiResponse');

const moderationService = require('./moderation.service');



function pendingTiolas(_req, res) {

  return ok(res, { items: moderationService.listPendingTiolas() });

}



function pendingBlogs(_req, res) {

  return ok(res, { items: moderationService.listPendingBlogs() });

}



function approveTiola(req, res) {

  moderationService.approveTiola(req.params.id, req.user.id);

  return ok(res, { approved: true });

}



function rejectTiola(req, res) {

  moderationService.rejectTiola(req.params.id, req.user.id);

  return ok(res, { rejected: true });

}



function approveBlog(req, res) {

  moderationService.approveBlog(req.params.id, req.user.id);

  return ok(res, { approved: true });

}



function rejectBlog(req, res) {

  moderationService.rejectBlog(req.params.id, req.user.id);

  return ok(res, { rejected: true });

}



function risk(_req, res) {

  return ok(res, { users: moderationService.riskQueue() });

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

