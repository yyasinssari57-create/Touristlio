const crypto = require('crypto');
const { fail } = require('../lib/apiResponse');
const { logAbnormal } = require('../lib/anti-bot-log');
const { csrfCookieOptions } = require('../lib/cookie-opts');

const CSRF_COOKIE = 'tl_csrf';
const CSRF_HEADER = 'x-csrf-token';
const TOKEN_BYTES = 32;

function siteOrigin() {
  const base = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
  try {
    return new URL(base).origin;
  } catch {
    return 'http://localhost:3000';
  }
}

function allowedOrigins(req) {
  const origins = new Set([siteOrigin()]);
  if (process.env.NODE_ENV !== 'production') {
    for (const base of [...origins]) {
      try {
        const u = new URL(base);
        if (u.hostname === 'localhost') {
          origins.add(`${u.protocol}//127.0.0.1${u.port ? `:${u.port}` : ''}`);
        } else if (u.hostname === '127.0.0.1') {
          origins.add(`${u.protocol}//localhost${u.port ? `:${u.port}` : ''}`);
        }
      } catch { /* ignore */ }
    }
  }
  const host = req.get('host');
  if (host) {
    // Same-origin requests are always allowed. Add both schemes so a request is
    // not falsely rejected when running behind a proxy that does not forward
    // x-forwarded-proto (browser sends https Origin, server sees http).
    origins.add(`http://${host}`);
    origins.add(`https://${host}`);
  }
  return origins;
}

function isAllowedOrigin(origin, referer, allowedSet) {
  if (origin && allowedSet.has(origin)) return true;
  if (referer) {
    try {
      return allowedSet.has(new URL(referer).origin);
    } catch {
      for (const allowed of allowedSet) {
        if (referer.startsWith(allowed)) return true;
      }
    }
  }
  return false;
}

/**
 * CSRF protection for state-changing API requests.
 * Skips GET/HEAD/OPTIONS and /api/auth/logout.
 */
function csrfProtection(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const p = req.path || '';
  if (p.endsWith('/logout') || req.originalUrl.endsWith('/logout')) return next();

  const allowed = allowedOrigins(req);
  const { origin, referer } = req.headers;

  if (isAllowedOrigin(origin, referer, allowed)) return next();
  logAbnormal({ kind: 'csrf_fail', req, extra: { reason: 'origin' } });
  return fail(res, 'İstek reddedildi (CSRF)', 403);
}

function cookieOpts() {
  return csrfCookieOptions();
}

function newCsrfToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('hex');
}

function isHexToken(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

function tokensEqual(a, b) {
  if (!a || !b) return false;
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) {
    crypto.timingSafeEqual(left, left);
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function readCsrfCookie(req) {
  const raw = req.cookies?.[CSRF_COOKIE];
  return isHexToken(raw) ? raw : '';
}

function tokenFromRequest(req) {
  const header = req.get(CSRF_HEADER) || req.get('X-CSRF-Token') || '';
  if (header) return String(header).trim();
  const body = req.body || {};
  if (body.csrfToken) return String(body.csrfToken).trim();
  if (body._csrf) return String(body._csrf).trim();
  return '';
}

/**
 * Issue or reuse a double-submit CSRF cookie. Returns the token.
 */
function issueCsrfCookie(req, res) {
  const existing = readCsrfCookie(req);
  if (existing) {
    req.csrfToken = existing;
    return existing;
  }
  const token = newCsrfToken();
  res.cookie(CSRF_COOKIE, token, cookieOpts());
  req.csrfToken = token;
  return token;
}

/**
 * Double-submit CSRF token check for Tiola mutating requests.
 * Requires X-CSRF-Token (or body csrfToken) to match the tl_csrf cookie.
 */
function csrfTokenRequired(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const cookieToken = readCsrfCookie(req);
  const sent = tokenFromRequest(req);
  if (!cookieToken || !sent || !tokensEqual(cookieToken, sent)) {
    logAbnormal({
      kind: 'csrf_fail',
      req,
      extra: {
        reason: !cookieToken ? 'missing_cookie' : (!sent ? 'missing_token' : 'mismatch'),
      },
    });
    return fail(res, 'İstek reddedildi (CSRF)', 403);
  }
  return next();
}

function csrfTokenHandler(req, res) {
  const csrfToken = issueCsrfCookie(req, res);
  res.json({ csrfToken });
}

module.exports = {
  csrfProtection,
  csrfTokenRequired,
  csrfTokenHandler,
  issueCsrfCookie,
  tokenFromRequest,
  tokensEqual,
  siteOrigin,
  CSRF_COOKIE,
};
