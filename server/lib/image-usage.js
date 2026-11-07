const { db } = require('../db');
const { sanitizeText } = require('./sanitize');
const { hasStoredImage, parsePhotoList, isImageVerifiedFlag } = require('./place-image');

const UNVERIFIED_PUBLISHED_SQL = `image_verified IS NOT TRUE AND COALESCE(status, 'published') = 'published'`;

function safeDecode(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

function imageKey(url) {
  const raw = String(url || '').trim();
  if (!hasStoredImage(raw)) return '';
  const unsplash = raw.match(/unsplash\.com\/(photo-[A-Za-z0-9_-]+)/i);
  if (unsplash) return `unsplash:${unsplash[1].toLowerCase()}`;
  if (raw.startsWith('/') && !raw.startsWith('//')) {
    return `path:${safeDecode(raw.split('?')[0]).replace(/\/+$/, '').toLowerCase()}`;
  }
  try {
    const u = new URL(raw);
    const path = safeDecode(u.pathname).replace(/\/+$/, '').toLowerCase();
    return `url:${u.host.toLowerCase()}${path}`;
  } catch {
    return `raw:${raw.split('?')[0].toLowerCase()}`;
  }
}

function urlsOfRow(row) {
  return [
    row?.image_url,
    row?.imageUrl,
    ...parsePhotoList(row?.photos),
  ].map((url) => String(url || '').trim()).filter(hasStoredImage);
}

function isStoredFileUrl(url) {
  const u = String(url || '');
  return u.startsWith('/uploads/') || /\/uploads\//i.test(u) || /supabase\.co\/storage\//i.test(u);
}

function cleanPublicImageUrl(value) {
  const s = sanitizeText(value, 500);
  if (!s) return '';
  if (/^javascript:/i.test(s) || /^data:/i.test(s)) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('/') && !s.startsWith('//')) return s;
  return '';
}

async function loadImageIndex() {
  const rows = await db.prepare(`
    SELECT id, name, slug, status, image_url, photos, image_verified, image_credit, image_source_url
    FROM places
  `).all();
  const byKey = new Map();
  for (const row of rows) {
    const seen = new Set();
    for (const url of urlsOfRow(row)) {
      const key = imageKey(url);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push({
        id: row.id,
        name: row.name,
        slug: row.slug || null,
        url,
        verified: isImageVerifiedFlag(row.image_verified),
        credit: row.image_credit || '',
        sourceUrl: row.image_source_url || '',
        status: row.status || 'published',
      });
    }
  }
  return { rows, byKey };
}

function placesForKey(index, url, excludeId) {
  const key = imageKey(url);
  if (!key) return [];
  const list = index.byKey.get(key) || [];
  const skip = Number(excludeId);
  return list.filter((place) => !Number.isFinite(skip) || skip <= 0 || place.id !== skip);
}

async function findPlacesUsingImage(url, excludeId) {
  const index = await loadImageIndex();
  return placesForKey(index, url, excludeId).map((place) => ({
    id: place.id,
    name: place.name,
    slug: place.slug,
  }));
}

async function duplicatesForPlace(row) {
  const index = await loadImageIndex();
  const map = new Map();
  for (const url of urlsOfRow(row)) {
    for (const place of placesForKey(index, url, row?.id)) {
      map.set(place.id, { id: place.id, name: place.name, slug: place.slug });
    }
  }
  return [...map.values()];
}

function externalMediaItems(index) {
  const items = [];
  for (const [key, places] of index.byKey.entries()) {
    const sample = places[0];
    if (!sample) continue;
    let filename = sample.url;
    try {
      const u = new URL(sample.url);
      const leaf = u.pathname.split('/').filter(Boolean).pop() || u.host;
      filename = safeDecode(leaf);
    } catch { /* keep raw */ }
    items.push({
      path: '',
      url: sample.url,
      filename,
      placeId: places[0]?.id || null,
      placeName: places[0]?.name || '',
      places: places.map((place) => ({ id: place.id, name: place.name, slug: place.slug })),
      sizeBytes: 0,
      modifiedAt: '',
      source: isStoredFileUrl(sample.url) ? 'storage' : 'external',
      key,
      verified: places.some((place) => place.verified),
      duplicate: places.length > 1,
    });
  }
  return items;
}

function attachUsage(item, index) {
  const keys = [imageKey(item.url), imageKey(item.path ? `/${String(item.path).replace(/^\/+/, '')}` : '')];
  const seen = new Set();
  const places = [];
  for (const key of keys) {
    if (!key) continue;
    for (const place of index.byKey.get(key) || []) {
      if (seen.has(place.id)) continue;
      seen.add(place.id);
      places.push({ id: place.id, name: place.name, slug: place.slug });
    }
  }
  return {
    ...item,
    source: item.source || 'storage',
    places,
    placeId: item.placeId || places[0]?.id || null,
    placeName: places[0]?.name || '',
    duplicate: places.length > 1,
    verified: (index.byKey.get(imageKey(item.url)) || []).some((place) => place.verified),
  };
}

async function replacePlaceImage({ placeId, fromUrl, toUrl, imageCredit }) {
  const row = await db.prepare('SELECT id, name, image_url, photos, image_credit FROM places WHERE id = ?').get(placeId);
  if (!row) return null;
  const fromKey = imageKey(fromUrl);
  if (!fromKey) {
    const err = new Error('Değiştirilecek görsel yok');
    err.statusCode = 400;
    throw err;
  }
  const nextUrl = cleanPublicImageUrl(toUrl);
  if (!nextUrl) {
    const err = new Error('Yeni görsel adresi geçersiz');
    err.statusCode = 400;
    throw err;
  }
  const current = urlsOfRow(row);
  if (!current.some((url) => imageKey(url) === fromKey)) {
    const err = new Error('Bu görsel bu mekânda kayıtlı değil');
    err.statusCode = 400;
    throw err;
  }
  const photos = [];
  const seen = new Set();
  const coverSource = imageKey(row.image_url) === fromKey ? nextUrl : (row.image_url || nextUrl);
  for (const url of [coverSource, ...current.map((url) => (imageKey(url) === fromKey ? nextUrl : url)), nextUrl]) {
    if (!hasStoredImage(url)) continue;
    const key = imageKey(url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    photos.push(url);
  }
  const imageUrl = photos[0] || nextUrl;
  const credit = imageCredit !== undefined && imageCredit !== null
    ? (sanitizeText(imageCredit, 180) || null)
    : (row.image_credit || null);
  const verifiedAt = new Date().toISOString();
  await db.prepare(`
    UPDATE places
    SET image_url = ?, photos = ?, image_verified = ?, image_verified_at = ?,
        image_source_url = ?, image_credit = ?, updated_at = NOW()
    WHERE id = ?
  `).run(
    imageUrl,
    JSON.stringify(photos),
    true,
    verifiedAt,
    nextUrl,
    credit,
    placeId,
  );
  return { id: row.id, name: row.name, imageUrl, photos, imageCredit: credit, imageVerified: true };
}

module.exports = {
  UNVERIFIED_PUBLISHED_SQL,
  imageKey,
  urlsOfRow,
  isStoredFileUrl,
  cleanPublicImageUrl,
  loadImageIndex,
  placesForKey,
  findPlacesUsingImage,
  duplicatesForPlace,
  externalMediaItems,
  attachUsage,
  replacePlaceImage,
};
