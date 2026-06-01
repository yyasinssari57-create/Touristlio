window.TL_COOKIE = (function () {
  const KEY = 'tl_cookie_ok';

  function t(lang, key) {
    return window.TL_I18N?.t(lang, key) || key;
  }

  function render(lang) {
    if (localStorage.getItem(KEY)) return;
    let bar = document.getElementById('cookieBanner');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'cookieBanner';
      bar.className = 'cookie-banner';
      bar.innerHTML = `
        <p>${t(lang, 'cookieMsg')}</p>
        <div class="cookie-actions">
          <a href="/legal/privacy.html">${t(lang, 'privacyLink')}</a>
          <a href="/legal/kvkk.html">${t(lang, 'legalKvkk')}</a>
          <button type="button" class="btn bp bsm" id="cookieAccept">${t(lang, 'cookieAccept')}</button>
        </div>`;
      document.body.appendChild(bar);
      document.getElementById('cookieAccept').onclick = () => {
        localStorage.setItem(KEY, '1');
        bar.remove();
      };
    }
  }

  return { render };
})();
