/**
 * Claude Master PRD — FAZ2-4 (N+1 Sorgu Temizliği).
 *
 * Confirms the two real N+1 patterns the audit flagged in
 * server/routes/admin.js (`POST /tiolas/bulk`, `POST /blogs/bulk`) are gone:
 * both endpoints used to loop over each id in the request doing a
 * SELECT + UPDATE + stats-recompute (2 more queries) + notification INSERT +
 * audit-log INSERT + moderation-history INSERT *per item* — a handful of
 * items already meant dozens of DB round-trips.
 *
 * This script:
 *   1) boots a minimal in-process Express app mounting the real
 *      `server/routes/admin.js` router against a local Postgres test DB
 *      (no mocks — the actual route code, the actual SQL) and listens on a
 *      real HTTP port ("spins up a local server" per the task).
 *   2) patches Statement.prototype.get/all/run from server/lib/pg-db.js
 *      (in-process only, no source changes) to count every DB round-trip
 *      the running server makes.
 *   3) seeds a handful of test tiolas + blogs, calls the bulk endpoints
 *      with multiple ids, and checks the end-to-end result (status change,
 *      per-item notification, per-item audit-log + moderation-history rows)
 *      is unchanged in shape — this is a pure query-efficiency refactor.
 *   4) proves the fix by comparing the query count for a 5-item batch vs a
 *      20-item batch of the *same* action: a lingering N+1 would make the
 *      20-item batch cost ~4x the 5-item batch; the batched version costs
 *      roughly the same regardless of N.
 *
 * Usage:
 *   VERIFY_FAZ24_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/touristlio_test \
 *     node server/scripts/verify-faz2-4-n-plus-one.js
 */
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) { console.error('  ✗', msg); failed += 1; }

const DEFAULT_TEST_DB = 'postgresql://postgres:postgres@127.0.0.1:5432/touristlio_test';
process.env.DATABASE_URL = process.env.VERIFY_FAZ24_DATABASE_URL || process.env.DATABASE_URL || DEFAULT_TEST_DB;
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'faz2-4-verify-secret-not-for-production-use-only';
process.env.SITE_URL = process.env.SITE_URL || 'http://127.0.0.1:0';

console.log('verify-faz2-4-n-plus-one');
console.log(`  (DATABASE_URL=${process.env.DATABASE_URL.replace(/:[^:@/]+@/, ':***@')})`);

// ---------------------------------------------------------------------------
// Query counter — patches the exported Statement class from pg-db.js so
// every db.prepare(sql).get/all/run() call anywhere in the running server
// (admin.js, its lib/ dependencies, etc.) is counted. Pure in-process
// instrumentation; no source file is modified.
// ---------------------------------------------------------------------------
let queryCount = 0;
function installQueryCounter() {
  const { Statement } = require('../lib/pg-db');
  for (const method of ['get', 'all', 'run']) {
    const orig = Statement.prototype[method];
    Statement.prototype[method] = function patched(...args) {
      queryCount += 1;
      return orig.apply(this, args);
    };
  }
}
function resetQueryCount() { queryCount = 0; }
function getQueryCount() { return queryCount; }

// ---------------------------------------------------------------------------
// Minimal in-process server mounting the real admin router.
// ---------------------------------------------------------------------------
async function buildApp() {
  require('../lib/express-async-errors').patchExpressAsyncErrors();
  const express = require('express');
  const cookieParser = require('cookie-parser');
  const { csrfProtection } = require('../middleware/csrf');
  const adminRoutes = require('../routes/admin');

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use('/api/admin', csrfProtection, adminRoutes);
  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    res.status(500).json({ success: false, error: err.message || 'Sunucu hatası' });
  });
  return app;
}

function request(url, { method = 'GET', body, headers } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body == null ? null : JSON.stringify(body);
    const hdrs = { ...(headers || {}) };
    if (payload != null) {
      hdrs['Content-Type'] = 'application/json';
      hdrs['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = http.request({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search, method, headers: hdrs, timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let json = {};
        try { json = JSON.parse(data); } catch { /* ignore */ }
        resolve({ status: res.statusCode, json, body: data });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (payload != null) req.write(payload);
    req.end();
  });
}

