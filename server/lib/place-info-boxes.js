/** Static place info boxes (admin-edited). Separate from live weather. */

const { sanitizeText } = require('./sanitize');

const BUDGET_LEVELS = new Set(['low', 'medium', 'high']);
const BUDGET_LABEL_KEYS = {
  low: 'infoBudgetLow',
  medium: 'infoBudgetMid',
  high: 'infoBudgetHigh',
};

function textOrEmpty(value) {
  if (value == null) return '';
  return String(value).trim();
}

function boolOrNull(value) {
  if (value === true || value === 1 || value === '1' || value === 'true') return true;
  if (value === false || value === 0 || value === '0' || value === 'false') return false;
  return null;
}

function isoOrNull(value) {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function localizedText(place, lang, base, enKey) {
  if (lang === 'en') {
    const en = textOrEmpty(place[enKey]);
    if (en) return en;
  }
  return textOrEmpty(place[base]);
}

/**
 * Boxes to show on the place page.
 * Empty/null text is omitted. Boolean null is omitted. false is shown.
 */
function buildPlaceInfoBoxes(place, lang = 'tr') {
  const p = place || {};
  const boxes = [];

  const climate = textOrEmpty(p.climateInfo);
  if (climate) boxes.push({ key: 'climate', labelKey: 'infoClimate', text: climate });

  const currency = textOrEmpty(p.currency);
  if (currency) boxes.push({ key: 'currency', labelKey: 'infoCurrency', text: currency });

  const level = textOrEmpty(p.budgetLevel);
  const amount = textOrEmpty(p.budgetAmount);
  const levelKey = BUDGET_LEVELS.has(level) ? BUDGET_LABEL_KEYS[level] : null;
  if (levelKey || amount) {
    boxes.push({
      key: 'budget',
      labelKey: 'infoBudget',
      levelKey,
      text: amount || null,
    });
  }

  const duration = textOrEmpty(p.visitDuration);
  if (duration) boxes.push({ key: 'visitDuration', labelKey: 'infoVisitDuration', text: duration });

  const best = localizedText(p, lang, 'bestTime', 'bestTimeEn');
  if (best) boxes.push({ key: 'bestTime', labelKey: 'infoBestTimeBox', text: best });

  const fee = localizedText(p, lang, 'entryFee', 'entryFeeEn');
  const isFree = p.isFree === true;
  if (isFree || fee) {
    boxes.push({
      key: 'entry',
      labelKey: 'infoEntryFee',
      valueKey: isFree ? 'infoFree' : null,
      text: isFree ? null : fee,
    });
  }

  const boolBox = (key, labelKey, value, yesKey, noKey) => {
    if (value !== true && value !== false) return;
    boxes.push({ key, labelKey, valueKey: value ? yesKey : noKey });
  };
  boolBox('wheelchair', 'infoWheelchair', p.wheelchairAccessible, 'infoVar', 'infoYok');
  boolBox('family', 'infoFamily', p.familyFriendly, 'infoYes', 'infoNo');
  boolBox('pets', 'infoPets', p.petFriendly, 'infoYes', 'infoNo');
  boolBox('parking', 'infoParking', p.hasParking, 'infoVar', 'infoYok');

  const verifiedAt = isoOrNull(p.infoVerifiedAt);
  return {
    boxes,
    verifiedAt: boxes.length && verifiedAt ? verifiedAt : null,
  };
}

function cleanOptionalText(value, maxLen) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const clean = sanitizeText(value, maxLen);
  return clean ? clean : null;
}

function cleanOptionalBool(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const parsed = boolOrNull(value);
  if (parsed === null) return { error: 'Evet/Hayır alanı geçersiz' };
  return parsed;
}

function cleanSourceUrl(value) {
  if (value === undefined) return undefined;
  if (value === null || String(value).trim() === '') return null;
  const clean = sanitizeText(value, 500);
  if (!clean) return null;
  let url;
  try {
    url = new URL(clean);
  } catch {
    return { error: 'Kaynak URL geçersiz' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { error: 'Kaynak URL http veya https olmalı' };
  }
  return url.toString();
}

/**
 * Validate PATCH /api/admin/places/:id/info.
 * Returns { error } or { values } ready for SQL (null clears a field).
 */
function normalizePlaceInfoPatch(body) {
  const src = body && typeof body === 'object' ? body : {};
  const values = {};

  const textFields = [
    ['climate_info', 'climateInfo', 2000],
    ['currency', 'currency', 80],
    ['budget_amount', 'budgetAmount', 120],
    ['visit_duration', 'visitDuration', 120],
    ['best_time', 'bestTime', 200],
    ['entry_fee', 'entryFee', 200],
  ];
  for (const [snake, camel, max] of textFields) {
    const raw = src[snake] !== undefined ? src[snake] : src[camel];
    const clean = cleanOptionalText(raw === undefined ? '' : raw, max);
    values[snake] = clean;
  }

  const levelRaw = src.budget_level !== undefined ? src.budget_level : src.budgetLevel;
  if (levelRaw == null || String(levelRaw).trim() === '') {
    values.budget_level = null;
  } else {
    const level = String(levelRaw).trim().toLowerCase();
    if (!BUDGET_LEVELS.has(level)) return { error: 'Bütçe seviyesi düşük, orta veya yüksek olmalı' };
    values.budget_level = level;
  }

  const isFreeRaw = src.is_free !== undefined ? src.is_free : src.isFree;
  const isFree = boolOrNull(isFreeRaw);
  values.is_free = isFree === true;

  const boolFields = [
    ['wheelchair_accessible', 'wheelchairAccessible'],
    ['family_friendly', 'familyFriendly'],
    ['pet_friendly', 'petFriendly'],
    ['has_parking', 'hasParking'],
  ];
  for (const [snake, camel] of boolFields) {
    const raw = src[snake] !== undefined ? src[snake] : src[camel];
    const parsed = cleanOptionalBool(raw === undefined ? null : raw);
    if (parsed && typeof parsed === 'object' && parsed.error) return { error: parsed.error };
    values[snake] = parsed;
  }

  const urlRaw = src.info_source_url !== undefined ? src.info_source_url : src.infoSourceUrl;
  const url = cleanSourceUrl(urlRaw === undefined ? '' : urlRaw);
  if (url && typeof url === 'object' && url.error) return { error: url.error };
  values.info_source_url = url;

  return { values };
}

function mapInfoColumns(row) {
  if (!row) return null;
  return {
    climateInfo: row.climate_info || null,
    currency: row.currency || null,
    budgetLevel: row.budget_level || null,
    budgetAmount: row.budget_amount || null,
    visitDuration: row.visit_duration || null,
    bestTime: row.best_time || null,
    bestTimeEn: row.best_time_en || null,
    entryFee: row.entry_fee || null,
    entryFeeEn: row.entry_fee_en || null,
    isFree: boolOrNull(row.is_free) === true,
    wheelchairAccessible: boolOrNull(row.wheelchair_accessible),
    familyFriendly: boolOrNull(row.family_friendly),
    petFriendly: boolOrNull(row.pet_friendly),
    hasParking: boolOrNull(row.has_parking),
    infoSourceUrl: row.info_source_url || null,
    infoVerifiedAt: isoOrNull(row.info_verified_at),
  };
}

module.exports = {
  BUDGET_LEVELS,
  boolOrNull,
  buildPlaceInfoBoxes,
  normalizePlaceInfoPatch,
  mapInfoColumns,
};
