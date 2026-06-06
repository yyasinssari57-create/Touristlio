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

function safeUrl(url) {
  const s = String(url || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s) && !/^javascript:/i.test(s)) return s;
  if (s.startsWith('/') && !s.startsWith('//')) return s;
  return '';
}

function placeImg(p) {
  const candidates = [p?.imageUrl, ...(Array.isArray(p?.photos) ? p.photos : [])];
  for (const raw of candidates) {
    const url = safeUrl(raw);
    if (url.startsWith('http') && !/undefined|null|placeholder/i.test(url)) return url;
    if (url.startsWith('/')) return url;
  }
  return fallbackImgUrl(p?.category, p?.id);
}

function imgFallback(el, category, placeId) {
  el.onerror = null;
  el.src = fallbackImgUrl(category, placeId);
}

let user = JSON.parse(localStorage.getItem('tl_user') || 'null');
window.user = user;
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
let blogMeta = null;
let blogSearchQ = '';
let blogSearchTimer;
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
let categoryMeta = null;

const GROUP_I18N = {
  historical: 'grpHistorical',
  nature: 'grpNature',
  museums: 'grpMuseums',
  restaurants: 'grpRestaurants',
  hotels: 'grpHotels',
  activities: 'grpActivities',
};

const CATEGORY_IMAGES = {
  landmark: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=400&q=80',
  historical: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=400&q=80',
  museum: 'https://images.unsplash.com/photo-1582555172866-f73bb12a2ab3?w=400&q=80',
  restaurant: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&q=80',
  cafe: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=400&q=80',
  beach: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&q=80',
  nature: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&q=80',
  park: 'https://images.unsplash.com/photo-1485871981521-5b1fd3805eee?w=400&q=80',
  viewpoint: 'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=400&q=80',
  religious: 'https://images.unsplash.com/photo-1478436127897-769e1b3f0f36?w=400&q=80',
  adventure: 'https://images.unsplash.com/photo-1516912481808-3406841bd33c?w=400&q=80',
  market: 'https://images.unsplash.com/photo-1527838832700-5059252407fa?w=400&q=80',
  shopping: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&q=80',
  spa: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=400&q=80',
  nightlife: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&q=80',
  food: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&q=80',
  entertainment: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&q=80',
  hotel: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=400&q=80',
};

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
  const meta = categoryMeta?.categories?.find((c) => c.slug === cat);
  if (meta) {
    const name = lang === 'en' ? meta.nameEn : meta.nameTr;
    return `${meta.icon ? `${meta.icon} ` : ''}${name}`;
  }
  return window.TL_I18N.catLabel(lang, cat);
}

function categoryImage(slug) {
  return CATEGORY_IMAGES[slug] || CATEGORY_IMAGES.landmark;
}

async function loadCategoryMeta() {
  try {
    const data = await api('/places/meta/categories');
    categoryMeta = data;
    window.TL_CATEGORY_META = data;
    const slugs = new Set((data.categories || []).map((c) => c.slug));
    if (activeCat !== 'all' && !slugs.has(activeCat)) activeCat = 'all';
    if (activeFilterGroup !== 'all' && !(data.groups || []).includes(activeFilterGroup)) activeFilterGroup = 'all';
    renderExploreFilters();
    renderCategoryCards();
    updateCategoryCounts();
  } catch (e) {
    console.warn('category meta', e);
  }
}

function buildExploreFiltersHtml() {
  const allOn = activeFilterGroup === 'all' && activeCat === 'all';
  let html = `<div class="fpill${allOn ? ' on' : ''}" data-kind="all" data-filter="all" onclick="setExploreFilter('all',this)">${t('all')}</div>`;
  (categoryMeta.groups || []).forEach((g) => {
    const label = t(GROUP_I18N[g] || g);
    const on = activeFilterGroup === g ? ' on' : '';
    html += `<div class="fpill fpill-group${on}" data-kind="group" data-filter="${escapeHtml(g)}" onclick="setExploreFilter('group:${escapeHtml(g)}',this)">${escapeHtml(label)}</div>`;
  });
  (categoryMeta.categories || []).forEach((c) => {
    const label = lang === 'en' ? c.nameEn : c.nameTr;
    const icon = c.icon ? `${c.icon} ` : '';
    const on = activeFilterGroup === 'all' && activeCat === c.slug ? ' on' : '';
    html += `<div class="fpill fpill-cat${on}" data-kind="cat" data-filter="${escapeHtml(c.slug)}" onclick="setExploreFilter('cat:${escapeHtml(c.slug)}',this)">${icon}${escapeHtml(label)}</div>`;
  });
  return html;
}

function renderExploreFilters() {
  if (!categoryMeta) return;
  const html = buildExploreFiltersHtml();
  ['discoverFilterStrip', 'mapFilterStrip'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  });
}

function renderCategoryCards() {
  const grid = document.getElementById('categoryCardsGrid');
  if (!grid || !categoryMeta) return;
  grid.innerHTML = (categoryMeta.categories || []).map((c) => {
    const label = lang === 'en' ? c.nameEn : c.nameTr;
    return `
      <div class="ccard" data-cat="${c.slug}" onclick="setCatAndSwitch('${c.slug}')">
        <img src="${categoryImage(c.slug)}" alt="" loading="lazy"/>
        <div class="cinfo">
          <div class="cname">${escapeHtml(label)}</div>
          <div class="ccnt" id="cat-cnt-${c.slug}">—</div>
        </div>
      </div>`;
  }).join('');
}

