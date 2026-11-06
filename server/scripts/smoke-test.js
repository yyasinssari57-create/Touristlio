/**
 * V4 Adım 16 — sayfa duman testi.
 *
 * Usage:
 *   npm run test:smoke
 *   SMOKE_BASE_URL=https://www.touristlio.com npm run test:smoke
 *
 * Kontroller:
 * - /blog ve /en/blog: [object Object] yok. /en/blog Türkçe başlık göstermez.
 * - localStorage tl_lang=en iken /blog adresi değişmez.
 * - Genel sayfalarda tam 1 h1.
 * - /sitemap.xml 200, XML, /search yok, lastmod değerleri birbirinden farklı.
 * - 320 ve 390 px genişlikte sayfa yana kaymaz.
 * - Giriş yapmadan /api/admin GET → 401 veya 403.
 *
 * Chrome gerekir. SMOKE_BASE_URL yoksa yerel sunucu açılır (.env DATABASE_URL).
 * Canlı adreste yalnızca GET. Silme, geri yükleme ve yedek indirme yok.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const WIDTHS = [320, 390];
const ADMIN_GETS = [
  '/api/admin/stats',
  '/api/admin/users',
  '/api/admin/places',
  '/api/admin/cities',
  '/api/admin/categories',
  '/api/admin/roles',
  '/api/admin/pending/tiolas',
  '/api/admin/pending/blogs',
  '/api/admin/backup/list',
];
const PAGES = [
  '/',
  '/en/',
  '/blog',
  '/en/blog',
  '/explore',
  '/en/explore',
  '/gezilecek-yerler',
  '/en/gezilecek-yerler',
  '/search',
  '/en/search',
  '/login',
  '/en/login',
  '/register',
  '/profile',
  '/legal/about.html',
  '/legal/contact.html',
  '/legal/privacy.html',
  '/legal/kvkk.html',
  '/legal/terms.html',
];

let failed = 0;

function ok(msg) {
  console.log('  ✓', msg);
}
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chromeBin() {
  const fromEnv = process.env.CHROME_PATH;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const candidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/local/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return '';
}

function normPath(value) {
  let p = String(value || '/');
  try {
    if (/^https?:/i.test(p)) p = new URL(p).pathname;
  } catch { /* keep raw */ }
  p = p.split('?')[0].split('#')[0];
  if (!p.startsWith('/')) p = `/${p}`;
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p || '/';
}

function samePath(actual, expected) {
  return normPath(actual) === normPath(expected);
}

async function fetchResponse(url, { redirect = 'follow' } = {}) {
  const res = await fetch(url, { redirect });
  const body = await res.text();
  return { status: res.status, body, headers: res.headers };
}

function waitForServer(base, max = 80) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      n += 1;
      const req = http.get(`${base}/api/health`, { timeout: 1500 }, (res) => {
        res.resume();
        if (res.statusCode >= 200 && res.statusCode < 500) resolve();
        else if (n >= max) reject(new Error('sunucu açılmadı'));
        else setTimeout(tick, 250);
      });
      req.on('error', () => {
        if (n >= max) reject(new Error('sunucu açılmadı'));
        else setTimeout(tick, 250);
      });
      req.on('timeout', () => {
        req.destroy();
        if (n >= max) reject(new Error('sunucu açılmadı'));
        else setTimeout(tick, 250);
      });
    };
    tick();
  });
}

function startServer(port) {
  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'development',
      SITEMAP_ON_START: 'false',
      LIVE_DATA_CRON: 'false',
      LOG_LEVEL: 'silent',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (chunk) => { log += chunk; });
  child.stderr.on('data', (chunk) => { log += chunk; });
  child.log = () => log.slice(-500);
  return child;
}

async function stopServer(child) {
  if (!child || child.killed) return;
  child.kill('SIGTERM');
  await sleep(200);
  try { child.kill('SIGKILL'); } catch { /* already gone */ }
}

function connectCdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let seq = 0;
  const pending = new Map();
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve());
    ws.addEventListener('error', () => reject(new Error('CDP bağlantısı kurulamadı')));
  });
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const slot = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) slot.reject(new Error(JSON.stringify(msg.error)));
      else slot.resolve(msg.result || {});
    }
  });
  function send(method, params = {}) {
    const id = ++seq;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  return { ready, send, close: () => ws.close() };
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    const text = result.exceptionDetails.text
      || result.exceptionDetails.exception?.description
      || 'evaluate failed';
    throw new Error(text);
  }
  return result.result ? result.result.value : undefined;
}

