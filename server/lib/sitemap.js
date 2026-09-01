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

function staticUrls(base) {
  return [
    { loc: `${base}/`, priority: '1.0', changefreq: 'daily' },
    { loc: `${base}/en/`, priority: '0.9', changefreq: 'daily' },
    { loc: `${base}/gezilecek-yerler`, priority: '0.9', changefreq: 'daily' },
    { loc: `${base}/blog`, priority: '0.8', changefreq: 'daily' },
    { loc: `${base}/en/blog`, priority: '0.7', changefreq: 'daily' },
    { loc: `${base}/search`, priority: '0.6', changefreq: 'weekly' },
    { loc: `${base}/legal/about.html`, priority: '0.4', changefreq: 'monthly' },
    { loc: `${base}/legal/contact.html`, priority: '0.4', changefreq: 'monthly' },
    { loc: `${base}/legal/privacy.html`, priority: '0.3', changefreq: 'yearly' },
    { loc: `${base}/legal/kvkk.html`, priority: '0.3', changefreq: 'yearly' },
    { loc: `${base}/legal/terms.html`, priority: '0.3', changefreq: 'yearly' },
  ];
}

async function loadPlaceUrls(base) {
  try {
    const rows = await db.prepare(`
      SELECT id, slug FROM places
      WHERE COALESCE(status, 'published') != 'archived'
      ORDER BY id
    `).all();
    return rows.map((p) => ({
      loc: p.slug ? `${base}/places/${encodeURIComponent(p.slug)}` : `${base}/places/${p.id}`,
      priority: '0.7',
      changefreq: 'weekly',
    }));
  } catch {
    return [];
  }
}

async function loadBlogUrls(base) {
  try {
    const rows = await db.prepare(`
      SELECT slug, published_at, created_at FROM blogs
      WHERE status = 'approved' AND slug IS NOT NULL AND slug != ''
      ORDER BY id
    `).all();
    return rows.map((b) => ({
      loc: `${base}/blog/${encodeURIComponent(b.slug)}`,
      lastmod: isoDate(b.published_at || b.created_at),
      priority: '0.6',
      changefreq: 'weekly',
    }));
  } catch {
    return [];
  }
}

async function buildSitemapXml() {
  const base = siteBaseUrl();
  const today = isoDate();
  const urls = [...staticUrls(base), ...(await loadPlaceUrls(base)), ...(await loadBlogUrls(base))];
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

function buildRobotsTxt() {
  const base = siteBaseUrl();
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /api',
    '',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ].join('\n');
}

module.exports = { siteBaseUrl, buildSitemapXml, buildRobotsTxt };
