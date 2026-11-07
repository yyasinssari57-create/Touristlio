#!/usr/bin/env node
/**
 * V5 Adım 12 — görünümü etkileyen küçük işler (onaylı "geç"):
 * a) /explore, /gezilecek-yerler, /blog sayfa h1; / slogan aynı
 * b) .map-full min-height (masaüstü 420–520, mobil 320)
 * c) Kategori/filtre etiket envanteri (kod birleştirme YOK)
 *
 * Usage: npm run verify:v5-adim12
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');

let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) { console.error('  ✗', msg); failed += 1; }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

console.log('verify-v5-adim12-page-h1-map');

const app = read('public/js/app.js');
const i18n = read('public/js/i18n.js');
const css = read('public/css/style.css');
const index = read('public/index.html');
const discover = read('public/js/discover-places.js');
const audit = read('AUDIT_FOLLOWUPS.md');
const pkg = JSON.parse(read('package.json'));

// --- a) page h1 ---
if (!/function syncHeroPageH1\s*\(/.test(app)) {
  fail('syncHeroPageH1 yok');
} else ok('syncHeroPageH1 var');

if (!/bare\s*===\s*['"]\/explore['"]/.test(app) || !/t\(['"]explore['"]\)/.test(app)) {
  fail('/explore h1 → explore (Keşfet) yolu yok');
} else ok('/explore h1 → Keşfet/Explore');

if (!/heroTitle[\s\S]{0,80}heroTitleEm/.test(app) || !/syncHeroPageH1/.test(app)) {
  fail('/ yolu slogan geri yüklemesi yok');
} else ok('/ yolu slogan korunuyor (syncHeroPageH1)');

if (!/shell\s*===\s*['"]explore['"]/.test(i18n) || !/t\(lang,\s*['"]explore['"]\)/.test(i18n)) {
  fail('i18n.apply /explore hero h1 ayrımı yok');
} else ok('i18n.apply: /explore h1 sayfa başlığı, nav slogan ayrı');

if (!/isHeading\s*=\s*\/\^H\[1-6\]\$\/i\.test\(el\.tagName\)/.test(i18n)
  && !/\/\^H\[1-6\]\$\/i\.test\(el\.tagName\)/.test(i18n)) {
  fail('i18n heroTitle yalnız heading için sayfa başlığı kullanmıyor');
} else ok('nav .brand-slogan heroTitle slogan olarak kalır');

if (!/discoverPlacesTitle/.test(discover)
  || !/title\.textContent\s*=\s*t\(['"]discoverPlacesTitle['"]\)/.test(discover)) {
  fail('/gezilecek-yerler h1 discoverPlacesTitle kullanmıyor');
} else ok('/gezilecek-yerler h1 → Gezilecek Yerler');

if (!/id="discoverCityTitle"[^>]*data-i18n="discoverPlacesTitle"/.test(index)
  && !/data-i18n="discoverPlacesTitle"[^>]*id="discoverCityTitle"/.test(index)) {
  fail('index.html discoverCityTitle discoverPlacesTitle değil');
} else ok('index.html discoverCityTitle = Gezilecek Yerler');

if (!/id="blogHeroTitle"[\s\S]{0,80}Seyahat/.test(index)) {
  fail('blog h1/hero Seyahat Hikayeleri yok');
} else ok('/blog liste başlığı Seyahat Hikayeleri');

if (!/retagHeading\(blogHero,\s*tab === 'blog' && !articleOn \? 1 : 2\)/.test(app)) {
  fail('blog listesinde blogHero h1 değil');
} else ok('blog listesinde blogHero h1');

if (!/<h1[^>]*data-i18n-html="heroTitle"/.test(index)
  || !/Sadece Ziyaret Etme/.test(index)) {
  fail('ana sayfa (/) ilk HTML slogan h1 kayıp');
} else ok('ana sayfa (/) ilk HTML slogan h1 duruyor');

// --- b) map min-height ---
const mapBlock = css.match(/\.map-full\{[^}]+\}/);
if (!mapBlock) {
  fail('.map-full kuralı yok');
} else {
  const rule = mapBlock[0];
  const min = rule.match(/min-height:\s*(\d+)px/);
  if (!min) fail('.map-full min-height yok');
  else {
    const px = Number(min[1]);
    if (px < 420 || px > 520) fail(`.map-full min-height ${px}px (420–520 beklenir)`);
    else ok(`.map-full masaüstü min-height ${px}px`);
  }
}

if (!/@media\(max-width:900px\)\{[^}]*\.map-full\{min-height:\s*320px;height:55vh;\}/.test(css)
  && !/\.map-full\{min-height:\s*320px;height:55vh;\}/.test(css)) {
  fail('mobil .map-full min-height 320px değil');
} else ok('mobil .map-full min-height 320px');

// --- c) category inventory (no merge code this step) ---
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

const buildFn = extractFunction(app, 'buildExploreFiltersHtml');
const navKeyFn = extractFunction(app, 'navLabelKey');
const faceFn = extractFunction(app, 'categoryNavFaceDuplicate');
const groupStart = app.indexOf('const GROUP_I18N = {');
const groupEnd = app.indexOf('};', groupStart);
const groupSrc = groupStart >= 0 && groupEnd > groupStart ? app.slice(groupStart, groupEnd + 2) : '';

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

if (!buildFn || !navKeyFn || !faceFn || !groupSrc) {
  fail('filtre çubuğu fonksiyonları okunamadı');
} else {
  const sandbox = {
    activeFilterGroup: 'all',
    activeCat: 'all',
    lang: 'tr',
    categoryMeta: { groups: baseGroups, categories: baseCategories },
    t: (key) => labels.tr[key] || key,
    escapeHtml: (value) => String(value),
  };
  vm.runInNewContext(`
    ${groupSrc}
    ${navKeyFn}
    ${faceFn}
    ${buildFn}
    this.html = buildExploreFiltersHtml();
  `, sandbox);
  const texts = [];
  const re = /<button[^>]*>([\s\S]*?)<\/button>/g;
  let m;
  while ((m = re.exec(sandbox.html))) {
    texts.push(m[1].replace(/\s+/g, ' ').trim());
  }
  console.log('  · filtre çubuğu (TR örnek katalog):');
  texts.forEach((label, i) => console.log(`    ${i + 1}. ${label}`));

  const stems = texts.map((label) => String(label)
    .replace(/[^\p{L}\p{N}-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/(ler|lar|s)$/u, ''));
  const dup = stems.filter((s, i) => s && stems.indexOf(s) !== i);
  if (dup.length) {
    console.log('  · tekrarlayan kökler:', [...new Set(dup)].join(', '));
  } else {
    ok('örnek katalogda çubuk yüzü tekrarı yok (FAZ4-7 kuralı)');
  }

  // Full category face list (cards / raw) — for Yasin decision, no code merge this step
  console.log('  · ham kategori etiketleri (kart/şerit adayı):');
  baseCategories.forEach((c, i) => {
    console.log(`    ${i + 1}. ${c.icon || ''} ${c.nameTr} (${c.slug})`.trim());
  });
  console.log('  · grup etiketleri:');
  baseGroups.forEach((g, i) => {
    console.log(`    ${i + 1}. ${labels.tr['grp' + g[0].toUpperCase() + g.slice(1)] || g} (${g})`);
  });
}

if (!/Adım 12|ADIM 12/.test(audit) || !/kategori|filtre/i.test(audit.slice(0, 2500))) {
  fail('AUDIT_FOLLOWUPS Adım 12 kategori envanteri yok');
} else ok('AUDIT_FOLLOWUPS Adım 12 envanter notu var');

// Guard: this step must not invent a new merge beyond FAZ4-7 helpers
if (/function mergeCategor/.test(app) || /adim12.*merge/i.test(app)) {
  fail('Adım 12 kategori birleştirme kodu eklenmiş (onaysız)');
} else ok('Adım 12 yeni kategori birleştirme kodu yok');

if (pkg.scripts?.['verify:v5-adim12'] !== 'node server/scripts/verify-v5-adim12.js') {
  fail('package.json verify:v5-adim12 eksik');
} else ok('npm run verify:v5-adim12 tanımlı');

// Keep FAZ4-1 single-h1 contract green
const faz41 = spawnSync(process.execPath, [path.join(__dirname, 'verify-faz4-1-h1.js')], {
  cwd: ROOT,
  stdio: 'inherit',
});
if (faz41.status !== 0) fail('verify:faz4-1 bozuldu');
else ok('verify:faz4-1 hâlâ OK');

if (failed) {
  console.error(`verify-v5-adim12 FAILED (${failed})`);
  process.exit(1);
}
console.log('verify-v5-adim12 OK');
