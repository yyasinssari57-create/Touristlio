/**
 * www → apex normalization is handled client-side in public HTML (inline script
 * + send-public-html.js injection). Do NOT issue HTTP 301 here: Cloudflare/Render
 * also redirect apex↔www and a server 301 creates ERR_TOO_MANY_REDIRECTS on / and /admin.
 * /api/* is unaffected; CORS accepts both apex and www origins.
 */
function canonicalHostMiddleware() {
  return (_req, _res, next) => next();
}

module.exports = { canonicalHostMiddleware };
