const { slugify } = require('./slugify');

const GENERIC_CITY_IMAGE = 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=600&q=80';

/** Default Unsplash cover images keyed by city slug */
const CITY_IMAGES = {
  // Turkey
  istanbul: 'https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?w=600&q=80',
  ankara: 'https://images.unsplash.com/photo-1582555172866-f73bb12a2ab3?w=600&q=80',
  antalya: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&q=80',
  izmir: 'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=600&q=80',
  bursa: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&q=80',
  trabzon: 'https://images.unsplash.com/photo-1478436127897-769e1b3f0f36?w=600&q=80',
  nevsehir: 'https://images.unsplash.com/photo-1527838832700-5059252407fa?w=600&q=80',
  denizli: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=600&q=80',
  mugla: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&q=80',
  gaziantep: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&q=80',
  mardin: 'https://images.unsplash.com/photo-1527838832700-5059252407fa?w=600&q=80',
  bodrum: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&q=80',
  safranbolu: 'https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?w=600&q=80',
  canakkale: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=600&q=80',

  // Europe
  paris: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=600&q=80',
  london: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=600&q=80',
  rome: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=600&q=80',
  venice: 'https://images.unsplash.com/photo-1523906834658-6e24ef2386f2?w=600&q=80',
  florence: 'https://images.unsplash.com/photo-1529260830194-527d8919ac8c?w=600&q=80',
  barcelona: 'https://images.unsplash.com/photo-1583422409516-2895a77efded?w=600&q=80',
  madrid: 'https://images.unsplash.com/photo-1539037116277-4db20889f2d4?w=600&q=80',
  lisbon: 'https://images.unsplash.com/photo-1513735492246-483525079686?w=600&q=80',
  athens: 'https://images.unsplash.com/photo-1555993539-1732b0258235?w=600&q=80',
  santorini: 'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=600&q=80',
  amsterdam: 'https://images.unsplash.com/photo-1534351590666-13e3e96b5017?w=600&q=80',
  berlin: 'https://images.unsplash.com/photo-1560960884-ba7ba7b4b8b4?w=600&q=80',
  prague: 'https://images.unsplash.com/photo-1541849546-216549ae216d?w=600&q=80',
  vienna: 'https://images.unsplash.com/photo-1516550893923-42d28e5677af?w=600&q=80',
  budapest: 'https://images.unsplash.com/photo-1541849546-216549ae216d?w=600&q=80',
  krakow: 'https://images.unsplash.com/photo-1555993539-1732b0258235?w=600&q=80',
  dubrovnik: 'https://images.unsplash.com/photo-1555993539-1732b0258235?w=600&q=80',
  edinburgh: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=600&q=80',
  milan: 'https://images.unsplash.com/photo-1516483638261-f4dbaf036963?w=600&q=80',
  nice: 'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=600&q=80',
  granada: 'https://images.unsplash.com/photo-1539037116277-4db20889f2d4?w=600&q=80',
  reykjavik: 'https://images.unsplash.com/photo-1504829857797-ddff29c27927?w=600&q=80',
  stockholm: 'https://images.unsplash.com/photo-1509356843151-3e7d96241e11?w=600&q=80',
  copenhagen: 'https://images.unsplash.com/photo-1513622470522-26c3f8a854bc?w=600&q=80',
  helsinki: 'https://images.unsplash.com/photo-1538332576228-f2d46c2a2b0a?w=600&q=80',

  // Asia
  tokyo: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=600&q=80',
  kyoto: 'https://images.unsplash.com/photo-1478436127897-769e1b3f0f36?w=600&q=80',
  osaka: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=600&q=80',
  seoul: 'https://images.unsplash.com/photo-1517154429-7a7f27e8f5bd?w=600&q=80',
  beijing: 'https://images.unsplash.com/photo-1508804185872-d83badad00f7?w=600&q=80',
  shanghai: 'https://images.unsplash.com/photo-1535350356005-fd52b3b524fb?w=600&q=80',
  'hong-kong': 'https://images.unsplash.com/photo-1536599018102-9f803c140fc1?w=600&q=80',
  singapore: 'https://images.unsplash.com/photo-1525623355920-dac99495f98b?w=600&q=80',
  'kuala-lumpur': 'https://images.unsplash.com/photo-1596422846544-e75c64220b66?w=600&q=80',
  bangkok: 'https://images.unsplash.com/photo-1563492065599-3520f775eeed?w=600&q=80',
  'chiang-mai': 'https://images.unsplash.com/photo-1552465011-b4e21bf8e8a7?w=600&q=80',
  bali: 'https://images.unsplash.com/photo-1537996194471-d033025128c9?w=600&q=80',
  'siem-reap': 'https://images.unsplash.com/photo-1528183429752-a97fa0ceed99?w=600&q=80',
  'ha-long': 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=600&q=80',
  dubai: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=600&q=80',
  'abu-dhabi': 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=600&q=80',
  jerusalem: 'https://images.unsplash.com/photo-1544966503-7cc5ac882d5f?w=600&q=80',
  mumbai: 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=600&q=80',
  agra: 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=600&q=80',
  jaipur: 'https://images.unsplash.com/photo-1477587453673-fa7ade0ccee1?w=600&q=80',
  varanasi: 'https://images.unsplash.com/photo-1561361513-2ae579cb4499?w=600&q=80',

  // Americas
  'new-york': 'https://images.unsplash.com/photo-1496442226666-8d0d0e62e6e9?w=600&q=80',
  'san-francisco': 'https://images.unsplash.com/photo-1501594907352-04cda38ebc29?w=600&q=80',
  'los-angeles': 'https://images.unsplash.com/photo-1534190239940-3369c44f6e3c?w=600&q=80',
  'las-vegas': 'https://images.unsplash.com/photo-1581351721012-6eb2fcf7f1d8?w=600&q=80',
  'rio-de-janeiro': 'https://images.unsplash.com/photo-1483729558449-99ef09a8c325?w=600&q=80',
  'buenos-aires': 'https://images.unsplash.com/photo-1589909202803-8f4c4b0e3e3e?w=600&q=80',
  'mexico-city': 'https://images.unsplash.com/photo-1518659094540-e694661baa88?w=600&q=80',
  havana: 'https://images.unsplash.com/photo-1518173946687-2f1d1d337504?w=600&q=80',
  cusco: 'https://images.unsplash.com/photo-1526392060635-9d6019884377?w=600&q=80',
  toronto: 'https://images.unsplash.com/photo-1517935708355-2067f81457b0?w=600&q=80',
  banff: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&q=80',

  // Africa & Middle East
  cairo: 'https://images.unsplash.com/photo-1572252009286-0c8d568db9b8?w=600&q=80',
  marrakech: 'https://images.unsplash.com/photo-1489749798305-4fea3ae63d43?w=600&q=80',
  'cape-town': 'https://images.unsplash.com/photo-1580060839134-75a3b47fa583?w=600&q=80',
  petra: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=600&q=80',

  // Oceania
  sydney: 'https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?w=600&q=80',
  queenstown: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&q=80',
  'bora-bora': 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=600&q=80',
};

