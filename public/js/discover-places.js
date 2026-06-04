window.TL_DISCOVER = (function () {
  const API = '/api';
  let lang = localStorage.getItem('tl_lang') || 'tr';
  let selectedCity = null;
  let activeCategory = null;
  let places = [];
  let cities = [];
  let loading = false;
  let viewMode = 'places';

  const CATEGORY_LABELS = {
    tr: { museum: 'Müze', nature: 'Doğa', food: 'Yeme-İçme', historical: 'Tarihi', entertainment: 'Eğlence' },
    en: { museum: 'Museums', nature: 'Nature', food: 'Food', historical: 'Historical', entertainment: 'Entertainment' },
  };

  const CATS = ['museum', 'nature', 'food', 'historical', 'entertainment'];
  const CAT_ICONS = { museum: '🏺', nature: '⛰️', food: '🍽️', historical: '🏛️', entertainment: '🎭' };

  async function fetchJson(path) {
    const res = await fetch(API + path, { credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'İstek başarısız');
    if (data.success === true && data.data !== undefined) return data.data;
    return data;
  }

  function t(key) {
    return window.TL_I18N?.t(lang, key) || key;
  }

  function catLabel(id) {
    return (CATEGORY_LABELS[lang] || CATEGORY_LABELS.tr)[id] || id;
  }

  function placeImg(p) {
    if (typeof fallbackImgUrl === 'function') return fallbackImgUrl(p?.category, p?.id);
    const url = String(p?.imageUrl || p?.images?.[0] || '').trim();
    return url.startsWith('http') ? url : '/images/icon.svg';
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function buildQuery() {
    const q = new URLSearchParams();
    q.set('limit', '100');
    q.set('offset', '0');
    q.set('sort', 'popularity');
    q.set('country', 'Turkey');
    if (selectedCity) q.set('city', selectedCity.nameEn || selectedCity.slug);
    if (activeCategory) q.set('category', activeCategory);
    return q.toString();
  }

  function updateHeader() {
    const title = document.getElementById('discoverCityTitle');
    const sub = document.getElementById('discoverPlaceSub');
    const citiesBtn = document.getElementById('discoverCitiesBtn');
    const backBtn = document.getElementById('discoverBackBtn');
    if (viewMode === 'cities') {
      if (title) title.textContent = t('discoverPlacesTitle');
      if (sub) sub.textContent = t('discoverPlacesSub');
      if (citiesBtn) citiesBtn.style.display = 'none';
      if (backBtn) backBtn.style.display = 'none';
      return;
    }
    if (selectedCity) {
      if (title) title.textContent = lang === 'en' ? selectedCity.nameEn : selectedCity.name;
      if (sub) sub.textContent = `${selectedCity.placeCount || 0} ${t('placesFound')}`;
      if (backBtn) backBtn.style.display = 'inline-flex';
    } else {
      if (title) title.textContent = t('discoverGlobalTitle') || (lang === 'en' ? 'All places' : 'Tüm gezilecek yerler');
      if (sub) sub.textContent = t('discoverGlobalSub') || (lang === 'en' ? 'Worldwide · filter by category or city' : 'Dünya geneli · kategori veya şehir filtreleyin');
      if (backBtn) backBtn.style.display = 'none';
    }
    if (citiesBtn) citiesBtn.style.display = 'inline-flex';
  }

  function showView(mode) {
    viewMode = mode;
    const citiesStep = document.getElementById('discoverStepCities');
    const placesStep = document.getElementById('discoverStepPlaces');
    if (mode === 'cities') {
      citiesStep?.classList.add('active');
      placesStep?.classList.remove('active');
    } else {
      citiesStep?.classList.remove('active');
      placesStep?.classList.add('active');
    }
    updateHeader();
  }

  async function loadCities() {
    const grid = document.getElementById('discoverCityGrid');
    if (!grid) return;
    showView('cities');
    grid.innerHTML = window.TL_SKELETON?.card(8) || '<div class="discover-skeleton">...</div>';
    try {
      const data = await fetchJson('/places/cities');
      cities = data.cities || [];
      renderCityGrid();
    } catch (e) {
      grid.innerHTML = `<div class="discover-empty"><p>${escapeHtml(e.message)}</p></div>`;
    }
  }

  function renderCityGrid() {
    const grid = document.getElementById('discoverCityGrid');
    if (!grid) return;
    grid.innerHTML = cities.map((c) => `
      <button type="button" class="city-card" data-slug="${c.slug}" aria-label="${escapeHtml(c.name)}">
        <img src="${c.image}" alt="" loading="lazy"/>
        <div class="city-card-body">
          <h3>${escapeHtml(lang === 'en' ? c.nameEn : c.name)}</h3>
          <span>${c.placeCount || 0} ${t('placesFound')}</span>
        </div>
      </button>`).join('');
    grid.querySelectorAll('.city-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        const city = cities.find((x) => x.slug === btn.dataset.slug);
        if (city) selectCity(city);
      });
    });
  }

  function selectCity(city) {
    selectedCity = city;
    activeCategory = null;
    showView('places');
    renderCategoryFilters();
    loadPlacesAndMap();
  }

  function clearCityFilter() {
    selectedCity = null;
    activeCategory = null;
    showView('places');
    renderCategoryFilters();
    loadPlacesAndMap();
    if (window.TL_MAP_DISCOVER) {
      window.TL_MAP_DISCOVER.setTurkeyView();
      window.TL_MAP_DISCOVER.loadMarkers('/places/map/markers?country=Turkey');
    }
  }

  function renderCategoryFilters() {
    const strip = document.getElementById('discoverCatStrip');
    if (!strip) return;
    strip.innerHTML = CATS.map((id) => `
      <button type="button" class="discover-cat-chip${activeCategory === id ? ' on' : ''}" data-cat="${id}">
        ${CAT_ICONS[id]} ${catLabel(id)}
      </button>`).join('');
    strip.querySelectorAll('.discover-cat-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const id = chip.dataset.cat;
        activeCategory = activeCategory === id ? null : id;
        renderCategoryFilters();
        loadPlacesAndMap();
      });
    });
  }

  async function loadPlacesAndMap() {
    if (loading) return;
    loading = true;
    const list = document.getElementById('discoverPlaceList');
    const empty = document.getElementById('discoverEmpty');
    const count = document.getElementById('discoverPlaceCount');
    if (list) list.innerHTML = window.TL_SKELETON?.card(4) || '';
    try {
      const data = await fetchJson('/places?' + buildQuery());
      places = data.places || data.items || [];
      const total = data.total ?? places.length;
      if (count) count.textContent = String(total);
      updateHeader();
      if (!places.length) {
        if (list) list.innerHTML = '';
        empty?.style.setProperty('display', 'block');
      } else {
        empty?.style.setProperty('display', 'none');
        if (list) {
          list.innerHTML = places.map((p) => {
            const name = p.name || p.title;
            return `
            <article class="discover-place-card" data-id="${p.id}" tabindex="0" role="button">
              <img src="${placeImg(p)}" alt="" loading="lazy"/>
              <div>
                <h4>${escapeHtml(name)}</h4>
                <p>${escapeHtml(window.TL_I18N?.catLabel(lang, p.category) || catLabel(p.category))} · ${escapeHtml(p.district || p.city || '')}</p>
              </div>
            </article>`;
          }).join('');
          list.querySelectorAll('.discover-place-card').forEach((card) => {
            const open = () => { if (typeof openDetail === 'function') openDetail(Number(card.dataset.id)); };
            card.addEventListener('click', open);
            card.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
          });
        }
      }
      const mapQuery = buildQuery();
      if (window.TL_MAP_DISCOVER) {
        if (selectedCity) window.TL_MAP_DISCOVER.flyToCity(selectedCity.lat, selectedCity.lng);
        else window.TL_MAP_DISCOVER.setTurkeyView();
        window.TL_MAP_DISCOVER.loadMarkers('/places/map/markers?' + mapQuery);
      }
    } catch (e) {
      if (list) list.innerHTML = `<div class="discover-empty">${escapeHtml(e.message)}</div>`;
    } finally {
      loading = false;
    }
  }

  function init() {
    const page = document.getElementById('page-places');
    if (!page) return;
    document.getElementById('discoverCitiesBtn')?.addEventListener('click', loadCities);
    document.getElementById('discoverBackBtn')?.addEventListener('click', clearCityFilter);
    if (window.TL_MAP_DISCOVER) {
      window.TL_MAP_DISCOVER.init('discoverMap');
      window.TL_MAP_DISCOVER.setTurkeyView();
      window.TL_MAP_DISCOVER.loadMarkers('/places/map/markers?country=Turkey');
    }
    showView('places');
    renderCategoryFilters();
    loadPlacesAndMap();
  }

  function onTabShown() {
    lang = localStorage.getItem('tl_lang') || 'tr';
    setTimeout(() => {
      window.TL_MAP_DISCOVER?.invalidate();
      if (viewMode === 'places') loadPlacesAndMap();
      else loadCities();
    }, 150);
  }

  function setLang(l) {
    lang = l;
    updateHeader();
    if (viewMode === 'cities') renderCityGrid();
    else {
      renderCategoryFilters();
      if (places.length) loadPlacesAndMap();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { onTabShown, setLang, clearCityFilter, selectCity, loadCities };
})();
