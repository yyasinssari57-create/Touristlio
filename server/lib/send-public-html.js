const fs = require('fs');
const path = require('path');
const { getAppVersion } = require('./app-version');
const { nonceFromRes, injectNonce } = require('../middleware/csp-nonce');
const { buildEarlyBootScript } = require('../../public/js/locale-resolve');
const { decoratePasswordPolicyHtml } = require('./password-policy');

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
  // /blog is app.get('/blog') in index.js (V5 Adım 8 empty-EN noindex).
  '/gezilecek-yerler': 'index.html',
  '/404': '404.html',
  '/legal/about.html': 'legal/about.html',
  '/legal/contact.html': 'legal/contact.html',
  '/legal/privacy.html': 'legal/privacy.html',
  '/legal/kvkk.html': 'legal/kvkk.html',
  '/legal/terms.html': 'legal/terms.html',
};

function injectAppVersion(html) {
  return html.replace(/__APP_VERSION__/g, getAppVersion());
}

/** Generated from locale-resolve.js so the data-tl-lang-boot script cannot drift. */
const EARLY_LANG_BOOT = buildEarlyBootScript();

function injectEarlyLangBoot(html) {
  if (!html) return html;
  const stripped = html.replace(/<script\b[^>]*\bdata-tl-lang-boot\b[^>]*>[\s\S]*?<\/script>/gi, '');
  if (/<head[^>]*>/i.test(stripped)) {
    return stripped.replace(/<head[^>]*>/i, (open) => `${open}\n${EARLY_LANG_BOOT}`);
  }
  return EARLY_LANG_BOOT + stripped;
}

