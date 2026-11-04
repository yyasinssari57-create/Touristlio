/**
 * V4 Adım 9 — ham HTML denetçisi.
 * Prerender eklenmez. Kabuk boş kalır. Onaylı sonraki adım bu kontrolleri günceller.
 * Usage: node server/scripts/verify-v4-adim9-bot-html.js
 */
const fs = require('fs');
const path = require('path');
const audit = require('./audit-bot-html');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;

function ok(msg) {
  console.log('  ✓', msg);
}
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

console.log('verify-v4-adim9-bot-html');

const src = read('server/scripts/audit-bot-html.js');
if (/\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER)\b/.test(src)) fail('denetim betiği yazma ifadesi içeriyor');
else ok('denetim betiği veritabanına yazmaz');
if (!src.includes("path.join(ROOT, 'reports')")) fail('rapor reports/ dışına yazabilir');
else ok('rapor yalnızca reports/ içine yazılır');
if (src.includes('sendPublicHtml') || src.includes('res.send')) fail('denetim betiği HTML basıyor');
else ok('denetim betiği sayfa basmaz');

const gitignore = read('.gitignore');
if (!/^reports\/$/m.test(gitignore)) fail('reports/ .gitignore içinde yok');
else ok('reports/ depoya girmez');

const pkg = JSON.parse(read('package.json'));
if (pkg.scripts['audit:bot-html'] !== 'node server/scripts/audit-bot-html.js') {
  fail('package.json audit:bot-html yok');
} else ok('package.json audit:bot-html');
if (pkg.scripts['verify:v4-adim9'] !== 'node server/scripts/verify-v4-adim9-bot-html.js') {
  fail('package.json verify:v4-adim9 yok');
} else ok('package.json verify:v4-adim9');

const sample = `<!doctype html><html><head>
<title>Örnek — Touristlio</title>
<meta name="description" content="Kısa açıklama."/>
<meta name="robots" content="index,follow"/>
<link rel="canonical" href="https://www.touristlio.com/places/ornek" />
<link rel="alternate" hreflang="tr" href="https://www.touristlio.com/places/ornek" />
<link rel="alternate" hreflang="en" href="https://www.touristlio.com/en/places/ornek" />
<link rel="alternate" hreflang="x-default" href="https://www.touristlio.com/places/ornek" />
<script type="application/ld+json">{"@context":"https://schema.org","@type":"TouristAttraction","name":"Örnek","description":"Uzun metin"}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage"}</script>
</head><body>
<main>
<div class="page active" id="page-explore" aria-hidden="false">
<h1>Sadece Ziyaret Etme.<br><em>Hisset.</em></h1>
<h3><span id="resCnt">0</span> <span>yer bulundu</span></h3>
<div class="pgrid" id="pgrid"></div>
</div>
<div class="page" id="page-blog" hidden aria-hidden="true"><div class="blog-grid" id="blogGrid"></div></div>
<div class="page" id="page-detail" hidden aria-hidden="true">
<h2 class="pd-title" id="pdTitle"></h2>
<p id="pdOverview" class="pd-text"></p>
<p id="pdHist" class="pd-text"></p>
<div id="blogDetailBody"></div>
</div>
<a href="/">Touristlio</a>
<a href="/places/ornek">Örnek yer</a>
<a href="https://www.touristlio.com/en/places/ornek-en">EN</a>
<a href="/blog/bir-yazi">Yazı</a>
<a href="/legal/about.html">Hakkımızda</a>
</main></body></html>`;

