/** Visitor analytics — page views, tab clicks, session duration, Core Web Vitals.
 *  KVKK / v2 ORTA-3: do not send events, load GA4, or report web-vitals until cookie consent.
 *  Real key is `tl_cookie_ok=1` (DÜŞÜK-6). Audit name `cookie_consent=accepted` is also accepted.
 *  `loadAnalytics` is the audit name for the consent-gated start (DOMContentLoaded + banner accept).
 *  Library: 'web-vitals' (vendored IIFE).
 */
(function () {
  const HEARTBEAT_MS = 30000;
  const CONSENT_KEY = 'tl_cookie_ok';
  const AUDIT_KEY = 'cookie_consent';
  const WEB_VITALS_SRC = '/vendor/web-vitals/web-vitals.iife.js';
  let heartbeatTimer = null;
  let ended = false;
  let started = false;
  let gaId = '';
  let gaLoading = false;
  let vitalsStarted = false;

  function hasConsent() {
    try {
      if (localStorage.getItem(CONSENT_KEY) === '1') return true;
      if (localStorage.getItem(CONSENT_KEY) === '0') return false;
      return localStorage.getItem(AUDIT_KEY) === 'accepted';
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
    if (ended && type !== 'page_view' && type !== 'web_vital') return;
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
      keepalive: type === 'session_end' || type === 'web_vital',
    }).catch(() => {});
  }

  function sendGaPageView(tab) {
    if (!hasConsent() || typeof window.gtag !== 'function') return;
    window.gtag('event', 'page_view', {
      page_path: location.pathname + location.search,
      page_title: tab || document.title,
      page_location: location.href,
    });
  }

  function sendGaEvent(name, params) {
    if (!hasConsent() || typeof window.gtag !== 'function') return;
    window.gtag('event', name, params || {});
  }

  function loadGa4(id) {
    if (!hasConsent() || !id || gaLoading) return;
    if (document.getElementById('tl-ga4')) {
      gaLoading = true;
      return;
    }
    gaLoading = true;
    gaId = id;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', id, {
      anonymize_ip: true,
      send_page_view: false,
    });
    const s = document.createElement('script');
    s.id = 'tl-ga4';
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    s.onload = () => sendGaPageView(currentTab());
    document.head.appendChild(s);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src^="${src.split('?')[0]}"]`);
      if (existing) {
        if (window.webVitals) resolve();
        else existing.addEventListener('load', () => resolve(), { once: true });
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('web-vitals'));
      document.head.appendChild(s);
    });
  }

  function reportVital(metric) {
    if (!hasConsent() || !metric || !metric.name) return;
    track('web_vital', { tab: metric.name });
    const isCls = metric.name === 'CLS';
    sendGaEvent(metric.name, {
      value: isCls ? Math.round(metric.delta * 1000) : Math.round(metric.delta),
      event_category: 'Web Vitals',
      event_label: metric.id,
      non_interaction: true,
      metric_id: metric.id,
      metric_value: metric.value,
      metric_delta: metric.delta,
      metric_rating: metric.rating,
    });
  }

  function startWebVitals() {
    if (vitalsStarted || !hasConsent()) return;
    vitalsStarted = true;
    loadScript(WEB_VITALS_SRC).then(() => {
      const wv = window.webVitals;
      if (!wv || !hasConsent()) return;
      if (typeof wv.onCLS === 'function') wv.onCLS(reportVital);
      if (typeof wv.onINP === 'function') wv.onINP(reportVital);
      if (typeof wv.onLCP === 'function') wv.onLCP(reportVital);
      if (typeof wv.onFCP === 'function') wv.onFCP(reportVital);
      if (typeof wv.onTTFB === 'function') wv.onTTFB(reportVital);
    }).catch(() => {});
  }

  function loadPublicConfig() {
    return fetch('/api/config/public', { credentials: 'include' })
      .then((r) => r.json())
      .catch(() => ({}));
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
    loadPublicConfig().then((cfg) => {
      if (!hasConsent()) return;
      if (cfg.gaEnabled && cfg.gaMeasurementId) loadGa4(cfg.gaMeasurementId);
      startWebVitals();
    });
  }

  /** Audit ORTA-3 name. No-op without consent; never hardcodes a G- id. */
  function loadAnalytics() {
    if (!hasConsent()) return;
    startTracking();
  }

  window.TL_ANALYTICS = {
    hasConsent,
    startTracking,
    loadAnalytics,
    trackTab(tab) {
      if (!tab || tab === 'detail' || !hasConsent()) return;
      track('tab_click', { tab });
      sendGaEvent('tab_click', { tab });
      sendGaPageView(tab);
    },
  };

  window.addEventListener('tl-cookie-consent', (ev) => {
    if (ev?.detail?.accepted === false) return;
    loadAnalytics();
  });

  function boot() {
    loadAnalytics();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
