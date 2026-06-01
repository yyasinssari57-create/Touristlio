/**
 * Eksik/bozuk görselleri düzelt + tekrarlayan placeholder dağıt
 * node server/scripts/fix-places-images.js
 */
const fs = require('fs');
const path = require('path');
const { assignUniqueImages } = require('../lib/photo-pools');
const { resolvePlaceImageUrl } = require('../lib/place-image');
const outPath = path.join(__dirname, '..', 'data', 'places.json');

const BAD_PATTERNS = /photo-1552832230-c0197dd311b5|photo-1469854523086-cc02fe5d8800/;

let fixed = 0;
let places = JSON.parse(fs.readFileSync(outPath, 'utf8'));
for (const p of places) {
  const resolved = resolvePlaceImageUrl(p.imageUrl, p.category, p.id);
  if (resolved !== p.imageUrl || BAD_PATTERNS.test(p.imageUrl || '')) {
    p.imageUrl = resolved;
    fixed += 1;
  }
}

places = assignUniqueImages(places);
const urls = places.map((p) => p.imageUrl);
const dup = urls.length - new Set(urls).size;

fs.writeFileSync(outPath, JSON.stringify(places, null, 2), 'utf8');
console.log('fix-places-images:', fixed, 'bad fixed, total', places.length, '| duplicate URLs:', dup);
