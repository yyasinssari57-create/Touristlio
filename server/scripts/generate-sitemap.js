/**
 * places.json → public/sitemap.xml
 * npm run sitemap
 */
const fs = require('fs');
const path = require('path');

const placesPath = path.join(__dirname, '..', 'data', 'places.json');
const outPath = path.join(__dirname, '..', '..', 'public', 'sitemap.xml');
const base = process.env.SITE_URL || 'https://touristlio.com';
const today = new Date().toISOString().slice(0, 10);

let places = [];
if (fs.existsSync(placesPath)) {
  places = JSON.parse(fs.readFileSync(placesPath, 'utf8'));
}

const urls = [
  { loc: `${base}/`, priority: '1.0' },
  { loc: `${base}/legal/kvkk.html`, priority: '0.3' },
  { loc: `${base}/legal/terms.html`, priority: '0.3' },
];

for (const p of places) {
  urls.push({ loc: `${base}/?place=${p.id}`, priority: '0.7' });
}

const staticPages = [
  '/legal/about.html', '/legal/contact.html', '/legal/privacy.html',
  '/legal/terms.html', '/legal/kvkk.html', '/login', '/register',
];
for (const pg of staticPages) {
  urls.push({ loc: `${base}${pg}`, priority: '0.4' });
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;

fs.writeFileSync(outPath, xml, 'utf8');
console.log('sitemap.xml:', urls.length, 'URLs →', outPath);
