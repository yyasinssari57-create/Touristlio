/**
 * En iyi zaman — ay çoklu seçimi (1–12).
 * best_months JSON dizisi; best_time / best_time_en okunabilir metin.
 */

const MONTHS_TR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

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

function formatBestMonths(months, lang) {
  const names = lang === 'en' ? MONTHS_EN : MONTHS_TR;
  return normalizeBestMonths(months)
    .map((m) => names[m - 1])
    .filter(Boolean)
    .join(', ');
}

function bestTimeFromMonths(months, lang) {
  const text = formatBestMonths(months, lang);
  return text || '';
}

module.exports = {
  MONTHS_TR,
  MONTHS_EN,
  parseBestMonths,
  normalizeBestMonths,
  formatBestMonths,
  bestTimeFromMonths,
};
