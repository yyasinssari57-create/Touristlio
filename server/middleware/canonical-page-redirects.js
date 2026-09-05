/**
 * Collapse duplicate public URLs to the sitemap/footer canonical.
 * /en/* is rewritten before this runs; re-prefix from req.tlLang.
 */

const PAGE_REDIRECTS = {
  '/index.html': '/',
  '/search.html': '/search',
  '/login.html': '/login',
  '/register.html': '/register',
  '/admin.html': '/admin',
  '/profile.html': '/profile',
  '/verify-email.html': '/verify-email',
  '/reset-password.html': '/reset-password',
  '/about': '/legal/about.html',
  '/contact': '/legal/contact.html',
  '/privacy': '/legal/privacy.html',
  '/terms': '/legal/terms.html',
  '/kvkk': '/legal/kvkk.html',
  '/legal/about': '/legal/about.html',
  '/legal/contact': '/legal/contact.html',
  '/legal/privacy': '/legal/privacy.html',
  '/legal/terms': '/legal/terms.html',
  '/legal/kvkk': '/legal/kvkk.html',
};

function stripTrailingSlash(pathname) {
  const p = String(pathname || '/').split('?')[0];
  if (p.length > 1 && p.endsWith('/')) return p.slice(0, -1);
  return p || '/';
}

function lookupRedirect(pathname) {
  return PAGE_REDIRECTS[stripTrailingSlash(pathname)] || null;
}

function localizeCanonicalPath(target, lang) {
  const path = target || '/';
  if (lang !== 'en') return path;
  if (path === '/') return '/en/';
  return `/en${path}`;
}

function querySuffix(req) {
  const raw = String((req && (req.originalUrl || req.url)) || '');
  const i = raw.indexOf('?');
  return i === -1 ? '' : raw.slice(i);
}

function canonicalPageTarget(pathname, lang, query) {
  const target = lookupRedirect(pathname);
  if (!target) return null;
  return `${localizeCanonicalPath(target, lang)}${query || ''}`;
}

function canonicalPageRedirectMiddleware() {
  return async (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const dest = canonicalPageTarget(req.path, req.tlLang, querySuffix(req));
    if (!dest) return next();
    return res.redirect(301, dest);
  };
}

module.exports = {
  PAGE_REDIRECTS,
  lookupRedirect,
  localizeCanonicalPath,
  canonicalPageTarget,
  canonicalPageRedirectMiddleware,
};
