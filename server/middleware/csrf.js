const { fail } = require('../lib/apiResponse');

function siteOrigin() {
  const base = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
  try {
    return new URL(base).origin;
  } catch {
    return 'http://localhost:3000';
  }
}

function isAllowedOrigin(origin, referer, allowed) {
  if (origin && origin === allowed) return true;
  if (referer) {
    try {
      return new URL(referer).origin === allowed;
    } catch {
      return referer.startsWith(allowed);
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

  const allowed = siteOrigin();
  const { origin, referer } = req.headers;

  if (isAllowedOrigin(origin, referer, allowed)) return next();
  return fail(res, 'İstek reddedildi (CSRF)', 403);
}

module.exports = { csrfProtection, siteOrigin };
