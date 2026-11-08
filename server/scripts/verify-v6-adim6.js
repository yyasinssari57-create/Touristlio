#!/usr/bin/env node
/**
 * V6 Adım 6 — Konaklama, bütçe ve «En iyi zaman» netliği.
 * - Ardışık aylar aralık («Nisan – Ekim»)
 * - Konaklama şehir düzeyinde (cities.hotel_avg_try) + etiket
 * - Tahmini bütçe etiketi; otomatik otel fiyatı gerçek gibi sunulmaz
 *
 * Usage: npm run verify:v6-adim6
 */
const fs = require('fs');
const path = require('path');
const {
  formatBestMonths,
  formatBestTimeDisplay,
  cleanBestTimeNote,
  normalizeBestMonths,
} = require('../lib/best-months');
const { applyInfoBoxUpdates } = require('../services/liveDataService');
const placeSections = require('../../public/js/place-sections');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) { console.error('  ✗', msg); failed += 1; }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

console.log('verify-v6-adim6-konaklama');

const pkg = JSON.parse(read('package.json'));
if (pkg.scripts?.['verify:v6-adim6'] !== 'node server/scripts/verify-v6-adim6.js') {
  fail('package.json verify:v6-adim6 eksik/yanlış');
} else ok('package.json verify:v6-adim6');

/* ── 1. Ay aralığı ── */
const aprilOct = formatBestMonths([4, 5, 6, 7, 8, 9, 10], 'tr');
if (aprilOct !== 'Nisan – Ekim') fail(`Nisan – Ekim beklenirdi: "${aprilOct}"`);
else ok('formatBestMonths → Nisan – Ekim');

if (formatBestMonths([4, 5, 6], 'en') !== 'April – June') fail('EN April – June');
else ok('EN April – June');

if (formatBestMonths([4, 6, 9], 'tr') !== 'Nisan, Haziran, Eylül') {
  fail(`kopuk aylar: ${formatBestMonths([4, 6, 9], 'tr')}`);
} else ok('kopuk aylar virgülle ayrılır');

const withNote = formatBestTimeDisplay([4, 5, 6, 7, 8, 9, 10], 'tr', 'Sabah erken gidin');
if (withNote !== 'Nisan – Ekim. Sabah erken gidin') fail(`not+aralık: ${withNote}`);
else ok('isteğe bağlı kısa not eklenir');

if (cleanBestTimeNote('Nisan – Ekim', 'Nisan – Ekim') !== '') fail('ay metni not sayılmamalı');
else ok('ay metni not olarak tekrarlanmaz');

const vis = placeSections.placeSectionVisibility({
  bestMonths: normalizeBestMonths([4, 5, 6, 7, 8, 9, 10]),
}, 'tr');
if (vis.texts.bestTime !== 'Nisan – Ekim') fail(`place-sections: ${vis.texts.bestTime}`);
else ok('place-sections aralık metni');

/* ── 2. Şehir konaklama + tahmini ── */
const adminHtml = read('public/admin.html');
const appJs = read('public/js/app.js');
const i18nJs = read('public/js/i18n.js');
const liveJs = read('server/services/liveDataService.js');
const catalogJs = read('server/lib/catalog-db.js');
const mig = read('db/migrations/024_city_hotel_avg.js');
const migLib = read('server/lib/migrations.js');

if (!mig.includes('hotel_avg_try') || !migLib.includes('hotel_avg_try')) {
  fail('cities.hotel_avg_try migration yok');
} else ok('024_city_hotel_avg + migrations.js');

if (!catalogJs.includes('hotel_avg_try') || !catalogJs.includes('hotelAvgTry')) {
  fail('catalog-db şehir otel alanı yok');
} else ok('catalog-db hotelAvgTry');

for (const id of ['ctHotelAvg', 'edCtHotelAvg', 'edBestTimeNote', 'edHotelAvg']) {
  if (!adminHtml.includes(`id="${id}"`) && !adminHtml.includes(id)) {
    fail(`admin formda yok: ${id}`);
  }
}
if (!adminHtml.includes('Konaklama (şehir ortalaması')) fail('şehir formu konaklama etiketi yok');
else ok('Şehirler formu konaklama alanı');

if (!adminHtml.includes('Nisan – Ekim')) {
  fail('admin ipucunda aralık örneği yok');
} else ok('admin en iyi zaman aralık ipucu');

if (!liveJs.includes('lookupCityHotelAvg') || !liveJs.includes("scope: 'city'")) {
  fail('liveDataService şehir otel lookup yok');
} else ok('getLiveData şehir otel lookup');

if (!liveJs.includes('estimated: true') || !liveJs.includes("note: 'estimated'")) {
  fail('tahmini bütçe bayrağı yok');
} else ok('tahmini bütçe bayrağı');

// Otomatik otel artık yazılmamalı / gösterilmemeli
if (/hotel:\s*\{\s*avgPriceTry:\s*estimated/.test(liveJs)
  || liveJs.includes('avgPriceTry: estimated.hotelRangeTry.mid')) {
  fail('tahmini otel hâlâ varsayılan olarak üretiliyor');
} else ok('tahmini otel varsayılan olarak üretilmez');

if (!appJs.includes('hotelAvgCity') || !appJs.includes('live-est-badge') || !appJs.includes('budgetEstimated')) {
  fail('app.js şehir etiketi / tahmini rozet yok');
} else ok('app.js tahmini rozet + şehir otel etiketi');

if (!i18nJs.includes("hotelAvgCity: 'Konaklama (şehir ortalaması)'")
  || !i18nJs.includes("liveEstimate: 'Tahmini'")
  || !i18nJs.includes('liveEstimateHint')) {
  fail('i18n Adım 6 etiketleri eksik');
} else ok('i18n Konaklama / Tahmini');

const hotelOn = applyInfoBoxUpdates({}, { hotelAvg: '2200' });
if (hotelOn.hotel?.scope !== 'district' || hotelOn.hotel?.note !== 'admin') {
  fail(`yer override scope: ${JSON.stringify(hotelOn.hotel)}`);
} else ok('yer otel override = district/admin');

const css = read('public/css/style.css');
if (!css.includes('.live-est-badge')) fail('live-est-badge CSS yok');
else ok('live-est-badge CSS');

if (!adminHtml.includes('guide-sehirler') || !adminHtml.includes('şehir ortalaması')) {
  fail('kılavuz şehir konaklama metni yok');
} else ok('admin kılavuz şehir konaklama');

if (failed) {
  console.error(`verify-v6-adim6 KALDI (${failed} hata)`);
  process.exit(1);
}
console.log('verify-v6-adim6 TAMAM');
