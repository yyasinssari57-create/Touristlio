const { db, allPlaceStats } = require('../db');

const STATS_CACHE_TTL = 2 * 60 * 1000;

let cache = null;
let cacheAt = 0;
let homeCache = null;
let homeCacheAt = 0;

/** Coerce API/DB values so the UI never falls back to an em-dash. */
function toNonNegInt(value) {
  if (value == null || value === '' || value === '—' || value === '–' || value === '-' || value === '...') return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function getStatsMap() {
  const now = Date.now();
  if (cache && now - cacheAt < STATS_CACHE_TTL) return cache;
  cache = allPlaceStats();
  cacheAt = now;
  return cache;
}

function queryHomepageStats() {
  const placesRow = db.prepare(`
    SELECT COUNT(*) AS c FROM places
    WHERE COALESCE(status, 'published') != 'archived'
  `).get();
  const countriesRow = db.prepare(`
    SELECT COUNT(DISTINCT country) AS c FROM places
    WHERE COALESCE(status, 'published') != 'archived'
      AND country IS NOT NULL AND TRIM(country) != ''
  `).get();
  const tiolasRow = db.prepare(`
    SELECT COUNT(*) AS c FROM tiolas
    WHERE status = 'approved' AND parent_id IS NULL
  `).get();
  return {
    countries: toNonNegInt(countriesRow && countriesRow.c),
    places: toNonNegInt(placesRow && placesRow.c),
    tiolas: toNonNegInt(tiolasRow && tiolasRow.c),
  };
}

function getHomepageStats() {
  const now = Date.now();
  if (homeCache && now - homeCacheAt < STATS_CACHE_TTL) return homeCache;
  try {
    homeCache = queryHomepageStats();
  } catch {
    homeCache = { countries: 0, places: 0, tiolas: 0 };
  }
  homeCacheAt = now;
  return homeCache;
}

function invalidateStatsCache() {
  cache = null;
  cacheAt = 0;
  homeCache = null;
  homeCacheAt = 0;
}

module.exports = {
  getStatsMap,
  getHomepageStats,
  toNonNegInt,
  invalidateStatsCache,
  STATS_CACHE_TTL,
};
