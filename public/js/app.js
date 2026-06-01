const PLACE_FALLBACK_POOL = [
  'https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?w=600&q=80',
  'https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=600&q=80',
  'https://images.unsplash.com/photo-1582555172866-f73bb12a2ab3?w=600&q=80',
  'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&q=80',
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&q=80',
  'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&q=80',
  'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600&q=80',
  'https://images.unsplash.com/photo-1485871981521-5b1fd3805eee?w=600&q=80',
  'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=600&q=80',
  'https://images.unsplash.com/photo-1478436127897-769e1b3f0f36?w=600&q=80',
  'https://images.unsplash.com/photo-1527838832700-5059252407fa?w=600&q=80',
  'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=600&q=80',
  'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&q=80',
  'https://images.unsplash.com/photo-1516912481808-3406841bd33c?w=600&q=80',
  'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=600&q=80',
];

function fallbackImgUrl(category, placeId) {
  const seed = ((placeId || 0) * 31 + [...String(category || 'x')].reduce((a, c) => a + c.charCodeAt(0), 0)) | 0;
  return PLACE_FALLBACK_POOL[Math.abs(seed) % PLACE_FALLBACK_POOL.length];
}

function placeImg(p) {
  const url = String(p?.imageUrl || '').trim();
  if (url.startsWith('http') && !/undefined|null|placeholder/i.test(url)) return url;
  return fallbackImgUrl(p?.category, p?.id);
}

function imgFallback(el, category, placeId) {
  el.onerror = null;
  el.src = fallbackImgUrl(category, placeId);
}

let token = localStorage.getItem('tl_token');
let user = JSON.parse(localStorage.getItem('tl_user') || 'null');
let places = [];
let activePlace = null;
let rating = 0;
let arcRating = 0;
let activeCat = 'all';
let activeFilterGroup = 'all';
let activeStar = 0;
let activeEntry = 'all';
let activeLocal = 'all';
let sortMode = 'popularity';
let placesLoading = false;
let prevTab = 'explore';
let blogCat = 'all';
let savedIds = new Set();
let authMode = 'login';
let lang = localStorage.getItem('tl_lang') || 'tr';
let lastOsmHint = false;
let searchTimer;
const PAGE_SIZE = 12;
let placesTotal = 0;
let placesOffset = 0;
let cardsLoaded = false;
let currentFilterParams = {};

const CITYDB = {
  'Turkey 🇹🇷': { Istanbul: ['Sultanahmet', 'Beyoğlu', 'Karaköy'], Ankara: ['Çankaya'], 'İzmir': ['Selçuk'], Denizli: ['Pamukkale'], Nevşehir: ['Göreme'] },
  'France 🇫🇷': { Paris: ['Marais', 'Montmartre'], Normandy: ['Mont Saint-Michel'] },
  'Japan 🇯🇵': { Tokyo: ['Shibuya', 'Asakusa'], Kyoto: ['Fushimi', 'Arashiyama'] },
  'Italy 🇮🇹': { Rome: ['Centro Storico'], Florence: ['Duomo'], Venice: ['San Marco'] },
  'Greece 🇬🇷': { Athens: ['Akropolis'], Santorini: ['Oia'] },
  'Spain 🇪🇸': { Barcelona: ['Eixample'], Granada: ['Albaicín'] },
  'UK 🇬🇧': { London: ['Westminster'] },
  'USA 🇺🇸': { 'New York': ['Manhattan'], Arizona: ['South Rim'] },
  'Portugal 🇵🇹': { Lisbon: ['Alfama'] },
  'UAE 🇦🇪': { Dubai: ['Downtown'] },
  'Norway 🇳🇴': { Flåm: ['Aurland'] },
  'Iceland 🇮🇸': { Reykjavik: ['Þingvellir'] },
  'South Korea 🇰🇷': { Seoul: ['Jongno'] },
  'Vietnam 🇻🇳': { 'Ha Long': ['Ha Long Bay'] },
  'Cambodia 🇰🇭': { 'Siem Reap': ['Angkor'] },
  'Jordan 🇯🇴': { Petra: ['Siq'] },
  'Nepal 🇳🇵': { 'Namche Bazaar': ['Khumbu'] },
  'Peru 🇵🇪': { Cusco: ['Urubamba'] },
  'Cuba 🇨🇺': { Havana: ['La Habana Vieja'] },
  'Tanzania 🇹🇿': { Serengeti: ['Northern Serengeti'] },
  'Egypt 🇪🇬': { Cairo: ['Giza'] },
  'Brazil 🇧🇷': { 'Rio de Janeiro': ['Cosme Velho'] },
  'India 🇮🇳': { Agra: ['Taj Ganj'] },
  'Australia 🇦🇺': { Sydney: ['CBD'] },
};

function t(key) {
  return window.TL_I18N.t(lang, key);
}

function catLabel(cat) {
  return window.TL_I18N.catLabel(lang, cat);
}

function placeField(p, base) {
  if (!p) return '';
  if (lang === 'en') {
    const en = p[`${base}En`];
    if (en) return en;
  }
  return p[base] || '';
}

function placeListField(p, base) {
  const key = lang === 'en' ? `${base}En` : base;
  const val = p[key] || p[base];
  return Array.isArray(val) ? val : [];
}

function updateSeoForPlace(p) {
  if (!p) return;
  const title = `${p.name} — Touristlio`;
  const desc = (placeField(p, 'overview') || placeField(p, 'description') || '').slice(0, 155);
  document.title = title;
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.content = desc;
  const ogT = document.querySelector('meta[property="og:title"]');
  const ogD = document.querySelector('meta[property="og:description"]');
  const ogI = document.querySelector('meta[property="og:image"]');
  if (ogT) ogT.content = title;
  if (ogD) ogD.content = desc;
  if (ogI && p.imageUrl) ogI.content = p.imageUrl.startsWith('http') ? p.imageUrl : (location.origin + placeImg(p));
  injectPlaceJsonLd(p);
}

function injectPlaceJsonLd(p) {
  document.querySelectorAll('script[data-tl-jsonld]').forEach((s) => s.remove());
  const faqList = lang === 'en' ? (p.faqEN || []) : (p.faqTR || []);
  const origin = location.origin;
  const blocks = [
    {
      '@context': 'https://schema.org',
      '@type': 'TouristDestination',
      name: p.name,
      description: placeField(p, 'overview') || placeField(p, 'description'),
      geo: p.lat != null ? { '@type': 'GeoCoordinates', latitude: p.lat, longitude: p.lng } : undefined,
      address: { '@type': 'PostalAddress', addressLocality: p.city, addressCountry: p.country },
      image: placeImg(p),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Touristlio', item: origin },
        { '@type': 'ListItem', position: 2, name: p.country, item: `${origin}/search?country=${encodeURIComponent(p.country)}` },
        { '@type': 'ListItem', position: 3, name: p.name, item: `${origin}/?place=${p.id}` },
      ],
    },
  ];
  if (faqList.length) {
    blocks.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqList.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    });
  }
  blocks.forEach((data) => {
    const s = document.createElement('script');
    s.type = 'application/ld+json';
    s.dataset.tlJsonld = '1';
    s.textContent = JSON.stringify(data);
    document.head.appendChild(s);
  });
}

