/**
 * [v2 KRİTİK-8] Heading hierarchy checks.
 * Usage: npm run verify:h1
 */
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

console.log('verify-single-h1');

const standalonePages = [
  '404.html',
  '500.html',
  'admin.html',
  'login.html',
  'profile.html',
  'register.html',
  'reset-password.html',
  'search.html',
  'verify-email.html',
  'legal/about.html',
  'legal/contact.html',
  'legal/kvkk.html',
  'legal/privacy.html',
  'legal/terms.html',
];

for (const relativePath of standalonePages) {
  const count = h1Count(fs.readFileSync(path.join(PUBLIC, relativePath), 'utf8'));
  if (count === 1) ok(`${relativePath}: exactly one h1`);
  else fail(`${relativePath}: expected one h1, found ${count}`);
}

const index = read('public/index.html');
const app = read('public/js/app.js');
const discover = read('public/js/discover-places.js');
const css = read('public/css/style.css');

if (/<h1[^>]*class="brand-name"/i.test(index) || /<h1[^>]*class="brand-name"/i.test(read('public/search.html'))) {
  fail('brand/logo text must not be an h1');
} else {
  ok('brand/logo text is not an h1');
}

if (/<h1[^>]*data-i18n-html="heroTitle"[^>]*>[\s\S]*?Hisset\.[\s\S]*?<\/h1>/i.test(index)) {
  ok('homepage slogan is the h1');
} else {
  fail('homepage slogan h1 missing');
}

if (/<h2[^>]*data-i18n="discoverPlacesTitle"[^>]*>Gezilecek Yerler<\/h2>/i.test(index)) {
  ok('Gezilecek Yerler section heading is h2');
} else {
  fail('Gezilecek Yerler section heading must be h2');
}

if (/<h2[^>]*id="blogHeroTitle"[^>]*>Seyahat[\s\S]*Hikayeleri[\s\S]*<\/h2>/i.test(index)) {
  ok('Seyahat Hikayeleri section heading is h2');
} else {
  fail('Seyahat Hikayeleri section heading must be h2');
}

if (/<h1[^>]*class="pd-title"[^>]*id="pdTitle"/i.test(index)) {
  ok('place name target is h1');
} else {
  fail('place detail title must be h1');
}

if (/<h1[^>]*class="bd-title"/i.test(app)) {
  ok('blog article title is h1');
} else {
  fail('blog article title must be h1');
}

const inactivePageIds = ['page-places', 'page-blog', 'page-detail', 'page-profile'];
for (const id of inactivePageIds) {
  const hidden = new RegExp(`<div class="page" id="${id}"[^>]*\\bhidden\\b[^>]*aria-hidden="true"`, 'i');
  if (hidden.test(index)) ok(`${id}: initially hidden and aria-hidden`);
  else fail(`${id}: missing initial hidden/aria-hidden state`);
}

const inactiveSections = ['es-map', 'es-filter', 'es-tiolas', 'es-categories'];
for (const id of inactiveSections) {
  const tag = new RegExp(`<div class="explore-section[^"]*" id="${id}"[^>]*\\bhidden\\b[^>]*aria-hidden="true"`, 'i');
  if (tag.test(index)) ok(`${id}: inactive tab hidden`);
  else fail(`${id}: inactive tab must use hidden + aria-hidden`);
}

if (app.includes('p.hidden = !active')
  && app.includes("p.setAttribute('aria-hidden', active ? 'false' : 'true')")
  && app.includes('s.hidden = !active')
  && app.includes("s.setAttribute('aria-hidden', active ? 'false' : 'true')")) {
  ok('main and explore tab switches synchronize hidden/aria-hidden');
} else {
  fail('tab switches do not synchronize hidden/aria-hidden');
}

if (app.includes('article?.setAttribute(\'hidden\', \'\')')
  && app.includes("article?.setAttribute('aria-hidden', 'true')")
  && app.includes("listing?.setAttribute('aria-hidden', 'true')")) {
  ok('blog listing/article switch synchronizes hidden/aria-hidden');
} else {
  fail('blog listing/article hidden state incomplete');
}

if (discover.includes('citiesStep.hidden = !showCities')
  && discover.includes('placesStep.hidden = showCities')) {
  ok('places city/result steps synchronize hidden');
} else {
  fail('places city/result steps do not synchronize hidden');
}

if (/\.blog-hero-card h2/.test(css) && /\.discover-hd h1,\.discover-hd h2/.test(css)) {
  ok('h2 replacements keep their visual styles');
} else {
  fail('h2 replacement styles missing');
}

if (failed) {
  console.error(`verify-single-h1 FAILED (${failed})`);
  process.exit(1);
}

console.log('verify-single-h1 OK');
