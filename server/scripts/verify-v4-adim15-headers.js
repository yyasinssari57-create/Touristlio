/**
 * V4 Adım 15 — security headers.
 * Referrer-Policy, Permissions-Policy, and the style-src reasons.
 * Usage: npm run verify:v4-adim15
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { PERMISSIONS_POLICY } = require('../middleware/permissions-policy');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;

function ok(msg) { console.log('  ✓', msg); }
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

console.log('verify-v4-adim15-headers');

const indexSrc = read('server/index.js');
if (!indexSrc.includes("referrerPolicy: { policy: 'strict-origin-when-cross-origin' }")) {
  fail('Referrer-Policy is not strict-origin-when-cross-origin');
} else ok('Referrer-Policy set to strict-origin-when-cross-origin');
if (indexSrc.includes("policy: 'no-referrer'") || indexSrc.includes('policy: "no-referrer"')) {
  fail('Helmet still forced to no-referrer');
} else ok('no-referrer is not forced');
if (!indexSrc.includes('permissionsPolicyMiddleware()')) {
  fail('Permissions-Policy middleware is not mounted');
} else ok('Permissions-Policy middleware mounted');
if (indexSrc.indexOf('permissionsPolicyMiddleware()') < indexSrc.indexOf('app.use(helmet')) {
  fail('Permissions-Policy must run with the other response headers');
} else ok('Permissions-Policy is mounted next to Helmet');
if (!indexSrc.includes("scriptSrcAttr: [\"'none'\"]")) fail("script-src-attr 'none' missing");
else ok("script-src-attr stays 'none'");
if (!/styleSrc:\s*\[[^\]]*'unsafe-inline'/s.test(indexSrc)) fail("style-src 'unsafe-inline' missing");
else ok("style-src 'unsafe-inline' kept for <style> blocks");
if (!/styleSrcAttr:\s*\[[^\]]*'unsafe-inline'/s.test(indexSrc)) fail("style-src-attr 'unsafe-inline' missing");
else ok("style-src-attr 'unsafe-inline' kept for element.style");

const policyFile = read('server/middleware/permissions-policy.js');
if (!policyFile.includes(PERMISSIONS_POLICY)) fail('policy constant drifted');
else ok('Permissions-Policy value is camera/microphone/payment off, geolocation self');
if (!policyFile.includes('camera=()') || !policyFile.includes('geolocation=(self)')) {
  fail('Permissions-Policy tokens missing');
}

const indexHtml = read('public/index.html');
if (!indexHtml.includes('id="tl-critical"')) fail('critical <style> was removed');
else ok('critical <style id="tl-critical"> stays (first paint)');
if (/id="noResClear"[^>]*style=/.test(indexHtml) || /id="blogBody"[^>]*style=/.test(indexHtml)) {
  fail('moved static styles came back on noResClear or blogBody');
} else ok('noResClear and blogBody no longer use style=');
if (!indexHtml.includes('class="rft blog-body"') || !indexHtml.includes('tl-mt-12')) {
  fail('replacement classes missing on the homepage');
} else ok('homepage uses tl-mt-12 and blog-body');

const registerHtml = read('public/register.html');
if (!registerHtml.includes('auth-policy-note') || /settingsNote"[^>]*style=/.test(registerHtml)) {
  fail('register password note still has a style attribute');
} else ok('register password note uses auth-policy-note');

const mapJs = read('public/js/map.js');
if (!mapJs.includes('class="tl-user-dot"') || mapJs.includes('background:#ef4444;width:16px')) {
  fail('Konumum pin style was not moved');
} else ok('Konumum pin uses .tl-user-dot');
if (!mapJs.includes('class="tl-map-dot" style="background:${color}"')) {
  fail('marker color must stay inline (it changes per category)');
} else ok('marker color stays inline; size and border moved to CSS');
if (!mapJs.includes("className: 'map-popup-img'") && !mapJs.includes('className: "map-popup-img"') && !mapJs.includes("className: 'map-popup-img'")) {
  fail('map popup image class missing');
}
if (!mapJs.includes('class="map-popup-img"') && !mapJs.includes("className: 'map-popup-img'")) {
  fail('map popup image was not moved to a class');
} else ok('map popup image, text, and button use classes');

const hero = read('server/lib/send-public-html.js');
if (!hero.includes('<style id="tl-hero-bg">')) fail('hero background <style> missing');
else ok('hero URL still injected as <style id="tl-hero-bg">');
const boundary = read('public/js/error-boundary.js');
if (!boundary.includes("createElement('style')")) fail('error-boundary fallback <style> missing');
else ok('error-boundary still injects a fallback <style>');
const crop = read('public/js/place-crop.js') + read('public/js/avatar-crop.js');
if (!crop.includes('img.style.width')) fail('crop tools no longer set img.style');
else ok('crop tools still set img.style (needs style-src-attr)');
const leaflet = read('public/vendor/leaflet/leaflet.js');
if (!leaflet.includes('.style')) fail('Leaflet no longer touches .style');
else ok('Leaflet still writes element.style (needs style-src-attr)');

function walk(dir, acc) {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'vendor' || name === 'node_modules') continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (/\.(html|js)$/.test(name)) acc.push(full);
  }
  return acc;
}
const files = walk(path.join(ROOT, 'public'), []);
let styleAttrs = 0;
let displayNoneAttrs = 0;
let styleAssigns = 0;
let styleTags = 0;
for (const full of files) {
  const src = fs.readFileSync(full, 'utf8');
  const attrs = src.match(/\sstyle\s*=\s*["'][^"']*["']/gi) || [];
  styleAttrs += attrs.length;
  displayNoneAttrs += attrs.filter((a) => /display\s*:\s*none/i.test(a)).length;
  styleAssigns += (src.match(/\.style\s*(\.[A-Za-z]+|\[[^\]]+\]|\s*=)/g) || []).length;
  styleTags += (src.match(/<style\b/gi) || []).length;
}
console.log(`  · kalan style= ${styleAttrs} (display:none ${displayNoneAttrs}), .style atama ${styleAssigns}, <style> ${styleTags}`);

function request(port, p) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: p, method: 'GET' }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

function waitForServer(port) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      n += 1;
      const req = http.get({ hostname: '127.0.0.1', port, path: '/', timeout: 1000 }, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (n >= 80) reject(new Error('server did not start'));
        else setTimeout(tick, 250);
      });
      req.on('timeout', () => {
        req.destroy();
        if (n >= 80) reject(new Error('server did not start'));
        else setTimeout(tick, 250);
      });
    };
    tick();
  });
}

function header(res, name) {
  const value = res.headers[name.toLowerCase()];
  return Array.isArray(value) ? value.join(', ') : (value || '');
}

function checkHeaders(pathName, res) {
  const referrer = header(res, 'referrer-policy');
  const permissions = header(res, 'permissions-policy');
  const frame = header(res, 'x-frame-options');
  const nosniff = header(res, 'x-content-type-options');
  const hsts = header(res, 'strict-transport-security');
  const csp = header(res, 'content-security-policy');
  if (referrer !== 'strict-origin-when-cross-origin') {
    fail(`${pathName} Referrer-Policy is "${referrer}"`);
  }
  if (permissions !== PERMISSIONS_POLICY) fail(`${pathName} Permissions-Policy is "${permissions}"`);
  if (frame !== 'SAMEORIGIN') fail(`${pathName} X-Frame-Options is "${frame}"`);
  if (nosniff !== 'nosniff') fail(`${pathName} X-Content-Type-Options is "${nosniff}"`);
  if (!/max-age=\d+/.test(hsts) || !/includeSubDomains/i.test(hsts)) {
    fail(`${pathName} HSTS missing (${hsts})`);
  }
  if (header(res, 'x-powered-by')) fail(`${pathName} still sends X-Powered-By`);
  if (!csp) {
    fail(`${pathName} CSP missing`);
    return;
  }
  if (/script-src-attr[^;]*'unsafe-inline'/.test(csp)) fail(`${pathName} script-src-attr allows unsafe-inline`);
  if (!/script-src-attr[^;]*'none'/.test(csp)) fail(`${pathName} script-src-attr is not none`);
  const scriptSrc = (csp.split(';').find((d) => d.trim().startsWith('script-src ')) || '');
  if (scriptSrc.includes("'unsafe-inline'")) fail(`${pathName} script-src allows unsafe-inline`);
  if (!/style-src[^;]*'unsafe-inline'/.test(csp)) fail(`${pathName} style-src lost unsafe-inline`);
  if (!/style-src-attr[^;]*'unsafe-inline'/.test(csp)) fail(`${pathName} style-src-attr lost unsafe-inline`);
}

function chromeBin() {
  const fromEnv = process.env.CHROME_PATH;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  for (const candidate of ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/local/bin/google-chrome']) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return '';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
  return res.json();
}

function connectCdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let seq = 0;
  const pending = new Map();
  const events = [];
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
      else slot.resolve(msg.result || {});
    } else if (msg.method) events.push(msg);
  });
  function send(method, params = {}) {
    const id = ++seq;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  return { ready, send, events, close: () => ws.close() };
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    const text = result.exceptionDetails.text || result.exceptionDetails.exception?.description || 'evaluate failed';
    throw new Error(text);
  }
  return result.result ? result.result.value : undefined;
}

async function browserCheck(origin) {
  const bin = chromeBin();
  if (!bin) {
    fail('Chrome yok; sayfa, harita, giriş ve görsel denemesi çalışmadı');
    return;
  }
  const debugPort = 9335;
  const profile = fs.mkdtempSync(path.join('/tmp', 'adim15-chrome-'));
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
    if (!version) throw new Error(`chrome debug port açılmadı ${stderr.slice(-200)}`);
    const list = await getJson(`http://127.0.0.1:${debugPort}/json/list`);
    const page = list.find((t) => t.type === 'page') || list[0];
    cdp = connectCdp(page.webSocketDebuggerUrl);
    await cdp.ready;
    await cdp.send('Page.enable');
    await cdp.send('Network.enable');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `window.__cspViolations=[];document.addEventListener('securitypolicyviolation',function(e){window.__cspViolations.push((e.violatedDirective||'')+' '+(e.blockedURI||''));});`,
    });

    await cdp.send('Page.navigate', { url: `${origin}/` });
    const home = await waitEval(cdp, `(() => {
      const h1 = document.querySelectorAll('h1').length;
      const policy = document.permissionsPolicy || document.featurePolicy;
      const allows = policy && policy.allowsFeature ? {
        camera: policy.allowsFeature('camera'),
        microphone: policy.allowsFeature('microphone'),
        payment: policy.allowsFeature('payment'),
        geolocation: policy.allowsFeature('geolocation'),
      } : null;
      const blog = document.getElementById('blogBody');
      const clear = document.getElementById('noResClear');
      const blogCss = blog ? getComputedStyle(blog) : null;
      const clearCss = clear ? getComputedStyle(clear) : null;
      return {
        ready: document.readyState,
        h1,
        allows,
        blogMin: blogCss ? blogCss.minHeight : '',
        clearMargin: clearCss ? clearCss.marginTop : '',
        violations: window.__cspViolations || [],
      };
    })()`, (v) => v && v.ready === 'complete' && v.h1 >= 1, 40);
    if (home.h1 !== 1) fail(`ana sayfada h1 sayısı ${home.h1}`);
    else ok('ana sayfa açıldı, tek h1');
    if (!home.allows) fail('tarayıcı Permissions-Policy API yok');
    else if (home.allows.camera || home.allows.microphone || home.allows.payment || !home.allows.geolocation) {
      fail(`izinler yanlış: ${JSON.stringify(home.allows)}`);
    } else ok('tarayıcı: kamera/mikrofon/ödeme kapalı, konum kendi siteye açık');
    if (home.blogMin !== '140px') fail(`blog kutusu min-height ${home.blogMin}`);
    else ok('blog kutusu min-height 140px (sınıf)');
    if (home.clearMargin !== '12px') fail(`temizle düğmesi margin ${home.clearMargin}`);
    else ok('temizle düğmesi üst boşluğu 12px (sınıf)');
    if (home.violations.length) fail(`ana sayfa CSP ihlali: ${home.violations.join(' | ')}`);
    else ok('ana sayfada CSP ihlali yok');

    const auth = await evaluate(cdp, `(() => {
      document.getElementById('authBtn').click();
      const btn = document.getElementById('authSubmitBtn');
      const box = btn && btn.closest('.auth-box');
      const bw = btn ? btn.getBoundingClientRect().width : 0;
      const pw = box ? box.getBoundingClientRect().width : 0;
      const email = !!document.getElementById('loginEmail');
      document.getElementById('tabB').click();
      const note = document.querySelector('.auth-policy-modal');
      const noteCss = note ? getComputedStyle(note) : null;
      return {
        email,
        widthOk: pw > 0 && bw > pw * 0.85,
        font: noteCss ? parseFloat(noteCss.fontSize) : 0,
        margin: noteCss ? noteCss.marginTop : '',
      };
    })()`);
    if (!auth.email) fail('giriş formu açılmadı');
    else ok('giriş formu açıldı');
    if (!auth.widthOk) fail('giriş düğmesi tam genişlik değil');
    else ok('giriş düğmesi genişliği sınıftan geldi');
    if (Math.abs(auth.font - 12.48) > 0.2 || auth.margin !== '-4px') {
      fail(`şifre notu font ${auth.font} margin ${auth.margin}`);
    } else ok('şifre notu font ve boşluk aynı kaldı');

    const map = await evaluate(cdp, `(async () => {
      const btn = document.getElementById('et-map');
      await showExploreTab('map', btn);
      const started = Date.now();
      let tiles = 0;
      while (Date.now() - started < 8000) {
        tiles = document.querySelectorAll('#exploreMapFull img.leaflet-tile, #exploreMapFull .leaflet-tile').length;
        if (document.querySelector('#exploreMapFull.leaflet-container') && tiles > 0) break;
        await new Promise((r) => setTimeout(r, 200));
      }
      const pane = document.querySelector('#exploreMapFull .leaflet-map-pane');
      const paneStyle = pane ? pane.style.transform || pane.style.left || 'set' : '';
      return {
        container: !!document.querySelector('#exploreMapFull.leaflet-container'),
        tiles,
        locate: !!document.getElementById('mapLocateBtn'),
        paneStyle: paneStyle ? 'yes' : 'no',
        violations: window.__cspViolations || [],
      };
    })()`);
    const tileReqs = cdp.events.filter((ev) => {
      if (ev.method !== 'Network.requestWillBeSent') return false;
      return /openstreetmap\.fr/.test(ev.params?.request?.url || '');
    });
    if (!map.container) fail('harita kabı oluşmadı');
    else ok('harita kabı oluştu');
    if (!map.locate) fail('Konumum düğmesi yok');
    else ok('Konumum düğmesi duruyor');
    if (map.tiles < 1 && tileReqs.length < 1) fail('harita karosu istenmedi');
    else ok(`harita karo istedi (DOM ${map.tiles}, istek ${tileReqs.length})`);
    if (map.paneStyle !== 'yes') fail('Leaflet harita katmanına stil yazamadı');
    else ok('Leaflet katman stili yazıldı (style-src-attr)');
    const mapBlocked = (map.violations || []).filter((v) => /script-src|style-src|img-src|connect-src/.test(v));
    if (mapBlocked.length) fail(`harita CSP ihlali: ${mapBlocked.join(' | ')}`);
    else ok('haritada CSP ihlali yok');

    const upload = await evaluate(cdp, `(async () => {
      const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'image/png' });
      const img = new Image();
      img.alt = 'deneme';
      img.style.width = '48px';
      img.style.height = '48px';
      const url = URL.createObjectURL(blob);
      const loaded = new Promise((resolve) => { img.onload = () => resolve(true); img.onerror = () => resolve(false); });
      img.src = url;
      document.body.appendChild(img);
      await loaded;
      const fd = new FormData();
      fd.append('photo', blob, 'adim15.png');
      let status = 0;
      let error = '';
      try {
        const res = await fetch('/api/auth/avatar-upload', { method: 'POST', body: fd, credentials: 'include' });
        status = res.status;
      } catch (err) {
        error = String(err && err.message || err);
      }
      return {
        width: getComputedStyle(img).width,
        naturalWidth: img.naturalWidth,
        status,
        error,
        violations: window.__cspViolations || [],
      };
    })()`);
    if (upload.width !== '48px' || upload.naturalWidth !== 1) {
      fail(`görsel önizleme width ${upload.width} natural ${upload.naturalWidth}`);
    } else ok('görsel önizleme: blob ve style.width CSP engeline takılmadı');
    if (upload.error || ![400, 401, 403].includes(upload.status)) {
      fail(`görsel yükleme isteği gitmedi (${upload.status} ${upload.error})`);
    } else ok(`görsel yükleme isteği sunucuya vardı (HTTP ${upload.status}, oturum yok)`);
    const uploadBlocked = (upload.violations || []).filter((v) => /img-src|style-src|connect-src|script-src/.test(v));
    if (uploadBlocked.length) fail(`görsel CSP ihlali: ${uploadBlocked.join(' | ')}`);
    else ok('görsel yükleme denemesinde CSP ihlali yok');

    await cdp.send('Page.navigate', { url: `${origin}/login` });
    const login = await waitEval(cdp, `(() => {
      const el = document.getElementById('loginEmail');
      if (!el || document.readyState !== 'complete') return null;
      el.value = 'not-an-email';
      document.getElementById('loginPass').value = 'secret';
      document.getElementById('loginSubmit').click();
      const msg = (document.getElementById('authFormError').textContent || '').trim();
      return { msg, violations: window.__cspViolations || [] };
    })()`, (v) => v && v.msg, 30);
    if (!login.msg) fail('giriş sayfası hata yazısı göstermedi');
    else ok(`giriş sayfası çalıştı (${login.msg.slice(0, 60)})`);
    if ((login.violations || []).length) fail(`giriş CSP ihlali: ${login.violations.join(' | ')}`);
    else ok('giriş sayfasında CSP ihlali yok');

    const posted = await evaluate(cdp, `(async () => {
      document.getElementById('loginEmail').value = 'adim15@example.com';
      document.getElementById('loginPass').value = 'WrongPass1';
      document.getElementById('loginSubmit').click();
      const started = Date.now();
      while (Date.now() - started < 8000) {
        const msg = (document.getElementById('authFormError').textContent || '').trim();
        if (msg && !/Geçerli e-posta/.test(msg)) return { msg, violations: window.__cspViolations || [] };
        await new Promise((r) => setTimeout(r, 200));
      }
      return { msg: '', violations: window.__cspViolations || [] };
    })()`);
    if (!posted.msg) fail('giriş isteği cevap yazısı getirmedi');
    else ok(`giriş isteği sunucuya vardı (${posted.msg.slice(0, 80)})`);
    if ((posted.violations || []).some((v) => /connect-src|script-src/.test(v))) {
      fail(`giriş isteği CSP: ${posted.violations.join(' | ')}`);
    } else ok('giriş isteği CSP engeline takılmadı');
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
  throw new Error(`sayfa hazır olmadı ${JSON.stringify(last)}`);
}

async function main() {
  const port = 3095;
  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'development',
      CSP_FORCE: 'true',
      SITEMAP_ON_START: 'false',
      LIVE_DATA_CRON: 'false',
      LOG_LEVEL: 'silent',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (c) => { out += c; });
  child.stderr.on('data', (c) => { out += c; });
  try {
    await waitForServer(port);
    const paths = ['/', '/login', '/admin', '/css/style.css', '/api/health'];
    for (const p of paths) {
      const res = await request(port, p);
      if (res.status !== 200 && !(p === '/api/health' && res.status === 503)) {
        fail(`GET ${p} HTTP ${res.status}`);
        continue;
      }
      checkHeaders(p, res);
      ok(`GET ${p} başlıklar tamam`);
    }
    const admin = await request(port, '/admin');
    if (!/type="file"/.test(admin.body)) fail('yönetici sayfasında dosya seçici yok');
    else ok('yönetici sayfasında görsel dosya seçici var');
    const home = await request(port, '/');
    if (!home.body.includes('id="tl-critical"')) fail('sunulan ana sayfada kritik stil yok');
    else ok('sunulan ana sayfada kritik stil duruyor');
    await browserCheck(`http://127.0.0.1:${port}`);
  } catch (err) {
    fail(`${err.message} ${out.trim().slice(0, 240)}`);
  } finally {
    child.kill('SIGTERM');
    await sleep(200);
    try { child.kill('SIGKILL'); } catch { /* ignore */ }
  }

  if (failed) {
    console.error(`verify-v4-adim15-headers FAILED (${failed})`);
    process.exit(1);
  }
  console.log('verify-v4-adim15-headers OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
