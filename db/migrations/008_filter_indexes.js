/**
 * [ORTA-5] Filter/list indexes.
 * Audit asked for Postgres-style (country_id, city_id, score), (category_id, is_published),
 * blogs(created_at), and GIN on JSONB tags. This app is SQLite: TEXT country/city/category,
 * status instead of is_published, tiola_rating instead of score, categories TEXT JSON (no JSONB/GIN).
 */

function up(db, { tableExists, columnExists }) {
  function ensureIndex(indexName, table, columnsSql) {
    if (!tableExists(db, table)) return;
    db.exec(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${table}(${columnsSql})`);
  }

  if (tableExists(db, 'places')) {
    if (columnExists(db, 'places', 'country')
      && columnExists(db, 'places', 'city')
      && columnExists(db, 'places', 'tiola_rating')) {
      ensureIndex('idx_places_country_city_score', 'places', 'country, city, tiola_rating');
      try {
        ensureIndex(
          'idx_places_country_city_score_lc',
          'places',
          'LOWER(country), LOWER(city), tiola_rating',
        );
      } catch {
        /* expression index: older SQLite */
      }
    }
    if (columnExists(db, 'places', 'category') && columnExists(db, 'places', 'status')) {
      ensureIndex('idx_places_category_published', 'places', 'category, status');
    }
    if (columnExists(db, 'places', 'tiola_rating')) {
      ensureIndex('idx_places_tiola_rating', 'places', 'tiola_rating');
    }
    if (columnExists(db, 'places', 'categories')) {
      // SQLite has no GIN/JSONB. TEXT index on the JSON array column (equality/IS NOT NULL).
      ensureIndex('idx_places_categories', 'places', 'categories');
    }
  }

  if (tableExists(db, 'blogs') && columnExists(db, 'blogs', 'created_at')) {
    ensureIndex('idx_blogs_created_at', 'blogs', 'created_at');
  }
}

module.exports = { id: '008_filter_indexes', up };
