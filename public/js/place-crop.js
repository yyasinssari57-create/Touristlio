(function () {
  /* Place cards: .pc-img height 165px, ~16:9 landscape crop for listings */
  const ASPECT = 16 / 9;
  const VIEWPORT_W = 360;
  const VIEWPORT_H = Math.round(VIEWPORT_W / ASPECT);
  const EXPORT_W = 1280;
  const EXPORT_H = Math.round(EXPORT_W / ASPECT);
  const PREVIEW_W = 230;
  const PREVIEW_H = 165;
  const MAX_ZOOM_FACTOR = 3;
  const ZOOM_STEP = 0.05;
  const MAX_FILE_BYTES = 5 * 1024 * 1024;

  let state = {
    img: null,
    file: null,
    scale: 1,
    minScale: 1,
    x: 0,
    y: 0,
    onSave: null,
    onCancel: null,
    dragging: false,
    dragStartX: 0,
    dragStartY: 0,
    originX: 0,
    originY: 0,
  };

  function ensureModal() {
    let ov = document.getElementById('placeCropOv');
    if (ov) return ov;

    ov = document.createElement('div');
    ov.id = 'placeCropOv';
    ov.className = 'auth-ov';
    ov.innerHTML = `
      <div class="auth-box place-crop-box" role="dialog" aria-labelledby="placeCropTitle">
        <button type="button" class="aclose" id="placeCropClose" aria-label="Kapat">✕</button>
        <h3 id="placeCropTitle" class="place-crop-title">Görseli ayarla</h3>
        <p class="adm-field-hint place-crop-hint">Sürükleyerek konumlandırın, yakınlaştırarak kırpma alanını ayarlayın.</p>
        <div class="place-crop-stage" id="placeCropStage" style="width:${VIEWPORT_W}px;height:${VIEWPORT_H}px">
          <div class="place-crop-viewport" id="placeCropViewport">
            <img class="place-crop-img" id="placeCropImg" alt="Kırpılacak fotoğraf" draggable="false" loading="lazy"/>
          </div>
          <div class="place-crop-overlay" aria-hidden="true"></div>
        </div>
        <div class="place-crop-zoom-row">
          <span class="place-crop-zoom-label">Yakınlaştır</span>
          <button type="button" class="place-crop-zoom-btn" id="placeCropZoomOut" aria-label="Uzaklaştır">−</button>
          <input type="range" class="place-crop-slider" id="placeCropSlider" min="0" max="100" value="0" aria-label="Yakınlaştır"/>
          <button type="button" class="place-crop-zoom-btn" id="placeCropZoomIn" aria-label="Yakınlaştır">+</button>
        </div>
        <div class="place-crop-preview-wrap">
          <p class="place-crop-preview-label">Yer kartında görünüm</p>
          <div class="place-crop-preview-card pc">
            <div class="pc-img place-crop-preview-img">
              <canvas id="placeCropPreviewCanvas" width="${PREVIEW_W}" height="${PREVIEW_H}" aria-hidden="true"></canvas>
            </div>
            <div class="place-crop-preview-body"><span class="place-crop-preview-name">Önizleme</span></div>
          </div>
        </div>
        <div class="report-actions place-crop-actions">
          <button type="button" class="btn bo bsm" id="placeCropCancel">İptal</button>
          <button type="button" class="btn bp bsm" id="placeCropSave">Kırp ve kaydet</button>
        </div>
      </div>`;
    document.body.appendChild(ov);

    ov.addEventListener('click', (e) => { if (e.target === ov) cancel(); });
    document.getElementById('placeCropClose').onclick = cancel;
    document.getElementById('placeCropCancel').onclick = cancel;
    document.getElementById('placeCropSave').onclick = save;
    document.getElementById('placeCropZoomIn').onclick = () => adjustZoom(ZOOM_STEP);
    document.getElementById('placeCropZoomOut').onclick = () => adjustZoom(-ZOOM_STEP);

    const slider = document.getElementById('placeCropSlider');
    slider.addEventListener('input', () => {
      const min = state.minScale;
      const max = state.minScale * MAX_ZOOM_FACTOR;
      const ratio = Number(slider.value) / 100;
      setScale(min + (max - min) * ratio);
    });

    const stage = document.getElementById('placeCropStage');
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
    if (file.size > MAX_FILE_BYTES) {
      alert('Dosya en fazla 5 MB olabilir.');
      return false;
    }
    if (!/^image\/(jpeg|png|webp|gif)$/i.test(file.type)) {
      alert('JPEG, PNG, WebP veya GIF yükleyin.');
      return false;
    }
    return true;
  }

  function open(file, onSave, onCancel) {
    if (!validateFile(file)) {
      if (onCancel) onCancel();
      return;
    }
    ensureModal();

    state.file = file;
    state.onSave = onSave;
    state.onCancel = onCancel || null;
    state.x = 0;
    state.y = 0;
    state.dragging = false;

    const img = document.getElementById('placeCropImg');
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      state.img = img;
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      state.minScale = Math.max(VIEWPORT_W / nw, VIEWPORT_H / nh);
      state.scale = state.minScale;
      constrainPosition();
      updateView();
      syncSlider();
      document.getElementById('placeCropOv').classList.add('on');
      document.body.style.overflow = 'hidden';
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      alert('Görsel yüklenemedi.');
      if (state.onCancel) state.onCancel();
      close();
    };
    img.src = url;
  }

  function close() {
    document.getElementById('placeCropOv')?.classList.remove('on');
    document.body.style.overflow = '';
    state.onSave = null;
    state.onCancel = null;
    state.file = null;
    state.img = null;
    state.dragging = false;
    const img = document.getElementById('placeCropImg');
    if (img) img.removeAttribute('src');
  }

  function cancel() {
    const cb = state.onCancel;
    close();
    if (cb) cb();
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
    const slider = document.getElementById('placeCropSlider');
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
    const maxX = Math.max(0, (sw - VIEWPORT_W) / 2);
    const maxY = Math.max(0, (sh - VIEWPORT_H) / 2);
    state.x = Math.min(maxX, Math.max(-maxX, state.x));
    state.y = Math.min(maxY, Math.max(-maxY, state.y));
  }

  function cropRect() {
    const nw = state.img.naturalWidth;
    const nh = state.img.naturalHeight;
    const s = state.scale;
    const srcW = VIEWPORT_W / s;
    const srcH = VIEWPORT_H / s;
    const srcX = nw / 2 - srcW / 2 - state.x / s;
    const srcY = nh / 2 - srcH / 2 - state.y / s;
    return { srcX, srcY, srcW, srcH };
  }

  function updateView() {
    const img = document.getElementById('placeCropImg');
    if (!img || !state.img) return;
    const nw = state.img.naturalWidth;
    const nh = state.img.naturalHeight;
    const sw = nw * state.scale;
    const sh = nh * state.scale;
    const left = (VIEWPORT_W - sw) / 2 + state.x;
    const top = (VIEWPORT_H - sh) / 2 + state.y;
    img.style.width = `${sw}px`;
    img.style.height = `${sh}px`;
    img.style.left = `${left}px`;
    img.style.top = `${top}px`;
    updateCardPreview();
  }

  function updateCardPreview() {
    const canvas = document.getElementById('placeCropPreviewCanvas');
    if (!canvas || !state.img) return;
    const ctx = canvas.getContext('2d');
    const { srcX, srcY, srcW, srcH } = cropRect();
    ctx.clearRect(0, 0, PREVIEW_W, PREVIEW_H);
    ctx.drawImage(state.img, srcX, srcY, srcW, srcH, 0, 0, PREVIEW_W, PREVIEW_H);
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
    canvas.width = EXPORT_W;
    canvas.height = EXPORT_H;
    const ctx = canvas.getContext('2d');
    const { srcX, srcY, srcW, srcH } = cropRect();
    ctx.drawImage(state.img, srcX, srcY, srcW, srcH, 0, 0, EXPORT_W, EXPORT_H);

    const usePng = /^image\/png$/i.test(state.file.type);
    const mime = usePng ? 'image/png' : 'image/jpeg';
    const quality = usePng ? undefined : 0.9;
    canvas.toBlob((blob) => {
      if (!blob) {
        alert('Kırpma başarısız.');
        return;
      }
      const ext = usePng ? '.png' : '.jpg';
      const base = (state.file.name || 'place').replace(/\.[^.]+$/, '');
      const cropped = new File([blob], base + ext, { type: mime, lastModified: Date.now() });
      callback(cropped);
    }, mime, quality);
  }

  function save() {
    const btn = document.getElementById('placeCropSave');
    if (btn) btn.disabled = true;
    exportBlob((cropped) => {
      if (btn) btn.disabled = false;
      const cb = state.onSave;
      close();
      if (cb) cb(cropped);
    });
  }

  window.TL_PLACE_CROP = { open, close };
})();