function renderFaqAccordion(p) {
  const box = document.getElementById('pdFaq');
  if (!box) return;
  const faq = lang === 'en' ? (p.faqEN || []) : (p.faqTR || []);
  if (!faq.length) { box.style.display = 'none'; return; }
  box.style.display = 'block';
  box.innerHTML = `<h2 data-i18n="faqTitle">❓ SSS</h2>` + faq.map((item, i) => `
    <div class="faq-item">
      <button type="button" class="faq-q" aria-expanded="false" aria-controls="faq-a-${i}" id="faq-q-${i}" onclick="toggleFaq(${i})">${escapeHtml(item.q)}</button>
      <div class="faq-a" id="faq-a-${i}" role="region" aria-labelledby="faq-q-${i}" hidden>${escapeHtml(item.a)}</div>
    </div>`).join('');
  window.TL_I18N.apply(lang);
}

function toggleFaq(i) {
  const btn = document.getElementById('faq-q-' + i);
  const panel = document.getElementById('faq-a-' + i);
  if (!btn || !panel) return;
  const open = btn.getAttribute('aria-expanded') === 'true';
  btn.setAttribute('aria-expanded', open ? 'false' : 'true');
  panel.hidden = open;
  btn.classList.toggle('open', !open);
}

function renderNearbyCards(list) {
  const el = document.getElementById('nearbyList');
  if (!el) return;
  el.innerHTML = (list || []).map((x) => `
    <div class="nearby-item" onclick="openDetail(${x.id})" role="button" tabindex="0" onkeydown="if(event.key==='Enter')openDetail(${x.id})">
      <img class="ni-img" src="${placeImg(x)}" alt="" loading="lazy" onerror="imgFallback(this,'${x.category}',${x.id})"/>
      <div><div class="ni-name">${escapeHtml(x.name)}</div><div class="ni-cat">${catLabel(x.category)}${x.distanceKm != null ? ` · ${x.distanceKm} km` : ''}</div></div>
    </div>`).join('') || `<p class="empty-hint">${t('nearbyEmpty')}</p>`;
}

function renderSimilarCards(list) {
  const el = document.getElementById('similarList');
  if (!el) return;
  el.innerHTML = (list || []).map((x) => `
    <div class="nearby-item" onclick="openDetail(${x.id})" role="button" tabindex="0">
      <img class="ni-img" src="${placeImg(x)}" alt="" loading="lazy" onerror="imgFallback(this,'${x.category}',${x.id})"/>
      <div><div class="ni-name">${escapeHtml(x.name)}</div><div class="ni-cat">${catLabel(x.category)}</div></div>
    </div>`).join('') || `<p class="empty-hint">${t('similarEmpty')}</p>`;
}

function renderDetailWidgets(data) {
  const wBox = document.getElementById('pdWeather');
  if (wBox && data.weather) {
    const w = data.weather;
    wBox.innerHTML = `<div class="ac-title">🌤️ ${t('weatherTitle')}</div>
      <div class="weather-row"><span>${w.label || '—'}</span><strong>${w.tempC != null ? w.tempC + '°C' : '—'}</strong></div>
      ${w.fallback ? `<small class="weather-fallback">${t('weatherEstimate')}</small>` : ''}`;
  }
  const lBox = document.getElementById('pdLocalInfo');
  if (lBox && data.localInfo) {
    const li = data.localInfo;
    lBox.innerHTML = `<div class="ac-title">🕐 ${t('localInfoTitle')}</div>
      <div class="ic-row"><span class="ic-lbl">${t('localTime')}</span><span class="ic-val">${escapeHtml(li.localTime || '—')}</span></div>
      <div class="ic-row"><span class="ic-lbl">${t('localCurrency')}</span><span class="ic-val">${li.currency?.code || '—'} ${li.currency?.symbol || ''}</span></div>
      ${li.entryTryEstimate ? `<div class="ic-row"><span class="ic-lbl">${t('entryTry')}</span><span class="ic-val">~${li.entryTryEstimate} ₺</span></div>` : ''}`;
  }
  const liveBox = document.getElementById('pdLiveData');
  if (liveBox && data.liveData) {
    const ld = data.liveData;
    const b = ld.budget || {};
    liveBox.innerHTML = `<div class="ac-title">💰 ${t('liveBudgetTitle')}</div>
      <div class="ic-row"><span class="ic-lbl">${t('budgetLow')}</span><span class="ic-val">~${b.low || '—'} ₺</span></div>
      <div class="ic-row"><span class="ic-lbl">${t('budgetMid')}</span><span class="ic-val">~${b.mid || '—'} ₺</span></div>
      <div class="ic-row"><span class="ic-lbl">${t('hotelAvg')}</span><span class="ic-val">~${ld.hotel?.avgPriceTry || '—'} ₺</span></div>
      ${ld.fallback ? `<small class="weather-fallback">${t('liveEstimate')}</small>` : ''}`;
  }
}

function statusLabel(status) {
  if (status === 'pending') return t('statusPending');
  if (status === 'approved') return t('statusApproved');
  if (status === 'rejected') return t('statusRejected');
  return status;
}

const READ_MORE_MIN = 280;

function setCollapsibleText(textEl, btnEl, text) {
  if (!textEl) return;
  textEl.textContent = text || '';
  textEl.classList.remove('collapsed');
  if (!btnEl) return;
  btnEl.style.display = 'none';
  btnEl.textContent = t('readMore');
  if ((text || '').length <= READ_MORE_MIN) return;
  textEl.classList.add('collapsed');
  btnEl.style.display = 'inline-block';
  btnEl.onclick = () => {
    const collapsed = textEl.classList.toggle('collapsed');
    btnEl.textContent = collapsed ? t('readMore') : t('readLess');
  };
}

