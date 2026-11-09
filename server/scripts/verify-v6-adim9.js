#!/usr/bin/env node
/**
 * V6 Adım 9 — Slug değişince otomatik 301.
 * - place_slug_redirects'e otomatik yazım (admin update)
 * - Zincir çökertme (A→B, B→C ⇒ A→C)
 * - Hedef taslak/arşivse 301 yok
 * - Admin slug uyarısı
 *
 * Usage: npm run verify:v6-adim9
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) { console.error('  ✗', msg); failed += 1; }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

console.log('verify-v6-adim9-slug-redirect');

const pkg = JSON.parse(read('package.json'));
if (pkg.scripts?.['verify:v6-adim9'] !== 'node server/scripts/verify-v6-adim9.js') {
  fail('package.json verify:v6-adim9 eksik/yanlış');
} else ok('package.json verify:v6-adim9');

const redirectsJs = read('server/lib/place-redirects.js');
const adminPlaceJs = read('server/lib/admin-place.js');
const adminHtml = read('public/admin.html');
const homeJs = read('server/index.js');
const placesLegacy = read('server/routes/places-legacy.js');
const migration = read('db/migrations/018_v4_adim5_draft_places.js');

/* ── 1. Tablo + okuma hâlâ duruyor ── */
if (!migration.includes('place_slug_redirects')) fail('migration 018 tablosu yok');
else ok('place_slug_redirects tablosu (mig 018)');

if (!redirectsJs.includes('async function publishedRedirectSlug')
  || !redirectsJs.includes('isPublishedPlaceStatus')) {
  fail('publishedRedirectSlug / yayın kapısı yok');
} else ok('publishedRedirectSlug yalnızca yayın hedefe 301');

if (!homeJs.includes('publishedRedirectSlug') || !homeJs.includes('301')) {
  fail('HTML /places/:slug 301 yok');
} else ok('/places/:slug → 301');

if (!placesLegacy.includes('publishedRedirectSlug')) {
  fail('API place resolve 301 yok');
} else ok('/api/places/:id → 301');

/* ── 2. Otomatik yazım admin update'te ── */
if (!redirectsJs.includes('async function recordPlaceSlugRedirect')
  || !redirectsJs.includes('function shouldRecordSlugRedirect')) {
  fail('recordPlaceSlugRedirect / shouldRecordSlugRedirect yok');
} else ok('recordPlaceSlugRedirect yardımcısı');

if (!adminPlaceJs.includes('recordPlaceSlugRedirect')
  || !adminPlaceJs.includes('shouldRecordSlugRedirect')
  || !adminPlaceJs.includes('prevSlug')) {
  fail('updatePlace slug değişince yönlendirme yazmıyor');
} else ok('updatePlace → place_slug_redirects');

if (!/UPDATE place_slug_redirects[\s\S]*to_slug = \?[\s\S]*WHERE to_slug = \?/.test(redirectsJs)
  && !redirectsJs.includes('WHERE to_slug = ?')) {
  fail('zincir çökertme (to_slug güncelleme) yok');
} else ok('zincir A→B→C çökertilir');

if (!redirectsJs.includes('DELETE FROM place_slug_redirects WHERE from_slug = ?')) {
  fail('yeni slug’tan çıkan yönlendirme silinmiyor');
} else ok('yeni slug from_slug olarak silinir');

/* ── 3. Admin uyarı ── */
const warn = "Yayınlanmış yerin slug'ını değiştirmek eski adresi yönlendirir; mümkünse değiştirme.";
if (!adminHtml.includes(warn) || !adminHtml.includes('edSlugRedirectWarn')) {
  fail('admin slug uyarısı yok');
} else ok('admin slug uyarısı');

/* ── 4. Davranış birimi (sahte DB, DATABASE_URL gerekmez) ── */
const {
  recordPlaceSlugRedirect,
  shouldRecordSlugRedirect,
  publishedRedirectSlug,
} = require('../lib/place-redirects');

