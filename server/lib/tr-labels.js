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
  á: 'a', à: 'a', ä: 'a',
  é: 'e', è: 'e', ê: 'e', ë: 'e',
  í: 'e', ì: 'e', ï: 'e',
  ó: 'a', ò: 'a', ô: 'a',
  ú: 'a', ù: 'a',
};

/**
 * Last word is already a Turkish possessive (Sarayı, Kenti, Müzesi).
 * Those take the n buffer: Sarayı'na, Kenti'ne — not Sarayı'ya.
 */
const POSSESSIVE_LAST = new Set([
  'sarayı', 'kenti', 'tapınağı', 'kavşağı', 'ormanı', 'katedrali', 'akropolü',
  'parkı', 'körfezi', 'heykeli', 'manastırı', 'turu', 'kaleiçi', 'hamami', 'hamamı',
  'dağı', 'gölü', 'nehri', 'boğazı', 'sokağı', 'adası', 'plajı', 'meydanı',
  'camii', 'şehri', 'koyu', 'burnu', 'tepesi', 'vadisi', 'ırmağı', 'denizi',
  'çayırı', 'yaylası', 'hanı', 'külliyesi', 'çeşmesi', 'kapısı', 'köprüsü',
]);

const EN_BEST_TIME = 'Early morning, 07:00–09:00';

/** Whole phrases first (longer keys win). Single words use a letter boundary. */
const BEST_TIME_TR_TO_EN = {
  'Sabah erken veya gün batımı': 'Early morning or sunset',
  'Sabah 07:00-09:00': EN_BEST_TIME,
  'Şafak veya gün batımı': 'Dawn or sunset',
  'Eylül-Mart geceleri': 'September–March nights',
  'Hanbok ile sabah': 'Morning in hanbok',
  'Gündüz veya gece': 'Daytime or night',
  'Gece mum turu': 'Night candle tour',
  'Akşam 19:00-21:00': 'Evening, 19:00–21:00',
  'Gelgit sırasında': 'During the tide',
  'Çarşamba akşamı': 'Wednesday evening',
  'Hafta içi sabah': 'Weekday morning',
  'Hafta içi öğle': 'Weekday noon',
  'Sabah açılışta': 'At morning opening',
  'İlkbahar–sonbahar': 'Spring–autumn',
  'İlkbahar-sonbahar': 'Spring–autumn',
  'Haziran-Ağustos': 'June–August',
  'Temmuz-Eylül': 'July–September',
  'Ekim-Kasım': 'October–November',
  'Şafak vakti': 'At dawn',
  'Sabah erken': 'Early morning',
  'Gün batımı': 'Sunset',
  'gün batımı': 'sunset',
  'Sabah & akşam': 'Morning & evening',
  'Gündüz & gece': 'Day & night',
  'Sabah 08:00': 'Morning, 08:00',
  'Sabah 07:00': 'Morning, 07:00',
  'Sonbahar': 'Autumn',
  'İlkbahar': 'Spring',
  'Çarşamba': 'Wednesday',
  'Perşembe': 'Thursday',
  'Pazartesi': 'Monday',
  'Cumartesi': 'Saturday',
  'Salı': 'Tuesday',
  'Cuma': 'Friday',
  'Pazar': 'Sunday',
  'Haziran': 'June',
  'Temmuz': 'July',
  'Ağustos': 'August',
  'Eylül': 'September',
  'Ekim': 'October',
  'Kasım': 'November',
  'Aralık': 'December',
  'Ocak': 'January',
  'Şubat': 'February',
  'Mart': 'March',
  'Nisan': 'April',
  'Mayıs': 'May',
  'Şafak': 'Dawn',
  'Sabah': 'Morning',
  'Akşam': 'Evening',
  'Öğle': 'Noon',
  'öğle': 'noon',
  'Gece': 'Night',
  'gece': 'night',
  'Gündüz': 'Daytime',
  'gündüz': 'daytime',
  'açılışta': 'at opening',
};

const BEST_TIME_KEYS = Object.keys(BEST_TIME_TR_TO_EN).sort((a, b) => b.length - a.length);

const TR_TIME_WORDS = [
  'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar',
  'Sabah', 'Öğle', 'Akşam', 'Şafak', 'Gündüz', 'Sonbahar', 'İlkbahar',
  'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Gece', 'gelgit', 'açılışta',
];

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

function lastToken(name) {
  const parts = String(name || '').trim().split(/\s+/);
  return parts[parts.length - 1] || '';
}

/** Possessive place nouns take n (Sarayı'na). Other vowel endings take y (Ayasofya'ya). */
function needsNBuffer(name) {
  const last = lastToken(name).toLocaleLowerCase('tr-TR');
  if (!last) return false;
  if (POSSESSIVE_LAST.has(last)) return true;
  if (/[aeıioöuüâîûáéíóú]s[ıiuü]$/.test(last)) return true;
  if (/(ları|leri)$/.test(last)) return true;
  return false;
}

/** Ayasofya → Ayasofya'ya. Sarayı → Sarayı'na. Consonant endings stay Efes'e. */
function trDative(name) {
  const word = String(name || '').trim();
  if (!word) return word;
  const lower = word.toLocaleLowerCase('tr-TR');
  let harmony = 'a';
  for (const ch of lower) {
    if (VOWEL_CLASS[ch]) harmony = VOWEL_CLASS[ch];
  }
  const last = lower.slice(-1);
  let buffer = '';
  if (VOWEL_CLASS[last]) buffer = needsNBuffer(word) ? 'n' : 'y';
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

function replacePhrase(hay, phrase, repl) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'gu');
  return hay.replace(re, `$1${repl}`);
}

/** Turkish best-time phrases → English. Already-English text stays put. */
function toEnglishBestTime(text) {
  if (text == null || text === '') return text;
  let out = String(text);
  for (const key of BEST_TIME_KEYS) {
    if (out.includes(key)) out = replacePhrase(out, key, BEST_TIME_TR_TO_EN[key]);
  }
  return out;
}

function hasTurkishTimeWord(text) {
  const s = String(text || '');
  for (const word of TR_TIME_WORDS) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|[^\\p{L}])${escaped}([^\\p{L}]|$)`, 'iu');
    if (re.test(s)) return word;
  }
  return '';
}

function fixEnglishSabah(text) {
  if (text == null || text === '') return text;
  return toEnglishBestTime(text);
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
  BEST_TIME_TR_TO_EN,
  TR_TIME_WORDS,
  trLabel,
  trDative,
  toEnglishBestTime,
  hasTurkishTimeWord,
  fixTurkishProse,
  fixEnglishSabah,
  fixJsonTurkish,
  fixJsonEnglishSabah,
};
