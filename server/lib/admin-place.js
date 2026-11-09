const { db } = require('../db');
const { enrichContentFields } = require('./place-content');
const { sanitizeName, sanitizeText } = require('./sanitize');
const { uniquePlaceSlug, slugFromPlace } = require('./place-lookup');
const { boolOrNull, cleanSourceUrl } = require('./place-info-boxes');
const { assertCanPublish } = require('./publish-quality');
const { isImageVerifiedFlag } = require('./place-image');
const { duplicatesForPlace } = require('./image-usage');
const { placeEnTranslationComplete, PLACE_EN_MISSING_SQL } = require('./place-i18n');
const {
  parseBestMonths,
  normalizeBestMonths,
  bestTimeFromMonths,
} = require('./best-months');
const {
  TRASH_RETENTION_DAYS,
  SQL_TOUCH_CREATED_AT,
  notDeletedPlaceSql,
  normalizeIds,
} = require('./place-trash');
const {
  CATALOG_ISSUE_FILTERS,
  trashDaysLeft,
  notReadyReasons,
} = require('./place-catalog');

const VALID_STATUS = new Set(['published', 'draft', 'archived']);

/** Empty stays empty (caller keeps the stored value). Out of range throws. */
function parseOptionalCoord(value, min, max) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string' && value.trim() === '') return undefined;
  const n = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'));
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new Error('Enlem -90 ile 90, boylam -180 ile 180 arasında olmalı');
  }
  return n;
}

function parseJsonList(raw) {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeThingsList(value) {
  if (Array.isArray(value)) {
    return value.map((s) => sanitizeText(String(s || ''), 240)).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/\r?\n/)
      .map((s) => sanitizeText(s, 240))
      .filter(Boolean);
  }
  return [];
}

async function persistPlaceSlug(id, placeLike) {
  const slug = await uniquePlaceSlug(db, slugFromPlace(placeLike), id);
  await db.prepare('UPDATE places SET slug = ? WHERE id = ?').run(slug, id);
  return slug;
}

/** Kaynak URL gövdede varsa doğrula. Yoksa kayıtlı değer durur. */
function resolveInfoSource(src) {
  if (!src || (src.infoSourceUrl === undefined && src.info_source_url === undefined)) {
    return { provided: false, url: undefined };
  }
  const raw = src.infoSourceUrl !== undefined ? src.infoSourceUrl : src.info_source_url;
  const cleaned = cleanSourceUrl(raw);
  if (cleaned && typeof cleaned === 'object' && cleaned.error) {
    return { provided: true, error: cleaned.error };
  }
  return { provided: true, url: cleaned || null };
}

function imageVerifiedFrom(src, row) {
  if (src && src.imageVerified !== undefined) return src.imageVerified;
  if (src && src.image_verified !== undefined) return src.image_verified;
  if (row && Object.prototype.hasOwnProperty.call(row, 'image_verified')) return row.image_verified;
  if (row && Object.prototype.hasOwnProperty.call(row, 'imageVerified')) return row.imageVerified;
  return undefined;
}

function textOrNull(value, max) {
  if (value === undefined || value === null) return null;
  const cleaned = sanitizeText(value, max);
  return cleaned || null;
}

/**
 * Checkbox or upload sets the flag. A changed cover without an explicit flag
 * is unverified until someone confirms it belongs to this place.
 */
function resolveImageVerification(src, row, nextImageUrl) {
  const prevUrl = String(row?.image_url || '').trim();
  const nextUrl = String(nextImageUrl || '').trim();
  const urlChanged = nextUrl !== prevUrl;
  const explicit = src && (src.imageVerified !== undefined || src.image_verified !== undefined);
  let verified;
  if (explicit) verified = isImageVerifiedFlag(src.imageVerified !== undefined ? src.imageVerified : src.image_verified);
  else if (!row) verified = false;
  else if (urlChanged) verified = false;
  else verified = isImageVerifiedFlag(row.image_verified);

  const creditExplicit = src && (src.imageCredit !== undefined || src.image_credit !== undefined);
  const credit = creditExplicit
    ? textOrNull(src.imageCredit !== undefined ? src.imageCredit : src.image_credit, 180)
    : (row?.image_credit || null);

  const sourceExplicit = src && (src.imageSourceUrl !== undefined || src.image_source_url !== undefined);
  let sourceUrl;
  if (sourceExplicit) {
    sourceUrl = textOrNull(src.imageSourceUrl !== undefined ? src.imageSourceUrl : src.image_source_url, 500);
  } else if (urlChanged) {
    sourceUrl = nextUrl || null;
  } else {
    sourceUrl = row?.image_source_url || null;
  }
  if (sourceUrl && !/^https?:\/\//i.test(sourceUrl) && !(sourceUrl.startsWith('/') && !sourceUrl.startsWith('//'))) {
    sourceUrl = null;
  }

  let verifiedAt = null;
  if (verified) {
    if (row && isImageVerifiedFlag(row.image_verified) && !urlChanged && row.image_verified_at) {
      verifiedAt = row.image_verified_at instanceof Date
        ? row.image_verified_at.toISOString()
        : row.image_verified_at;
    } else {
      verifiedAt = new Date().toISOString();
    }
  }
  return { verified, credit, sourceUrl, verifiedAt };
}

