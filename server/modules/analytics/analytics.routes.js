const express = require('express');

const { authOptional, authRequired } = require('../../middleware/auth');

const { checkPermission } = require('../../middleware/rbac');

const controller = require('./analytics.controller');



const router = express.Router();

router.post('/track', authOptional, controller.track);

router.use(authRequired, checkPermission('admin.analytics'));

router.get('/visitors', controller.visitors);

router.get('/summary', controller.summary);

router.get('/quality', controller.quality);

router.get('/categories', controller.categories);

router.get('/timeseries', controller.timeseries);

router.get('/top-places', controller.topPlaces);

router.get('/top-users', controller.topUsers);

module.exports = router;
