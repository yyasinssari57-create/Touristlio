(function () {
  const REASONS = [
    { id: 'spam', label: 'Spam' },
    { id: 'uygunsuz', label: 'Uygunsuz içerik' },
    { id: 'taciz', label: 'Taciz' },
    { id: 'sahte', label: 'Sahte hesap' },
    { id: 'telif', label: 'Telif' },
    { id: 'diger', label: 'Diğer' },
  ];

  const TYPE_LABELS = {
    profile: 'Profil',
    tiola: 'Tiola',
    blog: 'Blog',
  };

  let pending = null;

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function t(key) {
    return window.TL_I18N?.t?.(window.TL_I18N?.lang || 'tr', key) || key;
  }

  function ensureOverlay() {
    let ov = document.getElementById('reportOv');
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'reportOv';
    ov.className = 'auth-ov';
    ov.innerHTML = `
      <div class="auth-box report-box" role="dialog" aria-labelledby="reportTitle">
        <button type="button" class="aclose" id="reportClose" aria-label="Kapat">✕</button>
        <h3 id="reportTitle" class="report-title">Şikayet Et</h3>
        <p id="reportTarget" class="report-target"></p>
        <label class="report-label" for="reportReason">Neden</label>
        <select class="ain report-inp" id="reportReason"></select>
        <label class="report-label" for="reportNote">Ek not (isteğe bağlı)</label>
        <textarea class="ain report-inp" id="reportNote" rows="3" maxlength="500" placeholder="Kısa açıklama yazabilirsiniz…"></textarea>
        <div class="report-actions">
          <button type="button" class="btn bo bsm" id="reportCancel">İptal</button>
          <button type="button" class="btn bp bsm" id="reportSubmit">Gönder</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    document.getElementById('reportClose').onclick = close;
    document.getElementById('reportCancel').onclick = close;
    document.getElementById('reportSubmit').onclick = submit;
    const sel = document.getElementById('reportReason');
    sel.innerHTML = REASONS.map((r) => `<option value="${r.id}">${escapeHtml(r.label)}</option>`).join('');
    return ov;
  }

  function open(targetType, targetId, label) {
    if (!window.user) {
      window.openAuth?.();
      return;
    }
    pending = { targetType, targetId, label };
    ensureOverlay();
    document.getElementById('reportTitle').textContent = t('reportTitle') || 'Şikayet Et';
    document.getElementById('reportTarget').textContent =
      `${TYPE_LABELS[targetType] || targetType}: ${label || '#' + targetId}`;
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
    if (window.user && ownerId && window.user.id === ownerId) return '';
    const safeLabel = String(label || '').replace(/'/g, "\\'");
    return `<button type="button" class="report-menu-btn" title="Şikayet et" aria-label="Şikayet et"
      onclick="event.stopPropagation();TL_REPORTS.open('${targetType}',${targetId},'${safeLabel.replace(/"/g, '&quot;')}')">⋯</button>`;
  }

  window.TL_REPORTS = { REASONS, open, close, menuButton };
})();
