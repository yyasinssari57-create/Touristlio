const { siteBaseUrl } = require('./sitemap');
const { googleSiteVerification } = require('./analytics-config');

/** FAZ3-2 static templates. Counts match places.json (1090 places, 135 countries). */
const SEO_TEMPLATES = {
  home: {
    tr: {
      title: 'Touristlio — Gerçek Gezginlerle Dünyayı Keşfet',
      description: 'Gizli köşelerden ikonik yapılara, gerçek gezginlerin '
        + 'Tiola deneyimleriyle dünyanın en güzel yerlerini keşfet. '
        + '135 ülke, 1.090+ destinasyon.',
    },
    en: {
      title: 'Touristlio — Discover the World with Real Travelers',
      description: 'From hidden gems to iconic landmarks, discover beautiful '
        + 'places through real traveler Tiola reviews. 135 countries, 1,090+ destinations.',
    },
  },
  explore: {
    tr: {
      title: 'Gezilecek Yerler — Dünyayı Keşfet | Touristlio',
      description: '135 ülkede 1.090+ destinasyon. Şehre, kategoriye, puana '
        + 'göre filtrele. Gerçek gezginlerin Tiola değerlendirmeleri.',
    },
    en: {
      title: 'Places to Visit — Explore the World | Touristlio',
      description: '1,090+ destinations in 135 countries. Filter by city, '
        + 'category, and rating. Real traveler Tiola reviews.',
    },
  },
};

function clipMetaDescription(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 160);
}

/**
 * Single meta template for home, explore, place, and blog.
 * ogImage is a path or absolute URL; null means the default hero.
 */
function generateMeta(type, data = {}, locale = 'tr') {
  const lang = locale === 'en' ? 'en' : 'tr';
  const tmpl = SEO_TEMPLATES[type];
  if (tmpl) {
    const t = tmpl[lang] || tmpl.tr;
    return { title: t.title, description: clipMetaDescription(t.description), ogImage: null };
  }

  if (type === 'place' && data.place) {
    const p = data.place;
    const name = String((lang === 'en' ? (p.nameEn || p.name) : (p.name || p.nameEn)) || '').trim();
    const city = String((lang === 'en' ? (p.cityEn || p.city) : (p.city || p.cityEn)) || '').trim();
    const desc = lang === 'en'
      ? (p.overviewEn || p.descriptionEn || p.overview || p.description || '')
      : (p.overview || p.description || p.descriptionEn || '');
    const title = (name && city)
      ? (lang === 'en'
        ? `${name} | Things to Do in ${city} — Touristlio`
        : `${name} | ${city} Gezilecek Yerler — Touristlio`)
      : `${name || 'Touristlio'} — Touristlio`;
    return {
      title,
      description: clipMetaDescription(desc),
      ogImage: p.imageUrl || p.hero_image || p.heroImage || null,
    };
  }

  if (type === 'blog' && (data.post || data.blog)) {
    const p = data.post || data.blog;
    const titleText = String((lang === 'en' ? (p.titleEn || p.title) : (p.title || p.titleEn)) || '').trim();
    const excerpt = lang === 'en'
      ? (p.excerptEn || p.excerpt || p.body || '')
      : (p.excerpt || p.body || '');
    return {
      title: `${titleText || 'Touristlio'} — Touristlio Blog`,
      description: clipMetaDescription(String(excerpt).replace(/<[^>]+>/g, '')),
      ogImage: p.imageUrl || p.cover_image || p.coverImage || null,
    };
  }

  return {
    title: 'Touristlio',
    description: lang === 'en' ? "Don't Just Visit. Feel It." : 'Sadece Ziyaret Etme. Hisset.',
    ogImage: null,
  };
}

