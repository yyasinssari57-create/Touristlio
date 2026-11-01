/**
 * Claude Master PRD — FAZ3-2 (dinamik SEO meta şablonu).
 * Usage: node server/scripts/verify-faz3-2-seo-meta.js
 *
 * Sunucu/veritabanı gerekmez. Şablonlar, head enjeksiyonu ve istemci
 * metinlerinin aynı başlıkları kullandığını kontrol eder.
 * FAZ3-4 (arama noindex) bu script'te bilinçli olarak uygulanmaz.
 */
const fs = require('fs');
const path = require('path');
const { generateMeta, SEO_TEMPLATES, buildSeoHead, siteBaseUrl } = require('../lib/seo');

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

console.log('verify-faz3-2-seo-meta');

const homeTr = generateMeta('home', {}, 'tr');
const homeEn = generateMeta('home', {}, 'en');
const exploreTr = generateMeta('explore', {}, 'tr');
const exploreEn = generateMeta('explore', {}, 'en');

if (homeTr.title !== SEO_TEMPLATES.home.tr.title) fail('home TR title drifted');
else ok('home TR title');
if (homeEn.title !== 'Touristlio — Discover the World with Real Travelers') fail('home EN title');
else ok('home EN title');
if (exploreTr.title !== 'Gezilecek Yerler — Dünyayı Keşfet | Touristlio') fail('explore TR title');
else ok('explore TR title');
if (exploreEn.title !== 'Places to Visit — Explore the World | Touristlio') fail('explore EN title');
else ok('explore EN title');

for (const [name, meta] of [['homeTr', homeTr], ['homeEn', homeEn], ['exploreTr', exploreTr], ['exploreEn', exploreEn]]) {
  if (!meta.description || meta.description.length > 160) fail(`${name} description length ${meta.description && meta.description.length}`);
  else ok(`${name} description ≤ 160 (${meta.description.length})`);
}
if (!homeTr.description.includes('135 ülke') || !homeTr.description.includes('1.090+')) fail('home TR count copy');
else ok('home TR uses real 135 / 1.090 counts');
if (!exploreEn.description.includes('135 countries') || !exploreEn.description.includes('1,090+')) fail('explore EN count copy');
else ok('explore EN count copy');

const placeTr = generateMeta('place', {
  place: { name: 'Ayasofya', city: 'Istanbul', overview: 'A'.repeat(400), imageUrl: '/images/ayasofya.webp' },
}, 'tr');
if (placeTr.title !== 'Ayasofya | İstanbul Gezilecek Yerler — Touristlio') fail(`place TR title: ${placeTr.title}`);
else ok('place TR title with city');
if (placeTr.description.length !== 160) fail(`place description not clipped: ${placeTr.description.length}`);
else ok('place description clipped to 160');
if (placeTr.ogImage !== '/images/ayasofya.webp') fail('place ogImage');
else ok('place ogImage from imageUrl');

const placeEn = generateMeta('place', {
  place: { name: 'Hagia Sophia', city: 'Istanbul', overviewEn: 'A Byzantine landmark.' },
}, 'en');
if (placeEn.title !== 'Hagia Sophia | Things to Do in Istanbul — Touristlio') fail(`place EN title: ${placeEn.title}`);
else ok('place EN title');
if (placeEn.description !== 'A Byzantine landmark.') fail('place EN description');
else ok('place EN description prefers overviewEn');

const placeNoCity = generateMeta('place', { place: { name: 'Kale' } }, 'tr');
if (placeNoCity.title !== 'Kale — Touristlio') fail(`place without city: ${placeNoCity.title}`);
else ok('place without city omits empty city clause');

const blog = generateMeta('blog', {
  post: { title: 'Gizli İstanbul', excerpt: '<b>Kısa</b> özet', imageUrl: '/uploads/cover.webp' },
}, 'tr');
if (blog.title !== 'Gizli İstanbul — Touristlio Blog') fail(`blog title: ${blog.title}`);
else ok('blog title suffix');
if (blog.description !== 'Kısa özet') fail(`blog excerpt html not stripped: ${blog.description}`);
else ok('blog excerpt strips tags');
if (blog.ogImage !== '/uploads/cover.webp') fail('blog ogImage');
else ok('blog ogImage');

