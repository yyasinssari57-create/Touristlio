/**
 * places.json doğrulama — npm run places:validate
 */
const fs = require('fs');
const path = require('path');

const placesPath = path.join(__dirname, '..', 'data', 'places.json');
const REQUIRED = ['id', 'name', 'country', 'city', 'category'];
const MIN_COUNT = Number(process.env.PLACES_MIN_COUNT) || 800;

const places = JSON.parse(fs.readFileSync(placesPath, 'utf8'));
const errors = [];
const names = new Set();
const ids = new Set();

for (const p of places) {
  for (const key of REQUIRED) {
    if (p[key] == null || p[key] === '') errors.push(`#${p.id || '?'} missing ${key}`);
  }
  if (p.id != null) {
    if (ids.has(p.id)) errors.push(`duplicate id ${p.id}`);
    ids.add(p.id);
  }
  const nk = String(p.name || '').toLowerCase();
  if (names.has(nk)) errors.push(`duplicate name: ${p.name}`);
  names.add(nk);
  if (p.googleRating != null || p.googleCount != null) {
    errors.push(`#${p.id} has Google fields (forbidden)`);
  }
  if (!p.description || p.description.length < 40) {
    errors.push(`#${p.id} description too short`);
  }
}

if (places.length < MIN_COUNT) {
  errors.push(`count ${places.length} < minimum ${MIN_COUNT}`);
}

const withCoords = places.filter((p) => p.lat != null && p.lng != null).length;
const withPhotos = places.filter((p) => Array.isArray(p.photos) && p.photos.length > 0).length;

console.log('validate-places');
console.log('  total:', places.length);
console.log('  with lat/lng:', withCoords);
console.log('  with photos[]:', withPhotos);
console.log('  errors:', errors.length);

if (errors.length) {
  errors.slice(0, 30).forEach((e) => console.error('  ✗', e));
  if (errors.length > 30) console.error(`  ... and ${errors.length - 30} more`);
  process.exit(1);
}

console.log('  ✓ OK');
process.exit(0);
