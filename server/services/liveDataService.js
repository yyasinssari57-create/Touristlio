const { db } = require('../db');
const { parseEntryFeeTry } = require('../lib/currency');

function estimateBudget(place) {
  const entryTry = parseEntryFeeTry(place.entryFee) || 150;
  const mealLow = 200;
  const mealMid = 450;
  const hotelLow = 800;
  const hotelMid = 1800;
  return {
    dailyBudgetTry: { low: entryTry + mealLow, mid: entryTry + mealMid + 300, high: entryTry + mealMid + hotelMid },
    entryTry,
    mealRangeTry: { low: mealLow, mid: mealMid },
    hotelRangeTry: { low: hotelLow, mid: hotelMid },
    source: 'estimated',
  };
}

function getLiveData(placeId, placeRow, mapPlace) {
  const row = db.prepare('SELECT * FROM place_live_data WHERE place_id = ?').get(placeId);
  const place = placeRow ? mapPlace(placeRow) : null;
  const estimated = estimateBudget(place || {});

  if (row) {
    let extra = {};
    try { extra = JSON.parse(row.payload || '{}'); } catch { /* ignore */ }
    return {
      placeId,
      budget: extra.budget || estimated.dailyBudgetTry,
      hotel: extra.hotel || { avgPriceTry: estimated.hotelRangeTry.mid, note: 'estimated' },
      crowd: extra.crowd || row.crowd_level || 'moderate',
      updatedAt: row.updated_at,
      source: row.source || 'cache',
      fallback: false,
      ...extra,
    };
  }

  return {
    placeId,
    budget: estimated.dailyBudgetTry,
    hotel: { avgPriceTry: estimated.hotelRangeTry.mid, rangeTry: estimated.hotelRangeTry, note: 'estimated' },
    meal: estimated.mealRangeTry,
    entryTry: estimated.entryTry,
    crowd: 'moderate',
    updatedAt: new Date().toISOString(),
    source: 'estimated',
    fallback: true,
  };
}

function upsertLiveData(placeId, payload) {
  db.prepare(`
    INSERT INTO place_live_data (place_id, payload, crowd_level, source, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(place_id) DO UPDATE SET
      payload = excluded.payload,
      crowd_level = excluded.crowd_level,
      source = excluded.source,
      updated_at = datetime('now')
  `).run(placeId, JSON.stringify(payload), payload.crowd || 'moderate', payload.source || 'cron');
}

function refreshAllPlaces() {
  const rows = db.prepare('SELECT id, entry_fee, category, country FROM places').all();
  let n = 0;
  for (const r of rows) {
    const est = estimateBudget({ entryFee: r.entry_fee, category: r.category, country: r.country });
    upsertLiveData(r.id, { budget: est.dailyBudgetTry, hotel: { avgPriceTry: est.hotelRangeTry.mid }, crowd: 'moderate', source: 'cron' });
    n++;
  }
  return n;
}

module.exports = { getLiveData, upsertLiveData, refreshAllPlaces, estimateBudget };
