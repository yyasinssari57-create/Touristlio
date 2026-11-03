/**
 * V4 Adım 4 — şablon / yinelenen tespit kuralları.
 * Rapor üretir, kayıt değiştirmez.
 * Usage: node server/scripts/verify-v4-adim4-places.js
 */
const fs = require('fs');
const path = require('path');

const audit = require('./audit-places-quality');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;

function ok(msg) {
  console.log('  ✓', msg);
}
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}

function place(partial) {
  return audit.normalizePlace({
    id: partial.id,
    name: partial.name,
    slug: partial.slug,
    city: partial.city || 'Kars',
    country: partial.country || 'Turkey',
    category: partial.category || 'landmark',
    status: partial.status || 'published',
    location: partial.location || '',
    lat: partial.lat,
    lng: partial.lng,
    description: partial.description || 'x'.repeat(80),
    overview: partial.overview || '',
    history: partial.history || '',
    tips: partial.tips || '',
    imageUrl: partial.imageUrl || '',
    photos: partial.photos || [],
    tiolaCount: partial.tiolaCount || 0,
  }, null);
}

console.log('verify-v4-adim4-places');

const src = fs.readFileSync(path.join(__dirname, 'audit-places-quality.js'), 'utf8');
if (!src.includes('BEGIN READ ONLY')) fail('veritabanı okuması READ ONLY değil');
else ok('veritabanı oturumu READ ONLY');
if (/\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER)\b/.test(src)) {
  fail('rapor betiği yazma ifadesi içeriyor');
} else ok('rapor betiğinde yazma ifadesi yok');

const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
if (!/^reports\/$/m.test(gitignore)) fail('reports/ .gitignore içinde yok');
else ok('reports/ depoya girmez');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
if (pkg.scripts['audit:places-quality'] !== 'node server/scripts/audit-places-quality.js') {
  fail('package.json audit:places-quality yok');
} else ok('package.json audit:places-quality');
if (pkg.scripts['verify:v4-adim4'] !== 'node server/scripts/verify-v4-adim4-places.js') {
  fail('package.json verify:v4-adim4 yok');
} else ok('package.json verify:v4-adim4');

if (!audit.templateKindFromSlug('vienna-old-town-vienna')) fail('vienna-old-town-vienna şablon sayılmadı');
else ok('vienna-old-town-vienna şablon');
const hoChiMinh = audit.templateKindFromSlug('ho-chi-minh-city-waterfront-ho-chi-minh-city');
if (!hoChiMinh || hoChiMinh.kind !== 'waterfront') fail('çok kelimeli şehir şablonu kaçtı');
else ok('ho-chi-minh-city-waterfront şablon');
if (!audit.templateKindFromSlug('vienna-old-town-vienna-2')) fail('-2 soneki şablonu kaçırdı');
else ok('benzersiz slug soneki şablon sayılır');
if (audit.templateKindFromSlug('hasankeyf-old-town-batman')) fail('hasankeyf-old-town-batman yanlış şablon');
else ok('şehir adı eşleşmeyen old-town şablon değil');
if (audit.templateKindFromSlug('central-park-new-york')) fail('Central Park New York şablon sayıldı');
else ok('central-park-new-york şablon değil');
for (const kind of ['cultural-district', 'main-square', 'waterfront', 'historic-quarter', 'central-park', 'old-town']) {
  const slug = `riga-${kind}-riga`;
  const hit = audit.templateKindFromSlug(slug);
  if (!hit || hit.kind !== kind) fail(`${slug} kalıbı yok`);
}
if (!failed) ok('altı şablon kalıbı da tutuyor');

