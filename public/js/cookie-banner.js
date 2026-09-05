window.TL_COOKIE = (function () {
  const KEY = 'tl_cookie_ok';
  const AUDIT_KEY = 'cookie_consent';

  function t(lang, key) {
    return window.TL_I18N?.t(lang, key) || key;
  }

  function hasConsent() {
    try {
      if (localStorage.getItem(KEY) === '1') return true;
      if (localStorage.getItem(KEY) === '0') return false;
      return localStorage.getItem(AUDIT_KEY) === 'accepted';
    } catch {
      return false;
    }
  }

  function decided() {
    try {
      const v = localStorage.getItem(KEY);
      if (v === '1' || v === '0') return true;
      const alt = localStorage.getItem(AUDIT_KEY);
      return alt === 'accepted' || alt === 'rejected';
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

  function persistChoice(accepted) {
    try {
      localStorage.setItem(KEY, accepted ? '1' : '0');
      localStorage.setItem(AUDIT_KEY, accepted ? 'accepted' : 'rejected');
    } catch { /* ignore */ }
    setConsentCookie(accepted ? '1' : '0');
  }

  function accept(bar) {
    persistChoice(true);
    bar?.remove();
    notify();
    window.TL_ANALYTICS?.loadAnalytics?.();
  }

  function reject(bar) {
    persistChoice(false);
    bar?.remove();
    notify();
  }

  function render(lang) {
    if (decided()) return;
    let bar = document.getElementById('cookieBanner');
    const created = !bar;
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'cookieBanner';
      bar.className = 'cookie-banner';
      bar.setAttribute('role', 'dialog');
      bar.setAttribute('aria-live', 'polite');
    }
    bar.setAttribute('aria-label', t(lang, 'cookieMsg'));
    bar.innerHTML = `
        <p>${t(lang, 'cookieMsg')}</p>
        <div class="cookie-actions">
          <a href="/legal/privacy.html">${t(lang, 'privacyLink')}</a>
          <a href="/legal/kvkk.html">${t(lang, 'legalKvkk')}</a>
          <button type="button" class="btn bo bsm" id="cookieReject">${t(lang, 'cookieReject')}</button>
          <button type="button" class="btn bp bsm" id="cookieAccept">${t(lang, 'cookieAccept')}</button>
        </div>`;
    if (created) document.body.appendChild(bar);
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
