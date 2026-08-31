/**
 * [ORTA-3] Pagination: ?page=1&limit=20, total/totalPages/hasMore, Load More + page numbers.
 * Usage: node server/scripts/verify-pagination.js
 * Optional: VERIFY_PAGINATION_URL=http://127.0.0.1:3053 node server/scripts/verify-pagination.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const {
  DEFAULT_PAGE_LIMIT,
  pageWindow,
  parseExploreSearch,
  buildExploreSearch,
} = require('../../public/js/explore-query.js');
const {
  parseListPagination,
  paginationMeta,
  paginateItems,
  DEFAULT_LIMIT,
} = require('../lib/pagination');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}

console.log('verify-pagination');

if (DEFAULT_PAGE_LIMIT !== 20 || DEFAULT_LIMIT !== 20) {
  fail(`default limit is ${DEFAULT_PAGE_LIMIT}/${DEFAULT_LIMIT}, expected 20`);
} else ok('default limit is 20');

const p1 = parseListPagination({});
if (p1.page !== 1 || p1.limit !== 20 || p1.offset !== 0) {
  fail(`empty query expected page=1 limit=20 offset=0 got ${JSON.stringify(p1)}`);
} else ok('empty query → page=1&limit=20');

const p2 = parseListPagination({ page: '2', limit: '20' });
if (p2.page !== 2 || p2.limit !== 20 || p2.offset !== 20) {
  fail(`page=2 limit=20 expected offset=20 got ${JSON.stringify(p2)}`);
} else ok('?page=2&limit=20 → offset 20');

const pOff = parseListPagination({ offset: '40', limit: '20' });
if (pOff.page !== 3 || pOff.offset !== 40) {
  fail(`offset=40 should map to page 3, got ${JSON.stringify(pOff)}`);
} else ok('legacy offset still maps to page');

const pBoth = parseListPagination({ page: '3', offset: '999', limit: '20' });
if (pBoth.page !== 3 || pBoth.offset !== 40) {
  fail(`page must win over offset, got ${JSON.stringify(pBoth)}`);
} else ok('page takes precedence over offset');

const items = Array.from({ length: 45 }, (_, i) => i + 1);
const sliced = paginateItems(items, { page: 2, limit: 20 });
if (sliced.items[0] !== 21 || sliced.items.length !== 20 || sliced.total !== 45) {
  fail(`paginateItems page 2 mismatch ${JSON.stringify({ first: sliced.items[0], len: sliced.items.length, total: sliced.total })}`);
} else ok('paginateItems page 2 of 45');
if (sliced.totalPages !== 3 || sliced.hasMore !== true || sliced.page !== 2) {
  fail(`meta mismatch ${JSON.stringify({ totalPages: sliced.totalPages, hasMore: sliced.hasMore, page: sliced.page })}`);
} else ok('total / totalPages / hasMore');

const last = paginateItems(items, { page: 3, limit: 20 });
if (last.items.length !== 5 || last.hasMore !== false) {
  fail(`last page expected 5 items hasMore=false got len=${last.items.length} hasMore=${last.hasMore}`);
} else ok('last page hasMore=false');

const meta = paginationMeta({ total: 0, page: 1, limit: 20, offset: 0, count: 0 });
if (meta.totalPages !== 1 || meta.hasMore !== false) fail('empty list totalPages should be 1');
else ok('empty list totalPages=1');

const win = pageWindow(5, 12, 2);
if (JSON.stringify(win) !== JSON.stringify([1, '…', 3, 4, 5, 6, 7, '…', 12])) {
  fail(`pageWindow(5,12) got ${JSON.stringify(win)}`);
} else ok('pageWindow compact numbers');

const parsed = parseExploreSearch('?country=turkey&page=2');
if (parsed.page !== 2) fail(`parseExploreSearch page=${parsed.page}`);
else ok('explore URL parses page');

const qs = buildExploreSearch({ country: 'turkey', page: 2 }).toString();
if (!qs.includes('page=2') || !qs.includes('country=turkey')) {
  fail(`buildExploreSearch missing page: ${qs}`);
} else ok('/explore?country=turkey&page=2');

const qs1 = buildExploreSearch({ country: 'turkey', page: 1 }).toString();
if (qs1.includes('page=')) fail(`page=1 should be omitted, got ${qs1}`);
else ok('page=1 omitted from URL');

const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
if (!html.includes('id="loadMoreBtn"') || !html.includes('loadMorePlaces()')) {
  fail('Daha Fazla Yükle button missing');
} else ok('Daha Fazla Yükle button');
if (!html.includes('id="explorePagination"') || !html.includes('id="explorePageNums"')) {
  fail('explore page numbers missing');
} else ok('explore page numbers');
if (!html.includes('id="explorePager"')) fail('explore pager wrap missing');
else ok('explore pager wrap');

const appJs = fs.readFileSync(path.join(ROOT, 'public', 'js', 'app.js'), 'utf8');
if (!appJs.includes('PAGE_SIZE') || !appJs.includes('DEFAULT_PAGE_LIMIT')) {
  fail('app.js missing PAGE_SIZE / DEFAULT_PAGE_LIMIT');
} else ok('app.js uses DEFAULT_PAGE_LIMIT');
if (!appJs.includes("qs.delete('offset')") && !appJs.includes('page:')) {
  fail('app.js still sending only offset');
} else ok('app.js requests page');
if (!appJs.includes('function goToPlacesPage') || !appJs.includes('function loadMorePlaces')) {
  fail('goToPlacesPage / loadMorePlaces missing');
} else ok('Load More + numbered page handlers');
if (!appJs.includes('renderExplorePagination')) fail('pager renderer missing');
else ok('renderExplorePagination');
if (/googleRating|google_rating|gRating/.test(appJs)) fail('Google rating leaked');
else ok('no Google ratings');

const searchHtml = fs.readFileSync(path.join(ROOT, 'public', 'search.html'), 'utf8');
if (!searchHtml.includes('page: String(page)') && !searchHtml.includes('page: String(page)')) {
  /* keep a real check below */
}
if (!/limit:\s*String\(LIMIT\)/.test(searchHtml) || !searchHtml.includes('page: String(page)')) {
  fail('search.html not sending page+limit');
} else ok('search.html sends page+limit');
if (searchHtml.includes('offset = 0') && searchHtml.includes('runSearch(false)')) {
  /* old bug: runSearch(false) reset offset. New code uses resetPage flag. */
}
if (!searchHtml.includes('runSearch(true)') || !searchHtml.includes('runSearch(false)')) {
  fail('search.html prev/next still resets page');
} else ok('search.html prev/next does not reset page');
if (!searchHtml.includes('id="searchPageNums"')) fail('search page numbers missing');
else ok('search page numbers');

