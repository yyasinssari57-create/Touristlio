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

function tiolaPhotoUrl(ti) {
  return safeUrl(ti?.photoUrl);
}

function renderTiolaPhotoHtml(ti, extraClass = '') {
  const url = tiolaPhotoUrl(ti);
  if (!url) return '';
  return responsiveImg(url, { className: extraClass, kind: 'card' });
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
  const url = fallbackImgUrl(category, placeId);
  if (window.TL_IMG?.applyTo) window.TL_IMG.applyTo(el, url, { kind: el.dataset.imgKind || 'card' });
  else el.src = url;
}

function responsiveImg(url, opts) {
  const o = opts || {};
  if (window.TL_IMG?.tag) return window.TL_IMG.tag(url, o);
  const src = safeUrl(url);
  if (!src) return '';
  const loading = o.eager ? 'eager' : 'lazy';
  const alt = String(o.alt || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const cls = o.className ? ` class="${o.className}"` : '';
  const extra = o.extra ? ` ${o.extra}` : '';
  const dim = (window.TL_IMG && window.TL_IMG.DIMS && window.TL_IMG.DIMS[o.kind]) || (o.kind === 'card' ? { width: 400, height: 300 } : null);
  const wh = dim ? ` width="${dim.width}" height="${dim.height}"` : '';
  return `<img src="${src}" alt="${alt}" loading="${loading}" decoding="async"${cls}${wh}${extra}/>`;
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
let activeBlogSlug = null;
let savedIds = new Set();
let authMode = 'login';
let lang = window.TL_I18N
  ? window.TL_I18N.bootLocale({ syncPath: true })
  : ((location.pathname === '/en' || location.pathname.startsWith('/en/')) ? 'en' : 'tr');
let lastOsmHint = false;
let searchTimer;
let filterRequestId = 0;
const SEARCH_DEBOUNCE_MS = (window.TL_EXPLORE_QUERY && window.TL_EXPLORE_QUERY.SEARCH_DEBOUNCE_MS) || 300;
const PAGE_SIZE = (window.TL_EXPLORE_QUERY && window.TL_EXPLORE_QUERY.DEFAULT_PAGE_LIMIT) || 20;
let placesTotal = 0;
let placesTotalPages = 1;
let homeStatsPromise = null;
let placesPage = 1;
let exploreUrlPage = 1;
let placesOffset = 0;
let cardsLoaded = false;
let currentFilterParams = {};
let categoryMeta = null;
let viewingProfileUserId = null;

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

function geoLabel(value) {
  return (window.TL_I18N && window.TL_I18N.geoName)
    ? window.TL_I18N.geoName(lang, value)
    : (value || '');
}

function geoText(value) {
  return (window.TL_I18N && window.TL_I18N.geoText)
    ? window.TL_I18N.geoText(lang, value)
    : (value || '');
}

function displayLabel(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map(displayLabel).filter(Boolean).join(', ');
  }
  if (typeof value === 'object') {
    const pick = lang === 'en'
      ? (value.nameEn || value.name_en || value.en || value.name || value.label || value.title || value.nameTr || value.name_tr || value.slug)
      : (value.nameTr || value.name_tr || value.tr || value.name || value.label || value.title || value.nameEn || value.name_en || value.slug);
    return displayLabel(pick);
  }
  return '';
}

function localizeTag(tag) {
  const raw = displayLabel(tag).trim();
  if (!raw) return '';
  const geo = geoLabel(raw);
  if (geo && geo !== raw) return geo;
  const meta = categoryMeta?.categories?.find((c) => c.slug === raw);
  if (meta) return lang === 'en' ? meta.nameEn : meta.nameTr;
  const fromI18n = window.TL_I18N?.catLabel?.(lang, raw);
  if (fromI18n && fromI18n !== raw) return fromI18n.replace(/^[^\s]+\s/, '');
  return raw;
}

function appendGeoOption(selectEl, value) {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = geoLabel(value);
  selectEl.appendChild(o);
}

function catLabel(cat) {
  const meta = categoryMeta?.categories?.find((c) => c.slug === cat);
  if (meta) {
    const name = lang === 'en' ? meta.nameEn : meta.nameTr;
    return `${meta.icon ? `${meta.icon} ` : ''}${name}`;
  }
  return window.TL_I18N.catLabel(lang, cat);
}

function categoryImage(slug, imageUrl) {
  if (imageUrl) return imageUrl;
  const fromMeta = categoryMeta?.categories?.find((c) => c.slug === slug)?.imageUrl;
  if (fromMeta) return fromMeta;
  return CATEGORY_IMAGES[slug] || CATEGORY_IMAGES.landmark;
}

function renderLikeBar(targetType, targetId, count, likedByMe, opts = {}) {
  if (opts.countOnly) {
    return `<div class="tiola-like-bar tiola-like-bar--count-only">
      <span class="tiola-like-count-only">${count || 0}</span>
    </div>`;
  }
  const liked = likedByMe ? ' liked' : '';
  const fn = targetType === 'blog' ? 'toggleBlogLike' : 'toggleTiolaLike';
  return `<div class="tiola-like-bar">
    <button type="button" class="tiola-like-btn${liked}" data-stop data-act="${fn}" data-el data-arg="${targetId}" aria-label="${t('profileStatLikes')}">
      <span class="tiola-like-emoji">${likedByMe ? '❤️' : '🤍'}</span>
      <span class="tiola-like-count">${count || 0}</span>
    </button>
  </div>`;
}

async function toggleTiolaLike(id, btn) {
  if (!user) { openAuth(); return; }
  try {
    const data = await api('/tiolas/' + id + '/like', { method: 'POST' });
    const bar = btn?.closest('.tiola-like-bar');
    if (bar) {
      bar.querySelector('.tiola-like-emoji').textContent = data.liked ? '❤️' : '🤍';
      bar.querySelector('.tiola-like-count').textContent = data.count;
      btn.classList.toggle('liked', data.liked);
    }
  } catch { /* toast */ }
}

async function toggleBlogLike(id, btn) {
  if (!user) { openAuth(); return; }
  try {
    const data = await api('/blogs/' + id + '/like', { method: 'POST' });
    const bar = btn?.closest('.tiola-like-bar');
    if (bar) {
      bar.querySelector('.tiola-like-emoji').textContent = data.liked ? '❤️' : '🤍';
      bar.querySelector('.tiola-like-count').textContent = data.count;
      btn.classList.toggle('liked', data.liked);
    }
  } catch { /* toast */ }
}

function toggleReplyForm(tiolaId) {
  const el = document.getElementById('reply-form-' + tiolaId);
  if (!el) return;
  const open = el.style.display !== 'block';
  el.style.display = open ? 'block' : 'none';
  if (open) el.querySelector('textarea')?.focus();
}

async function submitTiolaReply(parentId, placeId) {
  const ta = document.getElementById('reply-txt-' + parentId);
  const txt = ta?.value?.trim();
  if (!txt) { window.TL_TOAST?.warning(t('writeSomething')); return; }
  if (!user) { openAuth(); return; }
  const fd = new FormData();
  fd.append('text', txt);
  fd.append('parentId', parentId);
  if (placeId) fd.append('placeId', placeId);
  try {
    const body = await (window.TL_FORM_SECURITY ? window.TL_FORM_SECURITY.attach(fd, 'tiola') : fd);
    const data = await api('/tiolas', { method: 'POST', body });
    window.TL_TOAST?.success(data.message || t('tiolaPending'));
    if (ta) ta.value = '';
    toggleReplyForm(parentId);
    if (activePlace) await renderRevList();
    else await loadTiolaFeed();
  } catch { /* toast */ }
}

async function loadTiolaReplies(parentId, containerId) {
  const box = document.getElementById(containerId);
  if (!box || box.dataset.loaded === '1') {
    if (box) box.style.display = box.style.display === 'none' ? 'block' : 'none';
    return;
  }
  try {
    const data = await api('/tiolas?parentId=' + parentId);
    box.dataset.loaded = '1';
    box.style.display = 'block';
    box.innerHTML = data.tiolas.length
      ? data.tiolas.map((r) => {
        const reportBtn = window.TL_REPORTS?.menuButton('tiola', r.id, r.text?.slice(0, 40), r.userId) || '';
        const profileChip = renderProfileChip(r.userId, r.userName, {
          name: r.userName,
          avatarColor: r.avatarColor,
          avatarUrl: r.avatarUrl,
          avatarPreset: r.avatarPreset,
        }, 'tiola-mini');
        return `
        <div class="tiola-reply-item" data-content-type="tiola" data-content-id="${r.id}">
          <div class="tiola-reply-hd">
            ${profileChip}
            <span class="tiola-reply-dt">${formatDate(r.createdAt)}</span>
            ${reportBtn}
          </div>
          <div class="tiola-reply-txt">${escapeHtml(r.text)}</div>
        </div>`;
      }).join('')
      : `<p class="tiola-reply-empty">${t('noReplies')}</p>`;
  } catch (e) {
    box.innerHTML = `<p class="tiola-reply-empty">${escapeHtml(e.message)}</p>`;
    box.style.display = 'block';
  }
}

async function navigateToProfile(userId, ev) {
  ev?.stopPropagation?.();
  if (!userId) return;
  closeBlogDetail?.();
  closePublicProfile?.();
  if (user && user.id === userId) {
    viewingProfileUserId = null;
  } else {
    viewingProfileUserId = userId;
  }
  await showMainTab('profile');
}

function goToMyProfile() {
  viewingProfileUserId = null;
  showMainTab('profile');
}

function renderProfileChip(userId, userName, avUser, sizeClass = 'tiola-mini') {
  const name = escapeHtml(userName || '');
  if (!userId) return `<strong>${name}</strong>`;
  const avHtml = window.TL_AVATARS?.renderHtml(avUser || { name: userName }, sizeClass) || '';
  return `<button type="button" class="profile-chip-btn" data-stop data-act="navigateToProfile" data-event data-arg="${userId}" aria-label="${name} profili">
    ${avHtml ? `<span class="tl-avatar-wrap">${avHtml}</span>` : ''}
    <span class="profile-chip-name">${name}</span>
  </button>`;
}

function renderBadgesHtml(profile, opts = {}) {
  const badges = profile?.badges || profile?.earnedBadges || [];
  const earned = (profile?.earnedBadges || badges.filter((b) => b.earned));
  const next = profile?.nextBadge || null;
  const compact = !!opts.compact;
  if (!badges.length && !earned.length) {
    return `<div class="badge-row"><span class="badge-empty">${t('noBadgesYet')}</span></div>`;
  }
  const chips = (badges.length ? badges : earned).map((b) => {
    const on = b.earned !== false && (b.earned || earned.some((e) => e.id === b.id));
    return `<span class="tiola-badge${on ? ' earned' : ' locked'}" title="${escapeHtml(b.name)} (${b.min}+ Tiola)">${b.icon || ''} ${escapeHtml(b.name)}</span>`;
  }).join('');
  const nextHtml = next && !compact
    ? `<p class="badge-next">${t('badgeNext')}: ${escapeHtml(next.icon || '')} ${escapeHtml(next.name)} · ${next.remaining} ${t('badgeMoreTiolas')}</p>`
    : '';
  return `<div class="badge-block"><div class="badge-title">${t('badgesTitle')}</div><div class="badge-row">${chips}</div>${nextHtml}</div>`;
}

function renderOwnBadges(profile) {
  const el = document.getElementById('profBadges');
  if (!el) return;
  el.innerHTML = renderBadgesHtml(profile || {});
}

function buildPublicProfileCard(p) {
  const avHtml = window.TL_AVATARS?.renderHtml({
    name: p.name,
    avatarColor: p.avatarColor,
    avatarUrl: p.avatarUrl,
    avatarPreset: p.avatarPreset,
  }, 'public-prof-av') || `<div class="public-prof-av">${escapeHtml((p.name || '?')[0])}</div>`;
  const reportBtn = window.TL_REPORTS?.menuButton('profile', p.id, p.name, p.id) || '';
  const tiolaList = (p.recentTiolas || []).length
    ? `<ul class="public-prof-list">${p.recentTiolas.map((ti) =>
      `<li>${ti.stars ? '★'.repeat(ti.stars) + ' ' : ''}${escapeHtml((ti.text || '').slice(0, 80))}${ti.placeName ? ` · <em>${escapeHtml(ti.placeName)}</em>` : ''}</li>`
    ).join('')}</ul>`
    : `<p class="public-prof-empty">${t('noApprovedTiola')}</p>`;
  return `
    <div class="public-prof-page">
      <div class="public-prof-card">
        <div class="public-prof-head">
          ${avHtml}
          <div class="public-prof-info">
            <h3 class="public-prof-name">${escapeHtml(p.name)}</h3>
            <p class="public-prof-meta">${t('memberSince') || 'Üyelik'}: ${formatDate(p.memberSince)}</p>
          </div>
          ${reportBtn}
        </div>
        <div class="public-prof-stats">
          <div><strong>${p.tiolaCount || 0}</strong><span>Tiola</span></div>
          <div><strong>${p.blogCount || 0}</strong><span>Blog</span></div>
          <div><strong>${p.likeCount || 0}</strong><span>${t('profileStatLikes')}</span></div>
        </div>
        ${renderBadgesHtml(p, { compact: true })}
        <h4 class="public-prof-section">${t('profileTabTiolas')}</h4>
        ${tiolaList}
      </div>
    </div>`;
}

async function renderPublicProfilePage(userId) {
  const el = document.getElementById('pPublicView');
  if (!el) return;
  el.innerHTML = `<p class="public-prof-empty">${t('loading') || 'Yükleniyor…'}</p>`;
  try {
    const data = await api('/profiles/' + userId + '?lang=' + encodeURIComponent(lang));
    const p = data.profile;
    if (!p) throw new Error('Profil bulunamadı');
    el.innerHTML = buildPublicProfileCard(p);
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><p>${escapeHtml(e.message)}</p></div>`;
  }
}

function openPublicProfile(userId) {
  navigateToProfile(userId);
}

function closePublicProfile() {
  document.getElementById('publicProfOv')?.classList.remove('on');
  if (!document.querySelector('.auth-ov.on')) {
    document.body.style.overflow = '';
  }
}

function ensurePublicProfileOverlay() {
  if (document.getElementById('publicProfOv')) return;
  const ov = document.createElement('div');
  ov.id = 'publicProfOv';
  ov.className = 'auth-ov';
  ov.innerHTML = `
    <div class="auth-box public-prof-box" role="dialog" aria-labelledby="publicProfTitle">
      <button type="button" class="aclose" data-act="closePublicProfile" aria-label="Kapat">✕</button>
      <h3 id="publicProfTitle" class="report-title">Profil</h3>
      <div id="publicProfBody"></div>
    </div>`;
  ov.addEventListener('click', (e) => { if (e.target === ov) closePublicProfile(); });
  document.body.appendChild(ov);
}

window.openPublicProfile = openPublicProfile;
window.navigateToProfile = navigateToProfile;
window.goToMyProfile = goToMyProfile;
window.closePublicProfile = closePublicProfile;

async function loadCategoryMeta() {
  try {
    const data = await api('/places/meta/categories');
    categoryMeta = data;
    window.TL_CATEGORY_META = data;
    const slugs = new Set((data.categories || []).map((c) => c.slug));
    if (activeCat !== 'all' && !slugs.has(activeCat)) activeCat = 'all';
    if (activeFilterGroup !== 'all' && !(data.groups || []).includes(activeFilterGroup)) activeFilterGroup = 'all';
    renderExploreFilters();
    window.TL_MAP?.bindMapCatChips?.();
    renderCategoryCards();
    updateCategoryCounts();
  } catch (e) {
    console.warn('category meta', e);
  }
}

function buildExploreFiltersHtml() {
  const allOn = activeFilterGroup === 'all' && activeCat === 'all';
  let html = `<button type="button" class="fpill${allOn ? ' on' : ''}" data-kind="all" data-filter="all" data-act="setExploreFilter" data-el data-arg="all">${t('all')}</button>`;
  (categoryMeta.groups || []).forEach((g) => {
    const label = t(GROUP_I18N[g] || g);
    const on = activeFilterGroup === g ? ' on' : '';
    html += `<button type="button" class="fpill fpill-group${on}" data-kind="group" data-filter="${escapeHtml(g)}" data-act="setExploreFilter" data-el data-arg="group:${escapeHtml(g)}">${escapeHtml(label)}</button>`;
  });
  (categoryMeta.categories || []).forEach((c) => {
    const label = lang === 'en' ? c.nameEn : c.nameTr;
    const icon = c.icon ? `${c.icon} ` : '';
    const on = activeFilterGroup === 'all' && activeCat === c.slug ? ' on' : '';
    html += `<button type="button" class="fpill fpill-cat${on}" data-kind="cat" data-filter="${escapeHtml(c.slug)}" data-act="setExploreFilter" data-el data-arg="cat:${escapeHtml(c.slug)}">${icon}${escapeHtml(label)}</button>`;
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
  window.TL_MAP?.bindMapCatChips?.();
}

function categoryCountLabel(n) {
  const count = Number(n);
  const safe = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  return safe ? `${safe} ${t('placesCount')}` : t('placesCountZero');
}

function renderCategoryCards() {
  const grid = document.getElementById('categoryCardsGrid');
  if (!grid || !categoryMeta) return;
  grid.innerHTML = (categoryMeta.categories || []).map((c) => {
    const label = lang === 'en' ? c.nameEn : c.nameTr;
    return `
      <div class="ccard" data-cat="${c.slug}" data-act="setCatAndSwitch" data-arg="${c.slug}">
        ${responsiveImg(categoryImage(c.slug, c.imageUrl), { kind: 'card' })}
        <div class="cinfo">
          <div class="cname">${escapeHtml(label)}</div>
          <div class="ccnt" id="cat-cnt-${c.slug}">${escapeHtml(categoryCountLabel(c.placeCount))}</div>
        </div>
      </div>`;
  }).join('');
}

function isExploreMapTabActive() {
  return document.getElementById('es-map')?.classList.contains('active');
}

async function ensureMapLibs() {
  if (window.TL_MAP_LOADER?.ensure) await window.TL_MAP_LOADER.ensure();
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
  const desc = (placeField(p, 'overview') || placeField(p, 'description') || '').slice(0, 160);
  document.title = title;
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.content = desc;
  const ogT = document.querySelector('meta[property="og:title"]');
  const ogD = document.querySelector('meta[property="og:description"]');
  const ogI = document.querySelector('meta[property="og:image"]');
  if (ogT) ogT.content = title;
  if (ogD) ogD.content = desc;
  if (ogI) {
    const img = p.imageUrl && p.imageUrl.startsWith('http') ? p.imageUrl : (publicOrigin() + placeImg(p));
    ogI.content = img;
    setMetaContent('meta[name="twitter:image"]', img, { name: 'twitter:image' });
  }
  setMetaContent('meta[property="og:type"]', 'place', { property: 'og:type' });
  setMetaContent('meta[name="twitter:title"]', title, { name: 'twitter:title' });
  setMetaContent('meta[name="twitter:description"]', desc, { name: 'twitter:description' });
  setMetaContent('meta[name="twitter:card"]', 'summary_large_image', { name: 'twitter:card' });
  injectPlaceJsonLd(p);
}

function schemaOrigin() {
  return publicOrigin();
}

function travelAgencyJsonLd() {
  const origin = schemaOrigin();
  return {
    '@context': 'https://schema.org',
    '@type': 'TravelAgency',
    name: 'Touristlio',
    url: origin,
    logo: `${origin}/images/logo.webp`,
    description: 'Sadece Ziyaret Etme. Hisset. Topluluk tabanlı seyahat rehberliği.',
  };
}

function webSiteJsonLd() {
  const origin = schemaOrigin();
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Touristlio',
    url: origin,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${origin}/explore?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

function homeJsonLdBase() {
  return [travelAgencyJsonLd(), webSiteJsonLd()];
}

function collectionPageJsonLd() {
  const origin = schemaOrigin();
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: lang === 'en' ? 'Travel Stories — Touristlio' : 'Seyahat Hikayeleri — Touristlio',
    url: origin + (lang === 'en' ? '/en/blog' : '/blog'),
    isPartOf: { '@type': 'WebSite', name: 'Touristlio', url: origin },
  };
}

function pageCspNonce() {
  try {
    const el = document.querySelector('script[nonce]');
    return (el && el.nonce) || '';
  } catch {
    return '';
  }
}

function absSchemaUrl(url) {
  const s = safeUrl(url);
  if (!s) return undefined;
  if (s.startsWith('http')) return s;
  return schemaOrigin() + s;
}

function reviewJsonLd(ti, place) {
  if (!ti) return null;
  const itemName = place?.name || ti.placeName;
  const itemReviewed = itemName
    ? { '@type': 'TouristAttraction', name: itemName }
    : { '@type': 'TravelAgency', name: 'Touristlio', url: schemaOrigin() };
  const block = {
    '@context': 'https://schema.org',
    '@type': 'Review',
    itemReviewed,
    author: { '@type': 'Person', name: ti.userName || 'Gezgin' },
    reviewBody: ti.text || undefined,
    datePublished: ti.createdAt || undefined,
  };
  if (ti.stars) {
    block.reviewRating = {
      '@type': 'Rating',
      ratingValue: String(ti.stars),
      bestRating: '5',
      worstRating: '1',
    };
  }
  return block;
}

function articleJsonLd(b) {
  const origin = schemaOrigin();
  const url = `${origin}/blog/${encodeURIComponent(b.slug || b.id)}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: String(b.title || '').slice(0, 110),
    description: (b.excerpt || '').slice(0, 300) || undefined,
    image: absSchemaUrl(b.imageUrl),
    datePublished: b.publishedAt || b.createdAt,
    dateModified: b.publishedAt || b.createdAt,
    author: { '@type': 'Person', name: b.authorName || 'Touristlio' },
    publisher: {
      '@type': 'Organization',
      name: 'Touristlio',
      logo: { '@type': 'ImageObject', url: `${origin}/images/logo.webp` },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    url,
  };
}

function setJsonLdBlocks(blocks) {
  document.querySelectorAll('script[data-tl-jsonld]').forEach((s) => s.remove());
  const nonce = pageCspNonce();
  (blocks || []).filter(Boolean).forEach((data) => {
    const s = document.createElement('script');
    s.type = 'application/ld+json';
    s.dataset.tlJsonld = '1';
    if (nonce) s.nonce = nonce;
    s.textContent = JSON.stringify(data);
    document.head.appendChild(s);
  });
}

function injectHomeJsonLd(tiolas) {
  const blocks = homeJsonLdBase();
  (tiolas || []).forEach((ti) => {
    if (ti.status && ti.status !== 'approved') return;
    if (ti.parentId) return;
    blocks.push(reviewJsonLd(ti));
  });
  setJsonLdBlocks(blocks);
}

function injectPlaceJsonLd(p, tiolas) {
  const origin = schemaOrigin();
  const img = absSchemaUrl(placeImg(p));
  const attraction = {
    '@context': 'https://schema.org',
    '@type': 'TouristAttraction',
    '@id': origin + placePublicPath(p),
    name: p.name,
    description: placeField(p, 'overview') || placeField(p, 'description') || undefined,
    url: origin + placePublicPath(p),
    image: img,
    address: { '@type': 'PostalAddress', addressLocality: geoLabel(p.city) || p.city, addressRegion: geoLabel(p.district) || p.district, addressCountry: geoLabel(p.country) || p.country },
  };
  if (p.lat != null && p.lng != null) {
    attraction.geo = { '@type': 'GeoCoordinates', latitude: p.lat, longitude: p.lng };
  }
  const count = Number(p.tiolaCount) || 0;
  const rating = Number(p.tiolaRating);
  if (count > 0 && Number.isFinite(rating) && rating > 0) {
    attraction.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: rating.toFixed(1),
      reviewCount: count,
      bestRating: '5',
      worstRating: '1',
    };
  }
  const faqList = lang === 'en' ? (p.faqEN || []) : (p.faqTR || []);
  const blocks = [
    attraction,
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: lang === 'en' ? 'Home' : 'Ana Sayfa', item: origin + (lang === 'en' ? '/en/' : '/') },
        { '@type': 'ListItem', position: 2, name: geoLabel(p.country) || p.country, item: `${origin}${window.TL_EXPLORE_QUERY ? window.TL_EXPLORE_QUERY.explorePathWithQuery({ country: p.country }, lang) : ((lang === 'en' ? '/en' : '') + '/explore')}` },
        { '@type': 'ListItem', position: 3, name: p.name, item: `${origin}${placePublicPath(p)}` },
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
  const placeReviews = [];
  (tiolas || []).forEach((ti) => {
    if (ti.status && ti.status !== 'approved') return;
    if (ti.parentId) return;
    const review = reviewJsonLd(ti, p);
    if (review) {
      placeReviews.push(review);
      blocks.push(review);
    }
  });
  if (placeReviews.length) {
    attraction.review = placeReviews.map((r) => {
      const copy = { ...r };
      delete copy['@context'];
      return copy;
    });
  }
  setJsonLdBlocks(blocks);
}

function renderFaqAccordion(p) {
  const box = document.getElementById('pdFaq');
  if (!box) return;
  const faq = lang === 'en' ? (p.faqEN || []) : (p.faqTR || []);
  if (!faq.length) { box.style.display = 'none'; return; }
  box.style.display = 'block';
  box.innerHTML = `<h2 data-i18n="faqTitle">❓ SSS</h2>` + faq.map((item, i) => `
    <div class="faq-item">
      <button type="button" class="faq-q" aria-expanded="false" aria-controls="faq-a-${i}" id="faq-q-${i}" data-act="toggleFaq" data-arg="${i}">${escapeHtml(item.q)}</button>
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
  el.innerHTML = (list || []).map((x) => {
    const s = formatTiolaScore(x);
    const scoreBit = s.has
      ? ` · <span class="st">${s.stars}</span> ${s.num} (${s.count})`
      : ` · <span class="rn-empty">${escapeHtml(s.emptyLabel)}</span>`;
    return `
    <div class="nearby-item" data-act="openDetail" data-arg="${x.id}" role="button" tabindex="0">
      ${responsiveImg(placeImg(x), { className: 'ni-img', kind: 'thumb', extra: `data-img-fallback data-fallback-cat="${x.category}" data-fallback-id="${x.id}"` })}
      <div><div class="ni-name">${escapeHtml(x.name)}</div><div class="ni-cat">${catLabel(x.category)}${x.distanceKm != null ? ` · ${x.distanceKm} km` : ''}${scoreBit}</div></div>
    </div>`;
  }).join('') || `<p class="empty-hint">${t('nearbyEmpty')}</p>`;
}

function renderSimilarCards(list) {
  const el = document.getElementById('similarList');
  if (!el) return;
  el.innerHTML = (list || []).map((x) => {
    const s = formatTiolaScore(x);
    const scoreBit = s.has
      ? ` · <span class="st">${s.stars}</span> ${s.num} (${s.count})`
      : ` · <span class="rn-empty">${escapeHtml(s.emptyLabel)}</span>`;
    return `
    <div class="nearby-item" data-act="openDetail" data-arg="${x.id}" role="button" tabindex="0">
      ${responsiveImg(placeImg(x), { className: 'ni-img', kind: 'thumb', extra: `data-img-fallback data-fallback-cat="${x.category}" data-fallback-id="${x.id}"` })}
      <div><div class="ni-name">${escapeHtml(x.name)}</div><div class="ni-cat">${catLabel(x.category)}${scoreBit}</div></div>
    </div>`;
  }).join('') || `<p class="empty-hint">${t('similarEmpty')}</p>`;
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
  if (status === 'deleted') return t('statusDeleted');
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

function clearClientSession() {
  user = null;
  window.user = null;
  savedIds = new Set();
  window.TL_AUTH?.clearLocalSession();
  try {
    localStorage.removeItem('tl_user');
    localStorage.removeItem('tl_token');
  } catch { /* ignore */ }
  updateAuthUI();
}

let sessionExpireNotified = false;
function handleSessionExpired(msg) {
  const hadUser = !!(user || (typeof localStorage !== 'undefined' && localStorage.getItem('tl_user')));
  clearClientSession();
  if (hadUser && !sessionExpireNotified) {
    sessionExpireNotified = true;
    window.TL_TOAST?.info(msg || t('sessionExpired'));
    setTimeout(() => { sessionExpireNotified = false; }, 2500);
  }
}

window.api = async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const isForm = opts.body instanceof FormData;
  const method = String(opts.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !headers['X-CSRF-Token'] && !headers['x-csrf-token']) {
    const csrf = window.TL_FORM_SECURITY
      ? (window.TL_FORM_SECURITY.getCsrfToken() || await window.TL_FORM_SECURITY.ensureCsrf())
      : '';
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }
  if (!isForm && opts.body != null) headers['Content-Type'] = 'application/json';
  const body = isForm ? opts.body : (opts.body != null ? JSON.stringify(opts.body) : undefined);
  const fetchOpts = { ...opts, headers, body, credentials: 'include' };
  delete fetchOpts.silent;
  const res = await fetch(API + path, fetchOpts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = apiErrorMessage(data);
    const sessionExpired = window.TL_AUTH?.isSessionExpired(res, data)
      || (res.status === 401 && /oturum süresi doldu/i.test(msg));
    if (sessionExpired) {
      handleSessionExpired(msg);
    } else if (!opts.silent && res.status !== 404 && window.TL_TOAST) {
      window.TL_TOAST.error(msg);
    }
    throw Object.assign(new Error(msg), { status: res.status, sessionExpired });
  }
  if (data && data.success === true && data.data != null) return data.data;
  return data;
}

function setAuth(u) {
  user = u;
  window.user = u;
  if (u) {
    sessionExpireNotified = false;
    localStorage.setItem('tl_user', JSON.stringify(u));
  } else {
    localStorage.removeItem('tl_user');
    localStorage.removeItem('tl_token');
    savedIds = new Set();
  }
  updateAuthUI();
}

function updateAuthUI() {
  const btn = document.getElementById('authBtn');
  const joinBtn = document.getElementById('joinBtn');
  if (btn) {
    if (user) {
      btn.textContent = t('profile');
      btn.onclick = () => goToMyProfile();
      btn.style.display = '';
    } else {
      btn.textContent = t('login');
      btn.onclick = () => openAuth();
      btn.style.display = '';
    }
  }
  if (joinBtn) joinBtn.style.display = user ? 'none' : '';
  updateRevForm();
}

async function loadPlaces(params = {}, append = false, reqId = filterRequestId) {
  const page = append ? placesPage + 1 : (Number(params.page) || placesPage || 1);
  const qs = new URLSearchParams({ ...params, limit: PAGE_SIZE, page });
  qs.delete('offset');
  const data = await api('/places?' + qs.toString());
  if (reqId !== filterRequestId) return data;
  if (append) places = places.concat(data.places);
  else places = data.places;
  placesTotal = data.total ?? data.count ?? places.length;
  placesPage = data.page || page;
  placesOffset = append ? places.length : ((placesPage - 1) * PAGE_SIZE + (data.places || []).length);
  placesTotalPages = data.totalPages || Math.max(1, Math.ceil(placesTotal / PAGE_SIZE) || 1);
  lastOsmHint = !!data.osmHint;
  cardsLoaded = true;
  return data;
}

function stars(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '☆☆☆☆☆';
  const filled = Math.max(0, Math.min(5, Math.round(v)));
  return '★'.repeat(filled) + '☆'.repeat(5 - filled);
}

function placeHasTiolaScore(p) {
  const count = Number(p?.tiolaCount) || 0;
  const rating = Number(p?.tiolaRating);
  return count > 0 && Number.isFinite(rating) && rating > 0;
}

function formatTiolaScore(p) {
  const count = Number(p?.tiolaCount) || 0;
  const rating = Number(p?.tiolaRating);
  const has = placeHasTiolaScore(p);
  return {
    has,
    stars: has ? stars(rating) : '',
    num: has ? Number(rating).toFixed(1) : '',
    count,
    emptyLabel: t('noReviewsYet'),
  };
}

function renderTiolaRatingLine(p) {
  const s = formatTiolaScore(p);
  if (!s.has) {
    return `<div class="rat rat--empty"><span class="rl">${t('touristlio')}</span><span class="rn-empty">${escapeHtml(s.emptyLabel)}</span></div>`;
  }
  return `<div class="rat"><span class="rl">${t('touristlio')}</span><span class="st">${s.stars}</span><span class="rn">${s.num}</span><span class="rc">(${s.count} ${t('tiolaCount')})</span></div>`;
}

function showGridSkeleton() {
  const grid = document.getElementById('pgrid');
  if (!grid) return;
  if (window.TL_SKELETON?.fillCards) window.TL_SKELETON.fillCards(grid, 8);
  else {
    grid.classList.add('skeleton');
    grid.setAttribute('aria-busy', 'true');
    grid.innerHTML = Array(8).fill(0).map(() => `
    <div class="pc sk"><div class="pc-img" style="background:var(--l2)"></div>
    <div class="pc-body"><div style="height:12px;background:var(--l2);border-radius:4px;width:70%;margin-bottom:8px"></div></div></div>`).join('');
  }
}

function renderGrid(list, append = false) {
  const grid = document.getElementById('pgrid');
  if (grid) {
    if (window.TL_SKELETON?.clear) window.TL_SKELETON.clear(grid);
    else grid.classList.remove('skeleton');
  }
  updatePlacesFoundCount(placesTotal || list.length);
  const browseHint = document.getElementById('browseHint');
  if (browseHint) browseHint.style.display = cardsLoaded ? 'none' : 'block';
  document.getElementById('noRes').style.display = cardsLoaded && !list.length ? 'block' : 'none';
  const hintEl = document.getElementById('osmHint');
  if (hintEl) {
    if (cardsLoaded && !list.length && lastOsmHint) {
      hintEl.style.display = 'block';
      hintEl.innerHTML = `<p>${t('mapExploreHint')}</p><button type="button" class="btn bo bsm" data-act="exploreOnMap">${t('mapExploreBtn')}</button>`;
    } else {
      hintEl.style.display = 'none';
      hintEl.innerHTML = '';
    }
  }
  const html = list.map((p) => `
    <div class="pc" tabindex="0" role="link" data-act="openDetail" data-arg="${p.id}">
      <div class="pc-img">
        ${responsiveImg(placeImg(p), { alt: p.name, kind: 'card', extra: `data-img-fallback data-fallback-cat="${p.category}" data-fallback-id="${p.id}"` })}
        <div class="pc-badge">${catLabel(p.category)}</div>
        ${p.isLocal ? `<div class="pc-local">${t('localPick')}</div>` : ''}
        <button type="button" class="pc-save" data-place-name="${escapeHtml(p.name).replace(/"/g, '&quot;')}" aria-label="${favoriteAriaAttr(p.name, savedIds.has(p.id))}" aria-pressed="${savedIds.has(p.id) ? 'true' : 'false'}" data-stop data-act="toggleSave" data-el data-arg="${p.id}">${savedIds.has(p.id) ? '❤️' : '🤍'}</button>
      </div>
      <div class="pc-body">
        <div class="pc-loc">📍 ${escapeHtml(geoText(p.location))}</div>
        <div class="pc-name">${escapeHtml(p.name)}</div>
        <div class="pc-rats">
          ${renderTiolaRatingLine(p)}
        </div>
        <div class="pc-foot"><div class="pc-type">${catLabel(p.category)}</div><div style="font-size:.61rem;color:var(--t3)">${escapeHtml(geoLabel(p.country))}</div></div>
      </div>
    </div>`).join('');
  if (append && grid) grid.insertAdjacentHTML('beforeend', html);
  else if (grid) grid.innerHTML = html;
  renderExplorePagination();
}

function renderExplorePagination() {
  const loadMore = document.getElementById('loadMoreBtn');
  const nav = document.getElementById('explorePagination');
  const nums = document.getElementById('explorePageNums');
  const prev = document.getElementById('explorePagePrev');
  const next = document.getElementById('explorePageNext');
  const info = document.getElementById('explorePageInfo');
  const wrap = document.getElementById('explorePager');
  const totalPages = Math.max(1, placesTotalPages || Math.ceil(placesTotal / PAGE_SIZE) || 1);
  const hasResults = cardsLoaded && placesTotal > 0;
  const showPager = hasResults && totalPages > 1;
  if (wrap) wrap.style.display = hasResults ? '' : 'none';
  if (loadMore) {
    const canLoadMore = places.length < placesTotal;
    loadMore.style.display = canLoadMore ? 'inline-flex' : 'none';
    loadMore.disabled = !!placesLoading;
  }
  if (prev) {
    prev.disabled = placesPage <= 1 || !!placesLoading;
    prev.setAttribute('aria-disabled', prev.disabled ? 'true' : 'false');
    prev.onclick = () => goToPlacesPage(placesPage - 1);
  }
  if (next) {
    next.disabled = placesPage >= totalPages || !!placesLoading;
    next.setAttribute('aria-disabled', next.disabled ? 'true' : 'false');
    next.onclick = () => goToPlacesPage(placesPage + 1);
  }
  if (nav) {
    const aria = t('paginationAria');
    if (aria) nav.setAttribute('aria-label', aria);
  }
  if (info) {
    info.textContent = t('pageOf').replace('{0}', String(placesPage)).replace('{1}', String(totalPages));
  }
  if (nav) nav.hidden = !showPager;
  if (nums) {
    const windowPages = window.TL_EXPLORE_QUERY?.pageWindow
      ? window.TL_EXPLORE_QUERY.pageWindow(placesPage, totalPages, 2)
      : [placesPage];
    nums.innerHTML = windowPages.map((item) => {
      if (item === '…') return '<span class="page-ellipsis" aria-hidden="true">…</span>';
      const on = Number(item) === Number(placesPage) ? ' on' : '';
      const current = on ? ' aria-current="page"' : '';
      return `<button type="button" class="btn bo bsm page-num${on}" data-page="${item}" data-act="goToPlacesPage" data-arg="${item}"${current}>${item}</button>`;
    }).join('');
  }
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
    score: activeStar || '',
    localOnly: activeLocal === 'local' ? '1' : '',
    entry: activeEntry === 'all' ? '' : activeEntry,
    sort: sortMode,
  };
}

function collectExploreFilterState() {
  return {
    q: document.getElementById('heroSearch')?.value.trim() || '',
    country: document.getElementById('cntSel')?.value || '',
    city: document.getElementById('citSel')?.value || '',
    district: document.getElementById('disSel')?.value || '',
    continent: document.getElementById('contSel')?.value || '',
    category: activeFilterGroup !== 'all' ? '' : (activeCat !== 'all' ? activeCat : ''),
    group: activeFilterGroup !== 'all' ? activeFilterGroup : '',
    score: activeStar || 0,
    entry: activeEntry !== 'all' ? activeEntry : '',
    local: activeLocal !== 'all' ? activeLocal : '',
    sort: sortMode,
    page: exploreUrlPage > 1 ? exploreUrlPage : 1,
  };
}

function updatePlacesFoundCount(total) {
  const n = Number(total);
  const el = document.getElementById('resCnt');
  if (el) el.textContent = String(Number.isFinite(n) ? n : 0);
  updateClearFiltersVisibility();
}

function updateClearFiltersVisibility() {
  const btn = document.getElementById('clearFiltersBtn');
  if (!btn || !window.TL_EXPLORE_QUERY) return;
  const active = window.TL_EXPLORE_QUERY.hasExploreFilters(collectExploreFilterState());
  btn.hidden = !active;
  btn.setAttribute('aria-hidden', active ? 'false' : 'true');
}

function findSelectOptionBySlug(selectEl, slug) {
  if (!selectEl || !slug || !window.TL_EXPLORE_QUERY) return null;
  const target = window.TL_EXPLORE_QUERY.slugifyFilter(slug);
  return [...selectEl.options].find((o) => {
    const val = window.TL_EXPLORE_QUERY.slugifyFilter(o.value || o.textContent);
    return val && val === target;
  }) || null;
}

function restoreExploreFiltersFromUrl(search) {
  if (!window.TL_EXPLORE_QUERY) return false;
  const parsed = window.TL_EXPLORE_QUERY.parseExploreSearch(
    search != null ? search : location.search,
  );
  const hero = document.getElementById('heroSearch');
  if (hero) hero.value = parsed.q || '';

  const contSel = document.getElementById('contSel');
  if (contSel) {
    if (parsed.continent) {
      const opt = findSelectOptionBySlug(contSel, parsed.continent);
      if (opt) {
        contSel.value = opt.value;
        updateCountryList(opt.value);
      } else {
        contSel.value = '';
      }
    } else if (contSel.value) {
      contSel.value = '';
      updateCountryList('');
    }
  }

  const cntSel = document.getElementById('cntSel');
  if (cntSel) {
    if (parsed.country) {
      const opt = findSelectOptionBySlug(cntSel, parsed.country);
      if (opt) {
        cntSel.value = opt.value;
        updateCityList(opt.value);
      } else {
        cntSel.value = '';
      }
    } else if (cntSel.value) {
      cntSel.value = '';
      updateCityList('');
    }
  }

  const citSel = document.getElementById('citSel');
  if (citSel) {
    if (parsed.city) {
      const opt = findSelectOptionBySlug(citSel, parsed.city);
      if (opt) {
        citSel.value = opt.value;
        updateDistrictList(opt.value);
      } else {
        citSel.value = '';
      }
    } else if (citSel.value) {
      citSel.value = '';
      updateDistrictList('');
    }
  }

  const disSel = document.getElementById('disSel');
  if (disSel) {
    if (parsed.district) {
      const opt = findSelectOptionBySlug(disSel, parsed.district);
      if (opt) disSel.value = opt.value;
      else disSel.value = '';
    } else {
      disSel.value = '';
    }
  }

  if (parsed.group && parsed.group !== 'all') {
    activeFilterGroup = parsed.group;
    activeCat = 'all';
  } else if (parsed.category && parsed.category !== 'all') {
    activeFilterGroup = 'all';
    activeCat = parsed.category;
  } else {
    activeFilterGroup = 'all';
    activeCat = 'all';
  }

  activeStar = parsed.score || 0;
  activeEntry = parsed.entry || 'all';
  activeLocal = parsed.local || 'all';
  sortMode = parsed.sort || 'popularity';
  placesPage = parsed.page || 1;
  exploreUrlPage = placesPage;

  const sortSel = document.querySelector('#es-discover .sort-sel');
  if (sortSel) sortSel.value = sortMode;

  syncExploreFilterState();
  syncAdvancedFilterChips();
  window.TL_MAP?.setMapFilters?.({
    category: activeCat,
    group: activeFilterGroup,
  });
  updateClearFiltersVisibility();
  return window.TL_EXPLORE_QUERY.hasExploreFilters(parsed);
}

async function loadMapMarkers() {
  await ensureMapLibs();
  if (!window.TL_MAP) return;
  window.TL_MAP.setMapFilters?.({
    category: activeCat,
    group: activeFilterGroup,
  });
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
    if (!e.status) window.TL_ERROR_BOUNDARY?.capture('map', e);
    else console.warn('map markers', e);
  }
}

async function applyFilters() {
  const reqId = ++filterRequestId;
  if (!placesLoading) showGridSkeleton();
  placesLoading = true;
  if (!restoringRoute) {
    placesPage = 1;
    exploreUrlPage = 1;
  }
  placesOffset = 0;
  currentFilterParams = buildFilterParams();
  updateClearFiltersVisibility();
  try {
    await loadPlaces({ ...currentFilterParams, page: placesPage }, false, reqId);
    if (reqId !== filterRequestId) return;
    renderGrid(places);
    if (isExploreMapTabActive()) await loadMapMarkers();
    if (getActiveMainTab() === 'explore' && !restoringRoute) syncRoute(true);
  } finally {
    if (reqId === filterRequestId) placesLoading = false;
  }
}

async function loadMorePlaces() {
  if (placesLoading || places.length >= placesTotal) return;
  placesLoading = true;
  const moreBtn = document.getElementById('loadMoreBtn');
  window.TL_SKELETON?.button(moreBtn, true);
  renderExplorePagination();
  try {
    await loadPlaces(currentFilterParams, true);
    renderGrid(places, true);
  } finally {
    placesLoading = false;
    window.TL_SKELETON?.button(moreBtn, false);
    renderExplorePagination();
  }
}

async function goToPlacesPage(n) {
  const totalPages = Math.max(1, placesTotalPages || 1);
  const page = Math.min(Math.max(1, Number(n) || 1), totalPages);
  if (placesLoading || page === placesPage) return;
  const reqId = ++filterRequestId;
  placesLoading = true;
  placesPage = page;
  exploreUrlPage = page;
  showGridSkeleton();
  currentFilterParams = buildFilterParams();
  try {
    await loadPlaces({ ...currentFilterParams, page }, false, reqId);
    if (reqId !== filterRequestId) return;
    renderGrid(places);
    document.getElementById('pgrid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (getActiveMainTab() === 'explore' && !restoringRoute) syncRoute(true);
  } finally {
    if (reqId === filterRequestId) placesLoading = false;
    renderExplorePagination();
  }
}

function onSearch(val) {
  const drop = document.getElementById('srchDrop');
  clearTimeout(searchTimer);
  const q = String(val || '').trim();
  if (!q) drop?.classList.remove('show');
  searchTimer = setTimeout(async () => {
    applyFilters();
    if (!q) return;
    if (window.TL_SKELETON?.searchDrop) {
      drop.innerHTML = window.TL_SKELETON.searchDrop(5);
      drop.classList.add('show');
      drop.setAttribute('aria-busy', 'true');
    }
    try {
      const data = await api('/places/search?q=' + encodeURIComponent(q) + '&limit=7');
      const res = data.places;
      if (!res.length) {
        drop.innerHTML = `<div class="sd-empty">${t('noResults')}<br><button type="button" class="btn bo bsm" style="margin-top:8px" data-act="exploreOnMap">${t('mapExploreBtn')}</button></div>`;
      } else {
        drop.innerHTML = res.map((p) => {
          const s = formatTiolaScore(p);
          const scoreHtml = s.has
            ? `${s.stars} ${s.num} (${s.count} ${t('tiolaCount')})`
            : escapeHtml(s.emptyLabel);
          return `
          <div class="sd-item" tabindex="0" role="option" data-act-mousedown="pickSearch" data-arg="${p.id}" data-act="pickSearch" data-arg="${p.id}">
            ${responsiveImg(placeImg(p), { alt: p.name, className: 'sd-img', kind: 'thumb', extra: `data-img-fallback data-fallback-cat="${p.category}" data-fallback-id="${p.id}"` })}
            <div><div class="sd-name">${escapeHtml(p.name)}</div><div class="sd-loc">📍 ${escapeHtml(geoText(p.location))}</div>
            <div class="sd-rat">${scoreHtml}</div></div>
          </div>`;
        }).join('');
      }
      drop.classList.add('show');
      drop.removeAttribute('aria-busy');
    } catch (e) {
      drop.innerHTML = `<div class="sd-empty">${escapeHtml(e.message)}</div>`;
      drop.classList.add('show');
      drop.removeAttribute('aria-busy');
    }
  }, SEARCH_DEBOUNCE_MS);
}

async function exploreOnMap() {
  const q = document.getElementById('heroSearch')?.value?.trim() || '';
  document.getElementById('srchDrop')?.classList.remove('show');
  await showMainTab('explore');
  const mapTab = document.getElementById('et-map');
  if (mapTab) await showExploreTab('map', mapTab);
  const mapInp = document.getElementById('mapSearchInput');
  if (mapInp && q) {
    mapInp.value = q;
    window.TL_MAP?.setMapSearch(q);
  }
  document.getElementById('es-map')?.scrollIntoView({ behavior: 'smooth' });
}

function pickSearch(id) {
  document.getElementById('srchDrop').classList.remove('show');
  document.getElementById('heroSearch').value = '';
  openDetail(id);
}

function doSearch() {
  document.getElementById('srchDrop').classList.remove('show');
  const btn = document.querySelector('.srch-bar button[type="submit"]');
  window.TL_SKELETON?.button(btn, true);
  Promise.resolve(applyFilters()).finally(() => window.TL_SKELETON?.button(btn, false));
  showExploreTab('discover', document.getElementById('et-discover'));
  document.getElementById('es-discover').scrollIntoView({ behavior: 'smooth' });
}

function quickSearch(q) {
  document.getElementById('heroSearch').value = q;
  applyFilters();
  showExploreTab('discover', document.getElementById('et-discover'));
  setTimeout(() => document.getElementById('es-discover').scrollIntoView({ behavior: 'smooth' }), 100);
}

function placePublicPath(p) {
  const prefix = lang === 'en' ? '/en' : '';
  if (p?.slug) return `${prefix}/places/${encodeURIComponent(p.slug)}`;
  if (p?.id) return `${prefix}/places/${p.id}`;
  return prefix || '/';
}

function blogPublicPath(b) {
  const prefix = lang === 'en' ? '/en' : '';
  const slug = b?.slug || b?.id;
  if (!slug) return `${prefix}/blog`;
  return `${prefix}/blog/${encodeURIComponent(slug)}`;
}

function blogListPath() {
  return lang === 'en' ? '/en/blog' : '/blog';
}

function retagHeading(el, level) {
  if (!el) return null;
  const want = 'H' + level;
  if (el.tagName === want) return el;
  const next = document.createElement('h' + level);
  for (const attr of el.attributes) next.setAttribute(attr.name, attr.value);
  while (el.firstChild) next.appendChild(el.firstChild);
  el.replaceWith(next);
  return next;
}

function syncPageHeading(tab) {
  const hero = document.querySelector('#page-explore [data-i18n-html="heroTitle"]');
  const discover = document.getElementById('discoverCityTitle');
  const blogHero = document.getElementById('blogHeroTitle');
  const blogSr = document.querySelector('#blogListing [data-i18n="blog"]');
  const profile = document.querySelector('#page-profile [data-i18n="profile"]');
  const pd = document.getElementById('pdTitle');
  const blogTitle = document.querySelector('#blogDetailBody .bd-title');
  const articleOn = tab === 'blog' && !!activeBlogSlug;
  retagHeading(hero, tab === 'explore' ? 1 : 2);
  retagHeading(discover, tab === 'places' ? 1 : 2);
  retagHeading(blogHero, tab === 'blog' && !articleOn ? 1 : 2);
  retagHeading(blogSr, 2);
  retagHeading(profile, tab === 'profile' ? 1 : 2);
  retagHeading(pd, tab === 'detail' ? 1 : 2);
  retagHeading(blogTitle, articleOn ? 1 : 2);
}

function bodyWithoutExcerpt(excerpt, body) {
  const e = String(excerpt || '').trim();
  let b = String(body || '').trim();
  if (!e || !b) return b;
  if (b === e) return '';
  if (b.startsWith(e)) b = b.slice(e.length).replace(/^[\s\r\n]+/, '');
  return b;
}

function showBlogListing() {
  const listing = document.getElementById('blogListing');
  const article = document.getElementById('blogArticle');
  listing?.removeAttribute('hidden');
  listing?.setAttribute('aria-hidden', 'false');
  article?.setAttribute('hidden', '');
  article?.setAttribute('aria-hidden', 'true');
  syncPageHeading('blog');
}

function showBlogArticle() {
  const listing = document.getElementById('blogListing');
  const article = document.getElementById('blogArticle');
  listing?.setAttribute('hidden', '');
  listing?.setAttribute('aria-hidden', 'true');
  article?.removeAttribute('hidden');
  article?.setAttribute('aria-hidden', 'false');
  syncPageHeading('blog');
}

function publicOrigin() {
  const host = location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return location.origin;
  return 'https://www.touristlio.com';
}

function setMetaContent(selector, content, create) {
  let el = document.querySelector(selector);
  if (!el && create) {
    el = document.createElement('meta');
    if (create.property) el.setAttribute('property', create.property);
    if (create.name) el.setAttribute('name', create.name);
    document.head.appendChild(el);
  }
  if (el) el.setAttribute('content', content);
}

function setCanonical(href) {
  let link = document.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  let next = href || `${publicOrigin()}/`;
  if (next.startsWith('/')) next = publicOrigin() + next;
  next = next.replace('://touristlio.com', '://www.touristlio.com');
  link.href = next;
  setMetaContent('meta[property="og:url"]', next, { property: 'og:url' });
}

let restoringRoute = false;
let skipRouteSync = false;

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
  if (main === 'profile') {
    if (viewingProfileUserId) route.profileUserId = viewingProfileUserId;
    else route.profileTab = getActiveProfileTab();
  }
  if (main === 'blog') {
    if (activeBlogSlug) route.blogSlug = activeBlogSlug;
    else if (blogCat !== 'all') route.blogCat = blogCat;
  }
  if (main === 'detail' && activePlace?.id) {
    route.placeId = activePlace.id;
    route.placeSlug = activePlace.slug || null;
    route.detailTab = getActiveDetailTab();
  }
  return route;
}

function readRouteFromUrl() {
  const rawPath = location.pathname.replace(/\/+$/, '') || '/';
  const pathNoEn = rawPath.replace(/^\/en(?=\/|$)/, '') || '/';
  const pathParts = pathNoEn.split('/').filter(Boolean);
  const onPlacesPath = pathNoEn === '/gezilecek-yerler';
  const params = new URLSearchParams(location.search);
  const hash = location.hash.replace(/^#/, '');
  const segments = hash ? hash.split('/').filter(Boolean) : [];

  if (pathParts[0] === 'places' && pathParts[1]) {
    const key = decodeURIComponent(pathParts[1]);
    const detailTab = (hash && hash !== 'places') ? (segments[0] || 'overview') : 'overview';
    if (/^\d+$/.test(key)) {
      return { main: 'detail', placeId: Number(key), detailTab };
    }
    return { main: 'detail', placeSlug: key, detailTab };
  }

  const placeParam = params.get('place');
  if (placeParam && /^\d+$/.test(placeParam)) {
    return { main: 'detail', placeId: Number(placeParam), detailTab: segments[2] || 'overview' };
  }
  if (segments[0] === 'place' && segments[1] && /^\d+$/.test(segments[1])) {
    return { main: 'detail', placeId: Number(segments[1]), detailTab: segments[2] || 'overview' };
  }

  if (pathParts[0] === 'blog') {
    if (pathParts[1] && pathParts[1] !== 'cat') {
      return { main: 'blog', blogSlug: decodeURIComponent(pathParts[1]) };
    }
    const blogRoute = { main: 'blog' };
    if (pathParts[1] === 'cat' && pathParts[2]) blogRoute.blogCat = pathParts[2];
    if (segments[0] === 'blog' && segments[1] === 'cat' && segments[2]) {
      blogRoute.blogCat = segments[2];
    }
    return blogRoute;
  }

  const tabParam = params.get('tab');
  if (tabParam === 'places' || onPlacesPath || segments[0] === 'places') {
    return { main: 'places' };
  }

  const exploreTabs = ['discover', 'map', 'filter', 'tiolas', 'categories'];
  const hasFilterQuery = ['country', 'category', 'score', 'q', 'group', 'city', 'district', 'minTiola']
    .some((k) => params.get(k));
  if (pathParts[0] === 'explore' || (pathNoEn === '/' && hasFilterQuery && !placeParam)) {
    let explore = 'discover';
    if (segments[0] === 'explore') explore = segments[1] || 'discover';
    else if (exploreTabs.includes(segments[0])) explore = segments[0];
    return { main: 'explore', explore };
  }

  if (segments[0] === 'explore') {
    return { main: 'explore', explore: segments[1] || 'discover' };
  }
  if (segments[0] === 'profile') {
    if (segments[1] === 'u' && segments[2] && /^\d+$/.test(segments[2])) {
      return { main: 'profile', profileUserId: Number(segments[2]) };
    }
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

  if (route.main === 'detail' && (route.placeSlug || route.placeId)) {
    path = `/places/${encodeURIComponent(route.placeSlug || route.placeId)}`;
    hash = route.detailTab && route.detailTab !== 'overview' ? `#${route.detailTab}` : '';
  } else if (route.main === 'places') {
    path = '/gezilecek-yerler';
    hash = '#places';
  } else if (route.main === 'explore') {
    const qs = window.TL_EXPLORE_QUERY
      ? window.TL_EXPLORE_QUERY.buildExploreSearch(collectExploreFilterState())
      : new URLSearchParams();
    const qsStr = qs.toString();
    const rawPath = (location.pathname || '/').replace(/\/+$/, '') || '/';
    const pathNoEn = rawPath.replace(/^\/en(?=\/|$)/, '') || '/';
    if (qsStr || pathNoEn === '/explore') {
      path = '/explore';
      search = qsStr ? `?${qsStr}` : '';
      hash = route.explore && route.explore !== 'discover' ? `#explore/${route.explore}` : '';
    } else {
      hash = route.explore && route.explore !== 'discover' ? `#explore/${route.explore}` : '#explore';
    }
  } else if (route.main === 'profile') {
    if (route.profileUserId) {
      hash = `#profile/u/${route.profileUserId}`;
    } else {
      hash = route.profileTab && route.profileTab !== 'tiolas' ? `#profile/${route.profileTab}` : '#profile';
    }
  } else if (route.main === 'blog') {
    if (route.blogSlug) {
      path = `/blog/${encodeURIComponent(route.blogSlug)}`;
      hash = '';
    } else {
      path = '/blog';
      hash = route.blogCat && route.blogCat !== 'all' ? `#blog/cat/${route.blogCat}` : '';
    }
  }

  if (lang === 'en') {
    path = path === '/' ? '/en/' : `/en${path}`;
  }

  const url = `${path}${search}${hash}`;
  if (replace) history.replaceState(route, '', url);
  else history.pushState(route, '', url);
}

