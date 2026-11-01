/**
 * Stored Turkish FAQ / how-to-get kept the old "'e nasıl" template because
 * place-content skipped regeneration once five answers were saved.
 * Rewrites every place with the same helpers as the Ayasofya copy fix,
 * and translates Turkish leftovers in best_time_en / English FAQ.
 * city and country columns stay as filter keys.
 */

const { repairPlaceCopy } = require('../../server/lib/place-copy');
const logger = require('../../server/lib/logger');

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
  if (value == null) return null;
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

function same(a, b) {
  return stringifyIfObject(a) === stringifyIfObject(b);
}

async function up(db, { tableExists }) {
  if (!(await tableExists(db, 'places'))) return;

  const rows = await db.prepare(`
    SELECT id, name, city, country,
           location, description, history, tips, overview,
           things_to_do, culture_food, culture_food_en, travel_tips,
           how_to_get_there, how_to_get_there_en,
           faq_tr, faq_en,
           best_time, best_time_en,
           entry_fee, entry_fee_en
    FROM places
  `).all();

  const update = await db.prepare(`
    UPDATE places SET
      location = ?,
      description = ?,
      history = ?,
      tips = ?,
      overview = ?,
      things_to_do = ?,
      culture_food = ?,
      travel_tips = ?,
      how_to_get_there = ?,
      faq_tr = ?,
      faq_en = ?,
      best_time_en = ?
    WHERE id = ?
  `);

  const pending = [];
  for (const row of rows) {
    const place = {
      name: row.name,
      city: row.city,
      country: row.country,
      location: row.location,
      description: row.description,
      history: row.history,
      tips: row.tips,
      overview: row.overview,
      thingsToDo: parseMaybe(row.things_to_do),
      cultureFood: row.culture_food,
      cultureFoodEn: row.culture_food_en,
      travelTips: row.travel_tips,
      howToGetThere: row.how_to_get_there,
      howToGetThereEn: row.how_to_get_there_en,
      faqTR: parseMaybe(row.faq_tr) || [],
      faqEN: parseMaybe(row.faq_en) || [],
      bestTime: row.best_time,
      bestTimeEn: row.best_time_en,
      entryFee: row.entry_fee,
      entryFeeEn: row.entry_fee_en,
    };
    const fixed = repairPlaceCopy(place);
    const next = {
      location: fixed.location ?? null,
      description: fixed.description ?? null,
      history: fixed.history ?? null,
      tips: fixed.tips ?? null,
      overview: fixed.overview ?? null,
      thingsToDo: fixed.thingsToDo ?? null,
      cultureFood: fixed.cultureFood ?? null,
      travelTips: fixed.travelTips ?? null,
      howToGetThere: fixed.howToGetThere ?? null,
      faqTR: fixed.faqTR ?? [],
      faqEN: fixed.faqEN ?? [],
      bestTimeEn: fixed.bestTimeEn ?? null,
    };
    const changed = !same(row.location, next.location)
      || !same(row.description, next.description)
      || !same(row.history, next.history)
      || !same(row.tips, next.tips)
      || !same(row.overview, next.overview)
      || !same(parseMaybe(row.things_to_do), next.thingsToDo)
      || !same(row.culture_food, next.cultureFood)
      || !same(row.travel_tips, next.travelTips)
      || !same(row.how_to_get_there, next.howToGetThere)
      || !same(parseMaybe(row.faq_tr), next.faqTR)
      || !same(parseMaybe(row.faq_en), next.faqEN)
      || !same(row.best_time_en, next.bestTimeEn);
    if (!changed) continue;
    pending.push({ id: row.id, ...next });
  }

  const tx = db.transaction(async (list) => {
    for (const row of list) {
      await update.run(
        row.location,
        row.description,
        row.history,
        row.tips,
        row.overview,
        stringifyIfObject(row.thingsToDo),
        row.cultureFood,
        row.travelTips,
        row.howToGetThere,
        stringifyIfObject(row.faqTR),
        stringifyIfObject(row.faqEN),
        row.bestTimeEn,
        row.id,
      );
    }
  });
  await tx(pending);
  logger.info({ msg: 'place tr copy repaired', updated: pending.length, scanned: rows.length });
}

module.exports = { id: '014_place_tr_copy', up };
