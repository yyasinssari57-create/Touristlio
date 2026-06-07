const { db } = require('../../db');

const { normalizeSearch, matchesQuery } = require('../../lib/search-normalize');

const { matchesFilterGroup } = require('../../lib/place-content');

const { mapPlaceRow, mapMarker } = require('../../lib/place-map');

const catalogDb = require('../../lib/catalog-db');
const { FILTER_GROUPS, GROUP_VISIBILITY } = require('../../lib/place-content');
const { cacheKey, wrap, clear } = require('../../lib/cache');
const { getStatsMap, invalidateStatsCache } = require('../../lib/stats-cache');
const { searchPlacesRows } = require('../../lib/places-search');

const CACHE_VERSION = 'v2';
const META_CACHE_TTL = 60 * 1000;



function normalizeCountry(value) {

  if (!value) return '';

  return String(value).replace(/\s[\u{1F1E0}-\u{1F1FF}]{2}/gu, '').trim();

}



const STATS_CACHE_TTL = 60 * 1000;

function mapPlace(row, statsMap) {
  const stats = statsMap
    ? (statsMap.get(row.id) || { tiolaCount: 0, tiolaRating: null })
    : { tiolaCount: 0, tiolaRating: null };
  return mapPlaceRow(row, stats);
}



/** Spec API shape for GET /places */

function toApiPlace(p) {

  const images = (p.photos && p.photos.length)

    ? p.photos

    : (p.imageUrl ? [p.imageUrl] : []);

  return {

    id: p.id,

    title: p.name,

    description: p.description || p.overview || '',

    city: p.city,

    category: p.category,

    lat: p.lat,

    lng: p.lng,

    images,

    rating: p.tiolaRating ?? null,

    name: p.name,

    imageUrl: p.imageUrl,

    tiolaRating: p.tiolaRating,

    tiolaCount: p.tiolaCount,

    country: p.country,

    district: p.district,

    location: p.location,

  };

}



function filterPlaces(rows, queryParams, statsMap = getStatsMap(), options = {}) {

  const {

    q, category, group, country, city, district, localOnly, entry, minTiola,

  } = queryParams;

  const qNorm = q ? normalizeSearch(q) : '';

  let filtered = rows;



  if (qNorm && !options.skipTextSearch) {
    filtered = filtered.filter((row) => matchesQuery(mapPlace(row, statsMap), qNorm));
  }

  if (group && group !== 'all') {

    filtered = filtered.filter((r) => {

      const p = mapPlace(r, statsMap);

      return matchesFilterGroup(p.categories, group);

    });

  } else if (category && category !== 'all') {

    const cat = String(category).toLowerCase();

    const discoverGroups = {

      museum: ['museum'],

      nature: ['nature', 'park', 'beach', 'viewpoint'],

      food: ['restaurant', 'cafe', 'market'],

      historical: ['landmark', 'religious', 'museum'],

      entertainment: ['nightlife', 'adventure', 'shopping', 'spa'],

    };

    const allowed = discoverGroups[cat] || [cat];

    filtered = filtered.filter((r) => {

      const cats = mapPlace(r, statsMap).categories;

      return allowed.includes(r.category) || (cats || []).some((c) => allowed.includes(c));

    });

  }

  if (country) {

    const countryNorm = normalizeCountry(country).toLowerCase();

    filtered = filtered.filter((r) => {

      const rowCountry = normalizeCountry(r.country).toLowerCase();

      return rowCountry === countryNorm

        || (countryNorm === 'turkey' && (rowCountry === 'türkiye' || rowCountry.includes('turkey')));

    });

  }

  if (city) {

    const cityNorm = String(city).toLowerCase().replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ç/g, 'c');

    filtered = filtered.filter((r) => {

      const c = (r.city || '').toLowerCase().replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ç/g, 'c');

      return c === cityNorm || c.includes(cityNorm) || cityNorm.includes(c);

    });

  }

  if (district) {

    filtered = filtered.filter((r) => r.district === district);

  }

  if (localOnly === '1') {

    filtered = filtered.filter((r) => r.is_local === 1);

  }

  if (entry === 'free') {

    filtered = filtered.filter((r) => r.entry_fee && r.entry_fee.includes('Ücretsiz'));

  } else if (entry === 'paid') {

    filtered = filtered.filter((r) => r.entry_fee && !r.entry_fee.includes('Ücretsiz'));

  }



  let places = filtered.map((r) => mapPlace(r, statsMap));



  if (minTiola) {

    const min = Number(minTiola);

    places = places.filter((p) => p.tiolaRating != null && p.tiolaRating >= min);

  }



  return { places, qNorm };

}



