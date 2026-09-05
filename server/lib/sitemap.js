const { db } = require('../db');

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function siteBaseUrl() {
  let base = (process.env.SITE_URL || 'https://www.touristlio.com').replace(/\/$/, '');
  try {
    const u = new URL(base.includes('://') ? base : `https://${base}`);
    if (u.hostname === 'touristlio.com') u.hostname = 'www.touristlio.com';
    base = `${u.protocol}//${u.host}`;
  } catch {
    base = 'https://www.touristlio.com';
  }
  return base.replace(/\/$/, '');
}

function isoDate(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
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

/** Audit verification_status='published' → this schema uses places.status. */
function isPublishedPlaceStatus(status) {
  const s = String(status == null || status === '' ? 'published' : status).trim().toLowerCase();
  return s === 'published';
}

function placeSitemapPath(row) {
  const slug = String(row?.slug || '').trim();
  if (!slug) return null;
  if (!isPublishedPlaceStatus(row.status)) return null;
  if (!isValidSitemapCoord(row.lat, row.lng)) return null;
  return `/places/${encodeURIComponent(slug)}`;
}

function staticUrls(base) {
  return [
    { loc: `${base}/`, priority: '1.0', changefreq: 'daily' },
    { loc: `${base}/gezilecek-yerler`, priority: '0.9', changefreq: 'daily' },
    { loc: `${base}/blog`, priority: '0.8', changefreq: 'daily' },
    { loc: `${base}/search`, priority: '0.6', changefreq: 'weekly' },
    { loc: `${base}/legal/about.html`, priority: '0.4', changefreq: 'monthly' },
    { loc: `${base}/legal/contact.html`, priority: '0.4', changefreq: 'monthly' },
    { loc: `${base}/legal/privacy.html`, priority: '0.3', changefreq: 'yearly' },
    { loc: `${base}/legal/kvkk.html`, priority: '0.3', changefreq: 'yearly' },
    { loc: `${base}/legal/terms.html`, priority: '0.3', changefreq: 'yearly' },
  ];
}

/** /places/slug → /en/places/slug. Already-English locs are skipped. */
function englishAlternateLoc(loc, base) {
  const root = String(base || '').replace(/\/$/, '');
  const full = String(loc || '');
  if (!root || !full.startsWith(root)) return null;
  const path = full.slice(root.length) || '/';
  if (path === '/en' || path === '/en/' || path.startsWith('/en/')) return null;
  return path === '/' ? `${root}/en/` : `${root}/en${path}`;
}

function withEnglishAlternates(urls, base) {
  const extra = [];
  for (const u of urls) {
    const enLoc = englishAlternateLoc(u.loc, base);
    if (!enLoc) continue;
    const path = String(u.loc || '').slice(String(base || '').replace(/\/$/, '').length) || '/';
    extra.push({
      ...u,
      loc: enLoc,
      priority: path === '/' ? '0.9' : u.priority,
    });
  }
  return [...urls, ...extra];
}

async function loadPlaceUrls(base) {
  try {
    const rows = await db.prepare(`
      SELECT slug, lat, lng, status FROM places
      WHERE COALESCE(NULLIF(TRIM(status), ''), 'published') = 'published'
        AND slug IS NOT NULL AND TRIM(slug) <> ''
        AND lat IS NOT NULL AND lng IS NOT NULL
        AND lat <> 0 AND lng <> 0
      ORDER BY id
    `).all();
    const urls = [];
    for (const row of rows) {
      const path = placeSitemapPath(row);
      if (!path) continue;
      urls.push({
        loc: `${base}${path}`,
        priority: '0.8',
        changefreq: 'weekly',
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
      SELECT slug, published_at, created_at FROM blogs
      WHERE status = 'approved' AND slug IS NOT NULL AND TRIM(slug) <> ''
      ORDER BY id
    `).all();
    return rows.map((b) => ({
      loc: `${base}/blog/${encodeURIComponent(b.slug)}`,
      lastmod: isoDate(b.published_at || b.created_at),
      priority: '0.7',
      changefreq: 'monthly',
    }));
  } catch {
    return [];
  }
}

async function buildSitemapXml() {
  const base = siteBaseUrl();
  const today = isoDate();
  const urls = withEnglishAlternates(
    [...staticUrls(base), ...(await loadPlaceUrls(base)), ...(await loadBlogUrls(base))],
    base,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>
    <loc>${escapeXml(u.loc)}</loc>
    <lastmod>${escapeXml(u.lastmod || today)}</lastmod>
    <changefreq>${escapeXml(u.changefreq || 'weekly')}</changefreq>
    <priority>${escapeXml(u.priority || '0.5')}</priority>
  </url>`).join('\n')}
</urlset>
`;
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
  isValidSitemapCoord,
  isPublishedPlaceStatus,
  placeSitemapPath,
  englishAlternateLoc,
  withEnglishAlternates,
  ROBOTS_PRIVATE_PATHS,
  SITEMAP_CACHE_CONTROL,
};
