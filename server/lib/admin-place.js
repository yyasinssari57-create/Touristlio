const { db } = require('../db');
const { enrichContentFields } = require('./place-content');
const { sanitizeName, sanitizeText } = require('./sanitize');
const { uniquePlaceSlug, slugFromPlace } = require('./place-lookup');

const VALID_STATUS = new Set(['published', 'draft', 'archived']);

async function persistPlaceSlug(id, placeLike) {
  const slug = await uniquePlaceSlug(db, slugFromPlace(placeLike), id);
  await db.prepare('UPDATE places SET slug = ? WHERE id = ?').run(slug, id);
  return slug;
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
    lat: row.lat,
    lng: row.lng,
    status: row.status || 'published',
    photos,
    isLocal: !!row.is_local,
    entryFee: row.entry_fee || '',
    bestTime: row.best_time || '',
  };
}

const ISSUE_FILTERS = {
  noCoords: 'lat IS NULL OR lng IS NULL',
  noPhoto: "photos IS NULL OR photos = '[]' OR photos = ''",
  noFaq: "faq_tr IS NULL OR faq_tr = '[]'",
  shortDesc: 'length(description) < 80',
};

async function listAdminPlaces({ q, limit = 100, offset = 0, status, issue, includeArchived = false } = {}) {
  let where = '1=1';
  const params = [];
  if (status && VALID_STATUS.has(status)) {
    where += " AND COALESCE(status, 'published') = ?";
    params.push(status);
  } else if (!includeArchived) {
    where += " AND COALESCE(status, 'published') != 'archived'";
  }
  if (issue && ISSUE_FILTERS[issue]) {
    where += ` AND (${ISSUE_FILTERS[issue]})`;
  }
  if (q) {
    where += ' AND (name LIKE ? OR city LIKE ? OR country LIKE ?)';
    const like = `%${sanitizeText(q, 80)}%`;
    params.push(like, like, like);
  }
  const lim = Math.min(Math.max(limit, 1), 500);
  const off = Math.max(offset, 0);
  const rows = await db.prepare(`SELECT * FROM places WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, lim, off);
  const total = (await db.prepare(`SELECT COUNT(*) AS c FROM places WHERE ${where}`).get(...params)).c;
  return { places: rows.map(mapAdminPlace), total };
}

async function getAdminPlace(id) {
  const row = await db.prepare('SELECT * FROM places WHERE id = ?').get(id);
  if (!row) return null;
  return {
    ...mapAdminPlace(row),
    tiolaCount: await countPlaceTiolas(id),
  };
}

async function buildPlacePayload(body, existingId) {
  const {
    name, location, country, city, district, category,
    imageUrl, entryFee, entryFeeEn, bestTime, bestTimeEn,
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
    entryFee: entryFee || 'Ücretli',
    entryFeeEn,
    bestTime: bestTime || 'Sabah erken',
    bestTimeEn,
    description: description || safeName,
    descriptionEn,
    overview,
    overviewEn,
    history: history || '',
    historyEn,
    thingsToDo,
    thingsToDoEn,
    cultureFood,
    cultureFoodEn,
    travelTips: travelTips || tips,
    travelTipsEn: travelTipsEn || tipsEn,
    tips: tips || travelTips,
    tipsEn,
    tags: tags || [],
    searchAliases: searchAliases || [],
    categories,
    lat,
    lng,
  }, id);

  return {
    enriched,
    status: status || 'published',
    photosJson: JSON.stringify(photos || enriched.photos || (enriched.imageUrl ? [enriched.imageUrl] : [])),
  };
}

async function insertPlace(body) {
  const { enriched, status, photosJson } = await buildPlacePayload(body);
  const id = enriched.id;
  await db.prepare(`
    INSERT INTO places
    (id, name, location, country, city, district, category,
     image_url, is_local, entry_fee, entry_fee_en, best_time, best_time_en,
     description, description_en, overview, overview_en,
     history, history_en, things_to_do, things_to_do_en,
     culture_food, culture_food_en, travel_tips, travel_tips_en,
     how_to_get_there, how_to_get_there_en, photos,
     tips, tips_en, tags, search_aliases, categories, lat, lng, popularity, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
  const merged = {
    name: body.name ?? row.name,
    location: body.location ?? row.location,
    country: body.country ?? row.country,
    city: body.city ?? row.city,
    district: body.district ?? row.district,
    category: body.category ?? row.category,
    imageUrl: body.imageUrl ?? body.image_url ?? row.image_url,
    description: body.description ?? row.description,
    descriptionEn: body.descriptionEn ?? row.description_en,
    lat: body.lat ?? row.lat,
    lng: body.lng ?? row.lng,
    status: body.status ?? row.status ?? 'published',
    isLocal: body.isLocal ?? !!row.is_local,
    entryFee: body.entryFee ?? row.entry_fee,
    bestTime: body.bestTime ?? row.best_time,
    history: body.history ?? row.history,
    tips: body.tips ?? row.tips,
    travelTips: body.travelTips ?? row.travel_tips,
    searchAliases: body.searchAliases ?? JSON.parse(row.search_aliases || '[]'),
    photos: body.photos ?? JSON.parse(row.photos || '[]'),
  };
  const { enriched, status, photosJson } = await buildPlacePayload(merged, id);

  await db.prepare(`
    UPDATE places SET
      name = ?, location = ?, country = ?, city = ?, district = ?, category = ?,
      image_url = ?, is_local = ?, entry_fee = ?, best_time = ?,
      description = ?, description_en = ?, history = ?, tips = ?, travel_tips = ?,
      photos = ?, search_aliases = ?, categories = ?, lat = ?, lng = ?, status = ?
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
    enriched.bestTime,
    enriched.description,
    enriched.descriptionEn || null,
    enriched.history,
    enriched.tips,
    enriched.travelTips,
    photosJson,
    JSON.stringify(enriched.searchAliases || []),
    JSON.stringify(enriched.categories || [enriched.category]),
    enriched.lat,
    enriched.lng,
    status,
    id,
  );
  await persistPlaceSlug(id, enriched);
  try {
    const { syncPlaceGeom } = require('./place-geom');
    await syncPlaceGeom(db, id, enriched.lat, enriched.lng);
  } catch { /* PostGIS optional */ }
  return await getAdminPlace(id);
}

async function archivePlace(id) {
  const row = await db.prepare('SELECT id FROM places WHERE id = ?').get(id);
  if (!row) return null;
  await db.prepare("UPDATE places SET status = 'archived' WHERE id = ?").run(id);
  return { id, status: 'archived' };
}

async function countPlaceTiolas(id) {
  return (await db.prepare('SELECT COUNT(*) AS c FROM tiolas WHERE place_id = ?').get(id)).c;
}

/** Hard delete — not used by admin HTTP. Panel DELETE archives via archivePlace. */
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

module.exports = {
  listAdminPlaces,
  getAdminPlace,
  insertPlace,
  updatePlace,
  archivePlace,
  deletePlace,
  countPlaceTiolas,
  mapAdminPlace,
  VALID_STATUS,
  ISSUE_FILTERS,
};
