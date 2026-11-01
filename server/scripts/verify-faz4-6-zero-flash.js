/**
 * Claude Master PRD — FAZ4-6 (Arama "0 yer" flaşı).
 * Usage: npm run verify:faz4-6
 *
 * PRD: Sayfa açılışında veriler gelmeden "0 yer bulundu" görünüyordu.
 * Yükleme ile boş durum ayrılacak. İskelet mevcut tasarımla duracak.
 *
 * Sayaç veri gelene kadar gizli kalır. Gerçek 0, boş listeyle birlikte
 * görünür. Renk, yerleşim ve buton yeri değişmez.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;

function ok(message) {
  console.log('  ✓', message);
}

function fail(message) {
  console.error('  ✗', message);
  failed += 1;
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

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

function sliceAround(src, marker, after) {
  const i = src.indexOf(marker);
  if (i < 0) return '';
  return src.slice(i, i + after);
}

console.log('verify-faz4-6 (arama 0 yer flaşı)');

const index = read('public/index.html');
const search = read('public/search.html');
const css = read('public/css/style.css');
const app = read('public/js/app.js');
const discover = read('public/js/discover-places.js');
const pkg = JSON.parse(read('package.json'));

const countTag = index.match(/<h3 id="results-count"[^>]*>[\s\S]*?<\/h3>/);
if (!countTag) fail('keşfet sayacı yok');
else {
  if (!countTag[0].includes('aria-busy="true"')) fail('keşfet sayacı ilk HTML’de meşgul değil');
  else ok('keşfet sayacı açılışta aria-busy');
  if (!countTag[0].includes('id="resCnt"') || !countTag[0].includes('placesFound')) {
    fail('yer bulundu sayacı kaybolmuş');
  } else ok('yer bulundu sayacı duruyor');
  if (!countTag[0].includes('aria-live="polite"')) fail('sayaç canlı bölgesi kaybolmuş');
  else ok('sayaç aria-live duruyor');
}

if (!/#results-count\[aria-busy="true"\],\.discover-count-line\[aria-busy="true"\]\{visibility:hidden;\}/.test(css)) {
  fail('meşgul sayaç gizleme kuralı yok');
} else ok('meşgul sayaç visibility:hidden (renk/punto aynı)');

if (!/\.results-bar h3\{font-family:var\(--fd\);font-size:clamp\(1rem,1\.3vw,1\.15rem\);font-weight:700;color:var\(--navy\);\}/.test(css)) {
  fail('sonuç başlığı punto/renk değişmiş');
} else ok('sonuç başlığı punto ve renk aynı');

const noRes = sliceAround(index, 'id="noRes"', 420);
if (!noRes.includes('style="display:none"') || !noRes.includes('id="noResClear"')) {
  fail('boş sonuç kutusu veya Filtreler Temizle kaybolmuş');
} else ok('boş sonuç kutusu HTML’de kapalı, buton duruyor');

if (!index.includes('TL_SKELETON.fillCards(grid, 8)')) fail('keşfet ızgarası açılış iskeleti yok');
else ok('keşfet ızgarası mevcut iskeleti basar');
if (!index.includes('id="pgrid" aria-live="polite" aria-busy="true"')) fail('pgrid açılışta meşgul değil');
else ok('pgrid açılışta yükleniyor');

const pendingFn = extractFunction(app, 'setPlacesCountPending');
const updateFn = extractFunction(app, 'updatePlacesFoundCount');
const skeletonFn = extractFunction(app, 'showGridSkeleton');
if (!pendingFn || !updateFn || !skeletonFn) fail('sayaç fonksiyonları yok');
else ok('sayaç fonksiyonları app.js içinde');

if (!app.includes('const pending = !append && !cardsLoaded && !(list && list.length);')) {
  fail('veri gelmeden ızgara boş sonuç basmamalı');
} else ok('veri gelmeden ızgara iskelette kalır');
if (!app.includes("document.getElementById('noRes').style.display = cardsLoaded && !list.length ? 'block' : 'none'")) {
  fail('boş sonuç hâlâ yükleme bayrağına bakmıyor');
} else ok('boş sonuç yalnız liste geldikten sonra');

function makeEl(text) {
  return {
    textContent: text,
    attrs: {},
    style: {},
    innerHTML: '',
    filled: false,
    setAttribute(key, value) { this.attrs[key] = value; },
    getAttribute(key) { return this.attrs[key]; },
  };
}

if (pendingFn && updateFn && skeletonFn) {
  const nodes = {
    resCnt: makeEl('0'),
    'results-count': makeEl(''),
    noRes: makeEl(''),
    osmHint: makeEl(''),
    pgrid: makeEl(''),
  };
  nodes['results-count'].setAttribute('aria-busy', 'true');
  const sandbox = {
    document: { getElementById: (id) => nodes[id] || null },
    window: { TL_SKELETON: { fillCards(el) { el.filled = true; } } },
    Number,
  };
  vm.runInNewContext(`
    let cardsLoaded = false;
    ${pendingFn}
    ${updateFn}
    ${skeletonFn}
    function updateClearFiltersVisibility() {}
    this.api = {
      pending: setPlacesCountPending,
      update: updatePlacesFoundCount,
      skeleton: showGridSkeleton,
      loaded(v) { cardsLoaded = v; },
    };
  `, sandbox);

  sandbox.api.pending();
  if (nodes['results-count'].attrs['aria-busy'] !== 'true') fail('açılış sayacı gizlenmedi');
  else ok('veri yokken sayaç meşgul');

  sandbox.api.update(12);
  if (nodes.resCnt.textContent !== '12') fail('sayaç metni yazılmadı');
  else if (nodes['results-count'].attrs['aria-busy'] !== 'true') fail('veri bayrağı yokken sayaç açıldı');
  else ok('cardsLoaded olmadan 12 de gizli');

  sandbox.api.loaded(true);
  sandbox.api.update(12);
  if (nodes['results-count'].attrs['aria-busy'] !== 'false' || nodes.resCnt.textContent !== '12') {
    fail('gelen sonuç sayacı açılmadı');
  } else ok('sonuç gelince sayaç görünür');

  nodes.resCnt.textContent = '0';
  sandbox.api.pending();
  if (nodes['results-count'].attrs['aria-busy'] !== 'true') fail('sıfır sayaç yenilemede gizlenmedi');
  else ok('0 sayaç yeni istekte gizlenir');

  nodes.resCnt.textContent = '4';
  nodes['results-count'].setAttribute('aria-busy', 'false');
  sandbox.api.pending();
  if (nodes['results-count'].attrs['aria-busy'] !== 'false') fail('dolu sayaç yenilemede gizlendi');
  else ok('dolu sayaç yenilemede yerinde kalır');

  nodes.noRes.style.display = 'block';
  sandbox.api.skeleton();
  if (nodes.noRes.style.display !== 'none') fail('iskelet boş sonuç kutusunu kapatmıyor');
  else if (!nodes.pgrid.filled) fail('iskelet kart basmıyor');
  else ok('iskelet boş sonucu kapatır ve kart basar');

  sandbox.api.update(0);
  if (nodes['results-count'].attrs['aria-busy'] !== 'false' || nodes.resCnt.textContent !== '0') {
    fail('gerçek boş liste 0 göstermiyor');
  } else ok('liste boş döndüyse 0 görünür');
}

const searchCount = search.match(/<p class="search-meta" id="results-count"[^>]*>[\s\S]*?<\/p>/);
if (!searchCount || !searchCount[0].includes('aria-busy="true"')) fail('arama sayacı açılışta meşgul değil');
else if (/>\s*0/.test(searchCount[0])) fail('arama sayacı HTML’de 0 yazıyor');
else ok('arama sayacı boş ve meşgul başlar');

if (!search.includes('TL_SKELETON.fillCards(grid, 6)')) fail('arama iskeleti yok');
else ok('arama sayfası mevcut iskeleti basar');
if (!search.includes('function setSearchCountPending') || !search.includes('function revealSearchCount')) {
  fail('arama sayaç zamanlaması yok');
} else ok('arama sayacı yanıtta açılır');

const runStart = search.indexOf('async function runSearch');
const fetchAt = search.indexOf("fetch('/api/search?'", runStart);
const pendingAt = search.indexOf('setSearchCountPending()', runStart);
const revealAt = search.indexOf('revealSearchCount(', runStart);
if (pendingAt < 0 || fetchAt < 0 || revealAt < 0 || !(pendingAt < fetchAt && fetchAt < revealAt)) {
  fail('arama sayacı istek bitmeden yazılıyor');
} else ok('arama sayacı fetch’ten sonra yazılır');

const discoverLine = index.match(/<p class="discover-count-line"[^>]*>[\s\S]*?<\/p>/);
if (!discoverLine || !discoverLine[0].includes('aria-busy="true"') || !discoverLine[0].includes('id="discoverPlaceCount"')) {
  fail('gezilecek yerler sayacı açılışta meşgul değil');
} else ok('gezilecek yerler sayacı açılışta gizli');

const loadAt = discover.indexOf('async function loadPlacesAndMap');
const loadBody = discover.slice(loadAt, discover.indexOf('async function init', loadAt));
const hideEmpty = loadBody.indexOf("empty?.style.setProperty('display', 'none')");
const fetchPlaces = loadBody.indexOf('fetchJson(');
const reveal = loadBody.indexOf('revealDiscoverCount(');
if (hideEmpty < 0 || fetchPlaces < 0 || reveal < 0 || !(hideEmpty < fetchPlaces && fetchPlaces < reveal)) {
  fail('gezilecek yerler boş kutusu yüklemede açık kalıyor');
} else ok('gezilecek yerler boş kutusu yanıtta açılır');

if (!pkg.scripts || pkg.scripts['verify:faz4-6'] !== 'node server/scripts/verify-faz4-6-zero-flash.js') {
  fail('package.json verify:faz4-6 yok');
} else ok('verify:faz4-6 script');

if (failed) {
  console.error(`verify-faz4-6: ${failed} failed`);
  process.exit(1);
}
console.log('verify-faz4-6: ok');