async function persistImageVerification(id, meta) {
  await db.prepare(`
    UPDATE places
    SET image_credit = ?, image_source_url = ?, image_verified = ?, image_verified_at = ?
    WHERE id = ?
  `).run(meta.credit, meta.sourceUrl, !!meta.verified, meta.verifiedAt, id);
}

function mapAdminPlace(row) {
  let photos = [];
  try { photos = JSON.parse(row.photos || '[]'); } catch { photos = []; }
  return {
    id: row.id,
    name: row.name,
    slug: row.slug || null,
    location: row.location,
    country: row.country,
    city: row.city,
    district: row.district,
    category: row.category,
    imageUrl: row.image_url,
    description: row.description,
    descriptionEn: row.description_en,
    overview: row.overview || '',
    overviewEn: row.overview_en || '',
    searchAliases: parseJsonList(row.search_aliases),
    lat: row.lat,
    lng: row.lng,
    status: row.status || 'published',
    photos,
    isLocal: !!row.is_local,
    entryFee: row.entry_fee || '',
    bestTime: row.best_time || '',
    bestTimeEn: row.best_time_en || '',
    bestTimeNote: row.best_time || '',
    bestTimeNoteEn: row.best_time_en || '',
    bestMonths: parseBestMonths(row.best_months),
    thingsToDo: parseJsonList(row.things_to_do),
    thingsToDoEn: parseJsonList(row.things_to_do_en),
    cultureFood: row.culture_food || '',
    cultureFoodEn: row.culture_food_en || '',
    travelTips: row.travel_tips || row.tips || '',
    travelTipsEn: row.travel_tips_en || row.tips_en || '',
    history: row.history || '',
    climateInfo: row.climate_info || '',
    currency: row.currency || '',
    budgetLevel: row.budget_level || '',
    budgetAmount: row.budget_amount || '',
    visitDuration: row.visit_duration || '',
    isFree: boolOrNull(row.is_free) === true,
    wheelchairAccessible: boolOrNull(row.wheelchair_accessible),
    familyFriendly: boolOrNull(row.family_friendly),
    petFriendly: boolOrNull(row.pet_friendly),
    hasParking: boolOrNull(row.has_parking),
    infoSourceUrl: row.info_source_url || '',
    infoVerifiedAt: row.info_verified_at instanceof Date
      ? row.info_verified_at.toISOString()
      : (row.info_verified_at || null),
    imageCredit: row.image_credit || '',
    imageSourceUrl: row.image_source_url || '',
    imageVerified: isImageVerifiedFlag(row.image_verified),
    imageVerifiedAt: row.image_verified_at instanceof Date
      ? row.image_verified_at.toISOString()
      : (row.image_verified_at || null),
    deletedAt: row.deleted_at instanceof Date
      ? row.deleted_at.toISOString()
      : (row.deleted_at || null),
    inTrash: !!row.deleted_at,
    trashDaysLeft: row.deleted_at ? trashDaysLeft(row.deleted_at, TRASH_RETENTION_DAYS) : null,
    enTranslationMissing: !placeEnTranslationComplete(row),
    notReadyReasons: notReadyReasons(row),
  };
}

/** @deprecated prefer CATALOG_ISSUE_FILTERS — kept as alias for older callers */
const ISSUE_FILTERS = CATALOG_ISSUE_FILTERS;

