/**
 * Admin Gezilecek Yerler listesi: ← → sayfalama (limit/offset + UI).
 * Static checks only.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) { console.error('  ✗', msg); failed += 1; }
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

console.log('verify-admin-places-pagination');

const adminHtml = read('public/admin.html');
const adminJs = read('server/routes/admin.js');
const placeJs = read('server/lib/admin-place.js');
const pkg = read('package.json');

if (!adminJs.includes("router.get('/places'") || !adminJs.includes('req.query.limit') || !adminJs.includes('req.query.offset')) {
  fail('GET /admin/places limit/offset yok');
} else ok('GET /admin/places limit + offset');

if (!placeJs.includes('LIMIT ? OFFSET ?') || !placeJs.includes('COUNT(*)')) {
  fail('listAdminPlaces LIMIT/OFFSET + COUNT yok');
} else ok('listAdminPlaces sayfalama SQL');

const uiNeedles = [
  'placesPagination',
  'placesPage',
  'PLACES_PAGE_SIZE',
  'loadPlacesList',
  'renderPagination',
  'offset',
  'aria-label="Yer listesi sayfalama"',
  'Önceki sayfa',
  'Sonraki sayfa',
];
let missing = 0;
for (const n of uiNeedles) {
  if (!adminHtml.includes(n)) {
    fail(`admin.html eksik: ${n}`);
    missing += 1;
  }
}
if (!missing) ok('admin.html places sayfalama UI');

if (!/PLACES_PAGE_SIZE\s*=\s*50/.test(adminHtml)) {
  fail('PLACES_PAGE_SIZE 50 olmalı');
} else ok('sayfa boyutu 50');

if (!adminHtml.includes("qs.set('offset'") && !adminHtml.includes('offset: String(offset)')) {
  fail('loadPlacesList offset göndermiyor');
} else ok('loadPlacesList offset gönderiyor');

if (!adminHtml.includes('placeSelected.clear()')) {
  fail('sayfa değişiminde seçim temizlenmiyor');
} else ok('sayfa değişiminde seçim temizlenir');

if (!/from}–\$\{to\} \/ \$\{total/.test(adminHtml) && !adminHtml.includes('${from}–${to} / ${total}')) {
  fail('sayfa aralığı metni (1–50 / N) yok');
} else ok('sayfa aralığı 1–50 / N');

if (!pkg.includes('verify:admin-places-pagination')) {
  fail('package.json script yok');
} else ok('package.json verify:admin-places-pagination');

if (failed) {
  console.error(`\n${failed} kontrol başarısız`);
  process.exit(1);
}
console.log('\nTüm kontroller geçti');
