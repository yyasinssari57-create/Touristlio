/**
 * Admin paneli: "Görseli ayarla" seçiciyle hiçbir şey olmuyor (Yasin — PR #67/#68
 * SONRASI yeni bildirim).
 *
 * Bildirim: "Yer düzenle" modalındaki "Fotoğraflar" bölümünde (16:9 kırpma,
 * `edPhotos` / `public/js/place-crop.js`) bir görsel seçilince HİÇBİR ŞEY
 * olmuyordu — hata yok, kırpma penceresi açılmıyor, "Henüz görsel yok." metni
 * aynı kalıyor. Bu, PR #67 (dosya boyutu) ve PR #68'in (gizli hata mesajı)
 * düzelttiği sorunlardan FARKLI bir hata: burada gerçekten HİÇ istisna
 * fırlatılmıyor, bu yüzden önceki iki düzeltme bunu yakalayamadı.
 *
 * KÖK NEDEN — iki ayrı, birbirini güçlendiren hata, gerçek Chrome ile
 * (Playwright + sistem google-chrome-stable, bu sandbox'ta geçici olarak,
 * repoya COMMIT EDİLMEDİ) adım adım doğrulandı:
 *
 *   1) `place-crop.js`'teki kırpma önizleme `<img id="placeCropImg">`
 *      `loading="lazy"` taşıyordu ([YÜKSEK-3] optimize-images sweep'i TÜM
 *      <img> etiketlerine toptan eklemişti). Bu resim, varsayılan olarak
 *      `display:none` olan bir kırpma penceresinin (`.auth-ov`) İÇİNDE; o
 *      pencereyi görünür yapan `.on` sınıfı YALNIZCA bu resmin KENDİ
 *      `onload` olayının içinde ekleniyor. Tarayıcı, `display:none` bir
 *      kapsayıcı içindeki lazy-loaded resmi GÖRÜNÜRLÜK KESİŞİMİ olmadığı
 *      için asla yüklemiyor — `onload` hiç ateşlenmiyor, `.on` hiç
 *      eklenmiyor, pencere SONSUZA DEK görünmez kalıyor. Sessiz bir
 *      çıkmaz (deadlock); konsolda hata yok.
 *   2) Bu çıkmaz aşılsa bile (resim bir şekilde yüklense), "Düzenle"
 *      modallarının kullandığı `.admin-modal-overlay`, `inline-overrides.css`
 *      tarafından z-index 620'ye (ve `.admin-lightbox` 640'a) yükseltilmiş
 *      durumda — ama kırpma penceresinin kullandığı paylaşılan `.auth-ov`
 *      sınıfı `style.css`'te hâlâ yalnızca z-index 600. Yani "Düzenle"
 *      modalı AÇIKKEN kırpma penceresi açılırsa, kırpma penceresi teknik
 *      olarak DOM'da var ve "açık" ama düzenle modalının ARKASINDA,
 *      tamamen görünmez kalıyor.
 *
 * Her iki hata da yalnızca "Düzenle" akışlarında (edPhotos/edCtImageFile/
 * edCatImageFile — hepsi `#modalOverlay` İÇİNDE) birlikte "hiçbir şey
 * olmuyor" hissini üretiyor; (1) numaralı lazy-load çıkmazı aslında "Yeni
 * ekle" formlarındaki (plPhotos vb., modal dışı) aynı kırpma penceresini de
 * etkiliyor — tesadüfen daha az fark edilmiş olabilir, ama aynı kod yolu.
 *
 * DÜZELTME (`public/js/place-crop.js`, tek dosya):
 *   - `#placeCropImg`'den `loading="lazy"` kaldırıldı — bu resim zaten
 *     yalnızca kullanıcı bir dosya SEÇTİĞİNDE, JS tarafından talep üzerine
 *     oluşturuluyor; "ekranda görünene kadar geciktir" kazancı sıfır, ama
 *     kendi görünürlüğüne bağımlı bir çıkmaz yaratıyordu.
 *   - Kırpma penceresine (`ensureModal()` içinde) `ov.style.zIndex` ile
 *     açık, satır-içi bir z-index verildi — paylaşılan `.auth-ov` CSS
 *     kuralını (herkese açık giriş/kayıt modalı da kullanıyor) değiştirmeden,
 *     YALNIZCA bu kırpma penceresi örneğini admin düzenle modalının/
 *     lightbox'ının üstüne çıkarır.
 *
 * Bu script SUNUCU TARAFINDA statik olarak hem eski hatanın gerçekten
 * giderildiğini hem de ileride tekrar eklenmeyeceğini (regresyon muhafızı)
 * doğrular. DÜRÜSTLÜK NOTU: bu, saf bir ön-yüz DOM/CSS katmanlama hatası —
 * "tıkla → JS dinleyicisi tetiklenir mi" veya "modal görünür mü" sorusunu
 * sunucu tarafı bir HTTP isteğiyle test ETMEK MÜMKÜN DEĞİL. Gerçek
 * doğrulama bu sandbox'ta geçici bir Playwright + gerçek Chrome script'iyle
 * (repoya eklenmedi) yapıldı: dosya seçilince kırpma penceresinin DOM'a
 * eklendiği ama `.on` sınıfının hiç gelmediği (eski kod) / tam tersine artık
 * geldiği ve modalın ÜSTÜNDE göründüğü (düzeltme) ekran görüntüleriyle
 * doğrulandı. Canlıda Yasin'in elle test etmesi gerekiyor (PR açıklamasına
 * bakın).
 *
 * Usage: node server/scripts/verify-admin-image-picker.js
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

console.log('verify-admin-image-picker');

const cropJs = read('public/js/place-crop.js');

// ---------------------------------------------------------------------------
// 1) placeCropImg artık loading="lazy" taşımıyor (display:none kapsayıcı
//    içinde lazy resim asla onload ateşlemiyor -> kırpma penceresi hiç
//    görünür olmuyordu).
// ---------------------------------------------------------------------------
const imgTagMatch = cropJs.match(/<img[^>]*id="placeCropImg"[^>]*\/?>/);
if (!imgTagMatch) {
  fail('place-crop.js içinde #placeCropImg <img> etiketi bulunamadı (beklenmeyen refactor?)');
} else if (/loading\s*=\s*"lazy"/i.test(imgTagMatch[0])) {
  fail('#placeCropImg hâlâ loading="lazy" taşıyor — display:none kapsayıcı içinde bu resim hiç yüklenmez, kırpma penceresi sessizce hiç görünmez ("hiçbir şey olmuyor" hatası geri geldi)');
} else {
  ok('#placeCropImg artık loading="lazy" taşımıyor (kırpma penceresi kendi görünürlüğüne bağımlı bir çıkmaza düşmüyor)');
}

// ---------------------------------------------------------------------------
// 2) Kırpma penceresine (ensureModal) açık bir z-index veriliyor ve bu değer
//    admin "Düzenle" modalının / lightbox'ın ÜSTÜNDE.
// ---------------------------------------------------------------------------
const zIndexMatch = cropJs.match(/ov\.style\.zIndex\s*=\s*['"](\d+)['"]/);
if (!zIndexMatch) {
  fail('place-crop.js ensureModal() artık kırpma penceresine açık bir ov.style.zIndex vermiyor — admin "Düzenle" modalı (.admin-modal-overlay, z-index 620) açıkken kırpma penceresi (.auth-ov, style.css\'te yalnızca z-index 600) onun ARKASINDA kalır, tamamen görünmez olur');
} else {
  const cropZIndex = Number(zIndexMatch[1]);
  const overridesCss = read('public/css/inline-overrides.css');
  const competitors = [
    { name: '.admin-modal-overlay (Yer/Şehir/Kategori "Düzenle" modalları)', re: /\.admin-modal-overlay\s*\{[^}]*z-index:\s*(\d+)/ },
    { name: '.admin-lightbox (admin galeri büyütme)', re: /\.admin-lightbox\s*\{[^}]*z-index:\s*(\d+)/ },
  ];
  let allAbove = true;
  for (const c of competitors) {
    const m = overridesCss.match(c.re);
    if (!m) {
      fail(`inline-overrides.css içinde ${c.name} için z-index bulunamadı (beklenmeyen değişiklik?)`);
      allAbove = false;
      continue;
    }
    const otherZ = Number(m[1]);
    if (cropZIndex <= otherZ) {
      fail(`Kırpma penceresi z-index'i (${cropZIndex}) ${c.name} z-index'inden (${otherZ}) yüksek DEĞİL — "Düzenle" modalı açıkken kırpma penceresi onun arkasında kalır, görünmez olur`);
      allAbove = false;
    }
  }
  if (allAbove) {
    ok(`Kırpma penceresi z-index'i (${cropZIndex}) admin "Düzenle" modalının ve lightbox'ın üstünde — artık onların arkasında kalmıyor`);
  }
}

// ---------------------------------------------------------------------------
// 3) Regresyon: place-crop.js'teki diğer son düzeltmeler (PR #67) hâlâ duruyor.
// ---------------------------------------------------------------------------
if (!/MAX_FILE_BYTES\s*=\s*12\s*\*\s*1024\s*\*\s*1024/.test(cropJs)) {
  fail('place-crop.js MAX_FILE_BYTES artık 12 MB değil — bu PR ile ilgisiz bir regresyon');
} else {
  ok('place-crop.js MAX_FILE_BYTES hâlâ 12 MB (PR #67 regresyonsuz)');
}

console.log('');
if (failed) {
  console.error(`verify-admin-image-picker: ${failed} kontrol BAŞARISIZ`);
  process.exit(1);
}
console.log('verify-admin-image-picker: tüm statik kontroller geçti.');
console.log('NOT: bu salt statik bir kontrol — gerçek tıklama/DOM görünürlüğü tarayıcı');
console.log('gerektirir; manuel test adımları için PR açıklamasına bakın.');
