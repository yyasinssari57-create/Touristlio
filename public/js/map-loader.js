/**
 * Gemini Faz 3 — lazy-load Leaflet + map scripts until a map surface is shown.
 * Leaflet UMD stays a classic <script> (import() would not set window.L).
 * map.js / map-discover.js load via dynamic import() after L exists.
 */
(function () {
  let pending = null;

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

  function ensure() {
    if (ready()) return Promise.resolve();
    if (pending) return pending;
    pending = (async () => {
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
