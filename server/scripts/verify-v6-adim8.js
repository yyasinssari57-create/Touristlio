#!/usr/bin/env node
/**
 * V6 Adım 8 — EN etiketler + honeypot a11y.
 * - isFree → TR Ücretsiz / EN Free (alan metnine bakılmaz)
 * - EN boş bilgi satırı TR ile doldurulmaz; gizlenir
 * - Ülke: EN'de Türkiye (resmi ad); özel adlar çevrilmez
 * - Honeypot: görünür "Website" etiket metni yok; name=website + sunucu kontrolü durur
 *
 * Usage: npm run verify:v6-adim8
 */
const fs = require('fs');
const path = require('path');
const { buildPlaceInfoBoxes } = require('../lib/place-info-boxes');
const placeSections = require('../../public/js/place-sections');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) { console.error('  ✗', msg); failed += 1; }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

console.log('verify-v6-adim8-en-honeypot');

const pkg = JSON.parse(read('package.json'));
if (pkg.scripts?.['verify:v6-adim8'] !== 'node server/scripts/verify-v6-adim8.js') {
  fail('package.json verify:v6-adim8 eksik/yanlış');
} else ok('package.json verify:v6-adim8');

/* ── 1. isFree → infoFree (alan metni yok sayılır) ── */
const freeTr = buildPlaceInfoBoxes({ isFree: true, entryFee: '350 ₺', entryFeeEn: 'Paid' }, 'tr');
const freeEn = buildPlaceInfoBoxes({ isFree: true, entryFee: 'Ücretsiz', entryFeeEn: '' }, 'en');
const freeTrEntry = freeTr.boxes.find((b) => b.key === 'entry');
const freeEnEntry = freeEn.boxes.find((b) => b.key === 'entry');
if (!freeTrEntry || freeTrEntry.valueKey !== 'infoFree' || freeTrEntry.text != null) {
  fail('TR isFree: valueKey=infoFree ve text null olmalı');
} else ok('TR isFree → infoFree (Ücretsiz i18n)');
if (!freeEnEntry || freeEnEntry.valueKey !== 'infoFree' || freeEnEntry.text != null) {
  fail('EN isFree: valueKey=infoFree (Free); alan metnine bakılmaz');
} else ok('EN isFree → infoFree (Free; entryFee metni yok sayılır)');

const paidEn = buildPlaceInfoBoxes({
  isFree: false,
  entryFee: '350 ₺',
  entryFeeEn: '350 TRY',
}, 'en');
if (paidEn.boxes.find((b) => b.key === 'entry')?.text !== '350 TRY') {
  fail('ücretli EN entryFeeEn kullanılmalı');
} else ok('ücretli → entryFeeEn');

/* ── 2. EN boş satır gizle (TR fallback yok) ── */
const hide = buildPlaceInfoBoxes({
  isFree: false,
  entryFee: 'Ücretsiz',
  entryFeeEn: '',
  bestTime: 'Nisan–Haziran',
  bestTimeEn: '',
}, 'en');
const hideKeys = hide.boxes.map((b) => b.key);
if (hideKeys.includes('entry')) fail('EN boş entryFeeEn TR ile doldurulmamalı');
else ok('EN boş giriş ücreti satırı yok');
if (hideKeys.includes('bestTime')) fail('EN boş bestTimeEn TR ile doldurulmamalı');
else ok('EN boş en iyi zaman satırı yok');

const sec = placeSections.placeSectionVisibility({
  history: 'Türkçe tarihçe uzun metin',
  historyEn: '',
  overview: 'TR genel',
  overviewEn: 'EN overview',
}, 'en');
if (sec.history) fail('place-sections EN boş history TR fallback kullanıyor');
else ok('place-sections: EN boş bölüm gizlenir');
if (!sec.overview || sec.texts.overview !== 'EN overview') fail('EN dolu overview kayboldu');
else ok('place-sections: EN dolu bölüm görünür');