function sortPlaces(places, sort) {

  const list = [...places];

  if (sort === 'reviewed') {

    list.sort((a, b) => (b.tiolaCount || 0) - (a.tiolaCount || 0));

  } else if (sort === 'local') {

    list.sort((a, b) => (b.isLocal ? 1 : 0) - (a.isLocal ? 1 : 0));

  } else if (sort === 'az') {

    list.sort((a, b) => a.name.localeCompare(b.name, 'tr'));

  } else if (sort === 'popularity') {

    list.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

  } else {

    list.sort((a, b) => (b.tiolaRating || 0) - (a.tiolaRating || 0));

  }

  return list;

}



function listPlaces(queryParams) {

  const { sort } = queryParams;

  const limit = Math.min(Math.max(Number(queryParams.limit) || 12, 1), 500);

  const offset = Math.max(Number(queryParams.offset) || 0, 0);



  const cacheParams = { ...queryParams, limit, offset };

  const key = cacheKey(`places-list-${CACHE_VERSION}`, cacheParams);



  return wrap(key, () => {
    const { q, country, city } = queryParams;
    let rows;
    if (q || country || city) {
      rows = searchPlacesRows({ q, country, city });
    } else {
      rows = db.prepare('SELECT * FROM places').all();
    }
    const statsMap = getStatsMap();
    const skipTextSearch = !!q;
    let { places, qNorm } = filterPlaces(rows, queryParams, statsMap, { skipTextSearch });

    places = sortPlaces(places, sort);

    const total = places.length;

    const page = places.slice(offset, offset + limit);

    return {

      places: page,

      items: page.map(toApiPlace),

      count: page.length,

      total,

      limit,

      offset,

      osmHint: qNorm && total === 0,

    };

  }, STATS_CACHE_TTL);

}



function listMarkers(queryParams, lang = 'tr') {

  let rows = db.prepare('SELECT * FROM places WHERE lat IS NOT NULL AND lng IS NOT NULL').all();

  if (!rows.length) rows = db.prepare('SELECT * FROM places').all();

  const statsMap = getStatsMap();

  const { places } = filterPlaces(rows, queryParams, statsMap);

  return places.slice(0, 500).map((p) => mapMarker(p, lang));

}



