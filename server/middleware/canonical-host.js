/**
 * v2 KRİTİK-4 / v1 KRİTİK-7:
 * - apex touristlio.com → 301 https://www.touristlio.com + same path
 * - production HTTP → HTTPS (X-Forwarded-Proto)
 *
 * Loop-safe:
 * - Apex redirect only when the public host is exactly `touristlio.com`
 *   (not www, not Render, not other hosts).
 * - HTTPS upgrade only in production, only when proto is explicitly http.
 * - Skips localhost / loopback.
 * - DISABLE_WWW_REDIRECT=true kills apex→www.
 * - DISABLE_HTTPS_REDIRECT=true kills HTTP→HTTPS.
 * - Reads X-Forwarded-Host / X-Forwarded-Proto behind Render/Cloudflare.
 *
 * Do not also enable Cloudflare “Redirect www to root” (www→apex). That plus
 * this middleware causes ERR_TOO_MANY_REDIRECTS. One direction only: apex→www.
 * Cloudflare SSL/TLS should be Full (or Full strict), not Flexible.
 *
 * Mount this middleware first (before helmet/cors/static).
 */

const APEX_HOST = 'touristlio.com';
const WWW_HOST = 'www.touristlio.com';
const CANONICAL_ORIGIN = 'https://www.touristlio.com';

function firstHeaderValue(value) {
  if (!value) return '';
  return String(value).split(',')[0].trim();
}

function stripHostPort(raw) {
  let h = String(raw || '').trim().toLowerCase();
  if (!h) return '';
  if (h.startsWith('[')) {
    const end = h.indexOf(']');
    if (end !== -1) h = h.slice(1, end);
  } else {
    const colon = h.lastIndexOf(':');
    if (colon !== -1 && h.indexOf(':') === colon) h = h.slice(0, colon);
  }
  return h.replace(/\.$/, '');
}

function hostnameFromReq(req) {
  const xfHost = firstHeaderValue(req.get && req.get('x-forwarded-host'));
  const hostHeader = firstHeaderValue((req.get && req.get('host')) || req.hostname || '');
  return stripHostPort(xfHost || hostHeader);
}

function protoFromReq(req) {
  const xf = firstHeaderValue(req.get && req.get('x-forwarded-proto'));
  if (xf) return xf.toLowerCase();
  if (req.secure) return 'https';
  const proto = String(req.protocol || '').toLowerCase();
  return proto || 'http';
}

function isLocalHostname(host) {
  if (!host) return true;
  return (
    host === 'localhost'
    || host === '127.0.0.1'
    || host === '0.0.0.0'
    || host === '::1'
    || host.endsWith('.localhost')
    || host.endsWith('.local')
  );
}

function wwwRedirectDisabled() {
  return String(process.env.DISABLE_WWW_REDIRECT || '').toLowerCase() === 'true';
}

function httpsRedirectDisabled() {
  return String(process.env.DISABLE_HTTPS_REDIRECT || '').toLowerCase() === 'true';
}

function shouldRedirectApexToWww(host) {
  if (wwwRedirectDisabled()) return false;
  if (isLocalHostname(host)) return false;
  if (host === WWW_HOST) return false;
  return host === APEX_HOST;
}

function shouldRedirectHttpToHttps(req, host) {
  if (process.env.NODE_ENV !== 'production') return false;
  if (httpsRedirectDisabled()) return false;
  if (isLocalHostname(host)) return false;
  return protoFromReq(req) === 'http';
}

function canonicalTarget(originalUrl) {
  const pathAndQuery = originalUrl && originalUrl.startsWith('/') ? originalUrl : '/';
  return `${CANONICAL_ORIGIN}${pathAndQuery}`;
}

function httpsTarget(host, originalUrl) {
  const pathAndQuery = originalUrl && originalUrl.startsWith('/') ? originalUrl : '/';
  const safeHost = host === APEX_HOST ? WWW_HOST : host;
  return `https://${safeHost}${pathAndQuery}`;
}

function canonicalHostMiddleware() {
  return async (req, res, next) => {
    const host = hostnameFromReq(req);
    const toWww = shouldRedirectApexToWww(host);
    const toHttps = shouldRedirectHttpToHttps(req, host);
    if (!toWww && !toHttps) return next();
    if (toWww) return res.redirect(301, canonicalTarget(req.originalUrl));
    return res.redirect(301, httpsTarget(host, req.originalUrl));
  };
}

module.exports = {
  canonicalHostMiddleware,
  hostnameFromReq,
  protoFromReq,
  shouldRedirectApexToWww,
  shouldRedirectHttpToHttps,
  canonicalTarget,
  httpsTarget,
  isLocalHostname,
  APEX_HOST,
  WWW_HOST,
  CANONICAL_ORIGIN,
};
