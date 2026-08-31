/** Persist cached Tiola average + count on places (ORTA-1). */

function up(db, { addColumnIfMissing }) {
  addColumnIfMissing(db, 'places', 'tiola_count', 'INTEGER DEFAULT 0');
  addColumnIfMissing(db, 'places', 'tiola_rating', 'REAL');

  db.exec(`
    UPDATE places SET tiola_count = 0, tiola_rating = NULL
  `);

  const rows = db.prepare(`
    SELECT place_id AS placeId, COUNT(*) AS count, ROUND(AVG(stars), 1) AS avg
    FROM tiolas
    WHERE status = 'approved'
      AND parent_id IS NULL
      AND stars IS NOT NULL AND stars > 0
      AND place_id IS NOT NULL
    GROUP BY place_id
  `).all();

  const update = db.prepare(`
    UPDATE places SET tiola_count = ?, tiola_rating = ? WHERE id = ?
  `);
  const tx = db.transaction((list) => {
    for (const row of list) {
      update.run(row.count || 0, row.avg ?? null, row.placeId);
    }
  });
  tx(rows);
}

module.exports = { id: '006_place_tiola_stats', up };
