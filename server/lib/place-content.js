const { resolveCoords } = require('./city-coords');

/** Advanced filter buckets → legacy category slugs */
const FILTER_GROUPS = {
  cities: ['city'],
  historical: ['landmark', 'religious'],
  nature: ['nature', 'beach', 'park', 'viewpoint'],
  museums: ['museum'],
  restaurants: ['restaurant', 'cafe'],
  hotels: ['hotel'],
  activities: ['adventure', 'nightlife', 'spa', 'shopping', 'market'],
};

const CATEGORY_TO_GROUPS = {};
for (const [group, cats] of Object.entries(FILTER_GROUPS)) {
  for (const c of cats) CATEGORY_TO_GROUPS[c] = CATEGORY_TO_GROUPS[c] || [];
  CATEGORY_TO_GROUPS[c].push(group);
}

function deriveCategories(category) {
  const cats = new Set([category || 'landmark']);
  for (const g of CATEGORY_TO_GROUPS[category] || []) cats.add(g);
  return [...cats];
}

function matchesFilterGroup(placeCategories, group) {
  if (!group || group === 'all') return true;
  const allowed = FILTER_GROUPS[group];
  if (!allowed) return false;
  return (placeCategories || []).some((c) => allowed.includes(c) || c === group);
}

const THINGS_TR = [
  (n, ci) => `${n} ana alanını yürüyerek keşfedin; bilgi panolarını okuyun.`,
  (n, ci) => `${ci} çevresindeki yan sokaklarda kısa bir fotoğraf molası verin.`,
  (n, ci) => `Yakındaki yerel kafede mola — ${n} ziyaretini günün geri kalanına bağlayın.`,
  (n, ci) => `Rehberli tur veya sesli rehber ile ${n} hakkında derinlemesine bilgi alın.`,
];

const THINGS_EN = [
  (n, ci) => `Walk the main circuit at ${n} and read the interpretation panels.`,
  (n, ci) => `Allow time for side streets near ${ci} — often the best photo angles.`,
  (n, ci) => `Pause at a neighborhood café and link ${n} to the rest of your day in ${ci}.`,
  (n, ci) => `Join a guided or audio tour for context you will not get from signs alone.`,
];

const CULTURE_TR = [
  (n, c) => `${c} mutfağından küçük bir lezzet durağı ekleyin; ${n} çevresinde sokak lezzetleri ve geleneksel tatlar bulunur.`,
  (n, c) => `Yerel pazar veya esnaf lokantasında ${c} kültürünü tadın — gezi sadece müze değil, sofra da öğretir.`,
];

const CULTURE_EN = [
  (n, c) => `Pair ${n} with a taste of ${c} — street snacks and family-run kitchens often sit within walking distance.`,
  (n, c) => `Browse a local market or café culture nearby; food is part of how ${c} tells its story.`,
];

function extendOverview(desc, name, city, country, lang) {
  if (!desc) return '';
  if (desc.length >= 220) return desc;
  if (lang === 'en') {
    return `${desc} Plan half a day if you want to absorb ${name} without rushing — ${city}, ${country} rewards unhurried walks and a second look at details easy to miss on a quick pass.`;
  }
  return `${desc} Acele etmeden ${name} deneyimini yaşamak için yarım gün ayırın — ${city}, ${country} yavaş tempoda yürüyüşe ve ikinci bir bakışa değer.`;
}

const ICONIC_EN = {
  Ayasofya: {
    descriptionEn: 'Hagia Sophia crowns Istanbul’s skyline with a dome that seemed to float for Byzantine worshippers and still astonishes visitors today. Layered as cathedral, mosque, and museum, it is the essential stop for understanding the city’s faith, empire, and architecture in one walk.',
    historyEn: 'Completed in 537 under Emperor Justinian, Hagia Sophia defined Byzantine sacred space for nearly a millennium. After 1453 it became an imperial mosque; it later served as a museum before returning to active worship. Mosaics, marble, and the vast central space tell a continuous story of power and belief.',
    overviewEn: 'Allow at least two hours: security lines move faster early, and the upper galleries reveal mosaics many visitors miss. Dress modestly, carry a scarf, and plan shoe removal at the entrance.',
  },
};

function enrichContentFields(p, id) {
  const i = id % 4;
  const iconic = ICONIC_EN[p.name];
  const desc = p.description || '';
  let descEn = p.descriptionEn || '';
  if (iconic?.descriptionEn) descEn = iconic.descriptionEn;
  const overview = p.overview || extendOverview(desc, p.name, p.city, p.country, 'tr');
  let overviewEn = p.overviewEn || extendOverview(descEn || desc, p.name, p.city, p.country, 'en');
  if (iconic?.overviewEn) overviewEn = iconic.overviewEn;
  let historyEn = (p.historyEn && p.historyEn.length >= 80) ? p.historyEn : '';
  if (iconic?.historyEn) historyEn = iconic.historyEn;
  else if (!historyEn) historyEn = `${p.name} belongs to the wider story of ${p.city} and ${p.country} — local guides often add context beyond signage.`;
  const thingsToDo = p.thingsToDo?.length ? p.thingsToDo : THINGS_TR.slice(0, 3).map((fn) => fn(p.name, p.city));
  const thingsToDoEn = p.thingsToDoEn?.length ? p.thingsToDoEn : THINGS_EN.slice(0, 3).map((fn) => fn(p.name, p.city));
  const cultureFood = p.cultureFood || CULTURE_TR[i % CULTURE_TR.length](p.name, p.country);
  const cultureFoodEn = p.cultureFoodEn || CULTURE_EN[i % CULTURE_EN.length](p.name, p.country);
  const travelTips = p.travelTips || p.tips || '';
  const travelTipsEn = p.travelTipsEn || p.tipsEn || p.tips || '';
  const [lat, lng] = p.lat != null && p.lng != null
    ? [p.lat, p.lng]
    : resolveCoords(p.city, p.country, id);
  const categories = p.categories?.length ? p.categories : deriveCategories(p.category);

  return {
    ...p,
    overview,
    overviewEn,
    history: p.history || '',
    historyEn,
    thingsToDo,
    thingsToDoEn,
    cultureFood,
    cultureFoodEn,
    travelTips,
    travelTipsEn,
    description: desc,
    descriptionEn: descEn,
    tips: p.tips || travelTips,
    tipsEn: p.tipsEn || travelTipsEn,
    lat,
    lng,
    categories,
  };
}

module.exports = {
  FILTER_GROUPS,
  deriveCategories,
  matchesFilterGroup,
  enrichContentFields,
};
