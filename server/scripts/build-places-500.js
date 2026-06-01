/**
 * places.json → 400-500 yer, Google alanları yok, özgün görseller/metinler
 * npm run places:merge
 */
const fs = require('fs');
const path = require('path');
const { assignUniqueImages, fallbackImageUrl } = require('../lib/photo-pools');
const { enrichContentFields } = require('../lib/place-content');
const BATCH3 = require('./places-batch3');
const BATCH4 = require('./places-batch4');
const BATCH5 = require('./places-batch5-categories');

const outPath = path.join(__dirname, '..', 'data', 'places.json');

const MIN_DESC_LEN = 120;

const DESC = [
  (n, c, ci, cat) => `${n}, ${ci} (${c}) bölgesinde ${cat} meraklılarının sık uğradığı bir durak. Mimari detaylar, sokak atmosferi ve ziyaretçi deneyimleri bir arada; Touristlio Tiola yorumlarıyla güncel pratik bilgi bulabilirsiniz. Kalabalık saatlerden kaçınmak ve sabah erken slotları tercih etmek gezmeyi kolaylaştırır.`,
  (n, c, ci, cat) => `${ci} çevresinde öne çıkan ${n}, ${cat} kategorisinde fotoğraf, yürüyüş ve yerel keşif için ideal bir rota noktası. Bölgenin kültürel dokusu ve manzara katmanları kısa sürede fark edilir; yanınıza su, rahat ayakkabı ve hafif bir harita almanız yeterli. Hafta içi sabah saatleri genelde daha sakin ilerler.`,
  (n, c, ci, cat) => `${n} — ${c} / ${ci}: hem yerel halkın hem gezginlerin önerdiği güçlü bir ${cat} örneği. Ziyaret öncesi giriş kuralları, mevsim ve hava koşullarını kontrol etmek deneyimi iyileştirir. Yakın çevrede benzer temada birkaç durak daha ekleyerek günü verimli planlayabilirsiniz.`,
  (n, c, ci, cat) => `Küresel rotalarda ${n} (${ci}) önemli bir durak; şehir veya bölge gezisinin odak noktalarından biri. Tarih, manzara veya gastronomi açısından farklı beklentilere hitap eder; Touristlio topluluğunun onaylı Tiola notları pratik ipuçları sunar. Resmi tatil ve hafta sonlarında erken gitmek veya online bilet kontrolü yapmak faydalıdır.`,
  (n, c, ci, cat) => `${n}, ${c} genelinde ${cat} kategorisinde uzun süredir ziyaretçi çeken bir merkez. İlk kez gelenler için bilgi panoları ve rehberli turlar faydalı; tekrar ziyaret edenler ise farklı mevsim ve gün dilimlerinde bambaşka bir atmosfer yakalar. Tiola paylaşarak deneyiminizi gelecek gezginlere aktarabilirsiniz.`,
];

const DESC_EN = [
  (n, c, ci, cat) => `${n} in ${ci}, ${c} is a standout ${cat} stop that travelers return to for atmosphere, detail, and photo opportunities. Browse approved Tiolas on Touristlio for up-to-date tips on tickets, crowds, and best visiting windows. Weekday mornings are usually the calmest time to explore.`,
  (n, c, ci, cat) => `${n} ranks among the top ${cat} experiences around ${ci}. Architecture, street life, and local culture come together in a compact visit — bring comfortable shoes, water, and a little extra time for nearby sights. Checking seasonal hours before you go saves frustration at the gate.`,
  (n, c, ci, cat) => `Whether you are on a first trip or a return visit, ${n} (${ci}, ${c}) delivers a memorable ${cat} experience. Pair it with other stops in the same district to build a full day without long transfers. Community Tiolas highlight practical details guides often skip.`,
  (n, c, ci, cat) => `${n} sits on many global itineraries for good reason: history, views, and local flavor in one place. Plan around peak hours and public holidays when lines grow quickly. Touristlio ratings reflect real traveler experiences rather than generic listings.`,
  (n, c, ci, cat) => `${n} has drawn visitors across ${c} for generations as a reference point for ${cat} exploration. First-timers benefit from info panels or a short guided intro; repeat visitors often discover new angles in different seasons or at sunrise and sunset.`,
];

