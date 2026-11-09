#!/usr/bin/env node
/**
 * V6 Adım 10 — Admin katalog sayaçları + çöp güvenliği.
 * - Sayaç/filtre şeridi (Yayında · Taslak · Arşiv · Çöp · kalite)
 * - Satır «Yayına hazır değil çünkü…»
 * - Toplu çöp: KALICI + Arşivle önerisi
 * - Çöp satırında kalan gün + Geri yükle
 * - Özet panelinde çöp uyarı bandı
 *
 * Usage: npm run verify:v6-adim10
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) { console.error('  ✗', msg); failed += 1; }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

console.log('verify-v6-adim10-catalog-trash');

const pkg = JSON.parse(read('package.json'));
if (pkg.scripts?.['verify:v6-adim10'] !== 'node server/scripts/verify-v6-adim10.js') {
  fail('package.json verify:v6-adim10 eksik/yanlış');
} else ok('package.json verify:v6-adim10');

const catalogJs = read('server/lib/place-catalog.js');
const adminPlaceJs = read('server/lib/admin-place.js');
const adminRoutes = read('server/routes/admin.js');
const adminHtml = read('public/admin.html');
const css = read('public/css/inline-overrides.css');

/* ── 1. Katalog API / yardımcılar ── */
if (!catalogJs.includes('async function getCatalogCounts')
  || !catalogJs.includes('function trashDaysLeft')
  || !catalogJs.includes('function notReadyReasons')) {
  fail('place-catalog yardımcılar eksik');
} else ok('place-catalog getCatalogCounts / trashDaysLeft / notReadyReasons');

for (const needle of [
  'unverifiedImage',
  'missingSource',
  'invalidCoords',
  'enMissing',
  'INVALID_COORDS_SQL',
  'MISSING_SOURCE_SQL',
]) {
  if (!catalogJs.includes(needle)) fail(`place-catalog eksik: ${needle}`);
}
if (failed === 0 || catalogJs.includes('INVALID_COORDS_SQL')) ok('Adım 10 issue filtreleri');

if (!adminRoutes.includes("router.get('/places/catalog-counts'")) {
  fail('/admin/places/catalog-counts rotası yok');
} else ok('GET /admin/places/catalog-counts');

const catalogIdx = adminRoutes.indexOf("router.get('/places/catalog-counts'");
const getIdIdx = adminRoutes.indexOf("router.get('/places/:id'");
if (catalogIdx < 0 || getIdIdx < 0 || !(catalogIdx < getIdIdx)) {
  fail('catalog-counts, /places/:id öncesinde olmalı');
} else ok('catalog-counts /places/:id öncesinde');

if (!adminRoutes.includes('placesInTrash') || !adminRoutes.includes('trashRetentionDays')) {
  fail('/admin/stats çöp sayısı yok');
} else ok('/admin/stats placesInTrash');

if (!adminPlaceJs.includes('trashDaysLeft') || !adminPlaceJs.includes('notReadyReasons')) {
  fail('mapAdminPlace trashDaysLeft / notReadyReasons yok');
} else ok('mapAdminPlace satır alanları');

if (!adminPlaceJs.includes('CATALOG_ISSUE_FILTERS')) {
  fail('listAdminPlaces CATALOG_ISSUE_FILTERS kullanmıyor');
} else ok('ISSUE_FILTERS ← CATALOG_ISSUE_FILTERS');

/* ── 2. Admin UI strip + satır ── */
const uiNeedles = [
  'placesCatalogBar',
  'placesCatalogChips',
  'loadPlacesCatalogBar',
  'filterPlacesByStatus',
  'Yayına hazır değil çünkü:',
  'trashDaysLeft',
  'gün kaldı',
  'KALICI silinecek',
  'placesTrashWarnBanner',
  'adm-catalog-chip',
  'adm-place-not-ready',
];
let missingUi = 0;
for (const n of uiNeedles) {
  if (!adminHtml.includes(n)) {
    fail(`admin.html eksik: ${n}`);
    missingUi += 1;
  }
}
if (!missingUi) ok('admin.html sayaç şeridi + satır + uyarı');

