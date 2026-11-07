/**
 * Place detail sections (Step 4): best_months multi-select (1–12 JSON).
 * things_to_do / culture_food / travel_tips / best_time already exist.
 */

async function up(db, { addColumnIfMissing }) {
  await addColumnIfMissing(db, 'places', 'best_months', 'TEXT');
}

module.exports = { id: '022_place_detail_sections', up };
