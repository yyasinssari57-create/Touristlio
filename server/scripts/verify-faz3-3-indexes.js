/**
 * [FAZ3-3] Veritabanı index'leri — PRD adları gerçek şemaya map edilir.
 * Usage: node server/scripts/verify-faz3-3-indexes.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
require('dotenv').config({ path: path.join(ROOT, '.env') });
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

console.log('verify-faz3-3');

const mig = read('db/migrations/012_faz3_3_indexes.js');
const migrationsJs = read('server/lib/migrations.js');
const pgSchema = read('server/lib/pg-schema.js');
const fts = read('db/migrations/002_places_fts.js');
const vote = read('db/migrations/007_tiola_unique_vote.js');
const filter = read('db/migrations/008_filter_indexes.js');
const pkg = JSON.parse(read('package.json'));

if (pkg.scripts['verify:faz3-3'] !== 'node server/scripts/verify-faz3-3-indexes.js') {
  fail('package.json missing verify:faz3-3');
} else ok('verify:faz3-3 script');

const requiredSnippets = [
  'idx_places_score',
  'COALESCE(tiola_rating, 0)',
  'idx_tiolas_place_approved',
  "status = 'approved' AND parent_id IS NULL",
  'idx_blogs_published',
  'COALESCE(published_at, created_at)',
  "WHERE status = 'approved'",
];
for (const snippet of requiredSnippets) {
  if (!mig.includes(snippet)) fail(`012 missing ${snippet}`);
  else ok(`012 has ${snippet}`);
}

const migSql = mig.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const forbidden = [
  'verification_status',
  'blog_posts',
  'name_tr',
  'description_tr',
  'city_slug',
  'avg_score',
  'ADD CONSTRAINT',
  'idx_places_fts_tr',
];
for (const bad of forbidden) {
  if (migSql.includes(bad)) fail(`012 SQL must not paste PRD identifier ${bad}`);
  else ok(`012 SQL does not use ${bad}`);
}
if (/\bFROM favorites\b|\bon favorites\b/i.test(mig)) fail('012 references favorites table');
else ok('012 does not use favorites table');
if (/UNIQUE\s*\(\s*user_id\s*,\s*place_id\s*\)/i.test(mig)) {
  fail('012 adds a full unique (user_id, place_id)');
} else ok('012 does not add a blanket tiola unique');

if (!migrationsJs.includes("ensureIndex(db, 'idx_places_slug'")
  || !migrationsJs.includes("ensureIndex(db, 'idx_places_status'")
  || !migrationsJs.includes("ensureIndex(db, 'idx_blogs_slug'")
  || !migrationsJs.includes('idx_tiolas_user_place_month')) {
  fail('existing slug/status/user indexes missing from migrations.js');
} else ok('slug, status, blog slug, tiola user prefix already in migrations.js');

if (!pgSchema.includes('email TEXT NOT NULL UNIQUE')) fail('users.email UNIQUE missing');
else ok('users.email UNIQUE (PRD idx_users_email)');
if (!pgSchema.includes('PRIMARY KEY (user_id, place_id)')) fail('saved_places PK missing');
else ok('saved_places PK leads with user_id (PRD favorites)');
if (!pgSchema.includes('idx_tiolas_place ON tiolas(place_id, status)')) {
  fail('idx_tiolas_place missing');
} else ok('idx_tiolas_place (place_id, status) already exists');

if (!fts.includes('idx_places_search_tsv') || !fts.includes('USING GIN')) {
  fail('FTS GIN missing');
} else ok('idx_places_search_tsv GIN (real FTS; not name_tr)');

if (!vote.includes('idx_tiolas_unique_user_place_vote')
  || !/WHERE[\s\S]*parent_id IS NULL[\s\S]*stars/i.test(vote)) {
  fail('partial unique vote index missing');
} else ok('star-vote partial unique (not a full user+place unique)');

if (!filter.includes('idx_places_country_city_score')
  || !filter.includes('idx_places_category_published')
  || !filter.includes('idx_places_tiola_rating')) {
  fail('008 filter indexes missing');
} else ok('008 country/city/score + category + tiola_rating indexes');

function indexMap(rows) {
  const map = new Map();
  for (const row of rows) map.set(row.indexname, String(row.indexdef || ''));
  return map;
}

function expectDef(map, name, needles) {
  const def = map.get(name);
  if (!def) {
    fail(`database missing ${name}`);
    return;
  }
  const lower = def.toLowerCase();
  const missing = needles.filter((n) => !lower.includes(String(n).toLowerCase()));
  if (missing.length) fail(`${name} def missing ${missing.join(', ')} — ${def}`);
  else ok(`${name} → ${def}`);
}

async function checkDatabase() {
  const { initDb, db, closePool } = require('../db');
  try {
    await initDb();
    const applied = await db.prepare(
      'SELECT 1 AS ok FROM schema_migrations WHERE id = ?',
    ).get('012_faz3_3_indexes');
    if (!applied) fail('schema_migrations missing 012_faz3_3_indexes');
    else ok('migration 012_faz3_3_indexes applied');

    const rows = await db.prepare(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('places', 'tiolas', 'blogs', 'users', 'saved_places')
    `).all();
    const map = indexMap(rows);

    expectDef(map, 'idx_places_score', ['coalesce', 'tiola_rating', 'desc']);
    expectDef(map, 'idx_tiolas_place_approved', ['place_id', 'created_at', 'approved', 'parent_id', 'where']);
    expectDef(map, 'idx_blogs_published', ['featured', 'coalesce', 'published_at', 'created_at', 'approved', 'where']);

    expectDef(map, 'idx_places_slug', ['slug']);
    expectDef(map, 'idx_places_status', ['status']);
    expectDef(map, 'idx_blogs_slug', ['slug']);
    expectDef(map, 'idx_tiolas_place', ['place_id', 'status']);
    expectDef(map, 'idx_tiolas_user_place_month', ['user_id']);
    expectDef(map, 'idx_places_search_tsv', ['gin', 'search_tsv']);
    expectDef(map, 'idx_tiolas_unique_user_place_vote', ['unique', 'user_id', 'place_id', 'where']);
    expectDef(map, 'idx_places_tiola_rating', ['tiola_rating']);
    expectDef(map, 'idx_places_category_published', ['category', 'status']);

    const email = [...map.entries()].find(([, def]) => /users/i.test(def) && /email/i.test(def) && /unique/i.test(def));
    if (!email) fail('no unique index on users.email');
    else ok(`users.email unique → ${email[0]}`);

    const saved = [...map.entries()].find(([, def]) => /saved_places/i.test(def) && /user_id/.test(def) && /place_id/.test(def));
    if (!saved) fail('saved_places missing user_id index');
    else ok(`saved_places user index → ${saved[0]}`);

    const blanket = [...map.entries()].filter(([, def]) => {
      const d = def.toLowerCase();
      return d.includes('tiolas')
        && d.includes('unique')
        && /user_id\s*,\s*place_id/.test(d)
        && !d.includes('where');
    });
    if (blanket.length) fail(`blanket tiola unique present: ${blanket.map(([n]) => n).join(', ')}`);
    else ok('no blanket UNIQUE (user_id, place_id) on tiolas');

    const scorePlan = (await db.prepare(`
      EXPLAIN SELECT id FROM places
      ORDER BY COALESCE(tiola_rating, 0) DESC, id DESC
      LIMIT 20
    `).all()).map((r) => r['QUERY PLAN'] || JSON.stringify(r)).join(' | ');
    console.log('  EXPLAIN places score:', scorePlan);
    if (!/idx_places_score/i.test(scorePlan)) fail('planner did not use idx_places_score');
    else ok('idx_places_score matches the default place list');

    const tiolaPlan = (await db.prepare(`
      EXPLAIN SELECT id FROM tiolas
      WHERE place_id = 1 AND status = 'approved' AND parent_id IS NULL
      ORDER BY created_at DESC
      LIMIT 20
    `).all()).map((r) => r['QUERY PLAN'] || JSON.stringify(r)).join(' | ');
    console.log('  EXPLAIN tiolas approved:', tiolaPlan);
    if (!/idx_tiolas_place_approved/i.test(tiolaPlan)) fail('planner did not use idx_tiolas_place_approved');
    else ok('idx_tiolas_place_approved matches place reviews');

    const blogPlan = (await db.prepare(`
      EXPLAIN SELECT id FROM blogs
      WHERE status = 'approved'
      ORDER BY featured DESC, COALESCE(published_at, created_at) DESC
      LIMIT 20
    `).all()).map((r) => r['QUERY PLAN'] || JSON.stringify(r)).join(' | ');
    console.log('  EXPLAIN blogs published:', blogPlan);
    ok('EXPLAIN blogs published ran');

    const blogForced = await db.transaction(async () => {
      await db.exec('SET LOCAL enable_seqscan = off');
      return (await db.prepare(`
        EXPLAIN SELECT id FROM blogs
        WHERE status = 'approved'
        ORDER BY featured DESC, COALESCE(published_at, created_at) DESC
        LIMIT 20
      `).all()).map((r) => r['QUERY PLAN'] || JSON.stringify(r)).join(' | ');
    })();
    console.log('  EXPLAIN blogs (seqscan off):', blogForced);
    if (!/idx_blogs_published/i.test(blogForced)) {
      fail('planner cannot use idx_blogs_published for the public blog list');
    } else ok('idx_blogs_published matches the public blog list');
  } finally {
    try { await closePool(); } catch { /* pool already closed */ }
  }
}

async function main() {
  const url = String(process.env.DATABASE_URL || '').trim();
  const hasRealDb = url && !/şifreni buraya yaz|YOUR_PASSWORD|\[.*\]/i.test(url);
  if (!hasRealDb) {
    fail('DATABASE_URL missing — cannot confirm indexes on PostgreSQL');
  } else {
    try {
      await checkDatabase();
    } catch (err) {
      fail(`database checks: ${err.message}`);
    }
  }

  if (failed) {
    console.error(`verify-faz3-3 FAILED (${failed})`);
    process.exit(1);
  }
  console.log('verify-faz3-3 OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
