const { db } = require('../db');
const { blogEnSitemapPath } = require('./blog-i18n');
const { placeEnSitemapPath } = require('./place-i18n');
const { isPublishedPlaceStatus } = require('./place-status');
const { siteBaseUrl } = require('./site-url');

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Calendar day from a stored timestamp. Never the sitemap generation day.
 * Accepts YYYY-MM-DD and YYYY-MM-DD HH:MM:SS. Invalid values return null.
 */
function isoDate(value) {
  if (value == null || value === '') return null;
  const raw = String(value).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!m) return null;
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function recordLastmod(...values) {
  for (const value of values) {
    const iso = isoDate(value);
    if (iso) return iso;
  }
  return null;
}

/**
 * FAZ3-5 quality bar, mapped onto this schema.
 * PRD description_tr → overview or description (no description_tr column).
 * PRD blog body / is_published → blogs.body / status = 'approved'.
 * PRD deleted_at does not exist; draft and archived are excluded via status.
 * Places gained created_at / updated_at in V4 Adım 3. Rows without either
 * keep the places.json git snapshot date, not the day the sitemap is built.
 */
const PLACE_DESCRIPTION_MIN_CHARS = 50;
const BLOG_BODY_MIN_CHARS = 200;
const SITEMAP_PLACE_LIMIT = 10000;
const CONTENT_SNAPSHOT_DATE = '2026-11-01';

/** Longer of the Turkish blurbs. English columns do not satisfy description_tr. */
function turkishPlaceBlurbLength(row) {
  const overview = String(row?.overview ?? '').trim().length;
  const description = String(row?.description ?? '').trim().length;
  return Math.max(overview, description);
}

function isQualityPlaceDescription(row) {
  return turkishPlaceBlurbLength(row) > PLACE_DESCRIPTION_MIN_CHARS;
}

function isQualityBlogBody(row) {
  return String(row?.body ?? '').trim().length > BLOG_BODY_MIN_CHARS;
}

/** Audit: lat/lng present, finite, in range, and not 0. (0,0 is Null Island.) */
function isValidSitemapCoord(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
  if (la === 0 || ln === 0) return false;
  if (Math.abs(la) > 90 || Math.abs(ln) > 180) return false;
  return true;
}

function placeSitemapPath(row) {
  const slug = String(row?.slug || '').trim();
  if (!slug) return null;
  if (!isPublishedPlaceStatus(row.status)) return null;
  if (!isValidSitemapCoord(row.lat, row.lng)) return null;
  if (!isQualityPlaceDescription(row)) return null;
  return `/places/${encodeURIComponent(slug)}`;
}

/**
 * /explore is the discover shell (hero, map, filters).
 * /gezilecek-yerler is the places directory. Different sections, own canonicals.
 * /search is noindex and is not listed.
 */
function staticUrls(base) {
  const stamp = { lastmod: CONTENT_SNAPSHOT_DATE };
  return [
    { loc: `${base}/`, priority: '1.0', changefreq: 'daily', ...stamp },
    { loc: `${base}/explore`, priority: '0.9', changefreq: 'daily', ...stamp },
    { loc: `${base}/gezilecek-yerler`, priority: '0.9', changefreq: 'daily', ...stamp },
    { loc: `${base}/blog`, priority: '0.8', changefreq: 'daily', ...stamp },
    { loc: `${base}/legal/about.html`, priority: '0.4', changefreq: 'monthly', ...stamp },
    { loc: `${base}/legal/contact.html`, priority: '0.4', changefreq: 'monthly', ...stamp },
    { loc: `${base}/legal/privacy.html`, priority: '0.3', changefreq: 'yearly', ...stamp },
    { loc: `${base}/legal/kvkk.html`, priority: '0.3', changefreq: 'yearly', ...stamp },
    { loc: `${base}/legal/terms.html`, priority: '0.3', changefreq: 'yearly', ...stamp },
  ];
}

function isBlogDetailPath(pathname) {
  return /^\/blog\/[^/]+$/.test(pathname || '');
}

function isPlaceDetailPath(pathname) {
  return /^\/places\/[^/]+$/.test(pathname || '');
}

/** /places/slug → /en/places/slug. Already-English locs are skipped. */
function englishAlternateLoc(loc, base) {
  const root = String(base || '').replace(/\/$/, '');
  const full = String(loc || '');
  if (!root || !full.startsWith(root)) return null;
  const path = full.slice(root.length) || '/';
  if (path === '/search') return null;
  if (path === '/en' || path === '/en/' || path.startsWith('/en/')) return null;
  return path === '/' ? `${root}/en/` : `${root}/en${path}`;
}

/**
 * @param {object} [opts]
 * @param {boolean} [opts.includeEnBlogIndex=true] — when false, /blog does not
 *   spawn /en/blog in the sitemap (no published EN translations yet).
 */
function withEnglishAlternates(urls, base, opts = {}) {
  const includeEnBlogIndex = opts.includeEnBlogIndex !== false;
  const kept = [];
  const extra = [];
  const root = String(base || '').replace(/\/$/, '');
  for (const u of urls) {
    const path = String(u.loc || '').startsWith(root)
      ? (String(u.loc).slice(root.length) || '/')
      : '';
    if (path === '/search') continue;
    kept.push(u);
    if (u.alternateLoc) {
      extra.push({
        loc: u.alternateLoc,
        lastmod: u.lastmod,
        priority: u.priority,
        changefreq: u.changefreq,
      });
      continue;
    }
    if (isBlogDetailPath(path) || isPlaceDetailPath(path)) continue;
    if (path === '/en' || path.startsWith('/en/')) continue;
    if (path === '/blog' && !includeEnBlogIndex) continue;
    const enLoc = englishAlternateLoc(u.loc, base);
    if (!enLoc) continue;
    extra.push({
      loc: enLoc,
      lastmod: u.lastmod,
      priority: path === '/' ? '0.9' : u.priority,
      changefreq: u.changefreq,
    });
  }
  return [...kept, ...extra];
}

