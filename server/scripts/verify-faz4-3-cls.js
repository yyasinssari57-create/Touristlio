/**
 * Claude Master PRD — FAZ4-3 (CLS / görsel kayma).
 * Usage: npm run verify:faz4-3
 *
 * PRD: Görsellere width/height eklenecek. Kart ve blog görselleri
 * için aspect-ratio CSS. Tasarım bozulmayacak; yalnızca yükleme
 * sırasında kayma önlenecek.
 *
 * Ana dalda bu zaten kapalıydı (v2 YÜKSEK-3 + FAZ2-3). Blog kartı
 * 16/9 aspect-ratio değil, sabit yükseklik kullanır: kutu resim
 * gelmeden kesinleşir ve kart oranı değişmez. Bu betik o sözleşmeyi
 * kilitler. Renk, yerleşim ve buton değiştirmez.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

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

function cssRules(css) {
  const rules = [];
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = re.exec(clean))) {
    const selectors = match[1].trim();
    if (!selectors || selectors.startsWith('@')) continue;
    rules.push({ selectors, body: match[2].replace(/\s+/g, '') });
  }
  return rules;
}

function selectorHits(selectors, needle) {
  return selectors.split(',').some((part) => part.trim() === needle);
}

function ruleBody(rules, needle) {
  const hits = rules.filter((rule) => selectorHits(rule.selectors, needle));
  return hits.map((rule) => rule.body).join(';');
}

function walkHtml(dir, prefix) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (name === 'vendor' || name === 'images') continue;
    const abs = path.join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) out.push(...walkHtml(abs, rel));
    else if (name.endsWith('.html')) out.push(rel);
  }
  return out;
}

console.log('verify-faz4-3 (görsel kayma sözleşmesi)');

const css = read('public/css/style.css') + '\n' + read('public/css/inline-overrides.css');
const rules = cssRules(css);

const pc = ruleBody(rules, '.pc-img');
if (!/aspect-ratio:4\/3/.test(pc)) fail('.pc-img aspect-ratio 4/3 yok');
else ok('.pc-img aspect-ratio 4/3 (mekân kartı kutusu)');

const pcImg = ruleBody(rules, '.pc-img img');
if (!/aspect-ratio:4\/3/.test(pcImg) || !/height:100%/.test(pcImg) || !/object-fit:cover/.test(pcImg)) {
  fail('.pc-img img 4/3 + cover + height 100% değil');
} else ok('.pc-img img aspect-ratio 4/3, kutu dolu');

const sk = ruleBody(rules, '.pc.sk .pc-img.sk-block');
if (!/aspect-ratio:4\/3/.test(sk)) fail('iskelet mekân kartı 4/3 ayırmıyor');
else ok('iskelet mekân kartı da 4/3 ayırır');

const feat = ruleBody(rules, '.bcard.feat .bimg');
const rest = ruleBody(rules, '.bcard:not(.feat) .bimg');
const bimg = ruleBody(rules, '.bimg');
if (!/width:100%/.test(bimg)) fail('.bimg width 100% değil');
else if (!/height:380px/.test(feat)) fail('öne çıkan blog kartı yüksekliği 380px değil');
else if (!/height:165px/.test(rest)) fail('diğer blog kartı yüksekliği 165px değil');
else ok('blog kartı sabit yükseklik (öne çıkan 380px, diğer 165px)');

const bimgAuto = rules.filter((rule) => {
  const sel = rule.selectors.split(',').map((part) => part.trim());
  const hitsBimg = sel.some((part) => part === '.bimg' || part.endsWith(' .bimg') || part.includes('.bimg'));
  return hitsBimg && /height:auto(!important)?/.test(rule.body);
});
if (bimgAuto.length) fail(`.bimg yüksekliğini auto yapan kural: ${bimgAuto.map((rule) => rule.selectors).join(' | ')}`);
else ok('blog kartı yüksekliğini auto yapan kural yok');

const cover = ruleBody(rules, '.blog-detail-box .bd-cover');
if (!/height:220px/.test(cover) || !/width:100%/.test(cover) || !/object-fit:cover/.test(cover)) {
  fail('blog yazı kapağı 220px ayırmıyor');
} else ok('blog yazı kapağı height 220px (kayma yok, oran değişmedi)');

const hero = ruleBody(rules, '.hero');
if (!/min-height:100vh/.test(hero)) fail('.hero min-height 100vh yok');
else ok('.hero min-height 100vh (arka plan görseli kutuyu şişirmez)');

const heightAuto = rules.filter((rule) => selectorHits(rule.selectors, 'img,video') || selectorHits(rule.selectors, 'img'));
const importantAuto = heightAuto.filter((rule) => /height:auto!important/.test(rule.body));
if (importantAuto.length) fail('img { height:auto !important } kart yüksekliğini ezer');
else ok('genel img height:auto önemli değil; kart yüksekliği kazanır');

const indexHtml = read('public/index.html');
if (!/class="blog-detail-box blog-detail-page"/.test(indexHtml)) {
  fail('blog yazı kutusu blog-detail-box sınıfını taşımıyor');
} else ok('blog yazı kutusu kapak yüksekliği kuralına bağlı');
if (!indexHtml.includes('rel="preload" as="image" href="/images/hero.webp"') || !indexHtml.includes('fetchpriority="high"')) {
  fail('hero ön yüklemesi yok');
} else ok('hero görseli CSS + preload; sayfa kaydıran <img> değil');

const imgJs = read('public/js/img.js');
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(imgJs, sandbox, { filename: 'public/js/img.js' });
const tag = sandbox.window.TL_IMG && sandbox.window.TL_IMG.tag;
if (typeof tag !== 'function') fail('TL_IMG.tag yok');
else {
  const card = tag('https://images.unsplash.com/photo-abc', { alt: 'Ayasofya', kind: 'card', className: 'bimg' });
  const detail = tag('/uploads/kapak.webp', { alt: 'Yazı', kind: 'detail', className: 'bd-cover' });
  const thumb = tag('/uploads/kucuk.webp', { alt: 'Küçük', kind: 'thumb' });
  const empty = tag('', { kind: 'card' });
  if (!/width="400"/.test(card) || !/height="300"/.test(card) || !/class="bimg"/.test(card) || !/loading="lazy"/.test(card)) {
    fail(`kart görseli width/height üretmiyor: ${card}`);
  } else ok('TL_IMG kart: width 400, height 300, lazy');
  if (!/width="1200"/.test(detail) || !/height="800"/.test(detail) || !/class="bd-cover"/.test(detail)) {
    fail(`blog kapak width/height üretmiyor: ${detail}`);
  } else ok('TL_IMG detay: width 1200, height 800');
  if (!/width="96"/.test(thumb) || !/height="72"/.test(thumb)) fail(`küçük görsel boyutsuz: ${thumb}`);
  else ok('TL_IMG küçük görsel: width 96, height 72');
  if (empty !== '') fail('boş adres görsel etiketi basıyor');
  else ok('boş adres etiket basmaz');
}

const app = read('public/js/app.js');
const responsive = app.slice(app.indexOf('function responsiveImg'), app.indexOf('let user ='));
if (!responsive.includes("width=\"${dim.width}\"") || !responsive.includes('height="${dim.height}"') || !responsive.includes("kind === 'card'")) {
  fail('responsiveImg yedek yolu kart boyutu basmıyor');
} else ok('responsiveImg yedeği de width/height basar');

function sliceFn(source, name, nextName) {
  const start = source.indexOf(`function ${name}`);
  const end = nextName ? source.indexOf(`function ${nextName}`, start + 1) : source.length;
  return start === -1 ? '' : source.slice(start, end === -1 ? source.length : end);
}

const blogCard = sliceFn(app, 'renderBlog', 'setBlogCat');
if (!blogCard.includes("className: 'bimg'") || !blogCard.includes("kind: 'card'")) {
  fail('blog kartı bimg + kind card kullanmıyor');
} else ok('blog kartı görseli .bimg ve kart boyutu');

const homeCards = app.includes('class="pc-img"') && app.includes("kind: 'card'");
if (!homeCards) fail('mekân kartı .pc-img + kind card değil');
else ok('mekân kartı .pc-img içinde kart boyutu');

const tiolaPhoto = sliceFn(app, 'renderTiolaPhotoHtml', 'function placeImg');
if (!tiolaPhoto.includes("kind: 'card'")) fail('Tiola kart fotoğrafı boyutsuz');
else ok('Tiola kart fotoğrafı kart boyutu (CSS yüksekliği 180px)');

const tiolaH = ruleBody(rules, '.tiola-card img');
if (!/height:180px/.test(tiolaH)) fail('Tiola kart görseli yükseklik ayırmıyor');
else ok('.tiola-card img height 180px');

const templates = [
  ['public/search.html', 'pc-img'],
  ['public/profile.html', 'pc-img'],
  ['public/js/discover-places.js', 'city-card'],
];
for (const [rel, marker] of templates) {
  const text = read(rel);
  const fallbacks = text.match(/<img\b[^>]*>/gi) || [];
  const sized = fallbacks.filter((tagHtml) => /width="400"/.test(tagHtml) && /height="300"/.test(tagHtml));
  if (!text.includes(marker) || !text.includes("kind: 'card'") || !sized.length) {
    fail(`${rel}: kart yedeği width/height taşımıyor`);
  } else ok(`${rel}: kart yedeği 400×300`);
}

let missingSize = 0;
let checked = 0;
for (const rel of walkHtml(PUBLIC, '')) {
  if (rel === 'admin.html') continue;
  const html = fs.readFileSync(path.join(PUBLIC, rel), 'utf8');
  const imgs = html.match(/<img\b[^>]*>/gi) || [];
  for (const tagHtml of imgs) {
    checked += 1;
    if (!/\bwidth\s*=\s*["']?\d+/i.test(tagHtml) || !/\bheight\s*=\s*["']?\d+/i.test(tagHtml)) missingSize += 1;
  }
}
if (!checked) fail('public HTML içinde img yok');
else if (missingSize) fail(`public HTML img width/height eksik: ${missingSize}`);
else ok(`public HTML img (${checked}) width ve height taşıyor`);

const blogRatio = rules.filter((rule) => /\.bimg|\.bcard/.test(rule.selectors) && /aspect-ratio:16\/9/.test(rule.body));
if (blogRatio.length) {
  fail('blog kartına 16/9 eklendi; bu oran mevcut 165/380 yüksekliğini değiştirir');
} else ok('blog kartında 16/9 yok; mevcut yükseklik duruyor');

if (failed) {
  console.error(`verify-faz4-3 FAILED (${failed})`);
  process.exit(1);
}

console.log('verify-faz4-3 OK');
