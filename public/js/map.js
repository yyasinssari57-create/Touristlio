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

  let exploreCluster = null;

  let fullMap = null;

  let fullCluster = null;

  let detailMap = null;

  let userMarker = null;

  let lastMarkers = [];

  let lastLang = 'tr';

  let mapSearchQuery = '';

  let mapCategoryFilter = 'all';



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



  function filterMarkers(markers) {

    let list = markers;

    if (mapCategoryFilter && mapCategoryFilter !== 'all') {

      list = list.filter((m) => m.category === mapCategoryFilter || (m.categories || []).includes(mapCategoryFilter));

    }

    if (mapSearchQuery.trim()) {

      const q = mapSearchQuery.toLowerCase();

      list = list.filter((m) => m.name.toLowerCase().includes(q) || (m.shortDesc || '').toLowerCase().includes(q));

    }

    return list;

  }



  function ensureMap(containerId, store) {

    const el = document.getElementById(containerId);

    if (!el || typeof L === 'undefined') return null;

    if (!store.map) {

      store.map = L.map(el, { scrollWheelZoom: false }).setView([41.01, 28.98], 5);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {

        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',

        maxZoom: 18,

      }).addTo(store.map);

      if (typeof L.markerClusterGroup === 'function') {

        store.cluster = L.markerClusterGroup({ maxClusterRadius: 50, spiderfyOnMaxZoom: true });

        store.map.addLayer(store.cluster);

      } else {

        store.cluster = L.layerGroup().addTo(store.map);

      }

    }

    setTimeout(() => store.map.invalidateSize(), 120);

    return store.map;

  }



  function paintMarkers(map, cluster, markers, lang) {

    if (!map || !cluster) return;

    cluster.clearLayers();

    const filtered = filterMarkers(markers);

    if (!filtered.length) return;

    const bounds = [];

    filtered.forEach((m) => {

      if (m.lat == null || m.lng == null) return;

      const color = colorFor(m.category);

      const icon = L.divIcon({

        className: 'tl-map-pin',

        html: markerHtml(color),

        iconSize: [18, 18],

        iconAnchor: [9, 9],

      });

      const mk = L.marker([m.lat, m.lng], { icon });

      mk.bindPopup(popupHtml(m, lang), { maxWidth: 220 });

      cluster.addLayer(mk);

      bounds.push([m.lat, m.lng]);

    });

    if (bounds.length === 1) map.setView(bounds[0], 12);

    else if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });

  }



  function ensureExploreMap(containerId) {

    const store = { map: exploreMap, cluster: exploreCluster };

    if (containerId === 'exploreMapFull') {

      store.map = fullMap;

      store.cluster = fullCluster;

    }

    const map = ensureMap(containerId, store);

    if (containerId === 'exploreMapFull') {

      fullMap = store.map;

      fullCluster = store.cluster;

    } else {

      exploreMap = store.map;

      exploreCluster = store.cluster;

    }

    return map;

  }



  function renderExploreMarkers(markers, lang) {

    lastMarkers = markers;

    lastLang = lang;

    if (document.getElementById('exploreMap')) {

      ensureExploreMap('exploreMap');

      paintMarkers(exploreMap, exploreCluster, markers, lang);

    }

    if (document.getElementById('exploreMapFull')) {

      ensureExploreMap('exploreMapFull');

      paintMarkers(fullMap, fullCluster, markers, lang);

    }

  }



  function setMapSearch(q) {

    mapSearchQuery = q;

    if (lastMarkers.length) renderExploreMarkers(lastMarkers, lastLang);

  }



  function setMapCategory(cat) {

    mapCategoryFilter = cat;

    if (lastMarkers.length) renderExploreMarkers(lastMarkers, lastLang);

  }



  function locateUser(map) {

    if (!map || !navigator.geolocation) {

      window.TL_TOAST?.warning(lastLang === 'en' ? 'Geolocation not supported' : 'Konum desteklenmiyor');

      return;

    }

    navigator.geolocation.getCurrentPosition(

      (pos) => {

        const { latitude, longitude } = pos.coords;

        if (userMarker) userMarker.remove();

        const icon = L.divIcon({

          className: 'tl-user-pin',

          html: '<span style="background:#ef4444;width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);display:block"></span>',

          iconSize: [16, 16], iconAnchor: [8, 8],

        });

        userMarker = L.marker([latitude, longitude], { icon, zIndexOffset: 1000 })

          .addTo(map)

          .bindPopup(lastLang === 'en' ? 'You are here' : 'Buradasınız');

        map.setView([latitude, longitude], 13);

        window.TL_TOAST?.success(lastLang === 'en' ? 'Location found' : 'Konum bulundu');

      },

      () => {

        window.TL_TOAST?.error(lastLang === 'en' ? 'Location permission denied' : 'Konum izni reddedildi');

      },

      { enableHighAccuracy: true, timeout: 10000 },

    );

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



  function bindMapCatChips() {
    document.querySelectorAll('.map-cat-chip').forEach((chip) => {
      chip.onclick = () => {
        document.querySelectorAll('.map-cat-chip').forEach((c) => c.classList.remove('on'));
        chip.classList.add('on');
        setMapCategory(chip.dataset.cat || 'all');
      };
    });
  }

  function bindMapControls() {

    const searchInp = document.getElementById('mapSearchInput');

    if (searchInp) {

      searchInp.addEventListener('input', () => setMapSearch(searchInp.value));

    }

    bindMapCatChips();

    document.getElementById('mapLocateBtn')?.addEventListener('click', () => {

      const m = fullMap || exploreMap;

      locateUser(m);

    });

  }



  if (document.readyState === 'loading') {

    document.addEventListener('DOMContentLoaded', bindMapControls);

  } else {

    bindMapControls();

  }



  return {

    colorFor,
    renderExploreMarkers,

    renderDetailMap,

    destroyDetailMap,

    setMapSearch,

    setMapCategory,

    bindMapCatChips,

    locateUser,

    invalidateExplore: (id) => {

      if (id === 'exploreMapFull') {

        fullMap?.invalidateSize();

        if (lastMarkers.length) paintMarkers(fullMap, fullCluster, lastMarkers, lastLang);

      } else {

        exploreMap?.invalidateSize();

      }

    },

  };

})();

