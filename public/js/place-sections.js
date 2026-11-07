/**
 * V4 Adım 6 — mekân sayfasında boş bölüm.
 * İçerik yoksa sekme ve başlık gösterilmez. "—" yer tutucu içerik sayılmaz.
 * İngilizce boşsa Türkçe metne düşülür (placeField ile aynı).
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
    if (lang === 'en') {
      const en = text(place[`${base}En`]);
      if (en) return en;
    }
    return text(place[base]);
  }

  function listField(place, lang, base) {
    const key = lang === 'en' ? `${base}En` : base;
    const primary = asList(place[key]);
    const vals = primary.length ? primary : asList(place[base]);
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

  function bestTimeText(place, language) {
    const months = normalizeMonths(place.bestMonths);
    if (months.length) {
      const names = language === 'en' ? MONTHS_EN : MONTHS_TR;
      return months.map((m) => names[m - 1]).filter(Boolean).join(', ');
    }
    return field(place, language, 'bestTime');
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
