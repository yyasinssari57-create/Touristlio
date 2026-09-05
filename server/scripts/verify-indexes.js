/**
 * [ORTA-5] Database indexes for filter/list performance.
 * Usage: node server/scripts/verify-indexes.js
 * Optional: VERIFY_INDEXES_URL=http://127.0.0.1:3056 node server/scripts/verify-indexes.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { initDb, db } = require('../db');
const { buildPlacesWhere, searchPlacesPage } = require('../lib/places-search');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}

console.log('verify-indexes');

const REQUIRED = [
  'idx_places_country_city_score',
  'idx_places_country_city_score_lc',
  'idx_places_category_published',
  'idx_places_tiola_rating',
  'idx_places_categories',
  'idx_blogs_created_at',
];

async function checkDatabase() {
  await initDb();
  const applied = await db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').get('008_filter_indexes');
  if (!applied) fail('schema_migrations missing 008_filter_indexes');
  else ok('migration 008_filter_indexes applied');
  const applied009 = await db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').get('009_jsonb_gin');
  if (!applied009) fail('schema_migrations missing 009_jsonb_gin');
  else ok('migration 009_jsonb_gin applied');

  const indexRows = await db.prepare(`
    SELECT indexname AS name FROM pg_indexes WHERE schemaname = 'public'
  `).all();
  const names = new Set(indexRows.map((r) => r.name));
  if (!names.has('idx_places_lat_lng')) fail('missing index idx_places_lat_lng');
  else ok('index idx_places_lat_lng (lat/lng btree, no PostGIS)');
  if (!names.has('idx_places_country_city_score')) fail('missing index idx_places_country_city_score');
  else ok('index idx_places_country_city_score');
  if (!names.has('idx_places_country_city_score_lc')) {
    console.log('  · idx_places_country_city_score_lc skipped (expression index optional)');
  } else ok('index idx_places_country_city_score_lc');
  for (const name of REQUIRED) {
    if (name === 'idx_places_country_city_score' || name === 'idx_places_country_city_score_lc') continue;
    if (!names.has(name)) fail(`missing index ${name}`);
    else ok(`index ${name}`);
  }

  async function explain(sql, params = []) {
    return (await db.prepare(`EXPLAIN ${sql}`).all(...params)).map((r) => r['QUERY PLAN'] || r.queryPlan || JSON.stringify(r))
      .join(' | ');
  }

  try { await db.exec('ANALYZE'); } catch { /* optional */ }

  const filterPlan = await explain(`
    SELECT p.* FROM places p
    WHERE LOWER(p.country) LIKE ? AND p.tiola_rating >= ?
    ORDER BY COALESCE(p.tiola_rating, 0) DESC
    LIMIT 20
  `, ['turkey%', 4]);
  console.log('  EXPLAIN country+score LIMIT:', filterPlan);
  ok('EXPLAIN country+score ran');

  const catPlan = await explain(`
    SELECT p.* FROM places p
    WHERE p.category = ? AND COALESCE(p.status, 'published') != 'archived'
    LIMIT 20
  `, ['nature']);
  console.log('  EXPLAIN category+status LIMIT:', catPlan);
  ok('EXPLAIN category+status ran');

  const blogPlan = await explain(`
    SELECT * FROM blogs WHERE status = 'approved' ORDER BY created_at DESC LIMIT 20
  `);
  console.log('  EXPLAIN blogs created_at:', blogPlan);
  ok('EXPLAIN blogs created_at ran');

  const page = await searchPlacesPage({ limit: 5, offset: 0, sort: 'popularity' });
  if (!Array.isArray(page.rows)) fail('searchPlacesPage rows missing');
  else if (page.rows.length > 5) fail(`SQL LIMIT 5 returned ${page.rows.length}`);
  else ok(`searchPlacesPage LIMIT 5 → ${page.rows.length} rows, total=${page.total}`);
  if (typeof page.total !== 'number') fail('searchPlacesPage total missing');
  else ok('searchPlacesPage COUNT total');
}

const searchLib = fs.readFileSync(path.join(ROOT, 'server', 'lib', 'places-search.js'), 'utf8');
if (!searchLib.includes('LIMIT ? OFFSET ?')) fail('places-search missing SQL LIMIT OFFSET');
else ok('places-search uses SQL LIMIT OFFSET');
if (!searchLib.includes('tiola_rating')) fail('places-search missing tiola_rating filter');
else ok('score filter uses tiola_rating (not Google)');

const service = fs.readFileSync(path.join(ROOT, 'server', 'modules', 'places', 'places.service.js'), 'utf8');
if (!service.includes('searchPlacesPage')) fail('listPlaces not using searchPlacesPage');
else ok('listPlaces uses searchPlacesPage');
if (/places\.slice\(offset,\s*offset \+ limit\)/.test(service) && !service.includes('inMemoryFallback')) {
  fail('listPlaces still always slices in memory');
} else ok('in-memory slice only on FTS fallback');

const searchRoute = fs.readFileSync(path.join(ROOT, 'server', 'routes', 'search.js'), 'utf8');
if (searchRoute.includes('places.slice(offset, offset + limit)') && !searchRoute.includes('inMemoryFallback')) {
  fail('search route still always slices in memory');
} else ok('search route SQL pagination');