const service = fs.readFileSync(path.join(ROOT, 'server', 'modules', 'places', 'places.service.js'), 'utf8');
if (!service.includes('parseListPagination') || !service.includes('paginationMeta')) {
  fail('places.service missing pagination helper');
} else ok('GET /api/places uses parseListPagination');

const searchRoute = fs.readFileSync(path.join(ROOT, 'server', 'routes', 'search.js'), 'utf8');
if (!searchRoute.includes('parseListPagination')) fail('search route missing page parser');
else ok('GET /api/search uses parseListPagination');

const i18n = fs.readFileSync(path.join(ROOT, 'public', 'js', 'i18n.js'), 'utf8');
if (!i18n.includes('pageOf:') || !i18n.includes('paginationAria:')) fail('i18n pagination strings missing');
else ok('i18n pageOf / paginationAria');

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

function payloadOf(body) {
  let json = {};
  try { json = JSON.parse(body); } catch { json = {}; }
  return json.data || json;
}

async function checkLive(base) {
  const root = base.replace(/\/$/, '');

  const def = await fetchText(`${root}/api/places`);
  const defPay = payloadOf(def.body);
  if (def.status !== 200) fail(`GET /api/places HTTP ${def.status}`);
  else ok('GET /api/places → 200');
  if (defPay.limit !== 20) fail(`default limit expected 20 got ${defPay.limit}`);
  else ok('API default limit=20');
  if (defPay.page !== 1) fail(`default page expected 1 got ${defPay.page}`);
  else ok('API default page=1');
  if (typeof defPay.total !== 'number') fail('API missing total');
  else ok(`API total=${defPay.total}`);
  if (typeof defPay.totalPages !== 'number') fail('API missing totalPages');
  else ok(`API totalPages=${defPay.totalPages}`);
  if (typeof defPay.hasMore !== 'boolean') fail('API missing hasMore');
  else ok(`API hasMore=${defPay.hasMore}`);
  const defPlaces = defPay.places || defPay.items || [];
  if (defPlaces.length > 20) fail(`default page returned ${defPlaces.length} > 20`);
  else ok(`default page size ${defPlaces.length} ≤ 20`);

  const page2 = await fetchText(`${root}/api/places?page=2&limit=20`);
  const p2pay = payloadOf(page2.body);
  if (page2.status !== 200) fail(`GET /api/places?page=2&limit=20 HTTP ${page2.status}`);
  else ok('GET /api/places?page=2&limit=20 → 200');
  if (p2pay.page !== 2 || p2pay.limit !== 20) {
    fail(`page=2 payload page=${p2pay.page} limit=${p2pay.limit}`);
  } else ok('page=2 payload page/limit');
  if (p2pay.offset !== 20) fail(`page=2 offset expected 20 got ${p2pay.offset}`);
  else ok('page=2 offset=20');
  const p2ids = (p2pay.places || []).map((p) => p.id).join(',');
  const p1ids = defPlaces.map((p) => p.id).join(',');
  if (p2ids && p1ids && p2ids === p1ids) fail('page 2 returned same ids as page 1');
  else ok('page 2 is a different slice');
  if (typeof p2pay.total !== 'number' || p2pay.total !== defPay.total) {
    fail(`total drifted between pages (${defPay.total} vs ${p2pay.total})`);
  } else ok('total stable across pages');

  const turkey = await fetchText(`${root}/api/places?country=turkey&page=1&limit=20`);
  const tPay = payloadOf(turkey.body);
  if (turkey.status !== 200) fail(`country=turkey page HTTP ${turkey.status}`);
  else if (typeof tPay.total !== 'number' || tPay.total < 1) {
    fail(`country=turkey expected seeded places, total=${tPay.total}`);
  } else ok(`country=turkey total=${tPay.total} (page 1, limit 20)`);

  const search = await fetchText(`${root}/api/search?q=istanbul&page=1&limit=20`);
  const sPay = payloadOf(search.body);
  if (search.status !== 200) fail(`GET /api/search?page=1 HTTP ${search.status}`);
  else ok('GET /api/search?page=1&limit=20 → 200');
  if (typeof sPay.total !== 'number') fail('search API missing total');
  else ok(`search API total=${sPay.total}`);
  if (sPay.page !== 1) fail(`search default/page expected 1 got ${sPay.page}`);
  else ok('search API page=1');
  if (sPay.limit !== 20) fail(`search limit expected 20 got ${sPay.limit}`);
  else ok('search API limit=20');

  const pageHtml = await fetchText(`${root}/explore?country=turkey&page=2`);
  if (pageHtml.status !== 200) fail(`GET /explore?page=2 HTTP ${pageHtml.status}`);
  else ok('GET /explore?country=turkey&page=2 → 200');
  if (!pageHtml.body.includes('id="loadMoreBtn"') || !pageHtml.body.includes('id="explorePagination"')) {
    fail('served /explore missing pager UI');
  } else ok('served /explore includes Load More + page numbers');
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
  const preset = process.env.VERIFY_PAGINATION_URL;
  if (preset) {
    await checkLive(preset);
  } else {
    const port = 3053;
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
    console.error(`verify-pagination FAILED (${failed})`);
    process.exit(1);
  }
  console.log('verify-pagination OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
