/**
 * Claude Master PRD — FAZ4-2 (Honeypot alanı gizleme).
 * Usage: npm run verify:faz4-2
 *
 * PRD: "Website" honeypot kullanıcıya görünüyordu. CSS + HTML ile
 * gizlenecek. Fonksiyon değişmeyecek, yalnızca görünmez olacak.
 *
 * Ana dalda onaylı a11y turunda kapanmıştı: .tl-hp, aria-hidden,
 * tabindex="-1", ekran dışı + clip. display:none yok — bazı botlar
 * onu atlar; alan DOM'da type=text kalır. Bu betik o sözleşmeyi
 * kilitler. Renk, yerleşim ve buton değiştirmez.
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

function walkHtml(dir, prefix) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) out.push(...walkHtml(abs, rel));
    else if (name.endsWith('.html')) out.push(rel);
  }
  return out;
}

function cssRules(css) {
  const rules = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = re.exec(css))) {
    rules.push({ selectors: match[1].trim(), body: match[2].replace(/\s+/g, '') });
  }
  return rules;
}

function selectorHits(selectors, needle) {
  return selectors.split(',').some((part) => part.trim() === needle);
}

console.log('verify-faz4-2 (honeypot gizleme sözleşmesi)');

const css = read('public/css/style.css');
const overrides = read('public/css/inline-overrides.css');
const rules = cssRules(css + '\n' + overrides);
const hpRules = rules.filter((rule) => rule.selectors.split(',').some((part) => {
  const sel = part.trim();
  return sel === '.tl-hp' || sel.startsWith('.tl-hp ') || sel.startsWith('.tl-hp:');
}));

const exact = rules.filter((rule) => selectorHits(rule.selectors, '.tl-hp'));
if (exact.length !== 1) fail(`.tl-hp kuralı ${exact.length} adet (1 olmalı)`);
else ok('.tl-hp tek kural');

const body = exact[0] ? exact[0].body : '';
const required = [
  'position:absolute!important',
  'left:-10000px!important',
  'width:1px!important',
  'height:1px!important',
  'overflow:hidden!important',
  'clip:rect(0,0,0,0)!important',
  'clip-path:inset(50%)!important',
  'opacity:0',
  'pointer-events:none',
];
const missingCss = required.filter((token) => !body.includes(token));
if (!exact.length || missingCss.length) fail(`gizleme CSS eksik: ${missingCss.join(', ') || 'kural yok'}`);
else ok('ekran dışı + clip + opacity 0 (önemli kurallar kilitli)');

if (/display\s*:\s*none/i.test(body) || /visibility\s*:\s*hidden/i.test(body)) {
  fail('.tl-hp display:none veya visibility:hidden kullanıyor');
} else ok('display:none yok; alan DOM’da kalır');

const inputRule = rules.filter((rule) => selectorHits(rule.selectors, '.tl-hp input'));
if (inputRule.length !== 1 || !inputRule[0].body.includes('opacity:0') || /display\s*:\s*none/i.test(inputRule[0].body)) {
  fail('.tl-hp input opacity:0 değil veya display:none');
} else ok('.tl-hp input yalnızca opacity:0');

if (hpRules.length < 2) fail(`.tl-hp kural sayısı ${hpRules.length} (en az 2)`);
const dangerous = hpRules.filter((rule) => /display:none|visibility:hidden|left:0(?!\d)|opacity:1|position:static|position:relative|width:100%|clip:auto/i.test(rule.body));
if (dangerous.length) fail(`honeypot’u görünür yapacak CSS: ${dangerous.map((rule) => rule.selectors).join(', ')}`);
else ok('honeypot’u geri açan CSS yok');

const helper = read('public/js/form-security.js');
const helperStart = helper.indexOf('function honeypotHtml()');
const helperFn = helperStart === -1 ? '' : helper.slice(helperStart, helper.indexOf('global.TL_FORM_SECURITY'));
if (!helperFn.includes('class="tl-hp"') || !helperFn.includes('aria-hidden="true"')
  || !helperFn.includes('name="website"') || !helperFn.includes('tabindex="-1"')
  || !helperFn.includes('autocomplete="off"') || !helperFn.includes('type="text"')) {
  fail('honeypotHtml gizli metin alanı üretmiyor');
} else if (/display\s*:\s*none|type="hidden"|visibility\s*:\s*hidden/i.test(helperFn)) {
  fail('honeypotHtml display:none veya type=hidden kullanıyor');
} else ok('honeypotHtml: type=text, aria-hidden, tabindex=-1, .tl-hp');

const a11y = read('public/js/a11y.js');
if (!a11y.includes(".tl-hp") || !a11y.includes('aria-hidden="true"')) {
  fail('a11y.js honeypot’u etiket taramasından çıkarmıyor');
} else ok('ekran okuyucu etiketi honeypot’a görünür etiket eklemez');

const app = read('public/js/app.js');
const authFn = app.slice(app.indexOf('function buildAuthForm'), app.indexOf('function showAuthFormError'));
const helperUses = (authFn.match(/honeypotHtml\(\)/g) || []).length;
if (helperUses < 2) fail('giriş/kayıt penceresi honeypotHtml kullanmıyor');
else if (/name="website"/.test(authFn)) fail('giriş penceresinde ham website alanı var');
else ok('giriş ve kayıt penceresi aynı gizli honeypot’u basar');

function websiteInputs(html) {
  const tags = [];
  const re = /<input\b[^>]*name="website"[^>]*>/gi;
  let match;
  while ((match = re.exec(html))) tags.push(match[0]);
  return tags;
}

function hiddenWell(html, tagIndex) {
  const before = html.slice(Math.max(0, tagIndex - 500), tagIndex);
  const open = before.lastIndexOf('<div class="tl-hp"');
  if (open === -1) return false;
  const between = before.slice(open);
  if (between.includes('</div>')) return false;
  return /<div class="tl-hp"[^>]*aria-hidden="true"/.test(between);
}

const expected = {
  'index.html': 2,
  'login.html': 1,
  'register.html': 1,
  'legal/contact.html': 1,
};

const htmlFiles = walkHtml(PUBLIC, '');
let seen = 0;
for (const rel of htmlFiles) {
  const html = fs.readFileSync(path.join(PUBLIC, rel), 'utf8');
  const tags = websiteInputs(html);
  if (!tags.length && !expected[rel]) continue;
  seen += tags.length;
  const min = expected[rel] || 0;
  if (tags.length < min) {
    fail(`${rel}: ${tags.length} honeypot (en az ${min})`);
    continue;
  }
  let bad = 0;
  const re = /<input\b[^>]*name="website"[^>]*>/gi;
  let match;
  while ((match = re.exec(html))) {
    const tag = match[0];
    const type = (tag.match(/\btype="([^"]*)"/i) || [, 'text'])[1].toLowerCase();
    const okTag = type === 'text'
      && tag.includes('tabindex="-1"')
      && tag.includes('autocomplete="off"')
      && tag.includes('aria-hidden="true"')
      && !/style\s*=\s*"[^"]*display\s*:\s*none/i.test(tag)
      && hiddenWell(html, match.index);
    if (!okTag) bad += 1;
  }
  if (bad) fail(`${rel}: ${bad} website alanı gizli sözleşme dışında`);
  else ok(`${rel}: ${tags.length} honeypot gizli (type=text, .tl-hp)`);
}

if (seen < 5) fail(`toplam website alanı ${seen} (en az 5)`);
else ok(`public HTML: ${seen} website alanı, hepsi .tl-hp içinde`);

const { isHoneypotFilled, HONEYPOT_FIELDS } = require('../middleware/honeypot');
if (!Array.isArray(HONEYPOT_FIELDS) || HONEYPOT_FIELDS.join(',') !== 'website,url,homepage') {
  fail(`honeypot alan listesi değişmiş: ${(HONEYPOT_FIELDS || []).join(',')}`);
} else ok('sunucu hâlâ website, url, homepage okur');

if (!isHoneypotFilled({ website: 'http://spam.example' })) fail('dolu website yakalanmıyor');
else if (isHoneypotFilled({ website: '' }) || isHoneypotFilled({ website: '   ' }) || isHoneypotFilled({ name: 'Yasin' })) {
  fail('boş honeypot yanlış pozitif');
} else ok('boş alan geçer, dolu website hâlâ dolu sayılır');

if (failed) {
  console.error(`verify-faz4-2 FAILED (${failed})`);
  process.exit(1);
}

console.log('verify-faz4-2 OK');
