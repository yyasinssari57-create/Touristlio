const { fail } = require('../lib/apiResponse');

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
  return fail(res, 'İstek reddedildi (CSRF)', 403);
}

module.exports = { csrfProtection, siteOrigin };
