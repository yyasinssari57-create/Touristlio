/**
 * Admin paneli görsel yükleme hata bildirimi (Yasin: "görsel ekle çalışmıyor").
 *
 * Bulgu: `public/js/place-crop.js` (yer/şehir/kategori görseli kırpma modalı), seçilen
 * ORİJİNAL dosya 5 MB'ı geçince kırpma adımından önce `alert()` ile reddediyordu. Kırpma
 * çıktısı her zaman ~1280px genişliğe küçültülüyor (tipik olarak birkaç yüz KB), yani
 * sunucunun gerçek 5 MB yükleme sınırı çıktı için zaten yeterliydi — darboğaz SEÇİLEN
 * dosyada, kırpmadan önce. Modern telefon fotoğrafları (6-15 MB) bu yüzden hiç kırpma
 * ekranına girmeden reddediliyordu. Hero görseli yükleme (admin.html, compressHeroImageFile)
 * bu sorunu zaten 12 MB sınırı + otomatik küçültme ile çözmüştü; yer/şehir/kategori
 * görselleri için aynı düzeltme hiç yapılmamıştı. Düzeltme: MAX_FILE_BYTES 5 MB -> 12 MB
 * (hero ile aynı sınır), admin.html'deki 4 "max 5 MB" ipucu metni "max 12 MB" yapıldı.
 *
 * Bu script:
 *   1) Statik: place-crop.js'teki yeni 12 MB sınırını ve admin.html'deki ipucu metinlerini
 *      doğrular; eski "5 MB" ipucu kalmadığını kontrol eder.
 *   2) Canlı: yerel bir test sunucusunda admin girişi yapıp gerçek bir JPEG ile üç yükleme
 *      ucunu da uçtan uca test eder — POST /admin/media, POST /admin/hero-image,
 *      POST /admin/places/:id/photos. Bu sandbox'ta SUPABASE_URL/SUPABASE_SERVICE_KEY
 *      tanımlı değilse disk fallback'i kullanılır (kod yolu aynı; Supabase Storage
 *      HTTP çağrısının kendisi bu ortamda test edilemez — bkz. AUDIT_FOLLOWUPS.md).
 *
 * Usage: node server/scripts/verify-admin-image-upload.js
 * Optional: VERIFY_IMG_PORT=3092 node server/scripts/verify-admin-image-upload.js
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
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

console.log('verify-admin-image-upload');

// ---------------------------------------------------------------------------
// 1) Statik: yeni 12 MB sınırı + güncellenmiş ipucu metinleri
// ---------------------------------------------------------------------------
const cropJs = read('public/js/place-crop.js');
if (!/MAX_FILE_BYTES\s*=\s*12\s*\*\s*1024\s*\*\s*1024/.test(cropJs)) {
  fail('place-crop.js MAX_FILE_BYTES hâlâ 12 MB değil (eski 5 MB sınırı modern telefon fotoğraflarını reddediyordu)');
} else ok('place-crop.js MAX_FILE_BYTES = 12 MB (hero ile aynı, kırpma öncesi reddetmiyor)');
if (!/Dosya en fazla 12 MB olabilir/.test(cropJs)) {
  fail('place-crop.js uyarı metni 12 MB ile güncellenmemiş');
} else ok('place-crop.js uyarı metni 12 MB diyor');

const adminHtml = read('public/admin.html');
if (/max 5 MB/.test(adminHtml)) {
  fail('admin.html içinde hâlâ eski "max 5 MB" ipucu var — gerçek sınırla (12 MB) uyuşmuyor');
} else ok('admin.html içinde eski "max 5 MB" ipucu kalmadı');
const hint12Count = (adminHtml.match(/max 12 MB/g) || []).length;
if (hint12Count < 4) {
  fail(`admin.html "max 12 MB" ipucu bekleniyordu (en az 4), bulunan: ${hint12Count}`);
} else ok(`admin.html "max 12 MB" ipucu metni ${hint12Count} yerde güncel`);

// Sunucu tarafı multer sınırı DEĞİŞMEDİ — kırpılmış çıktı için zaten yeterliydi.
const adminJs = read('server/routes/admin.js');
if (!/imageUploader\(\{\s*fileSize:\s*5 \* 1024 \* 1024/.test(adminJs)) {
  fail('server/routes/admin.js multer fileSize beklenmeyen şekilde değişmiş (5 MB kalmalıydı — kırpılmış çıktı için yeterli)');
} else ok('sunucu tarafı multer sınırı 5 MB olarak değişmedi (kırpılmış çıktı için zaten yeterli)');

// FormData alan adları hâlâ multer config'iyle eşleşiyor mu (statik regresyon kontrolü).
if (!/fd\.append\('image', file\)/.test(adminHtml)) fail("admin.html uploadCroppedMedia FormData alanı 'image' değil");
else ok("uploadCroppedMedia FormData alanı 'image' — mediaUpload.single('image') ile eşleşiyor");
if (!/fd\.append\('image', chosen\)/.test(adminHtml)) fail("admin.html hero upload FormData alanı 'image' değil");
else ok("hero upload FormData alanı 'image' — /admin/hero-image mediaUpload.single('image') ile eşleşiyor");
if (!/fd\.append\('photos', f\)/.test(adminHtml)) fail("admin.html place photos FormData alanı 'photos' değil");
else ok("place photos FormData alanı 'photos' — upload.array('photos', 10) ile eşleşiyor");

// ---------------------------------------------------------------------------
// 2) Canlı: gerçek sunucu + admin oturumu + gerçek JPEG ile üç uç nokta
// ---------------------------------------------------------------------------
function mergeCookies(jar, setCookie) {
  if (!setCookie) return;
  const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const line of arr) {
    const part = line.split(';')[0];
    const eq = part.indexOf('=');
    if (eq < 1) continue;
    jar[part.slice(0, eq).trim()] = part.slice(eq + 1);
  }
}
function cookieHeader(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function jsonRequest(url, { method = 'GET', body, headers, jar } = {}) {
  const hdrs = { ...(headers || {}) };
  if (jar && Object.keys(jar).length) hdrs.Cookie = cookieHeader(jar);
  const payload = body == null ? null : (typeof body === 'string' ? body : JSON.stringify(body));
  if (payload != null && !hdrs['Content-Type']) hdrs['Content-Type'] = 'application/json';
  const res = await fetch(url, { method, headers: hdrs, body: payload });
  if (jar) mergeCookies(jar, res.headers.getSetCookie ? res.headers.getSetCookie() : []);
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch { /* ignore */ }
  return { status: res.status, json, text };
}