const appJs = read('public/js/app.js');
if (!appJs.includes('function entryFeeDisplay') || !appJs.includes('function setInfoCardRow')) {
  fail('app.js entryFeeDisplay / setInfoCardRow yok');
} else ok('app.js giriş ücreti + satır gizleme yardımcıları');
if (!/if \(lang === 'en'\) return p\[`\$\{base\}En`\] \|\| ''/.test(appJs)
  && !appJs.includes("if (lang === 'en') return p[`${base}En`] || '';")) {
  fail('placeField hâlâ EN→TR fallback yapıyor');
} else ok('placeField EN→TR fallback yok');
if (!appJs.includes("hideWhenEmpty: lang === 'en'")) {
  fail('icEntry/icBest EN boşken satır gizlenmiyor');
} else ok('info kartı EN boş satır gizlenir');

const sectionsJs = read('public/js/place-sections.js');
if (/const en = text\(place\[`\$\{base\}En`\]\);\s*if \(en\) return en/.test(sectionsJs)) {
  fail('place-sections field() hâlâ TR fallback');
} else ok('place-sections field() EN-only');

const boxesLib = read('server/lib/place-info-boxes.js');
if (!boxesLib.includes('Empty EN must not fall back to TR')
  && !/if \(lang === 'en'\) return textOrEmpty\(place\[enKey\]\)/.test(boxesLib)) {
  fail('localizedText EN fallback kaldırmadı');
} else ok('localizedText EN fallback yok');

/* ── 3. Türkiye resmi adı (EN) ── */
const i18n = read('public/js/i18n.js');
if (!i18n.includes("key === 'Turkey'") || !i18n.includes("return 'Türkiye'")) {
  fail('geoName EN Turkey → Türkiye yok');
} else ok('geoName: Turkey → Türkiye (EN)');
if (!i18n.includes("discoverGlobalSub: 'Across Türkiye")) {
  fail("EN discoverGlobalSub hâlâ 'Across Turkey'");
} else ok('discoverGlobalSub: Across Türkiye');

/* ── 4. Honeypot: Website etiket metni yok ── */
const honeypotFiles = [
  'public/index.html',
  'public/legal/contact.html',
  'public/login.html',
  'public/register.html',
  'public/js/form-security.js',
];
for (const rel of honeypotFiles) {
  const html = read(rel);
  if (/<label>\s*Website\b/i.test(html)) fail(`${rel}: görünür Website etiket metni duruyor`);
  else if (!html.includes('name="website"')) fail(`${rel}: name=website yok`);
  else if (!html.includes('tl-hp')) fail(`${rel}: .tl-hp yok`);
  else ok(`${rel}: honeypot Website metni yok`);
}

const helper = read('public/js/form-security.js');
const hpStart = helper.indexOf('function honeypotHtml()');
const hpFn = hpStart < 0 ? '' : helper.slice(hpStart, helper.indexOf('global.TL_FORM_SECURITY'));
if (!hpFn.includes('name="website"') || !hpFn.includes('tabindex="-1"')
  || !hpFn.includes('autocomplete="off"') || !hpFn.includes('aria-hidden="true"')) {
  fail('honeypotHtml alan sözleşmesi bozuldu');
} else if (/<label>\s*Website/i.test(hpFn)) {
  fail('honeypotHtml hâlâ Website etiketi basıyor');
} else ok('honeypotHtml: website alanı, Website metni yok');

const honeypotMw = read('server/middleware/honeypot.js');
const contactRt = read('server/routes/contact.js');
const tiolaRt = read('server/routes/tiolas.js');
if (!honeypotMw.includes('isHoneypotFilled') || !honeypotMw.includes('website')) {
  fail('sunucu honeypot middleware kayıp');
} else ok('sunucu honeypot kontrolü duruyor');
if (!contactRt.includes('honeypotGuard(CONTACT_OK)')) fail('contact honeypotGuard yok');
else ok('POST /api/contact honeypot');
if (!tiolaRt.includes('honeypotGuard(TIOLA_OK)')) fail('tiola honeypotGuard yok');
else ok('POST /api/tiolas honeypot');

if (failed) {
  console.error(`verify-v6-adim8 KALDI (${failed} hata)`);
  process.exit(1);
}
console.log('verify-v6-adim8 TAMAM');