async function loadPlaceUrls(base) {
  try {
    const rows = await db.prepare(`
      SELECT slug, lat, lng, status, overview, description,
             description_en, overview_en, updated_at, created_at
      FROM places
      WHERE COALESCE(NULLIF(TRIM(status), ''), 'published') = 'published'
        AND slug IS NOT NULL AND TRIM(slug) <> ''
        AND lat IS NOT NULL AND lng IS NOT NULL
        AND lat <> 0 AND lng <> 0
        AND GREATEST(
          char_length(btrim(COALESCE(overview, ''))),
          char_length(btrim(COALESCE(description, '')))
        ) > ${PLACE_DESCRIPTION_MIN_CHARS}
      ORDER BY id DESC
      LIMIT ${SITEMAP_PLACE_LIMIT}
    `).all();
    const urls = [];
    for (const row of rows) {
      const path = placeSitemapPath(row);
      if (!path) continue;
      const lastmod = recordLastmod(row.updated_at, row.created_at) || CONTENT_SNAPSHOT_DATE;
      const enPath = placeEnSitemapPath(row);
      urls.push({
        loc: `${base}${path}`,
        lastmod,
        priority: '0.8',
        changefreq: 'weekly',
        alternateLoc: enPath ? `${base}${enPath}` : null,
      });
    }
    return urls;
  } catch {
    return [];
  }
}

async function loadBlogUrls(base) {
  try {
    const rows = await db.prepare(`
      SELECT slug, slug_en, title_en, excerpt_en, body_en, published_at, created_at, body
      FROM blogs
      WHERE status = 'approved' AND slug IS NOT NULL AND TRIM(slug) <> ''
        AND body IS NOT NULL
        AND char_length(btrim(body)) > ${BLOG_BODY_MIN_CHARS}
      ORDER BY COALESCE(published_at, created_at) DESC, id DESC
    `).all();
    const urls = [];
    for (const b of rows) {
      if (!isQualityBlogBody(b)) continue;
      const lastmod = recordLastmod(b.published_at, b.created_at) || CONTENT_SNAPSHOT_DATE;
      urls.push({
        loc: `${base}/blog/${encodeURIComponent(b.slug)}`,
        lastmod,
        priority: '0.7',
        changefreq: 'monthly',
      });
      const enPath = blogEnSitemapPath(b);
      if (!enPath) continue;
      urls.push({
        loc: `${base}${enPath}`,
        lastmod,
        priority: '0.7',
        changefreq: 'monthly',
      });
    }
    return urls;
  } catch {
    return [];
  }
}

function renderUrlSet(urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>
    <loc>${escapeXml(u.loc)}</loc>
    <lastmod>${escapeXml(u.lastmod)}</lastmod>
    <changefreq>${escapeXml(u.changefreq || 'weekly')}</changefreq>
    <priority>${escapeXml(u.priority || '0.5')}</priority>
  </url>`).join('\n')}
</urlset>
`;
}

async function buildSitemapXml() {
  const base = siteBaseUrl();
  const { hasPublishedEnBlogs } = require('./blog-i18n');
  let includeEnBlogIndex = true;
  try {
    includeEnBlogIndex = await hasPublishedEnBlogs(db);
  } catch {
    includeEnBlogIndex = false;
  }
  const urls = withEnglishAlternates(
    [...staticUrls(base), ...(await loadPlaceUrls(base)), ...(await loadBlogUrls(base))],
    base,
    { includeEnBlogIndex },
  );
  return renderUrlSet(urls);
}

const ROBOTS_PRIVATE_PATHS = [
  '/admin',
  '/login',
  '/register',
  '/profile',
  '/reset-password',
  '/verify-email',
];

const SITEMAP_CACHE_CONTROL = 'public, max-age=3600';

function buildRobotsTxt() {
  const base = siteBaseUrl();
  const lines = ['User-agent: *', 'Allow: /'];
  for (const p of ROBOTS_PRIVATE_PATHS) {
    lines.push(`Disallow: ${p}`);
    lines.push(`Disallow: /en${p}`);
  }
  lines.push('Disallow: /api');
  lines.push('');
  lines.push(`Sitemap: ${base}/sitemap.xml`);
  lines.push('');
  return lines.join('\n');
}

module.exports = {
  siteBaseUrl,
  buildSitemapXml,
  buildRobotsTxt,
  renderUrlSet,
  isoDate,
  recordLastmod,
  isValidSitemapCoord,
  isPublishedPlaceStatus,
  isQualityPlaceDescription,
  isQualityBlogBody,
  turkishPlaceBlurbLength,
  placeSitemapPath,
  PLACE_DESCRIPTION_MIN_CHARS,
  BLOG_BODY_MIN_CHARS,
  SITEMAP_PLACE_LIMIT,
  CONTENT_SNAPSHOT_DATE,
  englishAlternateLoc,
  withEnglishAlternates,
  isBlogDetailPath,
  isPlaceDetailPath,
  staticUrls,
  ROBOTS_PRIVATE_PATHS,
  SITEMAP_CACHE_CONTROL,
};