async function formRequest(url, { jar, headers, fieldName, filename, buffer }) {
  const hdrs = { ...(headers || {}) };
  if (jar && Object.keys(jar).length) hdrs.Cookie = cookieHeader(jar);
  const fd = new FormData();
  fd.append(fieldName, new Blob([buffer], { type: 'image/jpeg' }), filename);
  const res = await fetch(url, { method: 'POST', headers: hdrs, body: fd });
  if (jar) mergeCookies(jar, res.headers.getSetCookie ? res.headers.getSetCookie() : []);
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch { /* ignore */ }
  return { status: res.status, json, text };
}

function waitForServer(url, tries = 400) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      n += 1;
      const req = http.get(url, { timeout: 1000 }, (res) => { res.resume(); resolve(); });
      req.on('error', () => { if (n >= tries) reject(new Error('server did not start')); else setTimeout(tick, 250); });
      req.on('timeout', () => { req.destroy(); if (n >= tries) reject(new Error('server did not start')); else setTimeout(tick, 250); });
    };
    tick();
  });
}

async function makeTestJpeg() {
  const sharp = require('sharp');
  return sharp({ create: { width: 48, height: 48, channels: 3, background: { r: 180, g: 90, b: 40 } } })
    .jpeg({ quality: 80 })
    .toBuffer();
}

