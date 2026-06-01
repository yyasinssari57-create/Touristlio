/**
 * Unsplash'tan photos[] dizisi doldurur
 * npm run places:fetch-photos
 * .env: UNSPLASH_ACCESS_KEY gerekli
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { fetchPlacePhotos, ACCESS_KEY } = require('../lib/unsplash');

const placesPath = path.join(__dirname, '..', 'data', 'places.json');
const DELAY_MS = Number(process.env.UNSPLASH_DELAY_MS) || 1200;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  if (!ACCESS_KEY) {
    console.warn('UNSPLASH_ACCESS_KEY yok — mevcut imageUrl photos[] olarak kopyalanacak.');
  }
  const places = JSON.parse(fs.readFileSync(placesPath, 'utf8'));
  let updated = 0;

  for (let i = 0; i < places.length; i++) {
    const p = places[i];
    if (Array.isArray(p.photos) && p.photos.length >= 5) continue;

    const photos = await fetchPlacePhotos(p, 5);
    if (photos.length) {
      p.photos = photos;
      if (!p.imageUrl && photos[0]) p.imageUrl = photos[0];
      updated += 1;
    } else if (p.imageUrl) {
      p.photos = [p.imageUrl];
    }

    if (ACCESS_KEY && i < places.length - 1) await sleep(DELAY_MS);
    if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${places.length}...`);
  }

  fs.writeFileSync(placesPath, JSON.stringify(places, null, 2), 'utf8');
  console.log('photos[] güncellendi:', updated, '/', places.length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
