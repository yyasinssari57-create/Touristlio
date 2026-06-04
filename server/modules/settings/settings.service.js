const { db } = require('../../db');

const DEFAULTS = {
  site_name: 'Touristlio',
  site_tagline: 'Sadece Ziyaret Etme. Hisset.',
  logo_url: '/images/logo-round.png',
  theme_primary: '#0ea5e9',
  map_default_lat: '39.0',
  map_default_lng: '35.0',
  map_default_zoom: '6',
  feature_blog: 'true',
  feature_discover: 'true',
  seo_title: 'Touristlio — Seyahat Keşfi',
  seo_description: 'Türkiye ve dünyada gezilecek yerler, harita ve topluluk deneyimleri.',
};

function getAll() {
  const rows = require('./settings.model').allRows();
  const out = { ...DEFAULTS };
  rows.forEach((r) => { out[r.key] = r.value; });
  return out;
}

function getPublic() {
  const all = getAll();
  return {
    siteName: all.site_name,
    tagline: all.site_tagline,
    logoUrl: all.logo_url,
    themePrimary: all.theme_primary,
    map: {
      lat: Number(all.map_default_lat),
      lng: Number(all.map_default_lng),
      zoom: Number(all.map_default_zoom),
    },
    features: {
      blog: all.feature_blog === 'true',
      discover: all.feature_discover === 'true',
    },
    seo: {
      title: all.seo_title,
      description: all.seo_description,
    },
  };
}

function set(key, value) {
  require('./settings.model').upsert(key, value);
}

function seedDefaults() {
  for (const [key, value] of Object.entries(DEFAULTS)) {
    db.prepare('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)').run(key, value);
  }
}

seedDefaults();

module.exports = { getAll, getPublic, set, DEFAULTS };
