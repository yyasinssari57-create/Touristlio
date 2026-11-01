/**
 * Trip plan reads must await async loaders.
 * loadTripFull / mapPlace used to be passed straight into res.json, which
 * serializes a Promise as {}.
 * Usage: npm run verify:trip-await
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;

function ok(msg) { console.log('  ✓', msg); }
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}

console.log('verify-trip-await');

const src = fs.readFileSync(path.join(ROOT, 'server', 'routes', 'trip-plans.js'), 'utf8');
if (/trip:\s*loadTripFull\(/.test(src)) fail('loadTripFull still passed without await');
else ok('loadTripFull is awaited');
if ((src.match(/await loadTripFull\(/g) || []).length < 3) {
  fail('expected await loadTripFull on share, id, and update');
} else ok('share, id, and update await loadTripFull');
if (!/await Promise\.all\([\s\S]*mapPlace\(row\)/.test(src)) {
  fail('nearby list still maps async mapPlace without await');
} else ok('nearby list awaits mapPlace');
if (/findNearbyPlaces\(\s*all,\s*origin,\s*mapPlace\s*,/.test(src)) {
  fail('async mapPlace still passed into sync haversine');
} else ok('haversine fallback uses a sync place mapper');

const trip = {
  id: 7,
  user_id: 1,
  name: 'İstanbul üç gün',
  visibility: 'public',
  share_token: 'tok123',
  meta: JSON.stringify({ note: 'gerçek' }),
};
const hidden = {
  id: 8,
  user_id: 99,
  name: 'Gizli plan',
  visibility: 'private',
  share_token: 'nope',
  meta: '{}',
};
const trips = [trip, hidden];
const days = [{ id: 11, trip_id: 7, day_number: 1, title: 'Gün 1' }];
const items = [{
  id: 21,
  day_id: 11,
  place_id: 3,
  sort_order: 0,
  name: 'Ayasofya',
  city: 'Istanbul',
  country: 'Turkey',
  category: 'historic',
  lat: 41.0086,
  lng: 28.9802,
  image_url: null,
}];
const places = [
  {
    id: 3,
    name: 'Ayasofya',
    city: 'Istanbul',
    country: 'Turkey',
    category: 'historic',
    lat: 41.0086,
    lng: 28.9802,
    tiola_count: 4,
    tiola_rating: 4.8,
  },
  {
    id: 4,
    name: 'Topkapı',
    city: 'Istanbul',
    country: 'Turkey',
    category: 'historic',
    lat: 41.0115,
    lng: 28.9834,
    tiola_count: 2,
    tiola_rating: 4.5,
  },
];

const dbPath = require.resolve('../db');
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    async placeStats() {
      return { tiolaCount: 3, tiolaRating: 4.6 };
    },
    db: {
      prepare(sql) {
        const text = String(sql);
        return {
          async get(...params) {
            if (text.includes('information_schema')) return undefined;
            if (text.includes('trip_plans') && text.includes('share_token')) {
              return trips.find((row) => row.share_token === params[0]);
            }
            if (text.includes('trip_plans') && text.includes('WHERE id')) {
              return trips.find((row) => row.id === params[0]);
            }
            if (text.includes('FROM places') && text.includes('WHERE id')) {
              return places.find((row) => row.id === Number(params[0]));
            }
            return undefined;
          },
          async all(...params) {
            if (text.includes('trip_plan_days')) return days.filter((row) => row.trip_id === params[0]);
            if (text.includes('trip_plan_items')) return items.filter((row) => row.day_id === params[0]);
            if (text.includes('FROM places')) return places;
            return [];
          },
          async run() {
            return { lastInsertRowid: 1, changes: 1 };
          },
        };
      },
    },
  },
};

const tripPlans = require('../routes/trip-plans');

function fetchJson(base, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${base}${urlPath}`, { timeout: 8000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch { json = null; }
        resolve({ status: res.statusCode, body, json });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`timeout ${urlPath}`));
    });
  });
}

function assertTrip(label, res) {
  const loaded = res.json && res.json.trip;
  if (res.status !== 200) {
    fail(`${label} HTTP ${res.status}`);
    return;
  }
  if (!loaded || loaded.name !== 'İstanbul üç gün') {
    fail(`${label} trip is not the saved plan (${res.body.slice(0, 180)})`);
    return;
  }
  if (!loaded.meta || loaded.meta.note !== 'gerçek') {
    fail(`${label} meta was not parsed`);
    return;
  }
  const day = loaded.days && loaded.days[0];
  const item = day && day.items && day.items[0];
  if (!day || day.title !== 'Gün 1' || !item || item.name !== 'Ayasofya') {
    fail(`${label} days/items missing`);
    return;
  }
  ok(`${label} returns the plan, day, and place`);
}

function assertPlaces(label, res, { expectStats, expectDistance }) {
  const list = res.json && res.json.places;
  if (res.status !== 200 || !Array.isArray(list) || list.length < 1) {
    fail(`${label} missing places (${res.body.slice(0, 180)})`);
    return;
  }
  const place = expectDistance
    ? list.find((row) => row && row.name === 'Topkapı')
    : list[0];
  if (!place || !place.name || typeof place.lat !== 'number') {
    fail(`${label} place is empty (${JSON.stringify(list[0])})`);
    return;
  }
  if (expectStats && place.tiolaCount !== 3) {
    fail(`${label} tiolaCount ${place.tiolaCount} (mapPlace was not applied)`);
    return;
  }
  if (expectDistance && (typeof place.distanceKm !== 'number' || !Number.isFinite(place.distanceKm))) {
    fail(`${label} distanceKm missing (${JSON.stringify(place)})`);
    return;
  }
  ok(label);
}

async function main() {
  const app = express();
  app.use('/api/trip-plans', tripPlans);
  const server = await new Promise((resolve) => {
    const started = app.listen(0, '127.0.0.1', () => resolve(started));
  });
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    assertTrip('GET /share/:token', await fetchJson(base, '/api/trip-plans/share/tok123'));
    assertTrip('GET /:id', await fetchJson(base, '/api/trip-plans/7'));
    const hiddenShare = await fetchJson(base, '/api/trip-plans/share/nope');
    if (hiddenShare.status !== 404) fail(`private share HTTP ${hiddenShare.status}`);
    else ok('private share stays 404');
    const hiddenId = await fetchJson(base, '/api/trip-plans/8');
    if (hiddenId.status !== 404) fail(`private id HTTP ${hiddenId.status}`);
    else ok('private id stays 404');
    assertPlaces(
      'GET /suggest/nearby without origin awaits mapPlace',
      await fetchJson(base, '/api/trip-plans/suggest/nearby'),
      { expectStats: true },
    );
    assertPlaces(
      'GET /suggest/nearby?city uses real places',
      await fetchJson(base, '/api/trip-plans/suggest/nearby?city=Istanbul'),
      { expectDistance: true },
    );
    assertPlaces(
      'GET /suggest/nearby?placeId uses real places',
      await fetchJson(base, '/api/trip-plans/suggest/nearby?placeId=3'),
      { expectDistance: true },
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  if (pkg.scripts['verify:trip-await'] !== 'node server/scripts/verify-trip-await.js') {
    fail('package.json missing verify:trip-await');
  } else ok('verify:trip-await script');

  if (failed) {
    console.error(`verify-trip-await FAILED (${failed})`);
    process.exit(1);
  }
  console.log('verify-trip-await OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
