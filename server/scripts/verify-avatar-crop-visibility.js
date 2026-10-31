/**
 * Avatar kırpma penceresi görünürlüğü — PR #71'in place-crop.js'te bulduğu
 * aynı kopyala-yapıştır hatasının avatar-crop.js'te de olup olmadığını
 * doğrular (PR #71'in AUDIT_FOLLOWUPS.md'de kapsam dışı bıraktığı bulgu).
 *
 * BULGU 1 (lazy-load çıkmazı) — AYNI HATA, DOĞRULANDI VE DÜZELTİLDİ:
 *   `avatar-crop.js`'teki `#avatarCropImg` da `loading="lazy"` taşıyordu.
 *   Bu resim, varsayılan `display:none` olan bir kırpma penceresinin
 *   (`.auth-ov`) İÇİNDE; o pencereyi görünür yapan `.on` sınıfı YALNIZCA bu
 *   resmin KENDİ `onload` olayı içinde ekleniyor (bkz. `open()`). Tarayıcı
 *   `display:none` bir kapsayıcı içindeki lazy resmi görünürlük kesişimi
 *   olmadığı için asla yüklemiyor -> `onload` hiç ateşlenmiyor -> `.on` hiç
 *   eklenmiyor -> pencere sonsuza dek görünmez kalıyor. Profil sayfasında
 *   ("Profil → Ayarlar → Fotoğraf yükle") bir fotoğraf seçildiğinde kırpma
 *   penceresinin hiç açılmaması, hata konsolda görünmeden.
 *   DÜZELTME: `#avatarCropImg`'den `loading="lazy"` kaldırıldı (place-crop.js
 *   ile birebir aynı düzeltme, tek dosya, görsel değişiklik yok).
 *
 * BULGU 2 (z-index çakışması) — İNCELENDİ, BU DOSYADA UYGULANMADI:
 *   place-crop.js'in z-index sorunu, "Düzenle" (admin-modal-overlay/
 *   admin-lightbox, z-index 620/640) modalı AÇIKKEN kırpma penceresinin
 *   (`.auth-ov`, z-index 600) o modalın ARKASINDA açılabilmesinden
 *   kaynaklanıyordu. Avatar kırpma penceresi için bu senaryo YOK:
 *     - `public/profile.html`: `#avatarFile` girişi, sayfanın normal
 *       `.profile-settings-card` bölümünde; hiçbir `.admin-modal-overlay`,
 *       `.admin-lightbox` veya başka bir yüksek z-index kapsayıcının içinde
 *       DEĞİL. Avatar yükleme her zaman kendi tam sayfasında gerçekleşiyor.
 *     - `public/admin.html`: `avatarFile`, `TL_AVATAR_CROP` veya
 *       `avatar-crop.js` hiç referans edilmiyor. Admin tarafındaki tek
 *       avatar özelliği "Profil fotoğrafını kaldır" (`openRemoveUserAvatarModal`
 *       / `POST /admin/users/:id/remove-avatar`) — bu, kırpma adımı OLMAYAN,
 *       basit bir onay modalıyla DOĞRUDAN silme işlemi; `TL_AVATAR_CROP`'u
 *       hiç çağırmıyor.
 *   Yani avatar kırpma penceresi hiçbir zaman daha yüksek z-index'li başka
 *   bir modalın içinden açılmıyor — z-index düzeltmesi burada GEREKSİZ, bu
 *   yüzden uygulanmadı (gereksiz/spekülatif değişiklik yapılmadı).
 *
 * Bu script SUNUCU TARAFINDA statik olarak doğrular. DÜRÜSTLÜK NOTU: bu, saf
 * bir ön-yüz DOM/CSS katmanlama hatası — gerçek tıklama/görünürlük testi
 * tarayıcı gerektirir. Gerçek doğrulama bu sandbox'ta geçici bir Playwright +
 * gerçek Chrome script'iyle (repoya eklenmedi) yapıldı.
 *
 * Usage: node server/scripts/verify-avatar-crop-visibility.js
 */
const fs = require('fs');
const path = require('path');

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

console.log('verify-avatar-crop-visibility');

const cropJs = read('public/js/avatar-crop.js');

