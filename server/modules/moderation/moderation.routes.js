const express = require('express');

const { authRequired } = require('../../middleware/auth');

const { checkPermission } = require('../../middleware/rbac');

const controller = require('./moderation.controller');



const router = express.Router();



router.use(authRequired, checkPermission('admin.moderate'));



router.get('/pending/tiolas', controller.pendingTiolas);

router.get('/pending/blogs', controller.pendingBlogs);

router.post('/tiolas/:id/approve', controller.approveTiola);

router.post('/tiolas/:id/reject', controller.rejectTiola);

router.post('/blogs/:id/approve', controller.approveBlog);

router.post('/blogs/:id/reject', controller.rejectBlog);

router.get('/risk', controller.risk);



module.exports = router;

