const express = require('express');
const { db, placeStats } = require('../db');
const { getLiveData } = require('../services/liveDataService');
const { mapPlaceRow } = require('../lib/place-map');

const router = express.Router();

router.get('/:placeId', (req, res) => {
  const row = db.prepare('SELECT * FROM places WHERE id = ?').get(req.params.placeId);
  if (!row) return res.status(404).json({ error: 'Yer bulunamadı' });
  const mapPlace = (r) => mapPlaceRow(r, placeStats(r.id));
  const data = getLiveData(row.id, row, mapPlace);
  res.json(data);
});

module.exports = router;
