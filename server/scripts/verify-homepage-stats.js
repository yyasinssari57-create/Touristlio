/**
 * [YÜKSEK-5] Homepage stats: no em-dash placeholders, 0 on empty, loading "...".
 * Usage: node server/scripts/verify-homepage-stats.js
 * Optional: VERIFY_STATS_URL=http://127.0.0.1:3030 node server/scripts/verify-homepage-stats.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { toNonNegInt, getHomepageStats } = require('../lib/stats-cache');

let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}

function isNonNegInt(n) {
  return Number.isInteger(n) && n >= 0;
}

console.log('verify-homepage-stats');

const cases = [
  [null, 0],
  [undefined, 0],
  ['', 0],
  ['—', 0],
  ['–', 0],
  ['-', 0],
  ['...', 0],
  [NaN, 0],
  [-3, 0],
  ['abc', 0],
  [0, 0],
  [12, 12],
  ['7', 7],
  [4.9, 4],
];
for (const [input, expected] of cases) {
  const got = toNonNegInt(input);
  if (got === expected) ok(`toNonNegInt(${JSON.stringify(input)}) = ${expected}`);
  else fail(`toNonNegInt(${JSON.stringify(input)}) expected ${expected}, got ${got}`);
}

const htmlPath = path.join(__dirname, '..', '..', 'public', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const jsPath = path.join(__dirname, '..', '..', 'public', 'js', 'app.js');
const js = fs.readFileSync(jsPath, 'utf8');

if (html.includes('id="stat-countries">—') || html.includes("id='stat-countries'>—")) {
  fail('stat-countries still uses em-dash placeholder');
} else ok('stat-countries HTML is not an em-dash');

if (html.includes('id="stat-places">—')) fail('stat-places still uses em-dash placeholder');
else ok('stat-places HTML is not an em-dash');

if (!html.includes('id="stat-tiolas"')) fail('missing id="stat-tiolas"');
else ok('stat-tiolas id present');

if (/id="stat-(countries|places|tiolas)">\.\.\./.test(html)) ok('loading placeholder is "..."');
else fail('expected "..." loading placeholder on stat numbers');

if (/<div class="sn">Tiola<\/div>/.test(html)) fail('third stat still shows the word Tiola as the number');
else ok('third stat is a numeric slot, not the word Tiola');

if (!js.includes('function toStatCount') || !js.includes('function loadHomepageStats')) {
  fail('app.js missing homepage stats helpers');
} else ok('app.js has toStatCount + loadHomepageStats');

if (/getElementById\('stat-places'\)\.textContent = String\(placesTotal\)/.test(js)) {
  fail('stat-places still overwritten from placesTotal without 0-coercion path');
} else ok('loadCategoryStats no longer writes raw placesTotal into the strip');

if (/sp\.textContent = String\(places\.length\)/.test(js)) {
  fail('updateCategoryCounts still overwrites strip with loaded page length');
} else ok('updateCategoryCounts does not overwrite homepage strip');

const dashAssign = js.match(/stat-(countries|places|tiolas)[\s\S]{0,80}textContent\s*=\s*['"]—['"]/);
if (dashAssign) fail('app.js still assigns em-dash to a homepage stat');
else ok('app.js does not assign em-dash to homepage stats');

const stats = getHomepageStats();
if (stats && isNonNegInt(stats.countries) && isNonNegInt(stats.places) && isNonNegInt(stats.tiolas)) {
  ok(`getHomepageStats integers (countries=${stats.countries}, places=${stats.places}, tiolas=${stats.tiolas})`);
} else {
  fail(`getHomepageStats must return non-negative integers, got ${JSON.stringify(stats)}`);
}
if (stats.countries == null || stats.places == null || stats.tiolas == null) {
  fail('getHomepageStats returned null/undefined field');
} else ok('getHomepageStats has no null fields');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 8000 }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(body) }); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function assertPayload(label, payload) {
  const data = payload && payload.data && payload.success ? payload.data : payload;
  if (!data) {
    fail(`${label} empty payload`);
    return;
  }
  for (const key of ['countries', 'places', 'tiolas']) {
    if (!isNonNegInt(data[key])) fail(`${label}.${key} is not a non-negative integer (${data[key]})`);
    else ok(`${label}.${key} = ${data[key]}`);
  }
  if (Object.values(data).some((v) => v == null)) fail(`${label} has null field`);
}

async function checkLive() {
  const base = process.env.VERIFY_STATS_URL;
  if (!base) {
    ok('skip live HTTP (set VERIFY_STATS_URL to hit a running server)');
    return;
  }
  const root = base.replace(/\/$/, '');
  try {
    const a = await fetchJson(`${root}/api/stats`);
    if (a.status !== 200) fail(`/api/stats HTTP ${a.status}`);
    else ok('/api/stats HTTP 200');
    assertPayload('/api/stats', a.json);
  } catch (e) {
    fail(`/api/stats request failed: ${e.message}`);
  }
  try {
    const b = await fetchJson(`${root}/api/places/stats`);
    if (b.status !== 200) fail(`/api/places/stats HTTP ${b.status}`);
    else ok('/api/places/stats HTTP 200');
    assertPayload('/api/places/stats', b.json);
  } catch (e) {
    fail(`/api/places/stats request failed: ${e.message}`);
  }
}

checkLive().then(() => {
  if (failed) {
    console.error(`verify-homepage-stats: ${failed} failed`);
    process.exit(1);
  }
  console.log('verify-homepage-stats: ok');
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