const API = '/api';

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (!(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(API + path, { ...opts, headers, credentials: 'include' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error || t('requestFailed');
    if (window.TL_TOAST) window.TL_TOAST.error(msg);
    throw new Error(msg);
  }
  return data;
}

function setAuth(u, tok) {
  user = u;
  token = tok;
  if (u && tok) {
    localStorage.setItem('tl_user', JSON.stringify(u));
    localStorage.setItem('tl_token', tok);
  } else {
    localStorage.removeItem('tl_user');
    localStorage.removeItem('tl_token');
  }
  updateAuthUI();
}

function updateAuthUI() {
  const btn = document.getElementById('authBtn');
  const adminLink = document.getElementById('adminLink');
  if (!btn) return;
  if (user) {
    btn.textContent = `✓ ${user.name.split(' ')[0]}`;
    if (adminLink && ['admin', 'moderator'].includes(user.role)) {
      adminLink.style.display = 'inline-flex';
    }
  } else {
    btn.textContent = t('login');
    if (adminLink) adminLink.style.display = 'none';
  }
}

async function loadPlaces(params = {}, append = false) {
  const qs = new URLSearchParams({ ...params, limit: PAGE_SIZE, offset: append ? placesOffset : 0 }).toString();
  const data = await api('/places?' + qs);
  if (append) places = places.concat(data.places);
  else places = data.places;
  placesTotal = data.total ?? data.count ?? places.length;
  placesOffset = append ? places.length : data.places.length;
  lastOsmHint = !!data.osmHint;
  cardsLoaded = true;
  return data;
}

function stars(n) {
  if (!n) return '';
  return '★'.repeat(Math.floor(n));
}

function showGridSkeleton() {
  const grid = document.getElementById('pgrid');
  if (!grid) return;
  grid.classList.add('skeleton');
  grid.innerHTML = window.TL_SKELETON ? window.TL_SKELETON.card(8) : Array(8).fill(0).map(() => `
    <div class="pc sk"><div class="pc-img" style="background:var(--l2);min-height:160px"></div>
    <div class="pc-body"><div style="height:12px;background:var(--l2);border-radius:4px;width:70%;margin-bottom:8px"></div></div></div>`).join('');
}

function renderGrid(list, append = false) {
  const grid = document.getElementById('pgrid');
  if (grid) grid.classList.remove('skeleton');
  document.getElementById('resCnt').textContent = placesTotal || list.length;
  const browseHint = document.getElementById('browseHint');
  if (browseHint) browseHint.style.display = cardsLoaded ? 'none' : 'block';
  document.getElementById('noRes').style.display = cardsLoaded && !list.length ? 'block' : 'none';
  const hintEl = document.getElementById('osmHint');
  if (hintEl) {
    if (cardsLoaded && !list.length && lastOsmHint) {
      hintEl.style.display = 'block';
      hintEl.innerHTML = `<p>${t('osmHint')}</p><button type="button" class="btn bo bsm" onclick="showOsmComingSoon()">${t('osmSearchSoon')}</button>`;
    } else {
      hintEl.style.display = 'none';
      hintEl.innerHTML = '';
    }
  }
  const html = list.map((p) => `
    <div class="pc" onclick="openDetail(${p.id})">
      <div class="pc-img">
        <img src="${placeImg(p)}" alt="${escapeHtml(p.name)}" loading="lazy" onerror="imgFallback(this,'${p.category}',${p.id})"/>
        <div class="pc-badge">${catLabel(p.category)}</div>
        ${p.isLocal ? `<div class="pc-local">${t('localPick')}</div>` : ''}
        <div class="pc-save" onclick="event.stopPropagation();toggleSave(${p.id},this)">${savedIds.has(p.id) ? '❤️' : '🤍'}</div>
      </div>
      <div class="pc-body">
        <div class="pc-loc">📍 ${escapeHtml(p.location)}</div>
        <div class="pc-name">${escapeHtml(p.name)}</div>
        <div class="pc-rats">
          <div class="rat"><span class="rl">${t('touristlio')}</span><span class="st">${stars(p.tiolaRating)}</span><span class="rn" style="color:var(--star2)">${p.tiolaRating || '—'}</span><span class="rc">(${p.tiolaCount || 0} ${t('tiolaCount')})</span></div>
        </div>
        <div class="pc-foot"><div class="pc-type">${catLabel(p.category)}</div><div style="font-size:.61rem;color:var(--t3)">${escapeHtml(p.country)}</div></div>
      </div>
    </div>`).join('');
  if (append && grid) grid.insertAdjacentHTML('beforeend', html);
  else if (grid) grid.innerHTML = html;
  const loadMore = document.getElementById('loadMoreBtn');
  if (loadMore) loadMore.style.display = places.length < placesTotal ? 'inline-flex' : 'none';
}

function buildFilterParams() {
  const q = document.getElementById('heroSearch')?.value.trim() || '';
  const cnt = document.getElementById('cntSel')?.value.replace(/\s[\u{1F1E0}-\u{1F1FF}]{2}/gu, '').trim() || '';
  const cit = document.getElementById('citSel')?.value || '';
  const dis = document.getElementById('disSel')?.value || '';
  return {
    q,
    category: activeFilterGroup !== 'all' ? '' : activeCat,
    group: activeFilterGroup !== 'all' ? activeFilterGroup : '',
    country: cnt,
    city: cit,
    district: dis,
    minTiola: activeStar || '',
    localOnly: activeLocal === 'local' ? '1' : '',
    entry: activeEntry === 'all' ? '' : activeEntry,
    sort: sortMode,
  };
}

async function loadMapMarkers() {
  if (!window.TL_MAP) return;
  const q = document.getElementById('heroSearch')?.value.trim() || '';
  const cnt = document.getElementById('cntSel')?.value.replace(/\s[\u{1F1E0}-\u{1F1FF}]{2}/gu, '').trim() || '';
  const cit = document.getElementById('citSel')?.value || '';
  const params = new URLSearchParams({
    lang,
    q,
    country: cnt,
    city: cit,
    category: activeCat !== 'all' ? activeCat : '',
    group: activeFilterGroup !== 'all' ? activeFilterGroup : '',
  });
  try {
    const data = await api('/places/map/markers?' + params);
    window.TL_MAP.renderExploreMarkers(data.markers || [], lang);
  } catch (e) {
    console.warn('map markers', e);
  }
}

async function applyFilters() {
  if (!placesLoading) showGridSkeleton();
  placesLoading = true;
  placesOffset = 0;
  currentFilterParams = buildFilterParams();
  try {
    await loadPlaces(currentFilterParams, false);
    renderGrid(places);
    await loadMapMarkers();
  } finally {
    placesLoading = false;
  }
}

async function loadMorePlaces() {
  if (placesLoading || places.length >= placesTotal) return;
  placesLoading = true;
  try {
    await loadPlaces(currentFilterParams, true);
    renderGrid(places, true);
  } finally {
    placesLoading = false;
  }
}

function onSearch(val) {
  const drop = document.getElementById('srchDrop');
  clearTimeout(searchTimer);
  if (!val.trim()) { drop.classList.remove('show'); return; }
  searchTimer = setTimeout(async () => {
    try {
      const data = await api('/places/search?q=' + encodeURIComponent(val.trim()) + '&limit=7');
      const res = data.places;
      if (!res.length) {
        drop.innerHTML = `<div class="sd-empty">${t('noResults')}<br><button type="button" class="btn bo bsm" style="margin-top:8px" onclick="showOsmComingSoon()">${t('osmSearchSoon')}</button></div>`;
      } else {
        drop.innerHTML = res.map((p) => `
          <div class="sd-item" onmousedown="pickSearch(${p.id})">
            <img class="sd-img" src="${placeImg(p)}" onerror="imgFallback(this,'${p.category}',${p.id})"/>
            <div><div class="sd-name">${escapeHtml(p.name)}</div><div class="sd-loc">📍 ${escapeHtml(p.location)}</div>
            <div class="sd-rat">${stars(p.tiolaRating)} ${p.tiolaCount || 0} ${t('tiolaCount')}</div></div>
          </div>`).join('');
      }
      drop.classList.add('show');
    } catch (e) {
      drop.innerHTML = `<div class="sd-empty">${escapeHtml(e.message)}</div>`;
      drop.classList.add('show');
    }
  }, 220);
}

async function showOsmComingSoon() {
  const q = document.getElementById('heroSearch')?.value?.trim() || '';
  try {
    const res = await fetch('/api/osm/search?q=' + encodeURIComponent(q));
    const data = await res.json();
    alert(data.message || t('osmHint'));
  } catch {
    alert(t('osmHint'));
  }
}

function pickSearch(id) {
  document.getElementById('srchDrop').classList.remove('show');
  document.getElementById('heroSearch').value = '';
  openDetail(id);
}

function doSearch() {
  document.getElementById('srchDrop').classList.remove('show');
  applyFilters();
  showExploreTab('discover', document.getElementById('et-discover'));
  document.getElementById('es-discover').scrollIntoView({ behavior: 'smooth' });
}

function quickSearch(q) {
  document.getElementById('heroSearch').value = q;
  applyFilters();
  showExploreTab('discover', document.getElementById('et-discover'));
  setTimeout(() => document.getElementById('es-discover').scrollIntoView({ behavior: 'smooth' }), 100);
}

function showMainTab(tab) {
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  document.getElementById('page-' + tab).classList.add('active');
  document.querySelectorAll('.ntab').forEach((n) => n.classList.remove('on'));
  document.getElementById('nt-' + tab)?.classList.add('on');
  prevTab = tab;
  if (tab === 'blog') renderBlog();
  if (tab === 'profile') updateProfilePage();
  if (tab === 'explore') loadTiolaFeed();
  window.scrollTo(0, 0);
}

function showExploreTab(name, el) {
  document.querySelectorAll('.explore-section').forEach((s) => s.classList.remove('active'));
  document.getElementById('es-' + name).classList.add('active');
  document.querySelectorAll('.etab').forEach((e) => e.classList.remove('on'));
  el.classList.add('on');
  if (name === 'tiolas') loadTiolaFeed();
  if (name === 'categories') loadCategoryStats();
  if (name === 'map' && window.TL_MAP) {
    setTimeout(() => {
      window.TL_MAP.invalidateExplore('exploreMapFull');
      loadMapMarkers();
    }, 200);
  }
  if (name === 'discover' && window.TL_MAP) {
    setTimeout(() => window.TL_MAP.invalidateExplore(), 200);
  }
}

async function loadTiolaFeed() {
  const feed = document.getElementById('tiolaFeed');
  if (!feed) return;
  try {
    const data = await api('/tiolas?limit=30');
    const items = data.tiolas;
    document.getElementById('tiolaEmpty').style.display = items.length ? 'none' : 'block';
    feed.innerHTML = items.map((ti) => renderTiolaCard(ti)).join('');
  } catch (e) {
    feed.innerHTML = `<div class="no-res">${e.message}</div>`;
  }
}

function renderTiolaCard(ti) {
  const place = ti.placeName ? `<strong>${escapeHtml(ti.placeName)}</strong>` : (ti.cityTag ? `📍 ${escapeHtml(ti.cityTag)}` : t('generalTiola'));
  return `
    <div class="tiola-card" ${ti.placeId ? `onclick="openDetail(${ti.placeId})"` : ''}>
      ${ti.photoUrl ? `<img src="${ti.photoUrl}" alt=""/>` : (ti.placeImage ? `<img src="${ti.placeImage}" alt=""/>` : '')}
      <div class="tiola-body">
        <div class="tiola-meta">${ti.userName} · ${formatDate(ti.createdAt)}</div>
        <div>${place}</div>
        ${ti.stars ? `<div class="tiola-stars">${stars(ti.stars)}</div>` : ''}
        <div class="tiola-txt">${escapeHtml(ti.text)}</div>
      </div>
    </div>`;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : iso + 'Z');
  return d.toLocaleDateString(lang === 'en' ? 'en' : 'tr');
}

function setFilterGroup(group, el) {
  activeFilterGroup = group;
  document.querySelectorAll('.gpill').forEach((c) => c.classList.remove('on'));
  if (el) el.classList.add('on');
  applyFilters();
}

function setCat(cat, el) {
  activeCat = cat;
  document.querySelectorAll('.cpill').forEach((c) => c.classList.remove('on'));
  if (el) el.classList.add('on');
  applyFilters();
}

function setCatAndSwitch(cat) {
  activeCat = cat;
  showExploreTab('discover', document.getElementById('et-discover'));
  applyFilters();
  document.getElementById('es-discover')?.scrollIntoView({ behavior: 'smooth' });
}

async function loadCategoryStats() {
  if (placesTotal > 0) { updateCategoryCounts(); return; }
  try {
    const data = await api('/places?limit=1&offset=0&sort=popularity');
    placesTotal = data.total || 0;
    document.getElementById('stat-places').textContent = String(placesTotal);
    const meta = await api('/places?limit=500&offset=0&sort=az');
    places = meta.places;
    updateCategoryCounts();
  } catch (e) { console.warn(e); }
}

function setStar(el, v) {
  activeStar = v;
  document.querySelectorAll('.fchip.gold').forEach((c) => c.classList.remove('on'));
  el.classList.add('on');
}

function soloChip(el, sel) {
  document.querySelectorAll(sel).forEach((c) => c.classList.remove('on'));
  el.classList.add('on');
}

function sortChange(v) { sortMode = v; applyFilters(); }

function resetFilters() {
  activeCat = 'all';
  activeFilterGroup = 'all';
  activeStar = 0;
  activeEntry = 'all';
  activeLocal = 'all';
  document.querySelectorAll('.cpill').forEach((c) => c.classList.remove('on'));
  document.querySelectorAll('.gpill').forEach((c) => c.classList.remove('on'));
  document.querySelector('.cpill')?.classList.add('on');
  document.querySelector('.gpill')?.classList.add('on');
  document.getElementById('cntSel').value = '';
  document.getElementById('citSel').innerHTML = `<option value="">${t('allCities')}</option>`;
  document.getElementById('disSel').innerHTML = `<option value="">${t('allDistricts')}</option>`;
  document.getElementById('heroSearch').value = '';
  applyFilters();
}

function updateCountryList(cont) {
  const cs = document.getElementById('cntSel');
  cs.innerHTML = `<option value="">${t('allCountries')}</option>`;
  const MAP = {
    Europe: ['France 🇫🇷', 'Italy 🇮🇹', 'Greece 🇬🇷', 'Spain 🇪🇸', 'UK 🇬🇧', 'Portugal 🇵🇹', 'Norway 🇳🇴', 'Iceland 🇮🇸', 'Turkey 🇹🇷'],
    Asia: ['Japan 🇯🇵', 'Turkey 🇹🇷', 'India 🇮🇳', 'South Korea 🇰🇷', 'Vietnam 🇻🇳', 'Cambodia 🇰🇭', 'Nepal 🇳🇵'],
    Americas: ['USA 🇺🇸', 'Brazil 🇧🇷', 'Peru 🇵🇪', 'Cuba 🇨🇺'],
    'Middle East': ['UAE 🇦🇪', 'Jordan 🇯🇴'],
    Africa: ['Egypt 🇪🇬', 'Tanzania 🇹🇿'],
    Oceania: ['Australia 🇦🇺'],
  };
  if (!cont) Object.keys(CITYDB).forEach((c) => { const o = document.createElement('option'); o.textContent = c; cs.appendChild(o); });
  else (MAP[cont] || []).forEach((c) => { const o = document.createElement('option'); o.textContent = c; cs.appendChild(o); });
  document.getElementById('citSel').innerHTML = `<option value="">${t('allCities')}</option>`;
  document.getElementById('disSel').innerHTML = `<option value="">${t('allDistricts')}</option>`;
}

function updateCityList(cnt) {
  const cs = document.getElementById('citSel');
  cs.innerHTML = `<option value="">${t('allCities')}</option>`;
  document.getElementById('disSel').innerHTML = `<option value="">${t('allDistricts')}</option>`;
  if (CITYDB[cnt]) Object.keys(CITYDB[cnt]).forEach((c) => { const o = document.createElement('option'); o.textContent = c; cs.appendChild(o); });
}

function updateDistrictList(city) {
  const ds = document.getElementById('disSel');
  ds.innerHTML = `<option value="">${t('allDistricts')}</option>`;
  const cnt = document.getElementById('cntSel').value;
  const dists = CITYDB[cnt] && CITYDB[cnt][city];
  if (dists) dists.forEach((d) => { const o = document.createElement('option'); o.textContent = d; ds.appendChild(o); });
}

function renderDetailGallery(p) {
  const gal = document.getElementById('pdGallery');
  if (!gal) return;
  const imgs = (p.photos && p.photos.length ? p.photos : [placeImg(p)]).slice(0, 5);
  if (imgs.length <= 1) {
    gal.style.display = 'none';
    gal.innerHTML = '';
    return;
  }
  gal.style.display = 'flex';
  gal.innerHTML = imgs.map((src, i) => `
    <img src="${src}" alt="" loading="lazy" class="${i === 0 ? 'active' : ''}" data-idx="${i}"/>`).join('');
  gal.querySelectorAll('img').forEach((thumb) => {
    thumb.onclick = () => {
      document.getElementById('pdImg').src = thumb.src;
      gal.querySelectorAll('img').forEach((x) => x.classList.remove('active'));
      thumb.classList.add('active');
    };
  });
}

function showDetailTab(name, el) {
  document.querySelectorAll('.dtab').forEach((t) => t.classList.remove('on'));
  if (el) el.classList.add('on');
  document.querySelectorAll('.dtab-panel').forEach((p) => p.classList.remove('active'));
  document.getElementById('dtab-' + name)?.classList.add('active');
}

async function openDetail(id) {
  const detailBody = document.querySelector('#page-detail .pd-body');
  if (detailBody && window.TL_SKELETON) {
    const prev = detailBody.innerHTML;
    detailBody.dataset.prevHtml = prev;
  }
  try {
    const data = await api('/places/' + id + '?lang=' + lang);
    const p = data.place;
    activePlace = p;
    updateSeoForPlace(p);
    const imgEl = document.getElementById('pdImg');
    imgEl.src = placeImg(p);
    imgEl.loading = 'lazy';
    imgEl.onerror = function () { imgFallback(this, p.category, p.id); };
    renderDetailGallery(p);
    document.getElementById('pdCat').textContent = catLabel(p.category);
    document.getElementById('pdTitle').textContent = p.name;
    document.getElementById('pdLoc').textContent = '📍 ' + p.location + ' · ' + p.country;
    setCollapsibleText(document.getElementById('pdOverview'), document.getElementById('pdOverviewMore'), placeField(p, 'overview') || placeField(p, 'description'));
    setCollapsibleText(document.getElementById('pdHist'), document.getElementById('pdHistMore'), placeField(p, 'history'));
    const things = placeListField(p, 'thingsToDo');
    document.getElementById('pdThings').innerHTML = things.length
      ? things.map((item) => `<li>${escapeHtml(item)}</li>`).join('')
      : `<li>${escapeHtml(placeField(p, 'tips') || '—')}</li>`;
    setCollapsibleText(document.getElementById('pdCulture'), document.getElementById('pdCultureMore'), placeField(p, 'cultureFood'));
    setCollapsibleText(document.getElementById('pdTips'), document.getElementById('pdTipsMore'), placeField(p, 'travelTips') || placeField(p, 'tips'));
    const howEl = document.getElementById('pdHowToGet');
    if (howEl) howEl.textContent = placeField(p, 'howToGetThere') || '—';
    const bestEl = document.getElementById('pdBestTime');
    if (bestEl) bestEl.textContent = placeField(p, 'bestTime') || '—';
    document.getElementById('pdTags').innerHTML = (p.tags || []).map((tag) => `<span class="pd-tag">${escapeHtml(tag)}</span>`).join('');
    renderFaqAccordion(p);
    renderNearbyCards(data.nearby);
    renderSimilarCards(data.similar);
    renderDetailWidgets(data);
    const affBox = document.getElementById('pdAffiliate');
    if (affBox) {
      if (p.affiliateHotelUrl || p.affiliateBookingUrl) {
        affBox.style.display = 'block';
        affBox.innerHTML = `<div class="ac-title">${t('affiliateTitle')}</div>
          ${p.affiliateBookingUrl ? `<a href="${p.affiliateBookingUrl}" rel="nofollow sponsored" target="_blank" class="btn bo bsm">${t('affiliateBook')}</a>` : ''}
          ${p.affiliateHotelUrl ? `<a href="${p.affiliateHotelUrl}" rel="nofollow sponsored" target="_blank" class="btn bo bsm">${t('affiliateHotel')}</a>` : ''}`;
      } else affBox.style.display = 'none';
    }
    const canon = document.querySelector('link[rel="canonical"]');
    if (canon) canon.href = `${location.origin}/?place=${p.id}`;
    if (window.TL_MAP) window.TL_MAP.renderDetailMap(p, lang);
    document.getElementById('pdTS').textContent = stars(p.tiolaRating);
    document.getElementById('pdTR').textContent = (p.tiolaRating || '—') + ' / 5';
    document.getElementById('pdTC').textContent = (p.tiolaCount || 0) + ' ' + t('tiolaCount');
    document.getElementById('icCountry').textContent = p.country;
    document.getElementById('icCity').textContent = p.city;
    document.getElementById('icCat').textContent = catLabel(p.category);
    document.getElementById('icEntry').textContent = placeField(p, 'entryFee') || '—';
    document.getElementById('icBest').textContent = placeField(p, 'bestTime') || '—';
    await renderRevList();
    updateRevForm();
    showMainTab('detail');
  } catch (e) {
    if (window.TL_TOAST) window.TL_TOAST.error(e.message);
  }
}

function goBack() {
  if (window.TL_MAP) window.TL_MAP.destroyDetailMap();
  window.TL_I18N.apply(lang);
  showMainTab(prevTab === 'detail' ? 'explore' : prevTab);
}

async function renderRevList() {
  if (!activePlace) return;
  const data = await api('/tiolas?placeId=' + activePlace.id);
  document.getElementById('revList').innerHTML = data.tiolas.map((r) => `
    <div class="ri">
      <div class="ri-hd">
        <div class="ri-user">
          <div class="riav" style="background:${r.avatarColor}">${r.userName[0]}</div>
          <div><div class="rinm">${escapeHtml(r.userName)}</div><div class="ridt">${formatDate(r.createdAt)}</div></div>
        </div>
        ${r.stars ? `<div class="ristars">${stars(r.stars)}</div>` : `<span style="font-size:.62rem;color:var(--t3)">${t('noRating')}</span>`}
      </div>
      ${r.photoUrl ? `<img src="${r.photoUrl}" style="width:100%;max-height:200px;object-fit:cover;border-radius:8px;margin-bottom:8px"/>` : ''}
      <div class="ritxt">${escapeHtml(r.text)}</div>
    </div>`).join('') || `<div class="no-res">${t('noApprovedTiola')}</div>`;
}

function updateRevForm() {
  const av = document.getElementById('rfAv');
  const nm = document.getElementById('rfNm');
  const tp = document.getElementById('rfTp');
  const me = document.getElementById('memberEx');
  const nt = document.getElementById('rfNote');
  const starStep = document.getElementById('starStep');
  if (!user) {
    av.textContent = '?'; nm.textContent = t('notLoggedIn'); tp.textContent = '';
    if (me) me.style.display = 'none';
    if (starStep) starStep.style.display = 'none';
    nt.innerHTML = `<a href="#" onclick="openAuth();return false;">${t('loginToTiola')}</a> ${t('loginToTiolaNote')}`;
  } else {
    av.textContent = user.name[0];
    av.style.background = user.avatarColor || 'var(--b)';
    nm.textContent = user.name;
    tp.textContent = t('writeTiola');
    if (me) me.style.display = 'flex';
    if (starStep) starStep.style.display = 'flex';
    nt.textContent = t('tiolaModeration');
  }
}

function rate(n) {
  if (!user) return;
  rating = n;
  document.querySelectorAll('#rfStars span').forEach((s, i) => s.classList.toggle('lit', i < n));
}

async function postTiola() {
  const txt = document.getElementById('rfTxt').value.trim();
  if (!txt) { window.TL_TOAST?.warning(t('writeSomething')); return; }
  if (!user) { openAuth(); return; }
  if (!activePlace) return;
  const fd = new FormData();
  fd.append('text', txt);
  if (rating) fd.append('stars', rating);
  fd.append('placeId', activePlace.id);
  const cat = document.getElementById('revCatSel')?.value;
  if (cat) fd.append('category', cat);
  const photo = document.getElementById('rfPhoto')?.files?.[0];
  if (photo) fd.append('photo', photo);
  try {
    const data = await api('/tiolas', { method: 'POST', body: fd });
    window.TL_TOAST?.success(data.message || t('tiolaPending'));
    document.getElementById('rfTxt').value = '';
    document.getElementById('rfPhoto').value = '';
    rating = 0;
    document.querySelectorAll('#rfStars span').forEach((s) => s.classList.remove('lit'));
    updateRevForm();
  } catch (e) {
    /* toast from api */
  }
}

async function renderBlog() {
  try {
    const data = await api('/blogs' + (blogCat !== 'all' ? '?category=' + blogCat : ''));
    const blogs = data.blogs;
    if (!blogs.length) {
      document.getElementById('blogGrid').innerHTML = `<div class="no-res">${t('blogEmpty')}</div>`;
      return;
    }
    const feat = blogs[0];
    const rest = blogs.slice(1);
    document.getElementById('blogGrid').innerHTML = `
      <div class="bcard feat" onclick="${feat.placeId ? `openDetail(${feat.placeId})` : ''}">
        <img class="bimg" src="${feat.imageUrl || ''}"/>
        <div class="bbody"><div class="bcat-lbl">${feat.category}</div><div class="btitle">${escapeHtml(feat.title)}</div>
        <div class="bexc">${escapeHtml(feat.excerpt || '')}</div>
        <div class="bmeta"><div class="bauthor"><div class="bav" style="background:var(--b)">${feat.authorName[0]}</div><span>${escapeHtml(feat.authorName)}</span></div></div></div>
      </div>
      ${rest.slice(0, 4).map((b) => `
        <div class="bcard" onclick="${b.placeId ? `openDetail(${b.placeId})` : ''}">
          <img class="bimg" src="${b.imageUrl || ''}"/>
          <div class="bbody"><div class="bcat-lbl">${b.category}</div><div class="btitle">${escapeHtml(b.title)}</div>
          <div class="bmeta"><div class="bauthor"><div class="bav" style="background:var(--b2)">${b.authorName[0]}</div><span>${escapeHtml(b.authorName)}</span></div></div></div>
        </div>`).join('')}`;
  } catch (e) {
    document.getElementById('blogGrid').innerHTML = `<div class="no-res">${e.message}</div>`;
  }
}

function setBlogCat(cat, el) {
  blogCat = cat;
  document.querySelectorAll('.bcat-chip').forEach((c) => c.classList.remove('on'));
  el.classList.add('on');
  renderBlog();
}

function showPTab(name, el) {
  document.querySelectorAll('.ptab').forEach((t) => t.classList.remove('on'));
  el.classList.add('on');
  document.querySelectorAll('.ptab-c').forEach((t) => t.classList.remove('active'));
  document.getElementById('ptab-' + name).classList.add('active');
}

async function updateProfilePage() {
  if (!user) {
    document.getElementById('pLoginNotice').style.display = 'block';
    document.getElementById('pContent').style.display = 'none';
    return;
  }
  document.getElementById('pLoginNotice').style.display = 'none';
  document.getElementById('pContent').style.display = 'block';
  document.querySelector('.prof-name').textContent = user.name;
  document.querySelector('.prof-av').textContent = user.name[0];

  const [myTiolas, myBlogs, saved, visitedStats] = await Promise.all([
    api('/tiolas?mine=1'),
    api('/blogs?mine=1'),
    api('/places/saved/all'),
    api('/travel-lists/visited/stats').catch(() => ({ totalVisited: 0, countriesVisited: 0 })),
  ]);

  savedIds = new Set(saved.places.map((p) => p.id));
  const approvedT = myTiolas.tiolas.filter((t) => t.status === 'approved');
  const pending = [...myTiolas.tiolas.filter((t) => t.status === 'pending'), ...myBlogs.blogs.filter((b) => b.status === 'pending')];

  document.getElementById('pRevCnt').textContent = myTiolas.tiolas.length;
  document.getElementById('pSavedCnt').textContent = savedIds.size;
  document.getElementById('pCntCnt').textContent = visitedStats.countriesVisited || new Set(approvedT.map((t) => t.countryTag || t.placeId)).size;
  const pVis = document.getElementById('pVisitedCnt');
  if (pVis) pVis.textContent = visitedStats.totalVisited || 0;

  if (window.TL_TRIP) window.TL_TRIP.loadUserTrips('myTripPlans');

  try {
    const visited = await api('/travel-lists/visited/all');
    const vg = document.getElementById('visitedGrid');
    const ve = document.getElementById('visitedEmpty');
    if (vg) {
      if (!visited.places.length) { vg.innerHTML = ''; if (ve) ve.style.display = 'block'; }
      else {
        if (ve) ve.style.display = 'none';
        vg.innerHTML = visited.places.map((p) => `
          <div class="pc" onclick="openDetail(${p.id})">
            <div class="pc-img"><img src="${placeImg(p)}" alt="" loading="lazy"/></div>
            <div class="pc-body"><div class="pc-name">${escapeHtml(p.name)}</div><div style="font-size:.65rem;color:var(--t3)">${p.visitedAt || ''}</div></div>
          </div>`).join('');
      }
    }
  } catch { /* optional */ }

  const tiList = document.getElementById('myTiolaList');
  const tiEmpty = document.getElementById('tiolaListEmpty');
  if (!myTiolas.tiolas.length) { tiList.innerHTML = ''; tiEmpty.style.display = 'block'; }
  else { tiEmpty.style.display = 'none'; tiList.innerHTML = myTiolas.tiolas.map((t) => renderTiolaCard(t)).join(''); }

  const bl = document.getElementById('myBlogList');
  const be = document.getElementById('blogListEmpty');
  if (!myBlogs.blogs.length) { bl.innerHTML = ''; be.style.display = 'block'; }
  else {
    be.style.display = 'none';
    bl.innerHTML = myBlogs.blogs.map((b) => `
      <div class="my-rev-item">
        <div><div style="font-weight:600;color:var(--navy)">${escapeHtml(b.title)}</div>
        <span class="status-${b.status}">${statusLabel(b.status)}</span>
        <div style="font-size:.77rem;color:var(--t2);margin-top:4px">${escapeHtml((b.excerpt || '').slice(0, 100))}</div></div>
      </div>`).join('');
  }

  const pl = document.getElementById('myPendingList');
  const pe = document.getElementById('pendingEmpty');
  if (!pending.length) { pl.innerHTML = ''; pe.style.display = 'block'; }
  else {
    pe.style.display = 'none';
    pl.innerHTML = pending.map((item) => `
      <div class="my-rev-item">
        <div><div style="font-weight:600">${escapeHtml(item.title || item.text?.slice(0, 40) || 'Tiola')}</div>
        <span class="status-pending">${t('statusPending')}</span></div>
      </div>`).join('');
  }

  const sg = document.getElementById('savedGrid');
  const se = document.getElementById('savedEmpty');
  if (!saved.places.length) { sg.innerHTML = ''; se.style.display = 'block'; }
  else {
    se.style.display = 'none';
    sg.innerHTML = saved.places.map((p) => `
      <div class="pc" onclick="openDetail(${p.id})">
        <div class="pc-img"><img src="${placeImg(p)}" onerror="imgFallback(this,'${p.category}',${p.id})"/><div class="pc-save" onclick="event.stopPropagation();toggleSave(${p.id},this)">❤️</div></div>
        <div class="pc-body"><div class="pc-name">${p.name}</div></div>
      </div>`).join('');
  }

  const arcSel = document.getElementById('arcPlace');
  arcSel.innerHTML = `<option value="">${t('placeOptional')}</option>` + places.map((p) => `<option value="${p.id}">${escapeHtml(p.name)} — ${escapeHtml(p.country)}</option>`).join('');
}

function showWriteMode(mode, el) {
  document.querySelectorAll('#ptab-write .ptabs .ptab').forEach((t) => t.classList.remove('on'));
  el.classList.add('on');
  document.getElementById('writeTiolaForm').style.display = mode === 'tiola' ? 'block' : 'none';
  document.getElementById('writeBlogForm').style.display = mode === 'blog' ? 'block' : 'none';
}

async function toggleSave(id, btn) {
  if (!user) { openAuth(); return; }
  try {
    if (savedIds.has(id)) {
      await api('/places/' + id + '/save', { method: 'DELETE' });
      savedIds.delete(id);
      btn.textContent = '🤍';
      window.TL_TOAST?.info(t('removedFromSaved'));
    } else {
      await api('/places/' + id + '/save', { method: 'POST' });
      savedIds.add(id);
      btn.textContent = '❤️';
      window.TL_TOAST?.success(t('addedToSaved'));
    }
  } catch { /* toast from api */ }
}

function arcRate(n) {
  arcRating = n;
  document.querySelectorAll('#arcStars span').forEach((s, i) => s.classList.toggle('lit', i < n));
}

async function submitArc() {
  const txt = document.getElementById('arcTxt').value.trim();
  if (!txt) { alert(t('writeSomething')); return; }
  if (!user) { openAuth(); return; }
  const fd = new FormData();
  fd.append('text', txt);
  const pid = document.getElementById('arcPlace').value;
  if (pid) fd.append('placeId', pid);
  const city = document.getElementById('arcCity')?.value.trim();
  if (city) fd.append('cityTag', city);
  if (arcRating) fd.append('stars', arcRating);
  const cat = document.getElementById('arcCat')?.value;
  if (cat) fd.append('category', cat);
  const photo = document.getElementById('arcPhoto')?.files?.[0];
  if (photo) fd.append('photo', photo);
  try {
    const data = await api('/tiolas', { method: 'POST', body: fd });
    alert(data.message || t('tiolaPending'));
    document.getElementById('arcTxt').value = '';
    document.getElementById('arcPhoto').value = '';
    arcRating = 0;
    updateProfilePage();
  } catch (e) { alert(e.message); }
}

async function submitBlog() {
  if (!user) { openAuth(); return; }
  const title = document.getElementById('blogTitle').value.trim();
  const body = document.getElementById('blogBody').value.trim();
  if (!title || !body) { alert(t('titleRequired')); return; }
  try {
    const data = await api('/blogs', {
      method: 'POST',
      body: JSON.stringify({
        title, body, category: document.getElementById('blogCat').value,
      }),
    });
    alert(data.message || t('tiolaPending'));
    document.getElementById('blogTitle').value = '';
    document.getElementById('blogBody').value = '';
    updateProfilePage();
  } catch (e) { alert(e.message); }
}

function openAuth() {
  document.getElementById('authOv').classList.add('on');
  buildAuthForm(authMode);
}

function closeAuth() {
  document.getElementById('authOv').classList.remove('on');
}

function swTab(m, el) {
  el.parentElement.querySelectorAll('.atab').forEach((x) => x.classList.remove('on'));
  el.classList.add('on');
  buildAuthForm(m);
}

function buildAuthForm(m) {
  authMode = m;
  document.getElementById('authForm').innerHTML = m === 'login'
    ? `<input class="ain" id="loginEmail" type="email" placeholder="${t('authEmail')}"/>
       <input class="ain" id="loginPass" type="password" placeholder="${t('authPass')}"/>
       <button class="btn bp" style="width:100%;padding:11px;margin-top:2px" onclick="doLoginSubmit()">${t('login')}</button>`
    : `<input class="ain" id="regName" type="text" placeholder="${t('authName')}"/>
       <input class="ain" id="regEmail" type="email" placeholder="${t('authEmail')}"/>
       <input class="ain" id="regPass" type="password" placeholder="${t('authPassMin')}"/>
       <div style="display:flex;gap:6px;align-items:flex-start;font-size:.68rem;color:var(--t2);margin-bottom:8px">
         <input type="checkbox" id="gC" style="accent-color:var(--b);margin-top:2px"/>
         <label for="gC"><a href="/legal/kvkk.html" target="_blank" rel="noopener">${t('legalKvkk')}</a> · <a href="/legal/terms.html" target="_blank" rel="noopener">${t('termsShort')}</a> — ${lang === 'en' ? 'I accept' : 'kabul ediyorum'}</label>
       </div>
       <button class="btn bp" style="width:100%;padding:11px" onclick="doRegSubmit()">${t('authCreate')}</button>`;
}

async function doLoginSubmit() {
  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: document.getElementById('loginEmail').value,
        password: document.getElementById('loginPass').value,
      }),
    });
    setAuth(data.user, data.token);
    closeAuth();
    window.TL_TOAST?.success(t('loginSuccess'));
    if (activePlace) updateRevForm();
    if (document.getElementById('page-profile').classList.contains('active')) updateProfilePage();
  } catch { /* toast from api */ }
}

