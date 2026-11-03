/**
 * V4 Adım 6 — yayın kapısı ve boş bölüm başlığı.
 * Usage: node server/scripts/verify-v4-adim6-publish.js
 */
const fs = require('fs');
const path = require('path');
const {
  PublishQualityError,
  assertCanPublish,
  missingPublishFields,
  fieldLabels,
  hasPublishCoords,
} = require('../lib/publish-quality');
const { isValidSitemapCoord } = require('../lib/sitemap');
const sections = require('../../public/js/place-sections');
const { buildReport, loadFromJson } = require('./audit-publish-quality');

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

function completePlace(extra = {}) {
  return {
    name: 'Ayasofya',
    description: 'Bizans yapısı, uzun bir Türkçe açıklama.',
    lat: 41.0086,
    lng: 28.9802,
    category: 'landmark',
    imageUrl: 'https://images.example.test/ayasofya.jpg',
    infoSourceUrl: 'https://example.test/kaynak',
    status: 'published',
    descriptionEn: '',
    ...extra,
  };
}

console.log('verify-v4-adim6-publish');

const ready = missingPublishFields(completePlace());
if (ready.length) fail(`dolu kayıt eksik sayıldı: ${ready.join(',')}`);
else ok('dolu kayıt kapıyı geçer');

if (missingPublishFields(completePlace({ descriptionEn: '' })).includes('descriptionTr')) {
  fail('İngilizce açıklama zorunlu sayıldı');
} else ok('İngilizce alan zorunlu değil');

const each = [
  ['name', { name: '  ' }, 'ad'],
  ['description', { description: '' }, 'açıklama (TR)'],
  ['coords', { lat: 0, lng: 0 }, 'koordinat'],
  ['category', { category: '' }, 'kategori'],
  ['image', { imageUrl: '', photos: [] }, 'doğrulanmış görsel'],
  ['source', { infoSourceUrl: '', infoVerifiedAt: null }, 'kaynak URL veya doğrulama tarihi'],
];
for (const [label, extra, text] of each) {
  const missing = fieldLabels(missingPublishFields(completePlace(extra)));
  if (!missing.includes(text)) fail(`${label} eksik listesinde yok: ${missing.join(', ')}`);
}
if (failed) {
  /* sayılar aşağıda */
} else ok('her zorunlu alan ayrı ayrı eksik görünür');

const onlySource = missingPublishFields(completePlace({ infoSourceUrl: '', infoVerifiedAt: '2026-11-01' }));
if (onlySource.includes('sourceOrDate')) fail('doğrulama tarihi kaynak URL yerine geçmedi');
else ok('doğrulama tarihi kaynak URL olmadan yeter');

if (missingPublishFields(completePlace({ imageUrl: '', image_verified: false })).includes('verifiedImage') === false) {
  fail('image_verified false iken görsel geçti');
} else ok('image_verified false doğrulanmış görsel sayılmaz');

if (missingPublishFields(completePlace({ imageUrl: '', image_verified: true })).includes('verifiedImage')) {
  fail('image_verified true görseli geçmedi');
} else ok('image_verified true görseli geçer');

if (hasPublishCoords(19.98, 0) || !hasPublishCoords(41, 29)) fail('koordinat kuralı bozuk');
else if (hasPublishCoords('', '') || hasPublishCoords(0, 0)) fail('boş veya 0,0 koordinat geçti');
else ok('0 ve boş koordinat eksik');

const coordSamples = [[41, 29], [0, 0], [19.98, 0], [null, 28], [91, 10], [-41, -29]];
const coordMismatch = coordSamples.filter(([la, ln]) => hasPublishCoords(la, ln) !== isValidSitemapCoord(la, ln));
if (coordMismatch.length) fail('kapı koordinatı site haritasından ayrıldı');
else ok('koordinat kuralı site haritasıyla aynı');

let threw = false;
try { assertCanPublish('draft', completePlace({ infoSourceUrl: '' })); } catch (err) {
  threw = err instanceof PublishQualityError && /kaynak URL veya doğrulama tarihi/.test(err.message);
}
if (!threw) fail('taslaktan yayına alma engellenmedi');
else ok('taslaktan yayına alma eksikte durur');

try {
  assertCanPublish('published', completePlace({ description: '', infoSourceUrl: '' }));
  ok('zaten yayındaki kayıt kapıya takılmaz');
} catch (err) {
  fail(`yayındaki kayıt engellendi: ${err.message}`);
}

try {
  assertCanPublish(null, completePlace({ status: 'draft', description: '', infoSourceUrl: '' }));
  ok('taslak kayıt eksik alanla durabilir');
} catch (err) {
  fail(`taslak kayıt engellendi: ${err.message}`);
}

try {
  assertCanPublish(null, { name: 'Yeni', description: '', status: 'published', category: 'museum' });
  fail('boş açıklama ada düşürülerek geçti');
} catch (err) {
  if (err instanceof PublishQualityError && err.missing.includes('descriptionTr')) {
    ok('boş Türkçe açıklama ad ile dolmaz');
  } else fail(`açıklama hatası beklenenden farklı: ${err.message}`);
}

const hidden = sections.placeSectionVisibility({
  overview: 'Genel metin',
  history: '',
  thingsToDo: [],
  cultureFood: '—',
  tips: 'Kalabalıktan önce gidin.',
  bestTime: '',
  howToGetThere: 'Tramvay',
  tags: [],
}, 'tr');
if (hidden.history || hidden.things || hidden.culture || hidden.tags) fail('boş bölüm görünür kaldı');
else if (!hidden.overview || !hidden.tipsText || !hidden.howToGet || !hidden.tips) fail('dolu bölüm gizlendi');
else if (hidden.bestTime) fail('boş en iyi zaman görünür');
else ok('boş tarihçe, yapılacaklar, kültür, etiket ve en iyi zaman gizli');

