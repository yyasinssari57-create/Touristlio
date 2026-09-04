const { siteBaseUrl } = require('./sitemap');
const { googleSiteVerification } = require('./analytics-config');

const HOME_TR = {
  title: 'Touristlio — Sadece Ziyaret Etme. Hisset.',
  description: 'Touristlio — dünya çapında destinasyonlar, Tiola topluluk puanları ve OpenStreetMap haritalarıyla kişisel seyahat rehberi.',
};
const HOME_EN = {
  title: "Touristlio — Don't Just Visit. Feel It.",
  description: 'Touristlio — global destinations, Tiola community ratings, and OpenStreetMap-powered travel discovery.',
};

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
  return en ? HOME_EN : HOME_TR;
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
    hreflangLinks(pathname),
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
};
