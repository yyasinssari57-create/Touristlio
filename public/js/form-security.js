/**
 * [YÜKSEK-7] Invisible reCAPTCHA v3 + honeypot helpers.
 * Loads Google script only when /api/config/public exposes a site key.
 */
(function (global) {
  let cachedKey = null;
  let scriptPromise = null;
  let cachedCsrf = '';
  let csrfPromise = null;

  function readCsrfCookie() {
    try {
      const m = String(global.document?.cookie || '').match(/(?:^|; )tl_csrf=([^;]*)/);
      return m ? decodeURIComponent(m[1]) : '';
    } catch {
      return '';
    }
  }

  async function ensureCsrf() {
    const fromCookie = readCsrfCookie();
    if (fromCookie) {
      cachedCsrf = fromCookie;
      return cachedCsrf;
    }
    if (cachedCsrf) return cachedCsrf;
    if (csrfPromise) return csrfPromise;
    csrfPromise = (async () => {
      try {
        const res = await fetch('/api/csrf', { credentials: 'include' });
        const data = await res.json().catch(() => ({}));
        cachedCsrf = data.csrfToken || readCsrfCookie() || '';
      } catch {
        cachedCsrf = readCsrfCookie();
      }
      return cachedCsrf;
    })();
    try {
      return await csrfPromise;
    } finally {
      csrfPromise = null;
    }
  }

  function getCsrfToken() {
    return cachedCsrf || readCsrfCookie();
  }

  async function getSiteKey() {
    if (cachedKey !== null) return cachedKey;
    try {
      const res = await fetch('/api/config/public', { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      cachedKey = (data.recaptchaEnabled && data.recaptchaSiteKey) ? String(data.recaptchaSiteKey) : '';
      if (data.csrfToken) cachedCsrf = String(data.csrfToken);
      else if (!cachedCsrf) cachedCsrf = readCsrfCookie();
    } catch {
      cachedKey = '';
    }
    return cachedKey;
  }

  function loadScript(key) {
    if (global.grecaptcha && typeof global.grecaptcha.execute === 'function') {
      return Promise.resolve();
    }
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://www.google.com/recaptcha/api.js?render=' + encodeURIComponent(key);
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        scriptPromise = null;
        reject(new Error('reCAPTCHA yüklenemedi'));
      };
      document.head.appendChild(s);
    });
    return scriptPromise;
  }

  async function token(action) {
    const key = await getSiteKey();
    if (!key) return '';
    try {
      await loadScript(key);
      await new Promise((resolve) => {
        if (global.grecaptcha.ready) global.grecaptcha.ready(resolve);
        else resolve();
      });
      return await global.grecaptcha.execute(key, { action: action || 'submit' });
    } catch {
      return '';
    }
  }

  async function attach(payload, action) {
    const recaptchaToken = await token(action);
    const website = honeypotValue();
    const csrfToken = await ensureCsrf();
    if (payload instanceof FormData) {
      if (recaptchaToken) payload.append('recaptchaToken', recaptchaToken);
      if (!payload.has('website')) payload.append('website', website);
      if (csrfToken && !payload.has('csrfToken')) payload.append('csrfToken', csrfToken);
      return payload;
    }
    const next = payload && typeof payload === 'object' ? { ...payload } : {};
    if (recaptchaToken) next.recaptchaToken = recaptchaToken;
    next.website = website;
    if (csrfToken) next.csrfToken = csrfToken;
    return next;
  }

  function honeypotValue(root) {
    const scope = root || document;
    const el = scope.querySelector && scope.querySelector('input[name="website"]');
    return el ? String(el.value || '') : '';
  }

  function honeypotHtml() {
    return '<div class="tl-hp" aria-hidden="true">'
      + '<label>Website<input type="text" name="website" tabindex="-1" autocomplete="off" value=""/></label>'
      + '</div>';
  }

  global.TL_FORM_SECURITY = {
    token,
    attach,
    honeypotHtml,
    honeypotValue,
    getSiteKey,
    ensureCsrf,
    getCsrfToken,
  };

  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', () => { ensureCsrf(); });
    } else {
      ensureCsrf();
    }
  }
})(window);