async function waitEval(cdp, expression, ready, tries) {
  let last = null;
  for (let i = 0; i < tries; i += 1) {
    try {
      last = await evaluate(cdp, expression);
      if (ready(last)) return last;
    } catch (err) {
      last = { error: err.message };
    }
    await sleep(250);
  }
  throw new Error(`sayfa hazır olmadı ${JSON.stringify(last).slice(0, 280)}`);
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
  return res.json();
}

const PAGE_STATE = `(() => {
  const titles = [...document.querySelectorAll('#blogGrid .btitle')].map((el) => (el.textContent || '').trim()).filter(Boolean);
  const grid = document.getElementById('blogGrid');
  const page = document.getElementById('page-blog');
  const h1s = [...document.querySelectorAll('h1')].map((el) => (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 80));
  const root = document.scrollingElement || document.documentElement;
  const before = root.scrollLeft || 0;
  try { root.scrollLeft = before + 48; } catch (e) {}
  try { window.scrollTo(48, window.scrollY || 0); } catch (e) {}
  const after = Math.max(root.scrollLeft || 0, window.scrollX || 0);
  try { root.scrollLeft = before; window.scrollTo(before, window.scrollY || 0); } catch (e) {}
  const htmlOverflow = getComputedStyle(document.documentElement).overflowX;
  const bodyOverflow = getComputedStyle(document.body).overflowX;
  return {
    ready: document.readyState,
    path: location.pathname,
    lang: document.documentElement.getAttribute('data-tl-lang') || document.documentElement.lang || '',
    stored: localStorage.getItem('tl_lang'),
    blogActive: !!(page && page.classList.contains('active')),
    blogSettled: !!(grid && (titles.length || grid.querySelector('.no-res'))),
    titles,
    objectObject: (document.body.innerText || '').includes('[object Object]')
      || (grid ? grid.innerHTML.includes('[object Object]') : false),
    h1: h1s.length,
    h1text: h1s,
    moved: after > before + 1,
    scrollWidth: root.scrollWidth,
    clientWidth: root.clientWidth,
    htmlOverflow,
    bodyOverflow,
  };
})()`;

function clips(overflow) {
  return overflow === 'clip' || overflow === 'hidden';
}

async function checkSitemap(base) {
  const res = await fetchResponse(`${base}/sitemap.xml`);
  if (res.status !== 200) {
    fail(`/sitemap.xml HTTP ${res.status}`);
    return [];
  }
  ok('/sitemap.xml 200');
  const xml = res.body.trim();
  const type = res.headers.get('content-type') || '';
  if (!/xml/i.test(type)) fail(`sitemap content-type XML değil (${type || 'yok'})`);
  else ok('sitemap content-type XML');
  const urlOpen = (xml.match(/<url>/g) || []).length;
  const urlClose = (xml.match(/<\/url>/g) || []).length;
  if (!xml.includes('<urlset') || !xml.includes('</urlset>')
    || (xml.match(/<urlset[\s>]/g) || []).length !== 1
    || urlOpen < 1 || urlOpen !== urlClose) {
    fail('sitemap geçerli bir urlset XML değil');
    return [];
  }
  ok(`sitemap urlset (${urlOpen} URL)`);
  const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  const lastmods = [...xml.matchAll(/<lastmod>([^<]*)<\/lastmod>/g)].map((m) => m[1]);
  if (locs.length !== urlOpen || lastmods.length !== urlOpen) {
    fail(`sitemap loc ${locs.length}, lastmod ${lastmods.length}, url ${urlOpen}`);
  } else ok('her URL loc ve lastmod taşıyor');
  const paths = locs.map((loc) => {
    try { return normPath(loc); } catch { return loc; }
  });
  if (paths.some((p) => p === '/search' || p === '/en/search')) fail('sitemap /search içeriyor');
  else ok('sitemap içinde /search yok');
  const distinct = new Set(lastmods.filter(Boolean));
  if (distinct.size < 2) fail(`lastmod değerleri aynı (${[...distinct].join(', ') || 'yok'})`);
  else ok(`lastmod değerleri farklı (${distinct.size} ayrı gün)`);
  return paths;
}