const parsed = audit.inspectHtml(sample, 'https://www.touristlio.com/places/ornek');
if (parsed.title !== 'Örnek — Touristlio') fail(`title: ${parsed.title}`);
else ok('title okunur');
if (parsed.description !== 'Kısa açıklama.') fail('description okunmadı');
else ok('description okunur');
if (parsed.robots !== 'index,follow') fail('robots okunmadı');
else ok('robots okunur');
if (parsed.canonical !== 'https://www.touristlio.com/places/ornek') fail('canonical okunmadı');
else ok('canonical okunur');
if (parsed.hreflang.length !== 3) fail(`hreflang ${parsed.hreflang.length}`);
else ok('üç hreflang');
if (parsed.h1Count !== 1 || parsed.h1[0] !== 'Sadece Ziyaret Etme. Hisset.') {
  fail(`h1: ${parsed.h1.join(' | ')}`);
} else ok('tek h1, etiketler metne karışmaz');
if (parsed.jsonLdTypes.join(',') !== 'TouristAttraction,FAQPage') fail(`jsonld ${parsed.jsonLdTypes}`);
else ok('JSON-LD türleri');
if (parsed.placeAnchorCount !== 2) fail(`mekân linki ${parsed.placeAnchorCount}`);
else ok('göreli ve tam mekân adresi sayılır');
if (parsed.blogArticleAnchorCount !== 1) fail(`blog linki ${parsed.blogArticleAnchorCount}`);
else ok('yazı linki sayılır');
if (!parsed.pgridEmpty || !parsed.blogGridEmpty || !parsed.placeTitleEmpty || !parsed.placeOverviewEmpty) {
  fail('boş kutular dolu sayıldı');
} else ok('boş liste ve boş mekân gövdesi');
if (parsed.resCnt !== '0') fail(`sayaç ${parsed.resCnt}`);
else ok('sayaç 0');
if (parsed.visibleSection !== 'page-explore') fail(`görünen ${parsed.visibleSection}`);
else ok('açık bölüm keşfet');
if (!audit.isPlaceHref('/places/ayasofya-istanbul')) fail('göreli mekân yolu kaçtı');
else ok('göreli mekân yolu');
if (audit.isPlaceHref('/places') || audit.isPlaceHref('/legal/about.html')) fail('mekân olmayan yol sayıldı');
else ok('mekân olmayan yol sayılmaz');
if (audit.contentNote('home', { pgridEmpty: true, placeAnchorCount: 0 }).includes('JS')) ok('ana sayfa notu JS der');
else fail('ana sayfa notu');
if (!audit.contentNote('place', { placeTitleEmpty: false, placeOverviewEmpty: false }).includes('dolu')) {
  fail('dolu mekân notu');
} else ok('dolu mekân notu');

const shell = read('public/index.html');
const shellPage = audit.inspectHtml(shell, 'file://index.html');
if (shellPage.placeAnchorCount !== 0) fail('index.html içinde mekân linki var');
else ok('index.html içinde <a href="/places/..."> yok');
if (shellPage.blogArticleAnchorCount !== 0) fail('index.html içinde yazı linki var');
else ok('index.html içinde yazı linki yok');
if (!shellPage.pgridEmpty || !shellPage.blogGridEmpty || !shellPage.placeOverviewEmpty || !shellPage.placeTitleEmpty) {
  fail('kabuk listesi veya mekân gövdesi dolu');
} else ok('kabukta liste ve mekân gövdesi boş');
if (shellPage.h1Count !== 1) fail(`kabuk h1 ${shellPage.h1Count}`);
else ok('kabukta tek h1');
if (shellPage.resCnt !== '0') fail('kabuk sayacı 0 değil');
else ok('kabuk sayacı 0 yer');
if (shellPage.visibleSection !== 'page-explore') fail('kabukta açık bölüm keşfet değil');
else ok('kabukta açık bölüm keşfet');

const server = read('server/index.js');
if (!server.includes("sendPublicHtml(res, PUBLIC_DIR, 'index.html')")) fail('ana sayfa index.html basmıyor');
else ok('ana sayfa index.html');
if (!/app\.get\('\/places\/:slug'[\s\S]*sendPublicHtml\(res, PUBLIC_DIR, 'index.html'/.test(server)) {
  fail('mekân adresi index.html basmıyor');
} else ok('mekân adresi aynı index.html');
if (!/app\.get\('\/blog'[\s\S]*sendPublicHtml\(res, PUBLIC_DIR, 'index.html'/.test(server)) {
  fail('blog adresi index.html basmıyor');
} else ok('blog adresi aynı index.html');
if (read('server/lib/send-public-html.js').includes('id="pdOverview"') || server.includes('id="pgrid"')) {
  fail('sunucu gövdeye yer listesi veya mekân metni basıyor');
} else ok('sunucu gövdeye yer listesi veya mekân metni basmıyor');

const cards = read('public/js/app.js');
if (!cards.includes('class="pc" tabindex="0" role="link"')) fail('keşfet kartı div değil');
else ok('JS sonrası keşfet kartı hâlâ div, gerçek link değil');

if (failed) {
  console.error(`\n${failed} kontrol tutmadı`);
  process.exit(1);
}
console.log('\nV4 Adım 9 denetçisi tamam');
