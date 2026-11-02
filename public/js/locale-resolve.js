/**
 * Single language resolver for the early boot script, TL_I18N, and SEO.
 *
 * 1. Explicit /en prefix → en.
 * 2. Unprefixed TR content route (/blog, /places, /explore, /gezilecek-yerler) → tr.
 *    Stored tl_lang is ignored.
 * 3. Bare homepage "/" → stored preference, otherwise tr.
 * 4. Every other unprefixed route → tr. Stored preference is not used.
 *
 * Page load must not rewrite the URL. The EN/TR button calls pathForLang.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TL_LOCALE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function barePath(pathname) {
    let p = String(pathname == null || pathname === '' ? '/' : pathname);
    p = p.split('?')[0].split('#')[0];
    if (!p.startsWith('/')) p = `/${p}`;
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    return p || '/';
  }

  function pathIsEnglish(pathname) {
    const p = barePath(pathname);
    return p === '/en' || p.indexOf('/en/') === 0;
  }

  function stripLangPrefix(pathname) {
    const p = barePath(pathname);
    if (p === '/en') return '/';
    if (p.indexOf('/en/') === 0) return p.slice(3) || '/';
    return p || '/';
  }

  function isHomePath(pathname) {
    return barePath(pathname) === '/';
  }

  function isTrContentPath(pathname) {
    const p = stripLangPrefix(pathname);
    if (p === '/blog' || p.indexOf('/blog/') === 0) return true;
    if (p === '/places' || p.indexOf('/places/') === 0) return true;
    if (p === '/explore' || p.indexOf('/explore/') === 0) return true;
    if (p === '/gezilecek-yerler' || p.indexOf('/gezilecek-yerler/') === 0) return true;
    return false;
  }

  function resolveLocale(pathname, stored) {
    const p = barePath(pathname);
    if (pathIsEnglish(p)) return 'en';
    if (isTrContentPath(p)) return 'tr';
    if (p === '/') return stored === 'en' ? 'en' : 'tr';
    return 'tr';
  }

  function pathForLang(pathname, lang) {
    const rest = stripLangPrefix(pathname);
    if (lang === 'en') return rest === '/' ? '/en/' : `/en${rest}`;
    return rest || '/';
  }

  function buildEarlyBootScript() {
    const js = `(function(){try{var barePath=${barePath.toString()};var pathIsEnglish=${pathIsEnglish.toString()};var stripLangPrefix=${stripLangPrefix.toString()};var isTrContentPath=${isTrContentPath.toString()};var resolveLocale=${resolveLocale.toString()};var p=location.pathname||'/';var s='';try{s=localStorage.getItem('tl_lang')||'';}catch(e){}var lang=resolveLocale(p,s);document.documentElement.lang=lang;document.documentElement.setAttribute('data-tl-lang',lang);}catch(e){}})();`;
    return `<script data-tl-lang-boot>${js}</script>`;
  }

  return {
    barePath,
    pathIsEnglish,
    stripLangPrefix,
    isHomePath,
    isTrContentPath,
    resolveLocale,
    pathForLang,
    buildEarlyBootScript,
  };
});
