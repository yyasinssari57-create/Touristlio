/**
 * Gemini Faz 1 — GIN only when a real JSONB column exists.
 * categories/tags/photos stay TEXT (LIKE queries). Do not cast TEXT → jsonb
 * (invalid JSON would fail boot; LIKE would not use the GIN anyway).
 * PostGIS is not enabled here: maps keep lat/lng DOUBLE PRECISION.
 */

async function up(db, { tableExists, columnExists }) {
  const jsonbCols = await db.prepare(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND data_type = 'jsonb'
    ORDER BY table_name, column_name
  `).all();

  for (const col of jsonbCols || []) {
    const table = String(col.table_name || '');
    const column = String(col.column_name || '');
    if (!/^[a-z_][a-z0-9_]*$/i.test(table) || !/^[a-z_][a-z0-9_]*$/i.test(column)) continue;
    const indexName = `idx_${table}_${column}_gin`;
    if (!/^[a-z_][a-z0-9_]*$/i.test(indexName)) continue;
    try {
      await db.exec(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${table} USING GIN (${column})`);
    } catch (err) {
      const logger = require('../../server/lib/logger');
      logger.warn({
        msg: 'JSONB GIN skipped',
        indexName,
        table,
        column,
        code: err.code,
        err: err.message,
      });
    }
  }

  if (await tableExists(db, 'places')
    && await columnExists(db, 'places', 'lat')
    && await columnExists(db, 'places', 'lng')) {
    await db.exec('CREATE INDEX IF NOT EXISTS idx_places_lat_lng ON places(lat, lng)');
  }
}

module.exports = { id: '009_jsonb_gin', up };
