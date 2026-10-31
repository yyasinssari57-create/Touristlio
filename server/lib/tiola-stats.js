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

async function computePlaceTiolaStats(placeId) {
  const pid = Number(placeId);
  if (!Number.isFinite(pid)) return { tiolaCount: 0, tiolaRating: null };
  const row = await db.prepare(`
    SELECT COUNT(*) AS count, ROUND(AVG(stars), 1) AS avg
    FROM tiolas
    WHERE place_id = ? AND ${RATED_WHERE}
  `).get(pid);
  return {
    tiolaCount: row?.count || 0,
    tiolaRating: row?.avg != null ? roundAvg(row.avg) : null,
  };
}

async function persistPlaceTiolaStats(placeId, stats) {
  const pid = Number(placeId);
  if (!Number.isFinite(pid)) return stats;
  await db.prepare(`
    UPDATE places SET tiola_count = ?, tiola_rating = ? WHERE id = ?
  `).run(stats.tiolaCount || 0, stats.tiolaRating, pid);
  return stats;
}

async function readStoredPlaceTiolaStats(placeId) {
  const pid = Number(placeId);
  if (!Number.isFinite(pid)) return { tiolaCount: 0, tiolaRating: null };
  try {
    const row = await db.prepare(`
      SELECT tiola_count AS tiolaCount, tiola_rating AS tiolaRating FROM places WHERE id = ?
    `).get(pid);
    if (!row) return { tiolaCount: 0, tiolaRating: null };
    return {
      tiolaCount: row.tiolaCount || 0,
      tiolaRating: row.tiolaRating != null ? roundAvg(row.tiolaRating) : null,
    };
  } catch {
    return await computePlaceTiolaStats(pid);
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

async function recomputePlaceTiolaStats(placeId) {
  const pid = Number(placeId);
  if (!Number.isFinite(pid) || pid < 1) {
    invalidatePlaceListCaches();
    return { tiolaCount: 0, tiolaRating: null };
  }
  const stats = await persistPlaceTiolaStats(pid, await computePlaceTiolaStats(pid));
  invalidatePlaceListCaches();
  return stats;
}

async function refreshPlaceStatsForTiola(tiolaId) {
  const id = Number(tiolaId);
  if (!Number.isFinite(id)) {
    invalidatePlaceListCaches();
    return null;
  }
  const row = await db.prepare('SELECT place_id AS placeId FROM tiolas WHERE id = ?').get(id);
  if (!row?.placeId) {
    invalidatePlaceListCaches();
    return null;
  }
  return await recomputePlaceTiolaStats(row.placeId);
}

async function allStoredPlaceStats() {
  try {
    const rows = await db.prepare(`
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

/**
 * Recompute tiola_count/tiola_rating for a specific set of places in one
 * shared GROUP BY query (instead of one COUNT/AVG query per place) — used by
 * bulk admin actions so a 20-item /tiolas/bulk approve/reject no longer
 * triggers one "SELECT place_id" + one COUNT/AVG + one UPDATE per tiola
 * (Claude Master PRD FAZ2-4 — N+1 query cleanup). Still issues one UPDATE
 * per *distinct* place (not per tiola) so each place's cached columns stay
 * correct, including resetting places with zero remaining approved tiolas.
 */
async function recomputePlaceTiolaStatsBatch(placeIds) {
  const ids = [...new Set((placeIds || []).map(Number).filter((id) => Number.isFinite(id) && id > 0))];
  if (!ids.length) return [];
  const rows = await db.prepare(`
    SELECT place_id AS placeId, COUNT(*) AS count, ROUND(AVG(stars), 1) AS avg
    FROM tiolas
    WHERE ${RATED_WHERE} AND place_id = ANY(?::int[])
    GROUP BY place_id
  `).all(ids);
  const statsByPlace = new Map(rows.map((r) => [r.placeId, {
    tiolaCount: r.count || 0,
    tiolaRating: r.avg != null ? roundAvg(r.avg) : null,
  }]));
  const update = await db.prepare('UPDATE places SET tiola_count = ?, tiola_rating = ? WHERE id = ?');
  const tx = db.transaction(async (list) => {
    for (const id of list) {
      const stats = statsByPlace.get(id) || { tiolaCount: 0, tiolaRating: null };
      await update.run(stats.tiolaCount, stats.tiolaRating, id);
    }
  });
  await tx(ids);
  invalidatePlaceListCaches();
  return ids.map((id) => ({ placeId: id, ...(statsByPlace.get(id) || { tiolaCount: 0, tiolaRating: null }) }));
}

async function backfillAllPlaceTiolaStats() {
  await db.exec('UPDATE places SET tiola_count = 0, tiola_rating = NULL');
  const rows = await db.prepare(`
    SELECT place_id AS placeId, COUNT(*) AS count, ROUND(AVG(stars), 1) AS avg
    FROM tiolas
    WHERE ${RATED_WHERE}
    GROUP BY place_id
  `).all();
  const update = await db.prepare('UPDATE places SET tiola_count = ?, tiola_rating = ? WHERE id = ?');
  const tx = db.transaction(async (list) => {
    for (const row of list) {
      await update.run(row.count || 0, row.avg ?? null, row.placeId);
    }
  });
  await tx(rows);
  invalidatePlaceListCaches();
  return rows.length;
}

module.exports = {
  roundAvg,
  computePlaceTiolaStats,
  persistPlaceTiolaStats,
  readStoredPlaceTiolaStats,
  recomputePlaceTiolaStats,
  recomputePlaceTiolaStatsBatch,
  refreshPlaceStatsForTiola,
  allStoredPlaceStats,
  backfillAllPlaceTiolaStats,
  invalidatePlaceListCaches,
};
