#!/usr/bin/env node
/**
 * SQLite yedekleme — data/touristlio.db → backups/touristlio-YYYY-MM-DD_HH-mm-ss.db
 * Günlük cron: npm run backup:db
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const src = path.join(root, 'data', 'touristlio.db');
const backupsDir = path.join(root, 'backups');

function pad(n) {
  return String(n).padStart(2, '0');
}

function timestamp() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

if (!fs.existsSync(src)) {
  console.error('Veritabanı bulunamadı:', src);
  process.exit(1);
}

if (!fs.existsSync(backupsDir)) {
  fs.mkdirSync(backupsDir, { recursive: true });
}

const dest = path.join(backupsDir, `touristlio-${timestamp()}.db`);
fs.copyFileSync(src, dest);

const stat = fs.statSync(dest);
console.log(`Yedek oluşturuldu: ${dest} (${stat.size} bayt)`);
