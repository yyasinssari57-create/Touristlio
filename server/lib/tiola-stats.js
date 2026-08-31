/**
 * Cached place-level Tiola averages.
 * Public rating is stored on places (tiola_count / tiola_rating) and refreshed
 * when an approved top-level Tiola is added, changed, or removed — not on every list query.
 */
const { db } = require('../db');
const { invalidateStatsCache } = require('./stats-cache');
const { clear } = require('./cache');

const RATED_WHERE = `
  status = 'approved'
  AND parent_id IS NULL
  AND stars IS NOT NULL AND stars > 0
  AND place_id IS NOT NULL
`;

function roundAvg(avg) {
  if (avg == null || !Number.isFinite(Number(avg))) return null;
  return Math.round(Number(avg) * 10) / 10;
}

function computePlaceTiolaStats(placeId) {
  const pid = Number(placeId);
  if (!Number.isFinite(pid)) return { tiolaCount: 0, tiolaRating: null };
  const row = db.prepare(`
    SELECT COUNT(*) AS count, ROUND(AVG(stars), 1) AS avg
    FROM tiolas
    WHERE place_id = ? AND ${RATED_WHERE}
  `).get(pid);
  return {
    tiolaCount: row?.count || 0,
    tiolaRating: row?.avg != null ? roundAvg(row.avg) : null,
  };
}

function persistPlaceTiolaStats(placeId, stats) {
  const pid = Number(placeId);
  if (!Number.isFinite(pid)) return stats;
  db.prepare(`
    UPDATE places SET tiola_count = ?, tiola_rating = ? WHERE id = ?
  `).run(stats.tiolaCount || 0, stats.tiolaRating, pid);
  return stats;
}

function readStoredPlaceTiolaStats(placeId) {
  const pid = Number(placeId);
  if (!Number.isFinite(pid)) return { tiolaCount: 0, tiolaRating: null };
  try {
    const row = db.prepare(`
      SELECT tiola_count AS tiolaCount, tiola_rating AS tiolaRating FROM places WHERE id = ?
    `).get(pid);
    if (!row) return { tiolaCount: 0, tiolaRating: null };
    return {
      tiolaCount: row.tiolaCount || 0,
      tiolaRating: row.tiolaRating != null ? roundAvg(row.tiolaRating) : null,
    };
  } catch {
    return computePlaceTiolaStats(pid);
  }
}

function invalidatePlaceListCaches() {
  try {
    require('../modules/places/places.service').invalidatePlacesCache();
  } catch {
    invalidateStatsCache();
  }
  clear('search');
}

function recomputePlaceTiolaStats(placeId) {
  const pid = Number(placeId);
  if (!Number.isFinite(pid) || pid < 1) {
    invalidatePlaceListCaches();
    return { tiolaCount: 0, tiolaRating: null };
  }
  const stats = persistPlaceTiolaStats(pid, computePlaceTiolaStats(pid));
  invalidatePlaceListCaches();
  return stats;
}

function refreshPlaceStatsForTiola(tiolaId) {
  const id = Number(tiolaId);
  if (!Number.isFinite(id)) {
    invalidatePlaceListCaches();
    return null;
  }
  const row = db.prepare('SELECT place_id AS placeId FROM tiolas WHERE id = ?').get(id);
  if (!row?.placeId) {
    invalidatePlaceListCaches();
    return null;
  }
  return recomputePlaceTiolaStats(row.placeId);
}

function allStoredPlaceStats() {
  try {
    const rows = db.prepare(`
      SELECT id AS placeId, tiola_count AS count, tiola_rating AS avg
      FROM places
      WHERE COALESCE(tiola_count, 0) > 0
    `).all();
    const map = new Map();
    for (const row of rows) {
      map.set(row.placeId, {
        tiolaCount: row.count || 0,
        tiolaRating: row.avg != null ? roundAvg(row.avg) : null,
      });
    }
    return map;
  } catch {
    return null;
  }
}

function backfillAllPlaceTiolaStats() {
  db.exec('UPDATE places SET tiola_count = 0, tiola_rating = NULL');
  const rows = db.prepare(`
    SELECT place_id AS placeId, COUNT(*) AS count, ROUND(AVG(stars), 1) AS avg
    FROM tiolas
    WHERE ${RATED_WHERE}
    GROUP BY place_id
  `).all();
  const update = db.prepare('UPDATE places SET tiola_count = ?, tiola_rating = ? WHERE id = ?');
  const tx = db.transaction((list) => {
    for (const row of list) {
      update.run(row.count || 0, row.avg ?? null, row.placeId);
    }
  });
  tx(rows);
  invalidatePlaceListCaches();
  return rows.length;
}

module.exports = {
  roundAvg,
  computePlaceTiolaStats,
  persistPlaceTiolaStats,
  readStoredPlaceTiolaStats,
  recomputePlaceTiolaStats,
  refreshPlaceStatsForTiola,
  allStoredPlaceStats,
  backfillAllPlaceTiolaStats,
  invalidatePlaceListCaches,
};
