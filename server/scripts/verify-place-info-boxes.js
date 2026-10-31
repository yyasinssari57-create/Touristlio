/**
 * Place info boxes: empty fields omitted, false booleans still shown,
 * admin PATCH is behind the existing admin auth.
 * No database connection — does not touch production.
 */
const fs = require('fs');
const path = require('path');
const { buildPlaceInfoBoxes, normalizePlaceInfoPatch } = require('../lib/place-info-boxes');

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

console.log('verify-place-info-boxes');

const empty = buildPlaceInfoBoxes({
  climateInfo: '  ',
  currency: null,
  budgetLevel: '',
  budgetAmount: null,
  visitDuration: '',
  bestTime: null,
  entryFee: '',
  isFree: false,
  wheelchairAccessible: null,
  familyFriendly: null,
  petFriendly: null,
  hasParking: null,
  infoVerifiedAt: '2026-01-01T00:00:00.000Z',
});
if (empty.boxes.length !== 0) fail(`boş alanlar gizlenmedi: ${JSON.stringify(empty.boxes)}`);
else ok('boş / null alanlar kutu olarak dönmüyor');
if (empty.verifiedAt != null) fail('kutu yokken son güncelleme satırı üretilmemeli');
else ok('kutu yoksa son güncelleme de yok');

const falses = buildPlaceInfoBoxes({
  wheelchairAccessible: false,
  familyFriendly: false,
  petFriendly: false,
  hasParking: false,
  isFree: false,
  infoVerifiedAt: null,
});
const falseKeys = falses.boxes.map((b) => b.key).sort();
if (falseKeys.join(',') !== 'family,parking,pets,wheelchair') {
  fail(`false boolean kutuları eksik: ${falseKeys.join(',')}`);
} else ok('false boolean (Yok/Hayır) yine gösterilir; ücretsiz değil + boş ücret gizlenir');
if (falses.boxes.some((b) => !b.valueKey)) fail('false kutularda valueKey yok');
if (falses.verifiedAt != null) fail('info_verified_at null iken tarih dönmemeli');
else ok('info_verified_at null ise tarih satırı yok');

const filled = buildPlaceInfoBoxes({
  climateInfo: 'İlkbahar ılık',
  currency: 'Euro',
  budgetLevel: 'low',
  budgetAmount: '40 €',
  visitDuration: '1-2 saat',
  bestTime: 'Nisan–Haziran',
  bestTimeEn: 'April–June',
  entryFee: '12 €',
  isFree: true,
  wheelchairAccessible: true,
  familyFriendly: true,
  petFriendly: false,
  hasParking: true,
  infoVerifiedAt: '2026-06-01T12:00:00.000Z',
}, 'en');
const byKey = Object.fromEntries(filled.boxes.map((b) => [b.key, b]));
if (!byKey.climate || byKey.climate.text !== 'İlkbahar ılık') fail('iklim kutusu yok');
else ok('climate_info doluysa kutu var');
if (byKey.bestTime?.text !== 'April–June') fail(`EN en iyi zaman: ${byKey.bestTime?.text}`);
else ok('EN dilinde best_time_en kullanılıyor');
if (byKey.entry?.valueKey !== 'infoFree') fail('ücretsiz işaretli yer Ücretsiz göstermeli');
else ok('is_free true ise giriş kutusu Ücretsiz');
if (byKey.pets?.valueKey !== 'infoNo') fail('evcil hayvan false Hayır olmalı');
if (!filled.verifiedAt) fail('dolu kutularda verifiedAt yok');
else ok('dolu kutularda son güncelleme tarihi var');

const badLevel = normalizePlaceInfoPatch({ budget_level: 'luxury', climate_info: 'x' });
if (!badLevel.error) fail('geçersiz bütçe seviyesi kabul edildi');
else ok('geçersiz bütçe seviyesi reddedilir');

const badUrl = normalizePlaceInfoPatch({ info_source_url: 'javascript:alert(1)' });
if (!badUrl.error) fail('javascript URL kabul edildi');
else ok('kaynak URL yalnızca http(s)');

