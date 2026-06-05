/**
 * SQLite places + static routes → public/sitemap.xml
 * npm run sitemap
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '..', '..', 'data', 'touristlio.db');
const placesJsonPath = path.join(__dirname, '..', 'data', 'places.json');
const outPath = path.join(__dirname, '..', '..', 'public', 'sitemap.xml');
const base = (process.env.SITE_URL || 'https://touristlio.com').replace(/\/$/, '');
const today = new Date().toISOString().slice(0, 10);

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function loadPlaceIds() {
  if (fs.existsSync(dbPath)) {
    const db = new Database(dbPath, { readonly: true });
    try {
      return db.prepare('SELECT id FROM places ORDER BY id').all().map((r) => r.id);
    } finally {
      db.close();
    }
  }
  if (fs.existsSync(placesJsonPath)) {
    const places = JSON.parse(fs.readFileSync(placesJsonPath, 'utf8'));
    return places.map((p) => p.id).filter(Boolean);
  }
  return [];
}

const urls = [
  { loc: `${base}/`, priority: '1.0', changefreq: 'daily' },
  { loc: `${base}/gezilecek-yerler`, priority: '0.9', changefreq: 'daily' },
  { loc: `${base}/search`, priority: '0.6', changefreq: 'weekly' },
  { loc: `${base}/legal/about.html`, priority: '0.4', changefreq: 'monthly' },
  { loc: `${base}/legal/contact.html`, priority: '0.4', changefreq: 'monthly' },
  { loc: `${base}/legal/privacy.html`, priority: '0.3', changefreq: 'yearly' },
  { loc: `${base}/legal/kvkk.html`, priority: '0.3', changefreq: 'yearly' },
  { loc: `${base}/legal/terms.html`, priority: '0.3', changefreq: 'yearly' },
];

for (const id of loadPlaceIds()) {
  urls.push({ loc: `${base}/?place=${id}`, priority: '0.7', changefreq: 'weekly' });
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>
    <loc>${escapeXml(u.loc)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq || 'weekly'}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, xml, 'utf8');
console.log('sitemap.xml:', urls.length, 'URLs →', outPath);
