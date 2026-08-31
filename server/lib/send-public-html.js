const fs = require('fs');
const path = require('path');
const { getAppVersion } = require('./app-version');

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

/** Extensionless public HTML routes (must run before express.static). */
const HTML_PAGE_ROUTES = {
  '/admin': 'admin.html',
  '/login': 'login.html',
  '/register': 'register.html',
  '/profile': 'profile.html',
  '/verify-email': 'verify-email.html',
  '/reset-password': 'reset-password.html',
  '/search': 'search.html',
  '/gezilecek-yerler': 'index.html',
  '/404': '404.html',
};

function injectAppVersion(html) {
  return html.replace(/__APP_VERSION__/g, getAppVersion());
}

function readPublicHtml(publicDir, relativePath) {
  const filePath = path.join(publicDir, relativePath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing public HTML: ${relativePath}`);
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  if (!raw.trim()) {
    throw new Error(`Empty public HTML: ${relativePath}`);
  }
  return injectAppVersion(raw);
}

function sendPublicHtml(res, publicDir, relativePath, seo = {}) {
  let html = readPublicHtml(publicDir, relativePath);
  const req = res.req;
  const pathname = (req && (req.originalUrl || req.url) || '/').split('?')[0];
  const { injectSeoHead, langFromPath } = require('./seo');
  const { autoJsonLd } = require('./jsonld');
  const noindex = /login|register|profile|verify-email|reset-password|admin|404\.html|500\.html/.test(relativePath);
  const lang = seo.lang || req?.tlLang || langFromPath(pathname);
  const jsonLd = seo.jsonLd != null ? seo.jsonLd : autoJsonLd(pathname, relativePath, lang);
  html = injectSeoHead(html, {
    pathname,
    lang,
    noindex,
    ...seo,
    jsonLd,
  });
  res.set({
    ...NO_CACHE_HEADERS,
    'Content-Type': 'text/html; charset=utf-8',
  });
  res.send(html);
}

/** Serve /admin, /login, etc. before static — avoids empty or wrong fallthrough. */
function htmlPageRoutesMiddleware(publicDir) {
  const root = path.resolve(publicDir);
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();

    const routePath = req.path.endsWith('/') && req.path.length > 1
      ? req.path.slice(0, -1)
      : req.path;
    const relativePath = HTML_PAGE_ROUTES[routePath];
    if (!relativePath) return next();

    const filePath = path.join(root, relativePath);
    if (!fs.existsSync(filePath)) return next();

    if (req.method === 'HEAD') {
      const size = Buffer.byteLength(readPublicHtml(root, relativePath), 'utf8');
      res.set({
        ...NO_CACHE_HEADERS,
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': String(size),
      });
      return res.status(200).end();
    }

    return sendPublicHtml(res, root, relativePath);
  };
}

/** Intercept direct *.html requests so asset placeholders are resolved before static. */
function publicHtmlMiddleware(publicDir) {
  const root = path.resolve(publicDir);
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (!req.path.endsWith('.html')) return next();

    const rel = decodeURIComponent(req.path.replace(/^\//, ''));
    const abs = path.resolve(path.join(root, rel));
    if (abs !== root && !abs.startsWith(`${root}${path.sep}`)) return next();
    if (!fs.existsSync(abs)) return next();

    if (req.method === 'HEAD') {
      const size = Buffer.byteLength(readPublicHtml(root, rel), 'utf8');
      res.set({
        ...NO_CACHE_HEADERS,
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': String(size),
      });
      return res.status(200).end();
    }
    return sendPublicHtml(res, root, rel);
  };
}

module.exports = {
  sendPublicHtml,
  htmlPageRoutesMiddleware,
  publicHtmlMiddleware,
  NO_CACHE_HEADERS,
  injectAppVersion,
  HTML_PAGE_ROUTES,
  readPublicHtml,
};