const generated = place({
  id: 1,
  name: 'Vienna Old Town',
  slug: 'vienna-old-town-vienna',
  city: 'Vienna',
  country: 'Austria',
  location: 'Old Town, Vienna',
  lat: 48.21,
  lng: 16.37,
});
const realOldTown = place({
  id: 2,
  name: 'Tallinn Old Town',
  slug: 'tallinn-old-town-tallinn',
  city: 'Tallinn',
  country: 'Estonia',
  location: 'Tallinn',
  lat: 59.43,
  lng: 24.74,
});
const templates = audit.findTemplates([generated, realOldTown]);
if (templates.length !== 2) fail(`şablon sayısı ${templates.length}`);
else if (templates.find((row) => row.slug === generated.slug).review_hint !== 'sablon_uretim') {
  fail('üretim kaydı sablon_uretim değil');
} else if (templates.find((row) => row.slug === realOldTown.slug).review_hint !== 'gozden_gecir') {
  fail('Tallinn Old Town gözden geçir değil');
} else ok('üretim ile gerçek old town ayrıldı');

const ani = place({
  id: 10,
  name: 'Ani Ruins',
  slug: 'ani-ruins-kars',
  city: 'Kars',
  lat: 40.507,
  lng: 43.572,
  description: 'a'.repeat(120),
  tiolaCount: 0,
  imageUrl: 'https://images.unsplash.com/photo-aaaaaaaaaaaa?w=600',
});
const aniDup = place({
  id: 11,
  name: 'Ani Harabeleri',
  slug: 'kars-ani-ruins-kars',
  city: 'Kars',
  lat: 40.9,
  lng: 43.1,
  description: 'b'.repeat(40),
  tiolaCount: 3,
  imageUrl: 'https://images.unsplash.com/photo-bbbbbbbbbbbb?w=600',
});
const far = place({
  id: 12,
  name: 'Kars Castle',
  slug: 'kars-castle-kars',
  city: 'Kars',
  lat: 40.61,
  lng: 43.1,
  description: 'c'.repeat(90),
});
const dupes = audit.findDuplicates([ani, aniDup, far]);
const aniPair = dupes.find((row) => row.slug_a === 'ani-ruins-kars' && row.slug_b === 'kars-ani-ruins-kars');
if (!aniPair) fail('ani-ruins çifti yok');
else if (!aniPair.reasons.includes('slug_substring')) fail(`ani çifti alt dizi değil: ${aniPair.reasons}`);
else if (Number(aniPair.fuller_id) !== 11) fail(`dolu kayıt ${aniPair.fuller_id}, Tiola olan 11 olmalı`);
else ok('slug alt dizisi ve daha dolu Tiola');

const nearA = place({
  id: 20,
  name: 'Ayasofya',
  slug: 'ayasofya-istanbul',
  city: 'Istanbul',
  country: 'Turkey',
  lat: 41.0086,
  lng: 28.9802,
});
const nearB = place({
  id: 21,
  name: 'Sultanahmet',
  slug: 'sultanahmet-istanbul',
  city: 'Istanbul',
  country: 'Turkey',
  lat: 41.0086,
  lng: 28.9825,
});
const otherCity = place({
  id: 22,
  name: 'Ayasofya Kopya',
  slug: 'ayasofya-istanbul',
  city: 'Ankara',
  country: 'Turkey',
  lat: 41.0086,
  lng: 28.9838,
});
const near = audit.findDuplicates([nearA, nearB, otherCity]);
if (!near.some((row) => row.reasons.includes('within_300m') && row.city === 'Istanbul')) {
  fail('300 m içindeki İstanbul çifti yok');
} else ok('aynı şehirde ≤300 m çift');
if (near.some((row) => row.city === 'Ankara' || (row.id_a === 22 || row.id_b === 22))) {
  fail('farklı şehir aynı koordinatta eşleşti');
} else ok('farklı şehir eşleşmedi');

const meters = audit.distanceMeters(nearA, nearB);
if (meters == null || meters > 300) fail(`mesafe ${meters}`);
else ok(`örnek mesafe ${meters} m`);