function syncRoute(replace = true) {
  writeRouteToUrl(getCurrentRoute(), replace);
}

async function showMainTab(tab, skipRoute) {
  closeNavMenu();
  closeFilterSheet();
  if (!skipRoute) window.TL_LOADER?.show();
  document.querySelectorAll('.page').forEach((p) => {
    const active = p.id === 'page-' + tab;
    p.classList.toggle('active', active);
    p.hidden = !active;
    p.setAttribute('aria-hidden', active ? 'false' : 'true');
  });
  document.querySelectorAll('.ntab').forEach((n) => {
    n.classList.remove('on');
    n.setAttribute('aria-selected', 'false');
  });
  const navTab = tab === 'detail' ? prevTab : tab;
  const navEl = document.getElementById('nt-' + navTab);
  navEl?.classList.add('on');
  navEl?.setAttribute('aria-selected', 'true');
  if (tab !== 'detail') prevTab = tab;
  if (tab !== 'detail') window.TL_ANALYTICS?.trackTab(tab);
  if (tab === 'places') setCanonical(lang === 'en' ? '/en/gezilecek-yerler' : '/gezilecek-yerler');
  else if (tab === 'blog') setCanonical(activeBlogSlug ? blogPublicPath({ slug: activeBlogSlug }) : blogListPath());
  else if (tab !== 'detail') setCanonical(lang === 'en' ? '/en/' : '/');
  if (tab !== 'detail') {
    setMetaContent('meta[property="og:type"]', (tab === 'blog' && activeBlogSlug) ? 'article' : 'website', { property: 'og:type' });
  }
  if (tab === 'explore') injectHomeJsonLd();
  else if (tab === 'blog') setJsonLdBlocks([collectionPageJsonLd()]);
  else if (tab !== 'detail') setJsonLdBlocks(homeJsonLdBase());
  const tasks = [];
  if (tab === 'blog') {
    if (!skipRoute) {
      activeBlogSlug = null;
      showBlogListing();
    } else if (!activeBlogSlug) {
      showBlogListing();
    }
    const back = document.getElementById('blogBackLink');
    if (back) {
      back.href = blogListPath();
      back.textContent = t('blogBack');
    }
    tasks.push(loadBlogPage().then(renderBlog));
  }
  if (tab === 'profile') tasks.push(Promise.resolve(updateProfilePage()));
  if (tab === 'explore') tasks.push(loadTiolaFeed());
  if (tab === 'places') {
    const bootDiscover = (async () => {
      await ensureMapLibs();
      if (window.TL_DISCOVER?.onTabShown) await window.TL_DISCOVER.onTabShown();
    })();
    tasks.push(bootDiscover);
    if (skipRoute) bootDiscover.catch((e) => console.warn(e));
  }
  window.scrollTo(0, 0);
  syncPageHeading(tab);
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
  if (name === 'filter' && typeof isFilterSheetViewport === 'function' && isFilterSheetViewport()) {
    openFilterSheet();
    return;
  }
  if (!skipRoute) window.TL_LOADER?.show();
  document.querySelectorAll('.explore-section').forEach((s) => {
    const active = s.id === 'es-' + name;
    s.classList.toggle('active', active);
    s.hidden = !active;
    s.setAttribute('aria-hidden', active ? 'false' : 'true');
  });
  document.querySelectorAll('.etab').forEach((e) => {
    e.classList.remove('on');
    e.setAttribute('aria-selected', 'false');
  });
  if (el) {
    el.classList.add('on');
    el.setAttribute('aria-selected', 'true');
  }
  const tasks = [];
  if (name === 'tiolas') tasks.push(loadTiolaFeed());
  if (name === 'categories') tasks.push(loadCategoryStats());
  if (name === 'map') {
    tasks.push((async () => {
      await ensureMapLibs();
      if (!window.TL_MAP) return;
      await loadMapMarkers();
      requestAnimationFrame(() => {
        window.TL_MAP.invalidateExplore('exploreMapFull');
        setTimeout(() => window.TL_MAP.invalidateExplore('exploreMapFull'), 200);
      });
    })());
  }
  if (!skipRoute && getActiveMainTab() === 'explore') syncRoute(true);
  if (skipRoute) {
    Promise.all(tasks).catch((e) => console.warn(e));
    return;
  }
  try {
    await Promise.all(tasks);
  } finally {
    window.TL_LOADER?.hide();
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
    if (getActiveMainTab() === 'explore') injectHomeJsonLd(items);
  } catch (e) {
    if (!e.status && window.TL_ERROR_BOUNDARY?.capture('tiolas', e)) return;
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
  const menuBtn = window.TL_REPORTS?.menuButton('tiola', ti.id, ti.text?.slice(0, 40) || ti.userName, ti.userId ?? user?.id) || '';
  const profileChip = renderProfileChip(ti.userId, ti.userName, avUser, 'tiola-mini');
  const photoHtml = renderTiolaPhotoHtml(ti);
  const noPhotoClass = photoHtml ? '' : ' tiola-card--no-photo';
  return `
    <div class="tiola-card${noPhotoClass}" data-content-type="tiola" data-content-id="${ti.id}" ${ti.placeId && ti.status === 'approved' ? `data-act="openDetail" data-arg="${ti.placeId}"` : ''}>
      ${photoHtml}
      <div class="tiola-body">
        <div class="tiola-hd">
          <div class="tiola-meta">
            ${profileChip}
            <span class="tiola-date">· ${formatDate(ti.createdAt)} ${statusBadge}</span>
          </div>
          ${menuBtn ? `<div class="tiola-card-menu" data-stop>${menuBtn}</div>` : ''}
        </div>
        <div>${place}</div>
        ${ti.stars ? `<div class="tiola-stars">${stars(ti.stars)}</div>` : ''}
        <div class="tiola-txt">${escapeHtml(ti.text)}</div>
        ${rejectionNote}
        ${ti.status === 'approved' ? `
          <div class="tiola-actions-row" data-stop>
            ${renderLikeBar('tiola', ti.id, ti.likeCount, ti.likedByMe)}
            ${ti.replyCount ? `<button type="button" class="tiola-reply-toggle" data-act="loadTiolaReplies" data-arg="${ti.id}" data-arg2="tiola-replies-${ti.id}">${ti.replyCount} ${t('replies')}</button>` : ''}
            <button type="button" class="tiola-reply-toggle" data-act="toggleReplyForm" data-arg="${ti.id}">${t('replyBtn')}</button>
          </div>
          <div class="tiola-reply-form" id="reply-form-${ti.id}" style="display:none" data-stop>
            <label class="sr-only" for="reply-txt-${ti.id}">${t('replyPlaceholder')}</label>
            <textarea class="rft tiola-reply-inp" id="reply-txt-${ti.id}" rows="2" placeholder="${t('replyPlaceholder')}"></textarea>
            <button type="button" class="btn bp bsm" data-act="submitTiolaReply" data-arg="${ti.id}" data-arg2="${ti.placeId || 'null'}">${t('sendReply')}</button>
          </div>
          <div class="tiola-replies-wrap" id="tiola-replies-${ti.id}" style="display:none" data-stop></div>
        ` : ''}
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
  window.TL_MAP?.setMapFilters?.({
    category: activeCat,
    group: activeFilterGroup,
  });
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

function toStatCount(value) {
  if (value == null || value === '' || value === '—' || value === '–' || value === '-' || value === '...') return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function formatStatCount(n) {
  const loc = lang === 'en' ? 'en-US' : 'tr-TR';
  return toStatCount(n).toLocaleString(loc);
}

function setHomepageStatsLoading() {
  ['stat-countries', 'stat-places', 'stat-tiolas'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = '...';
    el.classList.add('is-loading');
    el.setAttribute('aria-busy', 'true');
  });
  document.getElementById('homeStatsStrip')?.setAttribute('aria-busy', 'true');
}

function prefersReducedMotion() {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function animateStat(el, target) {
  const to = toStatCount(target);
  el.classList.remove('is-loading');
  el.removeAttribute('aria-busy');
  el.dataset.statValue = String(to);
  const finish = () => { el.textContent = formatStatCount(to); };
  if (prefersReducedMotion() || to === 0) {
    finish();
    return;
  }
  const duration = 900;
  const start = performance.now();
  let done = false;
  function frame(now) {
    if (done) return;
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - ((1 - t) ** 3);
    el.textContent = formatStatCount(Math.round(to * eased));
    if (t < 1) requestAnimationFrame(frame);
    else {
      done = true;
      finish();
    }
  }
  requestAnimationFrame(frame);
  setTimeout(() => {
    if (!done) {
      done = true;
      finish();
    }
  }, duration + 80);
}

function applyHomepageStats(stats) {
  const countries = toStatCount(stats && stats.countries);
  const listed = toStatCount(stats && (stats.places ?? stats.placesCount));
  const tiolas = toStatCount(stats && (stats.tiolas ?? stats.tiolaCount));
  const sc = document.getElementById('stat-countries');
  const sp = document.getElementById('stat-places');
  const st = document.getElementById('stat-tiolas');
  if (sc) animateStat(sc, countries);
  if (sp) animateStat(sp, listed);
  if (st) animateStat(st, tiolas);
  document.getElementById('homeStatsStrip')?.setAttribute('aria-busy', 'false');
}

function loadHomepageStats() {
  if (homeStatsPromise) return homeStatsPromise;
  setHomepageStatsLoading();
  homeStatsPromise = api('/stats')
    .then((data) => {
      applyHomepageStats(data);
      return data;
    })
    .catch(() => {
      applyHomepageStats({ countries: 0, places: 0, tiolas: 0 });
      return { countries: 0, places: 0, tiolas: 0 };
    });
  return homeStatsPromise;
}

async function loadCategoryStats() {
  loadHomepageStats();
  if (!categoryMeta) await loadCategoryMeta();
  updateCategoryCounts();
}

function setStar(el, v) {
  activeStar = v;
  document.querySelectorAll('#filterTabWrap .fchip.gold').forEach((c) => c.classList.remove('on'));
  if (el) el.classList.add('on');
  else syncAdvancedFilterChips();
  applyFilters();
}

function setEntryFilter(el, v) {
  activeEntry = v || 'all';
  document.querySelectorAll('#filterTabWrap .fchip[data-entry]').forEach((c) => {
    c.classList.toggle('on', (c.dataset.entry || 'all') === activeEntry);
  });
  applyFilters();
}

function setLocalFilter(el, v) {
  activeLocal = v || 'all';
  document.querySelectorAll('#filterTabWrap .fchip[data-local]').forEach((c) => {
    c.classList.toggle('on', (c.dataset.local || 'all') === activeLocal);
  });
  applyFilters();
}

function soloChip(el, sel) {
  document.querySelectorAll(sel).forEach((c) => c.classList.remove('on'));
  el.classList.add('on');
}

function syncAdvancedFilterChips() {
  document.querySelectorAll('#filterTabWrap .fchip.gold').forEach((c) => {
    const v = Number(c.getAttribute('data-score'));
    c.classList.toggle('on', (Number.isFinite(v) ? v : 0) === Number(activeStar || 0));
  });
  document.querySelectorAll('#filterTabWrap .fchip[data-entry]').forEach((c) => {
    c.classList.toggle('on', (c.dataset.entry || 'all') === (activeEntry || 'all'));
  });
  document.querySelectorAll('#filterTabWrap .fchip[data-local]').forEach((c) => {
    c.classList.toggle('on', (c.dataset.local || 'all') === (activeLocal || 'all'));
  });
}

function sortChange(v) { sortMode = v; applyFilters(); }

function resetFilters() {
  activeCat = 'all';
  activeFilterGroup = 'all';
  activeStar = 0;
  activeEntry = 'all';
  activeLocal = 'all';
  sortMode = 'popularity';
  const hero = document.getElementById('heroSearch');
  if (hero) hero.value = '';
  document.getElementById('srchDrop')?.classList.remove('show');
  const contSel = document.getElementById('contSel');
  if (contSel) contSel.value = '';
  const cntSel = document.getElementById('cntSel');
  if (cntSel) {
    cntSel.value = '';
    updateCountryList('');
  }
  const citSel = document.getElementById('citSel');
  if (citSel) citSel.innerHTML = `<option value="">${t('allCities')}</option>`;
  const disSel = document.getElementById('disSel');
  if (disSel) disSel.innerHTML = `<option value="">${t('allDistricts')}</option>`;
  const sortSel = document.querySelector('#es-discover .sort-sel');
  if (sortSel) sortSel.value = 'popularity';
  document.querySelectorAll('#filterTabWrap .fchip[data-ephemeral]').forEach((c) => c.classList.remove('on'));
  syncExploreFilterState();
  syncAdvancedFilterChips();
  window.TL_MAP?.setMapFilters?.({ category: 'all', group: 'all' });
  updateClearFiltersVisibility();
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
  if (!cont) Object.keys(CITYDB).forEach((c) => appendGeoOption(cs, c));
  else (MAP[cont] || []).forEach((c) => appendGeoOption(cs, c));
  document.getElementById('citSel').innerHTML = `<option value="">${t('allCities')}</option>`;
  document.getElementById('disSel').innerHTML = `<option value="">${t('allDistricts')}</option>`;
}

function onContinentChange(cont) {
  updateCountryList(cont);
  applyFilters();
}

function onCountryChange(cnt) {
  updateCityList(cnt);
  applyFilters();
}

function onCityChange(city) {
  updateDistrictList(city);
  applyFilters();
}

function onDistrictChange() {
  applyFilters();
}

function updateCityList(cnt) {
  const cs = document.getElementById('citSel');
  cs.innerHTML = `<option value="">${t('allCities')}</option>`;
  document.getElementById('disSel').innerHTML = `<option value="">${t('allDistricts')}</option>`;
  if (CITYDB[cnt]) Object.keys(CITYDB[cnt]).forEach((c) => appendGeoOption(cs, c));
}

function updateDistrictList(city) {
  const ds = document.getElementById('disSel');
  ds.innerHTML = `<option value="">${t('allDistricts')}</option>`;
  const cnt = document.getElementById('cntSel').value;
  const dists = CITYDB[cnt] && CITYDB[cnt][city];
  if (dists) dists.forEach((d) => appendGeoOption(ds, d));
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
  gal.innerHTML = imgs.map((src, i) =>
    responsiveImg(src, { alt: `${p.name || t('placePhotoAria')} ${i + 1}`, kind: 'thumb', className: i === 0 ? 'active' : '', extra: `data-idx="${i}"` })).join('');
  gal.querySelectorAll('img').forEach((thumb) => {
    thumb.onclick = () => {
      const src = imgs[Number(thumb.dataset.idx)] || thumb.getAttribute('src');
      const hero = document.getElementById('pdImg');
      if (window.TL_IMG?.applyTo) window.TL_IMG.applyTo(hero, src, { kind: 'detail', alt: p.name });
      else hero.src = src;
      gal.querySelectorAll('img').forEach((x) => x.classList.remove('active'));
      thumb.classList.add('active');
    };
  });
}

function showDetailTab(name, el, skipRoute) {
  document.querySelectorAll('.dtab').forEach((t) => {
    t.classList.remove('on');
    t.setAttribute('aria-selected', 'false');
  });
  if (el) {
    el.classList.add('on');
    el.setAttribute('aria-selected', 'true');
  }
  document.querySelectorAll('.dtab-panel').forEach((p) => {
    const active = p.id === 'dtab-' + name;
    p.classList.toggle('active', active);
    p.hidden = !active;
    p.setAttribute('aria-hidden', active ? 'false' : 'true');
  });
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
    const data = await api('/places/' + encodeURIComponent(id) + '?lang=' + lang);
    const p = data.place;
    activePlace = p;
    updateSeoForPlace(p);
    const imgEl = document.getElementById('pdImg');
    if (window.TL_IMG?.applyTo) window.TL_IMG.applyTo(imgEl, placeImg(p), { kind: 'detail', alt: p.name });
    else {
      imgEl.src = placeImg(p);
      imgEl.loading = 'lazy';
    }
    imgEl.alt = p.name || t('placePhotoAria');
    renderDetailGallery(p);
    document.getElementById('pdCat').textContent = catLabel(p.category);
    document.getElementById('pdTitle').textContent = p.name;
    document.getElementById('pdLoc').textContent = '📍 ' + geoText(p.location) + ' · ' + geoLabel(p.country)
      + (p.lat != null && p.lng != null ? ` · ${Number(p.lat).toFixed(4)}, ${Number(p.lng).toFixed(4)}` : '');
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
    document.getElementById('pdTags').innerHTML = (p.tags || []).map((tag) => `<span class="pd-tag">${escapeHtml(localizeTag(tag))}</span>`).join('');
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
    setCanonical(`${location.origin}${placePublicPath(p)}`);
    syncDetailSaveBtn();
    await ensureMapLibs();
    if (window.TL_MAP) window.TL_MAP.renderDetailMap(p, lang);
    const score = formatTiolaScore(p);
    const ts = document.getElementById('pdTS');
    const tc = document.getElementById('pdTC');
    const cta = document.getElementById('firstTiolaCta');
    if (ts) {
      ts.classList.toggle('empty', !score.has);
      ts.textContent = score.has ? `${score.stars} ${score.num}` : t('noReviewsYet');
    }
    if (tc) tc.textContent = score.has ? `${score.count} ${t('tiolaCount')}` : '';
    if (cta) cta.hidden = score.has;
    document.getElementById('icCountry').textContent = geoLabel(p.country);
    document.getElementById('icCity').textContent = geoLabel(p.city);
    document.getElementById('icCat').textContent = p.categoryDisplay || catLabel(p.category);
    document.getElementById('icEntry').textContent = placeField(p, 'entryFee') || '—';
    document.getElementById('icBest').textContent = placeField(p, 'bestTime') || '—';
    await renderRevList();
    updateRevForm();
    showMainTab('detail', !!skipRoute);
    if (!skipRoute) syncRoute(true);
    return true;
  } catch (e) {
    if (e.status === 404 || /bulunamadı/i.test(e.message || '')) {
      skipRouteSync = true;
      location.replace('/404');
      return false;
    }
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
  try {
    const data = await api('/tiolas?placeId=' + activePlace.id);
    document.getElementById('revList').innerHTML = data.tiolas.map((r) => {
    const profileChip = renderProfileChip(r.userId, r.userName, {
      name: r.userName,
      avatarColor: r.avatarColor,
      avatarUrl: r.avatarUrl,
      avatarPreset: r.avatarPreset,
    }, 'riav');
    const menuBtn = window.TL_REPORTS?.menuButton('tiola', r.id, r.text?.slice(0, 40), r.userId) || '';
    return `
    <div class="ri" data-content-type="tiola" data-content-id="${r.id}">
      <div class="ri-hd">
        <div class="ri-user">
          ${profileChip}
          <span class="ridt">${formatDate(r.createdAt)}</span>
        </div>
        ${menuBtn ? `<div class="ri-menu" data-stop>${menuBtn}</div>` : ''}
      </div>
      ${r.stars ? `<div class="ristars ri-stars">${stars(r.stars)}</div>` : ''}
      ${renderTiolaPhotoHtml(r, 'ri-photo')}
      <div class="ritxt">${escapeHtml(r.text)}</div>
      <div class="tiola-actions-row" data-stop>
        ${renderLikeBar('tiola', r.id, r.likeCount, r.likedByMe)}
        ${r.replyCount ? `<button type="button" class="tiola-reply-toggle" data-act="loadTiolaReplies" data-arg="${r.id}" data-arg2="rev-replies-${r.id}">${r.replyCount} ${t('replies')}</button>` : ''}
        <button type="button" class="tiola-reply-toggle" data-act="toggleReplyForm" data-arg="${r.id}">${t('replyBtn')}</button>
      </div>
      <div class="tiola-reply-form" id="reply-form-${r.id}" style="display:none" data-stop>
        <label class="sr-only" for="reply-txt-${r.id}">${t('replyPlaceholder')}</label>
        <textarea class="rft tiola-reply-inp" id="reply-txt-${r.id}" rows="2" placeholder="${t('replyPlaceholder')}"></textarea>
        <button type="button" class="btn bp bsm" data-act="submitTiolaReply" data-arg="${r.id}" data-arg2="${activePlace.id}">${t('sendReply')}</button>
      </div>
      <div class="tiola-replies-wrap" id="rev-replies-${r.id}" style="display:none"></div>
    </div>`;
  }).join('') || `<div class="no-res">${t('noApprovedTiola')}</div>`;
    if (activePlace) injectPlaceJsonLd(activePlace, data.tiolas);
  } catch (e) {
    if (!e.status) window.TL_ERROR_BOUNDARY?.capture('tiolas', e);
  }
}

function startFirstTiola() {
  if (!user) {
    openAuth();
    return;
  }
  const form = document.getElementById('tiolaDetailForm');
  const txt = document.getElementById('rfTxt');
  form?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (txt && !txt.disabled) txt.focus();
}

function setTiolaFormActive(active) {
  const form = document.getElementById('tiolaDetailForm') || document.querySelector('.rform');
  const txt = document.getElementById('rfTxt');
  const photo = document.getElementById('rfPhoto');
  const cat = document.getElementById('revCatSel');
  const send = document.getElementById('rfSendBtn') || form?.querySelector('.rf-foot .btn');
  [txt, photo, cat, send].forEach((el) => {
    if (el) el.disabled = !active;
  });
  if (form) {
    form.classList.toggle('rform--active', !!active);
    form.classList.toggle('rform--guest', !active);
  }
}

function updateRevForm() {
  try {
    const av = document.getElementById('rfAv');
    const nm = document.getElementById('rfNm');
    const tp = document.getElementById('rfTp');
    const me = document.getElementById('memberEx');
    const nt = document.getElementById('rfNote');
    if (!av || !nm || !tp || !nt) return;
    if (!user) {
      av.textContent = '?'; nm.textContent = t('notLoggedIn'); tp.textContent = '';
      if (me) me.style.display = 'none';
      nt.innerHTML = `<a href="/login" data-prevent data-act="openAuth">${t('loginToTiola')}</a> ${t('loginToTiolaNote')}`;
      setTiolaFormActive(false);
    } else {
      window.TL_AVATARS?.applyToElement(av, user);
      nm.textContent = user.name;
      tp.textContent = t('writeTiola');
      if (me) me.style.display = 'flex';
      nt.textContent = t('tiolaModeration');
      setTiolaFormActive(true);
    }
  } catch (e) {
    window.TL_ERROR_BOUNDARY?.capture('form', e);
  }
}

function rate(n) {
  if (!user) return;
  rating = n;
  document.querySelectorAll('#rfStars .star-btn, #rfStars span').forEach((s, i) => s.classList.toggle('lit', i < n));
}

async function postTiola() {
  const txt = document.getElementById('rfTxt').value.trim();
  if (!txt) { window.TL_TOAST?.warning(t('writeSomething')); return; }
  if (!user) { openAuth(); return; }
  if (!activePlace) return;
  const sendBtn = document.getElementById('rfSendBtn');
  window.TL_SKELETON?.button(sendBtn, true);
  const fd = new FormData();
  fd.append('text', txt);
  if (rating) fd.append('stars', rating);
  fd.append('placeId', activePlace.id);
  const cat = document.getElementById('revCatSel')?.value;
  if (cat) fd.append('category', cat);
  const photo = document.getElementById('rfPhoto')?.files?.[0];
  if (photo) fd.append('photo', photo);
  try {
    const body = await (window.TL_FORM_SECURITY ? window.TL_FORM_SECURITY.attach(fd, 'tiola') : fd);
    const data = await api('/tiolas', { method: 'POST', body });
    window.TL_TOAST?.success(data.message || t('tiolaPending'));
    document.getElementById('rfTxt').value = '';
    document.getElementById('rfPhoto').value = '';
    rating = 0;
    document.querySelectorAll('#rfStars .star-btn, #rfStars span').forEach((s) => s.classList.remove('lit'));
    updateRevForm();
  } catch (e) {
    if (!e.status) window.TL_ERROR_BOUNDARY?.capture('form', e);
  } finally {
    window.TL_SKELETON?.button(sendBtn, false);
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
      chips.innerHTML = `<button type="button" class="bcat-chip ${blogCat === 'all' ? 'on' : ''}" data-act="setBlogCat" data-el data-arg="all">${escapeHtml(allLabel)}</button>`
        + cats.map((c) => `<button type="button" class="bcat-chip ${blogCat === c.slug ? 'on' : ''}" data-act="setBlogCat" data-el data-arg="${escapeHtml(c.slug)}">${escapeHtml(c.label || c.nameTr)}</button>`).join('');
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
    const avUser = {
      name: b.authorName,
      avatarColor: b.avatarColor || (isFeat ? 'var(--b)' : 'var(--b2)'),
      avatarUrl: b.avatarUrl,
      avatarPreset: b.avatarPreset,
    };
      const menuBtn = window.TL_REPORTS?.menuButton('blog', b.id, b.title, b.userId) || '';
      const authorChip = renderProfileChip(b.userId, b.authorName, avUser, 'bav');
      const href = blogPublicPath(b);
      const slugAttr = escapeHtml(b.slug || String(b.id));
      const dateStr = formatDate(b.publishedAt || b.createdAt);
      const dateIso = b.publishedAt || b.createdAt || '';
      return `
      <a class="bcard${isFeat ? ' feat' : ''}" href="${escapeHtml(href)}" data-content-type="blog" data-content-id="${b.id}" data-prevent data-act="openBlogDetail" data-arg="${slugAttr}">
        ${responsiveImg(safeUrl(b.imageUrl) || placeImg({ category: displayLabel(b.category) || 'guide', id: b.id }), { className: 'bimg', kind: 'card' })}
        ${b.featured ? `<div class="bfeat-badge">${escapeHtml(labels.featuredLbl)}</div>` : ''}
        <div class="bbody">
          <div class="bcat-lbl">${escapeHtml(displayLabel(b.categoryLabel) || displayLabel(b.category) || '')}</div>
          <div class="btitle">${escapeHtml(b.title)}</div>
          <div class="bexc">${escapeHtml(b.excerpt || '')}</div>
          <div class="bmeta"><div class="bauthor">${authorChip}</div>${dateStr ? `<time class="bdate" datetime="${escapeHtml(dateIso)}">${escapeHtml(dateStr)}</time>` : ''}</div>
          <div class="tiola-actions-row bcard-actions-row" data-stop data-prevent>
            ${renderLikeBar('blog', b.id, b.likeCount, b.likedByMe, { countOnly: true })}
            ${menuBtn}
          </div>
        </div>
      </a>`;
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

async function openBlogDetail(slug, skipRoute) {
  if (!slug) return;
  try {
    const data = await api('/blogs/' + encodeURIComponent(slug) + '?lang=' + lang);
    const b = data.blog;
    if (!b) {
      throw Object.assign(new Error(t('blogEmpty') || 'Blog bulunamadı'), { status: 404 });
    }
    const img = safeUrl(b.imageUrl) || placeImg({ category: displayLabel(b.category) || 'guide', id: b.id });
    const tags = (b.tags || []).map((tag) => `<span class="bd-tag">${escapeHtml(displayLabel(tag))}</span>`).join('');
    const menuBtn = window.TL_REPORTS?.menuButton('blog', b.id, b.title, b.userId) || '';
    const authorChip = renderProfileChip(b.userId, b.authorName, {
      name: b.authorName,
      avatarColor: b.avatarColor,
      avatarUrl: b.avatarUrl,
      avatarPreset: b.avatarPreset,
    }, 'tiola-mini');
    const bodyEl = document.getElementById('blogDetailBody');
    if (!bodyEl) return;
    const restBody = bodyWithoutExcerpt(b.excerpt, b.body);
    bodyEl.innerHTML = `
      <div data-content-type="blog" data-content-id="${b.id}">
      ${img ? responsiveImg(img, { className: 'bd-cover', kind: 'detail' }) : ''}
      <div class="bd-cat">${escapeHtml(displayLabel(b.categoryLabel) || displayLabel(b.category) || '')}</div>
      <h1 class="bd-title">${escapeHtml(b.title)}</h1>
      <div class="bd-meta">${authorChip}${b.publishedAt ? ' · ' + formatDate(b.publishedAt) : ''}</div>
      ${b.excerpt ? `<p class="bd-excerpt">${escapeHtml(b.excerpt)}</p>` : ''}
      ${restBody ? `<div class="bd-body">${escapeHtml(restBody)}</div>` : ''}
      ${tags ? `<div class="bd-tags">${tags}</div>` : ''}
      ${b.placeId ? `<p style="margin-top:16px"><button class="btn bp bsm" type="button" data-before="closeBlogDetail" data-act="openDetail" data-arg="${b.placeId}">${escapeHtml(blogPageLabels().viewPlace)}</button></p>` : ''}
      <div class="tiola-actions-row bd-like-row" data-stop>
        ${renderLikeBar('blog', b.id, b.likeCount, b.likedByMe)}
        ${menuBtn}
      </div>
      </div>`;
    activeBlogSlug = b.slug || slug;
    showBlogArticle();
    const back = document.getElementById('blogBackLink');
    if (back) {
      back.href = blogListPath();
      back.textContent = t('blogBack');
    }
    document.title = `${b.title} — Touristlio`;
    setCanonical(blogPublicPath(b));
    const desc = String(b.excerpt || b.body || '').replace(/<[^>]+>/g, '').slice(0, 160);
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.content = desc;
    setMetaContent('meta[property="og:title"]', `${b.title} — Touristlio`, { property: 'og:title' });
    setMetaContent('meta[property="og:description"]', desc, { property: 'og:description' });
    setMetaContent('meta[property="og:type"]', 'article', { property: 'og:type' });
    const cover = safeUrl(b.imageUrl);
    if (cover) {
      const abs = cover.startsWith('http') ? cover : (publicOrigin() + cover);
      setMetaContent('meta[property="og:image"]', abs, { property: 'og:image' });
      setMetaContent('meta[name="twitter:image"]', abs, { name: 'twitter:image' });
    }
    setMetaContent('meta[name="twitter:title"]', `${b.title} — Touristlio`, { name: 'twitter:title' });
    setMetaContent('meta[name="twitter:description"]', desc, { name: 'twitter:description' });
    setMetaContent('meta[name="twitter:card"]', 'summary_large_image', { name: 'twitter:card' });
    setJsonLdBlocks([articleJsonLd(b)]);
    window.scrollTo(0, 0);
    if (!skipRoute) {
      writeRouteToUrl({ main: 'blog', blogSlug: activeBlogSlug }, false);
    }
  } catch (e) {
    activeBlogSlug = null;
    showBlogListing();
    if (e.status === 404) {
      window.TL_TOAST?.error?.(e.message) || alert(e.message);
      if (!skipRoute) writeRouteToUrl({ main: 'blog' }, true);
      return;
    }
    window.TL_TOAST?.error?.(e.message) || alert(e.message);
  }
}

function closeBlogDetail(skipRoute) {
  activeBlogSlug = null;
  showBlogListing();
  document.body.style.overflow = '';
  setJsonLdBlocks([collectionPageJsonLd()]);
  setCanonical(blogListPath());
  setMetaContent('meta[property="og:type"]', 'website', { property: 'og:type' });
  const hero = document.getElementById('blogHeroTitle');
  if (hero) {
    const page = blogMeta?.page || {};
    document.title = lang === 'en'
      ? 'Travel Stories — Touristlio'
      : 'Seyahat Hikayeleri — Touristlio';
    if (page.heroTitle) {
      /* keep listing hero as-is */
    }
  }
  if (!skipRoute) writeRouteToUrl({ main: 'blog', blogCat: blogCat !== 'all' ? blogCat : undefined }, true);
}

function showPTab(name, el, skipRoute) {
  document.querySelectorAll('#pContent > .ptabs .ptab').forEach((t) => {
    t.classList.remove('on');
    t.setAttribute('aria-selected', 'false');
  });
  el.classList.add('on');
  el.setAttribute('aria-selected', 'true');
  document.querySelectorAll('.ptab-c').forEach((t) => t.classList.remove('active'));
  document.getElementById('ptab-' + name).classList.add('active');
  if (name === 'blogs') loadBlogPage().catch(() => {});
  if (!skipRoute) syncRoute(true);
}

async function updateProfilePage() {
  const loginNotice = document.getElementById('pLoginNotice');
  const pContent = document.getElementById('pContent');
  const pPublicView = document.getElementById('pPublicView');

  if (viewingProfileUserId && (!user || user.id !== viewingProfileUserId)) {
    if (loginNotice) loginNotice.style.display = 'none';
    if (pContent) pContent.style.display = 'none';
    if (pPublicView) {
      pPublicView.style.display = 'block';
      await renderPublicProfilePage(viewingProfileUserId);
    }
    return;
  }

  viewingProfileUserId = null;
  if (pPublicView) pPublicView.style.display = 'none';

  if (!user) {
    if (loginNotice) loginNotice.style.display = 'block';
    if (pContent) pContent.style.display = 'none';
    return;
  }
  if (loginNotice) loginNotice.style.display = 'none';
  if (pContent) pContent.style.display = 'block';
  const savedGridEl = document.getElementById('savedGrid');
  const savedEmptyEl = document.getElementById('savedEmpty');
  if (savedEmptyEl) savedEmptyEl.style.display = 'none';
  if (savedGridEl && window.TL_SKELETON?.fillCards) window.TL_SKELETON.fillCards(savedGridEl, 4);
  document.querySelector('.prof-name').textContent = user.name;
  window.TL_AVATARS?.applyToElement(document.querySelector('.prof-av'), user);
  renderProfileMeta(user);
  initAvatarSettings(user);
  updateBlogWriteNotice(user);

  try {
    const me = await api('/auth/me', { silent: true });
    if (me.user) {
      setAuth(me.user);
      renderProfileSettings(me.user);
      renderProfileMeta(me.user);
      updateBlogWriteNotice(me.user);
    } else {
      setAuth(null);
      if (loginNotice) loginNotice.style.display = 'block';
      if (pContent) pContent.style.display = 'none';
      return;
    }
  } catch (e) {
    if (e.sessionExpired || e.status === 401) {
      if (loginNotice) loginNotice.style.display = 'block';
      if (pContent) pContent.style.display = 'none';
      return;
    }
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
  const topLevelTiolas = myTiolas.tiolas.filter((t) => !t.parentId);
  const approvedT = topLevelTiolas.filter((t) => t.status === 'approved');
  const pending = [...myTiolas.tiolas.filter((t) => t.status === 'pending'), ...myBlogs.blogs.filter((b) => b.status === 'pending')];

  document.getElementById('pRevCnt').textContent = topLevelTiolas.length;
  const pLike = document.getElementById('pLikeCnt');
  try {
    const prof = await api('/profiles/' + user.id + '?lang=' + encodeURIComponent(lang));
    if (pLike) pLike.textContent = prof.profile?.likeCount ?? 0;
    renderOwnBadges(prof.profile);
  } catch {
    if (pLike) pLike.textContent = '0';
    renderOwnBadges({ badges: [] });
  }
  document.getElementById('pSavedCnt').textContent = savedIds.size;
  document.getElementById('pCntCnt').textContent = visitedStats.countriesVisited || new Set(approvedT.map((t) => t.countryTag || t.placeId)).size;
  const pVis = document.getElementById('pVisitedCnt');
  if (pVis) pVis.textContent = visitedStats.totalVisited || 0;

  renderProfileActivitySummary({
    tiolas: topLevelTiolas.length,
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
          <div class="pc" tabindex="0" role="link" data-act="openDetail" data-arg="${p.id}">
            <div class="pc-img">${responsiveImg(placeImg(p), { alt: p.name, kind: 'card' })}</div>
            <div class="pc-body"><div class="pc-name">${escapeHtml(p.name)}</div><div style="font-size:.65rem;color:var(--t3)">${p.visitedAt || ''}</div></div>
          </div>`).join('');
      }
    }
  } catch { /* optional */ }

  renderProfileNotifications(myNotifications.notifications || []);

  const tiList = document.getElementById('myTiolaList');
  const tiEmpty = document.getElementById('tiolaListEmpty');
  if (!topLevelTiolas.length) { tiList.innerHTML = ''; tiEmpty.style.display = 'block'; }
  else { tiEmpty.style.display = 'none'; tiList.innerHTML = topLevelTiolas.map((t) => renderTiolaCard(t)).join(''); }

  const pl = document.getElementById('myPendingList');
  const pe = document.getElementById('pendingEmpty');
  if (!pending.length) { pl.innerHTML = ''; pe.style.display = 'block'; }
  else {
    pe.style.display = 'none';
    pl.innerHTML = pending.map((item) => {
      const isBlog = !!item.title;
      const contentType = isBlog ? 'blog' : 'tiola';
      const label = item.title || item.text?.slice(0, 40) || 'Tiola';
      const menuBtn = window.TL_REPORTS?.menuButton(contentType, item.id, label, user?.id) || '';
      const rejectNote = item.status === 'rejected' && item.rejectionReason
        ? `<div class="tiola-reject-reason"><strong>${t('rejectionReason')}:</strong> ${escapeHtml(item.rejectionReason)}</div>` : '';
      return `
      <div class="my-rev-item" data-content-type="${contentType}" data-content-id="${item.id}">
        <div>
          <div style="font-weight:600">${escapeHtml(label)}</div>
          <span class="status-${item.status || 'pending'}">${statusLabel(item.status || 'pending')}</span>
          ${rejectNote}
          <div style="font-size:.72rem;color:var(--t3);margin-top:4px">${isBlog ? t('pendingBlog') : t('pendingTiola')}</div>
        </div>
        ${menuBtn}
      </div>`;
    }).join('');
  }

  const sg = document.getElementById('savedGrid');
  const se = document.getElementById('savedEmpty');
  if (sg && window.TL_SKELETON?.clear) window.TL_SKELETON.clear(sg);
  if (!saved.places.length) { sg.innerHTML = ''; se.style.display = 'block'; }
  else {
    se.style.display = 'none';
    sg.innerHTML = saved.places.map((p) => `
      <div class="pc" tabindex="0" role="link" data-act="openDetail" data-arg="${p.id}">
        <div class="pc-img">${responsiveImg(placeImg(p), { alt: p.name, kind: 'card', extra: `data-img-fallback data-fallback-cat="${p.category}" data-fallback-id="${p.id}"` })}<button type="button" class="pc-save" data-place-name="${escapeHtml(p.name).replace(/"/g, '&quot;')}" aria-label="${favoriteAriaAttr(p.name, true)}" aria-pressed="true" data-stop data-act="toggleSave" data-el data-arg="${p.id}">❤️</button></div>
        <div class="pc-body"><div class="pc-name">${p.name}</div></div>
      </div>`).join('');
  }

  const arcSel = document.getElementById('arcPlace');
  arcSel.innerHTML = `<option value="">${t('placeOptional')}</option>` + places.map((p) => `<option value="${p.id}">${escapeHtml(p.name)} — ${escapeHtml(geoLabel(p.country))}</option>`).join('');

  loadBlogPage().catch(() => {});
}