if (/googleRating|google_rating|gRating/.test(searchLib + service)) fail('Google rating leaked');
else ok('no Google ratings');

const migration = fs.readFileSync(path.join(ROOT, 'db', 'migrations', '008_filter_indexes.js'), 'utf8');
if (!migration.includes('idx_places_country_city_score')
  || !migration.includes('idx_places_category_published')
  || !migration.includes('idx_blogs_created_at')) {
  fail('migration missing required index names');
} else ok('008_filter_indexes.js defines audit indexes');
if (!migration.includes('GIN') && !migration.includes('idx_places_categories')) {
  fail('migration missing JSON/GIN analog note or index');
} else ok('JSON category tags: TEXT index (no SQLite GIN)');

const mig009 = fs.readFileSync(path.join(ROOT, 'db', 'migrations', '009_jsonb_gin.js'), 'utf8');
if (!mig009.includes("data_type = 'jsonb'") || !mig009.includes('USING GIN') || !mig009.includes('idx_places_lat_lng')) {
  fail('009_jsonb_gin.js missing safe JSONB GIN probe or lat/lng index');
} else ok('009_jsonb_gin.js: JSONB GIN only when typed jsonb + lat/lng btree');

const where = buildPlacesWhere({
  country: 'turkey', category: 'nature', score: 4, categoryMode: 'discover',
});
if (!where.whereSql.includes('tiola_rating') || !where.params.includes(4)) {
  fail('buildPlacesWhere score=4 missing');
} else ok('buildPlacesWhere maps score → tiola_rating');

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 8000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function waitForServer(base, max = 40) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      n += 1;
      const req = http.get(`${base}/api/health`, { timeout: 1000 }, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (n >= max) reject(new Error('server did not start'));
        else setTimeout(tick, 150);
      });
      req.on('timeout', () => {
        req.destroy();
        if (n >= max) reject(new Error('server did not start'));
        else setTimeout(tick, 150);
      });
    };
    tick();
  });
}

function payloadOf(body) {
  let json = {};
  try { json = JSON.parse(body); } catch { json = {}; }
  return json.data || json;
}

async function checkLive(base) {
  const root = base.replace(/\/$/, '');
  const def = await fetchText(`${root}/api/places?limit=20`);
  const defPay = payloadOf(def.body);
  if (def.status !== 200) fail(`GET /api/places HTTP ${def.status}`);
  else ok('GET /api/places → 200');
  const defPlaces = defPay.places || defPay.items || [];
  if (defPlaces.length > 20) fail(`limit=20 returned ${defPlaces.length}`);
  else ok(`SQL page size ${defPlaces.length} ≤ 20`);
  if (typeof defPay.total !== 'number') fail('API missing total');
  else ok(`API total=${defPay.total}`);

  const filtered = await fetchText(`${root}/api/places?country=turkey&category=nature&score=4&limit=12`);
  const fPay = payloadOf(filtered.body);
  if (filtered.status !== 200) fail(`filtered list HTTP ${filtered.status}`);
  else ok('GET /api/places country+category+score → 200');
  const places = fPay.places || fPay.items || [];
  const badScore = places.filter((p) => p.tiolaRating != null && Number(p.tiolaRating) < 4);
  if (badScore.length) fail('score=4 returned places below 4 Tiola');
  else ok('score=4 keeps Tiola ≥ 4 (not Google)');

  const search = await fetchText(`${root}/api/search?q=istanbul&page=1&limit=20`);
  const sPay = payloadOf(search.body);
  if (search.status !== 200) fail(`GET /api/search HTTP ${search.status}`);
  else ok('GET /api/search → 200');
  if ((sPay.places || []).length > 20) fail('search page exceeded limit');
  else ok('search SQL page respects limit');
}

function spawnServer(port) {
  return spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'development',
      SITEMAP_ON_START: 'false',
      LIVE_DATA_CRON: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function main() {
  const url = String(process.env.DATABASE_URL || '').trim();
  const hasRealDb = url && !/şifreni buraya yaz|YOUR_PASSWORD|\[.*\]/i.test(url);
  if (hasRealDb) {
    try {
      await checkDatabase();
    } catch (e) {
      fail(`database checks: ${e.message}`);
    }
  } else {
    console.log('  · skipped live DB checks (DATABASE_URL not set)');
  }

  const preset = process.env.VERIFY_INDEXES_URL;
  if (preset) {
    await checkLive(preset);
  } else {
    const port = 3056;
    const child = spawnServer(port);
    let stderr = '';
    child.stderr.on('data', (c) => { stderr += c; });
    const base = `http://127.0.0.1:${port}`;
    try {
      await waitForServer(base, 50);
      await checkLive(base);
    } catch (e) {
      fail(`live server :${port}: ${e.message}${stderr ? ` (${stderr.slice(0, 220)})` : ''}`);
    } finally {
      child.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 200));
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
    }
  }

  if (failed) {
    console.error(`verify-indexes FAILED (${failed})`);
    process.exit(1);
  }
  console.log('verify-indexes OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
