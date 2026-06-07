window.TL_MAP_DISCOVER = (function () {
  let map = null;
  let cluster = null;
  let lang = localStorage.getItem('tl_lang') || 'tr';

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

  function init(containerId) {
    const el = document.getElementById(containerId);
    if (!el || typeof L === 'undefined') return;
    if (map) {
      setTimeout(() => map.invalidateSize(), 120);
      return;
    }
    map = L.map(el, { scrollWheelZoom: true, zoomControl: false }).setView([39.0, 35.0], 6);
    L.control.zoom({ position: 'topleft' }).addTo(map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 18,
    }).addTo(map);
    cluster = typeof L.markerClusterGroup === 'function'
      ? L.markerClusterGroup({ maxClusterRadius: 48 })
      : L.layerGroup();
    map.addLayer(cluster);
    setTimeout(() => map.invalidateSize(), 200);
  }

  function paintMarkers(markers) {
    if (!map || !cluster) return;
    cluster.clearLayers();
    const bounds = [];
    markers.forEach((m) => {
      if (m.lat == null || m.lng == null) return;
      const color = window.TL_MAP?.colorFor?.(m.category) || '#0ea5e9';
      const icon = L.divIcon({
        className: 'tl-map-pin',
        html: `<span style="background:${color};width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.25);display:block"></span>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      const mk = L.marker([m.lat, m.lng], { icon });
      mk.bindPopup(popupHtml(m), { maxWidth: 220 });
      cluster.addLayer(mk);
      bounds.push([m.lat, m.lng]);
    });
    if (bounds.length === 1) map.setView(bounds[0], 13);
    else if (bounds.length > 1) map.fitBounds(bounds, { padding: [32, 32], maxZoom: 14 });
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
    map?.flyTo([lat, lng], 11, { duration: 0.8 });
  }

  function invalidate() {
    map?.invalidateSize();
  }

  return { init, loadMarkers, setTurkeyView, flyToCity, invalidate, paintMarkers };
})();