function renderProfileMeta(u) {
  const meta = document.getElementById('profMeta');
  if (!meta || !u) return;
  const verified = u.emailVerified ? t('settingsEmailVerified') : t('settingsEmailPending');
  meta.textContent = u.email ? `${u.email} · ${verified}` : '';
}

function updateBlogWriteNotice(u) {
  const notice = document.getElementById('blogVerifyNotice');
  if (!notice) return;
  const needsVerify = u && !u.emailVerified;
  notice.textContent = needsVerify ? t('blogRequiresVerification') : '';
  notice.hidden = !needsVerify;
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
  const btn = document.getElementById('btnSavePassword');
  window.TL_SKELETON?.button(btn, true);
  try {
    await api('/auth/change-password', { method: 'POST', body: { currentPassword, password } });
    document.getElementById('pwdCurrent').value = '';
    document.getElementById('pwdNew').value = '';
    window.TL_TOAST?.success(t('settingsPasswordUpdated'));
  } catch { /* toast from api */ }
  finally { window.TL_SKELETON?.button(btn, false); }
}

async function submitChangeEmail() {
  const email = document.getElementById('emailNew')?.value;
  const password = document.getElementById('emailPass')?.value;
  if (!email || !password) return;
  const btn = document.getElementById('btnSaveEmail');
  window.TL_SKELETON?.button(btn, true);
  try {
    const data = await api('/auth/change-email', { method: 'POST', body: { email, password } });
    if (data.user) setAuth(data.user);
    renderProfileSettings(data.user || user);
    document.getElementById('emailNew').value = '';
    document.getElementById('emailPass').value = '';
    window.TL_TOAST?.success(t('settingsEmailUpdated'));
  } catch { /* toast from api */ }
  finally { window.TL_SKELETON?.button(btn, false); }
}

