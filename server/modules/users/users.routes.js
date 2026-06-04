const express = require('express');

const { authRequired } = require('../../middleware/auth');

const { checkPermission } = require('../../middleware/rbac');

const controller = require('./users.controller');



const router = express.Router();



router.use(authRequired, checkPermission('admin.users'));



router.get('/', controller.list);

router.patch('/:id/role', controller.updateRole);



module.exports = router;