const enFallback = sections.placeSectionVisibility({ history: 'Türkçe tarih', historyEn: '' }, 'en');
if (!enFallback.history) fail('İngilizce boşken Türkçe tarih gizlendi');
else ok('İngilizce boşsa Türkçe metin bölümü tutar');

const thingsNotTips = sections.placeSectionVisibility({ thingsToDo: [], tips: 'İpucu var' }, 'tr');
if (thingsNotTips.things) fail('boş yapılacaklar ipucundan dolduruldu');
else if (!thingsNotTips.tipsText) fail('ipucu kayboldu');
else ok('yapılacaklar ipucuna düşmez');

const named = sections.emptyNamedSections({
  history: '',
  thingsToDo: ['Yürü'],
  cultureFood: '',
  tips: '',
}, 'tr');
if (named.join(',') !== 'tarihce,kultur,ipuclari') fail(`boş bölüm adları: ${named.join(',')}`);
else ok('boş bölüm adları tarihçe, kültür, ipuçları');

const adminPlace = read('server/lib/admin-place.js');
if (!adminPlace.includes('assertCanPublish')) fail('kayıt kapıyı çağırmıyor');
else ok('yer kaydı kapıyı çağırır');
if (/status\s*=\s*'draft'/.test(read('server/lib/publish-quality.js'))) {
  fail('kapı kaydı taslağa çekiyor');
} else ok('kapı kendiliğinden taslağa çekmez');

const app = read('public/js/app.js');
const html = read('public/index.html');
const css = read('public/css/style.css');
const admin = read('public/admin.html');
if (!app.includes('applyPlaceSectionVisibility') || !app.includes('TL_PLACE_SECTIONS')) {
  fail('mekân sayfası boş bölümü gizlemiyor');
} else if (app.includes("placeField(p, 'tips') || '—'")) {
  fail('yapılacaklar hâlâ tire yer tutucuya düşüyor');
} else ok('mekân sayfası boş sekmeyi ve başlığı gizler');
if (!html.includes('id="pdHistBlock"') || !html.includes('/js/place-sections.js')) {
  fail('tarihçe bloğu veya bölüm betiği yok');
} else ok('tarihçe başlığı bölüm betiğine bağlı');
if (!css.includes('.dtab.is-empty') || !css.includes('.sec-block.is-empty')) {
  fail('boş bölüm gizleme kuralı yok');
} else ok('boş sekme ve başlık görünmez');
if (!admin.includes('plSourceUrl') || !admin.includes('infoSourceUrl')) {
  fail('yönetici formunda kaynak URL yok');
} else if (!admin.includes('Eksik eski yayınlar kendiliğinden taslağa çekilmez')) {
  fail('yayın uyarısı yok');
} else ok('yönetici formu kaynak URL ve uyarıyı gösterir');

const uploadTest = read('server/scripts/verify-admin-image-upload.js');
const sessionTest = read('server/scripts/verify-admin-session.js');
if (uploadTest.includes("name: 'Verify Upload Place'") && uploadTest.includes("status: 'published'")) {
  fail('görsel denemesi eksik yeri hâlâ yayınlıyor');
} else if (sessionTest.includes("name: 'Verify Session Place'") && sessionTest.includes("status: 'published'")) {
  fail('oturum denemesi eksik yeri hâlâ yayınlıyor');
} else ok('fotoğraf denemeleri eksik yeri taslak açar');

const loaded = loadFromJson();
const report = buildReport(loaded.places, loaded.source);
const ayasofya = report.gaps.find((row) => Number(row.id) === 1);
if (!ayasofya) fail('Ayasofya eksik listesinde yok');
else if (ayasofya.missing !== 'kaynak URL veya doğrulama tarihi') {
  fail(`Ayasofya eksikleri: ${ayasofya.missing}`);
} else ok('Ayasofya yayında kalır; eksik olan yalnızca kaynak');

const draftInGaps = report.gaps.filter((row) => {
  const place = loaded.places.find((item) => Number(item.id) === Number(row.id));
  return place && place.status === 'draft';
});
if (draftInGaps.length) fail('taslaklar eksik yayın listesine girdi');
else ok('taslaklar eksik yayın listesinde değil');

if (report.summary.statusChanges !== 0) fail('rapor durum değiştirdi');
else if (report.summary.gapCount < 1) fail('eksik yayın sayısı boş');
else if (report.summary.fieldCounts.sourceOrDate < report.summary.publishedCount) {
  fail('kaynağı olan yayın varmış gibi sayıldı');
} else ok(`eksik yayın ${report.summary.gapCount} / yayında ${report.summary.publishedCount}; durum değişmedi`);

const auditSrc = read('server/scripts/audit-publish-quality.js');
if (/UPDATE\s+places/i.test(auditSrc) || /status\s*=\s*'draft'/.test(auditSrc)) {
  fail('rapor betiği kayıt yazıyor');
} else if (!auditSrc.includes('BEGIN READ ONLY')) fail('veritabanı okuması salt okunur değil');
else ok('rapor salt okunur');

if (failed) {
  console.error(`\n${failed} kontrol başarısız`);
  process.exit(1);
}
console.log('\nV4 Adım 6 kontrolleri geçti');