const HIST = [
  (n, c, ci) => `${n}, ${ci} ve ${c} tarihinde uzun süredir ziyaretçi çeken bir merkez; yerel kayıtlar, arkeolojik bulgular ve sözlü anlatılar bölgeyi zenginleştirir. Farklı dönemlerin izleri aynı mekânda üst üste okunabilir; bu da geziyi yalnızca görsel değil kültürel bir deneyime dönüştürür. Restorasyon ve koruma çalışmaları ziyaret rotasını zaman zaman günceller.`,
  (n, c, ci) => `${ci} (${c}) çevresinde ${n} yüzyıllar boyunca ticaret, inanç veya yönetimle ilişkilendirilmiştir. Şehir planı ve çevre yerleşimler bu hikâyeyi tamamlar; kısa bir tarih özeti okumak mekânı anlamayı kolaylaştırır. Yerel rehberler genelde bilinmeyen detayları paylaşır.`,
  (n, c, ci) => `${n} bölgesinin kültürel katmanları ${c} genelinde anlatılan hikâyelerin önemli bir parçasıdır. UNESCO veya ulusal koruma statüsü varsa ziyaret kuralları daha sıkı olabilir; resmi web sitesinden güncel bilgi alın. Fotoğraf ve sessizlik kurallarına saygı yerel topluluk için değerlidir.`,
];

const HIST_EN = [
  (n, c, ci) => `${n} has been woven into the story of ${ci} and ${c} for centuries, with archives, archaeology, and local memory shaping how visitors read the site today. Layers from different eras often overlap in one visit, turning a quick stop into a deeper cultural walk. Restoration projects may temporarily change access routes.`,
  (n, c, ci) => `Around ${ci}, ${n} is linked to trade, faith, or governance across multiple periods in ${c}. Understanding the surrounding city layout adds context that a photo alone cannot capture. Licensed local guides often share details absent from generic brochures.`,
  (n, c, ci) => `The cultural layers around ${n} belong to the wider narrative of ${c}. If the site holds UNESCO or national heritage status, expect stricter rules on photography and behavior. Checking official notices before travel keeps your visit respectful and smooth.`,
];

const TIPS = [
  (n, ci) => `${n} için hafta içi sabah saatleri genelde daha sakindir; rahat ayakkabı, su ve güneş koruması şart. Giriş ücreti veya rezervasyon gerekiyorsa önceden online kontrol edin. Tiola'da güncel deneyiminizi paylaşarak topluluğa katkı sağlayın.`,
  (n, ci) => `${ci} içinde ${n} ziyaretinde mevsim, hava ve resmi tatilleri önceden kontrol edin. Kalabalık saatlerde ana alan yerine yan koridor veya teras gibi alternatif noktalar daha rahat olabilir. Nakit ve kart kabul durumunu yanınızda küçük bir harita ile planlayın.`,
  (n, ci) => `Fotoğraf için ${n} gün doğumu veya gün batımı slotlarını tercih edin; tripod kurallarını girişte sorun. Çocuklu aileler için mola noktası ve tuvalet konumunu önceden işaretleyin. Yerel ulaşım veya yürüyüş mesafesini rotanıza göre ayarlayın.`,
];

const TIPS_EN = [
  (n, ci) => `For ${n}, weekday mornings are usually quieter — wear comfortable shoes and bring water and sun protection. Confirm tickets or reservations online when required. Share a Tiola afterward to help the next traveler.`,
  (n, ci) => `When visiting ${n} in ${ci}, check season, weather, and public holidays in advance. During peak hours, side galleries or terraces may feel less crowded than the main hall. Keep a simple map handy for exits, restrooms, and transit links.`,
  (n, ci) => `Golden hour works well for photos at ${n}; ask staff about tripod rules at entry. Families should note rest areas and facilities before long indoor sections. Adjust walking distance based on how you combine nearby stops.`,
];

