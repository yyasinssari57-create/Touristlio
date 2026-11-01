/**
 * Claude Master PRD — FAZ4-8 (Ayasofya dil hataları).
 * Usage: npm run verify:faz4-8
 *
 * PRD: Türkçe sayfada "Istanbul", "Turkey", "Ayasofya'e".
 * Veritabanı metni + şablon düzelir. Filtre anahtarları (city/country) durur.
 */
const fs = require('fs');
const path = require('path');

const { trDative, trLabel, fixTurkishProse, EN_BEST_TIME } = require('../lib/tr-labels');
const { buildFaqForPlace } = require('../lib/faq-templates');
const { enrichContentFields } = require('../lib/place-content');
const { generateMeta } = require('../lib/seo');

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

function blob(value) {
  return JSON.stringify(value);
}

console.log('verify-faz4-8 (Ayasofya dil hataları)');

if (trDative('Ayasofya') !== "Ayasofya'ya") fail(`dative Ayasofya → ${trDative('Ayasofya')}`);
else ok("Ayasofya'ya");
if (trDative('Efes') !== "Efes'e") fail(`dative Efes → ${trDative('Efes')}`);
else ok("Efes'e (ünsüz sonu)");
if (trLabel('Istanbul') !== 'İstanbul' || trLabel('Turkey') !== 'Türkiye') fail('trLabel');
else ok('Istanbul → İstanbul, Turkey → Türkiye');
if (trLabel('Paris') !== 'Paris') fail('Paris etiketi değişti');
else ok('Paris etiketi duruyor');

const fixedSentence = fixTurkishProse(
  "Ayasofya'e nasıl ulaşılır? Istanbul merkezinden toplu taşıma veya taksi ile Ayasofya ulaşılabilir. Turkey / Istanbul.",
);
if (fixedSentence.includes("Ayasofya'e") || /\bIstanbul\b/.test(fixedSentence) || /\bTurkey\b/.test(fixedSentence)) {
  fail(`düzeltme kaldı: ${fixedSentence}`);
} else if (!fixedSentence.includes("Ayasofya'ya") || !fixedSentence.includes('İstanbul') || !fixedSentence.includes('Türkiye')) {
  fail(`düzeltme eksik: ${fixedSentence}`);
} else ok('bilinen hatalı cümle düzeliyor');
if (fixTurkishProse(fixedSentence) !== fixedSentence) fail('düzeltme ikinci kez değişiyor');
else ok('düzeltme ikinci kez aynı');

const places = JSON.parse(read('server/data/places.json'));
const aya = places.find((p) => p.name === 'Ayasofya' && p.city === 'Istanbul');
if (!aya) fail('Ayasofya kaydı yok');
else {
  const trCopy = [
    aya.thingsToDo, aya.cultureFood, aya.howToGetThere, aya.faqTR,
    aya.overview, aya.description, aya.history, aya.tips, aya.travelTips, aya.location,
  ];
  const trText = blob(trCopy);
  if (trText.includes("Ayasofya'e")) fail("Ayasofya Türkçe metninde Ayasofya'e duruyor");
  else ok("Ayasofya'e Türkçe metinde yok");
  if (/\bIstanbul\b/.test(trText)) fail('Ayasofya Türkçe metninde Istanbul duruyor');
  else ok('Istanbul Türkçe metinde yok');
  if (/\bTurkey\b/.test(trText)) fail('Ayasofya Türkçe metninde Turkey duruyor');
  else ok('Turkey Türkçe metinde yok');
  if (!trText.includes('İstanbul') || !trText.includes('Türkiye') || !trText.includes("Ayasofya'ya")) {
    fail('İstanbul / Türkiye / Ayasofya\'ya eksik');
  } else ok("İstanbul, Türkiye ve Ayasofya'ya var");
  if (aya.city !== 'Istanbul' || aya.country !== 'Turkey') fail('filtre anahtarı değişti');
  else ok('city=Istanbul ve country=Turkey duruyor');
  const aliases = blob(aya.searchAliases || []);
  if (!aliases.includes('Istanbul') || !aliases.includes('İstanbul')) fail('arama takma adları eksik');
  else ok('arama takma adlarında Istanbul ve İstanbul duruyor');
  if (!String(aya.descriptionEn || '').includes('Istanbul')) fail('İngilizce açıklamada Istanbul yok');
  else ok('İngilizce açıklamada Istanbul duruyor');
  if (!String(aya.cultureFoodEn || '').includes('Turkey')) fail('İngilizce kültür metninde Turkey yok');
  else ok('İngilizce kültür metninde Turkey duruyor');
  if (String(aya.bestTime || '') !== 'Sabah 07:00-09:00') fail(`TR en iyi saat değişti: ${aya.bestTime}`);
  else ok('Türkçe en iyi saat Sabah 07:00-09:00');
  if (String(aya.bestTimeEn || '').includes('Sabah') || aya.bestTimeEn !== EN_BEST_TIME) {
    fail(`EN en iyi saat: ${aya.bestTimeEn}`);
  } else ok('İngilizce en iyi saatte Sabah yok');
  const enFaq = blob(aya.faqEN || []);
  if (enFaq.includes('Sabah')) fail('İngilizce SSS içinde Sabah duruyor');
  else ok('İngilizce SSS içinde Sabah yok');
  if (!enFaq.includes('Istanbul') || !enFaq.includes('Turkey')) fail('İngilizce SSS şehir/ülke adı eksik');
  else ok('İngilizce SSS Istanbul ve Turkey kullanıyor');
}

