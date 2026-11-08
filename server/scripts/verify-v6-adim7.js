#!/usr/bin/env node
/**
 * V6 Adım 7 — Boş kategori / şehir çipleri otomatik gizlensin.
 * - Public Kategoriler sekmesi: placeCount ≥ 1
 * - Hero .hpl: /places/cities ile dolu; 0 şehirde satır gizli
 * - Harita .map-full min-height (V5 #129 / Grok): masaüstü 420–520, mobil 320
 * Admin kategoriler listesi dokunulmaz (hepsi + sayı).
 *
 * Usage: npm run verify:v6-adim7
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) { console.error('  ✗', msg); failed += 1; }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

console.log('verify-v6-adim7-empty-hide');

const pkg = JSON.parse(read('package.json'));
if (pkg.scripts?.['verify:v6-adim7'] !== 'node server/scripts/verify-v6-adim7.js') {
  fail('package.json verify:v6-adim7 eksik/yanlış');
} else ok('package.json verify:v6-adim7');

const indexHtml = read('public/index.html');
const appJs = read('public/js/app.js');
const css = read('public/css/style.css');
const adminHtml = read('public/admin.html');

/* ── 1. Hero şehir çipleri dinamik ── */
if (!/id="heroCityPills"/.test(indexHtml)) fail('#heroCityPills yok');
else ok('#heroCityPills host');

const staticHpl = indexHtml.match(/<button\b[^>]*class="hpl"[^>]*>/g) || [];
if (staticHpl.length) fail(`HTML'de sabit .hpl kaldı (${staticHpl.length})`);
else ok('sabit .hpl yok (İstanbul/Paris/…)');

if (!appJs.includes('function loadHeroCityPills')
  || !appJs.includes('function renderHeroCityPills')
  || !appJs.includes('function setHeroCityPillsVisible')) {
  fail('hero pill yardımcıları eksik');
} else ok('load/render/setHeroCityPillsVisible');

if (!appJs.includes("api('/places/cities')") && !appJs.includes('api("/places/cities")')) {
  fail('hero pills /places/cities çağırmıyor');
} else ok('hero pills /places/cities');

if (!/Number\(c\.placeCount\)\s*>\s*0/.test(appJs)
  && !/placeCount\)\s*>\s*0/.test(appJs)) {
  fail('placeCount > 0 filtresi app.js’te yok');
} else ok('placeCount > 0 filtresi');

if (!appJs.includes('setHeroCityPillsVisible(false)')
  || !appJs.includes('HERO_CITY_PILL_LIMIT')
  || !appJs.includes('function dedupeHeroCities')) {
  fail('boş satır gizleme / limit / dedupe yok');
} else ok('boş hpills gizlenir + limit + dedupe');

if (!appJs.includes('loadHeroCityPills()')) fail('init loadHeroCityPills çağırmıyor');
else ok('init → loadHeroCityPills');

/* ── 2. Kategori kartları: sadece ≥1 ── */
if (!appJs.includes('function publicCategoriesWithPlaces')) {
  fail('publicCategoriesWithPlaces yok');
} else ok('publicCategoriesWithPlaces');

const renderStart = appJs.indexOf('function renderCategoryCards()');
const renderEnd = appJs.indexOf('\nfunction ', renderStart + 10);
const renderFn = renderStart >= 0 ? appJs.slice(renderStart, renderEnd > 0 ? renderEnd : undefined) : '';
if (!renderFn.includes('publicCategoriesWithPlaces()')) {
  fail('renderCategoryCards publicCategoriesWithPlaces kullanmıyor');
} else ok('renderCategoryCards yalnızca dolu kategoriler');

if (/categoryMeta\.categories \|\| \[\]\)\.map\(\(c\)\s*=>/.test(renderFn)
  && !renderFn.includes('publicCategoriesWithPlaces')) {
  fail('renderCategoryCards hâlâ tüm kategorileri map’liyor');
}

/* ── 3. Admin dokunulmamış ── */
if (!adminHtml.includes("/admin/categories?all=1")
  || !adminHtml.includes('function loadCategoriesList')) {
  fail('admin kategoriler listesi kayıp');
} else ok('admin /admin/categories?all=1 (tümü + sayı)');

/* ── 4. Harita min-height (önceki V5, Adım 7’de doğrula) ── */
const mapBlock = css.match(/\.map-full\{[^}]+\}/);
if (!mapBlock) fail('.map-full kuralı yok');
else {
  const min = mapBlock[0].match(/min-height:\s*(\d+)px/);
  if (!min) fail('.map-full min-height yok');
  else {
    const px = Number(min[1]);
    if (px < 420 || px > 520) fail(`.map-full min-height ${px}px (420–520)`);
    else ok(`.map-full masaüstü min-height ${px}px`);
  }
}
if (!/@media\(max-width:900px\)\{[^}]*\.map-full\{min-height:\s*320px;height:55vh;\}/.test(css)
  && !/\.map-full\{min-height:\s*320px;height:55vh;\}/.test(css)) {
  fail('mobil .map-full min-height 320px değil');
} else ok('mobil .map-full min-height 320px');

if (failed) {
  console.error(`verify-v6-adim7 KALDI (${failed} hata)`);
  process.exit(1);
}
console.log('verify-v6-adim7 TAMAM');
