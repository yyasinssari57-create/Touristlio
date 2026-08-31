/**
 * [ORTA-2] Explore search/filter URL state.
 * Shareable query: /explore?country=turkey&category=nature&score=4
 * Also loadable from Node for verify:search-filters.
 */
(function (root) {
  'use strict';

  const SEARCH_DEBOUNCE_MS = 300;
  const DEFAULT_PAGE_LIMIT = 20;

  /** Key order matches the audit example first, then extra filters, then page. */
  const QUERY_KEYS = [
    'country', 'category', 'score', 'q', 'group',
    'city', 'district', 'continent', 'entry', 'local', 'sort', 'page',
  ];

  function slugifyFilter(value) {
    return String(value || '')
      .replace(/\s[\u{1F1E0}-\u{1F1FF}]{2}/gu, '')
      .replace(/İ/g, 'i')
      .replace(/I/g, 'i')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ı/g, 'i')
      .replace(/ğ/g, 'g')
      .replace(/ş/g, 's')
      .replace(/ö/g, 'o')
      .replace(/ü/g, 'u')
      .replace(/ç/g, 'c')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function isEmptyFilterValue(key, val) {
    if (val == null) return true;
    if (val === '' || val === 'all' || val === 'popularity') return true;
    if (key === 'score' && (val === 0 || val === '0')) return true;
    if (key === 'page' && (val === 1 || val === '1')) return true;
    return false;
  }

  function buildExploreSearch(state) {
    const qs = new URLSearchParams();
    const s = state || {};
    QUERY_KEYS.forEach((key) => {
      let val = s[key];
      if (isEmptyFilterValue(key, val)) return;
      if (key === 'country' || key === 'city' || key === 'district' || key === 'continent') {
        val = slugifyFilter(val);
      } else {
        val = String(val).trim();
      }
      if (!val || val === 'all') return;
      qs.set(key, val);
    });
    return qs;
  }

  function parseExploreSearch(search) {
    const params = typeof search === 'string'
      ? new URLSearchParams(search.replace(/^\?/, ''))
      : (search && typeof search.get === 'function' ? search : new URLSearchParams());
    const scoreRaw = params.get('score') || params.get('minTiola') || '';
    const score = Number(scoreRaw);
    return {
      q: (params.get('q') || '').trim(),
      country: (params.get('country') || '').trim(),
      category: (params.get('category') || '').trim(),
      group: (params.get('group') || '').trim(),
      city: (params.get('city') || '').trim(),
      district: (params.get('district') || '').trim(),
      continent: (params.get('continent') || '').trim(),
      score: Number.isFinite(score) && score > 0 ? score : 0,
      entry: (params.get('entry') || '').trim(),
      local: (params.get('local') || '').trim(),
      sort: (params.get('sort') || '').trim(),
      page: Math.max(Number(params.get('page')) || 1, 1),
    };
  }

  function hasExploreFilters(state) {
    const copy = { ...(state || {}), page: 1 };
    return buildExploreSearch(copy).toString().length > 0;
  }

  /** Compact page list: 1 … 4 5 6 … 20 */
  function pageWindow(current, totalPages, radius) {
    const total = Math.max(1, Math.floor(Number(totalPages) || 1));
    const cur = Math.min(Math.max(1, Math.floor(Number(current) || 1)), total);
    const r = Number.isFinite(Number(radius)) ? Math.max(0, Math.floor(Number(radius))) : 2;
    const pages = [];
    const start = Math.max(1, cur - r);
    const end = Math.min(total, cur + r);
    if (start > 1) {
      pages.push(1);
      if (start > 2) pages.push('…');
    }
    for (let i = start; i <= end; i += 1) pages.push(i);
    if (end < total) {
      if (end < total - 1) pages.push('…');
      pages.push(total);
    }
    return pages;
  }

  function explorePathWithQuery(state, lang) {
    const qs = buildExploreSearch(state).toString();
    const prefix = lang === 'en' ? '/en' : '';
    return qs ? `${prefix}/explore?${qs}` : `${prefix}/explore`;
  }

  const api = {
    SEARCH_DEBOUNCE_MS,
    DEFAULT_PAGE_LIMIT,
    QUERY_KEYS,
    slugifyFilter,
    buildExploreSearch,
    parseExploreSearch,
    hasExploreFilters,
    explorePathWithQuery,
    pageWindow,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) root.TL_EXPLORE_QUERY = api;
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
