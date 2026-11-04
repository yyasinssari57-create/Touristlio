/**
 * V4 Adım 7 — görsel doğrulama.
 * Usage: node server/scripts/verify-v4-adim7-images.js
 */
const fs = require('fs');
const path = require('path');
const {
  mergePlaceImages,
  publicPlaceMedia,
  PLACEHOLDER_IMAGE,
  isPlaceholderImage,
} = require('../lib/place-image');
const { assignUniqueImages } = require('../lib/photo-pools');
const { imageKey } = require('../lib/image-usage');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;

function ok(msg) {
  console.log('  ✓', msg);
}
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

console.log('verify-v4-adim7-images');

const adminUpload = 'https://abc.supabase.co/storage/v1/object/public/touristlio/places/12/kapak.webp';
const poolA = 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=600&q=80';
const poolALarge = 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=1200&crop=focalpoint&fp-x=0.2';
const poolB = 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800';

const kept = mergePlaceImages(
  { image_url: adminUpload, photos: [adminUpload] },
  { imageUrl: poolA, photos: [poolA, poolB] },
);
if (kept.imageUrl !== adminUpload || kept.photos[0] !== adminUpload || kept.keptExisting !== true) {
  fail('dolu kapak ve admin yüklemesi seed ile ezildi');
} else ok('dolu kapak ve admin yüklemesi durur');

const filled = mergePlaceImages(
  { image_url: '', photos: '[]' },
  { imageUrl: poolB, photos: [poolB] },
);
if (filled.imageUrl !== poolB || filled.keptExisting !== false) {
  fail('boş kapak doldurulmadı');
} else ok('boş kapak ve galeri dolar');

const photosOnly = mergePlaceImages(
  { image_url: '', photos: JSON.stringify([adminUpload]) },
  { imageUrl: poolA, photos: [poolA] },
);
if (!photosOnly.keptExisting || photosOnly.photos.includes(poolA)) {
  fail('dolu galeri seed fotoğrafıyla değişti');
} else ok('dolu galeri seed fotoğrafını almaz');

const assigned = assignUniqueImages([
  { id: 1, name: 'Balat', category: 'landmark', imageUrl: adminUpload, photos: [adminUpload] },
  { id: 2, name: 'Boş', category: 'beach', imageUrl: '', photos: [] },
]);
if (assigned[0].imageUrl !== adminUpload) fail('assignUniqueImages dolu görseli değiştirdi');
else ok('assignUniqueImages dolu görsele dokunmaz');
if (!assigned[1].imageUrl || assigned[1].imageUrl === adminUpload) fail('boş kayıt görsel almadı');
else ok('assignUniqueImages yalnızca boş kaydı doldurur');

const hidden = publicPlaceMedia({
  image_url: poolA,
  photos: JSON.stringify([poolA]),
  image_verified: false,
  image_credit: 'Yanlis',
});
if (hidden.imageUrl !== PLACEHOLDER_IMAGE || hidden.photos.length || hidden.imageCredit) {
  fail('doğrulanmamış kayıt havuz görseli döndü');
} else ok('doğrulanmamış kayıt nötr yer tutucu');

const shown = publicPlaceMedia({
  image_url: adminUpload,
  photos: JSON.stringify([adminUpload]),
  image_verified: true,
  image_credit: 'Ada Lovelace',
  image_source_url: adminUpload,
});
if (shown.imageUrl !== adminUpload || shown.imageCredit !== 'Ada Lovelace' || shown.imageVerified !== true) {
  fail('doğrulanmış görsel görünmedi');
} else ok('doğrulanmış görsel ve kredi durur');

if (imageKey(poolA) !== imageKey(poolALarge)) fail('aynı Unsplash karesi ayrı sayıldı');
else ok('farklı kırpılmış aynı Unsplash karesi tek görsel');
if (imageKey(poolA) === imageKey(poolB)) fail('farklı Unsplash kareleri birleşti');
else ok('farklı kareler ayrı');
if (!isPlaceholderImage(PLACEHOLDER_IMAGE)) fail('yer tutucu tanınmadı');

const appJs = read('public/js/app.js');
const discover = read('public/js/discover-places.js');
const adminHtml = read('public/admin.html');
const seed = read('server/seed.js');
const importer = read('server/lib/places-import-export.js');
const migration = read('db/migrations/019_v4_adim7_image_verify.js');
if (!appJs.includes('PLACE_PLACEHOLDER') || !appJs.includes('photoCredit')) fail('sitede yer tutucu veya kredi yok');
else ok('site yer tutucu ve fotoğrafçı satırını kullanır');
if (discover.includes("return fallbackImgUrl(p?.category, p?.id)") && !discover.includes('place-placeholder.svg')) {
  fail('keşfet hâlâ kategori havuzuna düşüyor');
} else ok('keşfet listesi yer tutucuya düşer');
if (!adminHtml.includes('Bu görsel bu mekâna ait') || !adminHtml.includes('openMediaReplace') || !adminHtml.includes('edImageDup')) {
  fail('admin doğrulama veya medya değiştirme yok');
} else ok('admin kaydında uyarı, doğrulama kutusu ve medya değiştirme var');
if (!seed.includes('mergePlaceImages')) fail('seed görselleri ayırmıyor');
else ok('seed dolu görseli korur');
if (!importer.includes('keptExisting')) fail('içe aktarma dolu görseli korumuyor');
else ok('içe aktarma dolu görseli korur');
for (const col of ['image_credit', 'image_source_url', 'image_verified', 'image_verified_at']) {
  if (!migration.includes(col)) fail(`migration ${col} yok`);
}
if (failed === 0) ok('dört alan migration dosyasında');

const places = JSON.parse(read('server/data/places.json'));
const published = places.filter((p) => !p.status || p.status === 'published');
const keys = new Map();
for (const place of published) {
  const urls = [place.imageUrl, ...(Array.isArray(place.photos) ? place.photos : [])];
  const seen = new Set();
  for (const url of urls) {
    const key = imageKey(url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (!keys.has(key)) keys.set(key, []);
    keys.get(key).push(place.name);
  }
}
const shared = [...keys.values()].filter((names) => names.length > 1);
console.log(`  sayım: yayında ${published.length}, paylaşılan görsel grubu ${shared.length}, en büyük grup ${shared.reduce((m, n) => Math.max(m, n.length), 0)}`);

if (failed) {
  console.error(`verify-v4-adim7-images: ${failed} hata`);
  process.exit(1);
}
console.log('verify-v4-adim7-images: tamam');