async function resendVerificationEmail() {
  const btn = document.getElementById('btnResendVerify');
  window.TL_SKELETON?.button(btn, true);
  try {
    await api('/auth/resend-verification', { method: 'POST', body: {} });
    window.TL_TOAST?.success(t('settingsVerifySent'));
  } catch { /* toast from api */ }
  finally { window.TL_SKELETON?.button(btn, false); }
}

let avatarPick = { preset: 'traveler', color: '#0ea5e9' };

function initAvatarSettings(u) {
  const grid = document.getElementById('avatarPickGrid');
  const colors = document.getElementById('avatarColorRow');
  const preview = document.getElementById('avatarPreview');
  if (!grid || !window.TL_AVATARS) return;
  avatarPick.preset = u.avatarPreset || 'none';
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
  const btn = document.getElementById('btnSaveAvatar');
  window.TL_SKELETON?.button(btn, true);
  try {
    const data = await api('/auth/avatar', { method: 'PATCH', body: { avatarPreset: avatarPick.preset, avatarColor: avatarPick.color } });
    if (data.user) {
      setAuth(data.user);
      initAvatarSettings(data.user);
      window.TL_AVATARS?.applyToElement(document.querySelector('.prof-av'), data.user);
      updateRevForm();
      window.TL_TOAST?.success(data.message || (data.pending ? t('avatarPending') : t('avatarSaved')));
    } else {
      window.TL_TOAST?.error(t('avatarSaveFailed'));
    }
  } catch { /* api() already showed a toast */ }
  finally { window.TL_SKELETON?.button(btn, false); }
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
      window.TL_TOAST?.success(data.message || (data.pending ? t('avatarPending') : t('avatarSaved')));
    } else {
      window.TL_TOAST?.error(t('avatarUploadFailed'));
    }
  } catch { /* toast from api */ }
  const inp = document.getElementById('avatarFile');
  if (inp) inp.value = '';
}

