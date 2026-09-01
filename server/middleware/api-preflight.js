const { parseCorsOrigins, isCorsOriginAllowed } = require('../lib/cors-origins');

/**
 * Answer OPTIONS for /api/* with 204 before any host redirect or rate limit.
 * Browsers reject preflight responses that are 3xx redirects.
 */
function apiPreflightMiddleware(corsOrigins) {
  return async (req, res, next) => {
    if (req.method !== 'OPTIONS') return next();
    const path = req.path || req.originalUrl || '';
    if (!path.startsWith('/api')) return next();

    const origin = req.headers.origin;
    if (isCorsOriginAllowed(origin, corsOrigins, req.get('host'))) {
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      }
      res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        req.headers['access-control-request-headers'] || 'Content-Type, Authorization, X-CSRF-Token',
      );
      res.setHeader('Access-Control-Max-Age', '86400');
      res.setHeader('Vary', 'Origin');
    }
    return res.status(204).end();
  };
}

function createApiPreflightMiddleware() {
  return apiPreflightMiddleware(parseCorsOrigins(process.env.CORS_ORIGIN));
}

module.exports = { apiPreflightMiddleware, createApiPreflightMiddleware };
