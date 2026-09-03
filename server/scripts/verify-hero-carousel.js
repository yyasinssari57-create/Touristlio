/**
 * [v2 YÜKSEK-1] Homepage hero carousel.
 * Usage: npm run verify:hero
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

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

console.log('verify-hero-carousel');

const html = read('public/index.html');
const css = read('public/css/style.css');
const js = read('public/js/hero-carousel.js');
const sender = read('server/lib/send-public-html.js');

const slideCount = (html.match(/class="hero-slide/g) || []).length;
if (slideCount === 5) ok('five hero slides');
else fail(`expected 5 slides, found ${slideCount}`);

if (/class="hero-slide hbg active"/.test(html)) ok('first slide is local .hbg (eager)');
else fail('first slide must be .hbg.active');

if (html.includes('class="hc"')
  && html.indexOf('class="hero-carousel"') < html.indexOf('class="hc"')
  && html.includes('data-i18n-html="heroTitle"')
  && html.includes('id="heroSearch"')
  && html.includes('quickSearch(\'İstanbul\')')) {
  ok('slogan, search, and city pills stay above the slides');
} else {
  fail('hero overlay content missing or moved');
}

if (html.includes('/js/hero-carousel.js')) ok('hero-carousel.js is loaded');
else fail('hero-carousel.js script tag missing');

if (!js.includes('INTERVAL_MS = 5000')) fail('interval is not 5000ms');
else ok('interval is 5 seconds');
if (!js.includes('visibilitychange')) fail('no pause when the tab is hidden');
else ok('pauses on visibilitychange');
if (!js.includes('prefers-reduced-motion')) fail('no reduced-motion guard');
else ok('respects prefers-reduced-motion');

if (!css.includes('transition:opacity 1.5s ease-in-out')) fail('missing 1.5s fade');
else ok('1.5s fade transition');
if (!css.includes('.hero-slide.active{opacity:1;}')) fail('active slide opacity missing');
else ok('active slide is visible');
if (!css.includes('.hov{') || !css.includes('rgba(0,0,0,.4)')) fail('readability overlay missing');
else ok('dark overlay kept for text');

if (!sender.includes('.hbg{background-image:url("${safe}") !important;}')) fail('injectHeroBackground no longer overrides first slide');
else ok('custom hero_image_url becomes the first slide');

const unsplash = [
  'photo-1499856871958-5b9627545d1a',
  'photo-1493976040374-85c8e12f0c0e',
  'photo-1552832230-c0197dd311b5',
  'photo-1570939274717-7eda259b50ed',
];
if (unsplash.every((id) => html.includes(id))) ok('Paris, Kyoto, Rome, Santorini Unsplash slides');
else fail('expected Unsplash destination slides missing');

if (failed) {
  console.error(`verify-hero-carousel FAILED (${failed})`);
  process.exit(1);
}
console.log('verify-hero-carousel OK');