async function toggleSave(id, btn) {
  if (!user) { openAuth(); return; }
  if (btn?.dataset.tlBusy === '1') return;
  window.TL_SKELETON?.button(btn, true, { replace: true });
  try {
    if (savedIds.has(id)) {
      await api('/places/' + id + '/save', { method: 'DELETE' });
      savedIds.delete(id);
      window.TL_TOAST?.info(t('removedFromSaved'));
    } else {
      await api('/places/' + id + '/save', { method: 'POST' });
      savedIds.add(id);
      window.TL_TOAST?.success(t('addedToSaved'));
    }
  } catch { /* toast from api */ }
  finally {
    window.TL_SKELETON?.button(btn, false);
    if (btn) {
      const on = savedIds.has(id);
      btn.textContent = on ? '❤️' : '🤍';
      btn.setAttribute('aria-label', favoriteAria(placeNameForSave(id, btn), on));
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }
  syncDetailSaveBtn();
}

function favoriteAria(placeName, saved) {
  const base = saved ? t('unsaveAria') : t('saveAria');
  const name = String(placeName || '').trim();
  return name ? `${base}: ${name}` : base;
}

function favoriteAriaAttr(placeName, saved) {
  return escapeHtml(favoriteAria(placeName, saved)).replace(/"/g, '&quot;');
}

function placeNameForSave(id, btn) {
  const fromData = btn && btn.getAttribute && btn.getAttribute('data-place-name');
  if (fromData) return fromData;
  const fromCard = btn && btn.closest && btn.closest('.pc') && btn.closest('.pc').querySelector('.pc-name');
  if (fromCard && fromCard.textContent) return fromCard.textContent.trim();
  if (typeof activePlace !== 'undefined' && activePlace && Number(activePlace.id) === Number(id)) {
    return activePlace.name || '';
  }
  return '';
}

function syncDetailSaveBtn() {
  const btn = document.getElementById('pdSaveBtn');
  if (!btn || !activePlace) return;
  const on = savedIds.has(activePlace.id);
  btn.textContent = on ? '❤️' : '🤍';
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.setAttribute('data-place-name', activePlace.name || '');
  btn.setAttribute('aria-label', favoriteAria(activePlace.name, on));
}

function arcRate(n) {
  arcRating = n;
  document.querySelectorAll('#arcStars .star-btn, #arcStars span').forEach((s, i) => s.classList.toggle('lit', i < n));
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
  const sendBtn = document.getElementById('arcSendBtn');
  window.TL_SKELETON?.button(sendBtn, true);
  try {
    const body = await (window.TL_FORM_SECURITY ? window.TL_FORM_SECURITY.attach(fd, 'tiola') : fd);
    const data = await api('/tiolas', { method: 'POST', body });
    alert(data.message || t('tiolaPending'));
    document.getElementById('arcTxt').value = '';
    document.getElementById('arcPhoto').value = '';
    arcRating = 0;
    updateProfilePage();
  } catch (e) { alert(e.message); }
  finally { window.TL_SKELETON?.button(sendBtn, false); }
}

async function submitBlog() {
  if (!user) { openAuth(); return; }
  if (!user.emailVerified) {
    window.TL_TOAST?.warning(t('blogRequiresVerification'));
    return;
  }
  const title = document.getElementById('blogTitle').value.trim();
  const body = document.getElementById('blogBody').value.trim();
  if (!title || !body) { window.TL_TOAST?.warning(t('titleRequired')); return; }
  const sendBtn = document.getElementById('blogSendBtn');
  window.TL_SKELETON?.button(sendBtn, true);
  try {
    const payload = await (window.TL_FORM_SECURITY
      ? window.TL_FORM_SECURITY.attach({
        title, body, category: document.getElementById('blogCat').value,
      }, 'blog')
      : { title, body, category: document.getElementById('blogCat').value });
    const data = await api('/blogs', {
      method: 'POST',
      body: payload,
    });
    window.TL_TOAST?.success(data.message || t('tiolaPending'));
    document.getElementById('blogTitle').value = '';
    document.getElementById('blogBody').value = '';
    updateProfilePage();
  } catch { /* toast from api */ }
  finally { window.TL_SKELETON?.button(sendBtn, false); }
}

function openAuth(mode) {
  closeNavMenu();
  if (mode) authMode = mode;
  document.getElementById('authOv').classList.add('on');
  buildAuthForm(authMode);
}

function closeAuth() {
  document.getElementById('authOv').classList.remove('on');
}

function swTab(m, el) {
  el.parentElement.querySelectorAll('.atab').forEach((x) => {
    x.classList.remove('on');
    x.setAttribute('aria-selected', 'false');
  });
  el.classList.add('on');
  el.setAttribute('aria-selected', 'true');
  buildAuthForm(m);
}

function buildAuthForm(m) {
  try {
    authMode = m;
    document.getElementById('authForm').innerHTML = m === 'login'
    ? `<label class="sr-only" for="loginEmail">${t('authEmail')}</label>
       <input class="ain" id="loginEmail" type="email" placeholder="${t('authEmail')}" autocomplete="username"/>
       <label class="sr-only" for="loginPass">${t('authPass')}</label>
       <input class="ain" id="loginPass" type="password" placeholder="${t('authPass')}" autocomplete="current-password"/>
       <p id="authFormError" class="auth-inline-error" hidden></p>
       ${window.TL_FORM_SECURITY ? window.TL_FORM_SECURITY.honeypotHtml() : ''}
       <button class="btn bp" id="authSubmitBtn" style="width:100%;padding:11px;margin-top:2px" data-act="doLoginSubmit">${t('login')}</button>
       <p class="auth-page-link" style="margin-top:10px"><button type="button" class="link-btn" data-act="doForgotPassword">${t('forgotPassword')}</button></p>`
    : `<label class="sr-only" for="regName">${t('authName')}</label>
       <input class="ain" id="regName" type="text" placeholder="${t('authName')}" autocomplete="name"/>
       <label class="sr-only" for="regEmail">${t('authEmail')}</label>
       <input class="ain" id="regEmail" type="email" placeholder="${t('authEmail')}" autocomplete="email"/>
       <label class="sr-only" for="regPass">${t('authPassMin')}</label>
       <input class="ain" id="regPass" type="password" placeholder="${t('authPassMin')}" autocomplete="new-password"/>
       ${window.TL_FORM_SECURITY ? window.TL_FORM_SECURITY.honeypotHtml() : ''}
       <div style="display:flex;gap:6px;align-items:flex-start;font-size:.68rem;color:var(--t2);margin-bottom:8px">
         <input type="checkbox" id="gC" style="accent-color:var(--b);margin-top:2px"/>
         <label for="gC"><a href="/legal/kvkk.html" target="_blank" rel="noopener">${t('legalKvkk')}</a> · <a href="/legal/terms.html" target="_blank" rel="noopener">${t('termsShort')}</a> — ${t('authAccept')}</label>
       </div>
       <p id="authFormError" class="auth-inline-error" hidden></p>
       <button class="btn bp" id="authSubmitBtn" style="width:100%;padding:11px" data-act="doRegSubmit">${t('authCreate')}</button>`;
  } catch (e) {
    window.TL_ERROR_BOUNDARY?.capture('form', e);
  }
}

function showAuthFormError(msg) {
  const el = document.getElementById('authFormError');
  if (window.TL_AUTH) window.TL_AUTH.show(el, msg);
  else if (el) { el.hidden = false; el.textContent = msg; }
}

function hideAuthFormError() {
  const el = document.getElementById('authFormError');
  if (window.TL_AUTH) window.TL_AUTH.hide(el);
  else if (el) { el.hidden = true; el.textContent = ''; }
}

async function reloadSavedIds() {
  if (!user) { savedIds = new Set(); return; }
  try {
    const saved = await api('/places/saved/all', { silent: true });
    savedIds = new Set((saved.places || []).map((p) => p.id));
  } catch {
    savedIds = new Set();
  }
  syncDetailSaveBtn();
}

async function doForgotPassword() {
  hideAuthFormError();
  const email = document.getElementById('loginEmail')?.value?.trim();
  if (!email) {
    showAuthFormError(t('authEmailRequired'));
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showAuthFormError(t('contactEmailInvalid') || 'Geçerli e-posta girin');
    return;
  }
  try {
    const body = await (window.TL_FORM_SECURITY
      ? window.TL_FORM_SECURITY.attach({ email }, 'forgot')
      : { email });
    const data = await api('/auth/forgot-password', {
      method: 'POST',
      body,
      silent: true,
    });
    window.TL_TOAST?.success(data.message || t('forgotPasswordSent'));
  } catch (e) {
    showAuthFormError(e.message || t('requestFailed'));
  }
}

async function doLoginSubmit() {
  hideAuthFormError();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPass').value;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showAuthFormError(t('contactEmailInvalid') || 'Geçerli e-posta girin');
    return;
  }
  if (!password) {
    showAuthFormError(t('authPassRequired'));
    return;
  }
  const btn = document.getElementById('authSubmitBtn');
  window.TL_SKELETON?.button(btn, true);
  try {
    const body = await (window.TL_FORM_SECURITY
      ? window.TL_FORM_SECURITY.attach({
        email,
        password,
      }, 'login')
      : { email, password });
    const data = await api('/auth/login', {
      method: 'POST',
      body,
      silent: true,
    });
    setAuth(data.user);
    await reloadSavedIds();
    closeAuth();
    window.TL_TOAST?.success(t('loginSuccess'));
    if (activePlace) updateRevForm();
    if (document.getElementById('page-profile').classList.contains('active')) updateProfilePage();
  } catch (e) {
    showAuthFormError(e.message || t('requestFailed'));
  } finally {
    window.TL_SKELETON?.button(btn, false);
  }
}

async function doRegSubmit() {
  hideAuthFormError();
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPass').value;
  if (name.length < 2) { showAuthFormError(t('authNameRequired')); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showAuthFormError(t('contactEmailInvalid') || 'Geçerli e-posta girin');
    return;
  }
  if (!password) { showAuthFormError(t('authPassRequired')); return; }
  if (!document.getElementById('gC')?.checked) { showAuthFormError(t('kvkkRequired')); return; }
  const btn = document.getElementById('authSubmitBtn');
  window.TL_SKELETON?.button(btn, true);
  try {
    const body = await (window.TL_FORM_SECURITY
      ? window.TL_FORM_SECURITY.attach({
        name,
        email,
        password,
        kvkkAccepted: true,
      }, 'register')
      : {
        name,
        email,
        password,
        kvkkAccepted: true,
      });
    const data = await api('/auth/register', {
      method: 'POST',
      body,
      silent: true,
    });
    setAuth(data.user);
    await reloadSavedIds();
    const verifyMsg = data.emailVerificationSent !== false
      ? t('registerSuccessVerify')
      : t('registerSuccess');
    window.TL_TOAST?.success(verifyMsg);
    closeAuth();
  } catch (e) {
    showAuthFormError(e.message || t('requestFailed'));
  } finally {
    window.TL_SKELETON?.button(btn, false);
  }
}

async function doLogout() {
  try {
    await api('/auth/logout', { method: 'POST' });
    setAuth(null);
    window.TL_TOAST?.info(t('logoutSuccess'));
    updateProfilePage();
  } catch { setAuth(null); }
}

function setNavMenuOpen(open) {
  const menu = document.getElementById('navMenu');
  const toggle = document.getElementById('navToggle');
  if (!menu) return;
  const next = !!open;
  if (next) closeFilterSheet();
  menu.classList.toggle('open', next);
  document.documentElement.classList.toggle('nav-open', next);
  document.body.classList.toggle('nav-open', next);
  document.body.style.overflow = next ? 'hidden' : '';
  if (toggle) toggle.setAttribute('aria-expanded', next ? 'true' : 'false');
}

const FILTER_SHEET_MQ = '(max-width: 900px)';
let filterSheetParked = [];
let filterSheetLastFocus = null;
let filterSheetIsOpen = false;
let filterSheetHideTimer = 0;

function isFilterSheetViewport() {
  return typeof window.matchMedia === 'function'
    && window.matchMedia(FILTER_SHEET_MQ).matches;
}

function syncFilterSheetTriggers() {
  const mobile = isFilterSheetViewport();
  document.querySelectorAll('.filter-sheet-open').forEach((btn) => {
    btn.hidden = !mobile;
    btn.setAttribute('aria-expanded', filterSheetIsOpen ? 'true' : 'false');
    btn.setAttribute('aria-haspopup', 'dialog');
  });
}

function parkFilterNode(el) {
  if (!el || el.dataset.filterParked === '1') return;
  const host = document.getElementById('filterSheetBody');
  if (!host) return;
  filterSheetParked.push({ el, parent: el.parentNode, next: el.nextSibling });
  el.dataset.filterParked = '1';
  host.appendChild(el);
}

function unparkFilterNodes() {
  while (filterSheetParked.length) {
    const item = filterSheetParked.pop();
    delete item.el.dataset.filterParked;
    if (!item.parent) continue;
    if (item.next && item.next.parentNode === item.parent) {
      item.parent.insertBefore(item.el, item.next);
    } else {
      item.parent.appendChild(item.el);
    }
  }
}

function fillFilterSheet() {
  unparkFilterNodes();
  const onPlaces = document.getElementById('page-places')?.classList.contains('active');
  if (onPlaces) {
    parkFilterNode(document.getElementById('discoverCatStrip'));
    return;
  }
  const onMap = document.getElementById('es-map')?.classList.contains('active');
  parkFilterNode(document.getElementById(onMap ? 'mapFilterStrip' : 'discoverFilterStrip'));
  parkFilterNode(document.getElementById('filterTabWrap'));
}

function filterSheetFocusables() {
  const root = document.getElementById('filterSheet');
  if (!root) return [];
  return Array.from(root.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter((el) => !el.hasAttribute('hidden') && el.offsetParent !== null);
}

function unlockFilterSheetScroll() {
  if (document.body.classList.contains('nav-open')) return;
  document.body.style.overflow = '';
}

function setFilterSheetOpen(open) {
  const sheet = document.getElementById('filterSheet');
  const backdrop = document.getElementById('filterSheetBackdrop');
  if (!sheet || !backdrop) return;
  const next = !!open;
  if (next && !isFilterSheetViewport()) return;
  if (filterSheetHideTimer) {
    clearTimeout(filterSheetHideTimer);
    filterSheetHideTimer = 0;
  }
  if (next) {
    closeNavMenu();
    filterSheetLastFocus = document.activeElement;
    fillFilterSheet();
    sheet.hidden = false;
    backdrop.hidden = false;
    sheet.setAttribute('aria-hidden', 'false');
    backdrop.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('filter-sheet-open');
    document.body.classList.add('filter-sheet-open');
    document.body.style.overflow = 'hidden';
    filterSheetIsOpen = true;
    syncFilterSheetTriggers();
    requestAnimationFrame(() => {
      sheet.classList.add('is-open');
      backdrop.classList.add('is-open');
      const focusEl = document.getElementById('filterSheetClose') || filterSheetFocusables()[0];
      focusEl?.focus();
    });
    return;
  }
  sheet.classList.remove('is-open');
  backdrop.classList.remove('is-open');
  document.documentElement.classList.remove('filter-sheet-open');
  document.body.classList.remove('filter-sheet-open');
  unlockFilterSheetScroll();
  filterSheetIsOpen = false;
  syncFilterSheetTriggers();
  const finish = () => {
    sheet.hidden = true;
    backdrop.hidden = true;
    sheet.setAttribute('aria-hidden', 'true');
    backdrop.setAttribute('aria-hidden', 'true');
    unparkFilterNodes();
    const back = filterSheetLastFocus && document.contains(filterSheetLastFocus)
      ? filterSheetLastFocus
      : document.querySelector('.filter-sheet-open:not([hidden])');
    filterSheetLastFocus = null;
    if (back && typeof back.focus === 'function') back.focus();
  };
  if (prefersReducedMotion()) finish();
  else filterSheetHideTimer = setTimeout(finish, 300);
}

function openFilterSheet() {
  setFilterSheetOpen(true);
}

function closeFilterSheet() {
  if (!filterSheetIsOpen && !document.getElementById('filterSheet')?.classList.contains('is-open')) {
    return;
  }
  setFilterSheetOpen(false);
}

function applyFilterSheet() {
  applyFilters();
  closeFilterSheet();
  if (document.getElementById('es-filter')?.classList.contains('active')) {
    showExploreTab('discover', document.getElementById('et-discover'));
  }
}

function applyExploreFiltersAndShow() {
  applyFilters();
  closeFilterSheet();
  showExploreTab('discover', document.getElementById('et-discover'));
}

function onFilterSheetKeydown(e) {
  if (!filterSheetIsOpen) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    closeFilterSheet();
    return;
  }
  if (e.key !== 'Tab') return;
  const list = filterSheetFocusables();
  if (!list.length) return;
  const first = list[0];
  const last = list[list.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

function initFilterSheet() {
  syncFilterSheetTriggers();
  document.getElementById('filterSheetBackdrop')?.addEventListener('click', closeFilterSheet);
  document.getElementById('filterSheetClose')?.addEventListener('click', closeFilterSheet);
  document.getElementById('filterSheetApply')?.addEventListener('click', applyFilterSheet);
  document.querySelectorAll('.filter-sheet-open').forEach((btn) => {
    btn.addEventListener('click', openFilterSheet);
  });
  document.addEventListener('keydown', onFilterSheetKeydown);
}

function closeNavMenu() {
  setNavMenuOpen(false);
}

function toggleNavMenu() {
  const menu = document.getElementById('navMenu');
  setNavMenuOpen(!menu?.classList.contains('open'));
}

window.addEventListener('resize', () => {
  if (window.matchMedia('(min-width: 901px)').matches) {
    closeNavMenu();
    closeFilterSheet();
  }
  syncFilterSheetTriggers();
});

function updateCategoryCounts() {
  (categoryMeta?.categories || []).forEach((c) => {
    const el = document.getElementById(`cat-cnt-${c.slug}`);
    if (!el) return;
    el.textContent = categoryCountLabel(c.placeCount);
  });
  loadHomepageStats();
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
    openDetail(activePlace.slug || activePlace.id);
  }
  if (document.getElementById('page-explore')?.classList.contains('active')) {
    loadTiolaFeed();
  }
  if (document.getElementById('page-blog')?.classList.contains('active')) {
    blogMeta = null;
    blogSearchQ = document.getElementById('blogSearch')?.value?.trim() || '';
    const slug = activeBlogSlug;
    loadBlogPage().then(renderBlog).then(() => {
      if (slug) return openBlogDetail(slug, true);
    });
  }
  if (document.getElementById('page-profile')?.classList.contains('active')) updateProfilePage();
  if (document.getElementById('authOv')?.classList.contains('on')) buildAuthForm(authMode);
  if (window.TL_COOKIE) window.TL_COOKIE.render(lang);
  if (window.TL_DISCOVER) window.TL_DISCOVER.setLang(lang);
}

function setLang(l, btn) {
  lang = window.TL_I18N ? window.TL_I18N.persistLang(l) : (l === 'en' ? 'en' : 'tr');
  document.querySelectorAll('.lb').forEach((b) => {
    b.classList.remove('on');
    b.setAttribute('aria-pressed', 'false');
  });
  if (btn) {
    btn.classList.add('on');
    btn.setAttribute('aria-pressed', 'true');
  }
  window.TL_I18N.apply(lang);
  refreshAfterLang();
  syncRoute(true);
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.srch-wrap')) document.getElementById('srchDrop')?.classList.remove('show');
});

async function applyRouteFromUrl(opts = {}) {
  const route = readRouteFromUrl();
  restoringRoute = true;
  try {
    if (route.main === 'explore') restoreExploreFiltersFromUrl();
    if (route.main === 'detail' && (route.placeSlug || route.placeId)) {
      const opened = await openDetail(route.placeSlug || route.placeId, true);
      if (opened === false) return;
      if (route.detailTab && route.detailTab !== 'overview') {
        const el = document.querySelector(`.dtab[onclick*="'${route.detailTab}'"]`);
        if (el) showDetailTab(route.detailTab, el, true);
      }
      return;
    }
    if (route.blogSlug) {
      skipRouteSync = true;
      activeBlogSlug = route.blogSlug;
      showMainTab('blog', true);
      await openBlogDetail(route.blogSlug, true);
      return;
    }
    if (route.main === 'blog') {
      activeBlogSlug = null;
      showBlogListing();
    }
    if (route.main === 'blog' && route.blogCat) blogCat = route.blogCat;
    if (route.main === 'profile') {
      if (route.profileUserId) {
        viewingProfileUserId = (user && user.id === route.profileUserId) ? null : route.profileUserId;
      } else {
        viewingProfileUserId = null;
      }
    }
    showMainTab(route.main, true);
    if (route.main === 'explore' && route.explore && route.explore !== 'discover') {
      const el = document.getElementById('et-' + route.explore);
      if (el) showExploreTab(route.explore, el, true);
    }
    if (route.main === 'explore' && !opts.skipFilters) {
      await applyFilters();
    }
    if (route.main === 'profile') {
      await updateProfilePage();
      if (!viewingProfileUserId && route.profileTab) {
        const el = document.querySelector(`.ptab[data-ptab="${route.profileTab}"]`);
        if (el) showPTab(route.profileTab, el, true);
      }
    }
  } finally {
    restoringRoute = false;
    if (!skipRouteSync) syncRoute(true);
    skipRouteSync = false;
  }
}

function initHeroSearchAutofill() {
  const inp = document.getElementById('heroSearch');
  if (!inp) return;
  const unlock = () => inp.removeAttribute('readonly');
  inp.addEventListener('focus', unlock, { once: true });
  inp.addEventListener('mousedown', unlock, { once: true });
  inp.addEventListener('touchstart', unlock, { once: true, passive: true });
}

async function init() {
  initHeroSearchAutofill();
  initFilterSheet();
  window.TL_I18N.apply(lang);
  if (window.TL_COOKIE) window.TL_COOKIE.render(lang);
  document.querySelectorAll('.lb').forEach((b) => {
    b.classList.toggle('on', (lang === 'en' && b.textContent.trim() === 'EN') || (lang === 'tr' && b.textContent.trim() === 'TR'));
  });
  restoreExploreFiltersFromUrl();
  updateAuthUI();
  renderGrid([]);
  loadHomepageStats();
  try {
    await applyRouteFromUrl({ skipFilters: true });
  } catch (e) {
    console.error(e);
  }
  try {
    await loadCategoryMeta();
    if (document.getElementById('page-explore')?.classList.contains('active')) {
      await applyFilters();
      if (isExploreMapTabActive()) await loadMapMarkers();
    }
    try {
      const me = await api('/auth/me', { silent: true });
      if (me.user) {
        setAuth(me.user);
        await reloadSavedIds();
      } else {
        setAuth(null);
      }
    } catch (e) {
      if (e.sessionExpired) handleSessionExpired(e.message);
      else setAuth(null);
    }
  } catch (e) {
    console.error(e);
  } finally {
    window.TL_LOADER?.hide();
    document.documentElement.classList.add('tl-ready');
  }
}

window.addEventListener('popstate', () => {
  window.TL_LOADER?.show();
  applyRouteFromUrl().finally(() => window.TL_LOADER?.hide());
});

init().catch((err) => {
  if (window.TL_ERROR_BOUNDARY) window.TL_ERROR_BOUNDARY.capture(null, err);
  else console.error(err);
});
