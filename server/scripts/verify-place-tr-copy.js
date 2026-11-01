/**
 * Turkish FAQ / how-to-get for every place, plus English best-time leftovers.
 * Usage: npm run verify:place-tr-copy
 *
 * A correct dative can still be 'e (Anıtkabir'e, Efes'e). The old bug was
 * gluing 'e onto every name. This script fails when the question is not
 * the helper's dative.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const { trDative, trLabel, hasTurkishTimeWord, toEnglishBestTime, EN_BEST_TIME } = require('../lib/tr-labels');
const { repairPlaceCopy, templateHowToGetThere } = require('../lib/place-copy');
const { enrichContentFields } = require('../lib/place-content');

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

function howQuestion(faq) {
  return (faq || []).find((item) => String(item && item.q || '').endsWith('nasıl ulaşılır?'));
}

function expectQuestion(name) {
  return `${trDative(name)} nasıl ulaşılır?`;
}

console.log('verify-place-tr-copy');

const datives = [
  ['Ayasofya', "Ayasofya'ya"],
  ['Efes', "Efes'e"],
  ['Topkapı Sarayı', "Topkapı Sarayı'na"],
  ['Efes Antik Kenti', "Efes Antik Kenti'ne"],
  ['Kolezyum', "Kolezyum'a"],
  ['Louvre Müzesi', "Louvre Müzesi'ne"],
  ['Kapalıçarşı', "Kapalıçarşı'ya"],
  ['Pamukkale Travertenleri', "Pamukkale Travertenleri'ne"],
  ['Galata Kulesi', "Galata Kulesi'ne"],
];
for (const [name, expected] of datives) {
  const got = trDative(name);
  if (got !== expected) fail(`dative ${name} → ${got}, beklenen ${expected}`);
  else ok(`${name} → ${expected}`);
}

if (toEnglishBestTime('Çarşamba akşamı') !== 'Wednesday evening') fail('Çarşamba çevrilmedi');
else ok('Çarşamba akşamı → Wednesday evening');
if (toEnglishBestTime('Sabah açılışta') !== 'At morning opening') fail('Sabah açılışta çevrilmedi');
else ok('Sabah açılışta → At morning opening');
if (toEnglishBestTime('Sabah erken veya gün batımı') !== 'Early morning or sunset') fail('uzun saat çevrilmedi');
else ok('Sabah erken veya gün batımı → Early morning or sunset');
if (toEnglishBestTime('Sabah 07:00-09:00') !== EN_BEST_TIME) fail('Ayasofya saati çevrilmedi');
else ok('Sabah 07:00-09:00 → Early morning, 07:00–09:00');
if (toEnglishBestTime('Sunset') !== 'Sunset' || toEnglishBestTime('Weekday morning') !== 'Weekday morning') {
  fail('İngilizce saat bozuldu');
} else ok('hazır İngilizce saat duruyor');
if (toEnglishBestTime(toEnglishBestTime('Çarşamba akşamı')) !== 'Wednesday evening') fail('çeviri ikinci kez değişiyor');
else ok('çeviri ikinci kez aynı');

const places = JSON.parse(read('server/data/places.json'));
let wrongQ = 0;
let wrongHow = 0;
let trBest = 0;
let enFaqTr = 0;
let naiveE = 0;
let correctE = 0;
for (const p of places) {
  const expectedQ = expectQuestion(p.name);
  const qItem = howQuestion(p.faqTR);
  if (!qItem || qItem.q !== expectedQ) wrongQ += 1;
  else if (qItem.q === `${p.name}'e nasıl ulaşılır?`) correctE += 1;
  const naive = `${p.name}'e nasıl ulaşılır?`;
  if (qItem && qItem.q === naive && naive !== expectedQ) naiveE += 1;
  const expectHow = templateHowToGetThere(p.name, p.city);
  if (p.howToGetThere !== expectHow) wrongHow += 1;
  if (hasTurkishTimeWord(p.bestTimeEn)) trBest += 1;
  if (hasTurkishTimeWord(JSON.stringify(p.faqEN || []))) enFaqTr += 1;
}
if (wrongQ) fail(`SSS sorusu yönelmesi yanlış: ${wrongQ}`);
else ok(`SSS sorusu ${places.length} yerde yönelme ekiyle aynı`);
if (naiveE) fail(`kör 'e eki duruyor: ${naiveE}`);
else ok(`kör 'e yok; ince ünlü 'e ${correctE} yerde duruyor`);
if (wrongHow) fail(`ulaşım cümlesi şablonla uyuşmuyor: ${wrongHow}`);
else ok('ulaşım cümlesi yönelme ekini taşıyor');
if (trBest) fail(`İngilizce en iyi saatte Türkçe kelime: ${trBest}`);
else ok('bestTimeEn içinde Türkçe saat/gün yok');
if (enFaqTr) fail(`İngilizce SSS içinde Türkçe saat/gün: ${enFaqTr}`);
else ok('İngilizce SSS içinde Türkçe saat/gün yok');

function spot(name, questionPart, howPart, bestEn) {
  const p = places.find((item) => item.name === name);
  if (!p) {
    fail(`${name} kaydı yok`);
    return;
  }
  const q = howQuestion(p.faqTR);
  const blob = JSON.stringify(p.faqTR || []);
  if (!q || !q.q.includes(questionPart) || !String(q.a || '').includes(howPart)) {
    fail(`${name} SSS: ${q && q.q} / ${q && q.a}`);
  } else if (blob.includes("'e nasıl")) {
    fail(`${name} SSS hâlâ 'e`);
  } else ok(`${name}: ${questionPart}`);
  if (bestEn && p.bestTimeEn !== bestEn) fail(`${name} EN saat: ${p.bestTimeEn}`);
  else if (bestEn) ok(`${name} EN saat ${bestEn}`);
  if (p.city == null) fail(`${name} city yok`);
}

spot('Topkapı Sarayı', "Topkapı Sarayı'na nasıl ulaşılır?", "Topkapı Sarayı'na ulaşılabilir");
spot('Efes Antik Kenti', "Efes Antik Kenti'ne nasıl ulaşılır?", "Efes Antik Kenti'ne ulaşılabilir");
spot('Kolezyum', "Kolezyum'a nasıl ulaşılır?", "Kolezyum'a ulaşılabilir", 'At morning opening');
spot('Louvre Müzesi', "Louvre Müzesi'ne nasıl ulaşılır?", "Louvre Müzesi'ne ulaşılabilir", 'Wednesday evening');

const aya = places.find((p) => p.name === 'Ayasofya' && p.city === 'Istanbul');
if (!aya) fail('Ayasofya kaydı yok');
else {
  const tr = JSON.stringify([
    aya.faqTR, aya.howToGetThere, aya.overview, aya.cultureFood, aya.thingsToDo, aya.location,
  ]);
  if (tr.includes("Ayasofya'e") || /\bIstanbul\b/.test(tr) || /\bTurkey\b/.test(tr)) {
    fail('Ayasofya Türkçe metni geri döndü');
  } else if (!tr.includes("Ayasofya'ya") || !tr.includes('İstanbul') || !tr.includes('Türkiye')) {
    fail('Ayasofya Türkçe metni eksik');
  } else ok("Ayasofya'ya, İstanbul, Türkiye duruyor");
  if (aya.country !== 'Turkey') fail('Ayasofya country değişti');
  else ok('city=Istanbul ve country=Turkey duruyor');
  if (aya.bestTime !== 'Sabah 07:00-09:00') fail(`TR saat değişti: ${aya.bestTime}`);
  else ok('Ayasofya Türkçe saati Sabah 07:00-09:00');
  if (aya.bestTimeEn !== EN_BEST_TIME || hasTurkishTimeWord(aya.bestTimeEn)) fail(`Ayasofya EN saat: ${aya.bestTimeEn}`);
  else ok('Ayasofya İngilizce saati duruyor');
  const aliases = JSON.stringify(aya.searchAliases || []);
  if (!aliases.includes('Istanbul') || !aliases.includes('İstanbul')) fail('arama takma adı değişti');
  else ok('arama takma adında Istanbul duruyor');
}

const istanbulPlaces = places.filter((p) => p.city === 'Istanbul');
if (!istanbulPlaces.length) fail('Istanbul filtre anahtarı silinmiş');
else if (istanbulPlaces.some((p) => p.country !== 'Turkey' && p.city === 'Istanbul')) fail('Istanbul country kaydı');
else ok(`filtre anahtarı city=Istanbul duruyor (${istanbulPlaces.length} yer)`);

const fresh = enrichContentFields({
  name: 'Topkapı Sarayı',
  city: 'Istanbul',
  country: 'Turkey',
  category: 'museum',
  description: 'Saray.',
  howToGetThere: 'Istanbul merkezinden toplu taşıma veya taksi ile Topkapı Sarayı ulaşılabilir.',
  bestTime: 'Hafta içi sabah',
  bestTimeEn: 'Hafta içi sabah',
  faqTR: [
    { q: 'Topkapı Sarayı ziyareti ne kadar sürer?', a: 'Istanbul.' },
    { q: 'Topkapı Sarayı giriş ücreti var mı?', a: 'Ücretli.' },
    { q: 'Topkapı Sarayı için en iyi ziyaret zamanı ne?', a: 'Sabah.' },
    { q: "Topkapı Sarayı'e nasıl ulaşılır?", a: 'Istanbul merkezinden toplu taşıma veya taksi ile Topkapı Sarayı ulaşılabilir.' },
    { q: 'Topkapı Sarayı çocuklarla uygun mu?', a: 'Turkey / Istanbul.' },
    { q: 'Topkapı Sarayı yakınında ne yenir?', a: 'Turkey.' },
  ],
  faqEN: [
    { q: 'How long should I spend at Topkapı Sarayı?', a: 'A while.' },
    { q: 'Is there an entry fee for Topkapı Sarayı?', a: 'Paid.' },
    { q: 'When is the best time to visit Topkapı Sarayı?', a: 'Hafta içi sabah is usually quieter.' },
    { q: 'How do I get to Topkapı Sarayı?', a: 'Taxi.' },
    { q: 'Is Topkapı Sarayı suitable for children?', a: 'Yes.' },
    { q: 'Where to eat near Topkapı Sarayı?', a: 'Nearby.' },
  ],
}, 2);
const freshQ = howQuestion(fresh.faqTR);
if (!freshQ || freshQ.q !== "Topkapı Sarayı'na nasıl ulaşılır?" || !String(freshQ.a).includes("Topkapı Sarayı'na ulaşılabilir")) {
  fail(`eski SSS yenilenmedi: ${freshQ && freshQ.q} / ${freshQ && freshQ.a}`);
} else if (/\bIstanbul\b/.test(JSON.stringify(fresh.faqTR)) || /\bTurkey\b/.test(JSON.stringify(fresh.faqTR))) {
  fail('yenilenen SSS hâlâ Istanbul/Turkey');
} else ok('beşten uzun bozuk SSS yenileniyor');
if (fresh.bestTimeEn !== 'Weekday morning' || hasTurkishTimeWord(JSON.stringify(fresh.faqEN))) {
  fail(`yenilenen EN saat: ${fresh.bestTimeEn}`);
} else ok('yenilenen İngilizce saatte Türkçe yok');
if (fresh.city !== 'Istanbul' || fresh.country !== 'Turkey') fail('zenginleştirme filtre anahtarını değiştirdi');
else ok('zenginleştirme city/country anahtarını bırakıyor');
if (fresh.bestTime !== 'Hafta içi sabah') fail('Türkçe saat İngilizceye dönmüş');
else ok('Türkçe bestTime duruyor');

const twice = repairPlaceCopy(repairPlaceCopy(places[1]));
if (JSON.stringify(twice) !== JSON.stringify(repairPlaceCopy(places[1]))) fail('tamir ikinci kez değişiyor');
else ok('tamir ikinci kez aynı');

const migration = read('db/migrations/014_place_tr_copy.js');
if (!migration.includes('014_place_tr_copy')) fail('göç kimliği yok');
else ok('göç kimliği 014_place_tr_copy');
const updateSql = migration.slice(migration.indexOf('UPDATE places SET'), migration.indexOf('WHERE id = ?'));
if (/\bcity\b/.test(updateSql) || /\bcountry\b/.test(updateSql)) {
  fail('göç city veya country yazıyor');
} else ok('göç city ve country sütununa dokunmuyor');
if (!migration.includes('repairPlaceCopy')) fail('göç tamir yardımcısını kullanmıyor');
else ok('göç aynı tamir yardımcısını kullanıyor');

const content = read('server/lib/place-content.js');
if (!content.includes('repairPlaceCopy')) fail('place-content tamiri çağırmıyor');
else ok('place-content kayıtlı SSS sonrası tamir ediyor');

const pkg = JSON.parse(read('package.json'));
if (pkg.scripts['verify:place-tr-copy'] !== 'node server/scripts/verify-place-tr-copy.js') {
  fail('package.json verify:place-tr-copy yok');
} else ok('package.json verify:place-tr-copy');

async function verifyDb() {
  const url = String(process.env.DATABASE_URL || '').trim();
  if (!url) {
    console.log('  · DB atlandı (DATABASE_URL yok)');
    return;
  }
  const { initDb, db, closePool } = require('../db');
  try {
    await initDb();
    const applied = await db.prepare('SELECT 1 AS ok FROM schema_migrations WHERE id = ?').get('014_place_tr_copy');
    if (!applied) fail('schema_migrations içinde 014_place_tr_copy yok');
    else ok('göç veritabanına işlendi');

    const rows = await db.prepare(`
      SELECT name, city, country, faq_tr, how_to_get_there, best_time_en, faq_en, best_time
      FROM places
    `).all();
    let dbWrong = 0;
    let dbNaive = 0;
    let dbBest = 0;
    let dbFaqEn = 0;
    for (const row of rows) {
      let faq = [];
      try { faq = JSON.parse(row.faq_tr || '[]'); } catch { faq = []; }
      const qItem = howQuestion(faq);
      const expectedQ = expectQuestion(row.name);
      if (qItem && qItem.q !== expectedQ) dbWrong += 1;
      const naive = `${row.name}'e nasıl ulaşılır?`;
      if (qItem && qItem.q === naive && naive !== expectedQ) dbNaive += 1;
      if (hasTurkishTimeWord(row.best_time_en)) dbBest += 1;
      if (hasTurkishTimeWord(row.faq_en)) dbFaqEn += 1;
    }
    if (dbWrong) fail(`DB SSS yönelmesi yanlış: ${dbWrong}`);
    else ok(`DB SSS yönelmesi ${rows.length} kayıtta doğru`);
    if (dbNaive) fail(`DB kör 'e duruyor: ${dbNaive}`);
    else ok('DB kör \'e yok');
    if (dbBest) fail(`DB best_time_en Türkçe: ${dbBest}`);
    else ok('DB best_time_en Türkçe saat/gün içermiyor');
    if (dbFaqEn) fail(`DB İngilizce SSS Türkçe saat: ${dbFaqEn}`);
    else ok('DB İngilizce SSS Türkçe saat/gün içermiyor');

    const ayaRow = rows.find((row) => row.name === 'Ayasofya' && row.city === 'Istanbul');
    const topRow = rows.find((row) => row.name === 'Topkapı Sarayı');
    const ephRow = rows.find((row) => row.name === 'Efes Antik Kenti');
    if (!ayaRow || ayaRow.country !== 'Turkey') fail('DB Ayasofya filtre anahtarı değişti');
    else if (!String(ayaRow.faq_tr || '').includes("Ayasofya'ya")) fail('DB Ayasofya SSS eksik');
    else ok('DB Ayasofya city=Istanbul ve Ayasofya\'ya');
    if (!topRow || !String(topRow.faq_tr || '').includes("Topkapı Sarayı'na nasıl ulaşılır?")) {
      fail('DB Topkapı SSS eksik');
    } else if (!String(topRow.how_to_get_there || '').includes("Topkapı Sarayı'na ulaşılabilir")) {
      fail(`DB Topkapı ulaşım: ${topRow.how_to_get_there}`);
    } else ok('DB Topkapı Sarayı\'na');
    if (!ephRow || !String(ephRow.faq_tr || '').includes("Efes Antik Kenti'ne nasıl ulaşılır?")) {
      fail('DB Efes SSS eksik');
    } else ok('DB Efes Antik Kenti\'ne');
    if (topRow && (/\bIstanbul\b/.test(topRow.how_to_get_there || '') || topRow.city !== 'Istanbul')) {
      fail('DB Topkapı şehir anahtarı veya ulaşım cümlesi');
    } else if (topRow) ok('DB Topkapı ulaşımda İstanbul, anahtar Istanbul');
  } finally {
    await closePool();
  }
}

verifyDb().then(() => {
  if (failed) {
    console.error(`verify-place-tr-copy: ${failed} failed`);
    process.exit(1);
  }
  console.log('verify-place-tr-copy: ok');
}).catch((err) => {
  console.error('  ✗', err && err.message ? err.message : err);
  process.exit(1);
});
