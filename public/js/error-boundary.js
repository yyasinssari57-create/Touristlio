/**
 * Vanilla JS equivalent of a React ErrorBoundary.
 * Global window.onerror / unhandledrejection + per-section fallbacks
 * (map, Tiola list, forms). Error details only in development.
 */
(function () {
  if (window.TL_ERROR_BOUNDARY) return;

  var OVERLAY_ID = 'tl-error-overlay';
  var DETAIL_MAX = 4000;
  var shownGlobal = false;
  var shownZones = {};

  var COPY = {
    tr: {
      oops: 'Bir şeyler ters gitti',
      home: 'Ana Sayfaya Dön',
      reload: 'Sayfayı Yenile',
    },
    en: {
      oops: 'Something went wrong',
      home: 'Back to Home',
      reload: 'Reload Page',
    },
  };

  function lang() {
    try {
      var stored = localStorage.getItem('tl_lang');
      if (stored === 'en' || stored === 'tr') return stored;
    } catch { /* private mode */ }
    var htmlLang = (document.documentElement && document.documentElement.lang) || '';
    return htmlLang.toLowerCase().indexOf('en') === 0 ? 'en' : 'tr';
  }

  function t(key) {
    var dict = COPY[lang()] || COPY.tr;
    if (window.TL_I18N && typeof window.TL_I18N.t === 'function') {
      var map = { oops: 'errOops', home: 'errHomeCta', reload: 'errReload' };
      var translated = window.TL_I18N.t(lang(), map[key]);
      if (translated && translated !== map[key]) return translated;
    }
    return dict[key] || COPY.tr[key];
  }

  function isDev() {
    if (window.__TL_DEV__ === true) return true;
    if (window.__TL_DEV__ === false) return false;
    var el = document.documentElement;
    var attr = el && el.getAttribute('data-tl-dev');
    if (attr === '1' || attr === 'true') return true;
    if (attr === '0' || attr === 'false') return false;
    var host = '';
    try { host = location.hostname || ''; } catch { /* ignore */ }
    return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '[::1]' || host === '::1';
  }

  function silenceProdConsole() {
    if (isDev()) return;
    try {
      var c = window.console;
      if (!c) return;
      var noop = function () {};
      c.log = noop;
      c.debug = noop;
      c.info = noop;
      c.warn = noop;
    } catch { /* ignore */ }
  }
  silenceProdConsole();

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function errText(err) {
    if (!err) return '';
    if (typeof err === 'string') return err;
    var msg = err.message || String(err);
    var stack = err.stack ? '\n' + err.stack : '';
    return (msg + stack).slice(0, DETAIL_MAX);
  }

  function isIgnored(err) {
    if (!err) return true;
    if (typeof err === 'object' && err.status) return true;
    var name = err.name || '';
    if (name === 'AbortError') return true;
    var msg = String(err.message || err);
    if (/ResizeObserver loop/i.test(msg)) return true;
    if (/Loading chunk/i.test(msg)) return false;
    return false;
  }

  function zoneFromError(err, hint) {
    if (hint) return hint;
    var stack = '';
    var src = '';
    if (err && typeof err === 'object') {
      stack = String(err.stack || '');
      src = String(err.filename || err.fileName || '');
    }
    var hay = (stack + ' ' + src).toLowerCase();
    if (/\/js\/map\.js|\/js\/map-discover\.js|\/vendor\/leaflet/.test(hay)) return 'map';
    if (/loadtiolafeed|rendertiolacard|renderrevlist|tiolafeed/.test(hay)) return 'tiolas';
    if (/posttiola|buildauthform|updaterevform|contactform|dologinsubmit|doregsubmit/.test(hay)) return 'form';
    return null;
  }

  function hideLoader() {
    try {
      if (window.TL_LOADER && typeof window.TL_LOADER.hide === 'function') window.TL_LOADER.hide();
      var loader = document.getElementById('pageLoader');
      if (loader) {
        loader.classList.remove('active');
        loader.setAttribute('aria-busy', 'false');
      }
      if (document.documentElement) document.documentElement.classList.add('tl-ready');
      if (document.body) document.body.classList.add('tl-ready');
    } catch { /* ignore */ }
  }

  function detailHtml(err) {
    if (!isDev()) return '';
    var text = errText(err);
    if (!text) return '';
    return '<pre class="tl-error-detail">' + escapeHtml(text) + '</pre>';
  }

  function actionsHtml() {
    return '<div class="error-actions tl-error-actions">'
      + '<a href="/" class="btn bp">' + escapeHtml(t('home')) + '</a>'
      + '<button type="button" class="btn bo" data-tl-error-reload="1">' + escapeHtml(t('reload')) + '</button>'
      + '</div>';
  }

  function bindReload(root) {
    if (!root) return;
    root.querySelectorAll('[data-tl-error-reload]').forEach(function (btn) {
      btn.addEventListener('click', function () { location.reload(); });
    });
  }

  function ensureOverlayStyles() {
    if (document.getElementById('tl-error-boundary-css')) return;
    var style = document.createElement('style');
    style.id = 'tl-error-boundary-css';
    style.textContent = ''
      + '#' + OVERLAY_ID + '{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;'
      + 'background:#f2f8ff;padding:24px;font-family:Inter,"Segoe UI",system-ui,sans-serif;}'
      + '#' + OVERLAY_ID + ' .error-box{text-align:center;max-width:440px;}'
      + '#' + OVERLAY_ID + ' h1,#tl-error-overlay .tl-error-title{font-size:1.45rem;color:#0c2340;margin:0 0 10px;font-weight:700;}'
      + '.tl-error-fallback{padding:20px 16px;text-align:center;background:var(--w,#fff);border:1.5px solid var(--l2,#dceeff);'
      + 'border-radius:12px;color:var(--navy,#0c2340);}'
      + '.tl-error-fallback .tl-error-title{font-size:1.05rem;font-weight:700;margin:0 0 8px;}'
      + '.tl-error-detail{display:block;text-align:left;max-height:180px;overflow:auto;margin:12px 0 0;padding:10px;'
      + 'font-size:.72rem;background:#0c2340;color:#e2e8f0;border-radius:8px;white-space:pre-wrap;word-break:break-word;}'
      + '.tl-error-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:16px;}';
    (document.head || document.documentElement).appendChild(style);
  }

  function showGlobal(err) {
    if (shownGlobal) return true;
    shownGlobal = true;
    hideLoader();
    ensureOverlayStyles();
    var existing = document.getElementById(OVERLAY_ID);
    if (existing) existing.remove();
    var overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.setAttribute('role', 'alert');
    overlay.setAttribute('aria-live', 'assertive');
    overlay.innerHTML = '<div class="error-box">'
      + '<p class="tl-error-title">' + escapeHtml(t('oops')) + '</p>'
      + actionsHtml()
      + detailHtml(err)
      + '</div>';
    bindReload(overlay);
    (document.body || document.documentElement).appendChild(overlay);
    return true;
  }

  function zoneSelector(zone) {
    return '[data-error-boundary="' + zone + '"]';
  }

  function showSection(zone, err) {
    if (!zone) return showGlobal(err);
    var nodes = document.querySelectorAll(zoneSelector(zone));
    if (!nodes.length) return showGlobal(err);
    if (shownZones[zone]) return true;
    shownZones[zone] = true;
    ensureOverlayStyles();
    nodes.forEach(function (el) {
      el.setAttribute('data-error-boundary-active', '1');
      el.innerHTML = '<div class="tl-error-fallback" role="alert">'
        + '<p class="tl-error-title">' + escapeHtml(t('oops')) + '</p>'
        + actionsHtml()
        + detailHtml(err)
        + '</div>';
      bindReload(el);
    });
    return true;
  }

  function capture(zone, err) {
    try {
      if (isIgnored(err)) return false;
      var resolved = zoneFromError(err, zone);
      if (resolved) return showSection(resolved, err);
      return showGlobal(err);
    } catch (nested) {
      try { console.error('[TL_ERROR_BOUNDARY]', nested); } catch { /* ignore */ }
      return false;
    }
  }

  function wrap(zone, fn) {
    if (typeof fn !== 'function') return fn;
    return function tlErrorWrapped() {
      try {
        var out = fn.apply(this, arguments);
        if (out && typeof out.then === 'function') {
          return out.catch(function (err) {
            capture(zone, err);
            throw err;
          });
        }
        return out;
      } catch (err) {
        capture(zone, err);
      }
    };
  }

  function onWindowError(event) {
    try {
      if (!event) return;
      var err = event.error;
      if (!err) {
        var msg = event.message;
        if (!msg || msg === 'Script error.' || msg === 'Script error') return;
        err = new Error(String(msg));
        err.filename = event.filename || '';
      } else {
        err.filename = err.filename || event.filename || '';
      }
      if (isIgnored(err)) return;
      capture(zoneFromError(err, null), err);
    } catch { /* ignore */ }
  }

  function onRejection(event) {
    try {
      var reason = event && event.reason;
      if (isIgnored(reason)) return;
      capture(zoneFromError(reason, null), reason instanceof Error ? reason : new Error(String(reason)));
    } catch { /* ignore */ }
  }

  function maybeSelfTest() {
    if (!isDev()) return;
    var q = '';
    try { q = new URLSearchParams(location.search).get('tl_error_test') || ''; } catch { return; }
    if (!q) return;
    var run = function () {
      var err = new Error('YÜKSEK-6 ' + q + ' test');
      err.tlCrash = true;
      if (q === 'global' || q === '1') capture(null, err);
      else if (q === 'map' || q === 'tiolas' || q === 'form') capture(q, err);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
    else setTimeout(run, 0);
  }

  window.addEventListener('error', onWindowError);
  window.addEventListener('unhandledrejection', onRejection);

  window.TL_ERROR_BOUNDARY = {
    capture: capture,
    wrap: wrap,
    showGlobal: showGlobal,
    showSection: showSection,
    isDev: isDev,
    isIgnored: isIgnored,
  };

  maybeSelfTest();
})();
