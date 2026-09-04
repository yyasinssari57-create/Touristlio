/**
 * [v2 YÜKSEK-4] OG / Twitter / canonical / hreflang.
 * Usage: node server/scripts/verify-og-meta.js
 */
const fs = require('fs');
const path = require('path');
const { buildSeoHead, ogTypeFor, injectSeoHead, defaultOgImage } = require('../lib/seo');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}

console.log('verify-og-meta');

if (ogTypeFor('/') !== 'website') fail('home og:type should be website');
else ok('home og:type website');
if (ogTypeFor('/places/ayasofya-istanbul') !== 'place') fail('place og:type should be place');
else ok('place og:type place');
if (ogTypeFor('/en/places/foo') !== 'place') fail('en place og:type should be place');
else ok('/en/places og:type place');
if (ogTypeFor('/blog/my-story') !== 'article') fail('blog detail og:type should be article');
else ok('blog detail og:type article');
if (ogTypeFor('/blog') !== 'website') fail('blog list og:type should be website');
else ok('blog list og:type website');

const home = buildSeoHead({ pathname: '/', lang: 'tr' });
if (!home.includes('og:title') || !home.includes('Sadece Ziyaret Etme. Hisset.')) {
  fail('homepage og:title missing slogan');
} else ok('homepage og:title slogan');
if (!home.includes('twitter:card" content="summary_large_image"')) fail('twitter:card missing');
else ok('twitter:card summary_large_image');
if (!home.includes('twitter:image') || !home.includes('/images/hero.webp')) fail('twitter:image not hero.webp');
else ok('twitter:image hero.webp');
if (!home.includes('property="og:image"') || !home.includes('/images/hero.webp')) fail('og:image not hero.webp');
else ok('og:image hero.webp');
if (!home.includes('og:url') || !home.includes('og:type" content="website"')) fail('home og:url/type');
else ok('homepage og:url + og:type website');
if (!home.includes('hreflang="tr"') || !home.includes('hreflang="en"')) fail('hreflang missing');
else ok('hreflang tr + en');
if (!home.includes('rel="canonical"')) fail('canonical missing');
else ok('canonical present');
if (!defaultOgImage().includes('/images/hero.webp')) fail('defaultOgImage not hero.webp');
else ok('defaultOgImage is hero.webp');

const long = 'A'.repeat(400);
const place = buildSeoHead({
  pathname: '/places/ayasofya-istanbul',
  lang: 'tr',
  title: 'Ayasofya — Touristlio',
  description: long,
  image: 'https://cdn.example/photo.jpg',
});
if (!place.includes('og:type" content="place"')) fail('place head og:type not place');
else ok('place head og:type place');
if (!place.includes('Ayasofya — Touristlio')) fail('place title suffix');
else ok('place title “name — Touristlio”');
const descMatch = place.match(/property="og:description" content="([^"]*)"/);
if (!descMatch || descMatch[1].length > 160) fail(`place og:description length ${descMatch ? descMatch[1].length : 'missing'}`);
else ok('place og:description ≤ 160');
if (!place.includes('twitter:image" content="https://cdn.example/photo.jpg"')) fail('place twitter:image');
else ok('place twitter:image absolute');

const blog = buildSeoHead({
  pathname: '/blog/hidden-istanbul',
  lang: 'tr',
  title: 'Gizli İstanbul — Touristlio',
  description: 'Kısa özet.',
  image: '/uploads/cover.webp',
  ogType: 'article',
});
if (!blog.includes('og:type" content="article"')) fail('blog og:type not article');
else ok('blog og:type article');

const indexHtml = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
if (!indexHtml.includes('twitter:card') || !indexHtml.includes('/images/hero.webp')) {
  fail('static index.html missing twitter/hero OG fallback');
} else ok('static index.html OG fallback uses hero.webp');

const appJs = fs.readFileSync(path.join(ROOT, 'public', 'js', 'app.js'), 'utf8');
if (!appJs.includes("og:type']', 'place'") && !appJs.includes('og:type"], \'place\'')) {
  if (!appJs.includes("'place', { property: 'og:type' }")) fail('client place og:type missing');
  else ok('client updateSeoForPlace sets og:type place');
} else ok('client updateSeoForPlace sets og:type place');
if (!appJs.includes("'article', { property: 'og:type' }")) fail('client blog og:type missing');
else ok('client blog detail sets og:type article');

const raw = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const injected = injectSeoHead(raw, { pathname: '/', lang: 'tr' });
if ((injected.match(/property="og:title"/g) || []).length !== 1) fail('duplicate og:title after inject');
else ok('injectSeoHead strips duplicate OG tags');
if (!injected.includes('twitter:image') || !injected.includes('hero.webp')) fail('injected home twitter:image');
else ok('injected homepage twitter:image hero.webp');

if (failed) {
  console.error(`verify-og-meta: ${failed} failed`);
  process.exit(1);
}
console.log('verify-og-meta: ok');
