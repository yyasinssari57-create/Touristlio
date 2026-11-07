/**
 * Keşfet: "N yer bulundu" only after a real search / filter — not bare browse.
 * Usage: npm run verify:explore-count-hide
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) { console.error('  ✗', msg); failed += 1; }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) return null;
  const brace = source.indexOf('{', start);
  if (brace < 0) return null;
  let depth = 0;
  for (let i = brace; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

console.log('verify-explore-count-hide');

const index = read('public/index.html');
const app = read('public/js/app.js');
const css = read('public/css/style.css');
const pkg = JSON.parse(read('package.json'));
const exploreQuery = require('../../public/js/explore-query.js');

const countTag = index.match(/<h3 id="results-count"[^>]*>[\s\S]*?<\/h3>/);
if (!countTag) fail('results-count yok');
else {
  if (!/\bhidden\b/.test(countTag[0]) || !countTag[0].includes('aria-busy="true"')) {
    fail('açılışta results-count gizli/meşgul değil');
  } else ok('açılışta results-count hidden + aria-busy');
  if (!countTag[0].includes('id="resCnt"')) fail('resCnt kaybolmuş');
  else ok('resCnt duruyor');
}

if (!index.includes('id="sortSel"') || !index.includes('sortPopularity')) {
  fail('En Popüler sıralama kontrolü kaybolmuş');
} else ok('sortSel / En Popüler duruyor');

if (!/#results-count\[aria-busy="true"\]/.test(css)) {
  fail('aria-busy gizleme CSS yok');
} else ok('aria-busy visibility:hidden CSS');

if (!app.includes('function exploreHasActiveQuery') || !app.includes('exploreHasActiveQuery()')) {
  fail('exploreHasActiveQuery yok veya sayaçta kullanılmıyor');
} else ok('exploreHasActiveQuery bağlandı');

if (exploreQuery.hasExploreFilters({}) !== false) fail('boş filtre active sayılmamalı');
else ok('hasExploreFilters({}) false');
if (exploreQuery.hasExploreFilters({ sort: 'popularity' }) !== false) fail('yalnızca varsayılan sort active sayılmamalı');
else ok('sort=popularity bare browse');
if (exploreQuery.hasExploreFilters({ q: 'istanbul' }) !== true) fail('q active olmalı');
else ok('q aktif');
if (exploreQuery.hasExploreFilters({ category: 'nature' }) !== true) fail('category active olmalı');
else ok('category aktif');

const updateFn = extractFunction(app, 'updatePlacesFoundCount');
const pendingFn = extractFunction(app, 'setPlacesCountPending');
const activeFn = extractFunction(app, 'exploreHasActiveQuery');
if (!updateFn || !pendingFn || !activeFn) fail('sayaç fonksiyonları eksik');
else ok('sayaç fonksiyonları çıkarıldı');

function makeEl() {
  return {
    textContent: '0',
    hidden: false,
    attrs: {},
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k]; },
  };
}

if (updateFn && pendingFn && activeFn) {
  const nodes = {
    resCnt: makeEl(),
    'results-count': makeEl(),
  };
  nodes['results-count'].setAttribute('aria-busy', 'true');
  nodes['results-count'].hidden = true;

  const filterBox = { state: {} };
  const sandbox = {
    document: { getElementById: (id) => nodes[id] || null },
    window: {
      TL_EXPLORE_QUERY: {
        hasExploreFilters: (state) => exploreQuery.hasExploreFilters(state || {}),
      },
    },
    Number,
    filterBox,
    collectExploreFilterState() { return filterBox.state; },
    updateClearFiltersVisibility() {},
  };
  vm.runInNewContext(`
    let cardsLoaded = false;
    ${activeFn}
    ${pendingFn}
    ${updateFn}
    this.api = {
      pending: setPlacesCountPending,
      update: updatePlacesFoundCount,
      loaded(v) { cardsLoaded = v; },
      setFilters(s) { filterBox.state = s || {}; },
    };
  `, sandbox);

  sandbox.api.loaded(true);
  sandbox.api.setFilters({});
  sandbox.api.update(940);
  if (nodes.resCnt.textContent !== '940') fail('sayaç metni yazılmadı');
  else if (nodes['results-count'].attrs['aria-busy'] !== 'true' || !nodes['results-count'].hidden) {
    fail('bare browse 940 yer bulundu hâlâ görünür');
  } else ok('bare browse sayacı gizli (940)');

  sandbox.api.setFilters({ q: 'ayasofya' });
  sandbox.api.update(3);
  if (nodes['results-count'].attrs['aria-busy'] !== 'false' || nodes['results-count'].hidden) {
    fail('arama sonrası sayaç açılmadı');
  } else if (nodes.resCnt.textContent !== '3') fail('arama sayısı yanlış');
  else ok('arama/filtre sonrası sayaç görünür');

  sandbox.api.setFilters({ category: 'nature' });
  sandbox.api.update(12);
  if (nodes['results-count'].hidden) fail('kategori filtresinde sayaç gizli');
  else ok('kategori filtresinde sayaç açık');

  sandbox.api.setFilters({ sort: 'tiola' });
  sandbox.api.update(12);
  if (nodes['results-count'].hidden) fail('özel sıralama filtre sayılmalı (sort≠popularity)');
  else ok('sort=tiola sayacı açar');

  sandbox.api.setFilters({});
  sandbox.api.update(12);
  if (!nodes['results-count'].hidden) fail('filtre temizlenince sayaç kapanmadı');
  else ok('filtre temizlenince sayaç yine gizli');

  sandbox.api.pending();
  if (!nodes['results-count'].hidden || nodes['results-count'].attrs['aria-busy'] !== 'true') {
    fail('pending sayacı gizlemiyor');
  } else ok('pending sayacı gizli');
}

if (!pkg.scripts || pkg.scripts['verify:explore-count-hide'] !== 'node server/scripts/verify-explore-count-hide.js') {
  fail('package.json verify:explore-count-hide yok');
} else ok('npm run verify:explore-count-hide');

if (failed) {
  console.error(`\nFAILED: ${failed}`);
  process.exit(1);
}
console.log('\nOK');