async function listAdminPlaces({
  q, limit = 100, offset = 0, status, issue, enTranslation, includeArchived = false, trash = false,
} = {}) {
  let where = '1=1';
  const params = [];
  if (trash === true || status === 'trash') {
    where += ` AND NOT (${notDeletedPlaceSql('deleted_at')})`;
  } else {
    where += ` AND ${notDeletedPlaceSql('deleted_at')}`;
    if (status && VALID_STATUS.has(status)) {
      where += " AND COALESCE(status, 'published') = ?";
      params.push(status);
    } else if (!includeArchived) {
      where += " AND COALESCE(status, 'published') != 'archived'";
    }
  }
  if (issue && ISSUE_FILTERS[issue]) {
    where += ` AND (${ISSUE_FILTERS[issue]})`;
  }
  if (enTranslation === 'missing') {
    where += ` AND ${PLACE_EN_MISSING_SQL}`;
  }
  if (q) {
    where += ' AND (name LIKE ? OR city LIKE ? OR country LIKE ?)';
    const like = `%${sanitizeText(q, 80)}%`;
    params.push(like, like, like);
  }
  const lim = Math.min(Math.max(limit, 1), 500);
  const off = Math.max(offset, 0);
  const order = (trash === true || status === 'trash')
    ? 'deleted_at DESC NULLS LAST, id DESC'
    : 'id DESC';
  const rows = await db.prepare(`SELECT * FROM places WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...params, lim, off);
  const total = (await db.prepare(`SELECT COUNT(*) AS c FROM places WHERE ${where}`).get(...params)).c;
  return { places: rows.map(mapAdminPlace), total };
}

async function getAdminPlace(id) {
  const row = await db.prepare('SELECT * FROM places WHERE id = ?').get(id);
  if (!row) return null;
  let imageDuplicates = [];
  try {
    imageDuplicates = await duplicatesForPlace(row);
  } catch { /* index is optional for the form */ }
  return {
    ...mapAdminPlace(row),
    tiolaCount: await countPlaceTiolas(id),
    imageDuplicates,
    imageDuplicateCount: imageDuplicates.length,
  };
}

async function buildPlacePayload(body, existingId, opts = {}) {
  const {
    name, location, country, city, district, category,
    imageUrl, entryFee, entryFeeEn, bestTime, bestTimeEn, bestMonths,
    description, descriptionEn, overview, overviewEn,
    history, historyEn, thingsToDo, thingsToDoEn,
    cultureFood, cultureFoodEn, travelTips, travelTipsEn,
    tips, tipsEn, tags, searchAliases, categories, isLocal, lat, lng,
    status, photos,
  } = body || {};

  const safeName = sanitizeName(name);
  const safeCountry = sanitizeName(country, 120);
  const safeCity = sanitizeName(city, 120);
  const safeCategory = sanitizeText(category, 60);
  if (!safeName || !safeCountry || !safeCity || !safeCategory) {
    throw new Error('Ad, ülke, şehir ve kategori zorunlu');
  }
  if (status && !VALID_STATUS.has(status)) {
    throw new Error('Geçersiz durum (published, draft, archived)');
  }

  const id = existingId || ((await db.prepare('SELECT MAX(id) AS m FROM places').get()).m || 0) + 1;
  const fillPlaceholders = opts.fillPlaceholders !== false && !existingId;
  const months = bestMonths !== undefined ? normalizeBestMonths(bestMonths) : null;
  const derivedBestTr = months ? bestTimeFromMonths(months, 'tr') : null;
  const derivedBestEn = months ? bestTimeFromMonths(months, 'en') : null;
  const thingsList = thingsToDo !== undefined ? normalizeThingsList(thingsToDo) : thingsToDo;
  const thingsListEn = thingsToDoEn !== undefined ? normalizeThingsList(thingsToDoEn) : thingsToDoEn;
  const culture = cultureFood !== undefined
    ? (sanitizeText(cultureFood, 4000) || '')
    : cultureFood;
  const cultureEn = cultureFoodEn !== undefined
    ? (sanitizeText(cultureFoodEn, 4000) || '')
    : cultureFoodEn;
  const tipsTr = travelTips !== undefined || tips !== undefined
    ? (sanitizeText(travelTips ?? tips ?? '', 4000) || '')
    : (travelTips || tips);
  const tipsEnglish = travelTipsEn !== undefined || tipsEn !== undefined
    ? (sanitizeText(travelTipsEn ?? tipsEn ?? '', 4000) || '')
    : (travelTipsEn || tipsEn);

  const enriched = enrichContentFields({
    id,
    name: safeName,
    location: location || `${city}, ${country}`,
    country: safeCountry,
    city: safeCity,
    district: district ? sanitizeName(district, 120) : safeCity,
    category: safeCategory,
    imageUrl: imageUrl || '',
    isLocal: !!isLocal,
    entryFee: entryFee || (fillPlaceholders ? 'Ücretli' : (entryFee || '')),
    entryFeeEn,
    bestTime: derivedBestTr != null
      ? derivedBestTr
      : (bestTime != null ? bestTime : (fillPlaceholders ? 'Sabah erken' : '')),
    bestTimeEn: derivedBestEn != null ? (derivedBestEn || null) : bestTimeEn,
    bestMonths: months || [],
    description: description || '',
    descriptionEn,
    overview,
    overviewEn,
    history: history || '',
    historyEn,
    thingsToDo: thingsList,
    thingsToDoEn: thingsListEn,
    cultureFood: culture,
    cultureFoodEn: cultureEn,
    travelTips: tipsTr,
    travelTipsEn: tipsEnglish,
    tips: tipsTr,
    tipsEn: tipsEnglish,
    tags: tags || [],
    searchAliases: searchAliases || [],
    categories,
    lat,
    lng,
  }, id, { fillPlaceholders });

  if (months) {
    enriched.bestMonths = months;
    enriched.bestTime = derivedBestTr;
    enriched.bestTimeEn = derivedBestEn || null;
  } else if (enriched.bestMonths == null) {
    enriched.bestMonths = [];
  }

  return {
    enriched,
    status: status || 'published',
    photosJson: JSON.stringify(photos || enriched.photos || (enriched.imageUrl ? [enriched.imageUrl] : [])),
  };
}

async function insertPlace(body) {
  const src = { ...(body || {}) };
  if (src.lat !== undefined && src.lat !== null && src.lat !== '') {
    src.lat = parseOptionalCoord(src.lat, -90, 90);
  }
  if (src.lng !== undefined && src.lng !== null && src.lng !== '') {
    src.lng = parseOptionalCoord(src.lng, -180, 180);
  }
  const source = resolveInfoSource(src);
  if (source.error) throw new Error(source.error);
  const statusIn = src.status || 'published';
  const imageMeta = resolveImageVerification(src, null, src.imageUrl || src.image_url || '');
  assertCanPublish(null, {
    name: src.name,
    description: src.description,
    lat: src.lat,
    lng: src.lng,
    category: src.category,
    imageUrl: src.imageUrl || src.image_url,
    photos: src.photos,
    infoSourceUrl: source.provided ? source.url : null,
    infoVerifiedAt: src.infoVerifiedAt !== undefined ? src.infoVerifiedAt : src.info_verified_at,
    imageVerified: imageMeta.verified,
    image_verified: imageMeta.verified,
    status: statusIn,
  });
  const { enriched, status, photosJson } = await buildPlacePayload(src);
  const id = enriched.id;
  await db.prepare(`
    INSERT INTO places
    (id, name, location, country, city, district, category,
     image_url, is_local, entry_fee, entry_fee_en, best_time, best_time_en, best_months,
     description, description_en, overview, overview_en,
     history, history_en, things_to_do, things_to_do_en,
     culture_food, culture_food_en, travel_tips, travel_tips_en,
     how_to_get_there, how_to_get_there_en, photos,
     tips, tips_en, tags, search_aliases, categories, lat, lng, popularity, status,
     created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
  `).run(
    id,
    enriched.name,
    enriched.location,
    enriched.country,
    enriched.city,
    enriched.district,
    enriched.category,
    enriched.imageUrl,
    enriched.isLocal ? 1 : 0,
    enriched.entryFee,
    enriched.entryFeeEn || null,
    enriched.bestTime,
    enriched.bestTimeEn || null,
    JSON.stringify(normalizeBestMonths(enriched.bestMonths || [])),
    enriched.description,
    enriched.descriptionEn || null,
    enriched.overview,
    enriched.overviewEn || null,
    enriched.history,
    enriched.historyEn || null,
    JSON.stringify(enriched.thingsToDo || []),
    JSON.stringify(enriched.thingsToDoEn || []),
    enriched.cultureFood || null,
    enriched.cultureFoodEn || null,
    enriched.travelTips,
    enriched.travelTipsEn || null,
    enriched.howToGetThere || null,
    enriched.howToGetThereEn || null,
    photosJson,
    enriched.tips,
    enriched.tipsEn || null,
    JSON.stringify(enriched.tags || []),
    JSON.stringify(enriched.searchAliases || []),
    JSON.stringify(enriched.categories || [enriched.category]),
    enriched.lat,
    enriched.lng,
    0,
    status,
  );
  if (source.provided) {
    await db.prepare('UPDATE places SET info_source_url = ? WHERE id = ?').run(source.url, id);
  }
  await persistImageVerification(id, imageMeta);
  await persistPlaceSlug(id, enriched);
  try {
    const { syncPlaceGeom } = require('./place-geom');
    await syncPlaceGeom(db, id, enriched.lat, enriched.lng);
  } catch { /* PostGIS optional */ }
  return { id, name: enriched.name };
}

async function updatePlace(id, body) {
  const row = await db.prepare('SELECT * FROM places WHERE id = ?').get(id);
  if (!row) return null;
  const src = body || {};
  const lat = parseOptionalCoord(src.lat, -90, 90);
  const lng = parseOptionalCoord(src.lng, -180, 180);
  const descriptionChanged = src.description !== undefined
    && String(src.description ?? '') !== String(row.description || '');
  const descriptionEnChanged = src.descriptionEn !== undefined
    && String(src.descriptionEn ?? '') !== String(row.description_en || '');
  const overviewTouched = src.overview !== undefined
    && String(src.overview) !== String(row.overview || '');
  const overviewEnTouched = src.overviewEn !== undefined
    && String(src.overviewEn) !== String(row.overview_en || '');
  const merged = {
    name: src.name ?? row.name,
    location: src.location !== undefined ? src.location : row.location,
    country: src.country ?? row.country,
    city: src.city ?? row.city,
    district: src.district !== undefined ? src.district : row.district,
    category: src.category ?? row.category,
    imageUrl: src.imageUrl ?? src.image_url ?? row.image_url,
    description: src.description !== undefined ? src.description : row.description,
    descriptionEn: src.descriptionEn !== undefined ? src.descriptionEn : row.description_en,
    overview: overviewTouched ? src.overview : (descriptionChanged ? '' : row.overview),
    overviewEn: overviewEnTouched ? src.overviewEn : (descriptionEnChanged ? '' : row.overview_en),
    lat: lat !== undefined ? lat : row.lat,
    lng: lng !== undefined ? lng : row.lng,
    status: src.status ?? row.status ?? 'published',
    isLocal: src.isLocal ?? !!row.is_local,
    entryFee: src.entryFee ?? row.entry_fee,
    bestTime: src.bestTime !== undefined ? src.bestTime : row.best_time,
    bestTimeEn: src.bestTimeEn !== undefined ? src.bestTimeEn : row.best_time_en,
    bestMonths: src.bestMonths !== undefined ? src.bestMonths : parseBestMonths(row.best_months),
    history: src.history !== undefined ? src.history : row.history,
    thingsToDo: src.thingsToDo !== undefined ? src.thingsToDo : parseJsonList(row.things_to_do),
    thingsToDoEn: src.thingsToDoEn !== undefined ? src.thingsToDoEn : parseJsonList(row.things_to_do_en),
    cultureFood: src.cultureFood !== undefined ? src.cultureFood : row.culture_food,
    cultureFoodEn: src.cultureFoodEn !== undefined ? src.cultureFoodEn : row.culture_food_en,
    tips: src.tips !== undefined ? src.tips : row.tips,
    travelTips: src.travelTips !== undefined ? src.travelTips : row.travel_tips,
    travelTipsEn: src.travelTipsEn !== undefined ? src.travelTipsEn : row.travel_tips_en,
    searchAliases: src.searchAliases !== undefined ? src.searchAliases : parseJsonList(row.search_aliases),
    photos: src.photos ?? JSON.parse(row.photos || '[]'),
  };
  const source = resolveInfoSource(src);
  if (source.error) throw new Error(source.error);
  const infoSourceUrl = source.provided ? source.url : (row.info_source_url || null);
  const infoVerifiedAt = (src.infoVerifiedAt !== undefined || src.info_verified_at !== undefined)
    ? (src.infoVerifiedAt !== undefined ? src.infoVerifiedAt : src.info_verified_at)
    : row.info_verified_at;
  const imageMeta = resolveImageVerification(src, row, merged.imageUrl);
  assertCanPublish(row.status, {
    name: merged.name,
    description: merged.description,
    lat: merged.lat,
    lng: merged.lng,
    category: merged.category,
    imageUrl: merged.imageUrl,
    photos: merged.photos,
    infoSourceUrl,
    infoVerifiedAt,
    image_verified: imageMeta.verified,
    status: merged.status,
  });
  const { enriched, status, photosJson } = await buildPlacePayload(merged, id, { fillPlaceholders: false });
  const nextOverview = (overviewTouched || descriptionChanged) ? enriched.overview : row.overview;
  const nextOverviewEn = (overviewEnTouched || descriptionEnChanged)
    ? (enriched.overviewEn || null)
    : row.overview_en;
  const monthsJson = JSON.stringify(normalizeBestMonths(enriched.bestMonths || []));

  await db.prepare(`
    UPDATE places SET
      name = ?, location = ?, country = ?, city = ?, district = ?, category = ?,
      image_url = ?, is_local = ?, entry_fee = ?, best_time = ?, best_time_en = ?, best_months = ?,
      description = ?, description_en = ?, overview = ?, overview_en = ?,
      history = ?, tips = ?, travel_tips = ?,
      things_to_do = ?, culture_food = ?,
      photos = ?, search_aliases = ?, categories = ?, lat = ?, lng = ?, status = ?,
      info_source_url = ?,
      updated_at = NOW(),
      ${SQL_TOUCH_CREATED_AT}
    WHERE id = ?
  `).run(
    enriched.name,
    enriched.location,
    enriched.country,
    enriched.city,
    enriched.district,
    enriched.category,
    enriched.imageUrl,
    enriched.isLocal ? 1 : 0,
    enriched.entryFee,
    enriched.bestTime || null,
    enriched.bestTimeEn || null,
    monthsJson,
    enriched.description,
    enriched.descriptionEn || null,
    nextOverview,
    nextOverviewEn,
    enriched.history,
    enriched.tips,
    enriched.travelTips,
    JSON.stringify(enriched.thingsToDo || []),
    enriched.cultureFood || null,
    photosJson,
    JSON.stringify(enriched.searchAliases || []),
    JSON.stringify(enriched.categories || [enriched.category]),
    enriched.lat,
    enriched.lng,
    status,
    infoSourceUrl,
    id,
  );
  await persistImageVerification(id, imageMeta);
  const prevSlug = String(row.slug || '').trim();
  const nextSlug = await persistPlaceSlug(id, enriched);
  try {
    const { shouldRecordSlugRedirect, recordPlaceSlugRedirect } = require('./place-redirects');
    if (shouldRecordSlugRedirect(row.status, prevSlug, nextSlug)) {
      await recordPlaceSlugRedirect(prevSlug, nextSlug);
    }
  } catch { /* redirect table optional until migration 018 */ }
  try {
    const { syncPlaceGeom } = require('./place-geom');
    await syncPlaceGeom(db, id, enriched.lat, enriched.lng);
  } catch { /* PostGIS optional */ }
  return await getAdminPlace(id);
}

async function archivePlace(id) {
  const row = await db.prepare(`SELECT id FROM places WHERE id = ? AND ${notDeletedPlaceSql('deleted_at')}`).get(id);
  if (!row) return null;
  await db.prepare(`
    UPDATE places SET status = 'archived', updated_at = NOW(),
      ${SQL_TOUCH_CREATED_AT}
    WHERE id = ? AND ${notDeletedPlaceSql('deleted_at')}
  `).run(id);
  return { id, status: 'archived' };
}

/** Soft-archive many places in one UPDATE (admin bulk). Already-archived rows stay archived. */
async function archivePlaces(ids) {
  const validIds = normalizeIds(ids);
  if (!validIds.length) return [];
  return db.prepare(`
    UPDATE places SET status = 'archived', updated_at = NOW(),
      ${SQL_TOUCH_CREATED_AT}
    WHERE id = ANY(?::int[]) AND ${notDeletedPlaceSql('deleted_at')}
    RETURNING id, name
  `).all(validIds);
}

async function softDeletePlace(id) {
  const row = await db.prepare('SELECT id, name, status, deleted_at FROM places WHERE id = ?').get(id);
  if (!row) return null;
  if (row.deleted_at) {
    return {
      id: row.id,
      name: row.name,
      status: 'archived',
      deletedAt: row.deleted_at instanceof Date ? row.deleted_at.toISOString() : row.deleted_at,
      trashed: true,
      alreadyInTrash: true,
    };
  }
  const updated = await db.prepare(`
    UPDATE places
    SET deleted_at = NOW(), status = 'archived', updated_at = NOW(),
      ${SQL_TOUCH_CREATED_AT}
    WHERE id = ?
    RETURNING id, name, deleted_at
  `).get(id);
  return {
    id: updated.id,
    name: updated.name,
    status: 'archived',
    deletedAt: updated.deleted_at instanceof Date ? updated.deleted_at.toISOString() : updated.deleted_at,
    trashed: true,
    alreadyInTrash: false,
  };
}

async function softDeletePlaces(ids) {
  const validIds = normalizeIds(ids);
  if (!validIds.length) return [];
  return db.prepare(`
    UPDATE places
    SET deleted_at = NOW(), status = 'archived', updated_at = NOW(),
      ${SQL_TOUCH_CREATED_AT}
    WHERE id = ANY(?::int[]) AND ${notDeletedPlaceSql('deleted_at')}
    RETURNING id, name, deleted_at
  `).all(validIds);
}

async function restorePlaces(ids) {
  const validIds = normalizeIds(ids);
  if (!validIds.length) return [];
  return db.prepare(`
    UPDATE places
    SET deleted_at = NULL, status = 'draft', updated_at = NOW()
    WHERE id = ANY(?::int[]) AND deleted_at IS NOT NULL
    RETURNING id, name, status
  `).all(validIds);
}

async function countPlaceTiolas(id) {
  return (await db.prepare('SELECT COUNT(*) AS c FROM tiolas WHERE place_id = ?').get(id)).c;
}

/** Hard delete — trash purge / permanent delete only. */
async function deletePlace(id) {
  const row = await db.prepare('SELECT id, name FROM places WHERE id = ?').get(id);
  if (!row) return null;
  const tiolaCount = await countPlaceTiolas(id);

  const tx = db.transaction(async () => {
    await db.prepare('DELETE FROM place_live_data WHERE place_id = ?').run(id);
    await db.prepare('DELETE FROM saved_places WHERE place_id = ?').run(id);
    await db.prepare('DELETE FROM visited_places WHERE place_id = ?').run(id);
    await db.prepare('DELETE FROM travel_list_items WHERE place_id = ?').run(id);
    await db.prepare('DELETE FROM trip_plan_items WHERE place_id = ?').run(id);
    await db.prepare('DELETE FROM tiolas WHERE place_id = ?').run(id);
    await db.prepare('UPDATE blogs SET place_id = NULL WHERE place_id = ?').run(id);
    await db.prepare('DELETE FROM places WHERE id = ?').run(id);
  });
  await tx();

  return {
    id,
    deleted: true,
    name: row.name,
    tiolasRemoved: tiolaCount,
  };
}

async function permanentlyDeletePlaces(ids) {
  const validIds = normalizeIds(ids);
  const results = [];
  for (const id of validIds) {
    const row = await db.prepare('SELECT id FROM places WHERE id = ? AND deleted_at IS NOT NULL').get(id);
    if (!row) continue;
    const deleted = await deletePlace(id);
    if (deleted) results.push(deleted);
  }
  return results;
}

async function purgeExpiredTrash({ days = TRASH_RETENTION_DAYS } = {}) {
  const retention = Number.isFinite(Number(days)) && Number(days) > 0
    ? Math.floor(Number(days))
    : TRASH_RETENTION_DAYS;
  const due = await db.prepare(`
    SELECT id, name FROM places
    WHERE deleted_at IS NOT NULL
      AND deleted_at < NOW() - INTERVAL '${retention} days'
    ORDER BY deleted_at ASC
    LIMIT 200
  `).all();
  const purged = [];
  for (const row of due) {
    const deleted = await deletePlace(row.id);
    if (deleted) purged.push({ id: deleted.id, name: deleted.name });
  }
  return purged;
}

module.exports = {
  listAdminPlaces,
  getAdminPlace,
  insertPlace,
  updatePlace,
  archivePlace,
  archivePlaces,
  softDeletePlace,
  softDeletePlaces,
  restorePlaces,
  permanentlyDeletePlaces,
  purgeExpiredTrash,
  deletePlace,
  countPlaceTiolas,
  mapAdminPlace,
  parseOptionalCoord,
  VALID_STATUS,
  ISSUE_FILTERS,
  TRASH_RETENTION_DAYS,
};

