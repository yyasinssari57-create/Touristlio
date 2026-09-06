window.TL_DISCOVER = (function () {
  const API = '/api';
  let lang = (window.TL_I18N && window.TL_I18N.resolveLang)
    ? window.TL_I18N.resolveLang()
    : (localStorage.getItem('tl_lang') || 'tr');
  let selectedCity = null;
  let activeCategory = null;
  let places = [];
  let cities = [];
  let loading = false;
  let viewMode = 'places';
  const PAGE_SIZE = 20;
  let discoverPage = 1;
  let discoverTotal = 0;
  let discoverHasMore = false;

  let discoverCats = [];

  async function ensureMapLibs() {
    if (window.TL_MAP_LOADER?.ensure) await window.TL_MAP_LOADER.ensure();
  }

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

  function cityName(c) {
    if (!c) return '';
    if (lang === 'en') return c.nameEn || c.name || '';
    return window.TL_I18N?.geoName?.(lang, c.name) || c.name || '';
  }

  function catLabel(id) {
    const meta = discoverCats.find((c) => c.id === id || c.slug === id);
    if (meta) return lang === 'en' ? meta.nameEn : meta.nameTr;
    return window.TL_I18N?.catLabel(lang, id) || id;
  }

  async function loadDiscoverCategories() {
    try {
      const data = await fetchJson('/places/meta/categories');
      discoverCats = data.discover || data.categories || [];
    } catch {
      discoverCats = [];
    }
  }

  function cityImg(c) {
    const url = c?.image || c?.imageUrl;
    if (url && /^https?:\/\//i.test(url)) return url;
    if (url && String(url).startsWith('/')) return url;
    if (typeof fallbackImgUrl === 'function') return fallbackImgUrl('city', c?.slug || c?.name);
    return '/images/icon.svg';
  }

  function placeImg(p) {
    const safe = typeof safeUrl === 'function' ? safeUrl : (url) => {
      const s = String(url || '').trim();
      if (!s) return '';
      if (/^https?:\/\//i.test(s) && !/^javascript:/i.test(s)) return s;
      if (s.startsWith('/') && !s.startsWith('//')) return s;
      return '';
    };
    const candidates = [p?.imageUrl, ...(Array.isArray(p?.photos) ? p.photos : [])];
    for (const raw of candidates) {
      const url = safe(raw);
      if (url.startsWith('http') && !/undefined|null|placeholder/i.test(url)) return url;
      if (url.startsWith('/')) return url;
    }
    if (typeof fallbackImgUrl === 'function') return fallbackImgUrl(p?.category, p?.id);
    return '/images/icon.svg';
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function tiolaLine(p) {
    const count = Number(p?.tiolaCount) || 0;
    const rating = Number(p?.tiolaRating);
    const has = count > 0 && Number.isFinite(rating) && rating > 0;
    if (!has) return t('noReviewsYet') || 'Henüz değerlendirme yok';
    const filled = Math.max(0, Math.min(5, Math.round(rating)));
    const stars = '★'.repeat(filled) + '☆'.repeat(5 - filled);
    const label = t('tiolaCount') || 'Tiola';
    return `${stars} ${rating.toFixed(1)} (${count} ${label})`;
  }

  function buildQuery(page) {
    const q = new URLSearchParams();
    q.set('limit', String(PAGE_SIZE));
    q.set('page', String(page || 1));
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
      if (title) title.textContent = cityName(selectedCity);
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
    const showCities = mode === 'cities';
    if (citiesStep) {
      citiesStep.classList.toggle('active', showCities);
      citiesStep.hidden = !showCities;
      citiesStep.setAttribute('aria-hidden', showCities ? 'false' : 'true');
    }
    if (placesStep) {
      placesStep.classList.toggle('active', !showCities);
      placesStep.hidden = showCities;
      placesStep.setAttribute('aria-hidden', showCities ? 'true' : 'false');
    }
    if (showCities) {
      const pager = document.getElementById('discoverPager');
      if (pager) pager.style.display = 'none';
    }
    updateHeader();
  }

  async function loadCities() {
    const grid = document.getElementById('discoverCityGrid');
    if (!grid) return;
    showView('cities');
    if (window.TL_SKELETON?.fill && window.TL_SKELETON.card) window.TL_SKELETON.fill(grid, window.TL_SKELETON.card(8));
    else grid.innerHTML = '<div class="discover-skeleton">...</div>';
    try {
      const data = await fetchJson('/places/cities?country=Turkey');
      cities = data.cities || [];
      renderCityGrid();
    } catch (e) {
      if (window.TL_SKELETON?.clear) window.TL_SKELETON.clear(grid);
      grid.innerHTML = `<div class="discover-empty"><p>${escapeHtml(e.message)}</p></div>`;
    }
  }

  function renderCityGrid() {
    const grid = document.getElementById('discoverCityGrid');
    if (!grid) return;
    if (window.TL_SKELETON?.clear) window.TL_SKELETON.clear(grid);
    grid.innerHTML = cities.map((c) => `
      <button type="button" class="city-card" data-slug="${c.slug}" aria-label="${escapeHtml(cityName(c))}">
        ${window.TL_IMG?.tag ? window.TL_IMG.tag(cityImg(c), { alt: cityName(c), kind: 'card' }) : `<img src="${cityImg(c)}" alt="${escapeHtml(cityName(c))}" width="400" height="300" loading="lazy"/>`}
        <div class="city-card-body">
          <h3>${escapeHtml(cityName(c))}</h3>
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
    if (!discoverCats.length) {
      strip.innerHTML = '';
      return;
    }
    strip.innerHTML = discoverCats.map((c) => {
      const id = c.id || c.slug;
      const icon = c.icon ? `${c.icon} ` : '';
      return `
      <button type="button" class="discover-cat-chip${activeCategory === id ? ' on' : ''}" data-cat="${id}">
        ${icon}${catLabel(id)}
      </button>`;
    }).join('');
    strip.querySelectorAll('.discover-cat-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const id = chip.dataset.cat;
        activeCategory = activeCategory === id ? null : id;
        renderCategoryFilters();
        loadPlacesAndMap();
      });
    });
  }

  function updateDiscoverPager() {
    const pager = document.getElementById('discoverPager');
    const btn = document.getElementById('discoverLoadMoreBtn');
    if (!pager || !btn) return;
    const show = viewMode === 'places' && discoverHasMore && places.length > 0;
    pager.style.display = show ? '' : 'none';
    btn.disabled = loading;
  }

  function renderPlaceCards(list, append) {
    const el = document.getElementById('discoverPlaceList');
    if (!el) return;
    if (window.TL_SKELETON?.clear && !append) window.TL_SKELETON.clear(el);
    const html = list.map((p) => {
      const name = p.name || p.title;
      return `
            <article class="discover-place-card" data-id="${p.id}" tabindex="0" role="button">
              ${window.TL_IMG?.tag
                ? window.TL_IMG.tag(placeImg(p), { alt: name, kind: 'thumb', extra: typeof imgFallback === 'function' ? `data-img-fallback data-fallback-cat="${p.category}" data-fallback-id="${p.id}"` : '' })
                : `<img src="${placeImg(p)}" alt="${escapeHtml(name)}" width="96" height="72" loading="lazy"${typeof imgFallback === 'function' ? ` data-img-fallback data-fallback-cat="${p.category}" data-fallback-id="${p.id}"` : ''}/>`}
              <div>
                <h4>${escapeHtml(name)}</h4>
                <p>${escapeHtml(window.TL_I18N?.catLabel(lang, p.category) || catLabel(p.category))} · ${escapeHtml(p.district || p.city || '')}</p>
                <p class="discover-tiola-rat">${tiolaLine(p)}</p>
              </div>
            </article>`;
    }).join('');
    if (append) el.insertAdjacentHTML('beforeend', html);
    else el.innerHTML = html;
    el.querySelectorAll('.discover-place-card').forEach((card) => {
      if (card.dataset.bound) return;
      card.dataset.bound = '1';
      const open = () => { if (typeof openDetail === 'function') openDetail(Number(card.dataset.id)); };
      card.addEventListener('click', open);
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
  }

  async function loadPlacesAndMap(append) {
    if (loading) return;
    loading = true;
    const list = document.getElementById('discoverPlaceList');
    const empty = document.getElementById('discoverEmpty');
    const count = document.getElementById('discoverPlaceCount');
    const moreBtn = document.getElementById('discoverLoadMoreBtn');
    const page = append ? discoverPage + 1 : 1;
    if (!append && list) {
      if (window.TL_SKELETON?.fill) window.TL_SKELETON.fill(list, window.TL_SKELETON.list(4));
      else list.innerHTML = window.TL_SKELETON?.card(4) || '';
    }
    if (append) window.TL_SKELETON?.button(moreBtn, true);
    updateDiscoverPager();
    try {
      const data = await fetchJson('/places?' + buildQuery(page));
      const batch = data.places || data.items || [];
      places = append ? places.concat(batch) : batch;
      discoverPage = data.page || page;
      discoverTotal = data.total ?? places.length;
      discoverHasMore = data.hasMore === true || places.length < discoverTotal;
      if (count) count.textContent = String(discoverTotal);
      updateHeader();
      if (!places.length) {
        if (list) {
          if (window.TL_SKELETON?.clear) window.TL_SKELETON.clear(list);
          list.innerHTML = '';
        }
        empty?.style.setProperty('display', 'block');
      } else {
        empty?.style.setProperty('display', 'none');
        if (list) renderPlaceCards(append ? batch : places, !!append);
      }
      const mapQuery = buildQuery(1);
      if (window.TL_MAP_DISCOVER && !append) {
        if (selectedCity) window.TL_MAP_DISCOVER.flyToCity(selectedCity.lat, selectedCity.lng);
        else window.TL_MAP_DISCOVER.setTurkeyView();
        window.TL_MAP_DISCOVER.loadMarkers('/places/map/markers?' + mapQuery);
      }
    } catch (e) {
      if (list && !append) list.innerHTML = `<div class="discover-empty">${escapeHtml(e.message)}</div>`;
    } finally {
      loading = false;
      if (append) window.TL_SKELETON?.button(moreBtn, false);
      updateDiscoverPager();
    }
  }

  async function init() {
    const page = document.getElementById('page-places');
    if (!page) return;
    document.getElementById('discoverCitiesBtn')?.addEventListener('click', loadCities);
    document.getElementById('discoverBackBtn')?.addEventListener('click', clearCityFilter);
    document.getElementById('discoverEmptyClear')?.addEventListener('click', clearCityFilter);
    document.getElementById('discoverLoadMoreBtn')?.addEventListener('click', () => loadPlacesAndMap(true));
    await loadDiscoverCategories();
    if (activeCategory && !discoverCats.some((c) => (c.id || c.slug) === activeCategory)) {
      activeCategory = null;
    }
    if (document.getElementById('page-places')?.classList.contains('active')) {
      try {
        await ensureMapLibs();
        if (window.TL_MAP_DISCOVER) {
          window.TL_MAP_DISCOVER.init('discoverMap');
          window.TL_MAP_DISCOVER.setTurkeyView();
          window.TL_MAP_DISCOVER.loadMarkers('/places/map/markers?country=Turkey');
        }
      } catch (err) {
        window.TL_ERROR_BOUNDARY?.capture('map', err);
      }
    }
    showView('places');
    renderCategoryFilters();
    loadPlacesAndMap();
  }

  async function onTabShown() {
    lang = (window.TL_I18N && window.TL_I18N.resolveLang)
      ? window.TL_I18N.resolveLang()
      : (localStorage.getItem('tl_lang') || 'tr');
    await loadDiscoverCategories();
    renderCategoryFilters();
    await ensureMapLibs();
    window.TL_MAP_DISCOVER?.init('discoverMap');
    setTimeout(() => {
      window.TL_MAP_DISCOVER?.invalidate();
      if (viewMode === 'places') loadPlacesAndMap();
      else loadCities();
    }, 150);
  }

  async function setLang(l) {
    lang = l;
    updateHeader();
    if (viewMode === 'cities') renderCityGrid();
    else {
      await loadDiscoverCategories();
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
