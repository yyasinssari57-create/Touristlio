const { db } = require('../db');
const { parseEntryFeeTry } = require('../lib/currency');
const { sanitizeText } = require('../lib/sanitize');

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
      budget: extra.budget
        ? { ...estimated.dailyBudgetTry, ...extra.budget }
        : estimated.dailyBudgetTry,
      hotel: extra.hotel
        ? { avgPriceTry: estimated.hotelRangeTry.mid, note: 'estimated', ...extra.hotel }
        : { avgPriceTry: estimated.hotelRangeTry.mid, note: 'estimated' },
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

function parsePayload(row) {
  if (!row?.payload) return {};
  try { return JSON.parse(row.payload); } catch { return {}; }
}

function getAdminPayload(placeId) {
  const row = db.prepare('SELECT payload FROM place_live_data WHERE place_id = ?').get(placeId);
  return parsePayload(row);
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

function hasText(v) {
  return v != null && String(v).trim() !== '';
}

function mergeWeather(apiWeather, adminPayload) {
  const w = adminPayload?.weather;
  if (!w || (!hasText(w.label) && (w.tempC == null || w.tempC === ''))) return apiWeather;
  return {
    ...apiWeather,
    label: hasText(w.label) ? w.label : apiWeather?.label,
    tempC: w.tempC != null && Number.isFinite(Number(w.tempC)) ? Number(w.tempC) : apiWeather?.tempC,
    fallback: false,
    adminOverride: true,
  };
}

function mergeLocalInfo(apiLocalInfo, adminPayload) {
  const li = adminPayload?.localInfo;
  if (!li) return apiLocalInfo;
  const currency = { ...(apiLocalInfo?.currency || {}) };
  if (hasText(li.currencyCode)) currency.code = li.currencyCode.trim();
  if (hasText(li.currencySymbol)) currency.symbol = li.currencySymbol.trim();
  const hasOverride = hasText(li.localTime) || hasText(li.currencyCode) || hasText(li.currencySymbol);
  if (!hasOverride) return apiLocalInfo;
  return {
    ...apiLocalInfo,
    localTime: hasText(li.localTime) ? li.localTime.trim() : apiLocalInfo?.localTime,
    currency,
    adminOverride: true,
  };
}

function mergeInfoPanel(place, adminPayload, lang) {
  const ip = adminPayload?.infoPanel;
  if (!ip) return place;
  const merged = { ...place };
  if (hasText(ip.country)) merged.country = ip.country.trim();
  if (hasText(ip.city)) merged.city = ip.city.trim();
  if (hasText(ip.categoryLabel)) merged.categoryDisplay = ip.categoryLabel.trim();
  if (hasText(ip.entryFee)) {
    merged.entryFee = ip.entryFee.trim();
    if (lang === 'en' && hasText(ip.entryFeeEn)) merged.entryFeeEn = ip.entryFeeEn.trim();
  }
  if (hasText(ip.bestTime)) {
    merged.bestTime = ip.bestTime.trim();
    if (lang === 'en' && hasText(ip.bestTimeEn)) merged.bestTimeEn = ip.bestTimeEn.trim();
  }
  if (Object.keys(ip).some((k) => hasText(ip[k]))) merged.infoPanelOverride = true;
  return merged;
}

function buildInfoBoxesResponse(payload) {
  const w = payload.weather || {};
  const li = payload.localInfo || {};
  const ip = payload.infoPanel || {};
  return {
    weatherLabel: w.label || '',
    weatherTempC: w.tempC != null ? w.tempC : '',
    localTime: li.localTime || '',
    currencyCode: li.currencyCode || '',
    currencySymbol: li.currencySymbol || '',
    budgetLow: payload.budget?.low || '',
    budgetMid: payload.budget?.mid || '',
    hotelAvg: payload.hotel?.avgPriceTry || '',
    crowd: payload.crowd || '',
    infoCountry: ip.country || '',
    infoCity: ip.city || '',
    infoCategoryLabel: ip.categoryLabel || '',
    infoEntryFee: ip.entryFee || '',
    infoBestTime: ip.bestTime || '',
    adminOverride: !!payload.adminOverride,
  };
}

function applyInfoBoxUpdates(existingPayload, body) {
  const payload = { ...existingPayload };
  const setNested = (key, field, value, maxLen) => {
    if (value === undefined) return;
    payload[key] = payload[key] || {};
    if (value === '' || value === null) {
      delete payload[key][field];
      if (!Object.keys(payload[key]).length) delete payload[key];
      return;
    }
    const clean = typeof value === 'number'
      ? value
      : (maxLen ? sanitizeText(String(value), maxLen) : String(value).trim());
    if (clean === '' || clean == null) {
      delete payload[key][field];
      if (!Object.keys(payload[key]).length) delete payload[key];
    } else {
      payload[key][field] = clean;
    }
  };

  const {
    weatherLabel, weatherTempC,
    localTime, currencyCode, currencySymbol,
    budgetLow, budgetMid, hotelAvg, crowd,
    infoCountry, infoCity, infoCategoryLabel, infoEntryFee, infoBestTime,
  } = body || {};

  setNested('weather', 'label', weatherLabel, 80);
  if (weatherTempC !== undefined) {
    const n = Number(weatherTempC);
    setNested('weather', 'tempC', weatherTempC === '' || weatherTempC === null ? '' : (Number.isFinite(n) ? n : null), 0);
  }

  setNested('localInfo', 'localTime', localTime, 80);
  setNested('localInfo', 'currencyCode', currencyCode, 12);
  setNested('localInfo', 'currencySymbol', currencySymbol, 8);

  setNested('infoPanel', 'country', infoCountry, 120);
  setNested('infoPanel', 'city', infoCity, 120);
  setNested('infoPanel', 'categoryLabel', infoCategoryLabel, 80);
  setNested('infoPanel', 'entryFee', infoEntryFee, 120);
  setNested('infoPanel', 'bestTime', infoBestTime, 120);

  const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  };

  if (budgetLow !== undefined || budgetMid !== undefined) {
    payload.budget = payload.budget || {};
    if (budgetLow !== undefined) {
      const low = budgetLow === '' || budgetLow === null ? null : toNum(budgetLow);
      if (low) payload.budget.low = low;
      else delete payload.budget.low;
    }
    if (budgetMid !== undefined) {
      const mid = budgetMid === '' || budgetMid === null ? null : toNum(budgetMid);
      if (mid) payload.budget.mid = mid;
      else delete payload.budget.mid;
    }
    if (!Object.keys(payload.budget).length) delete payload.budget;
  }

  if (hotelAvg !== undefined) {
    const hotel = hotelAvg === '' || hotelAvg === null ? null : toNum(hotelAvg);
    if (hotel) payload.hotel = { ...(payload.hotel || {}), avgPriceTry: hotel, note: 'admin' };
    else if (payload.hotel) {
      delete payload.hotel.avgPriceTry;
      if (!Object.keys(payload.hotel).length) delete payload.hotel;
    }
  }

  if (crowd !== undefined) {
    if (crowd === '' || crowd === null) delete payload.crowd;
    else payload.crowd = sanitizeText(crowd, 40);
  }

  const hasOverride = !!(payload.weather || payload.localInfo || payload.budget || payload.hotel || payload.infoPanel || payload.crowd);
  if (hasOverride) {
    payload.adminOverride = true;
    payload.source = 'admin';
  } else {
    delete payload.adminOverride;
    if (payload.source === 'admin') payload.source = 'cron';
  }

  return payload;
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


module.exports = {
  getLiveData,
  upsertLiveData,
  refreshAllPlaces,
  estimateBudget,
  getAdminPayload,
  mergeWeather,
  mergeLocalInfo,
  mergeInfoPanel,
  buildInfoBoxesResponse,
  applyInfoBoxUpdates,
};
