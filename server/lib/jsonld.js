/**
 * [YÜKSEK-4] Schema.org JSON-LD builders.
 * Ratings/reviews are Tiola (user-generated) only — never Google.
 */
const { siteBaseUrl, absUrl, canonicalFor, stripEnPrefix } = require('./seo');

const LOGO_PATH = '/images/logo.webp';
const AGENCY_DESCRIPTION = 'Topluluk tabanlı seyahat rehberliği platformu';
const CONTACT_EMAIL = 'touristlio.info@gmail.com';
const MAX_REVIEWS = 50;

function toIso(value) {
  if (!value) return undefined;
  const d = new Date(String(value).includes('T') ? value : `${value}Z`);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function compact(obj) {
  if (obj == null || obj === '') return undefined;
  if (Array.isArray(obj)) {
    const next = obj.map(compact).filter((v) => v !== undefined);
    return next.length ? next : undefined;
  }
  if (typeof obj === 'object') {
    const next = {};
    for (const [k, v] of Object.entries(obj)) {
      const cv = compact(v);
      if (cv !== undefined) next[k] = cv;
    }
    return Object.keys(next).length ? next : undefined;
  }
  return obj;
}

function serializeJsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

function jsonLdScriptTags(blocks) {
  return (Array.isArray(blocks) ? blocks : [])
    .filter(Boolean)
    .map((data) => `<script type="application/ld+json" data-tl-jsonld="1">${serializeJsonLd(data)}</script>`)
    .join('\n');
}

function travelAgency() {
  const base = siteBaseUrl();
  return {
    '@context': 'https://schema.org',
    '@type': 'TravelAgency',
    name: 'Touristlio',
    url: base,
    logo: `${base}${LOGO_PATH}`,
    description: AGENCY_DESCRIPTION,
  };
}

function touristAttraction(place, lang = 'tr') {
  if (!place) return null;
  const path = place.slug
    ? `/places/${encodeURIComponent(place.slug)}`
    : `/places/${place.id}`;
  const url = canonicalFor(path, lang);
  const desc = lang === 'en'
    ? (place.descriptionEn || place.overviewEn || place.description || '')
    : (place.description || place.overview || '');
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'TouristAttraction',
    name: place.name,
    description: String(desc || '').slice(0, 5000) || undefined,
    url,
    image: place.imageUrl ? absUrl(place.imageUrl) : undefined,
    address: compact({
      '@type': 'PostalAddress',
      addressLocality: place.city || undefined,
      addressRegion: place.district || undefined,
      addressCountry: place.country || undefined,
    }),
  };
  if (place.lat != null && place.lng != null && Number.isFinite(Number(place.lat)) && Number.isFinite(Number(place.lng))) {
    schema.geo = {
      '@type': 'GeoCoordinates',
      latitude: Number(place.lat),
      longitude: Number(place.lng),
    };
  }
  const count = Number(place.tiolaCount) || 0;
  const rating = Number(place.tiolaRating);
  if (count > 0 && Number.isFinite(rating) && rating > 0) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: String(rating),
      reviewCount: count,
      bestRating: '5',
      worstRating: '1',
    };
  }
  return compact(schema);
}

function reviewSchema(tiola, place) {
  if (!tiola) return null;
  const itemName = place?.name || tiola.placeName || tiola.place_name;
  const itemReviewed = itemName
    ? { '@type': 'TouristAttraction', name: itemName }
    : { '@type': 'TravelAgency', name: 'Touristlio', url: siteBaseUrl() };
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Review',
    itemReviewed,
    author: {
      '@type': 'Person',
      name: tiola.userName || tiola.user_name || 'Gezgin',
    },
    reviewBody: tiola.text ? String(tiola.text).slice(0, 5000) : undefined,
    datePublished: toIso(tiola.createdAt || tiola.created_at),
  };
  const stars = Number(tiola.stars);
  if (Number.isFinite(stars) && stars > 0) {
    schema.reviewRating = {
      '@type': 'Rating',
      ratingValue: String(stars),
      bestRating: '5',
      worstRating: '1',
    };
  }
  return compact(schema);
}

