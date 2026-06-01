/** Skeleton loaders with shimmer — fixed dimensions, no layout shift */
window.TL_SKELETON = (function () {
  const SHIM = 'sk-shimmer';

  function card(n = 8) {
    return Array(n).fill(0).map(() => `
      <div class="pc sk ${SHIM}">
        <div class="pc-img sk-block" style="min-height:160px"></div>
        <div class="pc-body">
          <div class="sk-line sk-w70"></div>
          <div class="sk-line sk-w90"></div>
          <div class="sk-line sk-w50"></div>
        </div>
      </div>`).join('');
  }

  function searchDrop(n = 5) {
    return Array(n).fill(0).map(() => `
      <div class="sd-item sk ${SHIM}">
        <div class="sd-img sk-block"></div>
        <div style="flex:1"><div class="sk-line sk-w80"></div><div class="sk-line sk-w60"></div></div>
      </div>`).join('');
  }

  function gallery(n = 4) {
    return Array(n).fill(0).map(() => `<div class="pd-gal-thumb sk-block ${SHIM}"></div>`).join('');
  }

  function detail() {
    return `
      <div class="sk-detail ${SHIM}">
        <div class="sk-block sk-hero"></div>
        <div class="sk-line sk-w90"></div>
        <div class="sk-line sk-w70"></div>
        <div class="sk-line sk-w100"></div>
        <div class="sk-line sk-w80"></div>
      </div>`;
  }

  function profileStats() {
    return `
      <div class="sk-profile ${SHIM}">
        <div class="sk-av sk-block"></div>
        <div class="sk-line sk-w60"></div>
        <div class="sk-line sk-w40"></div>
      </div>`;
  }

  return { card, searchDrop, gallery, detail, profileStats, SHIM };
})();
