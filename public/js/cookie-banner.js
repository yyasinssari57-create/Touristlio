window.TL_COOKIE = (function () {
  const KEY = 'tl_cookie_ok';

  function t(lang, key) {
    return window.TL_I18N?.t(lang, key) || key;
  }

  function hasConsent() {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  }

  function decided() {
    try {
      const v = localStorage.getItem(KEY);
      return v === '1' || v === '0';
    } catch {
      return false;
    }
  }

  function notify() {
    window.dispatchEvent(new CustomEvent('tl-cookie-consent', {
      detail: { accepted: hasConsent() },
    }));
  }

  function setConsentCookie(value) {
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${KEY}=${value}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  }

  function accept(bar) {
    try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ }
    setConsentCookie('1');
    bar?.remove();
    notify();
  }

  function reject(bar) {
    try { localStorage.setItem(KEY, '0'); } catch { /* ignore */ }
    setConsentCookie('0');
    bar?.remove();
    notify();
  }

  function render(lang) {
    if (decided()) return;
    let bar = document.getElementById('cookieBanner');
    if (bar) return;
    bar = document.createElement('div');
    bar.id = 'cookieBanner';
    bar.className = 'cookie-banner';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-live', 'polite');
    bar.innerHTML = `
        <p>${t(lang, 'cookieMsg')}</p>
        <div class="cookie-actions">
          <a href="/legal/privacy.html">${t(lang, 'privacyLink')}</a>
          <a href="/legal/kvkk.html">${t(lang, 'legalKvkk')}</a>
          <button type="button" class="btn bo bsm" id="cookieReject">${t(lang, 'cookieReject')}</button>
          <button type="button" class="btn bp bsm" id="cookieAccept">${t(lang, 'cookieAccept')}</button>
        </div>`;
    document.body.appendChild(bar);
    document.getElementById('cookieAccept').onclick = () => accept(bar);
    document.getElementById('cookieReject').onclick = () => reject(bar);
  }

  function boot() {
    const lang = localStorage.getItem('tl_lang') || 'tr';
    render(lang);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  return { render, hasConsent, accept, reject };
})();
