const fs = require('fs');
const path = require('path');
const { getAppVersion } = require('./app-version');
const { nonceFromRes, injectNonce } = require('../middleware/csp-nonce');

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

/** Extensionless public HTML routes (must run before express.static). */
const HTML_PAGE_ROUTES = {
  '/': 'index.html',
  '/admin': 'admin.html',
  '/login': 'login.html',
  '/register': 'register.html',
  '/profile': 'profile.html',
  '/verify-email': 'verify-email.html',
  '/reset-password': 'reset-password.html',
  '/search': 'search.html',
  '/explore': 'index.html',
  '/blog': 'index.html',
  '/gezilecek-yerler': 'index.html',
  '/404': '404.html',
  '/about': 'legal/about.html',
  '/contact': 'legal/contact.html',
  '/privacy': 'legal/privacy.html',
  '/terms': 'legal/terms.html',
  '/kvkk': 'legal/kvkk.html',
  '/legal/about': 'legal/about.html',
  '/legal/contact': 'legal/contact.html',
  '/legal/privacy': 'legal/privacy.html',
  '/legal/kvkk': 'legal/kvkk.html',
  '/legal/terms': 'legal/terms.html',
};

function injectAppVersion(html) {
  return html.replace(/__APP_VERSION__/g, getAppVersion());
}

function injectClientErrorBoundary(html) {
  const isProd = process.env.NODE_ENV === 'production';
  let next = html;
  if (!/\sdata-tl-dev=/.test(next)) {
    next = next.replace(/<html\b([^>]*)>/i, (m, attrs) => `<html${attrs} data-tl-dev="${isProd ? '0' : '1'}">`);
  }
  if (!next.includes('/js/error-boundary.js')) {
    const tag = `<script src="/js/error-boundary.js?v=${getAppVersion()}"></script>\n`;
    if (/<head[^>]*>/i.test(next)) {
      next = next.replace(/<head[^>]*>/i, (open) => `${open}\n${tag}`);
    } else {
      next = tag + next;
    }
  }
  return next;
}

function injectErrorDetail(html, errorDetail) {
  const token = '<!-- TL_ERROR_DETAIL -->';
  if (!html.includes(token)) return html;
  const isProd = process.env.NODE_ENV === 'production';
  if (!errorDetail || isProd) return html.replace(token, '');
  const text = String(errorDetail).slice(0, 4000)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return html.replace(token, `<pre class="tl-error-detail" id="tl-server-error-detail">${text}</pre>`);
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

function injectAnalyticsScripts(html, relativePath) {
  const rel = String(relativePath || '');
  if (/admin\.html$/i.test(rel)) return html;
  if (html.includes('/js/analytics.js')) return html;
  const v = getAppVersion();
  const tags = `<script src="/js/analytics.js?v=${v}"></script>\n<script src="/js/cookie-banner.js?v=${v}"></script>\n`;
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${tags}</body>`);
  }
  return html + tags;
}

function cssUrlValue(url) {
  return String(url || '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/</g, '');
}

function injectHeroBackground(html, url) {
  const src = String(url || '').trim();
  if (!src) return html;
  if (!/^https?:\/\//i.test(src) && !src.startsWith('/')) return html;
  const safe = cssUrlValue(src);
  const css = `<style id="tl-hero-bg">.hbg{background-image:url("${safe}") !important;}</style>`;
  if (/id="tl-hero-bg"/.test(html)) return html;
  let next = html;
  if (/<\/head>/i.test(next)) next = next.replace(/<\/head>/i, `${css}</head>`);
  else next = css + next;
  // Admin-set hero: keep that one image, do not rotate Unsplash slides.
  if (/class="hero-carousel"/.test(next) && !/\bdata-hero-custom=/.test(next)) {
    next = next.replace('class="hero-carousel"', 'class="hero-carousel" data-hero-custom="1"');
  }
  return next;
}

async function sendPublicHtml(res, publicDir, relativePath, seo = {}) {
  let html = readPublicHtml(publicDir, relativePath);
  html = injectClientErrorBoundary(html);
  html = injectAnalyticsScripts(html, relativePath);
  html = injectErrorDetail(html, seo.errorDetail);
  const req = res.req;
  const pathname = (req && (req.originalUrl || req.url) || '/').split('?')[0];
  const { injectSeoHead, langFromPath } = require('./seo');
  const { autoJsonLd } = require('./jsonld');
  const noindex = /login|register|profile|verify-email|reset-password|admin|404\.html|500\.html/.test(relativePath);
  const lang = seo.lang || req?.tlLang || langFromPath(pathname);
  const seoRest = { ...seo };
  delete seoRest.errorDetail;
  if (relativePath === 'index.html') {
    try {
      const settingsService = require('../modules/settings/settings.service');
      const pub = await settingsService.getPublic();
      if (pub.heroImageUrl) {
        html = injectHeroBackground(html, pub.heroImageUrl);
        if (!seoRest.image) seoRest.image = pub.heroImageUrl;
      }
    } catch { /* default CSS hero */ }
  }
  const jsonLd = seo.jsonLd != null ? seo.jsonLd : autoJsonLd(pathname, relativePath, lang);
  html = injectSeoHead(html, {
    pathname,
    lang,
    noindex,
    ...seoRest,
    jsonLd,
  });
  // Last step: every inline <script> above must carry this request's nonce.
  html = injectNonce(html, nonceFromRes(res));
  res.set({
    ...NO_CACHE_HEADERS,
    'Content-Type': 'text/html; charset=utf-8',
  });
  res.send(html);
}

/** Serve /admin, /login, etc. before static — avoids empty or wrong fallthrough. */
function htmlPageRoutesMiddleware(publicDir) {
  const root = path.resolve(publicDir);
  return async (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();

    const routePath = req.path.endsWith('/') && req.path.length > 1
      ? req.path.slice(0, -1)
      : req.path;
    const relativePath = HTML_PAGE_ROUTES[routePath];
    if (!relativePath) return next();

    const filePath = path.join(root, relativePath);
    if (!fs.existsSync(filePath)) return next();

    if (req.method === 'HEAD') {
      // Length is approximate for HEAD (SEO/nonce injection happens on GET).
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
  return async (req, res, next) => {
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
  injectClientErrorBoundary,
  injectAnalyticsScripts,
  injectErrorDetail,
  injectNonce,
  HTML_PAGE_ROUTES,
  readPublicHtml,
};
