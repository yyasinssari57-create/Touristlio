/**
 * [YÜKSEK-2] Map integration checks — coords + markers API.
 * Usage: node server/scripts/verify-map.js
 */
const { db } = require('../db');
const { listMarkers, filterPlaces } = require('../modules/places/places.service');
const { ensurePlaceCoords, isValidCoordPair } = require('../lib/city-coords');

const total = db.prepare('SELECT COUNT(*) AS c FROM places').get().c;
const noCoords = db.prepare('SELECT COUNT(*) AS c FROM places WHERE lat IS NULL OR lng IS NULL').get().c;
const rows = db.prepare('SELECT id, name, city, country, category, categories, lat, lng FROM places').all();

let invalid = 0;
for (const row of rows) {
  const coords = ensurePlaceCoords(row);
  if (!isValidCoordPair(coords.lat, coords.lng)) invalid += 1;
}

const allMarkers = listMarkers({}, 'tr');
const museumMarkers = listMarkers({ category: 'museum' }, 'tr');
const natureMarkers = listMarkers({ category: 'nature' }, 'tr');
const historical = listMarkers({ group: 'historical' }, 'tr');

const missingOnMarkers = allMarkers.filter((m) => !isValidCoordPair(m.lat, m.lng)).length;
const museumMismatch = museumMarkers.filter((m) => {
  const cats = [m.category, ...(m.categories || [])];
  return !cats.includes('museum');
}).length;

console.log('verify-map');
console.log('  places:', total);
console.log('  db missing lat/lng:', noCoords);
console.log('  invalid after ensurePlaceCoords:', invalid);
console.log('  markers all:', allMarkers.length);
console.log('  markers without coords:', missingOnMarkers);
console.log('  markers museum:', museumMarkers.length, 'mismatch:', museumMismatch);
console.log('  markers nature:', natureMarkers.length);
console.log('  markers historical group:', historical.length);

const ok = total > 0
  && noCoords === 0
  && invalid === 0
  && allMarkers.length > 0
  && missingOnMarkers === 0
  && museumMarkers.length > 0
  && museumMismatch === 0
  && natureMarkers.length > 0
  && historical.length > 0
  && museumMarkers.length < allMarkers.length;

if (!ok) {
  console.error('  ✗ map verification failed');
  process.exit(1);
}

// filterPlaces used by list + map should stay in sync for category
const { places: museumPlaces } = filterPlaces(db.prepare('SELECT * FROM places').all(), { category: 'museum' });
if (museumPlaces.length && museumMarkers.length === 0) {
  console.error('  ✗ category filter produced places but no markers');
  process.exit(1);
}

console.log('  ✓ OK');

const osmSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'routes', 'osm.js'), 'utf8');
if (osmSrc.includes('501')) {
  console.error('  ✗ /api/osm/search still returns 501');
  process.exit(1);
}
if (!osmSrc.includes('results: []') || !osmSrc.includes('enabled: false')) {
  console.error('  ✗ OSM search stub should return empty results while disabled');
  process.exit(1);
}
console.log('  ✓ OSM search stub (empty, not 501)');

process.exit(0);
