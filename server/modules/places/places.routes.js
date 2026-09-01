const express = require('express');
const { query } = require('express-validator');
const { authOptional } = require('../../middleware/auth');
const { searchLimiter } = require('../../middleware/rateLimit');
const controller = require('./places.controller');
const legacyPlaces = require('../../routes/places-legacy');

const router = express.Router();

router.get('/meta/categories', controller.metaCategories);
router.get('/stats', controller.homepageStats);
router.get('/cities', controller.cities);
router.get('/map/markers', authOptional, controller.markers);
router.get('/search', searchLimiter, [
  query('q').trim().notEmpty().withMessage('Arama terimi gerekli'),
], async (req, res, next) => {
  if (controller.validationError(req, res)) return;
  next();
}, async (req, res) => {
  if (controller.validationError(req, res)) return;
  legacyPlaces.searchHandler(req, res);
});

router.get('/', authOptional, controller.list);

router.use('/', legacyPlaces.router);

module.exports = router;
