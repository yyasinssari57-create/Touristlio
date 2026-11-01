/**
 * Claude Master PRD — FAZ4-1 (H1 hiyerarşisi).
 * Usage: npm run verify:faz4-1
 *
 * PRD: sayfada 5 h1 vardı; 1'e inecek. Görünüm aynı kalacak, yalnızca
 * etiket h1 → h2/h3. Ana dalda v2 KRİTİK-8 ile kapalıydı. Bu betik o
 * sözleşmeyi kilitler. HTML/CSS/renk değiştirmez.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PUBLIC = path.join(ROOT, 'public');
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

function h1Count(html) {
  return (String(html).match(/<h1\b/gi) || []).length;
}

console.log('verify-faz4-1 (mevcut tek h1 sözleşmesi)');

const h1 = spawnSync(process.execPath, [path.join(__dirname, 'verify-single-h1.js')], {
  cwd: ROOT,
  stdio: 'inherit',
});
if (h1.status !== 0) fail('verify:h1 sözleşmesi geçmedi');
else ok('verify:h1 geçti');

const index = read('public/index.html');
const app = read('public/js/app.js');
const css = read('public/css/style.css');

if (h1Count(index) !== 1) fail(`index.html h1 sayısı ${h1Count(index)} (1 olmalı)`);
else ok('ana sayfa ilk HTML: tek h1');

if (!/<h1[^>]*data-i18n-html="heroTitle"/.test(index)) fail('tek h1 slogan değil');
else ok('tek h1 slogan (Sadece Ziyaret Etme. Hisset.)');

const demoted = [
  [/data-i18n="discoverPlacesTitle"/, 'Gezilecek Yerler'],
  [/id="blogHeroTitle"/, 'Seyahat Hikayeleri'],
  [/id="pdTitle"/, 'mekân adı'],
  [/id="filterSheetTitle"/, 'filtre başlığı'],
  [/id="discoverCityTitle"/, 'şehir başlığı'],
];
for (const [re, label] of demoted) {
  const tag = index.match(new RegExp(`<h([1-6])[^>]*${re.source}`, 'i'));
  if (!tag) fail(`${label} başlığı yok`);
  else if (tag[1] === '1') fail(`${label} hâlâ h1`);
  else ok(`${label} h${tag[1]} (h1 değil)`);
}

if (/<h1[^>]*class="brand-name"/.test(index)) fail('logo h1');
else ok('logo h1 değil');

if (!/<h3[^>]*id="results-count"/.test(index)) fail('sonuç sayacı h3 değil');
else ok('sonuç sayacı h3 (sayfa h1’i değil)');

const pages = fs.readdirSync(PUBLIC, { recursive: true })
  .filter((name) => String(name).endsWith('.html'))
  .map((name) => String(name));
for (const relativePath of pages) {
  const count = h1Count(fs.readFileSync(path.join(PUBLIC, relativePath), 'utf8'));
  if (count === 1) ok(`${relativePath}: 1 h1`);
  else fail(`${relativePath}: ${count} h1`);
}

function headingLevels(tab, articleOn) {
  return {
    hero: tab === 'explore' ? 1 : 2,
    discover: tab === 'places' ? 1 : 2,
    blogHero: tab === 'blog' && !articleOn ? 1 : 2,
    blogSr: 2,
    profile: tab === 'profile' ? 1 : 2,
    pd: tab === 'detail' ? 1 : 2,
    blogTitle: articleOn ? 1 : 2,
  };
}

const expressions = [
  "retagHeading(hero, tab === 'explore' ? 1 : 2)",
  "retagHeading(discover, tab === 'places' ? 1 : 2)",
  "retagHeading(blogHero, tab === 'blog' && !articleOn ? 1 : 2)",
  'retagHeading(blogSr, 2)',
  "retagHeading(profile, tab === 'profile' ? 1 : 2)",
  "retagHeading(pd, tab === 'detail' ? 1 : 2)",
  'retagHeading(blogTitle, articleOn ? 1 : 2)',
];
const missingExpr = expressions.filter((line) => !app.includes(line));
if (missingExpr.length) fail(`syncPageHeading kayıp: ${missingExpr.join(' | ')}`);
else ok('syncPageHeading her görünümde tek h1 bırakır');

const views = [
  ['explore', false],
  ['places', false],
  ['blog', false],
  ['blog', true],
  ['profile', false],
  ['detail', false],
];
for (const [tab, articleOn] of views) {
  const levels = Object.values(headingLevels(tab, articleOn));
  const ones = levels.filter((level) => level === 1).length;
  const label = articleOn ? 'blog-yazi' : tab;
  if (ones !== 1) fail(`${label}: ${ones} adet h1`);
  else ok(`${label}: tam 1 h1`);
}

const showMain = app.slice(app.indexOf('async function showMainTab'));
const hideAt = showMain.indexOf('p.hidden = !active');
const syncAt = showMain.indexOf('syncPageHeading(tab)');
if (hideAt === -1 || syncAt === -1 || hideAt > syncAt) {
  fail('pasif sayfa, başlık düşmeden gizlenmiyor');
} else {
  ok('sekme değişince pasif sayfa önce gizlenir');
}

const blogOpen = app.slice(app.indexOf('async function openBlogDetail'));
const titleAt = blogOpen.indexOf('<h1 class="bd-title"');
const showArticleAt = blogOpen.indexOf('showBlogArticle()');
if (titleAt === -1 || showArticleAt === -1 || titleAt > showArticleAt) {
  fail('blog yazı başlığı liste h1’i düşmeden açılıyor');
} else if (!app.includes("retagHeading(blogHero, tab === 'blog' && !articleOn ? 1 : 2)")) {
  fail('yazı açıkken liste başlığı h2 olmuyor');
} else {
  ok('blog yazısında tek h1 yazı başlığı');
}

if (!/\.blog-hero-card h1,\.blog-hero-card h2/.test(css) || !/\.discover-hd h1,\.discover-hd h2/.test(css)) {
  fail('h2’ye inen bölüm başlıklarının görünümü ayrılmış');
} else {
  ok('blog ve gezilecek yerler başlığı h1/h2 iken aynı görünür');
}

if (!/\.pd-title\{/.test(css)) fail('mekân adı görünümü etikete bağlı');
else ok('mekân adı görünümü .pd-title ile aynı kalır');

if (!/\.hero h1\{/.test(css)) fail('slogan görünümü kayıp');
else ok('slogan görünümü .hero h1 (keşfet açıkken h1)');

const exploreStart = index.indexOf('id="page-explore"');
const heroAt = index.indexOf('data-i18n-html="heroTitle"');
const nextPage = index.indexOf('class="page"', exploreStart + 1);
if (exploreStart === -1 || heroAt === -1 || heroAt > nextPage) {
  fail('slogan keşfet sayfasının dışında');
} else if (!/id="page-explore"[^>]*class="page active"|class="page active"[^>]*id="page-explore"/.test(index)) {
  fail('keşfet sayfası ilk açılışta aktif değil');
} else {
  ok('slogan yalnızca keşfet sayfasında; ilk açılışta o sayfa açık');
}

if (failed) {
  console.error(`verify-faz4-1 FAILED (${failed})`);
  process.exit(1);
}

console.log('verify-faz4-1 OK');