const saved = normalizePlaceInfoPatch({
  climate_info: '  Yaz sıcak  ',
  currency: '',
  budget_level: 'high',
  budget_amount: '2000 TL',
  visit_duration: '',
  best_time: 'Haziran',
  entry_fee: '',
  is_free: false,
  wheelchair_accessible: false,
  family_friendly: null,
  pet_friendly: 'true',
  has_parking: '',
  info_source_url: 'https://example.com/kaynak',
});
if (saved.error) fail(saved.error);
else if (saved.values.climate_info !== 'Yaz sıcak') fail('iklim trim edilmedi');
else if (saved.values.currency !== null) fail('boş para birimi null olmalı');
else if (saved.values.budget_level !== 'high') fail('bütçe high olmalı');
else if (saved.values.wheelchair_accessible !== false) fail('engelli false kalmalı');
else if (saved.values.family_friendly !== null) fail('aile null kalmalı');
else if (saved.values.pet_friendly !== true) fail('evcil true olmalı');
else if (saved.values.has_parking !== null) fail('boş otopark null olmalı');
else if (saved.values.is_free !== false) fail('is_free false');
else ok('PATCH gövdesi temizleniyor (boş=null, false korunur)');

const adminJs = read('server/routes/admin.js');
if (!/router\.use\(\s*authRequired\s*,\s*requireRole\(\.\.\.PANEL_ROLES\)\s*\)/.test(adminJs)) {
  fail('admin router authRequired blanket yok');
} else ok('admin rotaları mevcut oturum kontrolünün arkasında');

const patchRe = /router\.patch\(\s*'\/places\/:id\/info'\s*,\s*checkPermission\(\s*'admin\.places'\s*\)/;
if (!patchRe.test(adminJs)) fail('PATCH /places/:id/info admin.places izniyle yok');
else ok('PATCH /api/admin/places/:id/info admin.places ile korunuyor');

const useAt = adminJs.indexOf('router.use(authRequired');
const patchAt = adminJs.indexOf("router.patch('/places/:id/info'");
if (useAt < 0 || patchAt < 0 || patchAt < useAt) fail('PATCH rotası auth middleware öncesinde');
else ok('PATCH rotası auth middleware sonrasında');

if (!/info_verified_at\s*=\s*NOW\(\)/.test(adminJs)) fail('kayıtta info_verified_at = NOW() yok');
else ok('kayıt info_verified_at zamanını şimdi yapıyor');

const migration = read('db/migrations/011_place_info_boxes.js');
for (const col of ['climate_info', 'budget_level', 'wheelchair_accessible', 'info_verified_at', 'is_free']) {
  if (!migration.includes(col)) fail(`migration ${col} yok`);
}
if (failed === 0) ok('migration dosyası kolonları içeriyor');

const adminHtml = read('public/admin.html');
if (!adminHtml.includes('Bilgi Kutucukları') || !adminHtml.includes('Bilgileri Kaydet')) {
  fail('admin formunda Bilgi Kutucukları / Bilgileri Kaydet yok');
} else ok('admin formunda Bilgi Kutucukları bölümü var');
if (!adminHtml.includes("/info'") && !adminHtml.includes('/info"') && !adminHtml.includes("/info`") && !adminHtml.includes("+ '/info'")) {
  fail('admin kaydı PATCH /info çağırmıyor');
} else ok('Bilgileri Kaydet /info ucunu çağırıyor');

const appJs = read('public/js/app.js');
if (!appJs.includes('renderStaticInfoBoxes')) fail('detay sayfası kutu çizmiyor');
else ok('detay sayfası staticInfo kutularını çiziyor');
if (!appJs.includes('weatherUnavailable')) fail('hava hatası metni yok');
else ok('canlı hava hatası ayrı metin kullanıyor');

const weatherJs = read('server/services/weatherService.js');
if (/Tahmini ılıman/.test(weatherJs)) fail('hava API hatası hâlâ sahte tahmin döndürüyor');
else ok('hava API hatası sahte sıcaklık uydurmuyor');

const i18n = read('public/js/i18n.js');
if (!i18n.includes("weatherUnavailable: 'veri alınamadı'")) fail('TR veri alınamadı yok');
else ok('TR: veri alınamadı');
if (!i18n.includes('infoClimate')) fail('i18n infoClimate yok');
else ok('kutu etiketleri i18n içinde');

if (failed) {
  console.error(`\n${failed} kontrol başarısız`);
  process.exit(1);
}
console.log('\nplace info boxes OK');
