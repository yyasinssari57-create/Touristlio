/** PostgreSQL full-text search for places (replaces SQLite FTS5). */
async function up(db) {
  await db.exec(`
    ALTER TABLE places ADD COLUMN IF NOT EXISTS search_tsv tsvector
      GENERATED ALWAYS AS (
        to_tsvector(
          'simple',
          coalesce(name, '') || ' ' ||
          coalesce(location, '') || ' ' ||
          coalesce(country, '') || ' ' ||
          coalesce(city, '') || ' ' ||
          coalesce(district, '') || ' ' ||
          coalesce(search_aliases, '')
        )
      ) STORED
  `);
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_places_search_tsv ON places USING GIN (search_tsv)
  `);
}

module.exports = { id: '002_places_fts', up, optional: true };