// ---------------------------------------------------------------------------
// 1) avatarCropImg artık loading="lazy" taşımıyor (place-crop.js'teki aynı
//    lazy-load çıkmazı regresyon muhafızı).
// ---------------------------------------------------------------------------
const imgTagMatch = cropJs.match(/<img[^>]*id="avatarCropImg"[^>]*\/?>/);
if (!imgTagMatch) {
  fail('avatar-crop.js içinde #avatarCropImg <img> etiketi bulunamadı (beklenmeyen refactor?)');
} else if (/loading\s*=\s*"lazy"/i.test(imgTagMatch[0])) {
  fail('#avatarCropImg hâlâ loading="lazy" taşıyor — display:none kapsayıcı içinde bu resim hiç yüklenmez, kırpma penceresi sessizce hiç görünmez olur (place-crop.js ile aynı hata, PR #71)');
} else {
  ok('#avatarCropImg artık loading="lazy" taşımıyor (kırpma penceresi kendi görünürlüğüne bağımlı bir çıkmaza düşmüyor)');
}

if (!/document\.getElementById\('avatarCropOv'\)\.classList\.add\('on'\)/.test(cropJs)) {
  fail('avatar-crop.js open() artık beklenen .on sınıfı ekleme deseninde değil (beklenmeyen refactor — manuel kontrol gerek)');
} else {
  ok('open() hâlâ img.onload içinde #avatarCropOv\'a .on ekliyor (davranış korunmuş, yalnızca lazy-load engeli kaldırıldı)');
}

// ---------------------------------------------------------------------------
// 2) z-index: bilinçli olarak uygulanmadı — bunun neden GÜVENLİ olduğunu
//    doğrula (avatar-crop hiçbir admin modalından tetiklenmiyor).
// ---------------------------------------------------------------------------
const adminHtml = read('public/admin.html');
if (/TL_AVATAR_CROP|avatarFile|avatar-crop\.js/.test(adminHtml)) {
  fail('admin.html artık avatar-crop.js / TL_AVATAR_CROP / avatarFile referansı içeriyor — bu, kırpma penceresinin bir admin modalından (.admin-modal-overlay z-index 620+) tetiklenebileceği anlamına gelebilir; z-index düzeltmesi (place-crop.js\'teki gibi ov.style.zIndex) YENİDEN DEĞERLENDİRİLMELİ');
} else {
  ok('admin.html hâlâ avatar-crop.js / TL_AVATAR_CROP / avatarFile kullanmıyor (admin tarafı yalnızca doğrudan "profil fotoğrafını kaldır", kırpma adımı yok) — z-index çakışma senaryosu yok');
}

const profileHtml = read('public/profile.html');
const avatarFileMatch = profileHtml.match(/<label[^>]*for="avatarFile"[\s\S]{0,2000}/);
if (!avatarFileMatch) {
  fail('profile.html içinde #avatarFile girişi bulunamadı (beklenmeyen refactor?)');
} else if (/admin-modal-overlay|admin-lightbox/.test(profileHtml.slice(0, profileHtml.indexOf('for="avatarFile"')))) {
  fail('profile.html avatarFile girişinden ÖNCE bir admin-modal-overlay/admin-lightbox açılışı var — avatar yükleme artık bir modal içinde olabilir, z-index düzeltmesi yeniden değerlendirilmeli');
} else {
  ok('profile.html #avatarFile girişi sayfanın normal akışında, bir admin modalı/lightbox içinde değil');
}

// ---------------------------------------------------------------------------
// 3) Regresyon: FAZ2-1 (PR #69) avatar-crop.js'in lazy-load EDİLME mekanizması
//    (script injection) hâlâ duruyor ve bu PR onu bozmadı.
// ---------------------------------------------------------------------------
const appJs = read('public/js/app.js');
if (!appJs.includes('function ensureAvatarCropLib')) {
  fail('app.js artık ensureAvatarCropLib() lazy-loader içermiyor — bu PR ile ilgisiz bir regresyon (PR #69/FAZ2-1)');
} else {
  ok('app.js hâlâ ensureAvatarCropLib() lazy-loader\'a sahip (FAZ2-1 regresyonsuz)');
}
if (/<script[^>]+src="\/js\/avatar-crop\.js/.test(read('public/index.html'))) {
  fail('index.html artık avatar-crop.js\'i eager-load ediyor — FAZ2-1 regresyonu');
} else {
  ok('index.html hâlâ avatar-crop.js\'i eager-load etmiyor (FAZ2-1 regresyonsuz)');
}

console.log('');
if (failed) {
  console.error(`verify-avatar-crop-visibility: ${failed} kontrol BAŞARISIZ`);
  process.exit(1);
}
console.log('verify-avatar-crop-visibility: tüm statik kontroller geçti.');
console.log('NOT: bu salt statik bir kontrol — gerçek tıklama/DOM görünürlüğü tarayıcı');
console.log('gerektirir; manuel test: Profil → Ayarlar → fotoğraf yükle → kırpma');
console.log('penceresi açılmalı.');
