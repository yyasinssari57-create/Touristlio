/**
 * Shared auth error + session helpers (login / register / reset / profile).
 */
(function (global) {
  function parseError(data, fallback) {
    const err = data && data.error;
    if (typeof err === 'string' && err) return err;
    if (err && typeof err === 'object') {
      if (typeof err.message === 'string' && err.message) return err.message;
      if (Array.isArray(err) && err[0] && err[0].msg) return err[0].msg;
    }
    if (Array.isArray(data && data.errors) && data.errors[0] && data.errors[0].msg) {
      return data.errors[0].msg;
    }
    return fallback || 'İstek başarısız';
  }

  function show(el, msg) {
    if (!el) return;
    el.hidden = false;
    el.style.display = '';
    el.textContent = msg || '';
    el.setAttribute('role', 'alert');
  }

  function hide(el) {
    if (!el) return;
    el.hidden = true;
    el.textContent = '';
  }

  function isSessionExpired(res, data) {
    if (!res || res.status !== 401) return false;
    if (data && data.sessionExpired === true) return true;
    return /oturum süresi doldu/i.test(parseError(data, ''));
  }

  function clearLocalSession() {
    try {
      localStorage.removeItem('tl_user');
      localStorage.removeItem('tl_token');
    } catch { /* ignore */ }
  }

  global.TL_AUTH = {
    parseError,
    show,
    hide,
    isSessionExpired,
    clearLocalSession,
  };
})(typeof window !== 'undefined' ? window : globalThis);
