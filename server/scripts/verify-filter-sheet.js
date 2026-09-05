/**
 * v2 tasarım-1: Mobil filtre alt çekmecesi (≤900px).
 * Usage: node server/scripts/verify-filter-sheet.js
 * Optional: VERIFY_FILTER_SHEET_URL=http://127.0.0.1:3068 node server/scripts/verify-filter-sheet.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}

console.log('verify-filter-sheet');

const css = fs.readFileSync(path.join(ROOT, 'public', 'css', 'style.css'), 'utf8');
const appJs = fs.readFileSync(path.join(ROOT, 'public', 'js', 'app.js'), 'utf8');
const a11yJs = fs.readFileSync(path.join(ROOT, 'public', 'js', 'a11y.js'), 'utf8');
const i18n = fs.readFileSync(path.join(ROOT, 'public', 'js', 'i18n.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');

if (!indexHtml.includes('id="filterSheet"') || !indexHtml.includes('role="dialog"')) {
  fail('filter sheet dialog missing');
} else ok('filter sheet role=dialog');

if (!indexHtml.includes('aria-modal="true"') || !indexHtml.includes('id="filterSheetTitle"')) {
  fail('aria-modal / labelledby missing');
} else ok('aria-modal + labelledby');

if (!indexHtml.includes('id="filterSheetBackdrop"')) fail('backdrop missing');
else ok('dimmed backdrop');

if (!indexHtml.includes('id="filterSheetApply"') || !indexHtml.includes('data-i18n="filterApply"')) {
  fail('Uygula button missing');
} else ok('Uygula button');

if (!indexHtml.includes('id="filterSheetClose"') || !indexHtml.includes('data-i18n-aria="closeAria"')) {
  fail('Kapat button missing');
} else ok('Kapat button');

const openIds = ['filterSheetOpenExplore', 'filterSheetOpenMap', 'filterSheetOpenDiscover'];
openIds.forEach((id) => {
  if (!indexHtml.includes(`id="${id}"`)) fail(`open trigger ${id} missing`);
  else ok(`open trigger ${id}`);
});

if ((indexHtml.match(/data-i18n="filterSheetOpen"/g) || []).length < 3) {
  fail('Filtrele i18n not on all open triggers');
} else ok('Filtrele i18n on triggers');

if (!indexHtml.includes('id="filterTabWrap"') || !indexHtml.includes('id="discoverFilterStrip"')) {
  fail('existing filter nodes missing');
} else ok('existing filter strip + advanced wrap');

if (!indexHtml.includes('id="cntSel"') || !indexHtml.includes('id="discoverCatStrip"')) {
  fail('country select or discover chips missing');
} else ok('reused country select + discover chips');

const cntSelCount = (indexHtml.match(/id="cntSel"/g) || []).length;
if (cntSelCount !== 1) fail(`duplicate cntSel (${cntSelCount})`);
else ok('single cntSel (no second filter system)');

if (indexHtml.includes('id="filterSheet"') && /<h1[^>]*id="filterSheetTitle"/.test(indexHtml)) {
  fail('sheet title must not be h1');
} else ok('sheet title is not h1');

if (!i18n.includes("filterSheetOpen: 'Filtrele'") || !i18n.includes("filterSheetOpen: 'Filter'")) {
  fail('i18n Filtrele TR/EN missing');
} else ok('i18n Filtrele TR/EN');

if (!i18n.includes("filterApply: 'Uygula'") || !i18n.includes("filterApply: 'Apply'")) {
  fail('i18n Uygula TR/EN missing');
} else ok('i18n Uygula TR/EN');

if (!i18n.includes("closeAria: 'Kapat'") || !i18n.includes("closeAria: 'Close'")) {
  fail('i18n Kapat TR/EN missing');
} else ok('i18n Kapat TR/EN');

if (!css.includes('max-width:900px') || !css.includes('.filter-sheet')) {
  fail('sheet CSS or 900px breakpoint missing');
} else ok('sheet CSS at ≤900px');

if (!css.includes('min-width:901px') && !/@media\(min-width:\s*901px\)[\s\S]*filter-sheet/.test(css)) {
  fail('desktop must hide sheet');
} else ok('desktop hides sheet (≥901px)');

if (!css.includes('html.filter-sheet-open') || !css.includes('overflow:hidden')) {
  fail('sheet scroll-lock CSS missing');
} else ok('filter-sheet-open overflow:hidden');

if (!appJs.includes("document.body.style.overflow = 'hidden'")
  || !appJs.includes('unlockFilterSheetScroll')) {
  fail('JS overflow lock/unlock missing');
} else ok('body overflow hidden on open, unlock on close');

if (!appJs.includes('function openFilterSheet') || !appJs.includes('function closeFilterSheet')) {
  fail('open/close helpers missing');
} else ok('openFilterSheet / closeFilterSheet');

if (!appJs.includes('function applyFilterSheet') || !appJs.includes('applyFilters()')) {
  fail('Uygula must call applyFilters');
} else ok('Uygula calls applyFilters');

if (!appJs.includes('parkFilterNode') || !appJs.includes('unparkFilterNodes')) {
  fail('must move existing filters, not clone');
} else ok('moves existing filter nodes');

if (!appJs.includes('TL_EXPLORE_QUERY') || !appJs.includes('buildExploreSearch')) {
  fail('explore query state must stay wired');
} else ok('TL_EXPLORE_QUERY still used');

if (!appJs.includes("name === 'filter'") || !appJs.includes('isFilterSheetViewport')) {
  fail('mobile Gelişmiş Filtrele tab must open sheet');
} else ok('mobile filter tab opens sheet');

if (!appJs.includes("e.key === 'Escape'") || !appJs.includes('filterSheetFocusables')) {
  fail('Escape / focus trap missing');
} else ok('Escape + focus trap');

if (!a11yJs.includes('.filter-sheet-close')) {
  fail('a11y.js does not name filter-sheet-close');
} else ok('a11y helper includes sheet close');

if (/googleRating|google_rating|gRating/.test(appJs + css)) fail('Google ratings must not appear');
else ok('no Google ratings added');

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 8000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function waitForServer(base, max = 400) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      fetchText(base + '/').then((r) => {
        if (r.status && r.status < 500) resolve();
        else retry();
      }).catch(retry);
    };
    function retry() {
      n += 1;
      if (n > max) reject(new Error('server did not start'));
      else setTimeout(tick, 200);
    }
    tick();
  });
}

async function checkRoutes(base) {
  for (const route of ['/', '/explore', '/gezilecek-yerler']) {
    try {
      const r = await fetchText(base + route);
      if (r.status !== 200) fail(`${route} → ${r.status}`);
      else if (!r.body.includes('id="filterSheet"') || !r.body.includes('Filtrele')) {
        fail(`${route} HTML missing filter sheet`);
      } else ok(`HTTP ${route} 200 + sheet markup`);
    } catch (e) {
      fail(`${route} ${e.message}`);
    }
  }
}

(async () => {
  const external = process.env.VERIFY_FILTER_SHEET_URL;
  if (external) {
    await checkRoutes(external.replace(/\/$/, ''));
  } else {
    const port = process.env.VERIFY_FILTER_SHEET_PORT || '3068';
    const base = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
      env: { ...process.env, PORT: port, NODE_ENV: 'test' },
      stdio: 'ignore',
    });
    try {
      await waitForServer(base);
      await checkRoutes(base);
    } catch (e) {
      fail('local server: ' + e.message);
    } finally {
      child.kill('SIGTERM');
    }
  }

  if (failed) {
    console.error(`verify-filter-sheet: ${failed} failed`);
    process.exit(1);
  }
  console.log('verify-filter-sheet: ok');
})();
