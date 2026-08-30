/**
 * SQLite places + blogs + static routes → public/sitemap.xml
 * npm run sitemap
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { buildSitemapXml } = require('../lib/sitemap');

const outPath = path.join(__dirname, '..', '..', 'public', 'sitemap.xml');
const xml = buildSitemapXml();
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, xml, 'utf8');
const count = (xml.match(/<loc>/g) || []).length;
console.log('sitemap.xml:', count, 'URLs →', outPath);