const unknown = generateMeta('nope', {}, 'tr');
if (unknown.title !== 'Touristlio' || !unknown.description.includes('Hisset')) fail('fallback meta');
else ok('unknown type fallback');

function headHas(html, needle, label) {
  if (!html.includes(needle)) fail(label);
  else ok(label);
}

const base = siteBaseUrl();
const homeHead = buildSeoHead({ pathname: '/', lang: 'tr' });
headHas(homeHead, homeTr.title, 'buildSeoHead / uses home template');
headHas(homeHead, 'name="robots" content="index,follow"', 'home robots index,follow');
headHas(homeHead, `rel="canonical" href="${base}/"`, 'home canonical');
headHas(homeHead, 'hreflang="tr"', 'home hreflang tr');
headHas(homeHead, 'hreflang="en"', 'home hreflang en');
headHas(homeHead, 'hreflang="x-default"', 'home hreflang x-default');
headHas(homeHead, 'twitter:card" content="summary_large_image"', 'home twitter card');
headHas(homeHead, 'og:locale" content="tr_TR"', 'home og:locale');
headHas(homeHead, '/images/hero.webp', 'home default og image');
if (homeHead.includes('Sadece Ziyaret Etme. Hisset.')) fail('home title still the old slogan');
else ok('home title is not the old slogan');

const exploreHead = buildSeoHead({ pathname: '/explore', lang: 'tr' });
headHas(exploreHead, exploreTr.title, 'buildSeoHead /explore uses explore template');
headHas(exploreHead, `rel="canonical" href="${base}/explore"`, 'explore canonical');
if (exploreHead.includes(homeTr.title)) fail('/explore still uses home title');
else ok('/explore title is distinct from home');

const exploreEnHead = buildSeoHead({ pathname: '/en/explore', lang: 'en' });
headHas(exploreEnHead, exploreEn.title, 'EN /explore title');
headHas(exploreEnHead, `${base}/en/explore`, 'EN explore canonical');

const searchHead = buildSeoHead({ pathname: '/search', lang: 'tr' });
if (searchHead.includes('noindex')) fail('FAZ3-4 leaked: /search is noindex');
else ok('/search stays indexable (FAZ3-4 not in this change)');
headHas(searchHead, 'Destinasyon ara — Touristlio', 'search title unchanged');

const indexJs = read('server/index.js');
if (!indexJs.includes("generateMeta('place'")) fail('place route does not call generateMeta');
else ok('place route uses generateMeta');
if (!indexJs.includes("generateMeta('blog'")) fail('blog route does not call generateMeta');
else ok('blog route uses generateMeta');

const i18n = read('public/js/i18n.js');
const appJs = read('public/js/app.js');
const indexHtml = read('public/index.html');
for (const text of [homeTr.title, homeTr.description, homeEn.title, exploreTr.title, exploreEn.title]) {
  if (!i18n.includes(text)) fail(`i18n.js missing ${text}`);
  else ok(`i18n.js has ${text.slice(0, 42)}`);
}
if (!i18n.includes('shellKindFromPath')) fail('i18n missing shellKindFromPath');
else ok('i18n shellKindFromPath');
if (!i18n.includes('if (shell) applyShellMeta(shell, lang)')) fail('apply() still overwrites every page title');
else ok('apply() only rewrites shell routes');
if (!indexHtml.includes(homeTr.title) || !indexHtml.includes(homeTr.description)) fail('static index.html fallback meta');
else ok('static index.html fallback matches home template');
if (!appJs.includes('Things to Do in') || !appJs.includes('Gezilecek Yerler — Touristlio')) {
  fail('client place title formula missing');
} else ok('client place title formula');
if (!appJs.includes('Touristlio Blog')) fail('client blog title suffix missing');
else ok('client blog title suffix');
if (!appJs.includes('applyShellMeta')) fail('showMainTab does not refresh shell meta');
else ok('showMainTab refreshes shell meta');

if (failed) {
  console.error(`verify-faz3-2-seo-meta: ${failed} failed`);
  process.exit(1);
}
console.log('verify-faz3-2-seo-meta: ok');