async function checkAdmin(base) {
  for (const route of ADMIN_GETS) {
    const res = await fetchResponse(`${base}${route}`, { redirect: 'manual' });
    if (res.status === 401 || res.status === 403) ok(`girişsiz GET ${route} → ${res.status}`);
    else fail(`girişsiz GET ${route} → ${res.status} (401 veya 403 olmalı)`);
  }
}

async function blogLists(base) {
  const en = await fetchResponse(`${base}/api/blogs?lang=en`);
  const tr = await fetchResponse(`${base}/api/blogs?lang=tr`);
  if (en.status !== 200) fail(`GET /api/blogs?lang=en HTTP ${en.status}`);
  if (tr.status !== 200) fail(`GET /api/blogs?lang=tr HTTP ${tr.status}`);
  let enBlogs = [];
  let trBlogs = [];
  try { enBlogs = JSON.parse(en.body).blogs || []; } catch { fail('EN blog listesi JSON değil'); }
  try { trBlogs = JSON.parse(tr.body).blogs || []; } catch { fail('TR blog listesi JSON değil'); }
  return { enBlogs, trBlogs };
}

function titlesOf(blogs) {
  return blogs.map((row) => String(row.title || '').trim()).filter(Boolean);
}

async function openAndSettle(cdp, url, expectedPath, extra, tries) {
  await cdp.send('Page.navigate', { url });
  await waitEval(cdp, PAGE_STATE, (v) => {
    if (!v || v.ready !== 'complete' || !samePath(v.path, expectedPath)) return false;
    return extra ? extra(v) : true;
  }, tries);
  await sleep(400);
  return evaluate(cdp, PAGE_STATE);
}

async function checkBlogPages(cdp, base) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const tr = await openAndSettle(cdp, `${base}/blog`, '/blog', (v) => v.blogSettled, 60);
  if (!samePath(tr.path, '/blog')) fail(`tl_lang=en iken /blog adresi ${tr.path} oldu`);
  else ok('tl_lang=en iken /blog adresi değişmedi');
  if (tr.lang !== 'tr') fail(`/blog dili ${tr.lang} (tr olmalı)`);
  else ok('/blog dili Türkçe kaldı');
  if (tr.stored !== 'en') fail(`kayıtlı dil ${tr.stored}`);
  else ok('kayıtlı dil en olarak duruyor');
  if (tr.objectObject) fail('/blog ekranında [object Object] var');
  else ok('/blog ekranında [object Object] yok');
  if (tr.h1 !== 1) fail(`/blog h1 sayısı ${tr.h1} (${(tr.h1text || []).join(' | ')})`);
  else ok('/blog tek h1');

  const en = await openAndSettle(cdp, `${base}/en/blog`, '/en/blog', (v) => v.blogSettled, 60);
  if (!samePath(en.path, '/en/blog')) fail(`/en/blog adresi ${en.path} oldu`);
  else ok('/en/blog adresi duruyor');
  if (en.lang !== 'en') fail(`/en/blog dili ${en.lang}`);
  else ok('/en/blog dili İngilizce');
  if (en.objectObject) fail('/en/blog ekranında [object Object] var');
  else ok('/en/blog ekranında [object Object] yok');
  if (en.h1 !== 1) fail(`/en/blog h1 sayısı ${en.h1} (${(en.h1text || []).join(' | ')})`);
  else ok('/en/blog tek h1');

  const { enBlogs, trBlogs } = await blogLists(base);
  const enTitles = new Set(titlesOf(enBlogs));
  const trOnly = new Set(titlesOf(trBlogs).filter((title) => !enTitles.has(title)));
  if (enTitles.size && !en.titles.length) fail('İngilizce yazı var ama /en/blog başlık basmadı');
  else if (!en.titles.length) ok('/en/blog boş (İngilizce yazı yok)');
  else ok(`/en/blog ${en.titles.length} başlık`);
  for (const title of en.titles) {
    if (title.includes('[object')) fail(`/en/blog başlık bozuk: ${title}`);
    else if (trOnly.has(title) || !enTitles.has(title)) fail(`/en/blog Türkçe başlık: ${title}`);
  }
  if (en.titles.length && en.titles.every((title) => enTitles.has(title) && !trOnly.has(title))) {
    ok('/en/blog başlıkları İngilizce yazılardan');
  }
}

