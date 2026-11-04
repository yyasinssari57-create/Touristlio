/**
 * Gemini Faz 3 — lazy-load Leaflet + map scripts until a map surface is shown.
 * V4 Adım 10 — Leaflet CSS joins that same moment (not the homepage first load).
 * Leaflet UMD stays a classic <script> (import() would not set window.L).
 * map.js / map-discover.js load via dynamic import() after L exists.
 */
(function () {
  let pending = null;

  const LEAFLET_CSS = [
    '/vendor/leaflet/leaflet.css',
    '/vendor/leaflet.markercluster/MarkerCluster.css',
    '/vendor/leaflet.markercluster/MarkerCluster.Default.css',
  ];

  function versionFromLoader() {
    const src = (document.currentScript && document.currentScript.src) || '';
    const fromLoader = src.match(/[?&]v=([^&]+)/);
    if (fromLoader) return fromLoader[1];
    const tags = document.querySelectorAll('script[src*="?v="]');
    for (let i = 0; i < tags.length; i += 1) {
      const match = String(tags[i].src || '').match(/[?&]v=([^&]+)/);
      if (match) return match[1];
    }
    return '1';
  }

  const ver = versionFromLoader();

  function withV(path) {
    return `${path}${path.includes('?') ? '&' : '?'}v=${encodeURIComponent(ver)}`;
  }

  function loadCss(href) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`link[data-tl-map-css][href="${href}"]`);
      if (existing) {
        if (existing.dataset.tlLoaded === '1') {
          resolve();
          return;
        }
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error(`Failed to load ${href}`)), { once: true });
        return;
      }
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.dataset.tlMapCss = '1';
      link.onload = () => {
        link.dataset.tlLoaded = '1';
        resolve();
      };
      link.onerror = () => reject(new Error(`Failed to load ${href}`));
      document.head.appendChild(link);
    });
  }

  function loadClassic(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        if (existing.dataset.tlLoaded === '1') {
          resolve();
          return;
        }
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.onload = () => {
        script.dataset.tlLoaded = '1';
        resolve();
      };
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });
  }

  function ready() {
    return typeof L !== 'undefined' && window.TL_MAP && window.TL_MAP_DISCOVER;
  }

  function cssLoaded() {
    return LEAFLET_CSS.every((href) => {
      const link = document.querySelector(`link[data-tl-map-css][href="${withV(href)}"]`);
      return !!(link && link.dataset.tlLoaded === '1');
    });
  }

  function ensure() {
    if (ready() && cssLoaded()) return Promise.resolve();
    if (pending) return pending;
    pending = (async () => {
      const cssReady = Promise.all(LEAFLET_CSS.map((href) => loadCss(withV(href))));
      if (typeof L === 'undefined') {
        await loadClassic(withV('/vendor/leaflet/leaflet.js'));
      }
      if (typeof L !== 'undefined' && typeof L.markerClusterGroup !== 'function') {
        await loadClassic(withV('/vendor/leaflet.markercluster/leaflet.markercluster.js'));
      }
      if (!window.TL_MAP) {
        await import(withV('/js/map.js'));
      }
      if (!window.TL_MAP_DISCOVER) {
        await import(withV('/js/map-discover.js'));
      }
      await cssReady;
    })().catch((err) => {
      pending = null;
      try {
        if (window.TL_ERROR_BOUNDARY) window.TL_ERROR_BOUNDARY.capture('map', err);
        else console.error('[Touristlio map]', err);
      } catch { /* ignore */ }
      throw err;
    });
    return pending;
  }

  window.TL_MAP_LOADER = { ensure, ready };
})();
