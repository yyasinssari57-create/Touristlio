const express = require('express');
const { db, placeStats } = require('../db');
const { getLiveData } = require('../services/liveDataService');
const { mapPlaceRow } = require('../lib/place-map');
const { parsePositiveInt } = require('../lib/sanitize');
const { liveDataLimiter } = require('../middleware/rateLimit');

const router = express.Router();

router.get('/:placeId', liveDataLimiter, (req, res) => {
  const placeId = parsePositiveInt(req.params.placeId, res);
  if (!placeId) return;
  const row = db.prepare('SELECT * FROM places WHERE id = ?').get(placeId);
  if (!row) return res.status(404).json({ error: 'Yer bulunamadı' });
  const mapPlace = (r) => mapPlaceRow(r, placeStats(r.id));
  const data = getLiveData(row.id, row, mapPlace);
  res.json(data);
});

module.exports = router;