async function checkPages(cdp, base, pages) {
  for (const width of WIDTHS) {
    const before = failed;
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 800,
      deviceScaleFactor: 1,
      mobile: true,
    });
    for (const pagePath of pages) {
      const state = await openAndSettle(
        cdp,
        `${base}${pagePath}`,
        pagePath,
        pagePath.includes('/blog') ? (v) => v.blogSettled : null,
        pagePath.includes('/blog') ? 60 : 40,
      );
      const label = `${width}px ${pagePath}`;
      if (!samePath(state.path, pagePath)) fail(`${label} adres ${state.path} oldu`);
      if (state.h1 !== 1) fail(`${label} h1 ${state.h1} (${(state.h1text || []).join(' | ')})`);
      if (state.objectObject) fail(`${label} [object Object]`);
      const wider = state.scrollWidth > state.clientWidth + 1;
      const locked = clips(state.htmlOverflow) && clips(state.bodyOverflow);
      if (state.moved || (wider && !locked)) {
        fail(`${label} yana kayıyor (scroll ${state.scrollWidth}/${state.clientWidth}, overflow ${state.htmlOverflow}/${state.bodyOverflow})`);
      }
    }
    if (failed === before) ok(`${width}px: adres durdu, tek h1, yana kayma yok`);
  }
}

async function browserChecks(base, pages) {
  const bin = chromeBin();
  if (!bin) {
    fail('Chrome yok. CHROME_PATH verin veya Google Chrome kurun. Sayfa kontrolleri çalışmadı.');
    return;
  }
  const debugPort = Number(process.env.SMOKE_CHROME_PORT || 9346);
  const profile = fs.mkdtempSync(path.join('/tmp', 'adim16-chrome-'));
  const chrome = spawn(bin, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--window-size=1280,900',
    `--remote-debugging-port=${debugPort}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  chrome.stderr.on('data', (chunk) => { stderr += chunk; });
  let cdp = null;
  try {
    let version = null;
    for (let i = 0; i < 40; i += 1) {
      try {
        version = await getJson(`http://127.0.0.1:${debugPort}/json/version`);
        break;
      } catch { /* chrome still starting */ }
      await sleep(250);
    }
    if (!version) throw new Error(`chrome açılmadı ${stderr.slice(-200)}`);
    const list = await getJson(`http://127.0.0.1:${debugPort}/json/list`);
    const page = list.find((tab) => tab.type === 'page') || list[0];
    cdp = connectCdp(page.webSocketDebuggerUrl);
    await cdp.ready;
    await cdp.send('Page.enable');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: "try{localStorage.setItem('tl_lang','en');localStorage.removeItem('tl_route');}catch(e){}",
    });
    await checkBlogPages(cdp, base);
    await checkPages(cdp, base, pages);
  } catch (err) {
    fail(`tarayıcı: ${err.message}`);
  } finally {
    if (cdp) {
      try { cdp.close(); } catch { /* ignore */ }
    }
    chrome.kill('SIGTERM');
    await sleep(200);
    try { chrome.kill('SIGKILL'); } catch { /* ignore */ }
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

async function main() {
  console.log('smoke-test (V4 Adım 16)');
  if (typeof WebSocket !== 'function') {
    fail('Bu Node sürümünde WebSocket yok');
    process.exit(1);
  }
  const preset = String(process.env.SMOKE_BASE_URL || '').trim().replace(/\/$/, '');
  let base = preset;
  let child = null;
  if (preset && !/^https?:\/\//i.test(preset)) {
    fail('SMOKE_BASE_URL http(s) olmalı');
    process.exit(1);
  }
  try {
    if (!base) {
      const port = Number(process.env.SMOKE_PORT || 3120);
      base = `http://127.0.0.1:${port}`;
      child = startServer(port);
      try {
        await waitForServer(base);
        ok(`yerel sunucu ${base}`);
      } catch (err) {
        fail(`${err.message} ${child.log()}`);
        return;
      }
    } else ok(`canlı adres ${base} (yalnızca GET)`);

    const paths = await checkSitemap(base);
    await checkAdmin(base);
    const place = paths.find((p) => /^\/places\/[^/]+$/.test(p));
    const pages = place ? PAGES.concat([place, `/en${place}`]) : PAGES.slice();
    if (place) ok(`örnek mekân ${place}`);
    else ok('sitemapte mekân yok; mekân sayfası atlandı');
    await browserChecks(base, pages);
  } catch (err) {
    fail(err.message);
  } finally {
    await stopServer(child);
  }

  if (failed) {
    console.error(`smoke-test KALDI (${failed})`);
    process.exit(1);
  }
  console.log('smoke-test TAMAM');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