function escapeAttr(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function stripEnPrefix(pathname) {
  const p = (pathname || '/').split('?')[0];
  if (p === '/en' || p === '/en/') return '/';
  if (p.startsWith('/en/')) return p.slice(3) || '/';
  return p || '/';
}

function normalizePath(pathname) {
  let p = stripEnPrefix(pathname);
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p || '/';
}

/**
 * FAZ3-4 listing paths. A query string on these is a filter/search variant:
 * noindex, and the canonical URL is the same path without the query.
 * Place detail (/places/:slug) is not in this set.
 */
const PARAM_LISTING_PATHS = new Set(['/explore', '/search', '/places']);

/** PRD private shells, plus this app's real account pages. */
const ALWAYS_NOINDEX_PATHS = new Set([
  '/account',
  '/settings',
  '/admin',
  '/dashboard',
  '/login',
  '/register',
  '/profile',
  '/verify-email',
  '/reset-password',
]);

function hasQueryParams(query) {
  if (!query || typeof query !== 'object') return false;
  return Object.keys(query).length > 0;
}

function isAlwaysNoindexPath(pathname) {
  const p = normalizePath(pathname);
  if (ALWAYS_NOINDEX_PATHS.has(p)) return true;
  return p.startsWith('/admin/')
    || p.startsWith('/account/')
    || p.startsWith('/settings/')
    || p.startsWith('/dashboard/');
}

/** True when this URL must be noindex (private shell, or parameterized listing). */
function shouldNoindexPath(pathname, query) {
  if (isAlwaysNoindexPath(pathname)) return true;
  return hasQueryParams(query) && PARAM_LISTING_PATHS.has(normalizePath(pathname));
}

function shouldNoindexDocument(relativePath, pathname, query) {
  const fileNoindex = /login|register|profile|verify-email|reset-password|admin|404\.html|500\.html/.test(relativePath || '');
  return fileNoindex || shouldNoindexPath(pathname, query);
}

function defaultOgImage() {
  return `${siteBaseUrl()}/images/hero.webp`;
}

function absUrl(url) {
  if (!url) return defaultOgImage();
  if (/^https?:\/\//i.test(url)) return url;
  const base = siteBaseUrl();
  return url.startsWith('/') ? `${base}${url}` : `${base}/${url}`;
}

function pageDefaults(pathname, lang) {
  const p = normalizePath(pathname);
  const en = lang === 'en';
  const locale = en ? 'en' : 'tr';
  if (p === '/' || p === '') {
    const home = generateMeta('home', {}, locale);
    return { title: home.title, description: home.description };
  }
  if (p === '/explore') {
    const explore = generateMeta('explore', {}, locale);
    return { title: explore.title, description: explore.description };
  }
  if (p === '/search') {
    return en
      ? { title: 'Search destinations — Touristlio', description: 'Search Touristlio destinations with filters and shareable URLs.' }
      : { title: 'Destinasyon ara — Touristlio', description: 'Touristlio destinasyon arama — filtreler, sayfalama ve paylaşılabilir URL.' };
  }
  if (p === '/gezilecek-yerler') {
    return en
      ? { title: 'Places to visit — Touristlio', description: 'Browse destinations and community Tiolas on Touristlio.' }
      : { title: 'Gezilecek Yerler — Touristlio', description: 'Touristlio’da destinasyonları ve topluluk Tiola’larını keşfedin.' };
  }
  if (p === '/blog') {
    return en
      ? { title: 'Travel Stories — Touristlio', description: 'Travel guides, hidden gems and cultural stories from local writers on Touristlio.' }
      : { title: 'Seyahat Hikayeleri — Touristlio', description: 'Yerel yazarlardan gezi rehberleri, gizli köşeler ve kültürel keşifler.' };
  }
  if (p.includes('contact')) {
    return en
      ? { title: 'Contact — Touristlio', description: 'Send a message to the Touristlio team.' }
      : { title: 'İletişim — Touristlio', description: 'Touristlio ekibine istek, öneri ve şikayetlerinizi iletin.' };
  }
  if (p.includes('about')) {
    return en
      ? { title: 'About — Touristlio', description: 'Touristlio is a community travel guide powered by Tiolas.' }
      : { title: 'Hakkımızda — Touristlio', description: 'Touristlio, gerçek gezginlerin Tiola deneyimleriyle keşif sunan bağımsız bir seyahat rehberidir.' };
  }
  if (p.includes('privacy')) {
    return en
      ? { title: 'Privacy — Touristlio', description: 'How Touristlio processes personal data under KVKK and GDPR.' }
      : { title: 'Gizlilik — Touristlio', description: 'Touristlio kişisel verilerinizi KVKK ve GDPR kapsamında işler.' };
  }
  if (p.includes('kvkk')) {
    return { title: 'KVKK — Touristlio', description: 'Kişisel verilerin korunması hakkında bilgilendirme.' };
  }
  if (p.includes('terms')) {
    return en
      ? { title: 'Terms — Touristlio', description: 'Terms of use for Touristlio.' }
      : { title: 'Kullanım Şartları — Touristlio', description: 'Touristlio kullanım şartları.' };
  }
  if (p === '/login') {
    return en
      ? { title: 'Sign in — Touristlio', description: 'Sign in to save places and write Tiolas on Touristlio.' }
      : { title: 'Giriş — Touristlio', description: 'Yer kaydetmek ve Tiola yazmak için Touristlio’ya giriş yapın.' };
  }
  if (p === '/register') {
    return en
      ? { title: 'Create account — Touristlio', description: 'Create a Touristlio account to save places and write Tiolas.' }
      : { title: 'Kayıt — Touristlio', description: 'Yer kaydetmek ve Tiola yazmak için Touristlio hesabı oluşturun.' };
  }
  if (p === '/profile') {
    return en
      ? { title: 'Profile — Touristlio', description: 'Your Touristlio profile, Tiolas and saved places.' }
      : { title: 'Profil — Touristlio', description: 'Touristlio profiliniz, Tiola’larınız ve kayıtlı yerleriniz.' };
  }
  if (p === '/admin') {
    return en
      ? { title: 'Admin — Touristlio', description: 'Touristlio admin panel.' }
      : { title: 'Admin — Touristlio', description: 'Touristlio yönetim paneli.' };
  }
  if (p === '/verify-email') {
    return en
      ? { title: 'Verify email — Touristlio', description: 'Confirm your Touristlio email address.' }
      : { title: 'E-posta doğrula — Touristlio', description: 'Touristlio e-posta adresinizi doğrulayın.' };
  }
  if (p === '/reset-password') {
    return en
      ? { title: 'Reset password — Touristlio', description: 'Choose a new Touristlio password.' }
      : { title: 'Şifre sıfırla — Touristlio', description: 'Touristlio için yeni şifre belirleyin.' };
  }
  const home = generateMeta('home', {}, en ? 'en' : 'tr');
  return { title: home.title, description: home.description };
}

function langFromPath(pathname) {
  const p = (pathname || '/').split('?')[0];
  return (p === '/en' || p.startsWith('/en/')) ? 'en' : 'tr';
}

function canonicalFor(pathname, lang) {
  const base = siteBaseUrl();
  const rest = normalizePath(pathname);
  if (lang === 'en') {
    return rest === '/' ? `${base}/en/` : `${base}/en${rest}`;
  }
  return rest === '/' ? `${base}/` : `${base}${rest}`;
}

function hreflangLinks(pathname) {
  const base = siteBaseUrl();
  const rest = normalizePath(pathname);
  const tr = rest === '/' ? `${base}/` : `${base}${rest}`;
  const en = rest === '/' ? `${base}/en/` : `${base}/en${rest}`;
  return [
    `<link rel="alternate" hreflang="tr" href="${escapeAttr(tr)}" />`,
    `<link rel="alternate" hreflang="en" href="${escapeAttr(en)}" />`,
    `<link rel="alternate" hreflang="x-default" href="${escapeAttr(tr)}" />`,
  ].join('\n');
}

function ogTypeFor(pathname, explicit) {
  if (explicit) return String(explicit);
  const p = normalizePath(pathname);
  if (/^\/places\/[^/]+$/.test(p)) return 'place';
  if (/^\/blog\/[^/]+$/.test(p)) return 'article';
  return 'website';
}

function buildSeoHead({ pathname, lang, title, description, image, noindex, ogType }) {
  const resolvedLang = lang || langFromPath(pathname);
  const defaults = pageDefaults(pathname, resolvedLang);
  const pageTitle = title || defaults.title;
  const pageDesc = (description || defaults.description || '').slice(0, 160);
  const img = absUrl(image || defaultOgImage());
  const canonical = canonicalFor(pathname, resolvedLang);
  const robots = noindex ? 'noindex, nofollow' : 'index,follow';
  const locale = resolvedLang === 'en' ? 'en_US' : 'tr_TR';
  const type = ogTypeFor(pathname, ogType);
  const gsc = googleSiteVerification();
  return [
    `<title>${escapeAttr(pageTitle)}</title>`,
    `<meta name="description" content="${escapeAttr(pageDesc)}"/>`,
    `<meta name="robots" content="${robots}"/>`,
    gsc ? `<meta name="google-site-verification" content="${escapeAttr(gsc)}"/>` : '',
    `<link rel="canonical" href="${escapeAttr(canonical)}" />`,
    noindex ? '' : hreflangLinks(pathname),
    `<meta property="og:type" content="${escapeAttr(type)}"/>`,
    `<meta property="og:site_name" content="Touristlio"/>`,
    `<meta property="og:locale" content="${locale}"/>`,
    `<meta property="og:locale:alternate" content="${resolvedLang === 'en' ? 'tr_TR' : 'en_US'}"/>`,
    `<meta property="og:url" content="${escapeAttr(canonical)}"/>`,
    `<meta property="og:title" content="${escapeAttr(pageTitle)}"/>`,
    `<meta property="og:description" content="${escapeAttr(pageDesc)}"/>`,
    `<meta property="og:image" content="${escapeAttr(img)}"/>`,
    `<meta property="og:image:alt" content="${escapeAttr(pageTitle)}"/>`,
    `<meta name="twitter:card" content="summary_large_image"/>`,
    `<meta name="twitter:title" content="${escapeAttr(pageTitle)}"/>`,
    `<meta name="twitter:description" content="${escapeAttr(pageDesc)}"/>`,
    `<meta name="twitter:image" content="${escapeAttr(img)}"/>`,
  ].filter(Boolean).join('\n');
}

function stripExistingSeo(html) {
  return String(html)
    .replace(/<title>[^<]*<\/title>/gi, '')
    .replace(/<link\s+rel="canonical"[^>]*>/gi, '')
    .replace(/<link\s+rel="alternate"\s+hreflang[^>]*>/gi, '')
    .replace(/<meta\s+name="description"[^>]*>/gi, '')
    .replace(/<meta\s+name="robots"[^>]*>/gi, '')
    .replace(/<meta\s+name="google-site-verification"[^>]*>/gi, '')
    .replace(/<meta\s+property="og:[^"]+"[^>]*>/gi, '')
    .replace(/<meta\s+name="twitter:[^"]+"[^>]*>/gi, '');
}

function stripExistingJsonLd(html) {
  return String(html).replace(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi,
    '',
  );
}

function injectSeoHead(html, opts = {}) {
  const resolvedLang = opts.lang || langFromPath(opts.pathname);
  const block = buildSeoHead({ ...opts, lang: resolvedLang });
  let next = stripExistingSeo(html);
  next = next.replace(/<html\s+lang="[^"]*"/i, `<html lang="${resolvedLang === 'en' ? 'en' : 'tr'}"`);
  if (next.includes('<!-- TL_SEO -->')) {
    next = next.replace('<!-- TL_SEO -->', block);
  } else if (/<\/head>/i.test(next)) {
    next = next.replace(/<\/head>/i, `${block}\n</head>`);
  } else {
    next = block + next;
  }

  const jsonLdBlocks = opts.jsonLd;
  if (Array.isArray(jsonLdBlocks) && jsonLdBlocks.length) {
    const { jsonLdScriptTags } = require('./jsonld');
    const jsonLdHtml = jsonLdScriptTags(jsonLdBlocks);
    next = stripExistingJsonLd(next);
    if (next.includes('<!-- TL_JSONLD -->')) {
      next = next.replace('<!-- TL_JSONLD -->', jsonLdHtml);
    } else if (/<\/head>/i.test(next)) {
      next = next.replace(/<\/head>/i, `${jsonLdHtml}\n</head>`);
    } else {
      next += jsonLdHtml;
    }
  }
  return next;
}

module.exports = {
  siteBaseUrl,
  defaultOgImage,
  absUrl,
  canonicalFor,
  langFromPath,
  stripEnPrefix,
  injectSeoHead,
  buildSeoHead,
  ogTypeFor,
  generateMeta,
  SEO_TEMPLATES,
  normalizePath,
  hasQueryParams,
  shouldNoindexPath,
  shouldNoindexDocument,
  PARAM_LISTING_PATHS,
};
