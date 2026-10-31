/**
 * Static info boxes on places (climate, budget, access, …).
 * entry_fee and best_time already exist — not added again.
 * Applied on boot via schema_migrations. Do not run by hand on production.
 */

async function up(db, { addColumnIfMissing }) {
  await addColumnIfMissing(db, 'places', 'climate_info', 'TEXT');
  await addColumnIfMissing(db, 'places', 'currency', 'TEXT');
  await addColumnIfMissing(db, 'places', 'budget_level', 'TEXT');
  await addColumnIfMissing(db, 'places', 'budget_amount', 'TEXT');
  await addColumnIfMissing(db, 'places', 'visit_duration', 'TEXT');
  await addColumnIfMissing(db, 'places', 'is_free', 'BOOLEAN DEFAULT false');
  await addColumnIfMissing(db, 'places', 'wheelchair_accessible', 'BOOLEAN');
  await addColumnIfMissing(db, 'places', 'family_friendly', 'BOOLEAN');
  await addColumnIfMissing(db, 'places', 'pet_friendly', 'BOOLEAN');
  await addColumnIfMissing(db, 'places', 'has_parking', 'BOOLEAN');
  await addColumnIfMissing(db, 'places', 'info_source_url', 'TEXT');
  await addColumnIfMissing(db, 'places', 'info_verified_at', 'TIMESTAMP');

  try {
    await db.exec(`
      ALTER TABLE places ADD CONSTRAINT places_budget_level_check
      CHECK (budget_level IS NULL OR budget_level IN ('low', 'medium', 'high'))
    `);
  } catch (err) {
    const code = err.code || err.pgCode;
    if (code !== '42710' && !/already exists/i.test(err.message || '')) throw err;
  }
}

module.exports = { id: '011_place_info_boxes', up };