const ENTRY_EN = { 'Ücretsiz': 'Free', 'Ücretli': 'Paid' };
const BEST_EN = {
  'Sabah erken': 'Early morning',
  'Gün batımı': 'Sunset',
  'Hafta içi sabah': 'Weekday morning',
  'İlkbahar–sonbahar': 'Spring–autumn',
};

const TARGET_MIN = 400;
const TARGET_MAX = 0;

function imageUrl(name, id, category) {
  return fallbackImageUrl(category, id);
}

function isShortText(text, minLen) {
  return !text || text.length < minLen;
}

function isGenericDesc(text) {
  return !text || text.includes('Touristlio Tiola ile güncel') || text.includes('kültürel öneme');
}

function buildRow(id, row) {
  const [name, location, country, city, district, category, aliases, isLocal, entryFee] = row;
  const i = id % DESC.length;
  const fee = entryFee || (isLocal ? 'Ücretsiz' : 'Ücretli');
  const best = ['Sabah erken', 'Gün batımı', 'Hafta içi sabah', 'İlkbahar–sonbahar'][id % 4];
  const base = {
    id,
    name,
    location,
    country,
    city,
    district: district || city,
    category,
    imageUrl: imageUrl(name, id, category),
    isLocal: !!isLocal,
    entryFee: fee,
    entryFeeEn: ENTRY_EN[fee] || fee,
    bestTime: best,
    bestTimeEn: BEST_EN[best] || best,
    description: DESC[i](name, country, city, category),
    descriptionEn: DESC_EN[i](name, country, city, category),
    history: HIST[id % HIST.length](name, country, city),
    historyEn: HIST_EN[id % HIST_EN.length](name, country, city),
    tips: TIPS[id % TIPS.length](name, city),
    tipsEn: TIPS_EN[id % TIPS_EN.length](name, city),
    tags: [country, city, category].filter(Boolean),
    searchAliases: aliases || [],
  };
  return enrichContentFields(base, id);
}

function enrichExisting(p, id) {
  const i = id % DESC.length;
  const fee = p.entryFee || 'Ücretli';
  const best = p.bestTime || 'Sabah erken';
  const desc = (!isShortText(p.description, MIN_DESC_LEN) && !isGenericDesc(p.description))
    ? p.description
    : DESC[i](p.name, p.country, p.city, p.category);
  const hist = (!isShortText(p.history, 80) && !isGenericDesc(p.history))
    ? p.history
    : HIST[id % HIST.length](p.name, p.country, p.city);
  const tips = (!isShortText(p.tips, 60) && !p.tips.includes('Kalabalık saatlerden'))
    ? p.tips
    : TIPS[id % TIPS.length](p.name, p.city);

  const base = {
    id: p.id,
    name: p.name,
    location: p.location,
    country: p.country,
    city: p.city,
    district: p.district || p.city,
    category: p.category,
    imageUrl: p.imageUrl && !p.imageUrl.includes('photo-1552832230-c0197dd311b5')
      ? p.imageUrl
      : imageUrl(p.name, id, p.category),
    isLocal: !!p.isLocal,
    entryFee: fee,
    entryFeeEn: p.entryFeeEn || ENTRY_EN[fee] || fee,
    bestTime: best,
    bestTimeEn: p.bestTimeEn || BEST_EN[best] || best,
    description: desc,
    descriptionEn: (!isShortText(p.descriptionEn, MIN_DESC_LEN))
      ? p.descriptionEn
      : DESC_EN[i](p.name, p.country, p.city, p.category),
    history: hist,
    historyEn: (!isShortText(p.historyEn, 80))
      ? p.historyEn
      : HIST_EN[id % HIST_EN.length](p.name, p.country, p.city),
    tips,
    tipsEn: (!isShortText(p.tipsEn, 60))
      ? p.tipsEn
      : TIPS_EN[id % TIPS_EN.length](p.name, p.city),
    tags: p.tags || [p.country, p.city, p.category],
    searchAliases: p.searchAliases || [],
    overview: p.overview,
    overviewEn: p.overviewEn,
    thingsToDo: p.thingsToDo,
    thingsToDoEn: p.thingsToDoEn,
    cultureFood: p.cultureFood,
    cultureFoodEn: p.cultureFoodEn,
    travelTips: p.travelTips || tips,
    travelTipsEn: p.travelTipsEn,
    lat: p.lat,
    lng: p.lng,
    categories: p.categories,
  };
  return enrichContentFields(base, id);
}

