/**
 * V4 Adım 6 — mekân sayfasında boş bölüm.
 * İçerik yoksa sekme ve başlık gösterilmez. "—" yer tutucu içerik sayılmaz.
 * V6 Adım 8 — EN boşsa TR metne düşülmez; satır/bölüm gizlenir.
 * noindex bu dosyada yok; sunucu SEO ve app.js yazar.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.TL_PLACE_SECTIONS = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const PLACEHOLDERS = new Set(['—', '–', '-', '--', 'n/a', 'na']);

  function text(value) {
    const raw = String(value == null ? '' : value).trim();
    if (!raw || PLACEHOLDERS.has(raw.toLowerCase())) return '';
    return raw;
  }

  function asList(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      const raw = value.trim();
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        /* düz metin liste değildir */
      }
    }
    return [];
  }

  function field(place, lang, base) {
    if (lang === 'en') return text(place[`${base}En`]);
    return text(place[base]);
  }

  function listField(place, lang, base) {
    const key = lang === 'en' ? `${base}En` : base;
    const primary = asList(place[key]);
    const vals = lang === 'en'
      ? primary
      : (primary.length ? primary : asList(place[base]));
    return vals.map(text).filter(Boolean);
  }

  const MONTHS_TR = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
  ];
  const MONTHS_EN = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  function normalizeMonths(list) {
    const seen = new Set();
    const out = [];
    for (const item of asList(list)) {
      const n = Number(item);
      if (!Number.isInteger(n) || n < 1 || n > 12 || seen.has(n)) continue;
      seen.add(n);
      out.push(n);
    }
    out.sort((a, b) => a - b);
    return out;
  }

  const RANGE_SEP = ' – ';

  function formatMonthRanges(months, language) {
    const names = language === 'en' ? MONTHS_EN : MONTHS_TR;
    const normalized = normalizeMonths(months);
    if (!normalized.length) return '';
    const parts = [];
    let start = normalized[0];
    let prev = normalized[0];
    const push = () => {
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
      push();
      start = prev = m;
    }
    push();
    return parts.join(', ');
  }

  function looksLikeMonthList(value, language) {
    const raw = text(value);
    if (!raw) return false;
    const names = language === 'en' ? MONTHS_EN : MONTHS_TR;
    const tokens = raw.split(/[,–\-]| ve | and /i).map((s) => s.trim()).filter(Boolean);
    if (!tokens.length) return false;
    return tokens.every((tok) => names.some((n) => n.toLowerCase() === tok.toLowerCase()));
  }

  function bestTimeNote(place, language) {
    const direct = language === 'en'
      ? text(place.bestTimeNoteEn)
      : text(place.bestTimeNote);
    const monthsText = formatMonthRanges(place.bestMonths, language);
    const candidate = direct || field(place, language, 'bestTime');
    if (!candidate) return '';
    if (monthsText && candidate === monthsText) return '';
    if (monthsText && candidate.replace(/\s+/g, '') === monthsText.replace(/\s+/g, '').replace(/–/g, '-')) return '';
    if (looksLikeMonthList(candidate, language)) return '';
    return candidate;
  }

  function bestTimeText(place, language) {
    const monthsText = formatMonthRanges(place.bestMonths, language);
    const note = bestTimeNote(place, language);
    if (monthsText && note) return `${monthsText}. ${note}`;
    if (monthsText) return monthsText;
    return note || field(place, language, 'bestTime');
  }

  function placeSectionVisibility(place, lang) {
    const p = place || {};
    const language = lang === 'en' ? 'en' : 'tr';
    const overview = field(p, language, 'overview') || field(p, language, 'description');
    const history = field(p, language, 'history');
    const things = listField(p, language, 'thingsToDo');
    const culture = field(p, language, 'cultureFood');
    const tips = field(p, language, 'travelTips') || field(p, language, 'tips');
    const bestTime = bestTimeText(p, language);
    const howTo = field(p, language, 'howToGetThere');
    const tags = asList(p.tags).map(text).filter(Boolean);
    return {
      overview: !!overview,
      history: !!history,
      things: things.length > 0,
      culture: !!culture,
      tipsText: !!tips,
      bestTime: !!bestTime,
      howToGet: !!howTo,
      tips: !!(tips || bestTime || howTo),
      tags: tags.length > 0,
      texts: {
        overview,
        history,
        things,
        culture,
        tips,
        bestTime,
        howTo,
        tags,
      },
    };
  }

  /** Tarihçe, Yapılacaklar, Kültür, İpuçları — başlığı boş kalanlar. */
  function emptyNamedSections(place, lang) {
    const vis = placeSectionVisibility(place, lang || 'tr');
    const out = [];
    if (!vis.history) out.push('tarihce');
    if (!vis.things) out.push('yapilacaklar');
    if (!vis.culture) out.push('kultur');
    if (!vis.tipsText) out.push('ipuclari');
    return out;
  }

  return {
    placeSectionVisibility,
    emptyNamedSections,
  };
});
