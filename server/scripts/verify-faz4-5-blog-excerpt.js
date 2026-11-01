/**
 * Claude Master PRD — FAZ4-5 (Blog excerpt / body tekrarı).
 * Usage: npm run verify:faz4-5
 *
 * PRD: Blog detayında özet gövde içinde tekrar ediyordu.
 * Tekrar kalkacak, içerik kaybolmayacak.
 *
 * Ana dalda bu PR #61 ile kapalı. Detay şablonu özeti bir kez basar;
 * gövde yalnızca kalan metindir. Bu betik o sözleşmeyi kilitler.
 * Renk, yerleşim ve buton değiştirmez. app.js bu turda değişmedi.
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

function countOf(haystack, needle) {
  if (!needle) return 0;
  let n = 0;
  let from = 0;
  while (from <= haystack.length) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) return n;
    n += 1;
    from = at + needle.length;
  }
  return n;
}

console.log('verify-faz4-5 (blog özet / gövde tekrarı)');

const app = read('public/js/app.js');
const css = read('public/css/style.css');
const overrides = read('public/css/inline-overrides.css');
const html = read('public/index.html');
const seed = read('server/seed.js');

const fnSource = extractFunction(app, 'bodyWithoutExcerpt');
if (!fnSource) fail('bodyWithoutExcerpt yok');
else ok('bodyWithoutExcerpt app.js içinde');

const sandbox = {};
if (fnSource) {
  vm.runInNewContext(`${fnSource}\nthis.bodyWithoutExcerpt = bodyWithoutExcerpt;`, sandbox);
}
const bodyWithoutExcerpt = sandbox.bodyWithoutExcerpt;

const openStart = app.indexOf('async function openBlogDetail');
const openEnd = app.indexOf('function closeBlogDetail');
const openFn = openStart >= 0 && openEnd > openStart ? app.slice(openStart, openEnd) : '';
const templateStart = openFn.indexOf('bodyEl.innerHTML');
const templateEnd = openFn.indexOf('activeBlogSlug');
const template = templateStart >= 0 && templateEnd > templateStart
  ? openFn.slice(templateStart, templateEnd)
  : '';

if (!openFn.includes('bodyWithoutExcerpt(b.excerpt, b.body)')) {
  fail('detay şablonu özeti gövdeden kesmiyor');
} else ok('detay, gövdeyi özete göre keser');

if (!template.includes('class="bd-excerpt"') || !template.includes('class="bd-body"')) {
  fail('özet ve gövde ayrı kutularda değil');
} else ok('özet .bd-excerpt, kalan gövde .bd-body');

if (/escapeHtml\(b\.body\)/.test(template) || /\$\{b\.body\}/.test(template)) {
  fail('ham gövde özetin yanında tekrar basılıyor');
} else ok('ham gövde detay kutusuna ikinci kez yazılmaz');

if (!template.includes('restBody ?') || !template.includes('b.excerpt ?')) {
  fail('boş özet veya boş kalan gövde yine de kutu açıyor');
} else ok('boş kalan gövde kutusu basılmaz');

const cardStart = app.indexOf('const card = (b, isFeat)');
const cardEnd = app.indexOf('grid.innerHTML = card');
const card = cardStart >= 0 && cardEnd > cardStart ? app.slice(cardStart, cardEnd) : '';
if (!card.includes('class="bexc"') || !card.includes('b.excerpt')) {
  fail('liste kartı özeti kayıp');
} else ok('liste kartı .bexc özetini göstermeye devam eder');
if (card.includes('bodyWithoutExcerpt')) {
  fail('liste kartı detay kesmesini kullanıyor');
} else ok('kart kesmesi detay sayfasına ait');

if (!html.includes('id="blogDetailBody"') || !html.includes('class="blog-detail-box blog-detail-page"')) {
  fail('detay kabuğu yok');
} else ok('detay kabuğu duruyor; özet HTML’e gömülü değil');

if (!/\.bd-excerpt\{color:var\(--t2\);font-size:\.85rem;margin-bottom:12px;\}/.test(css)) {
  fail('.bd-excerpt ölçüsü değişmiş');
} else ok('.bd-excerpt rengi ve punto aynı');

if (!/\.blog-detail-box\s+\.bd-body\s*\{[^}]*font-size:\s*\.88rem;[^}]*color:\s*var\(--t1\);[^}]*line-height:\s*1\.7;[^}]*white-space:\s*pre-wrap;/.test(overrides)) {
  fail('.bd-body ölçüsü değişmiş');
} else ok('.bd-body punto, satır aralığı ve pre-wrap aynı');

if (!css.includes('.bexc{font-size:.78rem;color:var(--t2);line-height:1.6;margin-bottom:10px;}')) {
  fail('kart özeti .bexc ölçüsü değişmiş');
} else ok('kart özeti .bexc aynı');

const seedFnStart = seed.indexOf('async function seedDemoBlogs');
const seedFnEnd = seed.indexOf('async function runFullSeed');
const seedFn = seedFnStart >= 0 && seedFnEnd > seedFnStart ? seed.slice(seedFnStart, seedFnEnd) : '';
if (/b\.excerpt,\s*b\.excerpt,/.test(seedFn)) {
  fail('seed gövdesi hâlâ yalnızca özet; sitemap 200 karakter ister');
} else ok('seed gövdesi özetten uzun yazılır');
if (!seedFn.includes('demoBlogBody')) {
  fail('seed demoBlogBody kullanmıyor');
} else ok('seed gövdesi demoBlogBody ile kurulur');

function blocks(excerpt, body) {
  const rest = bodyWithoutExcerpt(excerpt, body);
  const excerptShown = String(excerpt || '').trim() ? String(excerpt) : '';
  return { excerpt: excerptShown, body: rest };
}

function assertLeadingStripped(label, excerpt, body) {
  if (typeof bodyWithoutExcerpt !== 'function') {
    fail(`${label}: fonksiyon yok`);
    return;
  }
  const view = blocks(excerpt, body);
  const e = String(excerpt || '').trim();
  const original = String(body || '').trim();
  if (!e || !original.startsWith(e)) {
    fail(`${label}: örnek baştaki tekrar değil`);
    return;
  }
  const expectedRest = original.slice(e.length).replace(/^[\s\r\n]+/, '');
  if (view.body !== expectedRest) {
    fail(`${label}: kalan gövde beklenen devam değil`);
    return;
  }
  if (e && countOf(view.body, e) !== 0) {
    fail(`${label}: özet gövdede duruyor`);
    return;
  }
  if (!String(view.excerpt).includes(e)) {
    fail(`${label}: özet kayboldu`);
    return;
  }
  const separator = original.slice(e.length, original.length - expectedRest.length);
  if (`${e}${separator}${expectedRest}` !== original) {
    fail(`${label}: metin birleşince eksik`);
    return;
  }
  ok(label);
}

function assertBodyKept(label, excerpt, body) {
  if (typeof bodyWithoutExcerpt !== 'function') {
    fail(`${label}: fonksiyon yok`);
    return;
  }
  const view = blocks(excerpt, body);
  const original = String(body || '').trim();
  if (view.body !== original) {
    fail(`${label}: gövde kısaldı`);
    return;
  }
  ok(label);
}

if (typeof bodyWithoutExcerpt === 'function') {
  const istanbul = "Çoğu turistin hiç görmediği bir İstanbul var — sabah 5 ile 8 arasında, Boğaz'ın üzerinden ezan sesinin yankılandığı o sessiz saatler.";
  assertLeadingStripped('özet = gövde bir kez', istanbul, istanbul);
  assertLeadingStripped('baştaki özet kesilir, devam kalır', 'Kısa özet', 'Kısa özet\n\nDevamı burada.');
  assertBodyKept('farklı gövde olduğu gibi kalır', 'Kısa özet.', 'Bambaşka bir giriş ve Kısa özet. ortada geçer.');
  assertBodyKept('boş özette gövde durur', '', 'Yalnızca uzun gövde.');
  const onlyExcerpt = blocks('Yalnızca özet', '');
  if (onlyExcerpt.body !== '' || !String(onlyExcerpt.excerpt).includes('Yalnızca özet')) {
    fail('boş gövdede özet kayboldu');
  } else ok('boş gövdede yalnızca özet');

  const longBody = `${'Galata sabahı '.repeat(40)}Son cümle yerinde durur.`;
  const autoExcerpt = longBody.slice(0, 500);
  assertLeadingStripped('ilk 500 karakterlik otomatik özet tekrar etmez', autoExcerpt, longBody);

  const spaced = bodyWithoutExcerpt('  Kısa özet  ', 'Kısa özet');
  if (spaced !== '') fail('boşluklu aynı metin iki kez görünür');
  else ok('uç boşlukları aynı metin sayılır');
}

if (failed) {
  console.error(`verify-faz4-5 FAILED (${failed})`);
  process.exit(1);
}
console.log('verify-faz4-5 OK');
