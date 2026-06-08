/**
 * Do NOT issue HTTP 301 for www↔apex here. Cloudflare (or DNS) should pick one
 * canonical host; conflicting redirects cause blank pages and ERR_TOO_MANY_REDIRECTS.
 * The app accepts both apex and www via CORS/CSP connect-src.
 */
function canonicalHostMiddleware() {
  return (_req, _res, next) => next();
}

module.exports = { canonicalHostMiddleware };
