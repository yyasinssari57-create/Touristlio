const fs = require('fs');
const path = require('path');
const { getAppVersion } = require('./app-version');

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

const WWW_REDIRECT_SNIPPET = `<script>(function(){var h=location.hostname;if(h.indexOf('www.')===0)location.replace(location.protocol+'//'+h.slice(4)+location.pathname+location.search+location.hash);})();</script>`;

function injectWwwRedirect(html) {
  if (html.includes("host.indexOf('www.')")) return html;
  if (!/<head[\s>]/i.test(html)) return html;
  return html.replace(/<head([^>]*)>/i, `<head$1>\n${WWW_REDIRECT_SNIPPET}`);
}

function injectAppVersion(html) {
  return injectWwwRedirect(html.replace(/__APP_VERSION__/g, getAppVersion()));
}

function sendPublicHtml(res, publicDir, relativePath) {
  const filePath = path.join(publicDir, relativePath);
  const html = injectAppVersion(fs.readFileSync(filePath, 'utf8'));
  res.set({
    ...NO_CACHE_HEADERS,
    'Content-Type': 'text/html; charset=utf-8',
  });
  res.send(html);
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
      res.set(NO_CACHE_HEADERS);
      return res.status(200).end();
    }
    return sendPublicHtml(res, root, rel);
  };
}

module.exports = {
  sendPublicHtml,
  publicHtmlMiddleware,
  NO_CACHE_HEADERS,
  injectAppVersion,
  injectWwwRedirect,
  WWW_REDIRECT_SNIPPET,
};
