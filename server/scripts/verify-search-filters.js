/**
 * [ORTA-2] Search/filter state: 300ms debounce, /explore query params, count, clear-all.
 * Usage: node server/scripts/verify-search-filters.js
 * Optional: VERIFY_FILTERS_URL=http://127.0.0.1:3052 node server/scripts/verify-search-filters.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const {
  SEARCH_DEBOUNCE_MS,
  slugifyFilter,
  buildExploreSearch,
  parseExploreSearch,
  hasExploreFilters,
  explorePathWithQuery,
} = require('../../public/js/explore-query.js');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}

console.log('verify-search-filters');

if (SEARCH_DEBOUNCE_MS !== 300) fail(`debounce is ${SEARCH_DEBOUNCE_MS}, expected 300`);
else ok('debounce is 300ms');

if (slugifyFilter('Turkey 🇹🇷') !== 'turkey') fail(`slugify Turkey → ${slugifyFilter('Turkey 🇹🇷')}`);
else ok('country slug turkey');
if (slugifyFilter('İstanbul') !== 'istanbul') fail(`slugify İstanbul → ${slugifyFilter('İstanbul')}`);
else ok('city slug istanbul');

const example = buildExploreSearch({
  country: 'Turkey 🇹🇷',
  category: 'nature',
  score: 4,
}).toString();
if (example !== 'country=turkey&category=nature&score=4') {
  fail(`expected country=turkey&category=nature&score=4 got ${example}`);
} else ok('/explore?country=turkey&category=nature&score=4 query builder');

const parsed = parseExploreSearch('?country=turkey&category=nature&score=4');
if (parsed.country !== 'turkey' || parsed.category !== 'nature' || parsed.score !== 4) {
  fail(`parse mismatch ${JSON.stringify(parsed)}`);
} else ok('parseExploreSearch round-trip');

if (parseExploreSearch('?minTiola=4.5').score !== 4.5) fail('minTiola alias not parsed');
else ok('score alias minTiola');

const empty = buildExploreSearch({
  country: '', category: 'all', score: 0, sort: 'popularity', q: '',
}).toString();
if (empty !== '') fail(`empty state leaked query: ${empty}`);
else ok('empty filters omit query');

if (hasExploreFilters({ country: 'turkey' }) !== true) fail('hasExploreFilters true');
else ok('hasExploreFilters detects country');
if (hasExploreFilters({}) !== false) fail('hasExploreFilters false');
else ok('hasExploreFilters empty');

if (explorePathWithQuery({ country: 'turkey', category: 'nature', score: 4 }) !== '/explore?country=turkey&category=nature&score=4') {
  fail('explorePathWithQuery TR');
} else ok('explorePathWithQuery');
if (explorePathWithQuery({ country: 'turkey' }, 'en') !== '/en/explore?country=turkey') {
  fail('explorePathWithQuery EN');
} else ok('EN /en/explore?country=turkey');

const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
if (!html.includes('id="clearFiltersBtn"') || !html.includes('filterClear')) {
  fail('Filtreler Temizle button missing');
} else ok('Filtreler Temizle button');
if (!html.includes('id="resCnt"') || !html.includes('placesFound')) {
  fail('yer bulundu counter missing');
} else ok('X yer bulundu counter');
if (!html.includes('aria-live="polite"')) fail('places found not live');
else ok('places found aria-live');
if (!html.includes('/js/explore-query.js')) fail('explore-query.js not loaded');
else ok('explore-query.js script');
if (!html.includes('data-act="onSearch"')) fail('hero search data-act missing');
else ok('hero search live input');
if (!html.includes('data-act="resetFilters"')) fail('resetFilters not wired');
else ok('resetFilters wired');

const appJs = fs.readFileSync(path.join(ROOT, 'public', 'js', 'app.js'), 'utf8');
if (!appJs.includes('SEARCH_DEBOUNCE_MS')) fail('app.js missing debounce constant');
else ok('app.js uses SEARCH_DEBOUNCE_MS');
if (!/searchTimer = setTimeout\([\s\S]{0,80}SEARCH_DEBOUNCE_MS\s*\)/.test(appJs)
  && !appJs.includes(', SEARCH_DEBOUNCE_MS)')) {
  fail('onSearch not debounced with SEARCH_DEBOUNCE_MS');
} else ok('onSearch debounce 300ms');
if (!appJs.includes('applyFilters()') || !appJs.includes('function onSearch')) {
  fail('onSearch must refresh results');
} else ok('onSearch triggers applyFilters');
if (!appJs.includes('buildExploreSearch') || !appJs.includes("path = '/explore'")) {
  fail('filters not written to /explore query');
} else ok('writeRouteToUrl uses /explore + query');
if (!appJs.includes('restoreExploreFiltersFromUrl')) fail('URL restore missing');
else ok('restore filters from URL');
if (!appJs.includes('function resetFilters')) fail('resetFilters missing');
else ok('resetFilters');
if (!appJs.includes('updatePlacesFoundCount')) fail('dynamic count helper missing');
else ok('dynamic yer bulundu updater');
if (/googleRating|google_rating|gRating/.test(appJs)) fail('Google rating leaked');
else ok('no Google ratings');
if (appJs.includes('syncFilterChipState')) fail('resetFilters still calls missing syncFilterChipState');
else ok('broken syncFilterChipState call removed');

const searchHtml = fs.readFileSync(path.join(ROOT, 'public', 'search.html'), 'utf8');
if (!searchHtml.includes('SEARCH_DEBOUNCE_MS = 300')) fail('search.html debounce not 300');
else ok('search.html debounce 300ms');
if (!searchHtml.includes('id="searchClear"')) fail('search.html missing clear button');
else ok('search.html Filtreler Temizle');

const routes = fs.readFileSync(path.join(ROOT, 'server', 'lib', 'send-public-html.js'), 'utf8');
if (!routes.includes("'/explore': 'index.html'")) fail('/explore not in HTML_PAGE_ROUTES');
else ok('/explore serves index.html');

const placesService = fs.readFileSync(path.join(ROOT, 'server', 'modules', 'places', 'places.service.js'), 'utf8');
if (!placesService.includes('queryParams.score')) fail('places API missing score alias');
else ok('GET /api/places accepts score');

const searchJs = fs.readFileSync(path.join(ROOT, 'server', 'lib', 'places-search.js'), 'utf8');
if (!searchJs.includes('LOWER(p.country) LIKE')) fail('country slug SQL filter missing');
else ok('country slug matches Turkey');

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 8000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function waitForServer(base, max = 40) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      n += 1;
      const req = http.get(`${base}/api/health`, { timeout: 1000 }, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (n >= max) reject(new Error('server did not start'));
        else setTimeout(tick, 150);
      });
      req.on('timeout', () => {
        req.destroy();
        if (n >= max) reject(new Error('server did not start'));
        else setTimeout(tick, 150);
      });
    };
    tick();
  });
}

async function checkLive(base) {
  const root = base.replace(/\/$/, '');
  const page = await fetchText(`${root}/explore?country=turkey&category=nature&score=4`);
  if (page.status !== 200) fail(`GET /explore?... HTTP ${page.status}`);
  else ok('GET /explore?country=turkey&category=nature&score=4 → 200');
  if (!page.body.includes('explore-query.js')) fail('served /explore missing explore-query.js');
  else ok('served /explore includes explore-query.js');
  if (!page.body.includes('id="clearFiltersBtn"')) fail('served /explore missing clear button');
  else ok('served /explore includes Filtreler Temizle');
  if (!page.body.includes('id="resCnt"')) fail('served /explore missing resCnt');
  else ok('served /explore includes yer bulundu');

  const turkey = await fetchText(`${root}/api/places?country=turkey&limit=12`);
  let turkeyJson = {};
  try { turkeyJson = JSON.parse(turkey.body); } catch { turkeyJson = {}; }
  const turkeyPayload = turkeyJson.data || turkeyJson;
  if (turkey.status !== 200) fail(`GET /api/places?country=turkey HTTP ${turkey.status}`);
  else if (typeof turkeyPayload.total !== 'number' || turkeyPayload.total < 1) {
    fail(`country=turkey expected seeded places, total=${turkeyPayload.total}`);
  } else ok(`country=turkey total=${turkeyPayload.total} (slug match)`);

  const api = await fetchText(`${root}/api/places?country=turkey&category=nature&score=4&limit=12`);
  let json = {};
  try { json = JSON.parse(api.body); } catch { json = {}; }
  if (api.status !== 200) fail(`GET /api/places score filter HTTP ${api.status}`);
  else ok('GET /api/places?country=turkey&category=nature&score=4 → 200');
  const payload = json.data || json;
  if (typeof payload.total !== 'number') fail('places API missing total');
  else ok(`places API total=${payload.total}`);
  const places = payload.places || payload.items || [];
  const badScore = places.filter((p) => p.tiolaRating != null && Number(p.tiolaRating) < 4);
  if (badScore.length) fail('score=4 returned places below 4 Tiola');
  else ok('score=4 keeps Tiola ≥ 4 (user-generated, not Google)');
  const badCountry = places.filter((p) => {
    const c = String(p.country || '').toLowerCase();
    return c && !c.includes('turkey') && !c.includes('türkiye') && !c.includes('turkiye');
  });
  if (badCountry.length) fail(`country=turkey leaked ${badCountry[0] && badCountry[0].country}`);
  else ok('country=turkey filters to Turkey');
}

function spawnServer(port) {
  return spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'development',
      SITEMAP_ON_START: 'false',
      LIVE_DATA_CRON: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function main() {
  const preset = process.env.VERIFY_FILTERS_URL;
  if (preset) {
    await checkLive(preset);
  } else {
    const port = 3052;
    const child = spawnServer(port);
    let stderr = '';
    child.stderr.on('data', (c) => { stderr += c; });
    const base = `http://127.0.0.1:${port}`;
    try {
      await waitForServer(base, 50);
      await checkLive(base);
    } catch (e) {
      fail(`live server :${port}: ${e.message}${stderr ? ` (${stderr.slice(0, 220)})` : ''}`);
    } finally {
      child.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 200));
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
    }
  }

  if (failed) {
    console.error(`verify-search-filters FAILED (${failed})`);
    process.exit(1);
  }
  console.log('verify-search-filters OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
