/**
 * En iyi zaman — ay çoklu seçimi (1–12).
 * best_months JSON dizisi; ardışık aylar aralık olarak gösterilir ("Nisan – Ekim").
 */

const MONTHS_TR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const RANGE_SEP = ' – ';

function parseBestMonths(raw) {
  if (Array.isArray(raw)) return normalizeBestMonths(raw);
  if (raw == null || raw === '') return [];
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return normalizeBestMonths(parsed);
    } catch {
      /* düz metin ay listesi değil */
    }
  }
  return [];
}

function normalizeBestMonths(list) {
  const seen = new Set();
  const out = [];
  for (const item of list || []) {
    const n = Number(item);
    if (!Number.isInteger(n) || n < 1 || n > 12 || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  out.sort((a, b) => a - b);
  return out;
}

/** Ardışık ayları aralık olarak birleştir: [4..10] → "Nisan – Ekim". */
function formatBestMonths(months, lang) {
  const names = lang === 'en' ? MONTHS_EN : MONTHS_TR;
  const normalized = normalizeBestMonths(months);
  if (!normalized.length) return '';

  const parts = [];
  let start = normalized[0];
  let prev = normalized[0];

  const pushRange = () => {
    const a = names[start - 1];
    const b = names[prev - 1];
    parts.push(start === prev ? a : `${a}${RANGE_SEP}${b}`);
  };

  for (let i = 1; i < normalized.length; i++) {
    const m = normalized[i];
    if (m === prev + 1) {
      prev = m;
      continue;
    }
    pushRange();
    start = prev = m;
  }
  pushRange();
  return parts.join(', ');
}

function bestTimeFromMonths(months, lang) {
  const text = formatBestMonths(months, lang);
  return text || '';
}

function looksLikeMonthList(text, lang) {
  const names = lang === 'en' ? MONTHS_EN : MONTHS_TR;
  const tokens = String(text || '')
    .split(/[,–\-]| ve | and /i)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!tokens.length) return false;
  return tokens.every((tok) => names.some((n) => n.toLowerCase() === tok.toLowerCase()));
}

/** İsteğe bağlı kısa not (en fazla 1 cümle). Ay listesiyle aynı metni yazma. */
function cleanBestTimeNote(note, monthsText, lang = 'tr') {
  if (note == null) return '';
  let text = String(note).trim().replace(/\s+/g, ' ');
  if (!text) return '';
  if (monthsText && text === monthsText) return '';
  // Eski virgüllü ay listesini not sanma
  if (monthsText) {
    const compact = (s) => s.replace(/\s+/g, '').replace(/–/g, '-');
    if (compact(text) === compact(monthsText)) return '';
  }
  if (looksLikeMonthList(text, lang)) return '';
  if (text.length > 160) text = text.slice(0, 160).trim();
  return text;
}

function formatBestTimeDisplay(months, lang, note) {
  const monthsText = formatBestMonths(months, lang);
  const cleanNote = cleanBestTimeNote(note, monthsText, lang);
  if (monthsText && cleanNote) return `${monthsText}. ${cleanNote}`;
  return monthsText || cleanNote || '';
}

module.exports = {
  MONTHS_TR,
  MONTHS_EN,
  RANGE_SEP,
  parseBestMonths,
  normalizeBestMonths,
  formatBestMonths,
  bestTimeFromMonths,
  cleanBestTimeNote,
  formatBestTimeDisplay,
};
