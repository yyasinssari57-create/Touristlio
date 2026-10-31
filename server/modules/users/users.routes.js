const express = require('express');

const { authRequired, requireRole } = require('../../middleware/auth');

const { checkPermission } = require('../../middleware/rbac');

const controller = require('./users.controller');



const router = express.Router();



router.use(authRequired, checkPermission('admin.users'));



router.get('/', controller.list);

// Rol atama yalnızca 'admin' — moderator/staff'ın varsayılan admin.users izni
// bu uca yetmez (admin.js'teki PATCH /admin/users/:id/role ile aynı kısıt).
router.patch('/:id/role', requireRole('admin'), controller.updateRole);



module.exports = router;

