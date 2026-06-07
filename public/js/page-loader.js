/** Minimal page transition loader — T (black) + ourist (navy) + lio (blue) */
(function () {
  const MIN_MS = 380;
  let shownAt = 0;
  let hideTimer = null;
  let pending = 0;

  function node() {
    return document.getElementById('pageLoader');
  }

  function markReady() {
    document.documentElement.classList.add('tl-ready');
    if (document.body) document.body.classList.add('tl-ready');
  }

  function showPageLoader() {
    const el = node();
    if (!el) return;
    pending += 1;
    clearTimeout(hideTimer);
    shownAt = Date.now();
    el.classList.add('active');
    el.setAttribute('aria-busy', 'true');
  }

  function hidePageLoader() {
    pending = Math.max(0, pending - 1);
    if (pending > 0) return;
    const el = node();
    if (!el || !el.classList.contains('active')) return;
    const delay = Math.max(0, MIN_MS - (Date.now() - shownAt));
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (pending > 0) return;
      el.classList.remove('active');
      el.setAttribute('aria-busy', 'false');
      markReady();
    }, delay);
  }

  window.TL_LOADER = { show: showPageLoader, hide: hidePageLoader };
})();