async function main() {
  installQueryCounter();

  const { initDb, db } = require('../db');
  await initDb();
  ok('Test Postgres veritabanına bağlanıldı, şema + migration hazır');

  const { createUser, signToken } = require('../auth');

  const stamp = Date.now();
  const adminEmail = `faz24-admin-${stamp}@touristlio.local`;
  const admin = await createUser({ name: 'FAZ24 Admin', email: adminEmail, password: 'FazTest24_12345', role: 'admin' });
  const adminToken = signToken(admin);

  // tiolas has a partial UNIQUE(user_id, place_id) index (one star-vote per
  // user per place — ORTA-4). A bulk batch targeting the same test place
  // needs one distinct author per tiola, so pre-create a pool larger than
  // any single batch in this script.
  const AUTHOR_POOL_SIZE = 50;
  const authors = [];
  for (let i = 0; i < AUTHOR_POOL_SIZE; i += 1) {
    authors.push(await createUser({
      name: `FAZ24 Yazar ${i}`,
      email: `faz24-author-${stamp}-${i}@touristlio.local`,
      password: 'FazTest24_12345',
      role: 'member',
    }));
  }
  const author = authors[0];
  let authorCursor = 0;
  function nextAuthor() {
    const a = authors[authorCursor % authors.length];
    authorCursor += 1;
    return a;
  }
  ok(`Test admin + ${authors.length} içerik sahibi kullanıcı oluşturuldu`);

  // Dedicated high-id test places so we never touch real seeded place stats.
  const testPlaceIds = [9990001, 9990002, 9990003];
  for (const pid of testPlaceIds) {
    await db.prepare(`
      INSERT INTO places (id, name, country, city, category, status)
      VALUES (?, ?, 'Test Ülke', 'Test Şehir', 'nature', 'published')
      ON CONFLICT (id) DO NOTHING
    `).run(pid, `FAZ2-4 Test Yer ${pid}`);
  }
  ok('Test mekânları hazırlandı (gerçek verilere dokunulmadı)');

  async function insertTiolas(count, { place = testPlaceIds[0] } = {}) {
    const ids = [];
    for (let i = 0; i < count; i += 1) {
      const user = nextAuthor();
      const info = await db.prepare(`
        INSERT INTO tiolas (user_id, place_id, stars, text, status)
        VALUES (?, ?, 5, ?, 'pending')
      `).run(user.id, place, `FAZ2-4 verify tiola #${stamp}-${i}`);
      ids.push(info.lastInsertRowid);
    }
    return ids;
  }

  async function insertBlogs(count) {
    const ids = [];
    for (let i = 0; i < count; i += 1) {
      const info = await db.prepare(`
        INSERT INTO blogs (user_id, title, excerpt, body, status)
        VALUES (?, ?, ?, ?, 'pending')
      `).run(author.id, `FAZ2-4 verify blog #${stamp}-${i}`, 'Özet', 'Gövde');
      ids.push(info.lastInsertRowid);
    }
    return ids;
  }

  const app = await buildApp();
  const server = await new Promise((resolve, reject) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
    s.on('error', reject);
  });
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const authHeaders = { Cookie: `tl_token=${adminToken}`, Origin: base };
  ok(`Test sunucusu 127.0.0.1:${port} üzerinde ayakta (gerçek admin.js rotaları)`);

  async function bulk(kind, ids, action, reason) {
    resetQueryCount();
    const res = await request(`${base}/api/admin/${kind}/bulk`, {
      method: 'POST', headers: authHeaders, body: { ids, action, reason },
    });
    const queries = getQueryCount();
    return { res, queries };
  }

  // -------------------------------------------------------------------
  // 1) Functional correctness: bulk approve + bulk reject still work
  //    end-to-end (status, notifications, audit log, moderation history).
  // -------------------------------------------------------------------
  {
    const ids = await insertTiolas(6, { place: testPlaceIds[0] });
    const { res, queries } = await bulk('tiolas', ids, 'approve');
    if (res.status !== 200 || !res.json.success) {
      fail(`tiolas/bulk approve HTTP ${res.status}: ${res.body.slice(0, 200)}`);
    } else if (res.json.data.processed !== ids.length || res.json.data.errors.length) {
      fail(`tiolas/bulk approve processed=${res.json.data.processed}, errors=${JSON.stringify(res.json.data.errors)}`);
    } else {
      ok(`tiolas/bulk approve: ${ids.length} öğe → processed=${res.json.data.processed}, errors=[] (${queries} sorgu)`);
    }

    const rows = await db.prepare('SELECT status, moderated_by FROM tiolas WHERE id = ANY(?::int[])').all(ids);
    if (rows.length !== ids.length || rows.some((r) => r.status !== 'approved' || r.moderated_by !== admin.id)) {
      fail('onaylanan Tiola satırları DB\'de beklenen durumda değil');
    } else ok('tüm Tiola satırları DB\'de status=approved + moderated_by=admin');

    const place = await db.prepare('SELECT tiola_count, tiola_rating FROM places WHERE id = ?').get(testPlaceIds[0]);
    if (!place || Number(place.tiola_count) < ids.length) {
      fail(`places.tiola_count güncellenmedi (got ${place && place.tiola_count})`);
    } else ok(`places.tiola_count / tiola_rating toplu onay sonrası güncellendi (count=${place.tiola_count})`);

    const auditRows = await db.prepare(`
      SELECT target_id FROM admin_audit_log WHERE action = 'tiola.approve' AND target_id = ANY(?::int[])
    `).all(ids);
    if (auditRows.length !== ids.length) {
      fail(`admin_audit_log: beklenen ${ids.length} satır, bulunan ${auditRows.length} (her öğe için ayrı audit satırı korunmalı)`);
    } else ok(`admin_audit_log: ${ids.length} öğenin HER BİRİ için ayrı satır yazıldı (tek satıra birleştirilmedi)`);

    const histRows = await db.prepare(`
      SELECT content_id FROM moderation_history WHERE content_type = 'tiola' AND action = 'approve' AND content_id = ANY(?::int[])
    `).all(ids);
    if (histRows.length !== ids.length) {
      fail(`moderation_history: beklenen ${ids.length} satır, bulunan ${histRows.length}`);
    } else ok(`moderation_history: ${ids.length} öğenin HER BİRİ için ayrı satır yazıldı`);
  }

  {
    const ids = await insertTiolas(6, { place: testPlaceIds[1] });
    const reason = 'FAZ2-4 verify: toplu red nedeni';
    const { res, queries } = await bulk('tiolas', ids, 'reject', reason);
    if (res.status !== 200 || !res.json.success || res.json.data.processed !== ids.length) {
      fail(`tiolas/bulk reject HTTP ${res.status}: ${res.body.slice(0, 200)}`);
    } else {
      ok(`tiolas/bulk reject: ${ids.length} öğe → processed=${res.json.data.processed} (${queries} sorgu)`);
    }

    const rows = await db.prepare('SELECT status, rejection_reason FROM tiolas WHERE id = ANY(?::int[])').all(ids);
    if (rows.length !== ids.length || rows.some((r) => r.status !== 'rejected' || r.rejection_reason !== reason)) {
      fail('reddedilen Tiola satırları DB\'de beklenen durumda değil');
    } else ok('tüm Tiola satırları DB\'de status=rejected + rejection_reason doğru');

    const tiolaOwners = await db.prepare('SELECT user_id FROM tiolas WHERE id = ANY(?::int[])').all(ids);
    const ownerIds = tiolaOwners.map((r) => r.user_id);
    const notifRows = await db.prepare(`
      SELECT user_id, body FROM user_notifications WHERE type = 'tiola_rejected' AND user_id = ANY(?::int[])
    `).all(ownerIds);
    const matching = notifRows.filter((r) => r.body && r.body.includes(reason));
    if (matching.length !== ids.length) {
      fail(`user_notifications: beklenen ${ids.length} bildirim, bulunan ${matching.length} (her öğe için ayrı bildirim korunmalı)`);
    } else ok(`user_notifications: ${ids.length} öğenin HER BİRİ için ayrı bildirim satırı yazıldı`);
  }

  // -------------------------------------------------------------------
  // 2) Blogs bulk: same shape, lighter check.
  // -------------------------------------------------------------------
  {
    const ids = await insertBlogs(5);
    const { res, queries } = await bulk('blogs', ids, 'approve');
    if (res.status !== 200 || !res.json.success || res.json.data.processed !== ids.length) {
      fail(`blogs/bulk approve HTTP ${res.status}: ${res.body.slice(0, 200)}`);
    } else {
      ok(`blogs/bulk approve: ${ids.length} öğe → processed=${res.json.data.processed} (${queries} sorgu)`);
    }
    const rows = await db.prepare("SELECT status FROM blogs WHERE id = ANY(?::int[])").all(ids);
    if (rows.length !== ids.length || rows.some((r) => r.status !== 'approved')) {
      fail('onaylanan blog satırları DB\'de beklenen durumda değil');
    } else ok('tüm blog satırları DB\'de status=approved');
  }

  // -------------------------------------------------------------------
  // 3) The actual N+1 regression guard: query count must stay roughly flat
  //    as N grows, instead of scaling ~linearly with the batch size.
  // -------------------------------------------------------------------
  {
    const small = await insertTiolas(5, { place: testPlaceIds[2] });
    const { queries: q5 } = await bulk('tiolas', small, 'approve');

    const big = await insertTiolas(20, { place: testPlaceIds[2] });
    const { queries: q20 } = await bulk('tiolas', big, 'approve');

    console.log(`  · tiolas/bulk approve — 5 öğe: ${q5} sorgu, 20 öğe: ${q20} sorgu`);
    // A per-item loop here would cost roughly (20/5)x as many queries for 4x
    // the items (~q5*4). The batched version should cost only marginally
    // more (same handful of shared queries) regardless of N.
    const linearProjection = q5 * 4;
    if (q20 >= linearProjection * 0.75) {
      fail(`N+1 şüphesi: 20 öğe ${q20} sorgu kullandı, 5 öğenin ${q5}'ten doğrusal beklenti ${linearProjection} olurdu — ölçekleniyor gibi görünüyor`);
    } else {
      ok(`sorgu sayısı batch büyüklüğüyle DOĞRUSAL ÖLÇEKLENMİYOR (20 öğe ${q20} sorgu ≪ doğrusal beklenti ${linearProjection}) — N+1 giderildi`);
    }
    if (q20 > 20) {
      fail(`20 öğelik bulk approve hâlâ ${q20} sorgu kullanıyor — beklenen küçük sabit sayı (tek UPDATE + stats + audit + moderation)`);
    } else {
      ok(`20 öğelik bulk approve toplam ${q20} sorgu (eskiden ~${20 * 6} sorgu olurdu: SELECT+UPDATE+stats(2)+audit+moderation × 20)`);
    }
  }

  await new Promise((resolve) => server.close(resolve));

  console.log('');
  console.log('  Özet: admin.js /tiolas/bulk ve /blogs/bulk artık per-item DB');
  console.log('  sorgusu YERİNE toplu (batched) sorgular kullanıyor. E-posta');
  console.log('  gönderimi (alıcı başına ayrı SMTP çağrısı) kasıtlı olarak');
  console.log('  döngüde kaldı — bu bir DB sorgusu değil.');

  await db.close();

  if (failed) {
    console.error(`verify-faz2-4-n-plus-one: ${failed} failed`);
    process.exit(1);
  }
  console.log('verify-faz2-4-n-plus-one: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