function articleSchema(blog, lang = 'tr') {
  if (!blog) return null;
  const base = siteBaseUrl();
  const slug = blog.slug || blog.id;
  const path = `/blog/${encodeURIComponent(slug)}`;
  const url = canonicalFor(path, lang);
  const published = toIso(blog.publishedAt || blog.published_at || blog.createdAt || blog.created_at);
  return compact({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: String(blog.title || '').slice(0, 110),
    description: String(blog.excerpt || '').slice(0, 300) || undefined,
    image: blog.imageUrl || blog.image_url ? absUrl(blog.imageUrl || blog.image_url) : undefined,
    datePublished: published,
    dateModified: toIso(blog.updatedAt || blog.updated_at) || published,
    author: {
      '@type': 'Person',
      name: blog.authorName || blog.author_name || blog.author_name_user || 'Touristlio',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Touristlio',
      logo: {
        '@type': 'ImageObject',
        url: `${base}${LOGO_PATH}`,
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
    url,
    inLanguage: lang === 'en' ? 'en' : 'tr',
  });
}

function contactPage(lang = 'tr') {
  const base = siteBaseUrl();
  const url = canonicalFor('/legal/contact.html', lang);
  const agency = travelAgency();
  return {
    '@context': 'https://schema.org',
    '@type': 'ContactPage',
    name: lang === 'en' ? 'Contact — Touristlio' : 'İletişim — Touristlio',
    url,
    description: lang === 'en'
      ? 'Send a message to the Touristlio team.'
      : 'Touristlio ekibine istek, öneri ve şikayetlerinizi iletin.',
    inLanguage: lang === 'en' ? 'en' : 'tr',
    mainEntity: {
      '@type': 'TravelAgency',
      name: agency.name,
      url: agency.url,
      logo: agency.logo,
      email: CONTACT_EMAIL,
    },
  };
}

function isTopLevelApprovedTiola(tiola) {
  if (!tiola) return false;
  if (tiola.status && tiola.status !== 'approved') return false;
  if (tiola.parentId || tiola.parent_id) return false;
  return true;
}

function jsonLdForHome() {
  return [travelAgency()];
}

function jsonLdForContact(lang = 'tr') {
  return [contactPage(lang)];
}

function jsonLdForPlace(place, tiolas = [], lang = 'tr') {
  const attraction = touristAttraction(place, lang);
  const reviews = (tiolas || [])
    .filter(isTopLevelApprovedTiola)
    .slice(0, MAX_REVIEWS)
    .map((t) => reviewSchema(t, place))
    .filter(Boolean);
  return [attraction, ...reviews].filter(Boolean);
}

function jsonLdForBlog(blog, lang = 'tr') {
  const article = articleSchema(blog, lang);
  return article ? [article] : [];
}

function jsonLdForHomeWithTiolas(tiolas = []) {
  const reviews = (tiolas || [])
    .filter(isTopLevelApprovedTiola)
    .slice(0, MAX_REVIEWS)
    .map((t) => reviewSchema(t, { name: t.placeName || t.place_name }))
    .filter(Boolean);
  return [travelAgency(), ...reviews];
}

function loadApprovedTiolasForPlace(placeId) {
  if (!placeId) return [];
  try {
    const { db } = require('../db');
    return db.prepare(`
      SELECT t.id, t.stars, t.text, t.created_at, t.parent_id, t.status,
             u.name AS user_name, p.name AS place_name
      FROM tiolas t
      JOIN users u ON u.id = t.user_id
      LEFT JOIN places p ON p.id = t.place_id
      WHERE t.place_id = ? AND t.status = 'approved' AND t.parent_id IS NULL
      ORDER BY datetime(t.created_at) DESC
      LIMIT ?
    `).all(placeId, MAX_REVIEWS);
  } catch {
    return [];
  }
}

function loadApprovedBlog(slug) {
  const raw = String(slug || '').trim();
  if (!raw) return null;
  try {
    const { db } = require('../db');
    let row = db.prepare(`
      SELECT b.*, u.name AS author_name_user
      FROM blogs b
      JOIN users u ON u.id = b.user_id
      WHERE b.slug = ? AND b.status = 'approved'
    `).get(raw);
    if (!row && /^\d+$/.test(raw)) {
      row = db.prepare(`
        SELECT b.*, u.name AS author_name_user
        FROM blogs b
        JOIN users u ON u.id = b.user_id
        WHERE b.id = ? AND b.status = 'approved'
      `).get(Number(raw));
    }
    if (!row) return null;
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      excerpt: row.excerpt,
      body: row.body,
      imageUrl: row.image_url,
      authorName: row.author_name || row.author_name_user || 'Anonim',
      publishedAt: row.published_at || row.created_at,
      createdAt: row.created_at,
    };
  } catch {
    return null;
  }
}

function autoJsonLd(pathname, relativePath, lang = 'tr') {
  if (/admin|login|register|profile|verify-email|reset-password|404\.html|500\.html/.test(relativePath || '')) {
    return [];
  }
  let p = stripEnPrefix(pathname || '/').split('?')[0];
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  if (p === '/' || p === '') return jsonLdForHome();
  if (p.includes('contact')) return jsonLdForContact(lang);
  return [];
}

module.exports = {
  travelAgency,
  touristAttraction,
  reviewSchema,
  articleSchema,
  contactPage,
  jsonLdForHome,
  jsonLdForContact,
  jsonLdForPlace,
  jsonLdForBlog,
  jsonLdForHomeWithTiolas,
  loadApprovedTiolasForPlace,
  loadApprovedBlog,
  autoJsonLd,
  serializeJsonLd,
  jsonLdScriptTags,
  AGENCY_DESCRIPTION,
};
