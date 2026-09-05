/**
 * [v2 ORTA-1] Skip link, form labels, icon-button names, keyboard widgets.
 */
(function (global) {
  const WIDGET_SEL = [
    '.ntab', '.etab', '.atab', '.hpl', '.lb', '.fpill', '.cpill', '.fchip',
    '.dtab', '.ptab', '.sd-item', '.bcat-chip', '.pc-save', '.pc[onclick]',
    '.discover-cat-chip', '.discover-place-card', '.star-btn', '[role="button"]',
  ].join(',');

  function lang() {
    try { return localStorage.getItem('tl_lang') || 'tr'; } catch { return 'tr'; }
  }

  function t(key, fallback) {
    return (global.TL_I18N && global.TL_I18N.t(lang(), key)) || fallback || key;
  }

  function ensureSkipLink() {
    if (document.querySelector('.skip-link')) return;
    const a = document.createElement('a');
    a.className = 'skip-link';
    a.href = '#main-content';
    a.setAttribute('data-i18n', 'skipLink');
    a.textContent = t('skipLink', 'İçeriğe geç');
    document.body.insertBefore(a, document.body.firstChild);
    if (!document.getElementById('main-content')) {
      const target = document.querySelector(
        'main, article.legal-wrap, .auth-page-box, .error-box, .page.active, .admin-login, .search-page, .profile-wrap'
      );
      if (target && !target.id) {
        target.id = 'main-content';
        target.setAttribute('tabindex', '-1');
      }
    }
  }

  function unlabeledControl(el) {
    if (!el) return false;
    const type = String(el.type || '').toLowerCase();
    if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'reset' || type === 'image') return false;
    if (el.closest('[aria-hidden="true"], .srch-autofill-trap, .tl-hp')) return false;
    if (el.closest('label')) return false;
    const id = el.id;
    if (id) {
      try {
        if (document.querySelector('label[for="' + CSS.escape(id) + '"]')) return false;
      } catch {
        if (document.querySelector('label[for="' + id.replace(/"/g, '') + '"]')) return false;
      }
    }
    return true;
  }

  function ensureLabels(root) {
    const scope = root && root.querySelectorAll ? root : document;
    const list = [];
    if (scope.matches && scope.matches('input, select, textarea') && unlabeledControl(scope)) list.push(scope);
    if (scope.querySelectorAll) {
      scope.querySelectorAll('input, select, textarea').forEach((el) => {
        if (unlabeledControl(el)) list.push(el);
      });
    }
    list.forEach((el) => {
      let id = el.id;
      if (!id) {
        id = 'tl-a11y-' + Math.random().toString(36).slice(2, 10);
        el.id = id;
      }
      const name = el.getAttribute('aria-label')
        || el.getAttribute('placeholder')
        || el.getAttribute('name')
        || el.getAttribute('title')
        || 'Alan';
      if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', name);
      const lab = document.createElement('label');
      lab.className = 'sr-only';
      lab.htmlFor = id;
      lab.textContent = name;
      el.parentNode.insertBefore(lab, el);
    });
  }

  function hasAccessibleName(el) {
    if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return true;
    const txt = String(el.textContent || '').replace(/\s+/g, '');
    return /[\p{L}\p{N}]/u.test(txt);
  }

  function nameIconControls(root) {
    const scope = root && root.querySelectorAll ? root : document;
    const sel = '.aclose, .pc-save, .pd-save, .nav-toggle, .filter-sheet-close, .avatar-crop-zoom-btn, .place-crop-zoom-btn';
    const nodes = [];
    if (scope.matches && scope.matches(sel)) nodes.push(scope);
    if (scope.querySelectorAll) scope.querySelectorAll(sel).forEach((el) => nodes.push(el));
    nodes.forEach((el) => {
      if (hasAccessibleName(el)) return;
      if (el.classList.contains('aclose')) el.setAttribute('aria-label', t('closeAria', 'Kapat'));
      else if (el.classList.contains('pc-save') || el.classList.contains('pd-save')) {
        const name = (el.getAttribute('data-place-name')
          || (el.closest('.pc') && el.closest('.pc').querySelector('.pc-name')
            && el.closest('.pc').querySelector('.pc-name').textContent)
          || '').trim();
        const base = t('saveAria', 'Favorilere ekle');
        el.setAttribute('aria-label', name ? base + ': ' + name : base);
      } else if (el.classList.contains('nav-toggle')) {
        el.setAttribute('aria-label', t('menuAria', 'Menü'));
      } else {
        el.setAttribute('aria-label', t('closeAria', 'Kapat'));
      }
    });
  }

  function enhanceWidgets(root) {
    const scope = root && root.querySelectorAll ? root : document;
    const add = (el) => {
      if (!el || !el.matches) return;
      if (el.classList.contains('sk') || el.closest('.skeleton')) return;
      if (el.matches('a, button, input, select, textarea, summary')) return;
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
      if (!el.getAttribute('role')) el.setAttribute('role', 'button');
    };
    if (scope.matches && (scope.matches(WIDGET_SEL) || scope.hasAttribute('onclick'))) add(scope);
    if (scope.querySelectorAll) {
      scope.querySelectorAll(WIDGET_SEL + ', [onclick]').forEach(add);
    }
    nameIconControls(scope);
  }

  function onKeydown(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target;
    if (!el || !el.matches) return;
    if (el.matches('a, button, input, select, textarea, summary, [contenteditable="true"]')) return;
    const isWidget = el.matches(WIDGET_SEL) || el.getAttribute('role') === 'button' || el.hasAttribute('onclick');
    if (!isWidget) return;
    e.preventDefault();
    el.click();
  }

  function boot() {
    ensureSkipLink();
    ensureLabels(document);
    enhanceWidgets(document);
    document.addEventListener('keydown', onKeydown);
    if (typeof MutationObserver === 'undefined' || !document.body) return;
    const mo = new MutationObserver((muts) => {
      muts.forEach((m) => {
        m.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          ensureLabels(n);
          enhanceWidgets(n);
        });
      });
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  global.TL_A11Y = { ensureLabels, enhanceWidgets, ensureSkipLink };
})(typeof window !== 'undefined' ? window : globalThis);
