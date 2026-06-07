const fs = require('fs');
const path = require('path');
const { getAppVersion } = require('./app-version');

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

/** Break www↔apex redirect loops when Cloudflare also redirects the other way. */
const WWW_REDIRECT_SNIPPET = `<script>(function(){var h=location.hostname;if(h.indexOf('www.')!==0)return;var k='tl-www-redir',n=+(sessionStorage.getItem(k)||0);if(n>2){sessionStorage.removeItem(k);return;}sessionStorage.setItem(k,String(n+1));location.replace(location.protocol+'//'+h.slice(4)+location.pathname+location.search+location.hash);})();</script>`;

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
};

function injectWwwRedirect(html) {
  if (html.includes("host.indexOf('www.')")) return html;
  if (!/<head[\s>]/i.test(html)) return html;
  return html.replace(/<head([^>]*)>/i, `<head$1>\n${WWW_REDIRECT_SNIPPET}`);
}

function injectAppVersion(html) {
  return injectWwwRedirect(html.replace(/__APP_VERSION__/g, getAppVersion()));
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

function sendPublicHtml(res, publicDir, relativePath) {
  const html = readPublicHtml(publicDir, relativePath);
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
  injectWwwRedirect,
  WWW_REDIRECT_SNIPPET,
  HTML_PAGE_ROUTES,
  readPublicHtml,
};
