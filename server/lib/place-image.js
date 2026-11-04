const { fallbackImageUrl, poolForCategory, photoUrl } = require('./photo-pools');

const DEFAULT_IMAGE = fallbackImageUrl('landmark', 0);
const PLACEHOLDER_IMAGE = '/images/place-placeholder.svg';

const CAT_IMG = {};
for (const cat of ['landmark', 'museum', 'restaurant', 'cafe', 'beach', 'nature', 'park', 'viewpoint', 'religious', 'market', 'shopping', 'nightlife', 'adventure', 'spa']) {
  const pool = poolForCategory(cat);
  CAT_IMG[cat] = photoUrl(pool[0]);
}

function resolvePlaceImageUrl(imageUrl, category, placeId = 0) {
  const url = String(imageUrl || '').trim();
  if (url.startsWith('http') && !/undefined|null|placeholder/i.test(url)) {
    return url;
  }
  return fallbackImageUrl(category, placeId);
}

function isPlaceholderImage(url) {
  return /place-placeholder\.svg(?:$|\?|#)/i.test(String(url || ''));
}

function isImageVerifiedFlag(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

/** Real stored file or remote URL. Category pools and the neutral placeholder do not count. */
function hasStoredImage(url) {
  const s = String(url || '').trim();
  if (!s) return false;
  if (/^(undefined|null|placeholder|none)$/i.test(s)) return false;
  if (isPlaceholderImage(s)) return false;
  if (/^javascript:/i.test(s)) return false;
  if (s.startsWith('//')) return false;
  return /^https?:\/\//i.test(s) || (s.startsWith('/') && !s.startsWith('//'));
}

function photoItemUrl(item) {
  if (typeof item === 'string') return item.trim();
  if (item && typeof item === 'object') return String(item.url || item.src || '').trim();
  return '';
}

function parsePhotoList(value) {
  let list = value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      list = Array.isArray(parsed) ? parsed : [trimmed];
    } catch {
      list = [trimmed];
    }
  }
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const url = photoItemUrl(item);
    if (!hasStoredImage(url) || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

function storedPlaceImages(source) {
  if (!source || typeof source !== 'object') return [];
  const cover = source.imageUrl || source.image_url || source.heroImage || source.hero_image || '';
  const photos = parsePhotoList(source.photos);
  const out = [];
  const seen = new Set();
  for (const url of [cover, ...photos]) {
    const clean = String(url || '').trim();
    if (!hasStoredImage(clean) || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}

/**
 * Seed and import may fill an empty cover or gallery.
 * A filled cover, a filled gallery, or an admin upload is left as-is.
 */
function mergePlaceImages(existing, incoming) {
  const kept = storedPlaceImages(existing);
  if (kept.length) {
    const cover = hasStoredImage(existing?.imageUrl || existing?.image_url || existing?.hero_image || existing?.heroImage)
      ? String(existing.imageUrl || existing.image_url || existing.hero_image || existing.heroImage).trim()
      : kept[0];
    return { imageUrl: cover, photos: kept, keptExisting: true };
  }
  const fresh = storedPlaceImages(incoming);
  return {
    imageUrl: fresh[0] || '',
    photos: fresh,
    keptExisting: false,
  };
}

/**
 * Public site: published places show a verified image, otherwise the neutral placeholder.
 * The category Unsplash pool is not a place photo.
 */
function publicPlaceMedia(row) {
  const verified = isImageVerifiedFlag(row?.image_verified ?? row?.imageVerified);
  const stored = storedPlaceImages({
    imageUrl: row?.image_url || row?.imageUrl,
    photos: row?.photos,
  });
  if (verified && stored.length) {
    const credit = String(row?.image_credit || row?.imageCredit || '').trim();
    const source = String(row?.image_source_url || row?.imageSourceUrl || '').trim();
    return {
      imageUrl: stored[0],
      photos: stored,
      imageVerified: true,
      imageCredit: credit || null,
      imageSourceUrl: source || null,
    };
  }
  return {
    imageUrl: PLACEHOLDER_IMAGE,
    photos: [],
    imageVerified: false,
    imageCredit: null,
    imageSourceUrl: null,
  };
}

module.exports = {
  DEFAULT_IMAGE,
  CAT_IMG,
  PLACEHOLDER_IMAGE,
  resolvePlaceImageUrl,
  fallbackImageUrl,
  isPlaceholderImage,
  isImageVerifiedFlag,
  hasStoredImage,
  parsePhotoList,
  storedPlaceImages,
  mergePlaceImages,
  publicPlaceMedia,
};