function isExploreMapTabActive() {
  return document.getElementById('es-map')?.classList.contains('active');
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
  if (status === 'draft') return t('statusDraft');
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

function apiErrorMessage(data) {
  const err = data?.error;
  if (typeof err === 'string' && err) return err;
  if (err && typeof err === 'object') {
    if (typeof err.message === 'string' && err.message) return err.message;
    if (Array.isArray(err) && err[0]?.msg) return err[0].msg;
  }
  if (Array.isArray(data?.errors) && data.errors[0]?.msg) return data.errors[0].msg;
  return t('requestFailed');
}

window.api = async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const isForm = opts.body instanceof FormData;
  if (!isForm && opts.body != null) headers['Content-Type'] = 'application/json';
  const body = isForm ? opts.body : (opts.body != null ? JSON.stringify(opts.body) : undefined);
  const res = await fetch(API + path, { ...opts, headers, body, credentials: 'include' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = apiErrorMessage(data);
    if (window.TL_TOAST) window.TL_TOAST.error(msg);
    throw new Error(msg);
  }
  if (data && data.success === true && data.data != null) return data.data;
  return data;
}

function setAuth(u) {
  user = u;
  window.user = u;
  if (u) {
    localStorage.setItem('tl_user', JSON.stringify(u));
  } else {
    localStorage.removeItem('tl_user');
    localStorage.removeItem('tl_token');
  }
  updateAuthUI();
}

function updateAuthUI() {
  const btn = document.getElementById('authBtn');
  const joinBtn = document.getElementById('joinBtn');
  if (btn) {
    if (user) {
      btn.textContent = t('profile');
      btn.onclick = () => showMainTab('profile');
      btn.style.display = '';
    } else {
      btn.textContent = t('login');
      btn.onclick = () => openAuth();
      btn.style.display = '';
    }
  }
  if (joinBtn) joinBtn.style.display = user ? 'none' : '';
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
          <div class="rat"><span class="rl">${t('touristlio')}</span><span class="st">${stars(p.tiolaRating)}</span><span class="rc">(${p.tiolaCount || 0} ${t('tiolaCount')})</span></div>
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
    if (isExploreMapTabActive()) await loadMapMarkers();
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

function setCanonical(href) {
  let link = document.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = href || `${location.origin}/`;
}

let restoringRoute = false;

function getActiveExploreTab() {
  const sec = document.querySelector('.explore-section.active');
  return sec?.id?.replace('es-', '') || 'discover';
}

function getActiveProfileTab() {
  const active = document.querySelector('#pContent .ptab-c.active');
  return active?.id?.replace('ptab-', '') || 'tiolas';
}

function getActiveDetailTab() {
  const panel = document.querySelector('.dtab-panel.active');
  return panel?.id?.replace('dtab-', '') || 'overview';
}

function getCurrentRoute() {
  const page = document.querySelector('.page.active');
  const main = page?.id?.replace('page-', '') || 'explore';
  const route = { main };
  if (main === 'explore') route.explore = getActiveExploreTab();
  if (main === 'profile') route.profileTab = getActiveProfileTab();
  if (main === 'blog' && blogCat !== 'all') route.blogCat = blogCat;
  if (main === 'detail' && activePlace?.id) {
    route.placeId = activePlace.id;
    route.detailTab = getActiveDetailTab();
  }
  return route;
}

function readRouteFromUrl() {
  const onPlacesPath = location.pathname.replace(/\/+$/, '') === '/gezilecek-yerler';
  const params = new URLSearchParams(location.search);
  const hash = location.hash.replace(/^#/, '');
  const segments = hash ? hash.split('/').filter(Boolean) : [];

  const placeParam = params.get('place');
  if (placeParam && /^\d+$/.test(placeParam)) {
    return { main: 'detail', placeId: Number(placeParam), detailTab: segments[2] || 'overview' };
  }
  if (segments[0] === 'place' && segments[1] && /^\d+$/.test(segments[1])) {
    return { main: 'detail', placeId: Number(segments[1]), detailTab: segments[2] || 'overview' };
  }

  const tabParam = params.get('tab');
  if (tabParam === 'places' || onPlacesPath || segments[0] === 'places') {
    return { main: 'places' };
  }

  if (segments[0] === 'explore') {
    return { main: 'explore', explore: segments[1] || 'discover' };
  }
  if (segments[0] === 'profile') {
    return { main: 'profile', profileTab: segments[1] || 'tiolas' };
  }
  if (segments[0] === 'blog') {
    const route = { main: 'blog' };
    if (segments[1] === 'cat' && segments[2]) route.blogCat = segments[2];
    return route;
  }
  if (['blog', 'profile'].includes(segments[0])) {
    return { main: segments[0] };
  }
  if (tabParam && ['explore', 'blog', 'profile'].includes(tabParam)) {
    return { main: tabParam };
  }

  if (!hash) {
    try {
      const saved = JSON.parse(localStorage.getItem('tl_route') || 'null');
      if (saved?.main) return saved;
    } catch { /* ignore */ }
  }

  return { main: 'explore', explore: 'discover' };
}

function writeRouteToUrl(route, replace = true) {
  if (restoringRoute) return;
  localStorage.setItem('tl_route', JSON.stringify(route));

  let path = '/';
  let search = '';
  let hash = '#explore';

  if (route.main === 'detail' && route.placeId) {
    search = `?place=${route.placeId}`;
    hash = route.detailTab && route.detailTab !== 'overview'
      ? `#place/${route.placeId}/${route.detailTab}`
      : `#place/${route.placeId}`;
  } else if (route.main === 'places') {
    path = '/gezilecek-yerler';
    hash = '#places';
  } else if (route.main === 'explore') {
    hash = route.explore && route.explore !== 'discover' ? `#explore/${route.explore}` : '#explore';
  } else if (route.main === 'profile') {
    hash = route.profileTab && route.profileTab !== 'tiolas' ? `#profile/${route.profileTab}` : '#profile';
  } else if (route.main === 'blog') {
    hash = route.blogCat && route.blogCat !== 'all' ? `#blog/cat/${route.blogCat}` : '#blog';
  }

  const url = `${path}${search}${hash}`;
  if (replace) history.replaceState(route, '', url);
  else history.pushState(route, '', url);
}

function syncRoute(replace = true) {
  writeRouteToUrl(getCurrentRoute(), replace);
}

async function showMainTab(tab, skipRoute) {
  if (!skipRoute) window.TL_LOADER?.show();
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  document.getElementById('page-' + tab).classList.add('active');
  document.querySelectorAll('.ntab').forEach((n) => n.classList.remove('on'));
  const navTab = tab === 'detail' ? prevTab : tab;
  document.getElementById('nt-' + navTab)?.classList.add('on');
  if (tab !== 'detail') prevTab = tab;
  if (tab === 'places') setCanonical(`${location.origin}/gezilecek-yerler`);
  else if (tab !== 'detail') setCanonical(`${location.origin}/`);
  const tasks = [];
  if (tab === 'blog') tasks.push(loadBlogPage().then(renderBlog));
  if (tab === 'profile') tasks.push(Promise.resolve(updateProfilePage()));
  if (tab === 'explore') tasks.push(loadTiolaFeed());
  if (tab === 'places') window.TL_DISCOVER?.onTabShown();
  window.scrollTo(0, 0);
  if (!skipRoute) syncRoute(true);
  if (!skipRoute) {
    try {
      await Promise.all(tasks);
    } finally {
      window.TL_LOADER?.hide();
    }
  }
}

async function showExploreTab(name, el, skipRoute) {
  if (!skipRoute) window.TL_LOADER?.show();
  document.querySelectorAll('.explore-section').forEach((s) => s.classList.remove('active'));
  document.getElementById('es-' + name).classList.add('active');
  document.querySelectorAll('.etab').forEach((e) => e.classList.remove('on'));
  el.classList.add('on');
  const tasks = [];
  if (name === 'tiolas') tasks.push(loadTiolaFeed());
  if (name === 'categories') tasks.push(loadCategoryStats());
  if (name === 'map' && window.TL_MAP) {
    tasks.push(new Promise((resolve) => {
      setTimeout(async () => {
        window.TL_MAP.invalidateExplore('exploreMapFull');
        await loadMapMarkers();
        resolve();
      }, 200);
    }));
  }
  if (!skipRoute && getActiveMainTab() === 'explore') syncRoute(true);
  if (!skipRoute) {
    try {
      await Promise.all(tasks);
    } finally {
      window.TL_LOADER?.hide();
    }
  }
}

function getActiveMainTab() {
  const page = document.querySelector('.page.active');
  return page?.id?.replace('page-', '') || 'explore';
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
  const statusBadge = ti.status && ti.status !== 'approved'
    ? `<span class="status-${ti.status}">${statusLabel(ti.status)}</span>` : '';
  const rejectionNote = ti.status === 'rejected' && ti.rejectionReason
    ? `<div class="tiola-reject-reason"><strong>${t('rejectionReason')}:</strong> ${escapeHtml(ti.rejectionReason)}</div>` : '';
  const avUser = { name: ti.userName, avatarColor: ti.avatarColor, avatarUrl: ti.avatarUrl, avatarPreset: ti.avatarPreset };
  const reportBtn = window.TL_REPORTS?.menuButton('tiola', ti.id, ti.text?.slice(0, 40) || ti.userName, ti.userId) || '';
  const canReportProfile = user && ti.userId && user.id !== ti.userId;
  const nameHtml = canReportProfile
    ? `<button type="button" class="report-name-btn" onclick="event.stopPropagation();TL_REPORTS.open('profile',${ti.userId},'${String(ti.userName || '').replace(/'/g, "\\'")}')">${escapeHtml(ti.userName)}</button>`
    : escapeHtml(ti.userName);
  return `
    <div class="tiola-card" ${ti.placeId && ti.status === 'approved' ? `onclick="openDetail(${ti.placeId})"` : ''}>
      ${reportBtn}
      ${ti.photoUrl ? `<img src="${ti.photoUrl}" alt=""/>` : (ti.placeImage ? `<img src="${ti.placeImage}" alt=""/>` : '')}
      <div class="tiola-body">
        <div class="tiola-meta" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span style="width:22px;height:22px;display:inline-block;flex-shrink:0">${window.TL_AVATARS?.renderHtml(avUser, 'tiola-mini') || ''}</span>
          <span>${nameHtml}</span>
          <span>· ${formatDate(ti.createdAt)} ${statusBadge}</span>
        </div>
        <div>${place}</div>
        ${ti.stars ? `<div class="tiola-stars">${stars(ti.stars)}</div>` : ''}
        <div class="tiola-txt">${escapeHtml(ti.text)}</div>
        ${rejectionNote}
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

function syncExploreFilterState() {
  document.querySelectorAll('.explore-filter-strip .fpill').forEach((pill) => {
    const kind = pill.dataset.kind;
    const filter = pill.dataset.filter;
    let on = false;
    if (kind === 'all') on = activeFilterGroup === 'all' && activeCat === 'all';
    else if (kind === 'group') on = activeFilterGroup === filter;
    else if (kind === 'cat') on = activeFilterGroup === 'all' && activeCat === filter;
    pill.classList.toggle('on', on);
  });
}

function setExploreFilter(key, el) {
  if (key === 'all') {
    activeFilterGroup = 'all';
    activeCat = 'all';
  } else if (key.startsWith('group:')) {
    activeFilterGroup = key.slice(6);
    activeCat = 'all';
  } else if (key.startsWith('cat:')) {
    activeFilterGroup = 'all';
    activeCat = key.slice(4);
  }
  syncExploreFilterState();
  applyFilters();
}

function setFilterGroup(group) {
  setExploreFilter(group === 'all' ? 'all' : `group:${group}`);
}

function setCat(cat) {
  setExploreFilter(cat === 'all' ? 'all' : `cat:${cat}`);
}

function setCatAndSwitch(cat) {
  activeCat = cat;
  activeFilterGroup = 'all';
  showExploreTab('discover', document.getElementById('et-discover'));
  syncExploreFilterState();
  applyFilters();
  document.getElementById('es-discover')?.scrollIntoView({ behavior: 'smooth' });
}

async function loadCategoryStats() {
  if (!categoryMeta) await loadCategoryMeta();
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
  syncFilterChipState('all', 'all');
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

function showDetailTab(name, el, skipRoute) {
  document.querySelectorAll('.dtab').forEach((t) => t.classList.remove('on'));
  if (el) el.classList.add('on');
  document.querySelectorAll('.dtab-panel').forEach((p) => p.classList.remove('active'));
  document.getElementById('dtab-' + name)?.classList.add('active');
  if (!skipRoute) syncRoute(true);
}

async function openDetail(id, skipRoute) {
  if (!skipRoute) window.TL_LOADER?.show();
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
    setCanonical(`${location.origin}/?place=${p.id}`);
    if (window.TL_MAP) window.TL_MAP.renderDetailMap(p, lang);
    document.getElementById('pdTS').textContent = stars(p.tiolaRating) || '—';
    document.getElementById('pdTC').textContent = (p.tiolaCount || 0) + ' ' + t('tiolaCount');
    document.getElementById('icCountry').textContent = p.country;
    document.getElementById('icCity').textContent = p.city;
    document.getElementById('icCat').textContent = catLabel(p.category);
    document.getElementById('icEntry').textContent = placeField(p, 'entryFee') || '—';
    document.getElementById('icBest').textContent = placeField(p, 'bestTime') || '—';
    await renderRevList();
    updateRevForm();
    showMainTab('detail', !!skipRoute);
    if (!skipRoute) syncRoute(true);
  } catch (e) {
    if (window.TL_TOAST) window.TL_TOAST.error(e.message);
  } finally {
    if (!skipRoute) window.TL_LOADER?.hide();
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
          <div class="riav">${window.TL_AVATARS?.renderHtml({ name: r.userName, avatarColor: r.avatarColor, avatarUrl: r.avatarUrl, avatarPreset: r.avatarPreset }) || r.userName[0]}</div>
          <div><div class="rinm">${user && r.userId && user.id !== r.userId
            ? `<button type="button" class="report-name-btn" onclick="TL_REPORTS.open('profile',${r.userId},'${String(r.userName || '').replace(/'/g, "\\'")}')">${escapeHtml(r.userName)}</button>`
            : escapeHtml(r.userName)}</div><div class="ridt">${formatDate(r.createdAt)}</div></div>
        </div>
        ${window.TL_REPORTS?.menuButton('tiola', r.id, r.text?.slice(0, 40), r.userId) || ''}
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
  if (!user) {
    av.textContent = '?'; nm.textContent = t('notLoggedIn'); tp.textContent = '';
    if (me) me.style.display = 'none';
    nt.innerHTML = `<a href="#" onclick="openAuth();return false;">${t('loginToTiola')}</a> ${t('loginToTiolaNote')}`;
  } else {
    window.TL_AVATARS?.applyToElement(av, user);
    nm.textContent = user.name;
    tp.textContent = t('writeTiola');
    if (me) me.style.display = 'flex';
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

function blogPageLabels() {
  const page = blogMeta?.page || {};
  return {
    empty: page.empty || t('blogEmpty'),
    searchPh: page.searchPh || t('blogSearchPh'),
    featuredLbl: page.featuredLbl || t('blogFeaturedLbl'),
    viewPlace: page.viewPlace || t('viewPlace'),
  };
}

function debounceBlogSearch() {
  clearTimeout(blogSearchTimer);
  blogSearchTimer = setTimeout(() => {
    blogSearchQ = document.getElementById('blogSearch')?.value?.trim() || '';
    renderBlog();
  }, 280);
}

async function loadBlogPage() {
  try {
    blogMeta = await api('/blogs/meta?lang=' + lang);
    const page = blogMeta.page || {};
    const labels = blogPageLabels();
    const hero = document.getElementById('blogHeroTitle');
    const sub = document.getElementById('blogHeroSub');
    const searchInp = document.getElementById('blogSearch');
    if (hero) hero.innerHTML = `${escapeHtml(page.heroTitle || t('blogTitle'))} <em class="em-accent">${escapeHtml(page.heroTitleEm || t('blogTitleEm'))}</em>`;
    if (sub) sub.textContent = page.subtitle || t('blogSub');
    if (searchInp) searchInp.placeholder = labels.searchPh;
    const chips = document.getElementById('blogCatChips');
    if (chips) {
      const allLabel = page.catAll || t('blogCatAll');
      const cats = blogMeta.categories || [];
      chips.innerHTML = `<div class="bcat-chip ${blogCat === 'all' ? 'on' : ''}" onclick="setBlogCat('all',this)">${escapeHtml(allLabel)}</div>`
        + cats.map((c) => `<div class="bcat-chip ${blogCat === c.slug ? 'on' : ''}" onclick="setBlogCat('${escapeHtml(c.slug)}',this)">${escapeHtml(c.label || c.nameTr)}</div>`).join('');
    }
    const writeCat = document.getElementById('blogCat');
    if (writeCat && blogMeta.categories?.length) {
      writeCat.innerHTML = blogMeta.categories.map((c) =>
        `<option value="${escapeHtml(c.slug)}">${escapeHtml(c.label || c.nameTr)}</option>`
      ).join('');
    }
  } catch (e) {
    console.error('Blog meta', e);
  }
}

async function renderBlog() {
  const grid = document.getElementById('blogGrid');
  if (!grid) return;
  try {
    if (!blogMeta) await loadBlogPage();
    const labels = blogPageLabels();
    const qs = new URLSearchParams({ lang });
    if (blogCat !== 'all') qs.set('category', blogCat);
    if (blogSearchQ) qs.set('q', blogSearchQ);
    const data = await api('/blogs?' + qs);
    const blogs = data.blogs || [];
    if (!blogs.length) {
      grid.innerHTML = `<div class="no-res">${escapeHtml(labels.empty)}</div>`;
      return;
    }
    const feat = blogs.find((b) => b.featured) || blogs[0];
    const rest = blogs.filter((b) => b.id !== feat.id);
    const card = (b, isFeat) => {
      const bav = window.TL_AVATARS?.renderHtml({
        name: b.authorName,
        avatarColor: b.avatarColor || (isFeat ? 'var(--b)' : 'var(--b2)'),
        avatarUrl: b.avatarUrl,
        avatarPreset: b.avatarPreset,
      }) || `<div class="bav" style="background:${isFeat ? 'var(--b)' : 'var(--b2)'}">${(b.authorName || '?')[0]}</div>`;
      const reportBtn = window.TL_REPORTS?.menuButton('blog', b.id, b.title, b.userId) || '';
      return `
      <div class="bcard${isFeat ? ' feat' : ''}" onclick="openBlogDetail('${escapeHtml(b.slug || b.id)}')" role="button" tabindex="0" onkeydown="if(event.key==='Enter')openBlogDetail('${escapeHtml(b.slug || b.id)}')">
        ${reportBtn}
        <img class="bimg" src="${safeUrl(b.imageUrl) || placeImg({ category: b.category || 'guide', id: b.id })}" alt=""/>
        ${b.featured ? `<div class="bfeat-badge">${escapeHtml(labels.featuredLbl)}</div>` : ''}
        <div class="bbody">
          <div class="bcat-lbl">${escapeHtml(b.categoryLabel || b.category || '')}</div>
          <div class="btitle">${escapeHtml(b.title)}</div>
          ${isFeat ? `<div class="bexc">${escapeHtml(b.excerpt || '')}</div>` : ''}
          <div class="bmeta"><div class="bauthor">${bav}<span>${escapeHtml(b.authorName || '')}</span></div></div>
        </div>
      </div>`;
    };
    grid.innerHTML = card(feat, true) + rest.map((b) => card(b, false)).join('');
  } catch (e) {
    grid.innerHTML = `<div class="no-res">${e.message}</div>`;
  }
}

function setBlogCat(cat, el) {
  blogCat = cat;
  document.querySelectorAll('.bcat-chip').forEach((c) => c.classList.remove('on'));
  el.classList.add('on');
  renderBlog();
  syncRoute(true);
}

async function openBlogDetail(slug) {
  if (!slug) return;
  try {
    const data = await api('/blogs/' + encodeURIComponent(slug) + '?lang=' + lang);
    const b = data.blog;
    const img = safeUrl(b.imageUrl) || placeImg({ category: b.category || 'guide', id: b.id });
    const tags = (b.tags || []).map((tag) => `<span class="bd-tag">${escapeHtml(tag)}</span>`).join('');
    document.getElementById('blogDetailBody').innerHTML = `
      ${img ? `<img class="bd-cover" src="${img}" alt=""/>` : ''}
      <div class="bd-cat">${escapeHtml(b.categoryLabel || b.category || '')}</div>
      <h2 class="bd-title">${escapeHtml(b.title)}</h2>
      <div class="bd-meta">${escapeHtml(b.authorName || '')}${b.publishedAt ? ' · ' + new Date(b.publishedAt).toLocaleDateString(lang === 'en' ? 'en-GB' : 'tr-TR') : ''}</div>
      ${b.excerpt ? `<p style="color:var(--t2);font-size:.85rem;margin-bottom:12px">${escapeHtml(b.excerpt)}</p>` : ''}
      <div class="bd-body">${escapeHtml(b.body || '')}</div>
      ${tags ? `<div class="bd-tags">${tags}</div>` : ''}
      ${b.placeId ? `<p style="margin-top:16px"><button class="btn bp bsm" type="button" onclick="closeBlogDetail();openDetail(${b.placeId})">${escapeHtml(blogPageLabels().viewPlace)}</button></p>` : ''}
      <div class="bd-report-row">
        ${window.TL_REPORTS?.menuButton('blog', b.id, b.title, b.userId) ? `<button type="button" class="btn bo bsm" onclick="TL_REPORTS.open('blog',${b.id},'${String(b.title || '').replace(/'/g, "\\'")}')">${t('reportBtn')}</button>` : ''}
        ${window.TL_REPORTS?.menuButton('profile', b.userId, b.authorName, b.userId) ? `<button type="button" class="btn bo bsm" style="margin-left:6px" onclick="TL_REPORTS.open('profile',${b.userId},'${String(b.authorName || '').replace(/'/g, "\\'")}')">${t('reportProfileBtn')}</button>` : ''}
      </div>`;
    document.getElementById('blogDetailOv').classList.add('on');
    document.body.style.overflow = 'hidden';
  } catch (e) {
    window.TL_TOAST?.error?.(e.message) || alert(e.message);
  }
}

function closeBlogDetail() {
  document.getElementById('blogDetailOv')?.classList.remove('on');
  document.body.style.overflow = '';
}

function showPTab(name, el, skipRoute) {
  document.querySelectorAll('#pContent > .ptabs .ptab').forEach((t) => t.classList.remove('on'));
  el.classList.add('on');
  document.querySelectorAll('.ptab-c').forEach((t) => t.classList.remove('active'));
  document.getElementById('ptab-' + name).classList.add('active');
  if (name === 'blogs') loadBlogPage().catch(() => {});
  if (!skipRoute) syncRoute(true);
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
  window.TL_AVATARS?.applyToElement(document.querySelector('.prof-av'), user);
  renderProfileMeta(user);
  initAvatarSettings(user);

  try {
    const me = await api('/auth/me');
    if (me.user) {
      setAuth(me.user);
      renderProfileSettings(me.user);
      renderProfileMeta(me.user);
    }
  } catch {
    renderProfileSettings(user);
  }

  const [myTiolas, myBlogs, saved, visitedStats, myNotifications] = await Promise.all([
    api('/tiolas?mine=1'),
    api('/blogs?mine=1'),
    api('/places/saved/all'),
    api('/travel-lists/visited/stats').catch(() => ({ totalVisited: 0, countriesVisited: 0 })),
    api('/notifications?unread=1').catch(() => ({ notifications: [] })),
  ]);

  savedIds = new Set(saved.places.map((p) => p.id));
  const approvedT = myTiolas.tiolas.filter((t) => t.status === 'approved');
  const pending = [...myTiolas.tiolas.filter((t) => t.status === 'pending'), ...myBlogs.blogs.filter((b) => b.status === 'pending')];

  document.getElementById('pRevCnt').textContent = myTiolas.tiolas.length;
  document.getElementById('pSavedCnt').textContent = savedIds.size;
  document.getElementById('pCntCnt').textContent = visitedStats.countriesVisited || new Set(approvedT.map((t) => t.countryTag || t.placeId)).size;
  const pVis = document.getElementById('pVisitedCnt');
  if (pVis) pVis.textContent = visitedStats.totalVisited || 0;

  renderProfileActivitySummary({
    tiolas: myTiolas.tiolas.length,
    saved: savedIds.size,
    visited: visitedStats.totalVisited || 0,
    pending: pending.length,
    countries: visitedStats.countriesVisited || 0,
  });

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

  renderProfileNotifications(myNotifications.notifications || []);

  const tiList = document.getElementById('myTiolaList');
  const tiEmpty = document.getElementById('tiolaListEmpty');
  if (!myTiolas.tiolas.length) { tiList.innerHTML = ''; tiEmpty.style.display = 'block'; }
  else { tiEmpty.style.display = 'none'; tiList.innerHTML = myTiolas.tiolas.map((t) => renderTiolaCard(t)).join(''); }

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

  loadBlogPage().catch(() => {});
}

function renderProfileMeta(u) {
  const meta = document.getElementById('profMeta');
  if (!meta || !u) return;
  const verified = u.emailVerified ? t('settingsEmailVerified') : t('settingsEmailPending');
  meta.textContent = u.email ? `${u.email} · ${verified}` : '';
}

function renderProfileActivitySummary({ tiolas = 0, saved = 0, visited = 0, pending = 0, countries = 0 }) {
  const bar = document.getElementById('profActivityBar');
  if (!bar) return;
  if (!tiolas && !saved && !visited && !pending) {
    bar.style.display = 'none';
    bar.innerHTML = '';
    return;
  }
  bar.style.display = 'flex';
  const items = [];
  if (tiolas) items.push(`<div class="prof-activity-item"><strong>${tiolas}</strong><span>${t('profileStatReviews')}</span></div>`);
  if (saved) items.push(`<div class="prof-activity-item"><strong>${saved}</strong><span>${t('profileStatSaved')}</span></div>`);
  if (visited) items.push(`<div class="prof-activity-item"><strong>${visited}</strong><span>${t('profileStatVisited')}</span></div>`);
  if (pending) items.push(`<div class="prof-activity-item prof-activity-pending"><strong>${pending}</strong><span>${t('profileActivityPending')}</span></div>`);
  if (countries && !visited) items.push(`<div class="prof-activity-item"><strong>${countries}</strong><span>${t('profileStatCountries')}</span></div>`);
  bar.innerHTML = items.join('');
}

function renderProfileNotifications(items) {
  const host = document.getElementById('profileNotifications');
  if (!host) return;
  if (!items.length) { host.innerHTML = ''; host.style.display = 'none'; return; }
  host.style.display = 'block';
  host.innerHTML = items.map((n) => `
    <div class="profile-notice" role="status">
      <strong>${escapeHtml(n.title)}</strong>
      <p>${escapeHtml(n.body)}</p>
    </div>`).join('');
  api('/notifications/read-all', { method: 'POST' }).catch(() => {});
}

function renderProfileSettings(u) {
  const emailEl = document.getElementById('settingsEmail');
  const badgeEl = document.getElementById('settingsEmailBadge');
  const resendBtn = document.getElementById('btnResendVerify');
  if (!emailEl) return;
  emailEl.textContent = u.email || '—';
  if (badgeEl) {
    const verified = !!u.emailVerified;
    badgeEl.textContent = verified ? t('settingsEmailVerified') : t('settingsEmailPending');
    badgeEl.className = 'settings-badge ' + (verified ? 'ok' : 'pending');
  }
  if (resendBtn) resendBtn.style.display = u.emailVerified ? 'none' : '';
  renderProfileMeta(u);
}

async function submitChangePassword() {
  const currentPassword = document.getElementById('pwdCurrent')?.value;
  const password = document.getElementById('pwdNew')?.value;
  if (!currentPassword || !password) return;
  try {
    await api('/auth/change-password', { method: 'POST', body: { currentPassword, password } });
    document.getElementById('pwdCurrent').value = '';
    document.getElementById('pwdNew').value = '';
    window.TL_TOAST?.success(t('settingsPasswordUpdated'));
  } catch { /* toast from api */ }
}

async function submitChangeEmail() {
  const email = document.getElementById('emailNew')?.value;
  const password = document.getElementById('emailPass')?.value;
  if (!email || !password) return;
  try {
    const data = await api('/auth/change-email', { method: 'POST', body: { email, password } });
    if (data.user) setAuth(data.user);
    renderProfileSettings(data.user || user);
    document.getElementById('emailNew').value = '';
    document.getElementById('emailPass').value = '';
    window.TL_TOAST?.success(t('settingsEmailUpdated'));
  } catch { /* toast from api */ }
}

async function resendVerificationEmail() {
  try {
    await api('/auth/resend-verification', { method: 'POST', body: {} });
    window.TL_TOAST?.success(t('settingsVerifySent'));
  } catch { /* toast from api */ }
}

let avatarPick = { preset: 'traveler', color: '#0ea5e9' };

function initAvatarSettings(u) {
  const grid = document.getElementById('avatarPickGrid');
  const colors = document.getElementById('avatarColorRow');
  const preview = document.getElementById('avatarPreview');
  if (!grid || !window.TL_AVATARS) return;
  avatarPick.preset = u.avatarUrl ? avatarPick.preset : (u.avatarPreset || 'none');
  avatarPick.color = u.avatarColor || avatarPick.color;
  const picker = window.TL_AVATARS.renderPickerGrid(avatarPick.preset, avatarPick.color, ({ preset, color }) => {
    if (preset) avatarPick.preset = preset;
    if (color) avatarPick.color = color;
    initAvatarSettings({ ...u, avatarPreset: avatarPick.preset, avatarColor: avatarPick.color, avatarUrl: null });
  });
  grid.innerHTML = picker.presetHtml;
  colors.innerHTML = picker.colorHtml;
  picker.bind(grid.parentElement);
  const previewUser = { name: u.name, avatarPreset: avatarPick.preset, avatarColor: avatarPick.color, avatarUrl: u.avatarUrl };
  window.TL_AVATARS.applyToElement(preview, previewUser);
  const fileInp = document.getElementById('avatarFile');
  if (fileInp && !fileInp._bound) {
    fileInp._bound = true;
    fileInp.onchange = () => {
      const file = fileInp.files?.[0];
      fileInp.value = '';
      if (!file) return;
      window.TL_AVATAR_CROP?.open(file, (cropped) => uploadAvatarFile(cropped));
    };
  }
}

async function saveAvatarPreset() {
  if (!user) { window.TL_TOAST?.warning(t('login')); return; }
  try {
    const data = await api('/auth/avatar', { method: 'PATCH', body: { avatarPreset: avatarPick.preset, avatarColor: avatarPick.color } });
    if (data.user) {
      setAuth(data.user);
      initAvatarSettings(data.user);
      window.TL_AVATARS?.applyToElement(document.querySelector('.prof-av'), data.user);
      updateRevForm();
      window.TL_TOAST?.success(t('avatarSaved'));
    } else {
      window.TL_TOAST?.error(t('avatarSaveFailed'));
    }
  } catch { /* toast from api */ }
}

async function uploadAvatarFile(file) {
  if (!user) { window.TL_TOAST?.warning(t('login')); return; }
  if (!file) return;
  if (file.size > 3 * 1024 * 1024) {
    window.TL_TOAST?.error(t('avatarFileTooBig'));
    return;
  }
  if (!/^image\/(jpeg|png|webp|gif)$/i.test(file.type)) {
    window.TL_TOAST?.error(t('avatarFileType'));
    return;
  }
  const fd = new FormData();
  fd.append('photo', file);
  try {
    const data = await api('/auth/avatar-upload', { method: 'POST', body: fd });
    if (data.user) {
      setAuth(data.user);
      initAvatarSettings(data.user);
      window.TL_AVATARS?.applyToElement(document.querySelector('.prof-av'), data.user);
      updateRevForm();
      window.TL_TOAST?.success(t('avatarSaved'));
    } else {
      window.TL_TOAST?.error(t('avatarUploadFailed'));
    }
  } catch { /* toast from api */ }
  const inp = document.getElementById('avatarFile');
  if (inp) inp.value = '';
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
      body: {
        title, body, category: document.getElementById('blogCat').value,
      },
    });
    alert(data.message || t('tiolaPending'));
    document.getElementById('blogTitle').value = '';
    document.getElementById('blogBody').value = '';
    updateProfilePage();
  } catch (e) { alert(e.message); }
}

function openAuth(mode) {
  if (mode) authMode = mode;
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
       <button class="btn bp" style="width:100%;padding:11px;margin-top:2px" onclick="doLoginSubmit()">${t('login')}</button>
       <p class="auth-page-link" style="margin-top:10px"><a href="#" onclick="doForgotPassword();return false">${t('forgotPassword')}</a></p>`
    : `<input class="ain" id="regName" type="text" placeholder="${t('authName')}"/>
       <input class="ain" id="regEmail" type="email" placeholder="${t('authEmail')}"/>
       <input class="ain" id="regPass" type="password" placeholder="${t('authPassMin')}"/>
       <div style="display:flex;gap:6px;align-items:flex-start;font-size:.68rem;color:var(--t2);margin-bottom:8px">
         <input type="checkbox" id="gC" style="accent-color:var(--b);margin-top:2px"/>
         <label for="gC"><a href="/legal/kvkk.html" target="_blank" rel="noopener">${t('legalKvkk')}</a> · <a href="/legal/terms.html" target="_blank" rel="noopener">${t('termsShort')}</a> — ${lang === 'en' ? 'I accept' : 'kabul ediyorum'}</label>
       </div>
       <button class="btn bp" style="width:100%;padding:11px" onclick="doRegSubmit()">${t('authCreate')}</button>`;
}

async function doForgotPassword() {
  const email = document.getElementById('loginEmail')?.value?.trim();
  if (!email) {
    window.TL_TOAST?.warning(t('authEmailRequired'));
    return;
  }
  try {
    const data = await api('/auth/forgot-password', {
      method: 'POST',
      body: { email },
    });
    window.TL_TOAST?.success(data.message || t('forgotPasswordSent'));
  } catch { /* toast from api */ }
}

async function doLoginSubmit() {
  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: {
        email: document.getElementById('loginEmail').value,
        password: document.getElementById('loginPass').value,
      },
    });
    setAuth(data.user);
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
      body: {
        name: document.getElementById('regName').value,
        email: document.getElementById('regEmail').value,
        password: document.getElementById('regPass').value,
        kvkkAccepted: true,
      },
    });
    setAuth(data.user);
    closeAuth();
    window.TL_TOAST?.success(t('registerSuccess'));
  } catch { /* toast from api */ }
}

