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

// Bulk also supports trash/restore/purge; archive must remain.
if (!adminJs.includes("'archive'") || !(adminJs.includes('archivePlaces') || adminJs.includes("action === 'archive'"))) {
  fail('/places/bulk archive aksiyonunu kaybetmiş');
} else ok('bulk action archive hâlâ var');

if (!adminJs.includes('adminPlace.archivePlaces') && !adminJs.includes('archivePlaces(validIds)')) {
  fail('/places/bulk archivePlaces çağırmıyor');
} else ok('bulk archivePlaces kullanıyor');

if (!adminJs.includes('auditLog.logBatch') || !adminJs.slice(bulkIdx, getIdIdx).includes("'place.archive'")) {
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
  "submitBulkPlaceAction('archive')",
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

const bindJs = read('public/js/bind-actions.js');
if (!bindJs.includes("s === 'this.checked'") && !bindJs.includes('s === "this.checked"')) {
  fail("bind-actions this.checked / $checked çözümlemiyor");
} else ok('bind-actions this.checked çözümler');

if (!adminHtml.includes('wirePlaceSelection')) {
  fail('wirePlaceSelection yok — liste render sonrası seçim bağlanmıyor');
} else ok('wirePlaceSelection yer listesine bağlı');

if (!adminHtml.includes('data-place-id=') || !adminHtml.includes("data-arg2=\"this.checked\"")) {
  fail('yer checkbox data-place-id + data-arg2=this.checked kullanmalı');
} else ok('yer checkbox checked arg + place-id');

if (/place-select-check adm-mod-check/.test(adminHtml)) {
  fail('yer checkbox adm-mod-check paylaşmamalı (moderasyon select-all karışır)');
} else ok('yer checkbox ayrı sınıf (adm-mod-check yok)');

// Runtime (no DOM lib): coerce path for this.checked must return real booleans.
(function runtimeCheckedArgs() {
  const m = bindJs.match(/function coerce\(s, el\)[\s\S]*?\n  \}/);
  if (!m) { fail('coerce(s, el) imzası yok'); return; }
  // eslint-disable-next-line no-new-func
  const coerce = new Function('return (' + m[0] + ')')();
  const elOn = { checked: true };
  const elOff = { checked: false };
  if (coerce('this.checked', elOn) !== true) fail('coerce this.checked (true) yanlış');
  else if (coerce('this.checked', elOff) !== false) fail('coerce this.checked (false) yanlış');
  else if (coerce('$checked', elOn) !== true) fail('coerce $checked yanlış');
  else ok('coerce this.checked / $checked boolean');

  const resolveMatch = bindJs.match(/function resolveArgs\(el, ev\)[\s\S]*?\n  \}/);
  if (!resolveMatch) { fail('resolveArgs yok'); return; }
  // Minimal el shim for resolveArgs
  function makeEl(attrs, checked) {
    return {
      checked: !!checked,
      value: '',
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; },
      hasAttribute(k) { return Object.prototype.hasOwnProperty.call(attrs, k); },
    };
  }
  // eslint-disable-next-line no-new-func
  const resolveArgs = new Function('coerce', 'return (' + resolveMatch[0] + ')')(coerce);
  const argsOn = resolveArgs(makeEl({ 'data-arg': '11', 'data-arg2': 'this.checked' }, true), null);
  const argsOff = resolveArgs(makeEl({ 'data-arg': '11', 'data-arg2': 'this.checked' }, false), null);
  const allOn = resolveArgs(makeEl({ 'data-arg': 'this.checked' }, true), null);
  const allOff = resolveArgs(makeEl({ 'data-arg': 'this.checked' }, false), null);
  if (!(argsOn[0] === 11 && argsOn[1] === true)) fail('resolveArgs check: ' + JSON.stringify(argsOn));
  else if (!(argsOff[0] === 11 && argsOff[1] === false)) fail('resolveArgs uncheck: ' + JSON.stringify(argsOff));
  else if (!(allOn[0] === true && allOff[0] === false)) fail('resolveArgs select-all: ' + JSON.stringify([allOn, allOff]));
  else ok('resolveArgs checkbox checked boolean uçtan uca');
})();

if (failed) {
  console.error(`\nFAILED: ${failed}`);
  process.exit(1);
}
console.log('\nOK');
