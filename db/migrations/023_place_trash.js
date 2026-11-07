/**
 * Soft-delete trash for places: deleted_at + 15-day purge.
 * Archive remains status='archived' with deleted_at IS NULL.
 */

async function up(db, { addColumnIfMissing, columnExists }) {
  await addColumnIfMissing(db, 'places', 'deleted_at', 'TIMESTAMPTZ');
  if (await columnExists(db, 'places', 'deleted_at')) {
    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_places_deleted_at
      ON places (deleted_at)
      WHERE deleted_at IS NOT NULL
    `);
  }
}

module.exports = {
  id: '023_place_trash',
  up,
};