async function doLogout() {
  try {
    await api('/auth/logout', { method: 'POST' });
    setAuth(null);
    window.TL_TOAST?.info(t('logoutSuccess'));
    updateProfilePage();
  } catch { setAuth(null); }
}

function toggleNavMenu() {
  document.getElementById('navMenu')?.classList.toggle('open');
}

function updateCategoryCounts() {
  const counts = {};
  places.forEach((p) => { counts[p.category] = (counts[p.category] || 0) + 1; });
  (categoryMeta?.categories || []).forEach((c) => {
    const el = document.getElementById(`cat-cnt-${c.slug}`);
    if (!el) return;
    const n = counts[c.slug] || c.placeCount || 0;
    el.textContent = n ? `${n} ${t('placesCount')}` : t('placesCountZero');
  });
  Object.keys(counts).forEach((cat) => {
    const el = document.getElementById(`cat-cnt-${cat}`);
    if (el && !categoryMeta?.categories?.some((c) => c.slug === cat)) {
      el.textContent = `${counts[cat]} ${t('placesCount')}`;
    }
  });
  const countries = new Set(places.map((p) => p.country).filter(Boolean));
  const sp = document.getElementById('stat-places');
  const sc = document.getElementById('stat-countries');
  if (sp) sp.textContent = String(places.length);
  if (sc) sc.textContent = String(countries.size);
}

