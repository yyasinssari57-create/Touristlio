/**

 * Eksik/bozuk görselleri düzelt + tekrarlayan placeholder dağıt

 * node server/scripts/fix-places-images.js

 */

const fs = require('fs');

const path = require('path');

const { assignUniqueImages } = require('../lib/photo-pools');

const outPath = path.join(__dirname, '..', 'data', 'places.json');

let places = JSON.parse(fs.readFileSync(outPath, 'utf8'));
const before = places.map((p) => `${p.imageUrl || ''}|${JSON.stringify(p.photos || [])}`);
places = assignUniqueImages(places);
let kept = 0;
let filled = 0;
places.forEach((p, i) => {
  const after = `${p.imageUrl || ''}|${JSON.stringify(p.photos || [])}`;
  if (before[i] && before[i] !== '|[]' && before[i] !== '|') kept += 1;
  else if (after !== before[i]) filled += 1;
});

const urls = places.map((p) => p.imageUrl);

const dup = urls.length - new Set(urls).size;



fs.writeFileSync(outPath, JSON.stringify(places, null, 2), 'utf8');

console.log('fix-places-images: kept', kept, '| filled empty', filled, '| total', places.length, '| duplicate URLs:', dup);

