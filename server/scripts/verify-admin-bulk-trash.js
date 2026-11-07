/**
 * Admin places: multi-select fix + soft-delete trash (deleted_at) + 15-day purge.
 * Static checks — no database connection.
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

console.log('verify-admin-bulk-trash');

const adminJs = read('server/routes/admin.js');
const placeJs = read('server/lib/admin-place.js');
const trashJs = read('server/lib/place-trash.js');
const adminHtml = read('public/admin.html');
const indexJs = read('server/index.js');
const bindJs = read('public/js/bind-actions.js');
const mig = read('db/migrations/023_place_trash.js');
const pkg = read('package.json');

if (!mig.includes('deleted_at') || !mig.includes('023_place_trash')) fail('023_place_trash migration eksik');
else ok('migration 023_place_trash');

if (!trashJs.includes('TRASH_RETENTION_DAYS = 15') || !trashJs.includes('notDeletedPlaceSql')) {
  fail('place-trash helpers eksik');
} else ok('place-trash 15 gün + notDeletedPlaceSql');

if (!placeJs.includes('async function softDeletePlaces') || !placeJs.includes('purgeExpiredTrash')) {
  fail('softDeletePlaces / purgeExpiredTrash yok');
} else ok('admin-place trash API');

if (!placeJs.includes('restorePlaces') || !placeJs.includes('permanentlyDeletePlaces')) {
  fail('restore / permanent delete yok');
} else ok('restore + permanent delete');

if (!adminJs.includes("action === 'trash'") || !adminJs.includes("action === 'restore'") || !adminJs.includes("action === 'purge'")) {
  fail('/places/bulk trash/restore/purge eksik');
} else ok('/places/bulk trash|restore|purge');

if (!adminJs.includes("router.post('/places/trash/purge-expired'")) fail('purge-expired rotası yok');
else ok('POST /places/trash/purge-expired');

const bulkIdx = adminJs.indexOf("router.post('/places/bulk'");
const purgeIdx = adminJs.indexOf("router.post('/places/trash/purge-expired'");
const getIdIdx = adminJs.indexOf("router.get('/places/:id'");
if (bulkIdx < 0 || purgeIdx < 0 || getIdIdx < 0 || !(bulkIdx < getIdIdx && purgeIdx < getIdIdx)) {
  fail('bulk/purge-expired, /places/:id öncesinde olmalı');
} else ok('rotalar /places/:id öncesinde');

if (!adminJs.includes('adminPlace.softDeletePlace')) fail('DELETE soft-delete yok');
else ok('DELETE → softDeletePlace');

if (!indexJs.includes('purgeExpiredTrash') || !indexJs.includes('15 3 * * *')) fail('günlük trash purge cron yok');
else ok('cron place trash purge');

if (!(bindJs.includes("s === 'this.checked'") || bindJs.includes("$checked"))) {
  fail('bind-actions this.checked çözümlemiyor');
} else ok('bind-actions this.checked → boolean');

const uiNeedles = [
  'placeBulkBar', 'bulkArchivePlaces', 'bulkTrashPlaces', 'bulkRestorePlaces', 'bulkPurgePlaces',
  'wirePlaceSelection', 'togglePlaceSelect', 'Emin misiniz?', 'Çöp kutusu', 'window.togglePlaceSelect',
  'data-place-id', 'place-select-check',
];
let missing = 0;
for (const n of uiNeedles) {
  if (!adminHtml.includes(n)) { fail(`admin.html eksik: ${n}`); missing += 1; }
}
if (!missing) ok('admin.html multi-select + çöp UI');

if (/place-select-check adm-mod-check/.test(adminHtml)) {
  fail('yer checkbox adm-mod-check paylaşmamalı');
} else ok('yer checkbox ayrı sınıf');

if (!pkg.includes('verify:admin-bulk-trash')) fail('package.json script yok');
else ok('npm run verify:admin-bulk-trash');

if (failed) {
  console.error(`\nFAILED: ${failed}`);
  process.exit(1);
}
console.log('\nOK');