const TURKEY_CITY_META = [
  { slug: 'istanbul', name: 'İstanbul', nameEn: 'Istanbul', lat: 41.0082, lng: 28.9784 },
  { slug: 'ankara', name: 'Ankara', nameEn: 'Ankara', lat: 39.9334, lng: 32.8597 },
  { slug: 'antalya', name: 'Antalya', nameEn: 'Antalya', lat: 36.8969, lng: 30.7133 },
  { slug: 'izmir', name: 'İzmir', nameEn: 'Izmir', lat: 38.4237, lng: 27.1428 },
  { slug: 'bursa', name: 'Bursa', nameEn: 'Bursa', lat: 40.1885, lng: 29.061 },
  { slug: 'trabzon', name: 'Trabzon', nameEn: 'Trabzon', lat: 41.0027, lng: 39.7168 },
  { slug: 'nevsehir', name: 'Nevşehir', nameEn: 'Nevsehir', lat: 38.6244, lng: 34.7236 },
  { slug: 'denizli', name: 'Denizli', nameEn: 'Denizli', lat: 37.7765, lng: 29.0864 },
  { slug: 'mugla', name: 'Muğla', nameEn: 'Mugla', lat: 37.2153, lng: 28.3636 },
  { slug: 'gaziantep', name: 'Gaziantep', nameEn: 'Gaziantep', lat: 37.0662, lng: 37.3833 },
];

function getCityImage(slugOrName, storedUrl) {
  if (storedUrl && String(storedUrl).trim()) return String(storedUrl).trim();
  const slug = slugify(slugOrName);
  return CITY_IMAGES[slug] || GENERIC_CITY_IMAGE;
}

async function backfillCityImages(database) {
  const db = database && typeof database.prepare === 'function'
    ? database
    : require('../db').db;
  const rows = await db.prepare(`
    SELECT id, name, slug, image_url FROM cities
    WHERE image_url IS NULL OR trim(image_url) = ''
  `).all();
  if (!rows.length) return 0;
  const stmt = await db.prepare('UPDATE cities SET image_url = ? WHERE id = ?');
  let count = 0;
  for (const row of rows) {
    const url = getCityImage(row.slug || row.name);
    await stmt.run(url, row.id);
    count += 1;
  }
  return count;
}

module.exports = {
  CITY_IMAGES,
  GENERIC_CITY_IMAGE,
  TURKEY_CITY_META,
  getCityImage,
  backfillCityImages,
};
