/** One star-vote per user per place (ORTA-4 duplicate vote prevention). */

async function up(db) {
  const dups = await db.prepare(`
    SELECT user_id AS "userId", place_id AS "placeId", MIN(id) AS "keepId", COUNT(*) AS c
    FROM tiolas
    WHERE parent_id IS NULL
      AND place_id IS NOT NULL
      AND stars IS NOT NULL AND stars > 0
      AND status NOT IN ('rejected', 'deleted')
    GROUP BY user_id, place_id
    HAVING COUNT(*) > 1
  `).all();

  const mark = db.prepare(`
    UPDATE tiolas SET status = 'deleted', moderated_at = datetime('now')
    WHERE user_id = ? AND place_id = ? AND id != ?
      AND parent_id IS NULL
      AND stars IS NOT NULL AND stars > 0
      AND status NOT IN ('rejected', 'deleted')
  `);
  for (const row of dups) {
    await mark.run(row.userId, row.placeId, row.keepId);
  }

  await db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tiolas_unique_user_place_vote
    ON tiolas(user_id, place_id)
    WHERE parent_id IS NULL
      AND place_id IS NOT NULL
      AND stars IS NOT NULL AND stars > 0
      AND status NOT IN ('rejected', 'deleted')
  `);
}

module.exports = { id: '007_tiola_unique_vote', up };
