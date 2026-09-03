(function () {
  const REASON_KEYS = [
    { id: 'spam', key: 'reportSpam' },
    { id: 'uygunsuz', key: 'reportInappropriate' },
    { id: 'taciz', key: 'reportHarassment' },
    { id: 'sahte', key: 'reportFake' },
    { id: 'telif', key: 'reportCopyright' },
    { id: 'diger', key: 'reportOther' },
  ];

  const TYPE_KEYS = {
    profile: 'reportTypeProfile',
    tiola: 'tiolaLabel',
    blog: 'blog',
  };

  let pending = null;

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function lang() {
    try {
      const stored = localStorage.getItem('tl_lang');
      if (stored === 'en' || stored === 'tr') return stored;
    } catch { /* private mode */ }
    return (document.documentElement.lang || 'tr').slice(0, 2) === 'en' ? 'en' : 'tr';
  }

  function t(key) {
    return window.TL_I18N?.t?.(lang(), key) || key;
  }

  function ensureOverlay() {
    let ov = document.getElementById('reportOv');
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'reportOv';
    ov.className = 'auth-ov';
    ov.innerHTML = `
      <div class="auth-box report-box" role="dialog" aria-labelledby="reportTitle">
        <button type="button" class="aclose" id="reportClose" data-i18n-aria="closeAria" aria-label="${escapeHtml(t('closeAria'))}">✕</button>
        <h3 id="reportTitle" class="report-title" data-i18n="reportTitle">${escapeHtml(t('reportTitle'))}</h3>
        <p id="reportTarget" class="report-target"></p>
        <label class="report-label" for="reportReason" data-i18n="reportReason">${escapeHtml(t('reportReason'))}</label>
        <select class="ain report-inp" id="reportReason"></select>
        <label class="report-label" for="reportNote" data-i18n="reportNoteLabel">${escapeHtml(t('reportNoteLabel'))}</label>
        <textarea class="ain report-inp" id="reportNote" rows="3" maxlength="500" data-i18n-placeholder="reportNotePh" placeholder="${escapeHtml(t('reportNotePh'))}"></textarea>
        <div class="report-actions">
          <button type="button" class="btn bo bsm" id="reportCancel" data-i18n="deleteCancel">${escapeHtml(t('deleteCancel'))}</button>
          <button type="button" class="btn bp bsm" id="reportSubmit" data-i18n="contactSend">${escapeHtml(t('contactSend'))}</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    document.getElementById('reportClose').onclick = close;
    document.getElementById('reportCancel').onclick = close;
    document.getElementById('reportSubmit').onclick = submit;
    const sel = document.getElementById('reportReason');
    sel.innerHTML = REASON_KEYS.map((r) => `<option value="${r.id}">${escapeHtml(t(r.key))}</option>`).join('');
    return ov;
  }

  function syncOverlayCopy() {
    const ov = document.getElementById('reportOv');
    if (!ov) return;
    const title = document.getElementById('reportTitle');
    if (title) title.textContent = t('reportTitle');
    const reasonLbl = ov.querySelector('label[for="reportReason"]');
    if (reasonLbl) reasonLbl.textContent = t('reportReason');
    const noteLbl = ov.querySelector('label[for="reportNote"]');
    if (noteLbl) noteLbl.textContent = t('reportNoteLabel');
    const note = document.getElementById('reportNote');
    if (note) note.placeholder = t('reportNotePh');
    const cancel = document.getElementById('reportCancel');
    if (cancel) cancel.textContent = t('deleteCancel');
    const submitBtn = document.getElementById('reportSubmit');
    if (submitBtn) submitBtn.textContent = t('contactSend');
    const closeBtn = document.getElementById('reportClose');
    if (closeBtn) closeBtn.setAttribute('aria-label', t('closeAria'));
    const sel = document.getElementById('reportReason');
    if (sel) {
      const prev = sel.value;
      sel.innerHTML = REASON_KEYS.map((r) => `<option value="${r.id}">${escapeHtml(t(r.key))}</option>`).join('');
      if (prev) sel.value = prev;
    }
  }

  function open(targetType, targetId, label) {
    if (!window.user) {
      window.openAuth?.();
      return;
    }
    pending = { targetType, targetId, label };
    ensureOverlay();
    syncOverlayCopy();
    document.getElementById('reportTitle').textContent = t('reportTitle');
    document.getElementById('reportTarget').textContent =
      `${t(TYPE_KEYS[targetType] || 'reportTitle')}: ${label || '#' + targetId}`;
    document.getElementById('reportNote').value = '';
    document.getElementById('reportReason').selectedIndex = 0;
    document.getElementById('reportOv').classList.add('on');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    document.getElementById('reportOv')?.classList.remove('on');
    document.body.style.overflow = '';
    pending = null;
  }

  async function submit() {
    if (!pending) return;
    const reason = document.getElementById('reportReason').value;
    const note = document.getElementById('reportNote').value.trim();
    const btn = document.getElementById('reportSubmit');
    btn.disabled = true;
    try {
      const apiFn = window.api || (async () => { throw new Error('API yok'); });
      await apiFn('/reports', {
        method: 'POST',
        body: { targetType: pending.targetType, targetId: pending.targetId, reason, note: note || undefined },
      });
      close();
      window.TL_TOAST?.success(t('reportSent') || 'Şikayetiniz alındı');
    } catch (e) {
      /* api shows toast */
    } finally {
      btn.disabled = false;
    }
  }

  function menuButton(targetType, targetId, label, ownerId) {
    if (!targetId) return '';
    const resolvedOwner = ownerId != null ? ownerId : window.user?.id;
    const canDel = window.TL_CONTENT?.canDelete?.(resolvedOwner);
    const canReport = window.user && resolvedOwner != null
      && Number(window.user.id) !== Number(resolvedOwner);
    if (!canDel && !canReport) return '';

    const safeLabel = String(label || '').replace(/'/g, "\\'");
    const menuId = `rpt-menu-${targetType}-${targetId}`;
    const items = [];
    if (canDel) {
      items.push(`<button type="button" class="report-menu-danger" role="menuitem" onclick="event.stopPropagation();TL_CONTENT.open('${targetType}',${targetId},'${safeLabel.replace(/"/g, '&quot;')}');TL_REPORTS.closeMenus()">${t('deleteBtn') || 'Sil'}</button>`);
    }
    if (canReport) {
      items.push(`<button type="button" role="menuitem" onclick="event.stopPropagation();TL_REPORTS.open('${targetType}',${targetId},'${safeLabel.replace(/"/g, '&quot;')}');TL_REPORTS.closeMenus()">${t('reportBtn') || 'Şikayet et'}</button>`);
    }

    return `<div class="report-menu-wrap">
      <button type="button" class="report-menu-btn" title="Menü" aria-label="Menü" aria-haspopup="true"
        aria-controls="${menuId}" data-menu-id="${menuId}">⋯</button>
      <div class="report-menu-drop" id="${menuId}" role="menu" hidden>
        ${items.join('')}
      </div>
    </div>`;
  }

  function clearMenuPosition(drop) {
    drop.style.position = '';
    drop.style.zIndex = '';
    drop.style.top = '';
    drop.style.left = '';
    drop.style.right = '';
    drop.style.bottom = '';
    drop.style.visibility = '';
  }

  function closeMenus() {
    document.querySelectorAll('.report-menu-drop').forEach((el) => {
      el.hidden = true;
      clearMenuPosition(el);
    });
    document.querySelectorAll('.report-menu-wrap.is-open').forEach((el) => {
      el.classList.remove('is-open');
      el.classList.remove('drop-up');
    });
    document.querySelectorAll('.bcard.menu-open').forEach((el) => el.classList.remove('menu-open'));
  }

  function positionMenuDrop(wrap, drop) {
    if (!wrap || !drop) return;
    const btn = wrap.querySelector('.report-menu-btn');
    if (!btn) return;
    // Render the open menu as a fixed-position layer anchored to the button so
    // it can never be clipped by a scrollable/overflow container (e.g. the
    // blog detail overlay's scroll box) or painted behind nested stacking
    // contexts. Coordinates come from the button's viewport rect.
    wrap.classList.remove('drop-up');
    drop.style.position = 'fixed';
    drop.style.zIndex = '1200';
    drop.style.right = 'auto';
    drop.style.bottom = 'auto';
    drop.style.visibility = 'hidden';
    const btnRect = btn.getBoundingClientRect();
    const dropRect = drop.getBoundingClientRect();
    const gap = 4;
    let top = btnRect.bottom + gap;
    if (top + dropRect.height > window.innerHeight - 8) {
      top = btnRect.top - gap - dropRect.height; // flip upward when no room below
    }
    if (top < 8) top = 8;
    let left = btnRect.right - dropRect.width; // right-align with the button
    if (left < 8) left = 8;
    drop.style.top = `${top}px`;
    drop.style.left = `${left}px`;
    drop.style.visibility = '';
  }

  function resolveMenuDrop(btnOrDrop, menuId) {
    if (btnOrDrop?.classList?.contains('report-menu-drop')) return btnOrDrop;
    const wrap = btnOrDrop?.closest?.('.report-menu-wrap');
    if (wrap) {
      const scoped = wrap.querySelector('.report-menu-drop');
      if (scoped) return scoped;
    }
    return menuId ? document.getElementById(menuId) : null;
  }

  function toggleMenu(menuIdOrDrop, ev) {
    ev?.stopPropagation?.();
    ev?.preventDefault?.();
    const btn = ev?.target?.closest?.('.report-menu-btn');
    const menuId = typeof menuIdOrDrop === 'string' ? menuIdOrDrop : btn?.dataset?.menuId;
    const el = typeof menuIdOrDrop === 'string'
      ? resolveMenuDrop(btn, menuIdOrDrop)
      : menuIdOrDrop;
    if (!el) return;
    const wrap = el.closest('.report-menu-wrap');
    const card = el.closest('.bcard');
    const open = el.hidden;
    closeMenus();
    el.hidden = !open;
    if (!el.hidden) {
      wrap?.classList.add('is-open');
      card?.classList.add('menu-open');
      positionMenuDrop(wrap, el);
    }
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.report-menu-btn');
    if (!btn) return;
    const wrap = btn.closest('.report-menu-wrap');
    const el = wrap?.querySelector('.report-menu-drop');
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    toggleMenu(el, e);
  }, true);

  document.addEventListener('click', (e) => {
    if (e.target.closest('.report-menu-btn')) return;
    if (e.target.closest('.report-menu-drop')) return;
    if (e.target.closest('.report-menu-wrap')) return;
    closeMenus();
  });

  // A fixed-position menu's coordinates go stale when the page or an inner
  // scroll container (e.g. the blog detail overlay) scrolls, so close it.
  window.addEventListener('scroll', () => closeMenus(), true);
  window.addEventListener('resize', () => closeMenus());

  window.TL_REPORTS = { REASONS, open, close, menuButton, toggleMenu, closeMenus };
})();
