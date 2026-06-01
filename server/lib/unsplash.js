const ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY || '';

const CATEGORY_QUERIES = {
  landmark: 'historic landmark architecture',
  museum: 'museum art gallery',
  nature: 'nature landscape mountains',
  beach: 'beach tropical',
  restaurant: 'restaurant food dining',
  cafe: 'cafe coffee shop',
  park: 'city park garden',
  viewpoint: 'scenic viewpoint panorama',
  religious: 'temple church mosque',
  market: 'market bazaar street',
  shopping: 'shopping street retail',
  nightlife: 'nightlife city lights',
  adventure: 'adventure hiking outdoor',
  spa: 'spa wellness resort',
  hotel: 'hotel luxury travel',
  city: 'city skyline travel',
};

function buildSearchQuery(name, city, category) {
  const base = CATEGORY_QUERIES[category] || 'travel destination';
  return `${name} ${city} ${base}`.trim().slice(0, 100);
}

async function searchPhotos(query, count = 5) {
  if (!ACCESS_KEY) {
    return [];
  }
  const url = new URL('https://api.unsplash.com/search/photos');
  url.searchParams.set('query', query);
  url.searchParams.set('per_page', String(Math.min(count, 10)));
  url.searchParams.set('orientation', 'landscape');

  const res = await fetch(url, {
    headers: { Authorization: `Client-ID ${ACCESS_KEY}` },
  });
  if (!res.ok) {
    throw new Error(`Unsplash API ${res.status}`);
  }
  const data = await res.json();
  return (data.results || []).map((photo) => ({
    url: `${photo.urls.regular}&w=800&q=80`,
    thumb: `${photo.urls.small}&w=400&q=80`,
    credit: photo.user?.name || 'Unsplash',
    creditUrl: photo.user?.links?.html || 'https://unsplash.com',
  }));
}

async function fetchPlacePhotos(place, count = 5) {
  const query = buildSearchQuery(place.name, place.city || place.country, place.category);
  try {
    const photos = await searchPhotos(query, count);
    if (photos.length) return photos.map((p) => p.url);
  } catch {
    /* fallback below */
  }
  const fallback = place.imageUrl ? [place.imageUrl] : [];
  return fallback;
}

module.exports = {
  ACCESS_KEY,
  buildSearchQuery,
  searchPhotos,
  fetchPlacePhotos,
  CATEGORY_QUERIES,
};
