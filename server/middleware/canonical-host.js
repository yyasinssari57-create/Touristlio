/**
 * Redirect www → apex for HTML/assets only. Never redirect /api or OPTIONS
 * (preflight must not receive 301/302).
 */
function canonicalHostMiddleware() {
  const raw = (process.env.SITE_URL || '').replace(/\/$/, '');
  if (!raw) return (_req, _res, next) => next();

  let canonicalHost;
  try {
    canonicalHost = new URL(raw).hostname.toLowerCase();
  } catch {
    return (_req, _res, next) => next();
  }

  if (!canonicalHost || canonicalHost.startsWith('www.')) {
    return (_req, _res, next) => next();
  }

  const wwwHost = `www.${canonicalHost}`;

  return (req, res, next) => {
    if (req.method === 'OPTIONS') return next();
    if (req.path.startsWith('/api/')) return next();

    const host = (req.headers.host || '').split(':')[0].toLowerCase();
    if (host !== wwwHost) return next();

    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    return res.redirect(301, `${proto}://${canonicalHost}${req.originalUrl}`);
  };
}

module.exports = { canonicalHostMiddleware };