async function checkLive(base) {
  const root = base.replace(/\/$/, '');
  const jar = {};
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@test.local';
  const adminPassword = process.env.ADMIN_PASSWORD || 'TestAdmin123!';
  const login = await jsonRequest(`${root}/api/auth/login`, {
    method: 'POST', jar, headers: { Origin: root }, body: { email: adminEmail, password: adminPassword },
  });
  if (login.status !== 200) { fail(`admin login HTTP ${login.status}: ${login.text.slice(0, 180)}`); return; }
  ok('admin girişi yapıldı');

  const imgBuf = await makeTestJpeg();

  const media = await formRequest(`${root}/api/admin/media`, {
    jar, headers: { Origin: root }, fieldName: 'image', filename: 'test.jpg', buffer: imgBuf,
  });
  if (media.status !== 200 || !media.json?.data?.url) {
    fail(`POST /api/admin/media HTTP ${media.status}: ${media.text.slice(0, 200)}`);
  } else ok(`POST /api/admin/media -> 200, url=${media.json.data.url}`);

  const hero = await formRequest(`${root}/api/admin/hero-image`, {
    jar, headers: { Origin: root }, fieldName: 'image', filename: 'hero.jpg', buffer: imgBuf,
  });
  if (hero.status !== 200 || !hero.json?.data?.url) {
    fail(`POST /api/admin/hero-image HTTP ${hero.status}: ${hero.text.slice(0, 200)}`);
  } else {
    ok(`POST /api/admin/hero-image -> 200, url=${hero.json.data.url}`);
    const settings = await jsonRequest(`${root}/api/settings`, { jar });
    if (settings.json?.data?.settings?.hero_image_url !== hero.json.data.url) {
      fail('hero_image_url ayarlarda güncellenmedi');
    } else ok('hero_image_url settings tablosunda güncellendi');
  }

  const createPlace = await jsonRequest(`${root}/api/admin/places`, {
    method: 'POST', jar, headers: { Origin: root },
    body: { name: 'Verify Upload Place', country: 'TR', city: 'Istanbul', category: 'tarihi', status: 'published' },
  });
  const placeId = createPlace.json?.data?.id;
  if (createPlace.status !== 201 || !placeId) {
    fail(`POST /api/admin/places HTTP ${createPlace.status}: ${createPlace.text.slice(0, 200)}`);
    return;
  }
  ok('test yeri oluşturuldu');

  const photos = await formRequest(`${root}/api/admin/places/${placeId}/photos`, {
    jar, headers: { Origin: root }, fieldName: 'photos', filename: 'place.jpg', buffer: imgBuf,
  });
  if (photos.status !== 200 || !photos.json?.data?.photos?.length) {
    fail(`POST /api/admin/places/:id/photos HTTP ${photos.status}: ${photos.text.slice(0, 200)}`);
  } else ok(`POST /api/admin/places/:id/photos -> 200, ${photos.json.data.uploaded} görsel yüklendi`);

  const del = await jsonRequest(`${root}/api/admin/places/${placeId}`, { method: 'DELETE', jar, headers: { Origin: root } });
  if (del.status !== 200) fail(`test yeri temizliği başarısız: HTTP ${del.status}`);
  else ok('test yeri arşivlendi (temizlik)');
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
      RECAPTCHA_SITE_KEY: '',
      RECAPTCHA_SECRET: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function main() {
  const given = process.env.VERIFY_IMG_URL;
  if (given) {
    await checkLive(given);
  } else {
    const port = process.env.VERIFY_IMG_PORT || '3092';
    const child = spawnServer(port);
    let stderr = '';
    child.stderr.on('data', (c) => { stderr += c; });
    const base = `http://127.0.0.1:${port}`;
    try {
      await waitForServer(base, 400);
      await checkLive(base);
    } catch (e) {
      fail(`live server :${port}: ${e.message}${stderr ? ` (${stderr.slice(0, 300)})` : ''}`);
    } finally {
      child.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 200));
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
    }
  }

  if (failed) {
    console.error(`verify-admin-image-upload: ${failed} failed`);
    process.exit(1);
  }
  console.log('verify-admin-image-upload: ok');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
