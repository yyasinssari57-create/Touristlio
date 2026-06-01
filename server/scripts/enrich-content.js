/**
 * places.json içerik alanlarını zenginleştirir (history, overview, howToGetThere TR+EN)
 * npm run places:enrich
 */
const fs = require('fs');
const path = require('path');
const { enrichContentFields } = require('../lib/place-content');
const { buildFaqForPlace } = require('../lib/faq-templates');

const placesPath = path.join(__dirname, '..', 'data', 'places.json');

const HOW_TR = [
  (n, ci, c) => `${ci} merkezinden ${n} için toplu taşıma, taksi veya yürüyüş rotası kullanılabilir. Havalimanından şehir içi metro/otobüs aktarmalarını önceden kontrol edin.`,
  (n, ci, c) => `${c} / ${ci}: ${n} ziyareti için en pratik ulaşım genelde metro veya tramvay hattıdır. Navigasyon uygulamasıyla son durak yürüyüş mesafesini doğrulayın.`,
];

const HOW_EN = [
  (n, ci, c) => `From ${ci} center, reach ${n} by metro, tram, taxi, or a short walk. Check airport-to-city transfers if you arrive by plane.`,
  (n, ci, c) => `In ${ci}, ${c}, public transit usually stops closest to ${n}. Confirm the last-mile walk with a maps app before you go.`,
];

function enrichHowToGetThere(p, id) {
  const i = id % HOW_TR.length;
  return {
    howToGetThere: p.howToGetThere || HOW_TR[i](p.name, p.city, p.country),
    howToGetThereEn: p.howToGetThereEn || HOW_EN[i](p.name, p.city, p.country),
  };
}

const places = JSON.parse(fs.readFileSync(placesPath, 'utf8'));
const enriched = places.map((p) => {
  const base = enrichContentFields({ ...p, ...enrichHowToGetThere(p, p.id) }, p.id);
  const faq = buildFaqForPlace(base);
  return { ...base, faqTR: base.faqTR?.length >= 5 ? base.faqTR : faq.faqTR, faqEN: base.faqEN?.length >= 5 ? base.faqEN : faq.faqEN };
});

fs.writeFileSync(placesPath, JSON.stringify(enriched, null, 2), 'utf8');
console.log('enrich-content:', enriched.length, 'places updated');
