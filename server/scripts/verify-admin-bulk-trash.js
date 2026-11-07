/**
 * Admin places: multi-select fix + soft-delete trash (deleted_at) + 15-day purge.
 * Static checks + optional local Postgres runtime (COALESCE text/timestamptz bug).
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

const DEFAULT_TEST_DB = 'postgresql://postgres:postgres@127.0.0.1:5432/touristlio_test';
const SKIP_DB = process.env.VERIFY_ADMIN_BULK_TRASH_SKIP_DB === '1';

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

if (!trashJs.includes('SQL_TOUCH_CREATED_AT') || !trashJs.includes('SQL_TEXT_UTC_NOW')) {
  fail('SQL_TOUCH_CREATED_AT / SQL_TEXT_UTC_NOW yok (TEXT created_at güvenli NOW)');
} else ok('TEXT-safe created_at helper');

const badCoalesce = /COALESCE\s*\(\s*NULLIF\s*\(\s*btrim\s*\(\s*created_at\s*\)\s*,\s*''\s*\)\s*,\s*NOW\s*\(\s*\)\s*\)/i;
if (badCoalesce.test(placeJs) || badCoalesce.test(adminJs)) {
  fail('COALESCE(created_at TEXT, NOW()) kaldı — toplu çöp/arşiv tüm satırlarda patlar');
} else ok('COALESCE(created_at, NOW()) yok');

if (!placeJs.includes('SQL_TOUCH_CREATED_AT')) {
  fail('admin-place SQL_TOUCH_CREATED_AT kullanmıyor');
} else ok('admin-place SQL_TOUCH_CREATED_AT');

if (!placeJs.includes('async function softDeletePlaces') || !placeJs.includes('purgeExpiredTrash')) {
  fail('softDeletePlaces / purgeExpiredTrash yok');
} else ok('admin-place trash API');

if (!placeJs.includes('restorePlaces') || !placeJs.includes('permanentlyDeletePlaces')) {
  fail('restore / permanent delete yok');
} else ok('restore + permanent delete');

if (!adminJs.includes("action === 'trash'") || !adminJs.includes("action === 'restore'") || !adminJs.includes("action === 'purge'")) {
  fail('/places/bulk trash/restore/purge eksik');
} else ok('/places/bulk trash|restore|purge');

if (!adminJs.includes('firstError')) fail('bulk yanıtında firstError yok');
else ok('bulk firstError alanı');

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
  'data-place-id', 'place-select-check', 'firstError',
];
let missing = 0;
for (const n of uiNeedles) {
  if (!adminHtml.includes(n)) { fail(`admin.html eksik: ${n}`); missing += 1; }
}
if (!missing) ok('admin.html multi-select + çöp UI + firstError toast');

if (/place-select-check adm-mod-check/.test(adminHtml)) {
  fail('yer checkbox adm-mod-check paylaşmamalı');
} else ok('yer checkbox ayrı sınıf');

if (!pkg.includes('verify:admin-bulk-trash')) fail('package.json script yok');
else ok('npm run verify:admin-bulk-trash');

async function runtimeDbChecks() {
  if (SKIP_DB) {
    console.log('  · DB runtime atlandı (VERIFY_ADMIN_BULK_TRASH_SKIP_DB=1)');
    return;
  }
  process.env.DATABASE_URL = process.env.VERIFY_ADMIN_BULK_TRASH_DATABASE_URL
    || process.env.DATABASE_URL
    || DEFAULT_TEST_DB;
  console.log(`  (DATABASE_URL=${String(process.env.DATABASE_URL).replace(/:[^:@/]+@/, ':***@')})`);

  const { initDb, db, closePool } = require('../db');
  const adminPlace = require('../lib/admin-place');
  await initDb();

  const col = await db.prepare(`
    SELECT 1 AS ok FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'places' AND column_name = 'deleted_at'
  `).get();
  if (!col) fail('places.deleted_at yok (023 uygulanmamış)');
  else ok('places.deleted_at mevcut');

  const sample = await db.prepare(`
    SELECT id FROM places
    WHERE ${require('../lib/place-trash').notDeletedPlaceSql('deleted_at')}
    ORDER BY id ASC
    LIMIT 3
  `).all();
  if (sample.length < 2) {
    fail('runtime için en az 2 aktif yer gerekli');
    await closePool();
    return;
  }
  const ids = sample.map((r) => Number(r.id));

  // Restore clean published state for the probe ids.
  await db.prepare(`
    UPDATE places
    SET deleted_at = NULL, status = 'published',
      created_at = COALESCE(NULLIF(btrim(created_at), ''), to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS'))
    WHERE id = ANY(?::int[])
  `).run(ids);

  try {
    const archived = await adminPlace.archivePlaces(ids);
    if (archived.length !== ids.length) fail(`archivePlaces ${archived.length}/${ids.length}`);
    else ok(`archivePlaces ${archived.length} yer`);
  } catch (err) {
    fail(`archivePlaces patladı: ${err.message}`);
  }

  await db.prepare(`
    UPDATE places SET status = 'published', deleted_at = NULL WHERE id = ANY(?::int[])
  `).run(ids);

  try {
    const trashed = await adminPlace.softDeletePlaces(ids);
    if (trashed.length !== ids.length) fail(`softDeletePlaces ${trashed.length}/${ids.length}`);
    else ok(`softDeletePlaces ${trashed.length} yer`);
    const still = await db.prepare(`
      SELECT COUNT(*)::int AS c FROM places
      WHERE id = ANY(?::int[]) AND deleted_at IS NOT NULL
    `).get(ids);
    if (Number(still.c) !== ids.length) fail('deleted_at yazılmadı');
    else ok('deleted_at set');
  } catch (err) {
    fail(`softDeletePlaces patladı (COALESCE TEXT/NOW bug?): ${err.message}`);
  }

  try {
    const restored = await adminPlace.restorePlaces(ids);
    if (restored.length !== ids.length) fail(`restorePlaces ${restored.length}/${ids.length}`);
    else ok(`restorePlaces ${restored.length} yer`);
  } catch (err) {
    fail(`restorePlaces patladı: ${err.message}`);
  }

  await closePool();
}

runtimeDbChecks()
  .then(() => {
    if (failed) {
      console.error(`\nFAILED: ${failed}`);
      process.exit(1);
    }
    console.log('\nOK');
  })
  .catch((err) => {
    console.error('  ✗ runtime hata:', err.message);
    console.error(`\nFAILED: ${failed + 1}`);
    process.exit(1);
  });
