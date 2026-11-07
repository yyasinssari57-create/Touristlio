/**
 * Step 4 — place detail sections (admin edit + visitor conditional + months + hotel).
 * No database connection.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
  normalizeBestMonths,
  formatBestMonths,
  bestTimeFromMonths,
  parseBestMonths,
} = require('../lib/best-months');
const { applyInfoBoxUpdates } = require('../services/liveDataService');
const placeSections = require('../../public/js/place-sections');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

console.log('verify-place-detail-sections');

const months = normalizeBestMonths([4, 6, 4, 0, 13, '5', 5]);
if (JSON.stringify(months) !== JSON.stringify([4, 5, 6])) fail(`ay normalize: ${JSON.stringify(months)}`);
else ok('ay çoklu seçim normalize (1–12, tekil, sıralı)');

if (formatBestMonths([4, 5, 6], 'tr') !== 'Nisan, Mayıs, Haziran') fail('TR ay formatı');
else if (formatBestMonths([4, 5, 6], 'en') !== 'April, May, June') fail('EN ay formatı');
else if (bestTimeFromMonths([], 'tr') !== '') fail('boş ay metni boş olmalı');
else ok('ay formatı TR/EN');

if (JSON.stringify(parseBestMonths('[3,9]')) !== JSON.stringify([3, 9])) fail('JSON best_months parse');
else ok('best_months JSON parse');

const filled = placeSections.placeSectionVisibility({
  overview: 'var',
  thingsToDo: ['A', 'B'],
  cultureFood: 'yemek',
  travelTips: 'tavsiye',
  bestMonths: [4, 5],
}, 'tr');
if (!filled.things || !filled.culture || !filled.tipsText || !filled.bestTime) {
  fail(`dolu bölümler görünür olmalı: ${JSON.stringify(filled)}`);
} else if (filled.texts.bestTime !== 'Nisan, Mayıs') {
  fail(`en iyi zaman metni: ${filled.texts.bestTime}`);
} else ok('dolu Yapılacaklar / Kültür / Tavsiye / Aylar görünür');

const empty = placeSections.placeSectionVisibility({
  overview: 'var',
  thingsToDo: [],
  cultureFood: '',
  travelTips: '',
  bestMonths: [],
  bestTime: '',
}, 'tr');
if (empty.things || empty.culture || empty.tipsText || empty.bestTime) {
  fail(`boş bölümler gizlenmeli: ${JSON.stringify(empty)}`);
} else ok('boş Kültür / Tavsiye / Aylar / Yapılacaklar gizlenir');

const dash = placeSections.placeSectionVisibility({
  cultureFood: '—',
  travelTips: '-',
  bestTime: 'n/a',
}, 'tr');
if (dash.culture || dash.tipsText || dash.bestTime) fail('yer tutucu metin bölüm sayılmaz');
else ok('yer tutucu (—) bölüm açmaz');

const hotelOn = applyInfoBoxUpdates({}, { hotelAvg: '2200' });
if (hotelOn.hotel?.avgPriceTry !== 2200 || hotelOn.hotel?.note !== 'admin' || hotelOn.hotel?.scope !== 'district') {
  fail(`otel admin kaydı: ${JSON.stringify(hotelOn.hotel)}`);
} else ok('bölge otel ortalaması admin notu ile saklanır');

const hotelOff = applyInfoBoxUpdates(hotelOn, { hotelAvg: '' });
if (hotelOff.hotel?.avgPriceTry) fail('boş otel değeri silinmeli');
else ok('boş otel ortalaması temizlenir');

const adminHtml = read('public/admin.html');
const appJs = read('public/js/app.js');
const i18nJs = read('public/js/i18n.js');
const indexHtml = read('public/index.html');
const placeJs = read('server/lib/admin-place.js');
const mig = read('db/migrations/022_place_detail_sections.js');

for (const id of ['edThingsToDo', 'edCultureFood', 'edTravelTips', 'edBestMonths', 'edHotelAvg']) {
  if (!adminHtml.includes(`id="${id}"`) && !adminHtml.includes(`id='${id}'`) && !adminHtml.includes(id)) {
    fail(`admin formda yok: ${id}`);
  }
}
if (!adminHtml.includes('Bölge otel ortalaması')) fail('otel etiketi bölge değil');
if (adminHtml.includes('İlçe otel ortalaması') || /hotelAvg:\s*'İlçe/.test(i18nJs)) {
  fail('ziyaretçi/admin kopyasında «ilçe otel» kaldı; «bölge» kullanılmalı');
}
if (!i18nJs.includes("hotelAvg: 'Bölge otel ort.'") || !i18nJs.includes("hotelAvg: 'Area hotel avg.'")) {
  fail('i18n hotelAvg etiketi Bölge/Area olmalı');
}
if (!adminHtml.includes('renderBestMonthChecks') || !adminHtml.includes('readBestMonths')) {
  fail('ay çoklu seçim yardımcıları yok');
}
if (!adminHtml.includes('thingsToDo:') || !adminHtml.includes('bestMonths:') || !adminHtml.includes('cultureFood:')) {
  fail('Kaydet gövdesinde bölüm alanları yok');
}
if (failed === 0) ok('admin form bölüm alanları + ay seçimi + bölge otel');

if (!placeJs.includes('best_months') || !placeJs.includes('things_to_do = ?') || !placeJs.includes('culture_food = ?')) {
  fail('updatePlace bölüm sütunlarını yazmıyor');
} else if (!placeJs.includes('fillPlaceholders: false')) {
  fail('güncellemede şablon doldurma kapatılmalı');
} else ok('updatePlace things/culture/months yazar, şablon zorlamaz');

if (!mig.includes('best_months')) fail('migration best_months yok');
else ok('022_place_detail_sections migration');

if (!appJs.includes("hotel.note === 'admin'") || !appJs.includes('showHotel')) {
  fail('ziyaretçi otel satırı yalnız admin değerinde');
} else ok('otel ortalaması yalnız admin doluysa gösterilir');

const headingKeys = [
  'detailOverview', 'detailThings', 'detailCulture', 'detailTips',
  'detailHistory', 'detailBestTime', 'detailHowToGet', 'detailTags',
];
for (const key of headingKeys) {
  const re = new RegExp(`${key}:\\s*'([^']*)'`, 'g');
  let m;
  while ((m = re.exec(i18nJs))) {
    if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(m[1])) {
      fail(`i18n ${key} hâlâ emoji: ${m[1]}`);
    }
  }
}
if (/pdOverviewBlock[\s\S]{0,80}📍|pdThingsBlock[\s\S]{0,80}✅|pdCultureBlock[\s\S]{0,80}🍽️|pdTipsBlock[\s\S]{0,80}💡|pdBestTimeBlock[\s\S]{0,80}📅/.test(indexHtml)) {
  fail('index.html bölüm başlıklarında emoji kaldı');
} else ok('yer detay bölüm başlıklarında emoji yok');

const filterKeys = [
  'tabFilter', 'tabDiscover', 'tabMap', 'tabTiolas', 'tabCategories',
  'filterTitle', 'entryFree', 'entryPaid', 'filterLocalPicks',
  'weatherOutdoor', 'weatherIndoor', 'weatherWinter', 'weatherSunrise', 'weatherNight',
  'accessWheel', 'accessFamily', 'accessPet', 'accessParking', 'filterShow',
];
for (const key of filterKeys) {
  const re = new RegExp(`${key}:\\s*'([^']*)'`, 'g');
  let m;
  while ((m = re.exec(i18nJs))) {
    if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(m[1])) {
      fail(`i18n ${key} hâlâ emoji: ${m[1]}`);
    }
  }
}
if (/et-filter[^>]*>[^<]*[⚙️🎛️]|filter-tab-title[^>]*>[^<]*🎛️|data-i18n="entryFree">[^<]*🆓|data-score="3">[^<]*⭐/.test(indexHtml)) {
  fail('keşfet/gelişmiş filtre HTML etiketlerinde emoji kaldı');
}
if (/adm-side-card-title">[🌤️🕐💰📋]/.test(adminHtml) || /ac-title">[🌤️🕐💰]/.test(appJs)) {
  fail('admin/ziyaretçi yan panel başlıklarında emoji kaldı');
}
if (failed === 0) ok('gelişmiş filtre ve yan panel etiketlerinde emoji yok');

const inline = adminHtml.split('<script>').pop().split('</script>')[0];
try {
  new vm.Script(inline, { filename: 'admin.html' });
  ok('admin script sözdizimi sağlam');
} catch (err) {
  fail(`admin script sözdizimi: ${err.message}`);
}
try {
  new vm.Script(appJs, { filename: 'app.js' });
  ok('app.js sözdizimi sağlam');
} catch (err) {
  fail(`app.js sözdizimi: ${err.message}`);
}
try {
  new vm.Script(read('public/js/place-sections.js'), { filename: 'place-sections.js' });
  ok('place-sections.js sözdizimi sağlam');
} catch (err) {
  fail(`place-sections.js sözdizimi: ${err.message}`);
}

if (failed) {
  console.error(`\n${failed} kontrol başarısız`);
  process.exit(1);
}
console.log('\nplace detail sections OK');
