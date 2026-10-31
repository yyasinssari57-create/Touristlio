/**
 * Shared cookie flags. Gemini Faz 1: HttpOnly + Secure + SameSite=Strict.
 * Same-site login/admin POST and same-origin XHR still send Strict cookies.
 * OAuth is not used. COOKIE_SAMESITE can override (lax / none / strict).
 */

const ALLOWED_SAMESITE = new Set(['strict', 'lax', 'none']);
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

function cookieSameSite() {
  const raw = String(process.env.COOKIE_SAMESITE || 'strict').toLowerCase();
  return ALLOWED_SAMESITE.has(raw) ? raw : 'strict';
}

function cookieSecure() {
  if (cookieSameSite() === 'none') return true;
  return process.env.COOKIE_SECURE === 'true'
    || (process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false');
}

function baseCookieOptions(overrides = {}) {
  return {
    secure: cookieSecure(),
    sameSite: cookieSameSite(),
    path: '/',
    ...overrides,
  };
}

/**
 * Auth JWT (tl_token). Matches signToken()'s 30d expiresIn (server/auth.js)
 * — keep these two in sync; a cookie that outlives or expires before the
 * JWT's own `exp` claim causes confusing "logged in but every request
 * 401s" (cookie > JWT) or "logged out early for no reason" (cookie < JWT)
 * bugs.
 */
function authCookieOptions(overrides = {}) {
  return baseCookieOptions({
    httpOnly: true,
    maxAge: MONTH_MS,
    ...overrides,
  });
}

/** Double-submit CSRF (tl_csrf) — readable by JS on purpose. Kept in sync with authCookieOptions. */
function csrfCookieOptions(overrides = {}) {
  return baseCookieOptions({
    httpOnly: false,
    maxAge: MONTH_MS,
    ...overrides,
  });
}

/** First-party analytics session (tl_sid). XHR from the page is same-site. */
function sessionCookieOptions(overrides = {}) {
  return baseCookieOptions({
    httpOnly: true,
    maxAge: MONTH_MS,
    ...overrides,
  });
}

module.exports = {
  cookieSameSite,
  cookieSecure,
  authCookieOptions,
  csrfCookieOptions,
  sessionCookieOptions,
};
