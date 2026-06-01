const { fallbackImageUrl, poolForCategory, photoUrl, hashStr } = require('./photo-pools');

const DEFAULT_IMAGE = fallbackImageUrl('landmark', 0);

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

module.exports = { DEFAULT_IMAGE, CAT_IMG, resolvePlaceImageUrl, fallbackImageUrl };
