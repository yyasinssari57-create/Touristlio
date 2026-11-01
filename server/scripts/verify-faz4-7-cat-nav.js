/**
 * Claude Master PRD — FAZ4-7 (Kategori navigasyonu tekrarı).
 * Usage: npm run verify:faz4-7
 *
 * PRD: Doğa, Tarihi, Müze iki kez görünüyordu.
 * Çubukta tekrarlayan çip kalkar. Kalan çiplerin sınıfı ve sırası durur.
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

function buttons(html) {
  const out = [];
  const re = /<button type="button" class="([^"]*)" data-kind="([^"]*)" data-filter="([^"]*)"[^>]*>([\s\S]*?)<\/button>/g;
  let match;
  while ((match = re.exec(html))) {
    out.push({
      className: match[1],
      kind: match[2],
      filter: match[3],
      text: match[4].replace(/\s+/g, ' ').trim(),
    });
  }
  return out;
}

function countStem(list, stem) {
  return list.filter((btn) => btn.text.toLocaleLowerCase('tr-TR').includes(stem)).length;
}

console.log('verify-faz4-7 (kategori navigasyonu tekrarı)');

const app = read('public/js/app.js');
const css = read('public/css/style.css');
const index = read('public/index.html');
const discover = read('public/js/discover-places.js');
const pkg = JSON.parse(read('package.json'));

const navKeyFn = extractFunction(app, 'navLabelKey');
const faceFn = extractFunction(app, 'categoryNavFaceDuplicate');
const buildFn = extractFunction(app, 'buildExploreFiltersHtml');
const cardsFn = extractFunction(app, 'renderCategoryCards');
if (!navKeyFn || !faceFn || !buildFn) fail('çubuk birleştirme fonksiyonları yok');
else ok('çubuk birleştirme fonksiyonları app.js içinde');

const groupStart = app.indexOf('const GROUP_I18N = {');
const groupEnd = app.indexOf('};', groupStart);
const groupSrc = groupStart >= 0 && groupEnd > groupStart ? app.slice(groupStart, groupEnd + 2) : '';
if (!groupSrc.includes("historical: 'grpHistorical'") || !groupSrc.includes("museums: 'grpMuseums'")) {
  fail('grup etiket eşlemesi kaybolmuş');
} else ok('grup etiket eşlemesi duruyor');

const labels = {
  tr: {
    all: 'Tümü',
    grpHistorical: '🏛️ Tarihi',
    grpNature: '⛰️ Doğa',
    grpMuseums: '🏺 Müzeler',
    grpRestaurants: '🍽️ Yeme-İçme',
    grpHotels: '🏨 Oteller',
    grpActivities: '🎯 Aktiviteler',
  },
  en: {
    all: 'All',
    grpHistorical: '🏛️ Historic',
    grpNature: '⛰️ Nature',
    grpMuseums: '🏺 Museums',
    grpRestaurants: '🍽️ Food & drink',
    grpHotels: '🏨 Hotels',
    grpActivities: '🎯 Activities',
  },
};

const baseCategories = [
  { slug: 'landmark', nameTr: 'Simge yapı', nameEn: 'Landmark', icon: '🏛️' },
  { slug: 'museum', nameTr: 'Müze', nameEn: 'Museum', icon: '🏺' },
  { slug: 'nature', nameTr: 'Doğa', nameEn: 'Nature', icon: '⛰️' },
  { slug: 'beach', nameTr: 'Plaj', nameEn: 'Beach', icon: '🏖️' },
  { slug: 'historical', nameTr: 'Tarihi', nameEn: 'Historical', icon: '📜' },
  { slug: 'religious', nameTr: 'Dini', nameEn: 'Religious', icon: '🕌' },
  { slug: 'restaurant', nameTr: 'Restoran', nameEn: 'Restaurant', icon: '🍽️' },
  { slug: 'viewpoint', nameTr: 'Manzara', nameEn: 'Viewpoint', icon: '👁️' },
  { slug: 'adventure', nameTr: 'Macera', nameEn: 'Adventure', icon: '🧗' },
  { slug: 'food', nameTr: 'Yemek', nameEn: 'Food', icon: '🍴' },
  { slug: 'entertainment', nameTr: 'Eğlence', nameEn: 'Entertainment', icon: '🎭' },
];

const baseGroups = ['historical', 'nature', 'museums', 'restaurants', 'activities'];

function render(locale, meta) {
  const sandbox = {
    activeFilterGroup: 'all',
    activeCat: 'all',
    lang: locale,
    categoryMeta: meta,
    t: (key) => labels[locale][key] || key,
    escapeHtml: (value) => String(value),
  };
  vm.runInNewContext(`
    ${groupSrc}
    ${navKeyFn}
    ${faceFn}
    ${buildFn}
    this.html = buildExploreFiltersHtml();
  `, sandbox);
  return buttons(sandbox.html);
}

if (buildFn) {
  const tr = render('tr', { groups: baseGroups, categories: baseCategories });
  const filters = tr.map((btn) => `${btn.kind}:${btn.filter}`);
  const expected = [
    'all:all',
    'group:historical',
    'group:nature',
    'group:museums',
    'group:restaurants',
    'group:activities',
    'cat:landmark',
    'cat:beach',
    'cat:religious',
    'cat:restaurant',
    'cat:viewpoint',
    'cat:adventure',
    'cat:food',
    'cat:entertainment',
  ];
  if (filters.join('|') !== expected.join('|')) fail(`TR çubuk sırası: ${filters.join(', ')}`);
  else ok('TR çubuk: gruplar durur, tekrarlayan kategori çipi yok, kalan sıra aynı');

  if (countStem(tr, 'tarihi') !== 1) fail(`Tarihi ${countStem(tr, 'tarihi')} kez`);
  else ok('Tarihi bir kez');
  if (countStem(tr, 'doğa') !== 1) fail(`Doğa ${countStem(tr, 'doğa')} kez`);
  else ok('Doğa bir kez');
  if (countStem(tr, 'müze') !== 1) fail(`Müze ${countStem(tr, 'müze')} kez`);
  else ok('Müze bir kez');

  const dupClass = tr.filter((btn) => btn.kind === 'cat' && ['historical', 'nature', 'museum'].includes(btn.filter));
  if (dupClass.length) fail('tekrarlayan kategori çipi hâlâ basılıyor');
  else ok('historical, nature, museum kategori çipi çubukta yok');

  tr.forEach((btn) => {
    if (btn.kind === 'group' && btn.className !== 'fpill fpill-group') fail(`grup sınıfı değişti: ${btn.className}`);
    if (btn.kind === 'cat' && btn.className !== 'fpill fpill-cat') fail(`kategori sınıfı değişti: ${btn.className}`);
  });
  if (tr[0].className !== 'fpill on') fail('Tümü çipi sınıfı değişti');
  else ok('kalan çipler aynı fpill sınıfında');

  const en = render('en', { groups: baseGroups, categories: baseCategories });
  const enCatDupes = en.filter((btn) => btn.kind === 'cat' && ['museum', 'nature', 'historical'].includes(btn.filter));
  if (enCatDupes.length) fail('EN Historic/Nature/Museum kategori çipi duruyor');
  else if (!en.some((btn) => btn.kind === 'group' && btn.filter === 'historical' && /historic/i.test(btn.text))) {
    fail('EN Historic grup çipi yok');
  } else if (!en.some((btn) => btn.kind === 'cat' && btn.filter === 'landmark')) {
    fail('EN Landmark çipi kayboldu');
  } else if (!en.some((btn) => btn.kind === 'cat' && btn.filter === 'food')) {
    fail('EN Food çipi Yeme-İçme ile birleşmiş');
  } else ok('EN Historic, Nature, Museums bir kez; Food ve Landmark durur');

  const renamed = render('tr', {
    groups: baseGroups,
    categories: baseCategories.map((c) => (
      c.slug === 'museum' ? { ...c, nameTr: 'Sanat Müzesi', nameEn: 'Art museum' } : c
    )),
  });
  if (!renamed.some((btn) => btn.kind === 'cat' && btn.filter === 'museum' && btn.text.includes('Sanat Müzesi'))) {
    fail('adı çakışmayan müze kategorisi silindi');
  } else if (countStem(renamed.filter((btn) => btn.kind === 'group'), 'müze') !== 1) {
    fail('Müzeler grup çipi kayboldu');
  } else ok('Sanat Müzesi çubukta durur');

  const noMuseumGroup = render('tr', {
    groups: baseGroups.filter((g) => g !== 'museums'),
    categories: baseCategories,
  });
  if (!noMuseumGroup.some((btn) => btn.kind === 'cat' && btn.filter === 'museum')) {
    fail('grup yokken Müze kategorisi de silindi');
  } else ok('Müzeler grubu yoksa Müze çipi durur');

  const duplicateLabel = render('tr', {
    groups: ['nature'],
    categories: [
      { slug: 'nature', nameTr: 'Doğa', nameEn: 'Nature', icon: '⛰️' },
      { slug: 'forest', nameTr: 'Doğa', nameEn: 'Nature', icon: '🌲' },
      { slug: 'beach', nameTr: 'Plaj', nameEn: 'Beach', icon: '🏖️' },
    ],
  });
  if (countStem(duplicateLabel, 'doğa') !== 1) fail('aynı Doğa adı iki çipte');
  else if (!duplicateLabel.some((btn) => btn.filter === 'beach')) fail('Plaj aynı ad kuralında silindi');
  else ok('aynı adlı ikinci çip birleşir, Plaj durur');
}

const cardsBody = cardsFn || '';
if (!cardsBody.includes('(categoryMeta.categories || []).map') || cardsBody.includes('categoryNavFaceDuplicate') || cardsBody.includes('navLabelKey')) {
  fail('kategori kartları çubuk tekrarıyla birlikte filtreleniyor');
} else ok('kategori kartları tüm kategorileri basar');

if (!discover.includes('discoverCats.map') || discover.includes('navLabelKey') || discover.includes('categoryNavFaceDuplicate')) {
  fail('gezilecek yerler şeridi bu turda değişmiş');
} else ok('gezilecek yerler şeridi tek liste, grup tekrarı yok');

const renderFilters = extractFunction(app, 'renderExploreFilters');
if (!renderFilters || !renderFilters.includes('discoverFilterStrip') || !renderFilters.includes('mapFilterStrip') || !renderFilters.includes('buildExploreFiltersHtml()')) {
  fail('keşfet ve harita aynı çubuğu basmıyor');
} else ok('keşfet ve harita aynı çubuk HTML’ini kullanır');

if (!index.includes('id="discoverFilterStrip"') || !index.includes('id="mapFilterStrip"') || !index.includes('class="explore-filter-strip"')) {
  fail('filtre çubuğu HTML’i kaybolmuş');
} else ok('filtre çubuğu yerinde');

if (!/\.fpill\{display:flex;align-items:center;gap:3px;padding:6px 13px;border-radius:100px;white-space:nowrap;cursor:pointer;font-size:\.75rem;font-weight:600;border:1\.5px solid var\(--l2\);color:var\(--t2\);background:var\(--w\);transition:all \.2s;flex-shrink:0;\}/.test(css)) {
  fail('.fpill ölçü veya renk değişmiş');
} else ok('.fpill ölçü ve renk aynı');
if (!/\.fpill:hover\{border-color:var\(--brand-accent\);color:var\(--navy\);\}/.test(css)) fail('.fpill hover değişmiş');
else ok('.fpill hover aynı');
if (!/\.fpill\.on\{background:var\(--b\);color:#fff;border-color:var\(--b\);\}/.test(css)) fail('.fpill.on değişmiş');
else ok('.fpill seçili hali aynı');
if (!/\.explore-filter-strip\{display:flex;gap:6px;flex-wrap:wrap;align-items:center;\}/.test(css)) {
  fail('çubuk yerleşimi değişmiş');
} else ok('çubuk yerleşimi aynı');

if (!pkg.scripts || pkg.scripts['verify:faz4-7'] !== 'node server/scripts/verify-faz4-7-cat-nav.js') {
  fail('package.json verify:faz4-7 yok');
} else ok('verify:faz4-7 script');

if (app.includes('Ayasofya') && app.includes('FAZ4-8')) fail('FAZ4-8 bu turda açılmış');
else ok('FAZ4-8 bu turda yok');

if (failed) {
  console.error(`verify-faz4-7: ${failed} failed`);
  process.exit(1);
}
console.log('verify-faz4-7: ok');
