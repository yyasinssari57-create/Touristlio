/**
 * Homepage / explore meta counts. Real published numbers, no fixed 1.090.
 * Shared by the server (require) and the browser (TL_PLACE_COUNTS).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.TL_PLACE_COUNTS = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function formatCount(n, lang) {
    const value = Number(n);
    if (!Number.isFinite(value) || value < 0) return '';
    return Math.floor(value).toLocaleString(lang === 'en' ? 'en-US' : 'tr-TR');
  }

  function hasCounts(counts) {
    return !!(counts
      && Number(counts.places) > 0
      && Number.isFinite(Number(counts.countries))
      && Number(counts.countries) >= 0);
  }

  function shellDescription(kind, lang, counts) {
    const en = lang === 'en';
    const live = hasCounts(counts);
    const countries = live ? formatCount(counts.countries, lang) : '';
    const places = live ? formatCount(counts.places, lang) : '';
    if (kind === 'explore') {
      if (en) {
        return live
          ? `${places} destinations in ${countries} countries. Filter by city, category, and rating. Real traveler Tiola reviews.`
          : 'Filter by city, category, and rating. Real traveler Tiola reviews.';
      }
      return live
        ? `${countries} ülkede ${places} destinasyon. Şehre, kategoriye, puana göre filtrele. Gerçek gezginlerin Tiola değerlendirmeleri.`
        : 'Şehre, kategoriye, puana göre filtrele. Gerçek gezginlerin Tiola değerlendirmeleri.';
    }
    if (en) {
      const base = 'From hidden gems to iconic landmarks, discover beautiful places through real traveler Tiola reviews.';
      return live ? `${base} ${countries} countries, ${places} destinations.` : base;
    }
    const base = 'Gizli köşelerden ikonik yapılara, gerçek gezginlerin Tiola deneyimleriyle dünyanın en güzel yerlerini keşfet.';
    return live ? `${base} ${countries} ülke, ${places} destinasyon.` : base;
  }

  return { formatCount, hasCounts, shellDescription };
});
