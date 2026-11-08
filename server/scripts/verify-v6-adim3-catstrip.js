#!/usr/bin/env node
/**
 * V6 Adım 3 — Gezilecek Yerler üst kategori şeridi (#discoverCatStrip) kaldırıldı.
 * Çipler gizli host'ta; mobil filtre çekmecesi park etmeye devam eder.
 * /explore?category=... ve Gelişmiş Filtre korunur. Veri birleştirme YOK.
 *
 * Usage: npm run verify:v6-adim3
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const PORT = process.env.VERIFY_V6_ADIM3_PORT || '3193';
const SHOT_DIR = process.env.VERIFY_V6_ADIM3_SHOT_DIR
  || path.join('/tmp', 'adim3-shots');

let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) { console.error('  ✗', msg); failed += 1; }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

console.log('verify-v6-adim3-catstrip');

const indexHtml = read('public/index.html');
const appJs = read('public/js/app.js');
const discoverJs = read('public/js/discover-places.js');
const css = read('public/css/style.css');
const exploreQuery = read('public/js/explore-query.js');

// 1) Strip not on Gezilecek Yerler page
const placesMatch = indexHtml.match(/id="page-places"[\s\S]*?(?=\n<!-- ═|<div class="page"|$)/);
if (!placesMatch) fail('page-places block not found');
else if (/id="discoverCatStrip"/.test(placesMatch[0])) {
  fail('discoverCatStrip still inside page-places');
} else ok('discoverCatStrip removed from Gezilecek Yerler page');

// 2) Hidden host keeps node for mobile sheet park
if (!/id="exploreFilterChipHost"[\s\S]*?id="discoverCatStrip"/.test(indexHtml)) {
  fail('discoverCatStrip missing from exploreFilterChipHost');
} else ok('discoverCatStrip in exploreFilterChipHost');

// 3) No page-level strip layout (gap/jump)
if (/\.discover-page\s+\.discover-cat-strip\{display:none;\}/.test(css)) {
  fail('stale .discover-page .discover-cat-strip hide rule still present');
} else ok('no page-level discover-cat-strip hide rule');
if (/^\.discover-cat-strip\{display:flex/m.test(css)) {
  fail('page-level .discover-cat-strip flex rule should be gone');
} else ok('no page-level .discover-cat-strip flex layout');
if (!/\.filter-sheet-body\s+\.discover-cat-strip\{/.test(css)) {
  fail('sheet body .discover-cat-strip style missing');
} else ok('sheet still styles discover-cat-strip');

// 4) Mobile sheet still parks discoverCatStrip on places
if (!appJs.includes("parkFilterNode(document.getElementById('discoverCatStrip'))")) {
  fail('fillFilterSheet must still park discoverCatStrip on places');
} else ok('fillFilterSheet parks discoverCatStrip');
if (!discoverJs.includes("getElementById('discoverCatStrip')")
  || !discoverJs.includes('function renderCategoryFilters')) {
  fail('discover-places must still render chips into host for sheet');
} else ok('discover-places renders chips into host');

// 5) Explore category query + advanced filter strip intact
if (!exploreQuery.includes("'category'") && !exploreQuery.includes('"category"')) {
  fail('explore-query must keep category param');
} else ok('explore-query keeps category');
if (!appJs.includes('buildExploreFiltersHtml') || !appJs.includes('TL_EXPLORE_QUERY')) {
  fail('explore filter / query wiring missing');
} else ok('explore filter wiring intact');
if (!appJs.includes('categoryNavFaceDuplicate') || !appJs.includes('navLabelKey')) {
  fail('advanced filter dedupe helpers missing');
} else ok('advanced filter label dedupe helpers present');
if (!indexHtml.includes('id="filterTabWrap"') || !indexHtml.includes('id="filterSheet"')) {
  fail('Gelişmiş Filtre / mobil sheet missing');
} else ok('Gelişmiş Filtre + mobil sheet present');

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

function chromeBin() {
  const fromEnv = process.env.CHROME_PATH;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  for (const candidate of [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/local/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return '';
}

function connectCdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let seq = 0;
  const pending = new Map();
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve());
    ws.addEventListener('error', () => reject(new Error('CDP websocket failed')));
  });
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const slot = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) slot.reject(new Error(JSON.stringify(msg.error)));
      else slot.resolve(msg.result);
    }
  });
  return {
    ready,
    send(method, params = {}, sessionId) {
      const id = ++seq;
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify(payload));
      });
    },
    close() { try { ws.close(); } catch { /* ignore */ } },
  };
}

