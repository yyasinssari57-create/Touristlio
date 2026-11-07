/**
 * Admin places: multi-select + bulk archive (soft status=archived).
 * Static checks — no database connection.
 */
const fs = require('fs');
const path = require('path');

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

console.log('verify-admin-bulk-archive');

const adminJs = read('server/routes/admin.js');
const placeJs = read('server/lib/admin-place.js');
const adminHtml = read('public/admin.html');
const pkg = read('package.json');

if (!/router\.post\(\s*'\/places\/bulk'/.test(adminJs)) {
  fail("POST /places/bulk rotası yok");
} else ok('POST /places/bulk tanımlı');

const bulkIdx = adminJs.indexOf("router.post('/places/bulk'");
const getIdIdx = adminJs.indexOf("router.get('/places/:id'");
if (bulkIdx < 0 || getIdIdx < 0 || bulkIdx > getIdIdx) {
  fail('/places/bulk, /places/:id rotasından önce gelmeli');
} else ok('/places/bulk, /places/:id öncesinde');

if (!adminJs.includes("checkPermission('admin.places')") || !adminJs.slice(bulkIdx, bulkIdx + 800).includes("checkPermission('admin.places')")) {
  fail('/places/bulk admin.places izni istemiyor');
} else ok('/places/bulk admin.places ile korunuyor');

if (!adminJs.includes("action !== 'archive'") && !adminJs.includes('action !== "archive"')) {
  fail('/places/bulk yalnızca archive aksiyonunu kabul etmeli');
} else ok('bulk action = archive');

if (!adminJs.includes('adminPlace.archivePlaces') && !adminJs.includes('archivePlaces(validIds)')) {
  fail('/places/bulk archivePlaces çağırmıyor');
} else ok('bulk archivePlaces kullanıyor');

if (!adminJs.includes('auditLog.logBatch') || !adminJs.slice(bulkIdx, getIdIdx).includes("action: 'place.archive'")) {
  fail('/places/bulk place.archive audit logBatch yazmıyor');
} else ok('bulk place.archive auditLog.logBatch');

if (!adminJs.slice(bulkIdx, getIdIdx).includes("clearCache('places-list')")
  || !adminJs.slice(bulkIdx, getIdIdx).includes("clearCache('search')")) {
  fail('/places/bulk yer listesi / arama önbelleğini temizlemiyor');
} else ok('bulk places-list + search cache clear');

if (!placeJs.includes('async function archivePlaces') || !placeJs.includes('archivePlaces,')) {
  fail('admin-place.archivePlaces yok veya export edilmemiş');
} else ok('archivePlaces lib + export');

if (!placeJs.includes("status = 'archived'") || !placeJs.includes('WHERE id = ANY(?::int[])')) {
  fail('archivePlaces tek UPDATE + ANY ile arşivlemeli');
} else ok('archivePlaces batched UPDATE');

if (/DELETE FROM places/.test(adminJs.slice(bulkIdx, getIdIdx))) {
  fail('/places/bulk hard-delete yapmamalı');
} else ok('bulk soft archive (hard delete yok)');

const uiNeedles = [
  'placeBulkBar',
  'bulkArchivePlaces',
  'togglePlaceSelect',
  'togglePlaceSelectAll',
  'clearPlaceSelection',
  'placeSelected',
  '/admin/places/bulk',
  "action: 'archive'",
  'Toplu arşivle',
  'place-select-check',
];
let uiMissing = 0;
for (const n of uiNeedles) {
  if (!adminHtml.includes(n)) {
    fail(`admin.html eksik: ${n}`);
    uiMissing += 1;
  }
}
if (!uiMissing) ok('admin.html multi-select + toplu arşiv UI');

if (!pkg.includes('verify:admin-bulk-archive')) {
  fail('package.json verify:admin-bulk-archive script eksik');
} else ok('npm run verify:admin-bulk-archive');

if (failed) {
  console.error(`\nFAILED: ${failed}`);
  process.exit(1);
}
console.log('\nOK');
