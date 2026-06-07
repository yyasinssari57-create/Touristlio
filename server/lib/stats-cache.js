const { allPlaceStats } = require('../db');

const STATS_CACHE_TTL = 2 * 60 * 1000;

let cache = null;
let cacheAt = 0;

function getStatsMap() {
  const now = Date.now();
  if (cache && now - cacheAt < STATS_CACHE_TTL) return cache;
  cache = allPlaceStats();
  cacheAt = now;
  return cache;
}

function invalidateStatsCache() {
  cache = null;
  cacheAt = 0;
}

module.exports = { getStatsMap, invalidateStatsCache, STATS_CACHE_TTL };