function navLabelKey(label) {
  const text = String(label || '')
    .replace(/[^\p{L}\p{N}-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('tr-TR');
  return text.replace(/(ler|lar|s)$/u, '');
}

/** Report-only duplicate inventory — does not mutate DB. */
function reportCategoryDupes(meta) {
  const groups = meta.groups || [];
  const cats = meta.categories || meta.discover || [];
  const groupLabels = {
    historical: 'Tarihi',
    nature: 'Doğa',
    museums: 'Müzeler',
    restaurants: 'Yeme-İçme',
    hotels: 'Oteller',
    activities: 'Aktiviteler',
  };
  console.log('\n  --- Kategori çiftleri (rapor; veri DEĞİŞMEDİ) ---');
  const pairs = [
    { a: 'group:historical (Tarihi)', b: 'historical (Tarihi) / landmark (Simge yapı)', why: 'grup + kat aynı yüz' },
    { a: 'group:nature (Doğa)', b: 'nature (Doğa)', why: 'grup + kat aynı etiket' },
    { a: 'group:museums (Müzeler)', b: 'museum (Müze)', why: 'çoğul/tekil aynı yüz' },
    { a: 'group:restaurants (Yeme-İçme)', b: 'restaurant (Restoran) / food (Yemek)', why: 'yemek ailesi üçlü' },
    { a: 'group:activities (Aktiviteler)', b: 'adventure (Macera) / entertainment (Eğlence)', why: 'aktivite şemsiyesi' },
  ];
  pairs.forEach((p) => console.log(`  · ${p.a} ↔ ${p.b} — ${p.why}`));
  console.log('  Öneri (onay bekler, uygulanmadı):');
  console.log('    1) historical+landmark → tek "Tarihi / Simge" veya landmark slug\'ını historical altında tut');
  console.log('    2) restaurant+food → food\'u restaurant\'a bağla / food pasif');
  console.log('    3) museum vs museums: UI\'da tek etiket (zaten face-dedupe)');
  console.log('    4) entertainment+adventure → activities grubunda kalsın, ayrı çip gösterme');
  console.log('  API groups:', groups.map((g) => groupLabels[g] || g).join(', ') || '(yok)');
  console.log('  API categories:', cats.map((c) => `${c.slug}=${c.nameTr}`).join(', ') || '(yok)');
  const keys = new Map();
  cats.forEach((c) => {
    const key = navLabelKey(c.nameTr);
    if (!key) return;
    if (!keys.has(key)) keys.set(key, []);
    keys.get(key).push(c.slug);
  });
  const sameFace = [...keys.entries()].filter(([, slugs]) => slugs.length > 1);
  if (sameFace.length) {
    console.log('  Aynı etiket yüzü (kat-kat):', sameFace.map(([k, s]) => `${k}:{${s.join(',')}}`).join('; '));
  } else {
    console.log('  Kat-kat aynı TR etiket yok; asıl çakışma group↔category yüzleri.');
  }
  console.log('  ---\n');
}

async function browserChecks(base) {
  const bin = chromeBin();
  if (!bin) {
    fail('Chrome/Chromium yok — tarayıcı doğrulaması atlandı');
    return;
  }
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const chrome = spawn(bin, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--remote-debugging-port=9233',
    '--window-size=1280,900',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] });
  let version = null;
  for (let i = 0; i < 50; i += 1) {
    try {
      const r = await fetchText('http://127.0.0.1:9233/json/version');
      version = JSON.parse(r.body);
      break;
    } catch {
      await sleep(200);
    }
  }
  if (!version?.webSocketDebuggerUrl) {
    chrome.kill('SIGTERM');
    fail('CDP açılamadı');
    return;
  }
  const cdp = connectCdp(version.webSocketDebuggerUrl);
  try {
    await cdp.ready;
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const s = (method, params) => cdp.send(method, params, sessionId);
    await s('Page.enable');
    await s('Runtime.enable');

    for (const [name, w, h] of [
      ['after-gezilecek-1280', 1280, 900],
      ['after-gezilecek-390', 390, 844],
    ]) {
      await s('Emulation.setDeviceMetricsOverride', {
        width: w, height: h, deviceScaleFactor: 1, mobile: w < 800,
      });
      await s('Page.navigate', { url: `${base}/gezilecek-yerler` });
      await sleep(2800);
      const probe = await s('Runtime.evaluate', {
        expression: `(() => {
          const strip = document.getElementById('discoverCatStrip');
          const inPlaces = !!document.querySelector('#page-places #discoverCatStrip');
          const host = document.getElementById('exploreFilterChipHost');
          const inHost = !!(host && strip && host.contains(strip));
          const sheet = document.getElementById('filterSheetBody');
          const rect = strip ? strip.getBoundingClientRect() : null;
          const visible = !!(strip && rect && rect.width > 0 && rect.height > 0
            && getComputedStyle(strip).display !== 'none'
            && getComputedStyle(strip).visibility !== 'hidden');
          const list = document.getElementById('discoverPlaceList');
          const gap = list ? getComputedStyle(list).marginTop : '';
          return { inPlaces, inHost, visible, chipCount: strip ? strip.children.length : 0, gap };
        })()`,
        returnByValue: true,
      });
      const info = probe.result?.value || {};
      if (info.inPlaces) fail(`${name}: strip still under page-places`);
      else ok(`${name}: strip not under page-places`);
      if (!info.inHost) fail(`${name}: strip not in hidden host`);
      else ok(`${name}: strip in hidden host`);
      if (info.visible) fail(`${name}: strip still visibly laid out on page`);
      else ok(`${name}: strip not visible on page`);

      const shot = await s('Page.captureScreenshot', { format: 'png' });
      const out = path.join(SHOT_DIR, `${name}.png`);
      fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
      ok(`screenshot ${out}`);
    }

    // Mobile sheet on places still gets chips
    await s('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
    });
    await s('Page.navigate', { url: `${base}/gezilecek-yerler` });
    await sleep(2500);
    await s('Runtime.evaluate', {
      expression: `document.getElementById('filterSheetOpenDiscover')?.click()`,
      returnByValue: true,
    });
    await sleep(800);
    const sheetProbe = await s('Runtime.evaluate', {
      expression: `(() => {
        const body = document.getElementById('filterSheetBody');
        const strip = document.getElementById('discoverCatStrip');
        const parked = !!(body && strip && body.contains(strip));
        const chips = strip ? strip.querySelectorAll('.discover-cat-chip').length : 0;
        return { parked, chips, sheetOpen: document.getElementById('filterSheet')?.classList.contains('is-open') };
      })()`,
      returnByValue: true,
    });
    const sp = sheetProbe.result?.value || {};
    if (!sp.parked || !sp.chips) fail(`mobil sheet park/chips: ${JSON.stringify(sp)}`);
    else ok(`mobil Filtrele sheet parks ${sp.chips} discover chips`);

    // /explore?category= nature must still apply
    await s('Emulation.setDeviceMetricsOverride', {
      width: 1280, height: 900, deviceScaleFactor: 1, mobile: false,
    });
    await s('Page.navigate', { url: `${base}/explore?category=nature` });
    await sleep(2800);
    const exploreProbe = await s('Runtime.evaluate', {
      expression: `(() => {
        const parsed = window.TL_EXPLORE_QUERY?.parseExploreSearch?.(location.search) || {};
        const fromUrl = new URLSearchParams(location.search).get('category') || '';
        const onPill = !!document.querySelector(
          '#discoverFilterStrip .fpill-cat.on[data-filter="nature"], #mapFilterStrip .fpill-cat.on[data-filter="nature"]'
        );
        return { parsedCategory: parsed.category || '', fromUrl, onPill, path: location.pathname };
      })()`,
      returnByValue: true,
    });
    const ep = exploreProbe.result?.value || {};
    const catOk = String(ep.parsedCategory || ep.fromUrl).toLowerCase() === 'nature';
    if (!catOk) fail(`/explore?category=nature not applied: ${JSON.stringify(ep)}`);
    else ok(`/explore?category=nature still applies (${ep.onPill ? 'pill on' : 'URL/state'})`);

    // Duplicate inventory from live API
    const metaRes = await fetchText(`${base}/api/places/meta/categories`);
    const metaJson = JSON.parse(metaRes.body);
    reportCategoryDupes(metaJson.data || metaJson);
  } finally {
    cdp.close();
    chrome.kill('SIGTERM');
  }
}

(async () => {
  const external = process.env.VERIFY_V6_ADIM3_URL;
  let base = external ? external.replace(/\/$/, '') : null;
  let child = null;
  try {
    if (!base) {
      base = `http://127.0.0.1:${PORT}`;
      child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
        env: { ...process.env, PORT, NODE_ENV: 'test' },
        stdio: 'ignore',
      });
      await waitForServer(base);
    }
    for (const route of ['/gezilecek-yerler', '/explore', '/explore?category=nature']) {
      const r = await fetchText(base + route);
      if (r.status !== 200) fail(`${route} → ${r.status}`);
      else ok(`HTTP ${route} 200`);
    }
    await browserChecks(base);
  } catch (e) {
    fail(e.message || String(e));
  } finally {
    if (child) child.kill('SIGTERM');
  }

  if (failed) {
    console.error(`verify-v6-adim3-catstrip: ${failed} failed`);
    process.exit(1);
  }
  console.log('verify-v6-adim3-catstrip: ok');
})();
