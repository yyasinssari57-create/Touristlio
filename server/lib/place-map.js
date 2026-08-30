const { resolvePlaceImageUrl } = require('./place-image');

function parseJson(val, fallback) {
  try {
    return JSON.parse(val || 'null') ?? fallback;
  } catch {
    return fallback;
  }
}

function mapPlaceRow(row, stats) {
  const searchAliases = parseJson(row.search_aliases, []);
  const tags = parseJson(row.tags, []);
  const categories = parseJson(row.categories, [row.category].filter(Boolean));
  const thingsToDo = parseJson(row.things_to_do, []);
  const thingsToDoEn = parseJson(row.things_to_do_en, []);
  const photos = parseJson(row.photos, row.image_url ? [resolvePlaceImageUrl(row.image_url, row.category, row.id)] : []);
  const tiolaCount = stats?.tiolaCount || 0;
  const tiolaRating = stats?.tiolaRating || null;
  const popularity = row.popularity != null
    ? row.popularity
    : tiolaCount * 2 + (tiolaRating || 0) * 10;

  return {
    id: row.id,
    name: row.name,
    slug: row.slug || null,
    location: row.location,
    country: row.country,
    city: row.city,
    district: row.district,
    category: row.category,
    categories,
    imageUrl: resolvePlaceImageUrl(row.image_url, row.category, row.id),
    isLocal: !!row.is_local,
    entryFee: row.entry_fee,
    entryFeeEn: row.entry_fee_en,
    bestTime: row.best_time,
    bestTimeEn: row.best_time_en,
    description: row.description,
    descriptionEn: row.description_en,
    overview: row.overview || row.description,
    overviewEn: row.overview_en || row.description_en,
    history: row.history,
    historyEn: row.history_en,
    thingsToDo,
    thingsToDoEn,
    cultureFood: row.culture_food,
    cultureFoodEn: row.culture_food_en,
    travelTips: row.travel_tips || row.tips,
    travelTipsEn: row.travel_tips_en || row.tips_en,
    howToGetThere: row.how_to_get_there,
    howToGetThereEn: row.how_to_get_there_en,
    photos: photos.map((url) => (url.startsWith('http') ? url : resolvePlaceImageUrl(url, row.category, row.id))),
    tips: row.tips,
    tipsEn: row.tips_en,
    tags,
    searchAliases,
    lat: row.lat,
    lng: row.lng,
    popularity,
    tiolaRating,
    tiolaCount,
    faqTR: parseJson(row.faq_tr, []),
    faqEN: parseJson(row.faq_en, []),
    affiliateHotelUrl: row.affiliate_hotel_url,
    affiliateBookingUrl: row.affiliate_booking_url,
    timezone: row.timezone,
  };
}

function mapMarker(place, lang) {
  const short = lang === 'en'
    ? (place.descriptionEn || place.overviewEn || place.description || '').slice(0, 120)
    : (place.description || place.overview || '').slice(0, 120);
  return {
    id: place.id,
    name: place.name,
    lat: place.lat,
    lng: place.lng,
    category: place.category,
    categories: place.categories,
    shortDesc: short + (short.length >= 120 ? '…' : ''),
    imageUrl: place.imageUrl,
  };
}

module.exports = { mapPlaceRow, mapMarker, parseJson };