const sharedA = place({
  id: 30,
  name: 'Bir',
  slug: 'bir-izmir',
  city: 'Izmir',
  imageUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&q=80',
  photos: ['https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&q=80'],
});
const sharedB = place({
  id: 31,
  name: 'Iki',
  slug: 'iki-izmir',
  city: 'Izmir',
  imageUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200',
});
const alone = place({
  id: 32,
  name: 'Uc',
  slug: 'uc-izmir',
  city: 'Izmir',
  imageUrl: 'https://images.unsplash.com/photo-only-one',
});
const images = audit.findSharedImages([sharedA, sharedB, alone]);
const exact = images.filter((row) => row.match_type === 'exact_url');
const photos = images.filter((row) => row.match_type === 'unsplash_photo_id');
if (exact.length !== 0) fail('farklı sorgu dizisi exact URL sayıldı');
else ok('farklı adres exact URL grubu değil');
if (photos.length !== 1 || photos[0].place_count !== 2) fail('aynı Unsplash karesi gruplanmadı');
else ok('aynı Unsplash karesi, farklı adres');

const sameUrlB = place({
  id: 33,
  name: 'Dort',
  slug: 'dort-izmir',
  city: 'Izmir',
  imageUrl: sharedA.imageUrl,
});
const exactGroups = audit.findSharedImages([sharedA, sameUrlB]);
if (!exactGroups.some((row) => row.match_type === 'exact_url' && row.place_count === 2)) {
  fail('aynı URL grubu yok');
} else ok('aynı görsel URL grubu');

const zero = place({
  id: 40,
  name: 'Sifir',
  slug: 'sifir-ankara',
  city: 'Ankara',
  lat: 0,
  lng: 32.8,
  description: 'y'.repeat(80),
});
const emptyText = place({
  id: 41,
  name: 'Bos',
  slug: 'bos-ankara',
  city: 'Ankara',
  lat: 39.9,
  lng: 32.8,
  description: '   ',
  overview: '',
});
const short = place({
  id: 42,
  name: 'Kisa',
  slug: 'kisa-ankara',
  city: 'Ankara',
  lat: 39.9,
  lng: 32.9,
  description: 'kısa',
  overview: 'kısa',
});
const okPlace = place({
  id: 43,
  name: 'Tam',
  slug: 'tam-ankara',
  city: 'Ankara',
  lat: 39.9,
  lng: 32.7,
  description: 'z'.repeat(51),
});
const thin = audit.findThin([zero, emptyText, short, okPlace]);
const thinIds = new Set(thin.map((row) => row.id));
if (!thinIds.has(40) || thin.find((row) => row.id === 40).coord_issue !== 'sifir') fail('sıfır koordinat kaçtı');
else ok('sıfır koordinat');
if (!thinIds.has(41) || thin.find((row) => row.id === 41).text_issue !== 'bos') fail('boş açıklama kaçtı');
else ok('boş açıklama');
if (!thinIds.has(42) || thin.find((row) => row.id === 42).text_issue !== 'kisa') fail('kısa açıklama kaçtı');
else ok('kısa açıklama');
if (thinIds.has(43)) fail('51 karakterlik açıklama eksik sayıldı');
else ok('51 karakter eşikte değil');

const beachCenter = place({
  id: 50,
  name: 'Prague Main Square',
  slug: 'prague-main-square-prague',
  city: 'Prague',
  country: 'Czech Republic',
  category: 'beach',
  location: 'Main Square, Prague',
  lat: 50.08,
  lng: 14.42,
  imageUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600',
});
const realBeach = place({
  id: 51,
  name: 'Waikiki Beach',
  slug: 'waikiki-beach-honolulu',
  city: 'Honolulu',
  category: 'beach',
  lat: 21.27,
  lng: -157.82,
  imageUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600',
});
const mismatches = audit.findMismatches([beachCenter, realBeach]);
const prague = mismatches.find((row) => row.id === 50);
if (!prague || !prague.reasons.includes('sehir_merkezi_kategori_plaj')) {
  fail('meydan + plaj kategorisi kaçtı');
} else if (!prague.reasons.includes('sehir_merkezi_gorseli_plaj')) {
  fail('meydan + plaj görseli kaçtı');
} else ok('şehir merkezi plaj kategorisi ve görseli');
if (mismatches.some((row) => row.id === 51)) fail('Waikiki Beach uyumsuz sayıldı');
else ok('gerçek plaj uyumsuz değil');

if (failed) {
  console.error(`verify-v4-adim4-places: ${failed} hata`);
  process.exit(1);
}
console.log('verify-v4-adim4-places: tamam');
