(function () {
  let pending = null;

  const TYPE_PATHS = {
    tiola: '/tiolas',
    blog: '/blogs',
  };

  function t(key) {
    return window.TL_I18N?.t?.(window.TL_I18N?.lang || 'tr', key) || key;
  }

  function canDelete(ownerId) {
    if (!window.user || ownerId == null) return false;
    if (Number(window.user.id) === Number(ownerId)) return true;
    return ['admin', 'moderator', 'staff'].includes(window.user.role);
  }

  function ensureOverlay() {
    let ov = document.getElementById('deleteContentOv');
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'deleteContentOv';
    ov.className = 'auth-ov';
    ov.innerHTML = `
      <div class="auth-box report-box" role="dialog" aria-labelledby="deleteContentTitle">
        <button type="button" class="aclose" id="deleteContentClose" aria-label="Kapat">✕</button>
        <h3 id="deleteContentTitle" class="report-title">Sil</h3>
        <p id="deleteContentMsg" class="report-target"></p>
        <div class="report-actions">
          <button type="button" class="btn bo bsm" id="deleteContentCancel">İptal</button>
          <button type="button" class="btn bp bsm report-menu-danger" id="deleteContentConfirm">Sil</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    document.getElementById('deleteContentClose').onclick = close;
    document.getElementById('deleteContentCancel').onclick = close;
    document.getElementById('deleteContentConfirm').onclick = confirm;
    return ov;
  }

  function open(targetType, targetId, label) {
    if (!window.user) {
      window.openAuth?.();
      return;
    }
    if (!TYPE_PATHS[targetType]) return;
    pending = { targetType, targetId, label };
    ensureOverlay();
    document.getElementById('deleteContentTitle').textContent = t('deleteTitle') || 'Sil';
    document.getElementById('deleteContentMsg').textContent =
      t('deleteConfirm') || 'Bu paylaşımı silmek istediğinize emin misiniz?';
    document.getElementById('deleteContentCancel').textContent = t('deleteCancel') || 'İptal';
    document.getElementById('deleteContentConfirm').textContent = t('deleteConfirmBtn') || 'Sil';
    document.getElementById('deleteContentOv').classList.add('on');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    document.getElementById('deleteContentOv')?.classList.remove('on');
    document.body.style.overflow = '';
    pending = null;
  }

  async function confirm() {
    if (!pending) return;
    const btn = document.getElementById('deleteContentConfirm');
    btn.disabled = true;
    try {
      const base = TYPE_PATHS[pending.targetType];
      const data = await window.api(`${base}/${pending.targetId}`, { method: 'DELETE' });
      close();
      window.TL_TOAST?.success(data?.message || t('deleteSuccess') || 'Paylaşım silindi');
      window.TL_CONTENT?.afterDelete?.(pending.targetType, pending.targetId);
    } catch {
      /* api shows toast */
    } finally {
      btn.disabled = false;
    }
  }

  async function afterDelete(targetType, targetId) {
    const card = document.querySelector(`[data-content-type="${targetType}"][data-content-id="${targetId}"]`);
    if (card) card.remove();

    if (targetType === 'tiola') {
      const feed = document.getElementById('tiolaFeed');
      if (feed && !feed.querySelector('.tiola-card')) {
        const empty = document.getElementById('tiolaEmpty');
        if (empty) empty.style.display = 'block';
      }
      const tiList = document.getElementById('myTiolaList');
      if (tiList && !tiList.querySelector('.tiola-card')) {
        const tiEmpty = document.getElementById('tiolaListEmpty');
        if (tiEmpty) tiEmpty.style.display = 'block';
      }
      const revList = document.getElementById('revList');
      if (revList && !revList.querySelector('.ri')) {
        revList.innerHTML = `<div class="no-res">${t('noApprovedTiola')}</div>`;
      }
      const pendingList = document.getElementById('myPendingList');
      if (pendingList && !pendingList.querySelector('.my-rev-item')) {
        const pe = document.getElementById('pendingEmpty');
        if (pe) pe.style.display = 'block';
      }
      if (typeof activePlace !== 'undefined' && activePlace && typeof renderRevList === 'function') {
        await renderRevList();
      } else if (typeof loadTiolaFeed === 'function' && document.getElementById('es-tiolas')?.classList.contains('active')) {
        await loadTiolaFeed();
      }
      if (typeof updateProfilePage === 'function' && document.getElementById('page-profile')?.classList.contains('active')) {
        await updateProfilePage();
      }
    } else if (targetType === 'blog') {
      const grid = document.getElementById('blogGrid');
      if (grid && !grid.querySelector('.bcard')) {
        grid.innerHTML = `<div class="no-res">${t('blogEmpty') || 'Blog bulunamadı'}</div>`;
      }
      if (typeof closeBlogDetail === 'function') closeBlogDetail();
      if (typeof renderBlog === 'function') await renderBlog();
      if (typeof updateProfilePage === 'function' && document.getElementById('page-profile')?.classList.contains('active')) {
        await updateProfilePage();
      }
    }
  }

  window.TL_CONTENT = { canDelete, open, close, afterDelete };
})();
