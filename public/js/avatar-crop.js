(function () {
  const VIEWPORT_SIZE = 280;
  const EXPORT_SIZE = 512;
  const MAX_ZOOM_FACTOR = 3;
  const ZOOM_STEP = 0.05;

  let state = {
    img: null,
    file: null,
    scale: 1,
    minScale: 1,
    x: 0,
    y: 0,
    onSave: null,
    dragging: false,
    dragStartX: 0,
    dragStartY: 0,
    originX: 0,
    originY: 0,
  };

  function t(key) {
    const lang = window.TL_I18N?.lang || localStorage.getItem('tl_lang') || 'tr';
    return window.TL_I18N?.t?.(lang, key) || key;
  }

  function ensureModal() {
    let ov = document.getElementById('avatarCropOv');
    if (ov) return ov;

    ov = document.createElement('div');
    ov.id = 'avatarCropOv';
    ov.className = 'auth-ov';
    ov.innerHTML = `
      <div class="auth-box avatar-crop-box" role="dialog" aria-labelledby="avatarCropTitle">
        <button type="button" class="aclose" id="avatarCropClose" aria-label="Kapat">✕</button>
        <h3 id="avatarCropTitle" class="avatar-crop-title" data-i18n="avatarCropTitle">Fotoğrafı kırp</h3>
        <div class="avatar-crop-stage" id="avatarCropStage">
          <div class="avatar-crop-viewport" id="avatarCropViewport">
            <img class="avatar-crop-img" id="avatarCropImg" alt="" draggable="false"/>
          </div>
          <div class="avatar-crop-overlay" aria-hidden="true"></div>
        </div>
        <div class="avatar-crop-zoom-row">
          <span class="avatar-crop-zoom-label" data-i18n="avatarCropZoom">Yakınlaştır</span>
          <button type="button" class="avatar-crop-zoom-btn" id="avatarCropZoomOut" aria-label="Uzaklaştır">−</button>
          <input type="range" class="avatar-crop-slider" id="avatarCropSlider" min="0" max="100" value="0" aria-label="Yakınlaştır"/>
          <button type="button" class="avatar-crop-zoom-btn" id="avatarCropZoomIn" aria-label="Yakınlaştır">+</button>
        </div>
        <div class="report-actions avatar-crop-actions">
          <button type="button" class="btn bo bsm" id="avatarCropCancel" data-i18n="avatarCropCancel">İptal</button>
          <button type="button" class="btn bp bsm" id="avatarCropSave" data-i18n="avatarCropSave">Kaydet</button>
        </div>
      </div>`;
    document.body.appendChild(ov);

    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    document.getElementById('avatarCropClose').onclick = close;
    document.getElementById('avatarCropCancel').onclick = close;
    document.getElementById('avatarCropSave').onclick = save;
    document.getElementById('avatarCropZoomIn').onclick = () => adjustZoom(ZOOM_STEP);
    document.getElementById('avatarCropZoomOut').onclick = () => adjustZoom(-ZOOM_STEP);

    const slider = document.getElementById('avatarCropSlider');
    slider.addEventListener('input', () => {
      const min = state.minScale;
      const max = state.minScale * MAX_ZOOM_FACTOR;
      const ratio = Number(slider.value) / 100;
      setScale(min + (max - min) * ratio);
    });

    const stage = document.getElementById('avatarCropStage');
    stage.addEventListener('mousedown', onDragStart);
    stage.addEventListener('mousemove', onDragMove);
    stage.addEventListener('mouseup', onDragEnd);
    stage.addEventListener('mouseleave', onDragEnd);
    stage.addEventListener('touchstart', onTouchStart, { passive: false });
    stage.addEventListener('touchmove', onTouchMove, { passive: false });
    stage.addEventListener('touchend', onDragEnd);
    stage.addEventListener('touchcancel', onDragEnd);

    return ov;
  }

  function validateFile(file) {
    if (!file) return false;
    if (file.size > 3 * 1024 * 1024) {
      window.TL_TOAST?.error(t('avatarFileTooBig'));
      return false;
    }
    if (!/^image\/(jpeg|png|webp|gif)$/i.test(file.type)) {
      window.TL_TOAST?.error(t('avatarFileType'));
      return false;
    }
    return true;
  }

  function applyLabels() {
    const ov = document.getElementById('avatarCropOv');
    if (!ov) return;
    ov.querySelector('#avatarCropTitle').textContent = t('avatarCropTitle');
    ov.querySelector('.avatar-crop-zoom-label').textContent = t('avatarCropZoom');
    ov.querySelector('#avatarCropCancel').textContent = t('avatarCropCancel');
    ov.querySelector('#avatarCropSave').textContent = t('avatarCropSave');
  }

  function open(file, onSave) {
    if (!validateFile(file)) return;
    ensureModal();
    applyLabels();

    state.file = file;
    state.onSave = onSave;
    state.x = 0;
    state.y = 0;
    state.dragging = false;

    const img = document.getElementById('avatarCropImg');
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      state.img = img;
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      state.minScale = Math.max(VIEWPORT_SIZE / nw, VIEWPORT_SIZE / nh);
      state.scale = state.minScale;
      constrainPosition();
      updateView();
      syncSlider();
      document.getElementById('avatarCropOv').classList.add('on');
      document.body.style.overflow = 'hidden';
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      window.TL_TOAST?.error(t('avatarUploadFailed'));
    };
    img.src = url;
  }

  function close() {
    document.getElementById('avatarCropOv')?.classList.remove('on');
    document.body.style.overflow = '';
    state.onSave = null;
    state.file = null;
    state.img = null;
    state.dragging = false;
    const img = document.getElementById('avatarCropImg');
    if (img) img.removeAttribute('src');
  }

  function setScale(next) {
    const min = state.minScale;
    const max = state.minScale * MAX_ZOOM_FACTOR;
    state.scale = Math.min(max, Math.max(min, next));
    constrainPosition();
    updateView();
    syncSlider();
  }

  function adjustZoom(delta) {
    setScale(state.scale + delta * state.minScale);
  }

  function syncSlider() {
    const slider = document.getElementById('avatarCropSlider');
    if (!slider) return;
    const min = state.minScale;
    const max = state.minScale * MAX_ZOOM_FACTOR;
    const ratio = max > min ? (state.scale - min) / (max - min) : 0;
    slider.value = String(Math.round(ratio * 100));
  }

  function constrainPosition() {
    if (!state.img) return;
    const nw = state.img.naturalWidth;
    const nh = state.img.naturalHeight;
    const sw = nw * state.scale;
    const sh = nh * state.scale;
    const maxX = Math.max(0, (sw - VIEWPORT_SIZE) / 2);
    const maxY = Math.max(0, (sh - VIEWPORT_SIZE) / 2);
    state.x = Math.min(maxX, Math.max(-maxX, state.x));
    state.y = Math.min(maxY, Math.max(-maxY, state.y));
  }

  function updateView() {
    const img = document.getElementById('avatarCropImg');
    if (!img || !state.img) return;
    const nw = state.img.naturalWidth;
    const nh = state.img.naturalHeight;
    const sw = nw * state.scale;
    const sh = nh * state.scale;
    const left = (VIEWPORT_SIZE - sw) / 2 + state.x;
    const top = (VIEWPORT_SIZE - sh) / 2 + state.y;
    img.style.width = `${sw}px`;
    img.style.height = `${sh}px`;
    img.style.left = `${left}px`;
    img.style.top = `${top}px`;
  }

  function onDragStart(e) {
    if (!state.img || e.button !== 0) return;
    state.dragging = true;
    state.dragStartX = e.clientX;
    state.dragStartY = e.clientY;
    state.originX = state.x;
    state.originY = state.y;
    e.preventDefault();
  }

  function onDragMove(e) {
    if (!state.dragging) return;
    state.x = state.originX + (e.clientX - state.dragStartX);
    state.y = state.originY + (e.clientY - state.dragStartY);
    constrainPosition();
    updateView();
    e.preventDefault();
  }

  function onDragEnd() {
    state.dragging = false;
  }

  function onTouchStart(e) {
    if (!state.img || e.touches.length !== 1) return;
    const t = e.touches[0];
    state.dragging = true;
    state.dragStartX = t.clientX;
    state.dragStartY = t.clientY;
    state.originX = state.x;
    state.originY = state.y;
    e.preventDefault();
  }

  function onTouchMove(e) {
    if (!state.dragging || e.touches.length !== 1) return;
    const t = e.touches[0];
    state.x = state.originX + (t.clientX - state.dragStartX);
    state.y = state.originY + (t.clientY - state.dragStartY);
    constrainPosition();
    updateView();
    e.preventDefault();
  }

  function exportBlob(callback) {
    if (!state.img) return;
    const canvas = document.createElement('canvas');
    canvas.width = EXPORT_SIZE;
    canvas.height = EXPORT_SIZE;
    const ctx = canvas.getContext('2d');
    const nw = state.img.naturalWidth;
    const nh = state.img.naturalHeight;
    const s = state.scale;
    const srcW = VIEWPORT_SIZE / s;
    const srcH = VIEWPORT_SIZE / s;
    const srcX = nw / 2 - srcW / 2 - state.x / s;
    const srcY = nh / 2 - srcH / 2 - state.y / s;

    ctx.beginPath();
    ctx.arc(EXPORT_SIZE / 2, EXPORT_SIZE / 2, EXPORT_SIZE / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(state.img, srcX, srcY, srcW, srcH, 0, 0, EXPORT_SIZE, EXPORT_SIZE);

    const usePng = /^image\/png$/i.test(state.file.type);
    const mime = usePng ? 'image/png' : 'image/jpeg';
    const quality = usePng ? undefined : 0.92;
    canvas.toBlob((blob) => {
      if (!blob) {
        window.TL_TOAST?.error(t('avatarUploadFailed'));
        return;
      }
      const ext = usePng ? '.png' : '.jpg';
      const base = (state.file.name || 'avatar').replace(/\.[^.]+$/, '');
      const cropped = new File([blob], base + ext, { type: mime, lastModified: Date.now() });
      callback(cropped);
    }, mime, quality);
  }

  function save() {
    const btn = document.getElementById('avatarCropSave');
    if (btn) btn.disabled = true;
    exportBlob((cropped) => {
      if (btn) btn.disabled = false;
      const cb = state.onSave;
      close();
      if (cb) cb(cropped);
    });
  }

  window.TL_AVATAR_CROP = { open, close };
})();
