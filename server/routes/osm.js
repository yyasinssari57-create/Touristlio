const express = require('express');

const router = express.Router();

/**
 * OSM / Nominatim — VPS sonrası proxy buraya bağlanacak.
 * Şimdilik: rate limit + ToS uyarısı; canlı arama kapalı.
 *
 * @see https://operations.osmfoundation.org/policies/nominatim/
 */
const OSM_ATTRIBUTION = {
  text: '© OpenStreetMap contributors',
  url: 'https://www.openstreetmap.org/copyright',
  license: 'ODbL 1.0',
};

router.get('/status', (_req, res) => {
  res.json({
    enabled: false,
    phase: 'planned',
    message: 'OSM araması VPS üzerinde Nominatim proxy ile açılacak.',
    attribution: OSM_ATTRIBUTION,
    policy: {
      maxRequestsPerSecond: 1,
      requireUserAgent: 'Touristlio/1.0 (+https://touristlio.com)',
      cacheResults: true,
      noBulkScraping: true,
    },
  });
});

router.get('/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q || q.length < 2) {
    return res.status(400).json({ error: 'En az 2 karakter girin' });
  }
  res.status(501).json({
    error: 'osm_not_available',
    message: 'Haritada keşfet sekmesini kullanın veya Touristlio veritabanında arayın.',
    query: q,
    attribution: OSM_ATTRIBUTION,
    hint: 'VPS sonrası: GET /api/osm/search?q=... (self-hosted Nominatim veya onaylı proxy)',
  });
});

module.exports = router;