if (!adminHtml.includes("label: 'Arşivle'")
  && !/label:\s*'Arşivle'/.test(adminHtml)
  && !adminHtml.includes("label: 'Arşivle'")) {
  // bulkTrashPlaces modal must offer Arşivle
}
if (!/bulkTrashPlaces[\s\S]*Arşivle[\s\S]*Çöpe taşı/.test(adminHtml)) {
  fail('toplu çöp onayında Arşivle seçeneği yok');
} else ok('toplu çöp → Arşivle önerisi');

if (!/confirmDeletePlace[\s\S]*KALICI silinecek[\s\S]*Arşivle/.test(adminHtml)) {
  fail('tekil sil onayında KALICI + Arşivle yok');
} else ok('tekil sil → KALICI + Arşivle');

if (!/Geri yükle/.test(adminHtml) || !/restorePlaceOne/.test(adminHtml)) {
  fail('çöp satırında Geri yükle yok');
} else ok('çöp satırı Geri yükle');

if (!css.includes('.adm-catalog-chip') || !css.includes('.adm-place-not-ready')) {
  fail('katalog CSS eksik');
} else ok('katalog CSS');

/* ── 3. Davranış birimi (DB yok) ── */
const {
  trashDaysLeft,
  notReadyReasons,
  CATALOG_ISSUE_FILTERS,
} = require('../lib/place-catalog');
const { missingPublishFields } = require('../lib/publish-quality');

const now = Date.now();
const d14 = trashDaysLeft(new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString(), 15);
if (d14 < 13 || d14 > 15) fail(`trashDaysLeft ~14 beklenirdi, alındı ${d14}`);
else ok(`trashDaysLeft örnek ≈ ${d14}`);

const d0 = trashDaysLeft(new Date(now - 20 * 24 * 60 * 60 * 1000).toISOString(), 15);
if (d0 !== 0) fail(`süresi dolmuş trashDaysLeft 0 olmalı, alındı ${d0}`);
else ok('süresi dolmuş → 0 gün');

if (trashDaysLeft(null) !== null) fail('deletedAt yokken null dönmeli');
else ok('trashDaysLeft(null) → null');

const incomplete = {
  name: '',
  description: '',
  lat: null,
  lng: null,
  category: '',
  image_verified: false,
  info_source_url: '',
  info_verified_at: null,
};
const reasons = notReadyReasons(incomplete);
if (!reasons.length) fail('eksik yerde notReadyReasons boş');
else ok(`notReadyReasons: ${reasons.slice(0, 4).join(', ')}…`);

const ready = {
  name: 'Ayasofya',
  description: 'A'.repeat(80),
  overview: '',
  lat: 41.0086,
  lng: 28.9802,
  category: 'tarihi',
  image_verified: true,
  imageUrl: 'https://example.com/a.jpg',
  info_source_url: 'https://example.com/source',
};
if (missingPublishFields(ready).length) fail('hazır yer publish kapısından geçmeli');
const readyReasons = notReadyReasons(ready).filter((r) => !/İngilizce/i.test(r));
if (readyReasons.length) fail(`hazır yerde beklenmeyen neden: ${readyReasons.join(', ')}`);
else ok('hazır yer → boş notReadyReasons');

if (!CATALOG_ISSUE_FILTERS.invalidCoords || !CATALOG_ISSUE_FILTERS.missingSource) {
  fail('CATALOG_ISSUE_FILTERS eksik anahtar');
} else ok('CATALOG_ISSUE_FILTERS anahtarları');

if (failed) {
  console.error(`verify-v6-adim10 KALDI (${failed} hata)`);
  process.exit(1);
}
console.log('verify-v6-adim10 TAMAM');