let extraFromMerge = [];
try {
  const mergeSrc = fs.readFileSync(path.join(__dirname, 'merge-global-places.js'), 'utf8');
  const m = mergeSrc.match(/const EXTRA = \[([\s\S]*?)\];\s*\nfunction buildRow/);
  if (m) extraFromMerge = eval('[' + m[1] + ']');
} catch {
  /* ignore */
}

const allBatches = [...extraFromMerge, ...BATCH3, ...BATCH4, ...BATCH5];
const existing = fs.existsSync(outPath)
  ? JSON.parse(fs.readFileSync(outPath, 'utf8'))
  : [];

const names = new Set(existing.map((p) => p.name.toLowerCase()));
let nextId = Math.max(0, ...existing.map((p) => p.id));

const merged = existing.map((p, idx) => enrichExisting(p, p.id || idx));

for (const row of allBatches) {
  if (names.has(row[0].toLowerCase())) continue;
  nextId += 1;
  merged.push(buildRow(nextId, row));
  names.add(row[0].toLowerCase());
}

const istanbulAliases = ['Istanbul', 'İstanbul', 'Constantinople'];
for (const p of merged) {
  if (p.city === 'Istanbul' || p.city === 'İstanbul' || (p.searchAliases || []).some((a) => /istanbul/i.test(a))) {
    p.searchAliases = [...new Set([...(p.searchAliases || []), ...istanbulAliases])];
  }
  if (p.name === 'Ayasofya' || p.name === 'Hagia Sophia') {
    p.searchAliases = [...new Set([...(p.searchAliases || []), 'Hagia Sophia', 'Aya Sofya', 'Istanbul', 'İstanbul'])];
  }
}

let clean = merged.map((p) => {
  const row = enrichContentFields({ ...p }, p.id);
  delete row.googleRating;
  delete row.googleCount;
  return row;
});

if (TARGET_MAX > 0 && clean.length > TARGET_MAX) {
  clean = clean.slice(0, TARGET_MAX);
} else if (clean.length < TARGET_MIN) {
  console.warn('Warning: only', clean.length, 'places (min', TARGET_MIN + ')');
}

clean = assignUniqueImages(clean);

const urls = clean.map((p) => p.imageUrl);
const uniqueUrls = new Set(urls).size;
const duplicateUrls = urls.length - uniqueUrls;

fs.writeFileSync(outPath, JSON.stringify(clean, null, 2), 'utf8');

const statsPath = path.join(__dirname, '..', 'data', 'merge-stats.json');
fs.writeFileSync(
  statsPath,
  JSON.stringify({ count: clean.length, uniqueUrls, duplicateUrls, target: TARGET_MAX > 0 ? `${TARGET_MIN}-${TARGET_MAX}` : `${TARGET_MIN}+ (no cap)` }, null, 2),
  'utf8',
);

console.log('places.json:', clean.length, 'destinations (Tiola-only, no Google in JSON)');
console.log('imageUrl: unique', uniqueUrls, '| duplicates', duplicateUrls);