function injectLocaleModule(html) {
  if (!html) return html;
  let next = html;
  if (!next.includes('/js/locale-resolve.js')) {
    const tag = `<script src="/js/locale-resolve.js?v=${getAppVersion()}"></script>\n`;
    if (/<script\s+src="\/js\/i18n\.js/i.test(next)) {
      next = next.replace(/<script\s+src="\/js\/i18n\.js/i, `${tag}<script src="/js/i18n.js`);
    }
  }
  if (!next.includes('/js/place-count-copy.js') && /\/js\/i18n\.js/i.test(next)) {
    const tag = `<script src="/js/place-count-copy.js?v=${getAppVersion()}"></script>\n`;
    next = next.replace(/<script\s+src="\/js\/i18n\.js/i, `${tag}<script src="/js/i18n.js`);
  }
  return next;
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

/**
 * Status sendPublicHtml would send. HEAD must match GET.
 * 404.html is a real not-found response unless a handler already set another code.
 */
function publicHtmlStatus(relativePath, currentStatus) {
  const code = Number(currentStatus);
  const status = Number.isInteger(code) && code >= 100 && code <= 599 ? code : 200;
  if (relativePath === '404.html' && status === 200) return 404;
  return status;
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

/** Existing round mark (logo-round). Injected so every public HTML page shares one tab icon. */
const FAVICON_LINKS = [
  '<link rel="icon" href="/favicon.ico" sizes="32x32"/>',
  '<link rel="icon" href="/favicon.svg" type="image/svg+xml"/>',
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png"/>',
].join('\n');

function injectFaviconLinks(html) {
  if (/<link\b[^>]*\brel=["'](?:shortcut icon|icon|apple-touch-icon)["']/i.test(html)) {
    return html;
  }
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${FAVICON_LINKS}\n</head>`);
  }
  return `${FAVICON_LINKS}\n${html}`;
}

function htmlAttr(url) {
  return String(url)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
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
  // The visible first slide is this URL. Point the high-priority preload at it
  // so the unused /images/hero.webp file is not downloaded as well.
  const preload = `<link rel="preload" as="image" href="${htmlAttr(src)}" fetchpriority="high"/>`;
  if (/<link rel="preload" as="image" href="\/images\/hero\.webp"/.test(next)) {
    next = next.replace(/<link rel="preload" as="image" href="\/images\/hero\.webp"[^>]*>/, preload);
  }
  if (/<\/head>/i.test(next)) return next.replace(/<\/head>/i, `${css}</head>`);
  return css + next;
}

async function sendPublicHtml(res, publicDir, relativePath, seo = {}) {
  let html = readPublicHtml(publicDir, relativePath);
  html = injectEarlyLangBoot(html);
  html = injectLocaleModule(html);
  html = decoratePasswordPolicyHtml(html);
  html = injectClientErrorBoundary(html);
  html = injectAnalyticsScripts(html, relativePath);
  html = injectErrorDetail(html, seo.errorDetail);
  const req = res.req;
  const pathname = (req && (req.originalUrl || req.url) || '/').split('?')[0];
  const { injectSeoHead, langFromPath, shouldNoindexDocument } = require('./seo');
  const { autoJsonLd } = require('./jsonld');
  const lang = seo.lang || req?.tlLang || langFromPath(pathname);
  const beforeInject = seo.beforeInject;
  const seoRest = { ...seo };
  delete seoRest.errorDetail;
  delete seoRest.beforeInject;
  if (typeof beforeInject === 'function') html = beforeInject(html);
  if (relativePath === '404.html') {
    res.status(publicHtmlStatus(relativePath, res.statusCode));
    if (!seoRest.title) {
      seoRest.title = lang === 'en' ? 'Page not found — Touristlio' : 'Sayfa bulunamadı — Touristlio';
    }
    if (!seoRest.description) {
      seoRest.description = lang === 'en'
        ? 'This page does not exist on Touristlio.'
        : 'Bu sayfa Touristlio’da yok.';
    }
  }
  if (relativePath === '500.html' && !seoRest.title) {
    seoRest.title = lang === 'en' ? 'Server error — Touristlio' : 'Sunucu hatası — Touristlio';
  }
  if (relativePath === 'index.html') {
    try {
      const settingsService = require('../modules/settings/settings.service');
      const pub = await settingsService.getPublic();
      if (pub.heroImageUrl) {
        html = injectHeroBackground(html, pub.heroImageUrl);
        if (!seoRest.image) seoRest.image = pub.heroImageUrl;
      }
    } catch { /* default CSS hero */ }
    try {
      const { normalizePath, generateMeta } = require('./seo');
      const kindPath = normalizePath(pathname);
      const kind = kindPath === '/explore' ? 'explore' : (kindPath === '/' ? 'home' : '');
      if (kind && !seoRest.description) {
        const { getHomepageStats } = require('./stats-cache');
        const counts = await getHomepageStats();
        const meta = generateMeta(kind, { counts }, lang);
        if (!seoRest.title) seoRest.title = meta.title;
        if (counts && Number(counts.places) > 0) seoRest.description = meta.description;
      }
    } catch { /* static fallback description */ }
  }
  const jsonLd = seo.jsonLd != null ? seo.jsonLd : autoJsonLd(pathname, relativePath, lang);
  const noindex = shouldNoindexDocument(relativePath, pathname, req?.query) || seoRest.noindex === true;
  html = injectSeoHead(html, {
    pathname,
    lang,
    ...seoRest,
    noindex,
    jsonLd,
  });
  html = injectFaviconLinks(html);
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
      return endPublicHtmlHead(res, root, relativePath);
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
      return endPublicHtmlHead(res, root, rel);
    }
    return sendPublicHtml(res, root, rel);
  };
}

/** HEAD skips SEO/nonce injection; status still matches GET. Length is the raw file. */
function endPublicHtmlHead(res, publicDir, relativePath) {
  const size = Buffer.byteLength(readPublicHtml(publicDir, relativePath), 'utf8');
  res.set({
    ...NO_CACHE_HEADERS,
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': String(size),
  });
  return res.status(publicHtmlStatus(relativePath, res.statusCode)).end();
}

module.exports = {
  sendPublicHtml,
  htmlPageRoutesMiddleware,
  publicHtmlMiddleware,
  publicHtmlStatus,
  NO_CACHE_HEADERS,
  injectAppVersion,
  injectEarlyLangBoot,
  injectLocaleModule,
  EARLY_LANG_BOOT,
  injectClientErrorBoundary,
  injectAnalyticsScripts,
  injectErrorDetail,
  injectFaviconLinks,
  FAVICON_LINKS,
  injectNonce,
  HTML_PAGE_ROUTES,
  readPublicHtml,
};
