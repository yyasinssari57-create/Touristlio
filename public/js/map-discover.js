window.TL_MAP_DISCOVER = (function () {
  let map = null;
  let cluster = null;
  let lang = localStorage.getItem('tl_lang') || 'tr';
  let pendingMarkers = null;
  let initStarted = false;

  function popupHtml(m) {
    const img = m.imageUrl
      ? `<img src="${m.imageUrl}" alt="" style="width:100%;height:72px;object-fit:cover;border-radius:8px;margin-bottom:6px" loading="lazy"/>`
      : '';
    return `<div class="map-popup">${img}<strong>${m.name}</strong>
      <div style="font-size:.72rem;color:#64748b;margin:4px 0">${m.shortDesc || ''}</div>
      <button type="button" onclick="openDetail(${m.id})" style="font-size:.7rem;color:#0ea5e9;border:none;background:none;cursor:pointer;padding:0">
        ${lang === 'en' ? 'View details →' : 'Detay →'}
      </button></div>`;
  }

  function parseCoord(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function makeCluster() {
    if (typeof L !== 'undefined' && typeof L.markerClusterGroup === 'function') {
      return L.markerClusterGroup({
        maxClusterRadius: 48,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        disableClusteringAtZoom: 16,
      });
    }
    return L.layerGroup();
  }

  function init(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const start = () => {
      if (map) {
        map.invalidateSize();
        if (pendingMarkers) {
          paintMarkers(pendingMarkers);
          pendingMarkers = null;
        }
        return;
      }
      if (typeof L === 'undefined') {
        console.error('[Touristlio map] Leaflet failed to load (L is undefined)');
        return;
      }
      if (el.offsetWidth <= 0 || el.offsetHeight <= 0) return;
      map = L.map(el, { scrollWheelZoom: true, zoomControl: false }).setView([39.0, 35.0], 6);
      L.control.zoom({ position: 'topleft' }).addTo(map);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 18,
      }).addTo(map);
      cluster = makeCluster();
      map.addLayer(cluster);
      if (typeof ResizeObserver === 'function') {
        new ResizeObserver(() => map?.invalidateSize()).observe(el);
      }
      setTimeout(() => map.invalidateSize(), 80);
      if (pendingMarkers) {
        paintMarkers(pendingMarkers);
        pendingMarkers = null;
      }
    };
    if (window.TL_MAP?.whenContainerReady) {
      if (!initStarted) {
        initStarted = true;
        window.TL_MAP.whenContainerReady(el, start);
      } else {
        start();
      }
    } else {
      start();
    }
  }

  function paintMarkers(markers) {
    if (!map || !cluster) {
      pendingMarkers = markers;
      return;
    }
    cluster.clearLayers();
    const bounds = [];
    (markers || []).forEach((m) => {
      const lat = parseCoord(m.lat);
      const lng = parseCoord(m.lng);
      if (lat == null || lng == null) return;
      const color = window.TL_MAP?.colorFor?.(m.category) || '#0ea5e9';
      const icon = L.divIcon({
        className: 'tl-map-pin',
        html: `<span style="background:${color};width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.25);display:block"></span>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      const mk = L.marker([lat, lng], { icon });
      mk.bindPopup(popupHtml(m), { maxWidth: 220 });
      cluster.addLayer(mk);
      bounds.push([lat, lng]);
    });
    if (bounds.length === 1) map.setView(bounds[0], 13);
    else if (bounds.length > 1) map.fitBounds(bounds, { padding: [32, 32], maxZoom: 14 });
    map.invalidateSize();
  }

  async function loadMarkers(path) {
    try {
      const res = await fetch('/api' + path, { credentials: 'include' });
      const json = await res.json();
      const data = json.success && json.data ? json.data : json;
      paintMarkers(data.markers || []);
    } catch (e) {
      console.warn('Map markers', e);
    }
  }

  function setTurkeyView() {
    map?.setView([39.0, 35.0], 6);
  }

  function flyToCity(lat, lng) {
    const la = parseCoord(lat);
    const ln = parseCoord(lng);
    if (la == null || ln == null) return;
    map?.flyTo([la, ln], 11, { duration: 0.8 });
  }

  function invalidate() {
    map?.invalidateSize();
  }

  return { init, loadMarkers, setTurkeyView, flyToCity, invalidate, paintMarkers };
})();
