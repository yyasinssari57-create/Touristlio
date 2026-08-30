/**
 * KRİTİK-7: apex touristlio.com → 301 https://www.touristlio.com + same path.
 *
 * Loop-safe:
 * - Redirects only when the public host is exactly apex `touristlio.com`
 *   (not www, not Render, not other hosts).
 * - Skips localhost / loopback.
 * - Skips when DISABLE_WWW_REDIRECT=true (emergency kill switch if Cloudflare
 *   already 301s the other direction).
 * - Reads X-Forwarded-Host / X-Forwarded-Proto behind Render/Cloudflare.
 *
 * Do not also enable Cloudflare “Redirect www to root” (www→apex). That plus
 * this middleware causes ERR_TOO_MANY_REDIRECTS. One direction only: apex→www.
 * Cloudflare SSL/TLS should be Full (or Full strict), not Flexible.
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

function redirectDisabled() {
  return String(process.env.DISABLE_WWW_REDIRECT || '').toLowerCase() === 'true';
}

function shouldRedirectApexToWww(host) {
  if (redirectDisabled()) return false;
  if (isLocalHostname(host)) return false;
  if (host === WWW_HOST) return false;
  return host === APEX_HOST;
}

function canonicalTarget(originalUrl) {
  const pathAndQuery = originalUrl && originalUrl.startsWith('/') ? originalUrl : '/';
  return `${CANONICAL_ORIGIN}${pathAndQuery}`;
}

function canonicalHostMiddleware() {
  return (req, res, next) => {
    const host = hostnameFromReq(req);
    if (!shouldRedirectApexToWww(host)) return next();
    return res.redirect(301, canonicalTarget(req.originalUrl));
  };
}

module.exports = {
  canonicalHostMiddleware,
  hostnameFromReq,
  shouldRedirectApexToWww,
  canonicalTarget,
  isLocalHostname,
  APEX_HOST,
  WWW_HOST,
  CANONICAL_ORIGIN,
};
