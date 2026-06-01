/**
 * logo:extract + places:merge + seed + rapor
 * node server/scripts/run-all.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..', '..');

function run(cmd) {
  console.log('\n>>', cmd);
  execSync(cmd, { cwd: root, stdio: 'inherit', shell: true });
}

try {
  run('node server/scripts/extract-nav-logo.js');
} catch (e) {
  console.warn('logo:extract skipped:', e.message);
}

run('node server/scripts/build-places-500.js');

const statsPath = path.join(root, 'server', 'data', 'merge-stats.json');
const stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
console.log('\n--- merge stats ---', stats);

run('node server/seed.js');

const db = require('better-sqlite3')(path.join(root, 'data', 'touristlio.db'));
const dbCount = db.prepare('SELECT COUNT(*) AS c FROM places').get().c;
console.log('\n--- final ---');
console.log('DB places:', dbCount);
console.log('JSON places:', stats.count);
console.log('Duplicate imageUrls:', stats.duplicateUrls);
db.close();