async function doRegSubmit() {
  if (!document.getElementById('gC')?.checked) { window.TL_TOAST?.warning(t('kvkkRequired')); return; }
  try {
    const data = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('regName').value,
        email: document.getElementById('regEmail').value,
        password: document.getElementById('regPass').value,
        kvkkAccepted: true,
      }),
    });
    setAuth(data.user, data.token);
    closeAuth();
    window.TL_TOAST?.success(t('registerSuccess'));
  } catch { /* toast from api */ }
}

async function doLogout() {
  try {
    await api('/auth/logout', { method: 'POST' });
    setAuth(null, null);
    window.TL_TOAST?.info(t('logoutSuccess'));
    updateProfilePage();
  } catch { setAuth(null, null); }
}

function toggleNavMenu() {
  document.getElementById('navMenu')?.classList.toggle('open');
}

function updateCategoryCounts() {
  const counts = {};
  places.forEach((p) => { counts[p.category] = (counts[p.category] || 0) + 1; });
  Object.keys(counts).forEach((cat) => {
    const el = document.getElementById(`cat-cnt-${cat}`);
    if (el) el.textContent = `${counts[cat]} ${t('placesCount')}`;
  });
  ['cafe', 'restaurant', 'spa', 'shopping', 'nightlife'].forEach((cat) => {
    const el = document.getElementById(`cat-cnt-${cat}`);
    if (el && !counts[cat]) el.textContent = t('placesCountZero');
  });
  const countries = new Set(places.map((p) => p.country).filter(Boolean));
  const sp = document.getElementById('stat-places');
  const sc = document.getElementById('stat-countries');
  if (sp) sp.textContent = String(places.length);
  if (sc) sc.textContent = String(countries.size);
}