function refreshAfterLang() {
  updateAuthUI();
  renderExploreFilters();
  renderCategoryCards();
  if (places.length) {
    renderGrid(places);
    updateCategoryCounts();
    if (isExploreMapTabActive()) loadMapMarkers();
  }
  if (document.getElementById('page-detail')?.classList.contains('active') && activePlace) {
    openDetail(activePlace.id);
  }
  if (document.getElementById('page-explore')?.classList.contains('active')) {
    loadTiolaFeed();
  }
  if (document.getElementById('page-blog')?.classList.contains('active')) {
    blogMeta = null;
    blogSearchQ = document.getElementById('blogSearch')?.value?.trim() || '';
    loadBlogPage().then(renderBlog);
  }
  if (document.getElementById('page-profile')?.classList.contains('active')) updateProfilePage();
  if (document.getElementById('authOv')?.classList.contains('on')) buildAuthForm(authMode);
  if (window.TL_COOKIE) window.TL_COOKIE.render(lang);
  if (window.TL_DISCOVER) window.TL_DISCOVER.setLang(lang);
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

async function applyRouteFromUrl() {
  const route = readRouteFromUrl();
  restoringRoute = true;
  try {
    if (route.main === 'detail' && route.placeId) {
      await openDetail(route.placeId, true);
      if (route.detailTab && route.detailTab !== 'overview') {
        const el = document.querySelector(`.dtab[onclick*="'${route.detailTab}'"]`);
        if (el) showDetailTab(route.detailTab, el, true);
      }
      return;
    }
    if (route.main === 'blog' && route.blogCat) blogCat = route.blogCat;
    showMainTab(route.main, true);
    if (route.main === 'explore' && route.explore && route.explore !== 'discover') {
      const el = document.getElementById('et-' + route.explore);
      if (el) showExploreTab(route.explore, el, true);
    }
    if (route.main === 'profile' && route.profileTab) {
      const el = document.querySelector(`.ptab[data-ptab="${route.profileTab}"]`);
      if (el) showPTab(route.profileTab, el, true);
    }
  } finally {
    restoringRoute = false;
    syncRoute(true);
  }
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
    await loadCategoryMeta();
    await applyFilters();
    if (isExploreMapTabActive()) await loadMapMarkers();
    try {
      const me = await api('/auth/me');
      if (me.user) {
        setAuth(me.user);
        const saved = await api('/places/saved/all');
        savedIds = new Set(saved.places.map((p) => p.id));
      }
    } catch {
      setAuth(null);
    }
  } catch (e) {
    console.error(e);
  }
  try {
    await applyRouteFromUrl();
  } finally {
    window.TL_LOADER?.hide();
  }
}

window.addEventListener('popstate', () => {
  window.TL_LOADER?.show();
  applyRouteFromUrl().finally(() => window.TL_LOADER?.hide());
});

init();
