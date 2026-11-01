/**
 * FAZ4-8 — Ayasofya Turkish copy.
 * Replaces Istanbul / Turkey / Ayasofya'e in that place's Turkish prose
 * and the leftover "Sabah …" best-time line on the English page.
 * city and country columns stay as filter keys.
 */

const {
  fixTurkishProse,
  fixEnglishSabah,
  fixJsonTurkish,
  fixJsonEnglishSabah,
} = require('../../server/lib/tr-labels');

function parseMaybe(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function stringifyIfObject(value) {
  if (value == null) return value;
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

async function up(db, { tableExists }) {
  if (!(await tableExists(db, 'places'))) return;

  const rows = await db.prepare(`
    SELECT id, location, things_to_do, culture_food, how_to_get_there, faq_tr,
           overview, description, history, tips, travel_tips,
           best_time_en, faq_en
    FROM places
    WHERE slug = 'ayasofya-istanbul'
       OR (name = 'Ayasofya' AND city IN ('Istanbul', 'İstanbul'))
  `).all();

  const update = await db.prepare(`
    UPDATE places SET
      location = ?,
      things_to_do = ?,
      culture_food = ?,
      how_to_get_there = ?,
      faq_tr = ?,
      overview = ?,
      description = ?,
      history = ?,
      tips = ?,
      travel_tips = ?,
      best_time_en = ?,
      faq_en = ?
    WHERE id = ?
  `);

  for (const row of rows) {
    await update.run(
      fixTurkishProse(row.location),
      stringifyIfObject(fixJsonTurkish(parseMaybe(row.things_to_do))),
      fixTurkishProse(row.culture_food),
      fixTurkishProse(row.how_to_get_there),
      stringifyIfObject(fixJsonTurkish(parseMaybe(row.faq_tr))),
      fixTurkishProse(row.overview),
      fixTurkishProse(row.description),
      fixTurkishProse(row.history),
      fixTurkishProse(row.tips),
      fixTurkishProse(row.travel_tips),
      fixEnglishSabah(row.best_time_en),
      stringifyIfObject(fixJsonEnglishSabah(parseMaybe(row.faq_en))),
      row.id,
    );
  }
}

module.exports = { id: '013_ayasofya_tr_copy', up };
