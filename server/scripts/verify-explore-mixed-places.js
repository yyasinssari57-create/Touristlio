/**
 * Keşfet follow-up: category chip bar stays gone, mixed place grid still browses.
 * Usage: node server/scripts/verify-explore-mixed-places.js
 */
const fs = require('fs');
const path = require('path');
const { shouldMixCategories } = require('../lib/places-search');

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

console.log('verify-explore-mixed-places');

const index = read('public/index.html');
const app = read('public/js/app.js');
const i18n = read('public/js/i18n.js');
const pkg = JSON.parse(read('package.json'));
const searchLib = read('server/lib/places-search.js');

if (index.includes('id="discoverFilterBar"') || index.includes('id="mapFilterBar"')) {
  fail('emoji chip bars must stay removed from Keşfet surface');
} else ok('discover/map chip bars absent on page surface');

if (!index.includes('id="exploreFilterChipHost"') || !/id="exploreFilterChipHost"[^>]*\bhidden\b/.test(index)) {
  fail('chip host for mobile filter sheet missing/hidden');
} else ok('chips only in hidden exploreFilterChipHost (sheet)');

if (!index.includes('id="pgrid"') || !index.includes('id="es-discover"')) {
  fail('Keşfet place grid missing');
} else ok('#pgrid still under Destinasyonlar');

if (index.includes('Kategori seçin veya arama yapın')) {
  fail('browseHint still tells users to pick a category');
} else ok('browseHint no longer requires category chips');

if (!i18n.includes("browseHint: 'Karma destinasyonlar burada listelenir")
  || !i18n.includes("browseHint: 'Mixed destinations appear here")) {
  fail('browseHint i18n not updated for mixed browse');
} else ok('browseHint TR/EN invite mixed browse');

if (!app.includes("activeCat !== 'all' ? activeCat : ''")) {
  fail('default browse must not send category=all as a real filter');
} else ok('buildFilterParams omits category when Tümü');

if (!app.includes('await applyFilters()') || !app.includes('function init()')) {
  fail('init must still load places without a chip click');
} else ok('init still calls applyFilters for default browse');

if (!index.includes('id="filterSheet"') || !index.includes('id="filterTabWrap"')) {
  fail('advanced filters / mobile sheet missing');
} else ok('advanced filters + mobile sheet kept');

if (!searchLib.includes('function shouldMixCategories') || !searchLib.includes('mixedPopularitySelectSql')) {
  fail('mixed category browse SQL helper missing');
} else ok('mixed popularity browse helpers present');

if (!shouldMixCategories({ sort: 'popularity' })) fail('default popularity should mix');
else ok('default popularity mixes categories');

if (shouldMixCategories({ sort: 'popularity', category: 'nature' })) {
  fail('category filter must not mix');
} else ok('category filter disables mix');

if (shouldMixCategories({ sort: 'popularity', group: 'historical' })) {
  fail('group filter must not mix');
} else ok('group filter disables mix');

if (shouldMixCategories({ sort: 'az' }) || shouldMixCategories({ sort: 'popularity', q: 'ayasofya' })) {
  fail('az/search must not mix');
} else ok('az + search keep normal order');

if (!pkg.scripts || pkg.scripts['verify:explore-mixed'] !== 'node server/scripts/verify-explore-mixed-places.js') {
  fail('package.json verify:explore-mixed missing');
} else ok('verify:explore-mixed script');

if (failed) {
  console.error(`verify-explore-mixed-places: ${failed} failed`);
  process.exit(1);
}
console.log('verify-explore-mixed-places: ok');
