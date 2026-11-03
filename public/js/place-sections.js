/**
 * V4 Adım 6 — mekân sayfasında boş bölüm.
 * İçerik yoksa sekme ve başlık gösterilmez. "—" yer tutucu içerik sayılmaz.
 * İngilizce boşsa Türkçe metne düşülür (placeField ile aynı). Adım 8 noindex burada yok.
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

  function placeSectionVisibility(place, lang) {
    const p = place || {};
    const language = lang === 'en' ? 'en' : 'tr';
    const overview = field(p, language, 'overview') || field(p, language, 'description');
    const history = field(p, language, 'history');
    const things = listField(p, language, 'thingsToDo');
    const culture = field(p, language, 'cultureFood');
    const tips = field(p, language, 'travelTips') || field(p, language, 'tips');
    const bestTime = field(p, language, 'bestTime');
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
