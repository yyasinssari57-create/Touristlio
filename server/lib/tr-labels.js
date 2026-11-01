/**
 * FAZ4-8 — Turkish display labels and the dative used in generated prose.
 * Canonical filter keys (places.city = Istanbul, places.country = Turkey) stay English.
 */

const TR_GEO = {
  Istanbul: 'İstanbul',
  Turkey: 'Türkiye',
};

const VOWEL_CLASS = {
  a: 'a', ı: 'a', o: 'a', u: 'a',
  e: 'e', i: 'e', ö: 'e', ü: 'e',
  â: 'a', î: 'e', û: 'u',
};

const EN_BEST_TIME = 'Early morning, 07:00–09:00';

function trLabel(value) {
  const src = String(value == null ? '' : value);
  if (!src) return '';
  if (Object.prototype.hasOwnProperty.call(TR_GEO, src)) return TR_GEO[src];
  if (src.includes('🇹🇷')) {
    const key = src.replace(/\s*🇹🇷\s*/g, ' ').replace(/\s+/g, ' ').trim();
    if (Object.prototype.hasOwnProperty.call(TR_GEO, key)) {
      return src.replace(key, TR_GEO[key]);
    }
  }
  return src;
}

/** Ayasofya → Ayasofya'ya. Consonant endings keep a single apostrophe (Efes'e). */
function trDative(name) {
  const word = String(name || '').trim();
  if (!word) return word;
  const lower = word.toLocaleLowerCase('tr-TR');
  let harmony = 'a';
  for (const ch of lower) {
    if (VOWEL_CLASS[ch]) harmony = VOWEL_CLASS[ch];
  }
  const last = lower.slice(-1);
  const buffer = VOWEL_CLASS[last] ? 'y' : '';
  return `${word}'${buffer}${harmony}`;
}

function fixTurkishProse(text) {
  if (text == null || text === '') return text;
  let s = String(text);
  s = s.replace(/Ayasofya'e/g, "Ayasofya'ya");
  s = s.replace(/ile Ayasofya ulaşılabilir/g, "ile Ayasofya'ya ulaşılabilir");
  s = s.replace(/\bIstanbul\b/g, 'İstanbul');
  s = s.replace(/\bTurkey\b/g, 'Türkiye');
  return s;
}

function fixEnglishSabah(text) {
  if (text == null || text === '') return text;
  return String(text).replace(/Sabah 07:00-09:00/g, EN_BEST_TIME);
}

function mapJson(value, fn) {
  if (Array.isArray(value)) return value.map((item) => mapJson(item, fn));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = mapJson(item, fn);
    return out;
  }
  if (typeof value === 'string') return fn(value);
  return value;
}

function fixJsonTurkish(value) {
  return mapJson(value, fixTurkishProse);
}

function fixJsonEnglishSabah(value) {
  return mapJson(value, fixEnglishSabah);
}

module.exports = {
  TR_GEO,
  EN_BEST_TIME,
  trLabel,
  trDative,
  fixTurkishProse,
  fixEnglishSabah,
  fixJsonTurkish,
  fixJsonEnglishSabah,
};