function makeFakeDb({ redirects = {}, places = {} } = {}) {
  const redir = new Map(Object.entries(redirects));
  const placeRows = { ...places };
  return {
    redir,
    prepare(sql) {
      const text = String(sql);
      return {
        async run(...args) {
          if (/UPDATE place_slug_redirects\s+SET to_slug/i.test(text)) {
            const [to, from] = args;
            for (const [k, v] of [...redir.entries()]) {
              if (v === from && k !== to) redir.set(k, to);
            }
            return { changes: 1 };
          }
          if (/INSERT INTO place_slug_redirects/i.test(text)) {
            redir.set(args[0], args[1]);
            return { changes: 1 };
          }
          if (/DELETE FROM place_slug_redirects WHERE from_slug = \?/i.test(text)
            && !/to_slug/i.test(text)) {
            redir.delete(args[0]);
            return { changes: 1 };
          }
          if (/DELETE FROM place_slug_redirects WHERE from_slug = to_slug/i.test(text)) {
            for (const [k, v] of [...redir.entries()]) {
              if (k === v) redir.delete(k);
            }
            return { changes: 1 };
          }
          return { changes: 0 };
        },
        async get(...args) {
          if (/FROM place_slug_redirects WHERE from_slug/i.test(text)) {
            const to = redir.get(args[0]);
            return to ? { to_slug: to } : null;
          }
          if (/FROM places WHERE slug/i.test(text)) {
            const row = placeRows[args[0]];
            return row ? { slug: args[0], status: row.status } : null;
          }
          return null;
        },
      };
    },
  };
}

(async () => {
  if (!shouldRecordSlugRedirect('published', 'eski-slug', 'yeni-slug')) {
    fail('shouldRecord: yayın slug değişimi true olmalı');
  } else ok('shouldRecord yayın slug değişimi');

  if (shouldRecordSlugRedirect('published', 'aynı', 'aynı')) {
    fail('shouldRecord aynı slug false olmalı');
  } else ok('shouldRecord aynı slug atlanır');

  const fake = makeFakeDb({ redirects: { 'slug-a': 'slug-b' } });
  await recordPlaceSlugRedirect('slug-b', 'slug-c', fake);
  if (fake.redir.get('slug-a') !== 'slug-c') fail(`zincir slug-a→${fake.redir.get('slug-a')} (slug-c beklenirdi)`);
  else ok('zincir: slug-a→slug-c');
  if (fake.redir.get('slug-b') !== 'slug-c') fail('slug-b→slug-c yazılmadı');
  else ok('slug-b→slug-c yazıldı');
  if (fake.redir.has('slug-c')) fail('slug-c from_slug olarak kalmamalı');
  else ok('slug-c from_slug değil');

  const gate = makeFakeDb({
    redirects: { 'old-place': 'new-place' },
    places: { 'new-place': { status: 'draft' } },
  });
  const draftTarget = await publishedRedirectSlug('old-place', gate);
  if (draftTarget) fail(`taslak hedefe 301 verdi: ${draftTarget}`);
  else ok('taslak hedef → yönlendirme yok (404)');

  const live = makeFakeDb({
    redirects: { 'old-place': 'new-place' },
    places: { 'new-place': { status: 'published' } },
  });
  const pubTarget = await publishedRedirectSlug('old-place', live);
  if (pubTarget !== 'new-place') fail(`yayın hedef 301 yok: ${pubTarget}`);
  else ok('yayın hedef → new-place');

  const archived = makeFakeDb({
    redirects: { 'old-place': 'new-place' },
    places: { 'new-place': { status: 'archived' } },
  });
  const archTarget = await publishedRedirectSlug('old-place', archived);
  if (archTarget) fail(`arşiv hedefe 301 verdi: ${archTarget}`);
  else ok('arşiv hedef → yönlendirme yok (404)');

  if (failed) {
    console.error(`verify-v6-adim9 KALDI (${failed} hata)`);
    process.exit(1);
  }
  console.log('verify-v6-adim9 TAMAM');
})().catch((err) => {
  console.error('verify-v6-adim9 hata:', err && err.stack ? err.stack : err);
  process.exit(1);
});
