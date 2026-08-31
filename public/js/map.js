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

  const GROUP_CATS = {
    cities: ['city'],
    historical: ['historical', 'landmark', 'religious'],
    nature: ['nature', 'beach', 'park', 'viewpoint'],
    museums: ['museum'],
    restaurants: ['restaurant', 'cafe'],
    hotels: ['hotel'],
    activities: ['adventure', 'nightlife', 'spa', 'shopping', 'market'],
    museum: ['museum'],
    food: ['restaurant', 'cafe', 'market'],
    entertainment: ['nightlife', 'adventure', 'shopping', 'spa'],
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
  let mapGroupFilter = 'all';
  const pendingInit = {};

  function colorFor(cat) {
    return CAT_COLORS[cat] || '#6EC6FF';
  }

  function markerHtml(color) {
    return `<span style="background:${color};width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.25);display:block"></span>`;
  }

  function popupHtml(m, lang) {
    const img = m.imageUrl
      ? (window.TL_IMG?.tag
        ? window.TL_IMG.tag(m.imageUrl, { kind: 'thumb', extra: 'style="width:100%;height:72px;object-fit:cover;border-radius:8px;margin-bottom:6px"' })
        : `<img src="${m.imageUrl}" alt="" style="width:100%;height:72px;object-fit:cover;border-radius:8px;margin-bottom:6px" loading="lazy"/>`)
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

  function hasSize(el) {
    return !!(el && el.isConnected && el.offsetWidth > 0 && el.offsetHeight > 0);
  }

  function whenContainerReady(el, fn) {
    if (!el || typeof fn !== 'function') return;
    if (hasSize(el)) {
      fn();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return true;
      if (!el.isConnected) {
        done = true;
        try { ro.disconnect(); } catch { /* ignore */ }
        clearInterval(poll);
        return true;
      }
      if (!hasSize(el)) return false;
      done = true;
      try { ro.disconnect(); } catch { /* ignore */ }
      clearInterval(poll);
      fn();
      return true;
    };
    const ro = typeof ResizeObserver === 'function'
      ? new ResizeObserver(finish)
      : { observe() {}, disconnect() {} };
    try { ro.observe(el); } catch { /* ignore */ }
    const poll = setInterval(finish, 80);
  }

  function configureLeafletIcons() {
    if (typeof L === 'undefined' || !L.Icon || !L.Icon.Default) return;
    L.Icon.Default.mergeOptions({
      iconUrl: '/vendor/leaflet/images/marker-icon.png',
      iconRetinaUrl: '/vendor/leaflet/images/marker-icon-2x.png',
      shadowUrl: '/vendor/leaflet/images/marker-shadow.png',
    });
  }

  function addOsmTiles(map) {
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(map);
  }

  function makeCluster() {
    if (typeof L !== 'undefined' && typeof L.markerClusterGroup === 'function') {
      return L.markerClusterGroup({
        maxClusterRadius: 50,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        disableClusteringAtZoom: 16,
      });
    }
    return L.layerGroup();
  }

  function markerMatches(m) {
    const cats = [m.category, ...(m.categories || [])].filter(Boolean);
    if (mapGroupFilter && mapGroupFilter !== 'all') {
      const allowed = GROUP_CATS[mapGroupFilter] || [mapGroupFilter];
      const ok = cats.some((c) => allowed.includes(c) || c === mapGroupFilter);
      if (!ok) return false;
    } else if (mapCategoryFilter && mapCategoryFilter !== 'all') {
      const allowed = GROUP_CATS[mapCategoryFilter] || [mapCategoryFilter];
      const ok = cats.some((c) => allowed.includes(c) || c === mapCategoryFilter);
      if (!ok) return false;
    }
    if (mapSearchQuery.trim()) {
      const q = mapSearchQuery.toLowerCase();
      const hay = `${m.name || ''} ${m.shortDesc || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  function filterMarkers(markers) {
    return (markers || []).filter(markerMatches);
  }

  function parseCoord(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function ensureMap(containerId, store) {
    const el = document.getElementById(containerId);
    if (!el) return null;
    if (typeof L === 'undefined') {
      console.error('[Touristlio map] Leaflet failed to load (L is undefined)');
      return null;
    }
    if (!hasSize(el)) return store.map || null;
    configureLeafletIcons();
    if (!store.map) {
      store.map = L.map(el, { scrollWheelZoom: false, zoomControl: false }).setView([41.01, 28.98], 5);
      L.control.zoom({ position: 'topleft' }).addTo(store.map);
      addOsmTiles(store.map);
      store.cluster = makeCluster();
      store.map.addLayer(store.cluster);
      if (typeof ResizeObserver === 'function') {
        new ResizeObserver(() => store.map?.invalidateSize()).observe(el);
      }
    }
    store.map.invalidateSize();
    return store.map;
  }

  function paintMarkers(map, cluster, markers, lang) {
    if (!map || !cluster) return 0;
    cluster.clearLayers();
    const filtered = filterMarkers(markers);
    const bounds = [];
    filtered.forEach((m) => {
      const lat = parseCoord(m.lat);
      const lng = parseCoord(m.lng);
      if (lat == null || lng == null) return;
      const color = colorFor(m.category);
      const icon = L.divIcon({
        className: 'tl-map-pin',
        html: markerHtml(color),
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      const mk = L.marker([lat, lng], { icon });
      mk.bindPopup(popupHtml(m, lang), { maxWidth: 220 });
      cluster.addLayer(mk);
      bounds.push([lat, lng]);
    });
    if (bounds.length === 1) map.setView(bounds[0], 12);
    else if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
    map.invalidateSize();
    return bounds.length;
  }

  function storeFor(containerId) {
    if (containerId === 'exploreMapFull') return { map: fullMap, cluster: fullCluster, set(s) { fullMap = s.map; fullCluster = s.cluster; } };
    return { map: exploreMap, cluster: exploreCluster, set(s) { exploreMap = s.map; exploreCluster = s.cluster; } };
  }

  function ensureExploreMap(containerId) {
    const slot = storeFor(containerId);
    const store = { map: slot.map, cluster: slot.cluster };
    const map = ensureMap(containerId, store);
    slot.set(store);
    return map;
  }

  function initExploreWhenReady(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const existingMap = containerId === 'exploreMapFull' ? fullMap : exploreMap;
    const existingCluster = containerId === 'exploreMapFull' ? fullCluster : exploreCluster;
    if (existingMap) {
      existingMap.invalidateSize();
      if (lastMarkers.length) paintMarkers(existingMap, existingCluster, lastMarkers, lastLang);
      return;
    }
    if (pendingInit[containerId]) return;
    pendingInit[containerId] = true;
    whenContainerReady(el, () => {
      pendingInit[containerId] = false;
      ensureExploreMap(containerId);
      const map = containerId === 'exploreMapFull' ? fullMap : exploreMap;
      const cluster = containerId === 'exploreMapFull' ? fullCluster : exploreCluster;
      if (lastMarkers.length) paintMarkers(map, cluster, lastMarkers, lastLang);
      else map?.invalidateSize();
    });
  }

  function renderExploreMarkers(markers, lang) {
    lastMarkers = Array.isArray(markers) ? markers : [];
    lastLang = lang || lastLang;
    if (document.getElementById('exploreMap')) {
      initExploreWhenReady('exploreMap');
      if (exploreMap && exploreCluster) paintMarkers(exploreMap, exploreCluster, lastMarkers, lastLang);
    }
    if (document.getElementById('exploreMapFull')) {
      initExploreWhenReady('exploreMapFull');
      if (fullMap && fullCluster) paintMarkers(fullMap, fullCluster, lastMarkers, lastLang);
    }
  }

  function setMapSearch(q) {
    mapSearchQuery = q || '';
    if (lastMarkers.length) renderExploreMarkers(lastMarkers, lastLang);
  }

  function setMapCategory(cat) {
    mapCategoryFilter = cat || 'all';
    if (mapCategoryFilter !== 'all') mapGroupFilter = 'all';
    if (lastMarkers.length) renderExploreMarkers(lastMarkers, lastLang);
  }

  function setMapGroup(group) {
    mapGroupFilter = group || 'all';
    if (mapGroupFilter !== 'all') mapCategoryFilter = 'all';
    if (lastMarkers.length) renderExploreMarkers(lastMarkers, lastLang);
  }

  function setMapFilters({ category, group } = {}) {
    mapCategoryFilter = category || 'all';
    mapGroupFilter = group || 'all';
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
          iconSize: [16, 16],
          iconAnchor: [8, 8],
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
    const wrap = document.getElementById('pdMapWrap');
    const lat = parseCoord(place?.lat);
    const lng = parseCoord(place?.lng);
    if (!el || typeof L === 'undefined' || lat == null || lng == null) {
      if (wrap) wrap.style.display = 'none';
      return;
    }
    if (wrap) wrap.style.display = 'block';
    lastLang = lang || lastLang;
    whenContainerReady(el, () => {
      if (detailMap) {
        detailMap.remove();
        detailMap = null;
      }
      configureLeafletIcons();
      detailMap = L.map(el, { scrollWheelZoom: false, zoomControl: false }).setView([lat, lng], 14);
      L.control.zoom({ position: 'topleft' }).addTo(detailMap);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OSM',
        maxZoom: 18,
      }).addTo(detailMap);
      const icon = L.divIcon({
        className: 'tl-map-pin',
        html: markerHtml(colorFor(place.category)),
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      L.marker([lat, lng], { icon }).addTo(detailMap).bindPopup(`<strong>${place.name}</strong>`);
      setTimeout(() => detailMap?.invalidateSize(), 80);
    });
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
        const kind = chip.dataset.kind;
        const filter = chip.dataset.cat || chip.dataset.filter || 'all';
        if (kind === 'group') setMapGroup(filter);
        else if (filter === 'all') setMapFilters({ category: 'all', group: 'all' });
        else setMapCategory(filter);
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
    setMapGroup,
    setMapFilters,
    bindMapCatChips,
    locateUser,
    whenContainerReady,
    invalidateExplore: (id) => {
      if (id === 'exploreMapFull') {
        initExploreWhenReady('exploreMapFull');
        fullMap?.invalidateSize();
        if (lastMarkers.length) paintMarkers(fullMap, fullCluster, lastMarkers, lastLang);
      } else {
        initExploreWhenReady('exploreMap');
        exploreMap?.invalidateSize();
      }
    },
  };
})();
