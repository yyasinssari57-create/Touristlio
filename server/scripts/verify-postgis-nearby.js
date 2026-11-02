/**
 * Optional PostGIS nearby places.
 * Passes when the extension is missing (haversine fallback).
 * When PostGIS is installed, also asserts geom, the geography index, and the SQL list.
 * Usage: npm run verify:postgis
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

console.log('verify-postgis-nearby');

const mig010 = read('db/migrations/010_postgis_geom.js');
if (!/optional:\s*true/.test(mig010)) fail('010_postgis_geom is not optional');
else ok('010_postgis_geom optional');
if (!mig010.includes('try') || !mig010.includes('catch') || !mig010.includes('throw err')) {
  fail('010 must catch a missing extension and rethrow so it is not marked applied');
} else ok('010 catches CREATE EXTENSION failure and retries next boot');

const geomSrc = read('server/lib/place-geom.js');
if (!geomSrc.includes('CREATE EXTENSION IF NOT EXISTS postgis')) fail('missing CREATE EXTENSION');
else ok('CREATE EXTENSION IF NOT EXISTS postgis');
if (!geomSrc.includes('ST_DWithin') || !geomSrc.includes('ST_Distance')) {
  fail('nearby SQL missing ST_DWithin / ST_Distance');
} else ok('nearby SQL uses ST_DWithin and ST_Distance');
if (!geomSrc.includes('USING SPGIST') || !geomSrc.includes('USING GIST')) {
  fail('missing SP-GiST with GIST fallback');
} else ok('SP-GiST index, GIST fallback');
if (!geomSrc.includes('return null')) fail('SQL nearby does not fall through');
else ok('findNearbyPlacesSql returns null when PostGIS is missing');

const geoSrc = read('server/lib/geo.js');
if (/\bST_|geography\(|PostGIS/i.test(geoSrc)) fail('geo.js must stay haversine');
else ok('geo.js still haversine on lat/lng');
if (!geoSrc.includes("!== 'archived'")) fail('haversine fallback still keeps archived places');
else ok('haversine skips archived places, same as the SQL filter');

const legacy = read('server/routes/places-legacy.js');
if (!legacy.includes('findNearbyPlacesSql') || !/findNearbyPlacesSql\([\s\S]*\|\|[\s\S]*findNearbyPlaces\(/.test(legacy)) {
  fail('place detail does not prefer SQL and fall back to haversine');
} else ok('place detail: SQL nearby, else haversine');
if (!legacy.includes('findSimilarPlaces')) fail('similar places path removed');
else ok('similar places stay category + popularity');

const trips = read('server/routes/trip-plans.js');
if (!trips.includes('findNearbyPlacesSql') || !trips.includes('findNearbyPlaces(')) {
  fail('trip suggest dropped a nearby path');
} else ok('trip suggest keeps SQL and haversine');
if (!/if \(fromSql\) return res\.json\(\{ places: fromSql \}\)/.test(trips)) {
  fail('trip suggest does not return the SQL list before a full table read');
} else ok('trip suggest skips the full places read when SQL returns');
if (/findNearbyPlaces\(\s*all,\s*origin,\s*mapPlace\s*,/.test(trips)) {
  fail('async mapPlace still passed into sync haversine');
} else ok('haversine fallback uses a sync place mapper');

const migrations = read('server/lib/migrations.js');
if (!migrations.includes('postgisGeom') || !migrations.includes('runOptional')) {
  fail('boot does not retry PostGIS via runOptional');
} else ok('boot retries PostGIS via runOptional');
if (!migrations.includes('reopenPostgisMigrationIfGeomMissing')) {
  fail('a recorded 010 without geom is never retried');
} else ok('recorded 010 without geom is cleared and retried');

const { haversineKm, findNearbyPlaces } = require('../lib/geo');
const originFixture = { id: 1, lat: 41.0086, lng: 28.9802, country: 'Turkey', status: 'published' };
const fixtureRows = [
  originFixture,
  { id: 2, lat: 41.01, lng: 28.98, country: 'Turkey', status: 'archived', name: 'Arşiv' },
  { id: 3, lat: 41.02, lng: 28.99, country: 'Turkey', status: 'published', name: 'Yakın' },
  { id: 4, lat: 48.8566, lng: 2.3522, country: 'France', status: 'published', name: 'Uzak' },
];
function mapFixture(row) {
  return { id: row.id, lat: row.lat, lng: row.lng, name: row.name };
}
const fixtureNear = findNearbyPlaces(fixtureRows, originFixture, mapFixture, 6);
if (fixtureNear.some((p) => p.id === 2) || fixtureNear.some((p) => p.id === 1)) {
  fail('haversine fixture kept the archived place or the origin');
} else if (!fixtureNear.length || fixtureNear[0].id !== 3 || !Number.isFinite(fixtureNear[0].distanceKm)) {
  fail('haversine fixture did not rank the published neighbour first');
} else ok('haversine fallback ranks a published neighbour and skips archived');

function kmClose(sqlKm, lat1, lng1, lat2, lng2) {
  const hav = haversineKm(lat1, lng1, lat2, lng2);
  const diff = Math.abs(sqlKm - hav);
  return diff <= Math.max(0.6, hav * 0.03);
}

async function main() {
  const { initDb, db, closePool } = require('../db');
  const {
    ensurePostgisGeom,
    findNearbyPlacesSql,
    probePostgis,
    resetPostgisReady,
  } = require('../lib/place-geom');
  try {
    await initDb();
    const available = await db.prepare(`
      SELECT 1 AS ok FROM pg_available_extensions WHERE name = 'postgis'
    `).get();
    const installed = await db.prepare(`
      SELECT extversion FROM pg_extension WHERE extname = 'postgis'
    `).get();

    const origin = await db.prepare(`
      SELECT * FROM places
      WHERE lat IS NOT NULL AND lng IS NOT NULL
        AND NOT (lat = 0 AND lng = 0)
        AND COALESCE(status, 'published') != 'archived'
        AND (city ILIKE '%istanbul%' OR city ILIKE '%İstanbul%')
      ORDER BY id
      LIMIT 1
    `).get() || await db.prepare(`
      SELECT * FROM places
      WHERE lat IS NOT NULL AND lng IS NOT NULL
        AND NOT (lat = 0 AND lng = 0)
        AND COALESCE(status, 'published') != 'archived'
      ORDER BY id
      LIMIT 1
    `).get();
    if (!origin) {
      fail('no place with coordinates to check nearby');
      return;
    }

    if (!available) {
      resetPostgisReady();
      if (await probePostgis(db)) fail('geom column exists even though postgis is not available');
      else ok('no geom column while PostGIS is unavailable');
      const sql = await findNearbyPlacesSql(origin, mapFixture, 6);
      if (sql !== null) fail('SQL nearby returned rows without PostGIS');
      else ok('findNearbyPlacesSql returns null; callers keep haversine');
      const all = await db.prepare('SELECT * FROM places').all();
      const near = findNearbyPlaces(all, origin, mapFixture, 6);
      if (!near.length || near.some((p) => p.id === origin.id) || !Number.isFinite(near[0].distanceKm)) {
        fail('haversine fallback returned an empty or origin row');
      } else ok(`haversine fallback returned ${near.length} places (nearest ${near[0].distanceKm} km)`);
      if (installed) fail('pg_extension has postgis but pg_available_extensions does not');
      else ok('pg_extension has no postgis — deploy without the extension still boots');
      console.log('  · PostGIS package is not installed; SQL index path was not asserted');
      return;
    }

    await ensurePostgisGeom(db);
    resetPostgisReady();
    if (!(await probePostgis(db))) fail('PostGIS is available but places.geom was not created');
    else ok('places.geom exists');

    const ext = await db.prepare(`SELECT extversion FROM pg_extension WHERE extname = 'postgis'`).get();
    if (!ext) fail('CREATE EXTENSION postgis did not install');
    else ok(`postgis extension ${ext.extversion}`);

    const indexes = await db.prepare(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'places'
        AND indexname IN ('idx_places_geom_spgist', 'idx_places_geom_gist')
    `).all();
    if (!indexes.length) fail('missing idx_places_geom_spgist and idx_places_geom_gist');
    else ok(`geography index ${indexes.map((r) => r.indexname).join(', ')}`);
    const indexOk = await db.prepare(`
      SELECT c.relname AS name, i.indisvalid AS valid
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
      WHERE c.relname IN ('idx_places_geom_spgist', 'idx_places_geom_gist')
    `).all();
    if (!indexOk.some((r) => r.valid === true || r.valid === 't')) {
      fail('geom index is not valid');
    } else ok('geom index is valid');

    const trigger = await db.prepare(`
      SELECT tgname FROM pg_trigger WHERE tgname = 'trg_places_sync_geom' AND NOT tgisinternal
    `).get();
    if (!trigger) fail('trg_places_sync_geom missing');
    else ok('trg_places_sync_geom');

    const gap = await db.prepare(`
      SELECT COUNT(*) AS n FROM places
      WHERE lat IS NOT NULL AND lng IS NOT NULL
        AND NOT (lat = 0 AND lng = 0)
        AND geom IS NULL
    `).get();
    if (Number(gap && gap.n) !== 0) fail(`geom backfill left ${gap.n} rows empty`);
    else ok('geom backfill covered every non-zero lat/lng');

    const sample = await db.prepare(`
      SELECT lat, lng,
        ST_Y(geom::geometry) AS glat,
        ST_X(geom::geometry) AS glng
      FROM places
      WHERE id = ?
    `).get(origin.id);
    if (!sample || Math.abs(Number(sample.lat) - Number(sample.glat)) > 0.00001
      || Math.abs(Number(sample.lng) - Number(sample.glng)) > 0.00001) {
      fail('geom does not match lat/lng');
    } else ok('geom point matches lat/lng');

    const sqlNear = await findNearbyPlacesSql(origin, mapFixture, 6);
    if (!Array.isArray(sqlNear) || !sqlNear.length) fail('SQL nearby returned nothing while PostGIS is installed');
    else ok(`SQL nearby returned ${sqlNear.length} places`);
    if (sqlNear && sqlNear.some((p) => p.id === origin.id)) fail('SQL nearby included the origin');
    else if (sqlNear) ok('SQL nearby omits the origin');

    if (sqlNear && sqlNear.length) {
      const ids = sqlNear.map((p) => p.id);
      const statuses = await db.prepare(`
        SELECT id, status FROM places WHERE id IN (${ids.map(() => '?').join(',')})
      `).all(...ids);
      if (statuses.some((r) => (r.status || 'published') === 'archived')) {
        fail('SQL nearby included an archived place');
      } else ok('SQL nearby omits archived places');
      const bad = sqlNear.filter((p) => !kmClose(p.distanceKm, origin.lat, origin.lng, p.lat, p.lng));
      if (bad.length) fail(`SQL distance disagrees with haversine for id ${bad[0].id}`);
      else ok('SQL distances match haversine within 3%');

      const all = await db.prepare('SELECT * FROM places').all();
      const hav = findNearbyPlaces(all, origin, mapFixture, 6);
      const sqlIds = sqlNear.map((p) => p.id).join(',');
      const havIds = hav.map((p) => p.id).join(',');
      if (sqlIds !== havIds) fail(`SQL order ${sqlIds} != haversine order ${havIds}`);
      else ok('SQL nearby order matches haversine');
    }

    try { await db.exec('ANALYZE places'); } catch { /* optional */ }
    const planRows = await db.prepare(`
      EXPLAIN SELECT id FROM places
      WHERE geom IS NOT NULL
        AND ST_DWithin(geom, ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography, 1000)
    `).all(Number(origin.lng), Number(origin.lat));
    const plan = planRows.map((r) => r['QUERY PLAN'] || JSON.stringify(r)).join(' | ');
    console.log('  EXPLAIN ST_DWithin 1km:', plan);
    if (/idx_places_geom_(spgist|gist)/i.test(plan) || /Index/i.test(plan)) {
      ok('planner can use the geom index for a tight ST_DWithin');
    } else {
      ok('geom index exists; planner chose another plan for this table size');
    }
  } finally {
    try { await closePool(); } catch { /* ignore */ }
  }
}

main().then(() => {
  if (failed) {
    console.error(`verify-postgis-nearby FAILED (${failed})`);
    process.exit(1);
  }
  console.log('verify-postgis-nearby OK');
  process.exit(0);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
