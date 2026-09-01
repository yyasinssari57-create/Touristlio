/** [DÜŞÜK-3] Place-card skeletons + button loading spinner (palette: --l / --l2 / --b). */
window.TL_SKELETON = (function () {
  const SHIM = 'sk-shimmer';

  function loadingLabel() {
    try {
      const lang = localStorage.getItem('tl_lang') || 'tr';
      return (window.TL_I18N && window.TL_I18N.t(lang, 'loadingAria')) || (lang === 'en' ? 'Loading' : 'Yükleniyor');
    } catch {
      return 'Yükleniyor';
    }
  }

  function card(n = 8) {
    const count = Math.max(1, Number(n) || 8);
    return Array(count).fill(0).map(() => `
      <div class="pc sk ${SHIM}" aria-hidden="true">
        <div class="pc-img sk-block"></div>
        <div class="pc-body">
          <div class="sk-line sk-w70"></div>
          <div class="sk-line sk-w90"></div>
          <div class="sk-line sk-w50"></div>
        </div>
      </div>`).join('');
  }

  function searchDrop(n = 5) {
    const count = Math.max(1, Number(n) || 5);
    return Array(count).fill(0).map(() => `
      <div class="sd-item sk ${SHIM}" aria-hidden="true">
        <div class="sd-img sk-block"></div>
        <div style="flex:1"><div class="sk-line sk-w80"></div><div class="sk-line sk-w60"></div></div>
      </div>`).join('');
  }

  function list(n = 4) {
    const count = Math.max(1, Number(n) || 4);
    return Array(count).fill(0).map(() => `
      <div class="discover-place-card sk ${SHIM}" aria-hidden="true">
        <div class="sk-block sk-thumb"></div>
        <div style="flex:1">
          <div class="sk-line sk-w70"></div>
          <div class="sk-line sk-w50"></div>
        </div>
      </div>`).join('');
  }

  function gallery(n = 4) {
    return Array(n).fill(0).map(() => `<div class="pd-gal-thumb sk-block ${SHIM}" aria-hidden="true"></div>`).join('');
  }

  function detail() {
    return `
      <div class="sk-detail ${SHIM}" aria-hidden="true">
        <div class="sk-block sk-hero"></div>
        <div class="sk-line sk-w90"></div>
        <div class="sk-line sk-w70"></div>
        <div class="sk-line sk-w100"></div>
        <div class="sk-line sk-w80"></div>
      </div>`;
  }

  function profileStats() {
    return `
      <div class="sk-profile ${SHIM}" aria-hidden="true">
        <div class="sk-av sk-block"></div>
        <div class="sk-line sk-w60"></div>
        <div class="sk-line sk-w40"></div>
      </div>`;
  }

  function fill(el, html, opts) {
    if (!el) return;
    const o = opts || {};
    el.classList.add('skeleton');
    el.setAttribute('aria-busy', 'true');
    el.setAttribute('aria-label', o.label || loadingLabel());
    el.innerHTML = html;
  }

  function fillCards(el, n) {
    fill(el, card(n));
  }

  function clear(el) {
    if (!el) return;
    el.classList.remove('skeleton');
    el.removeAttribute('aria-busy');
    el.removeAttribute('aria-label');
  }

  function button(btn, loading, opts) {
    if (!btn) return;
    const o = opts || {};
    if (loading) {
      if (btn.dataset.tlBusy === '1') return;
      btn.dataset.tlBusy = '1';
      btn.dataset.tlHtml = btn.innerHTML;
      btn.classList.add('is-loading');
      btn.setAttribute('aria-busy', 'true');
      if (!btn.disabled) btn.dataset.tlWasDisabled = '0';
      else btn.dataset.tlWasDisabled = '1';
      btn.disabled = true;
      const spin = '<span class="btn-spinner" aria-hidden="true"></span>';
      if (o.replace) btn.innerHTML = spin;
      else if (!btn.querySelector('.btn-spinner')) btn.insertAdjacentHTML('afterbegin', spin);
    } else {
      const html = btn.dataset.tlHtml;
      const wasDisabled = btn.dataset.tlWasDisabled === '1';
      btn.dataset.tlBusy = '';
      delete btn.dataset.tlHtml;
      delete btn.dataset.tlWasDisabled;
      btn.classList.remove('is-loading');
      btn.removeAttribute('aria-busy');
      if (!wasDisabled) btn.disabled = false;
      if (html != null) btn.innerHTML = html;
      else btn.querySelectorAll('.btn-spinner').forEach((s) => s.remove());
    }
  }

  return {
    card, searchDrop, list, gallery, detail, profileStats,
    fill, fillCards, clear, button, loadingLabel, SHIM,
  };
})();
window.TL_LOADING = window.TL_SKELETON;
