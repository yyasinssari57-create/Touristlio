/** Touristlio toast notifications — a11y-friendly */
window.TL_TOAST = (function () {
  let container;

  function ensureContainer() {
    if (container) return container;
    container = document.createElement('div');
    container.id = 'tlToastContainer';
    container.className = 'tl-toast-container';
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'true');
    document.body.appendChild(container);
    return container;
  }

  function show(message, type = 'info', duration = 4000) {
    const c = ensureContainer();
    const el = document.createElement('div');
    el.className = `tl-toast tl-toast-${type}`;
    el.setAttribute('role', 'alert');
    const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
    el.innerHTML = `<span class="tl-toast-icon" aria-hidden="true">${icons[type] || icons.info}</span><span class="tl-toast-msg">${escapeHtml(String(message))}</span>`;
    c.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    const hide = () => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    };
    el.addEventListener('click', hide);
    setTimeout(hide, duration);
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  return {
    show,
    success: (m, d) => show(m, 'success', d),
    error: (m, d) => show(m, 'error', d),
    info: (m, d) => show(m, 'info', d),
    warning: (m, d) => show(m, 'warning', d),
  };
})();
