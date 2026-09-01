#!/usr/bin/env node
/**
 * PostgreSQL places + blogs + static routes → public/sitemap.xml
 * npm run sitemap
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { initDb } = require('../db');
const { buildSitemapXml } = require('../lib/sitemap');

async function main() {
  await initDb();
  const outPath = path.join(__dirname, '..', '..', 'public', 'sitemap.xml');
  const xml = await buildSitemapXml();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, xml, 'utf8');
  const count = (xml.match(/<loc>/g) || []).length;
  console.log('sitemap.xml:', count, 'URLs →', outPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
