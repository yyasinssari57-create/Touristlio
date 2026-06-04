const express = require('express');

const { authRequired } = require('../../middleware/auth');

const { checkPermission } = require('../../middleware/rbac');

const controller = require('./analytics.controller');



const router = express.Router();



router.use(authRequired, checkPermission('admin.dashboard'));



router.get('/summary', controller.summary);

router.get('/quality', controller.quality);

router.get('/categories', controller.categories);



module.exports = router;