const TURKEY_CITIES = [

  { slug: 'istanbul', name: 'İstanbul', nameEn: 'Istanbul', lat: 41.0082, lng: 28.9784, image: 'https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?w=600&q=80' },

  { slug: 'ankara', name: 'Ankara', nameEn: 'Ankara', lat: 39.9334, lng: 32.8597, image: 'https://images.unsplash.com/photo-1582555172866-f73bb12a2ab3?w=600&q=80' },

  { slug: 'antalya', name: 'Antalya', nameEn: 'Antalya', lat: 36.8969, lng: 30.7133, image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&q=80' },

  { slug: 'izmir', name: 'İzmir', nameEn: 'Izmir', lat: 38.4237, lng: 27.1428, image: 'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=600&q=80' },

  { slug: 'bursa', name: 'Bursa', nameEn: 'Bursa', lat: 40.1885, lng: 29.061, image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&q=80' },

  { slug: 'trabzon', name: 'Trabzon', nameEn: 'Trabzon', lat: 41.0027, lng: 39.7168, image: 'https://images.unsplash.com/photo-1478436127897-769e1b3f0f36?w=600&q=80' },

  { slug: 'nevsehir', name: 'Nevşehir', nameEn: 'Nevsehir', lat: 38.6244, lng: 34.7236, image: 'https://images.unsplash.com/photo-1527838832700-5059252407fa?w=600&q=80' },

  { slug: 'denizli', name: 'Denizli', nameEn: 'Denizli', lat: 37.7765, lng: 29.0864, image: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=600&q=80' },

  { slug: 'mugla', name: 'Muğla', nameEn: 'Mugla', lat: 37.2153, lng: 28.3636, image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&q=80' },

  { slug: 'gaziantep', name: 'Gaziantep', nameEn: 'Gaziantep', lat: 37.0662, lng: 37.3833, image: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&q=80' },

];



function citiesWithCounts(country) {

  const countryNorm = country ? normalizeCountry(country).toLowerCase() : '';

  let rows;

  if (countryNorm) {

    rows = db.prepare(`
      SELECT city, country, COUNT(*) AS c FROM places
      WHERE lower(country) LIKE ? OR lower(country) LIKE ?
      GROUP BY city, country
    `).all(`%${countryNorm}%`, countryNorm === 'turkey' ? '%türkiye%' : `%${countryNorm}%`);

  } else {

    rows = db.prepare(`
      SELECT city, country, COUNT(*) AS c FROM places
      WHERE city IS NOT NULL AND trim(city) != ''
      GROUP BY city, country
      ORDER BY c DESC, city ASC
      LIMIT 120
    `).all();

  }

  if (countryNorm && (countryNorm === 'turkey' || countryNorm.includes('turkey') || countryNorm.includes('türkiye'))) {

    const counts = {};

    rows.forEach((r) => {

      if (!r.city) return;

      const key = r.city.trim();

      counts[key] = (counts[key] || 0) + (r.c || 0);

    });

    const catalogImages = new Map(
      catalogDb.listCities({ includeInactive: true })
        .filter((row) => row.imageUrl && /turkey|türkiye/i.test(row.country || ''))
        .map((row) => [row.slug, row.imageUrl]),
    );

    return TURKEY_CITIES.map((c) => {

      const matchKey = Object.keys(counts).find((k) => k.toLowerCase().replace(/ı/g, 'i') === c.slug || k.toLowerCase().includes(c.slug));
      const image = catalogImages.get(c.slug) || c.image;

      return { ...c, image, placeCount: matchKey ? counts[matchKey] : counts[c.nameEn] || counts[c.name] || 0 };

    });

  }

  return rows.map((r) => ({

    slug: (r.city || '').toLowerCase().replace(/\s+/g, '-'),

    name: r.city,

    nameEn: r.city,

    country: r.country,

    placeCount: r.c || 0,

  }));

}



const GROUP_ORDER = ['historical', 'nature', 'museums', 'restaurants', 'hotels', 'activities'];

function getMetaCategories() {
  const key = cacheKey(`places-meta-categories-${CACHE_VERSION}`, {});
  return wrap(key, () => {
    const allCats = catalogDb.listCategories();
    const categories = allCats.map((c) => ({
        slug: c.slug,
        nameTr: c.nameTr,
        nameEn: c.nameEn,
        icon: c.icon || '',
        imageUrl: c.imageUrl || null,
        placeCount: c.placeCount,
        sortOrder: c.sortOrder,
      }));

    const activeSlugs = new Set(categories.map((c) => c.slug));
    const groups = GROUP_ORDER.filter((group) => {
      const visibility = GROUP_VISIBILITY[group] || FILTER_GROUPS[group] || [];
      return visibility.some((slug) => activeSlugs.has(slug));
    });

    const discover = categories.map((c) => ({
      id: c.slug,
      slug: c.slug,
      icon: c.icon,
      imageUrl: c.imageUrl || null,
      nameTr: c.nameTr,
      nameEn: c.nameEn,
      placeCount: c.placeCount,
    }));

    return {
      version: CACHE_VERSION,
      groups,
      categories,
      discover,
      legacy: [...activeSlugs],
    };
  }, META_CACHE_TTL);
}

function invalidateMetaCategories() {
  clear(`places-meta-categories-${CACHE_VERSION}`);
}

function invalidatePlacesCache() {
  clear(`places-list-${CACHE_VERSION}`);
  invalidateMetaCategories();
  invalidateStatsCache();
}

module.exports = {

  mapPlace,

  toApiPlace,

  filterPlaces,

  sortPlaces,

  listPlaces,

  listMarkers,

  citiesWithCounts,

  getMetaCategories,

  invalidatePlacesCache,
  invalidateMetaCategories,

  TURKEY_CITIES,

  CACHE_VERSION,

};

