/**
 * Empty-state CTAs: 0-result screens get an existing-style button.
 * Search → Filtreler Temizle / Keşfet. Place 0-Tiola → İlk Tiola (already there).
 * Usage: node server/scripts/verify-empty-states.js
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

console.log('verify-empty-states');

const indexHtml = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const profileHtml = fs.readFileSync(path.join(ROOT, 'public', 'profile.html'), 'utf8');
const searchHtml = fs.readFileSync(path.join(ROOT, 'public', 'search.html'), 'utf8');
const discoverJs = fs.readFileSync(path.join(ROOT, 'public', 'js', 'discover-places.js'), 'utf8');
const i18n = fs.readFileSync(path.join(ROOT, 'public', 'js', 'i18n.js'), 'utf8');
const appJs = fs.readFileSync(path.join(ROOT, 'public', 'js', 'app.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

function sliceAround(src, marker, after) {
  const i = src.indexOf(marker);
  if (i < 0) return '';
  return src.slice(i, i + after);
}

const noResBlock = sliceAround(indexHtml, 'id="noRes"', 520);
if (!noResBlock) fail('#noRes missing');
else {
  if (!noResBlock.includes('data-i18n="noResults"')) fail('#noRes missing noResults copy');
  else ok('explore empty keeps noResults copy');
  if (!noResBlock.includes('id="noResClear"') || !noResBlock.includes('data-act="resetFilters"')) {
    fail('#noRes missing Filtreler Temizle CTA');
  } else ok('explore 0 results → Filtreler Temizle');
  if (!noResBlock.includes('class="btn bo bsm"')) fail('#noRes CTA must reuse btn bo bsm');
  else ok('explore empty uses existing btn bo bsm');
  if (/id="noRes"[^>]*data-i18n="noResults"/.test(indexHtml)) {
    fail('#noRes container must not hold data-i18n (would wipe the button)');
  } else ok('#noRes i18n is on the message, not the wrapper');
  if (noResBlock.includes('firstTiolaCta') || noResBlock.includes("İlk Tiola")) {
    fail('0 yer bulundu must not use İlk Tiola CTA');
  } else ok('0 yer bulundu does not use İlk Tiola copy');
}

const discoverBlock = sliceAround(indexHtml, 'id="discoverEmpty"', 520);
if (!discoverBlock) fail('#discoverEmpty missing');
else {
  if (!discoverBlock.includes('id="discoverEmptyClear"') || !discoverBlock.includes('data-i18n="filterClear"')) {
    fail('discover empty missing Filtreler Temizle');
  } else ok('discover empty → Filtreler Temizle');
  if (!discoverBlock.includes('class="btn bo bsm"')) fail('discover empty CTA must reuse btn bo bsm');
  else ok('discover empty uses existing btn bo bsm');
}

if (!discoverJs.includes("getElementById('discoverEmptyClear')") || !discoverJs.includes('clearCityFilter')) {
  fail('discover empty CTA not wired to clearCityFilter');
} else ok('discover empty CTA clears city/category');

const savedSpa = sliceAround(indexHtml, 'id="savedEmpty"', 420);
if (!savedSpa || !savedSpa.includes('data-i18n="explore"') || !savedSpa.includes('showMainTab')) {
  fail('SPA favorites empty missing Keşfet CTA');
} else ok('SPA favorites empty → Keşfet');

const savedProf = sliceAround(profileHtml, 'id="savedEmpty"', 420);
if (!savedProf || !savedProf.includes('data-i18n="explore"') || !savedProf.includes('href="/"')) {
  fail('profile favorites empty missing Keşfet link');
} else ok('profile favorites empty → Keşfet');

if ((indexHtml.match(/id="firstTiolaCta"/g) || []).length !== 1) {
  fail('first-Tiola CTA must stay a single place-detail button');
} else ok('İlk Tiola CTA stays on place detail only');
if (!indexHtml.includes('data-act="startFirstTiola"') || !indexHtml.includes('data-i18n="firstTiolaCta"')) {
  fail('place-detail first-Tiola CTA missing');
} else ok('place-detail keeps İlk Tiola\'yı sen yaz!');

if (!searchHtml.includes('mapExploreBtn') || !searchHtml.includes('class="btn bo bsm"')) {
  fail('search.html empty already had a CTA — must keep it');
} else ok('search.html empty keeps existing Haritada keşfet');
if (searchHtml.includes('firstTiolaCta') || searchHtml.includes("İlk Tiola")) {
  fail('search.html must not get İlk Tiola CTA');
} else ok('search.html does not add İlk Tiola');

if (!appJs.includes("drop.innerHTML = `<div class=\"sd-empty\">${t('noResults')}")
  || !appJs.includes('mapExploreBtn')) {
  fail('search dropdown empty CTA missing');
} else ok('search dropdown empty keeps Haritada keşfet');

if (!i18n.includes("filterClear: 'Filtreler Temizle'") || !i18n.includes("filterClear: 'Clear filters'")) {
  fail('filterClear i18n missing');
} else ok('reuses existing Filtreler Temizle i18n');
if (!i18n.includes("explore: 'Keşfet'") || !i18n.includes("firstTiolaCta: \"İlk Tiola'yı sen yaz!\"")) {
  fail('explore / firstTiolaCta i18n missing');
} else ok('reuses existing Keşfet + İlk Tiola i18n');

if (!pkg.scripts || pkg.scripts['verify:empty-states'] !== 'node server/scripts/verify-empty-states.js') {
  fail('package.json missing verify:empty-states');
} else ok('verify:empty-states script');

if (failed) {
  console.error(`verify-empty-states: ${failed} failed`);
  process.exit(1);
}
console.log('verify-empty-states: ok');
