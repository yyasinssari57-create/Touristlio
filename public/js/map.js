window.TL_MAP = (function () {
  const CAT_COLORS = {
    landmark: '#6EC6FF',
    museum: '#8b5cf6',
    restaurant: '#f59e0b',
    cafe: '#d97706',
    beach: '#06b6d4',
    nature: '#22c55e',
    park: '#16a34a',
    viewpoint: '#ec4899',
    religious: '#6366f1',
    market: '#ef4444',
    shopping: '#a855f7',
    nightlife: '#1e293b',
    adventure: '#f97316',
    spa: '#14b8a6',
    hotel: '#64748b',
    city: '#0ea5e9',
  };

  let exploreMap = null;
  let exploreLayer = null;
  let detailMap = null;

  function colorFor(cat) {
    return CAT_COLORS[cat] || '#6EC6FF';
  }

  function markerHtml(color) {
    return `<span style="background:${color};width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.25);display:block"></span>`;
  }

  function popupHtml(m, lang) {
    const img = m.imageUrl
      ? `<img src="${m.imageUrl}" alt="" style="width:100%;height:72px;object-fit:cover;border-radius:8px;margin-bottom:6px" loading="lazy"/>`
      : '';
    return `<div class="map-popup">
      ${img}
      <strong>${m.name}</strong>
      <div style="font-size:.72rem;color:#64748b;margin:4px 0">${m.shortDesc || ''}</div>
      <button type="button" onclick="openDetail(${m.id})" style="font-size:.7rem;color:#0ea5e9;border:none;background:none;cursor:pointer;padding:0">
        ${lang === 'en' ? 'View details →' : 'Detay →'}
      </button>
    </div>`;
  }

  function ensureExploreMap(containerId) {
    const el = document.getElementById(containerId);
    if (!el || typeof L === 'undefined') return null;
    if (!exploreMap) {
      exploreMap = L.map(el, { scrollWheelZoom: false }).setView([41.01, 28.98], 5);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(exploreMap);
      exploreLayer = L.layerGroup().addTo(exploreMap);
    }
    setTimeout(() => exploreMap.invalidateSize(), 120);
    return exploreMap;
  }

  function renderExploreMarkers(markers, lang) {
    const map = ensureExploreMap('exploreMap');
    if (!map || !exploreLayer) return;
    exploreLayer.clearLayers();
    if (!markers.length) return;

    const bounds = [];
    markers.forEach((m) => {
      if (m.lat == null || m.lng == null) return;
      const color = colorFor(m.category);
      const icon = L.divIcon({
        className: 'tl-map-pin',
        html: markerHtml(color),
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      const mk = L.marker([m.lat, m.lng], { icon }).addTo(exploreLayer);
      mk.bindPopup(popupHtml(m, lang), { maxWidth: 220 });
      bounds.push([m.lat, m.lng]);
    });

    if (bounds.length === 1) map.setView(bounds[0], 12);
    else if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
  }

  function renderDetailMap(place, lang) {
    const el = document.getElementById('pdMap');
    if (!el || typeof L === 'undefined' || place.lat == null) {
      if (el) el.style.display = 'none';
      return;
    }
    el.style.display = 'block';
    if (detailMap) {
      detailMap.remove();
      detailMap = null;
    }
    detailMap = L.map(el, { scrollWheelZoom: false, zoomControl: true }).setView([place.lat, place.lng], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OSM',
      maxZoom: 18,
    }).addTo(detailMap);
    const color = colorFor(place.category);
    const icon = L.divIcon({
      className: 'tl-map-pin',
      html: markerHtml(color),
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
    L.marker([place.lat, place.lng], { icon })
      .addTo(detailMap)
      .bindPopup(`<strong>${place.name}</strong>`);
    setTimeout(() => detailMap.invalidateSize(), 150);
  }

  function destroyDetailMap() {
    if (detailMap) {
      detailMap.remove();
      detailMap = null;
    }
  }

  return {
    renderExploreMarkers,
    renderDetailMap,
    destroyDetailMap,
    invalidateExplore: () => exploreMap?.invalidateSize(),
  };
})();
