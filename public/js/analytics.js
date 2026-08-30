/** Minimal visitor analytics — page views, tab clicks, session duration.
 *  KRİTİK-8: do not send events until KVKK cookie consent (`tl_cookie_ok=1`).
 */
(function () {
  const HEARTBEAT_MS = 30000;
  const CONSENT_KEY = 'tl_cookie_ok';
  let heartbeatTimer = null;
  let ended = false;
  let started = false;

  function hasConsent() {
    try {
      return localStorage.getItem(CONSENT_KEY) === '1';
    } catch {
      return false;
    }
  }

  function currentTab() {
    const page = document.querySelector('.page.active');
    const id = page?.id?.replace('page-', '');
    if (id && id !== 'detail') return id;
    const navOn = document.querySelector('.ntab.on');
    return navOn?.id?.replace('nt-', '') || 'explore';
  }

  function track(type, extra) {
    if (!hasConsent()) return;
    if (ended && type !== 'page_view') return;
    const body = {
      type,
      path: location.pathname + location.search,
      ...(extra || {}),
    };
    fetch('/api/analytics/track', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: type === 'session_end',
    }).catch(() => {});
  }

  function startHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => track('heartbeat'), HEARTBEAT_MS);
  }

  function endSession() {
    if (ended) return;
    ended = true;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    track('session_end');
  }

  function syncConsentCookie() {
    if (!hasConsent()) return;
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${CONSENT_KEY}=1; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  }

  function startTracking() {
    if (started || !hasConsent()) return;
    syncConsentCookie();
    started = true;
    ended = false;
    track('page_view', { tab: currentTab() });
    startHeartbeat();
    window.addEventListener('pagehide', endSession);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') endSession();
      else if (!ended) startHeartbeat();
    });
  }

  window.TL_ANALYTICS = {
    hasConsent,
    startTracking,
    trackTab(tab) {
      if (!tab || tab === 'detail' || !hasConsent()) return;
      track('tab_click', { tab });
    },
  };

  window.addEventListener('tl-cookie-consent', () => {
    if (hasConsent()) startTracking();
  });

  function boot() {
    if (hasConsent()) startTracking();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