function buildTourPlan() {
  const city = document.getElementById('tourCity')?.value.trim();
  const days = document.getElementById('tourDays')?.value;
  const pace = document.getElementById('tourPace')?.value || 'normal';
  const box = document.getElementById('tourResult');
  if (!city) {
    box.innerHTML = `<div class="tour-empty">${t('tourEnterCity')}</div>`;
    return;
  }
  const plan = window.TL_TOUR.generate(places, { city, days, pace, lang });
  window.TL_TOUR.renderPlan(box, plan);
}

function refreshAfterLang() {
  updateAuthUI();
  if (places.length) {
    renderGrid(places);
    updateCategoryCounts();
    loadMapMarkers();
  }
  if (document.getElementById('page-detail')?.classList.contains('active') && activePlace) {
    openDetail(activePlace.id);
  }
  if (document.getElementById('page-explore')?.classList.contains('active')) {
    loadTiolaFeed();
  }
  if (document.getElementById('page-blog')?.classList.contains('active')) renderBlog();
  if (document.getElementById('page-profile')?.classList.contains('active')) updateProfilePage();
  if (document.getElementById('authOv')?.classList.contains('on')) buildAuthForm(authMode);
  if (window.TL_COOKIE) window.TL_COOKIE.render(lang);
}

function setLang(l, btn) {
  lang = l;
  localStorage.setItem('tl_lang', l);
  document.querySelectorAll('.lb').forEach((b) => b.classList.remove('on'));
  btn.classList.add('on');
  window.TL_I18N.apply(l);
  refreshAfterLang();
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.srch-wrap')) document.getElementById('srchDrop')?.classList.remove('show');
});

function handleDeepLink() {
  const id = new URLSearchParams(location.search).get('place');
  if (id && /^\d+$/.test(id)) openDetail(Number(id));
}

async function init() {
  window.TL_I18N.apply(lang);
  if (window.TL_COOKIE) window.TL_COOKIE.render(lang);
  document.querySelectorAll('.lb').forEach((b) => {
    b.classList.toggle('on', (lang === 'en' && b.textContent.trim() === 'EN') || (lang === 'tr' && b.textContent.trim() === 'TR'));
  });
  updateAuthUI();
  renderGrid([]);
  try {
    await loadMapMarkers();
    if (user && token) {
      try {
        const me = await api('/auth/me');
        setAuth(me.user, token);
        const saved = await api('/places/saved/all');
        savedIds = new Set(saved.places.map((p) => p.id));
      } catch {
        setAuth(null, null);
      }
    }
  } catch (e) {
    console.error(e);
  }
  handleDeepLink();
}

init();
