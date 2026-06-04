const express = require('express');

const { authRequired } = require('../../middleware/auth');

const { checkPermission } = require('../../middleware/rbac');

const controller = require('./settings.controller');



const router = express.Router();



router.get('/public', controller.getPublic);



router.get('/', authRequired, checkPermission('admin.settings'), controller.getAll);

router.put('/', authRequired, checkPermission('admin.settings'), controller.update);



module.exports = router;