const topkapi = places.find((p) => p.name === 'Topkapı Sarayı');
const topQ = (topkapi?.faqTR || []).map((item) => item.q).join(' ');
if (!topQ.includes("Topkapı Sarayı'e nasıl ulaşılır?")) fail('Topkapı SSS bu turda değişmiş');
else ok('Topkapı kaydı bu turda duruyor');

const generated = buildFaqForPlace({
  name: 'Ayasofya',
  city: 'Istanbul',
  country: 'Turkey',
  entryFee: 'Ücretsiz',
  entryFeeEn: 'Free',
  bestTime: 'Sabah 07:00-09:00',
  bestTimeEn: EN_BEST_TIME,
});
const genTr = blob(generated.faqTR);
const genEn = blob(generated.faqEN);
if (genTr.includes("Ayasofya'e") || /\bIstanbul\b/.test(genTr) || /\bTurkey\b/.test(genTr)) {
  fail(`şablon TR hâlâ hatalı: ${genTr}`);
} else if (!genTr.includes("Ayasofya'ya") || !genTr.includes('İstanbul') || !genTr.includes('Türkiye')) {
  fail(`şablon TR eksik: ${genTr}`);
} else ok('SSS şablonu Türkçe etiket ve -ya eki üretiyor');
if (genEn.includes('Sabah') || !genEn.includes('Istanbul') || !genEn.includes('Turkey')) {
  fail(`şablon EN beklenen değil: ${genEn}`);
} else ok('SSS şablonu İngilizce Istanbul / Turkey bırakıyor');

const fresh = enrichContentFields({
  name: 'Ayasofya',
  city: 'Istanbul',
  country: 'Turkey',
  description: 'Kısa açıklama.',
  category: 'landmark',
}, 1);
const freshTr = blob([fresh.overview, fresh.thingsToDo, fresh.cultureFood, fresh.howToGetThere, fresh.faqTR]);
if (/\bIstanbul\b/.test(freshTr) || /\bTurkey\b/.test(freshTr) || freshTr.includes("Ayasofya'e")) {
  fail('yeni Türkçe üretim hâlâ İngilizce anahtar basıyor');
} else if (!fresh.howToGetThere.includes("Ayasofya'ya") || !freshTr.includes('İstanbul') || !freshTr.includes('Türkiye')) {
  fail(`yeni Türkçe üretim eksik: ${fresh.howToGetThere}`);
} else ok('boş kayıttan üretilen Türkçe metin doğru');
if (!String(fresh.descriptionEn || '').includes('Istanbul')) fail('ikonik İngilizce açıklama bozuldu');
else ok('ikonik İngilizce açıklama Istanbul ile duruyor');

const placeTr = generateMeta('place', {
  place: { name: 'Ayasofya', city: 'Istanbul', overview: 'Kubbe.' },
}, 'tr');
if (placeTr.title !== 'Ayasofya | İstanbul Gezilecek Yerler — Touristlio') fail(`TR başlık: ${placeTr.title}`);
else ok('Türkçe sayfa başlığı İstanbul');
const placeEn = generateMeta('place', {
  place: { name: 'Hagia Sophia', city: 'Istanbul', overviewEn: 'A Byzantine landmark.' },
}, 'en');
if (placeEn.title !== 'Hagia Sophia | Things to Do in Istanbul — Touristlio') fail(`EN başlık: ${placeEn.title}`);
else ok('İngilizce sayfa başlığı Istanbul');
const paris = generateMeta('place', {
  place: { name: 'Louvre', city: 'Paris', overview: 'Müze.' },
}, 'tr');
if (paris.title !== 'Louvre | Paris Gezilecek Yerler — Touristlio') fail(`Paris başlık: ${paris.title}`);
else ok('Paris başlığı değişmedi');

const app = read('public/js/app.js');
if (!app.includes("if (src === 'Istanbul') return 'İstanbul'")) fail('istemci İstanbul etiketi yok');
else ok('istemci İstanbul etiketi var');
if (!app.includes("if (src === 'Turkey') return 'Türkiye'")) fail('istemci Türkiye etiketi yok');
else ok('istemci Türkiye etiketi var');
if (!app.includes('const city = lang === \'en\' ? cityRaw : trUiLabel(cityRaw);')) {
  fail('istemci başlığı ham şehir adını basıyor');
} else ok('istemci Türkçe başlığı etiketliyor');

const faqSrc = read('server/lib/faq-templates.js');
if (faqSrc.includes("${name}'e nasıl ulaşılır?")) fail('SSS şablonu hâlâ \'e eki basıyor');
else ok('SSS şablonunda \'e eki yok');

const migration = read('db/migrations/013_ayasofya_tr_copy.js');
if (!migration.includes("slug = 'ayasofya-istanbul'")) fail('göç Ayasofya kaydını seçmiyor');
else ok('göç Ayasofya kaydını seçiyor');
if (/SET[\s\S]*\bcity\b/.test(migration)) fail('göç city sütununu yazıyor');
else ok('göç city sütununa dokunmuyor');
if (migration.includes('013_ayasofya_tr_copy') === false) fail('göç kimliği yok');
else ok('göç kimliği 013_ayasofya_tr_copy');

const pkg = JSON.parse(read('package.json'));
if (pkg.scripts['verify:faz4-8'] !== 'node server/scripts/verify-faz4-8-ayasofya.js') {
  fail('package.json verify:faz4-8 yok');
} else ok('package.json verify:faz4-8');

if (failed) {
  console.error(`verify-faz4-8: ${failed} failed`);
  process.exit(1);
}
console.log('verify-faz4-8: ok');
