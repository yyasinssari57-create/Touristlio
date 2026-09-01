const express = require('express');

const router = express.Router();

/**
 * OSM / Nominatim — VPS sonrası proxy buraya bağlanacak.
 * Şimdilik: canlı Nominatim araması kapalı; boş sonuç listesi döner.
 *
 * @see https://operations.osmfoundation.org/policies/nominatim/
 */
const OSM_ATTRIBUTION = {
  text: '© OpenStreetMap contributors',
  url: 'https://www.openstreetmap.org/copyright',
  license: 'ODbL 1.0',
};

const OSM_DISABLED = {
  enabled: false,
  phase: 'planned',
  message: 'Haritada keşfet sekmesini kullanın veya Touristlio veritabanında arayın.',
  attribution: OSM_ATTRIBUTION,
  policy: {
    maxRequestsPerSecond: 1,
    requireUserAgent: 'Touristlio/1.0 (+https://touristlio.com)',
    cacheResults: true,
    noBulkScraping: true,
  },
};

router.get('/status', (_req, res) => {
  res.json(OSM_DISABLED);
});

router.get('/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q || q.length < 2) {
    return res.status(400).json({ error: 'En az 2 karakter girin', results: [] });
  }
  res.json({
    ...OSM_DISABLED,
    query: q,
    results: [],
  });
});

module.exports = router;
