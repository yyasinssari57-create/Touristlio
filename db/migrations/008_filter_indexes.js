/**
 * [ORTA-5] Filter/list indexes for PostgreSQL.
 * country/city TEXT, status instead of is_published, tiola_rating instead of score.
 */

async function up(db, { tableExists, columnExists }) {
  async function ensureIndex(indexName, table, columnsSql) {
    if (!(await tableExists(db, table))) return;
    await db.exec(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${table}(${columnsSql})`);
  }

  if (await tableExists(db, 'places')) {
    if (await columnExists(db, 'places', 'country')
      && await columnExists(db, 'places', 'city')
      && await columnExists(db, 'places', 'tiola_rating')) {
      await ensureIndex('idx_places_country_city_score', 'places', 'country, city, tiola_rating');
      await ensureIndex(
        'idx_places_country_city_score_lc',
        'places',
        'LOWER(country), LOWER(city), tiola_rating',
      );
    }
    if (await columnExists(db, 'places', 'category') && await columnExists(db, 'places', 'status')) {
      await ensureIndex('idx_places_category_published', 'places', 'category, status');
    }
    if (await columnExists(db, 'places', 'tiola_rating')) {
      await ensureIndex('idx_places_tiola_rating', 'places', 'tiola_rating');
    }
    if (await columnExists(db, 'places', 'categories')) {
      await ensureIndex('idx_places_categories', 'places', 'categories');
    }
  }

  if (await tableExists(db, 'blogs') && await columnExists(db, 'blogs', 'created_at')) {
    await ensureIndex('idx_blogs_created_at', 'blogs', 'created_at');
  }
}

module.exports = { id: '008_filter_indexes', up };
