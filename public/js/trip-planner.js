/**
 * Touristlio Trip Planner Pro — wizard, DnD schedule, map route, auto-plan
 */
window.TL_TRIP = (function () {
  let state = {
    tripId: null,
    name: '', country: '', city: '', startDate: '', endDate: '',
    travelers: 2, tripType: 'culture', budget: 'mid', transport: 'walk',
    days: [], visibility: 'private', shareToken: null,
  };
  let map = null;
  let mapLayer = null;
  let lang = 'tr';

  function t(key) {
    return window.TL_I18N?.t(lang, key) || key;
  }

  async function api(path, opts = {}) {
    const token = localStorage.getItem('tl_token');
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch('/api' + path, { ...opts, headers, credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || t('requestFailed'));
    return data;
  }

  function showStep(n) {
    document.querySelectorAll('.tp-step').forEach((s) => s.classList.remove('active'));
    document.getElementById('tp-step-' + n)?.classList.add('active');
    document.querySelectorAll('.tp-wiz-dot').forEach((d, i) => d.classList.toggle('on', i < n));
  }

  function readWizard() {
    state.name = document.getElementById('tpName')?.value.trim() || t('tripDefaultName');
    state.country = document.getElementById('tpCountry')?.value.trim() || '';
    state.city = document.getElementById('tpCity')?.value.trim() || '';
    state.startDate = document.getElementById('tpStart')?.value || '';
    state.endDate = document.getElementById('tpEnd')?.value || '';
    state.travelers = Number(document.getElementById('tpTravelers')?.value) || 2;
    state.tripType = document.getElementById('tpType')?.value || 'culture';
    state.budget = document.getElementById('tpBudget')?.value || 'mid';
    state.transport = document.getElementById('tpTransport')?.value || 'walk';
    const s = new Date(state.startDate);
    const e = new Date(state.endDate);
    let dayCount = 3;
    if (state.startDate && state.endDate && e >= s) {
      dayCount = Math.min(14, Math.ceil((e - s) / 86400000) + 1);
    }
    return dayCount;
  }

  async function autoFillDays(dayCount) {
    const data = await api('/trip-plans/auto-generate', {
      method: 'POST',
      body: JSON.stringify({ city: state.city, days: dayCount, budget: state.budget, interest: state.tripType }),
    });
    state.days = data.days.map((d) => ({
      title: d.title,
      items: d.items.map((it) => ({ placeId: it.placeId, name: '', startTime: '', note: '' })),
    }));
    for (const day of state.days) {
      for (const item of day.items) {
        if (item.placeId) {
          try {
            const p = await api('/places/' + item.placeId + '?lang=' + lang);
            item.name = p.place.name;
            item.lat = p.place.lat;
            item.lng = p.place.lng;
          } catch { /* ignore */ }
        }
      }
    }
  }

  function densityWarning(day) {
    const count = day.items.filter((i) => i.placeId).length;
    if (count >= 6) return { level: 'high', msg: t('tripDensityHigh') };
    if (count >= 4) return { level: 'mid', msg: t('tripDensityMid') };
    return null;
  }

  function renderSchedule() {
    const box = document.getElementById('tpSchedule');
    if (!box) return;
    box.innerHTML = state.days.map((day, di) => {
      const warn = densityWarning(day);
      return `
        <div class="tp-day" data-day="${di}">
          <div class="tp-day-hd">
            <input class="tp-day-title" value="${escapeHtml(day.title)}" data-day="${di}" aria-label="${t('tripDayTitle')}"/>
            ${warn ? `<span class="tp-warn tp-warn-${warn.level}" role="status">${warn.msg}</span>` : ''}
          </div>
          <ul class="tp-items" data-day="${di}" role="list">
            ${day.items.map((it, ii) => `
              <li class="tp-item" draggable="true" data-day="${di}" data-idx="${ii}" role="listitem">
                <span class="tp-drag" aria-hidden="true">⋮⋮</span>
                <span class="tp-num">${ii + 1}</span>
                <span class="tp-place-name">${escapeHtml(it.name || t('tripSelectPlace'))}</span>
                <button type="button" class="tp-rm" data-day="${di}" data-idx="${ii}" aria-label="${t('tripRemove')}">✕</button>
              </li>`).join('')}
          </ul>
          <button type="button" class="btn bo bsm tp-add-place" data-day="${di}">+ ${t('tripAddPlace')}</button>
        </div>`;
    }).join('');
    bindDnD();
    bindScheduleEvents();
    renderTripMap();
  }

  function bindScheduleEvents() {
    document.querySelectorAll('.tp-day-title').forEach((inp) => {
      inp.onchange = () => { state.days[inp.dataset.day].title = inp.value; };
    });
    document.querySelectorAll('.tp-rm').forEach((btn) => {
      btn.onclick = () => {
        state.days[btn.dataset.day].items.splice(btn.dataset.idx, 1);
        renderSchedule();
      };
    });
    document.querySelectorAll('.tp-add-place').forEach((btn) => {
      btn.onclick = () => openPlacePicker(Number(btn.dataset.day));
    });
  }

  function bindDnD() {
    let dragSrc = null;
    document.querySelectorAll('.tp-item').forEach((el) => {
      el.addEventListener('dragstart', (e) => {
        dragSrc = { day: Number(el.dataset.day), idx: Number(el.dataset.idx) };
        el.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      el.addEventListener('dragend', () => el.classList.remove('dragging'));
      el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drag-over'); });
      el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.classList.remove('drag-over');
        if (!dragSrc) return;
        const tgtDay = Number(el.dataset.day);
        const tgtIdx = Number(el.dataset.idx);
        const item = state.days[dragSrc.day].items.splice(dragSrc.idx, 1)[0];
        state.days[tgtDay].items.splice(tgtIdx, 0, item);
        dragSrc = null;
        renderSchedule();
      });
    });
  }

  async function openPlacePicker(dayIdx) {
    const q = prompt(t('tripSearchPlace'));
    if (!q) return;
    const data = await api('/places/search?q=' + encodeURIComponent(q) + '&limit=5');
    if (!data.places.length) { window.TL_TOAST?.warning(t('noResults')); return; }
    const p = data.places[0];
    const last = state.days[dayIdx].items.filter((i) => i.placeId).pop();
    if (last?.placeId) {
      try {
        const sug = await api('/trip-plans/suggest/nearby?placeId=' + last.placeId + '&limit=1');
        if (sug.places[0]?.id === p.id) window.TL_TOAST?.info(t('tripNearbyHint'));
      } catch { /* ignore */ }
    }
    state.days[dayIdx].items.push({ placeId: p.id, name: p.name, lat: p.lat, lng: p.lng, startTime: '', note: '' });
    renderSchedule();
  }

  function renderTripMap() {
    const el = document.getElementById('tpMap');
    if (!el || typeof L === 'undefined') return;
    if (!map) {
      map = L.map(el, { scrollWheelZoom: false }).setView([41.01, 28.98], 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM' }).addTo(map);
      mapLayer = L.layerGroup().addTo(map);
    }
    mapLayer.clearLayers();
    const bounds = [];
    let n = 1;
    state.days.forEach((day) => {
      day.items.forEach((it) => {
        if (it.lat == null) return;
        const icon = L.divIcon({
          className: 'tl-trip-num',
          html: `<span style="background:#6EC6FF;color:#fff;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.65rem;font-weight:700;border:2px solid #fff">${n}</span>`,
          iconSize: [22, 22], iconAnchor: [11, 11],
        });
        L.marker([it.lat, it.lng], { icon }).addTo(mapLayer).bindPopup(`<strong>${n}. ${escapeHtml(it.name)}</strong>`);
        bounds.push([it.lat, it.lng]);
        n++;
      });
    });
    if (bounds.length) map.fitBounds(bounds, { padding: [30, 30] });
    setTimeout(() => map.invalidateSize(), 150);
  }

  async function saveTrip() {
    const payload = {
      name: state.name, country: state.country, city: state.city,
      startDate: state.startDate, endDate: state.endDate,
      travelers: state.travelers, tripType: state.tripType, budget: state.budget,
      transport: state.transport, visibility: state.visibility,
      days: state.days.map((d) => ({
        title: d.title,
        items: d.items.map((it) => ({ placeId: it.placeId, startTime: it.startTime, note: it.note })),
      })),
    };
    if (state.tripId) {
      await api('/trip-plans/' + state.tripId, { method: 'PUT', body: JSON.stringify(payload) });
      window.TL_TOAST?.success(t('tripSaved'));
    } else {
      const dayCount = state.days.length;
      const created = await api('/trip-plans', { method: 'POST', body: JSON.stringify({ ...payload, days: state.days.length }) });
      state.tripId = created.id;
      state.shareToken = created.shareToken;
      await api('/trip-plans/' + state.tripId, { method: 'PUT', body: JSON.stringify(payload) });
      window.TL_TOAST?.success(t('tripCreated'));
    }
    updateShareLink();
  }

  function updateShareLink() {
    const el = document.getElementById('tpShareLink');
    if (!el || !state.shareToken) return;
    el.href = location.origin + '/trip/' + state.tripId + '?token=' + state.shareToken;
    el.textContent = el.href;
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  async function init(l = 'tr') {
    lang = l;
    document.getElementById('tpNext1')?.addEventListener('click', () => showStep(2));
    document.getElementById('tpNext2')?.addEventListener('click', async () => {
      const dayCount = readWizard();
      await autoFillDays(dayCount);
      renderSchedule();
      showStep(3);
    });
    document.getElementById('tpSave')?.addEventListener('click', saveTrip);
    document.getElementById('tpPrint')?.addEventListener('click', () => window.print());
    document.getElementById('tpBack2')?.addEventListener('click', () => showStep(1));
    document.getElementById('tpBack3')?.addEventListener('click', () => showStep(2));

    const params = new URLSearchParams(location.search);
    const token = params.get('token');
    const pathMatch = location.pathname.match(/\/trip\/(\d+)/);
    if (pathMatch) {
      try {
        const data = token
          ? await api('/trip-plans/share/' + token)
          : await api('/trip-plans/' + pathMatch[1]);
        const trip = data.trip;
        state.tripId = trip.id;
        state.name = trip.name;
        state.city = trip.city;
        state.days = (trip.days || []).map((d) => ({
          title: d.title,
          items: (d.items || []).map((it) => ({
            placeId: it.place_id, name: it.name || '', lat: it.lat, lng: it.lng,
            startTime: it.start_time, note: it.note,
          })),
        }));
        showStep(3);
        renderSchedule();
      } catch (e) {
        window.TL_TOAST?.error(e.message);
      }
    }
    showStep(1);
  }

  async function loadUserTrips(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    try {
      const data = await api('/trip-plans/mine');
      if (!data.trips.length) {
        el.innerHTML = `<p class="empty-hint">${t('tripEmpty')}</p>`;
        return;
      }
      el.innerHTML = data.trips.map((tr) => `
        <a class="trip-card-link" href="/trip-planner.html?edit=${tr.id}">
          <strong>${escapeHtml(tr.name)}</strong>
          <span>${escapeHtml(tr.city || '')} · ${tr.start_date || '—'}</span>
        </a>`).join('');
    } catch {
      el.innerHTML = '';
    }
  }

  return { init, loadUserTrips, state };
})();
