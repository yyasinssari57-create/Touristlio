/**
 * Gemini Faz 4 — optional PostGIS geography point + SP-GiST/GIST index.
 * Does not drop lat/lng. Does not rename places.location (TEXT address).
 * CREATE EXTENSION is try/caught; missing PostGIS must not crash boot.
 */

async function up(db, helpers) {
  const { ensurePostgisGeom } = require('../../server/lib/place-geom');
  try {
    await ensurePostgisGeom(db, helpers);
  } catch (err) {
    const logger = require('../../server/lib/logger');
    logger.warn({
      msg: '010_postgis_geom skipped (optional) — site continues without PostGIS',
      code: err.code,
      err: err.message,
    });
  }
}

module.exports = { id: '010_postgis_geom', optional: true, up };
