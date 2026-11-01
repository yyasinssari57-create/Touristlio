/**
 * Repair stored place copy:
 * - Turkish dative in FAQ / how-to-get (Ayasofya'ya, Sarayı'na, Kenti'ne)
 * - Istanbul / Turkey inside Turkish prose → İstanbul / Türkiye
 * - English best-time leftovers (Sabah, Çarşamba, …)
 *
 * city and country stay as filter keys. Place names stay as stored.
 * Template FAQs are rebuilt; a custom FAQ that is not the 6-question
 * template is only patched when its "nasıl ulaşılır?" question is wrong.
 */

const { buildFaqForPlace } = require('./faq-templates');
const {
  trLabel,
  trDative,
  fixTurkishProse,
  fixJsonTurkish,
  toEnglishBestTime,
  hasTurkishTimeWord,
} = require('./tr-labels');

const NAME_TOKEN = '⟦N⟧';

const TR_TEXT_FIELDS = [
  'location', 'description', 'history', 'tips', 'overview', 'cultureFood', 'travelTips',
];

function templateHowToGetThere(name, city) {
  return `${trLabel(city)} merkezinden toplu taşıma veya taksi ile ${trDative(name)} ulaşılabilir.`;
}

function protectName(text, name, fn) {
  if (typeof text !== 'string') return text;
  if (!name || text.includes(NAME_TOKEN)) return fn(text);
  return fn(text.split(name).join(NAME_TOKEN)).split(NAME_TOKEN).join(name);
}

function isGeneratedHow(text, name) {
  if (!text || !name) return !text;
  if (!String(text).includes('merkezinden toplu taşıma veya taksi')) return false;
  const marker = `ile ${name}`;
  const idx = String(text).lastIndexOf(marker);
  if (idx < 0) return false;
  const tail = String(text).slice(idx + marker.length).trim();
  return /^(?:'[\p{L}]+)?\s*ulaşılabilir\.?$/u.test(tail);
}

function questions(faq) {
  if (!Array.isArray(faq)) return [];
  return faq.map((item) => String(item && item.q || ''));
}

function isGeneratedFaqTr(faq) {
  const qs = questions(faq);
  if (qs.length < 5) return false;
  return qs.some((q) => q.endsWith('ziyareti ne kadar sürer?'))
    && qs.some((q) => q.endsWith('nasıl ulaşılır?'))
    && qs.some((q) => q.endsWith('giriş ücreti var mı?'));
}

function isGeneratedFaqEn(faq) {
  const qs = questions(faq);
  if (qs.length < 5) return false;
  return qs.some((q) => q.startsWith('How long should I spend at '))
    && qs.some((q) => q.startsWith('How do I get to ') || q.startsWith('When is the best time to visit '));
}

function howQuestionIsWrong(faq, name) {
  const expected = `${trDative(name)} nasıl ulaşılır?`;
  return questions(faq).some((q) => q.endsWith('nasıl ulaşılır?') && q !== expected);
}

function faqEnHasTurkishTime(faq) {
  return !!hasTurkishTimeWord(JSON.stringify(faq || []));
}

function repairPlaceCopy(p) {
  const src = p || {};
  const name = src.name || '';
  const city = src.city || '';
  const out = { ...src };

  for (const field of TR_TEXT_FIELDS) {
    if (typeof out[field] === 'string') {
      out[field] = protectName(out[field], name, fixTurkishProse);
    }
  }
  if (Array.isArray(out.thingsToDo)) {
    out.thingsToDo = out.thingsToDo.map((item) => (
      typeof item === 'string' ? protectName(item, name, fixTurkishProse) : item
    ));
  }

  if (isGeneratedHow(out.howToGetThere, name) || !out.howToGetThere) {
    out.howToGetThere = templateHowToGetThere(name, city);
  } else if (typeof out.howToGetThere === 'string') {
    out.howToGetThere = protectName(out.howToGetThere, name, fixTurkishProse);
  }

  if (out.bestTimeEn || out.bestTime) {
    out.bestTimeEn = toEnglishBestTime(out.bestTimeEn || out.bestTime);
  }

  const faqBuilt = buildFaqForPlace({
    ...out,
    howToGetThere: out.howToGetThere,
    howToGetThereEn: out.howToGetThereEn,
    cultureFood: out.cultureFood,
    cultureFoodEn: out.cultureFoodEn,
    bestTimeEn: out.bestTimeEn,
  });

  if (!Array.isArray(out.faqTR) || out.faqTR.length < 5 || isGeneratedFaqTr(out.faqTR) || howQuestionIsWrong(out.faqTR, name)) {
    out.faqTR = faqBuilt.faqTR;
  } else {
    out.faqTR = fixJsonTurkish(out.faqTR);
  }

  if (!Array.isArray(out.faqEN) || out.faqEN.length < 5 || isGeneratedFaqEn(out.faqEN) || faqEnHasTurkishTime(out.faqEN)) {
    out.faqEN = faqBuilt.faqEN;
  }

  return out;
}

module.exports = {
  templateHowToGetThere,
  isGeneratedHow,
  isGeneratedFaqTr,
  isGeneratedFaqEn,
  repairPlaceCopy,
};
