/**
 * Place edit: core create fields round-trip in the admin form,
 * lat/lng validation, info boxes still saved, live clock + live weather.
 * No database connection.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { parseOptionalCoord } = require('../lib/admin-place');
const { buildPlaceInfoBoxes } = require('../lib/place-info-boxes');
const { applyInfoBoxUpdates, mergeWeather, mergeLocalInfo } = require('../services/liveDataService');

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

console.log('verify-place-edit-fields');

if (parseOptionalCoord(null, -90, 90) !== undefined) fail('boş enlem undefined dönmeli');
else if (parseOptionalCoord('', -90, 90) !== undefined) fail('boş string enlem undefined dönmeli');
else if (parseOptionalCoord('  ', -180, 180) !== undefined) fail('boş boylam undefined dönmeli');
else if (parseOptionalCoord(0, -90, 90) !== 0) fail('enlem 0 geçerli olmalı');
else if (parseOptionalCoord('41,0082', -90, 90) !== 41.0082) fail('virgüllü enlem kabul edilmeli');
else if (parseOptionalCoord(-74.006, -180, 180) !== -74.006) fail('negatif boylam kabul edilmeli');
else ok('boş koordinat durur; 0 ve virgül kabul');

let threw = false;
try { parseOptionalCoord(91, -90, 90); } catch { threw = true; }
if (!threw) fail('enlem 91 reddedilmeli');
else ok('enlem aralık dışı reddedilir');
threw = false;
try { parseOptionalCoord(-181, -180, 180); } catch { threw = true; }
if (!threw) fail('boylam -181 reddedilmeli');
else ok('boylam aralık dışı reddedilir');

const stripped = applyInfoBoxUpdates({
  weather: { label: 'Kapalı', tempC: 22 },
  localInfo: { localTime: '01.01.2020 00:00:00', currencyCode: 'EUR', currencySymbol: '€' },
  budget: { low: 100 },
}, {
  weatherLabel: 'Güneşli',
  weatherTempC: 30,
  localTime: '07.06.2026 14:30:00',
  currencyCode: 'TRY',
  currencySymbol: '₺',
});
if (stripped.weather) fail('canlı hava yönetici metni olarak saklanmamalı');
else if (stripped.localInfo && stripped.localInfo.localTime) fail('yerel saat yönetici metni olarak saklanmamalı');
else if (stripped.localInfo?.currencyCode !== 'TRY' || stripped.localInfo?.currencySymbol !== '₺') {
  fail(`para birimi durmalı: ${JSON.stringify(stripped.localInfo)}`);
} else if (!stripped.budget || stripped.budget.low !== 100) fail('bütçe kutusu silinmemeli');
else ok('saat ve hava kaydı silinir; para birimi ve bütçe durur');

const live = { tempC: 18, label: 'Açık', fallback: false, timezone: 'Europe/Istanbul' };
const mergedW = mergeWeather(live, { weather: { label: 'Elle', tempC: 1 } });
if (!mergedW || mergedW.label !== 'Açık' || mergedW.tempC !== 18 || mergedW.adminOverride) {
  fail(`hava yönetici değerini yok saymalı: ${JSON.stringify(mergedW)}`);
} else ok('canlı hava yönetici etiketini ezmez');

const mergedL = mergeLocalInfo({
  timezone: 'Europe/Istanbul',
  localTime: 'canlı',
  currency: { code: 'TRY', symbol: '₺' },
}, {
  localInfo: { localTime: 'donuk', currencyCode: 'EUR' },
});
if (!mergedL || mergedL.localTime !== 'canlı') fail('donuk saat canlı saatin yerine geçmemeli');
else if (mergedL.currency?.code !== 'EUR') fail('para birimi kodu hâlâ değiştirilebilmeli');
else if (mergedL.timezone !== 'Europe/Istanbul') fail('saat dilimi kaybolmamalı');
else ok('saat canlı kalır; para birimi kodu düzenlenebilir');

const boxes = buildPlaceInfoBoxes({
  climateInfo: 'Yaz sıcak, kış ılık',
  familyFriendly: true,
  currency: 'Euro',
});
const keys = boxes.boxes.map((b) => b.key);
if (!keys.includes('climate') || !keys.includes('family') || !keys.includes('currency')) {
  fail(`bilgi kutuları eksik: ${keys.join(',')}`);
} else ok('iklim, aile ve para kutuları duruyor');

const adminHtml = read('public/admin.html');
const adminJs = read('server/routes/admin.js');
const appJs = read('public/js/app.js');
const placeJs = read('server/lib/admin-place.js');
const weatherJs = read('server/services/weatherService.js');
const legacyJs = read('server/routes/places-legacy.js');

const fields = [
  'edName', 'edCountry', 'edCity', 'edDistrict', 'edLocation', 'edCat', 'edStatus',
  'edAliases', 'edLat', 'edLng', 'edDesc', 'edDescEn', 'edOverview', 'edOverviewEn',
  'infoClimate', 'infoFamily', 'Bilgi Kutucukları', 'Bilgileri Kaydet',
];
for (const id of fields) {
  if (!adminHtml.includes(id)) fail(`düzenle formunda yok: ${id}`);
}
if (failed === 0) ok('düzenle formu yer bilgisi + bilgi kutucuklarını içeriyor');

if (/id="edLocalTime"|id="edWeatherLabel"|id="edWeatherTemp"/.test(adminHtml)) {
  fail('saat veya hava hâlâ elle yazılan kutu');
} else ok('saat ve hava formu elle yazılmıyor');

const saveAt = adminHtml.indexOf('async function savePlaceEdit');
const saveEnd = adminHtml.indexOf('async function confirmDeletePlace', saveAt);
const saveFn = adminHtml.slice(saveAt, saveEnd > saveAt ? saveEnd : saveAt + 8000);
for (const key of ['location:', 'district:', 'lat,', 'lng,', 'descriptionEn:', 'overview:', 'searchAliases:']) {
  if (!saveFn.includes(key)) fail(`Kaydet gövdesinde yok: ${key}`);
}
if (!saveFn.includes("+ '/info'")) fail('Kaydet bilgi kutucuklarını da yazmalı');
else if (saveFn.includes('localTime: document') || saveFn.includes('weatherLabel: document')) {
  fail('Kaydet hâlâ saat/hava kutusunu okuyor');
} else ok('Kaydet adres, koordinat ve bilgi kutucuğunu gönderiyor');

if (!/router\.put\(\s*'\/places\/:id'\s*,\s*checkPermission\(\s*'admin\.places'\s*\)/.test(adminJs)) {
  fail('PUT /places/:id admin.places izni yok');
} else ok('PUT yer kaydı admin.places ile korunuyor');
if (!/router\.patch\(\s*'\/places\/:id\/info'\s*,\s*checkPermission\(\s*'admin\.places'\s*\)/.test(adminJs)) {
  fail('PATCH bilgi kutusu izni yok');
} else ok('PATCH bilgi kutusu admin.places ile korunuyor');

if (!placeJs.includes('location: src.location') || !placeJs.includes('parseOptionalCoord(src.lat')) {
  fail('updatePlace adres veya enlem kabul etmiyor');
} else if (!/overview = \?/.test(placeJs)) fail('updatePlace sayfa özetini yazmıyor');
else ok('updatePlace adres, enlem ve özeti yazıyor');

if (!appJs.includes('id="pdLocalClock"') || !appJs.includes('setInterval(tick, 1000)') || !appJs.includes('function startPlaceClock')) {
  fail('yerel saat kendiliğinden akmıyor');
} else if (!appJs.includes('stopPlaceClock')) fail('saat sayacı sayfa değişince durmuyor');
else ok('yerel saat saniye saniye akar');

if (!weatherJs.includes('api.open-meteo.com') || !weatherJs.includes('timezone')) {
  fail('canlı hava saat dilimi döndürmüyor');
} else if (!legacyJs.includes('applyResolvedTimezone')) {
  fail('yer saati dilim seçimi yok');
} else if (legacyJs.includes('timezoneForCountry')) {
  fail('yer saati hâlâ ülke tablosundan seçiliyor');
} else ok('hava Open-Meteo; saat dilimi koordinat');

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

if (failed) {
  console.error(`\n${failed} kontrol başarısız`);
  process.exit(1);
}
console.log('\nplace edit fields OK');
