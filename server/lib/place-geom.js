/**
 * Optional PostGIS geography for places.
 * `places.location` stays TEXT (human address). Leaflet / API keep lat + lng.
 * Boot must succeed when the extension is missing.
 */
const logger = require('./logger');

let postgisReady = null;

function resetPostgisReady() {
  postgisReady = null;
}

function rawQuery() {
  return require('./pg-db').query;
}

async function probePostgis(database) {
  if (postgisReady != null) return postgisReady;
  const db = database || require('../db').db;
  try {
    const row = await db.prepare(`
      SELECT 1 AS ok
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'places' AND column_name = 'geom'
    `).get();
    postgisReady = !!row;
  } catch {
    postgisReady = false;
  }
  return postgisReady;
}

async function trySpgistThenGist(query) {
  try {
    await query('CREATE INDEX IF NOT EXISTS idx_places_geom_spgist ON places USING SPGIST (geom)');
    logger.info({ msg: 'PostGIS SP-GiST index ready', index: 'idx_places_geom_spgist' });
    return 'spgist';
  } catch (err) {
    logger.warn({
      msg: 'SP-GiST geom index failed, trying GIST',
      code: err.code,
      err: err.message,
    });
    try {
      await query('CREATE INDEX IF NOT EXISTS idx_places_geom_gist ON places USING GIST (geom)');
      logger.info({ msg: 'PostGIS GIST index ready', index: 'idx_places_geom_gist' });
      return 'gist';
    } catch (err2) {
      logger.warn({
        msg: 'GIST geom index skipped',
        code: err2.code,
        err: err2.message,
      });
      return null;
    }
  }
}

async function ensureTrigger(query) {
  await query(`
    CREATE OR REPLACE FUNCTION places_sync_geom()
    RETURNS trigger AS $fn$
    BEGIN
      IF NEW.lat IS NULL OR NEW.lng IS NULL THEN
        NEW.geom := NULL;
      ELSE
        NEW.geom := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
      END IF;
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql
  `);
  await query('DROP TRIGGER IF EXISTS trg_places_sync_geom ON places');
  try {
    await query(`
      CREATE TRIGGER trg_places_sync_geom
      BEFORE INSERT OR UPDATE OF lat, lng
      ON places
      FOR EACH ROW
      EXECUTE FUNCTION places_sync_geom()
    `);
  } catch (err) {
    logger.warn({
      msg: 'EXECUTE FUNCTION trigger failed, trying PROCEDURE',
      code: err.code,
      err: err.message,
    });
    await query(`
      CREATE TRIGGER trg_places_sync_geom
      BEFORE INSERT OR UPDATE OF lat, lng
      ON places
      FOR EACH ROW
      EXECUTE PROCEDURE places_sync_geom()
    `);
  }
}

/**
 * Optional migration body. Throws when PostGIS is unavailable so the
 * optional file migration can retry on the next boot after dashboard enable.
 */
async function ensurePostgisGeom(database) {
  const query = rawQuery();
  try {
    await query('CREATE EXTENSION IF NOT EXISTS postgis');
  } catch (err) {
    logger.warn({
      msg: 'PostGIS extension unavailable; geom skipped (site continues)',
      code: err.code,
      err: err.message,
    });
    postgisReady = false;
    throw err;
  }

  try {
    await query('ALTER TABLE places ADD COLUMN IF NOT EXISTS geom geography(Point, 4326)');
  } catch (err) {
    logger.warn({
      msg: 'PostGIS geom column skipped',
      code: err.code,
      err: err.message,
    });
    postgisReady = false;
    throw err;
  }

  try {
    await query(`
      UPDATE places
      SET geom = ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
      WHERE lat IS NOT NULL AND lng IS NOT NULL
        AND lat <> 0 AND lng <> 0
        AND geom IS NULL
    `);
  } catch (err) {
    logger.warn({
      msg: 'PostGIS geom backfill skipped',
      code: err.code,
      err: err.message,
    });
  }

  await trySpgistThenGist(query);

  try {
    await ensureTrigger(query);
  } catch (err) {
    logger.warn({
      msg: 'PostGIS geom trigger skipped; app dual-write still runs',
      code: err.code,
      err: err.message,
    });
  }

  postgisReady = true;
  if (database) {
    /* keep signature compatible with file migrations */
  }
  logger.info({ msg: 'PostGIS geom ready (lat/lng unchanged)' });
  return true;
}

async function syncPlaceGeom(database, id, lat, lng) {
  const db = database || require('../db').db;
  const placeId = Number(id);
  if (!Number.isFinite(placeId)) return false;
  if (!(await probePostgis(db))) return false;
  try {
    const la = lat == null ? null : Number(lat);
    const ln = lng == null ? null : Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) {
      await db.prepare('UPDATE places SET geom = NULL WHERE id = ?').run(placeId);
      return true;
    }
    await db.prepare(`
      UPDATE places
      SET geom = ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography
      WHERE id = ?
    `).run(ln, la, placeId);
    return true;
  } catch (err) {
    logger.warn({
      msg: 'PostGIS dual-write skipped',
      id: placeId,
      code: err.code,
      err: err.message,
    });
    postgisReady = false;
    return false;
  }
}

/**
 * Optional ST_Distance nearby list. Same country preference as geo.js.
 * Returns null when PostGIS/geom is unavailable so callers keep haversine.
 */
async function findNearbyPlacesSql(originRow, mapPlace, limit = 6) {
  const db = require('../db').db;
  if (!originRow || originRow.lat == null || originRow.lng == null) return null;
  if (!(await probePostgis(db))) return null;
  const lat = Number(originRow.lat);
  const lng = Number(originRow.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const cap = Math.min(Math.max(Number(limit) || 6, 1), 50);
  try {
    const rows = await db.prepare(`
      SELECT p.*,
        ST_Distance(p.geom, ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography) / 1000.0 AS distance_km
      FROM places p
      WHERE p.id != ?
        AND p.geom IS NOT NULL
        AND COALESCE(p.status, 'published') != 'archived'
        AND ST_DWithin(p.geom, ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography, 20000000)
      ORDER BY
        (CASE WHEN p.country = ? THEN 0 ELSE 10000 END)
        + (ST_Distance(p.geom, ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography) / 1000.0)
      LIMIT ?
    `).all(lng, lat, originRow.id, lng, lat, originRow.country || '', lng, lat, cap);
    const mapped = [];
    for (const row of rows) {
      const place = await Promise.resolve(mapPlace(row));
      const km = Number(row.distance_km);
      mapped.push({
        ...place,
        distanceKm: Number.isFinite(km) ? Math.round(km * 10) / 10 : place.distanceKm,
      });
    }
    return mapped;
  } catch (err) {
    logger.warn({
      msg: 'PostGIS nearby query skipped; using haversine',
      code: err.code,
      err: err.message,
    });
    postgisReady = false;
    return null;
  }
}

module.exports = {
  ensurePostgisGeom,
  syncPlaceGeom,
  findNearbyPlacesSql,
  probePostgis,
  resetPostgisReady,
};
