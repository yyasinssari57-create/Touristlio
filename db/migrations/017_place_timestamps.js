/**
 * V4 Adım 3 — place lastmod needs a real timestamp.
 * created_at / updated_at stay empty on existing rows.
 * The sitemap uses the places.json snapshot date until a row is edited.
 * Do not stamp existing rows with the migration day.
 */

async function up(db, { addColumnIfMissing }) {
  await addColumnIfMissing(db, 'places', 'created_at', 'TEXT');
  await addColumnIfMissing(db, 'places', 'updated_at', 'TEXT');
}

module.exports = { id: '017_place_timestamps', up };
