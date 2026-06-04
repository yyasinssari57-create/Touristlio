const express = require('express');
const { query } = require('express-validator');
const { authOptional } = require('../../middleware/auth');
const { searchLimiter } = require('../../middleware/rateLimit');
const controller = require('./places.controller');
const legacyPlaces = require('../../routes/places-legacy');

const router = express.Router();

router.get('/meta/categories', controller.metaCategories);
router.get('/cities', controller.cities);
router.get('/map/markers', authOptional, controller.markers);
router.get('/search', searchLimiter, [
  query('q').trim().notEmpty().withMessage('Arama terimi gerekli'),
], (req, res, next) => {
  if (controller.validationError(req, res)) return;
  next();
}, (req, res) => {
  if (controller.validationError(req, res)) return;
  legacyPlaces.searchHandler(req, res);
});

router.get('/', authOptional, controller.list);

router.use('/', legacyPlaces.router);

module.exports = router;
