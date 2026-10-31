/**
 * [FAZ2-2] Görsel Optimizasyon Pipeline (Sharp) — doğrulama.
 * PRD'nin 6 kontrol noktasını doğrudan server/lib/image-process.js üzerinde
 * (HTTP sunucusu gerekmeden) birim test gibi çalıştırır:
 *   1) magic-byte allowlist (file-type) devrede mi
 *   2) piksel-boyutu sıkıştırma-bombası koruması var mı (.resize() ÖNCESİ)
 *   3) EXIF rotation (.rotate()) metadata silinmeden ÖNCE uygulanıyor mu
 *   4) TÜM metadata (GPS dahil) siliniyor mu
 *   5) sabit maksimum boyuta (1920x1080) resize + withoutEnlargement tutarlı mı
 *   6) çıkış formatı her yerde WebP mi
 *
 * Usage: node server/scripts/verify-faz2-2-image-pipeline.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const {
  processImageBuffer,
  assertSafeDimensions,
  MAX_WIDTH,
  MAX_HEIGHT,
  MAX_INPUT_DIMENSION,
} = require('../lib/image-process');
const { detectImageMimeFromBuffer } = require('../lib/image-mime');

let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) { console.error('  ✗', msg); failed += 1; }

console.log('verify-faz2-2-image-pipeline');

function containsGpsIfdTag(exifBuf) {
  // GPS IFD pointer tag id = 0x8825 (little-endian "25 88" veya big-endian "88 25")
  if (!exifBuf || !exifBuf.length) return false;
  return exifBuf.includes(Buffer.from([0x88, 0x25])) || exifBuf.includes(Buffer.from([0x25, 0x88]));
}

async function makeJpegWithOrientationAndGps() {
  // 20x10 taban görsel + orientation=6 (90° CW) + sahte GPS IFD verisi
  const base = await sharp({
    create: { width: 20, height: 10, channels: 3, background: { r: 10, g: 200, b: 30 } },
  }).jpeg().toBuffer();

  return sharp(base)
    .withExif({
      IFD0: { Make: 'TouristlioTestCam' },
      IFD2: {
        GPSLatitude: '41/1 0/1 0/1',
        GPSLatitudeRef: 'N',
        GPSLongitude: '28/1 0/1 0/1',
        GPSLongitudeRef: 'E',
      },
    })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
}

(async () => {
  // ---- 1) Rotation: EXIF orientation öncesi/sonrası ----
  const rotTestBuf = await makeJpegWithOrientationAndGps();
  const inMeta = await sharp(rotTestBuf).metadata();
  if (inMeta.orientation !== 6) fail(`test görseli orientation=6 olmalı, geldi: ${inMeta.orientation}`);
  else ok('test JPEG girişte orientation=6 (90° döndürme) taşıyor');
  if (!inMeta.exif) fail('test JPEG girişte EXIF içermeli (GPS testi için)');
  else ok('test JPEG girişte EXIF/GPS verisi var');

  const rotated = await processImageBuffer(rotTestBuf, { stem: 'rotation-test', srcset: false });
  const rotOutMeta = await sharp(rotated.buffer).metadata();
  // orientation=6 iken genişlik/yükseklik takas edilmeli (20x10 -> 10x20)
  if (rotOutMeta.width === 10 && rotOutMeta.height === 20) {
    ok(`EXIF orientation doğru pikselde uygulandı (çıkış ${rotOutMeta.width}x${rotOutMeta.height})`);
  } else {
    fail(`EXIF rotation uygulanmadı, beklenen 10x20, gelen ${rotOutMeta.width}x${rotOutMeta.height}`);
  }

  // ---- 2) GPS/metadata tam silme ----
  if (rotOutMeta.exif) {
    fail('çıkışta hâlâ EXIF bloğu var (metadata silinmedi)');
  } else {
    ok('çıkışta EXIF bloğu yok (tüm metadata silindi)');
  }
  if (containsGpsIfdTag(rotOutMeta.exif)) {
    fail('çıkış EXIF buffer içinde GPS IFD tag (0x8825) bulundu — GPS SIZINTISI');
  } else {
    ok('çıkış buffer içinde GPS IFD tag (0x8825) yok');
  }
  if (rotated.buffer.includes('GPSLatitude') || rotated.buffer.includes('TouristlioTestCam')) {
    fail('çıkış byte dizisinde GPS/kamera string izi bulundu');
  } else {
    ok('çıkış byte dizisinde GPS/kamera string izi yok');
  }

  // ---- 3) Çıkış formatı WebP ----
  if (rotOutMeta.format !== 'webp') fail(`çıkış formatı webp olmalı, geldi: ${rotOutMeta.format}`);
  else ok('çıkış formatı WebP');
  if (rotated.buffer.subarray(8, 12).toString('ascii') !== 'WEBP') {
    fail('çıkış buffer magic bytes "WEBP" değil');
  } else ok('çıkış buffer magic bytes "RIFF....WEBP" doğrulandı');

  // ---- 4) Büyük görsel 1920x1080 sınırına küçültülüyor, küçük görsel büyütülmüyor ----
  const bigBuf = await sharp({
    create: { width: 3000, height: 2200, channels: 3, background: { r: 5, g: 5, b: 200 } },
  }).jpeg({ quality: 85 }).toBuffer();
  const bigProcessed = await processImageBuffer(bigBuf, { stem: 'big-test', srcset: false });
  const bigMeta = await sharp(bigProcessed.buffer).metadata();
  if (bigMeta.width > MAX_WIDTH || bigMeta.height > MAX_HEIGHT) {
    fail(`büyük görsel sınır içine küçültülmedi: ${bigMeta.width}x${bigMeta.height}`);
  } else {
    ok(`büyük görsel ${MAX_WIDTH}x${MAX_HEIGHT} sınırı içine küçültüldü (çıkış ${bigMeta.width}x${bigMeta.height})`);
  }

  const smallBuf = await sharp({
    create: { width: 50, height: 40, channels: 3, background: { r: 200, g: 5, b: 5 } },
  }).jpeg({ quality: 85 }).toBuffer();
  const smallProcessed = await processImageBuffer(smallBuf, { stem: 'small-test', srcset: false });
  const smallMeta = await sharp(smallProcessed.buffer).metadata();
  if (smallMeta.width !== 50 || smallMeta.height !== 40) {
    fail(`küçük görsel büyütüldü (withoutEnlargement bozuk): ${smallMeta.width}x${smallMeta.height}`);
  } else {
    ok(`küçük görsel büyütülmedi (withoutEnlargement): ${smallMeta.width}x${smallMeta.height}`);
  }

  // ---- 5) Sıkıştırma-bombası koruması: .resize() öncesi piksel kontrolü ----
  sharp.cache(false);
  const bombBuf = await sharp({
    create: {
      width: MAX_INPUT_DIMENSION + 500,
      height: 50,
      channels: 3,
      background: { r: 1, g: 1, b: 1 },
    },
  }).png({ compressionLevel: 9 }).toBuffer();
  try {
    await assertSafeDimensions(bombBuf);
    fail(`assertSafeDimensions ${MAX_INPUT_DIMENSION}px üstü genişliği reddetmedi`);
  } catch (e) {
    if (e.code === 'IMAGE_DIMENSIONS_TOO_LARGE') {
      ok(`sıkıştırma-bombası koruması: ${MAX_INPUT_DIMENSION}px üstü genişlik reddedildi (.resize() öncesi)`);
    } else {
      fail(`beklenmeyen hata: ${e.message}`);
    }
  }
  try {
    await processImageBuffer(bombBuf, { stem: 'bomb-test', srcset: false });
    fail('processImageBuffer aşırı büyük piksel boyutunu işlemeye devam etti');
  } catch (e) {
    if (e.code === 'IMAGE_DIMENSIONS_TOO_LARGE') {
      ok('processImageBuffer aşırı büyük piksel boyutunu reddetti (ana pipeline üzerinden)');
    } else {
      fail(`processImageBuffer beklenmeyen hatayla reddetti: ${e.message}`);
    }
  }

  // ---- 6) Magic-byte doğrulaması: içerik/uzantı uyuşmazlığı ve görsel-olmayan dosya ----
  const notAnImage = Buffer.from('bu bir görsel değil, düz metin dosyası');
  const notImgMime = await detectImageMimeFromBuffer(notAnImage);
  if (notImgMime) fail(`düz metin dosyası görsel olarak algılandı: ${notImgMime}`);
  else ok('düz metin dosyası magic-byte ile görsel olarak algılanmadı');
  try {
    await processImageBuffer(notAnImage, { stem: 'not-an-image', srcset: false });
    fail('processImageBuffer görsel olmayan dosyayı işlemeye devam etti');
  } catch (e) {
    if (e.code === 'UNSUPPORTED_IMAGE_TYPE') {
      ok('processImageBuffer görsel olmayan dosyayı magic-byte kontrolüyle reddetti');
    } else {
      fail(`processImageBuffer beklenmeyen hatayla reddetti: ${e.message}`);
    }
  }

  const pngAsJpgExt = await sharp({
    create: { width: 16, height: 16, channels: 3, background: '#0a0' },
  }).png().toBuffer();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-faz22-'));
  const spoofPath = path.join(tmp, 'spoof.jpg');
  fs.writeFileSync(spoofPath, pngAsJpgExt);
  const spoofMime = await detectImageMimeFromBuffer(fs.readFileSync(spoofPath));
  if (spoofMime !== 'image/png') {
    fail(`.jpg uzantılı PNG içerik doğru algılanmadı: ${spoofMime}`);
  } else {
    ok('uzantı/sihirli-byte uyuşmazlığı (.jpg adında PNG) doğru tespit edildi — içerik yine de allowlist\'te olduğu için işlenebilir');
  }
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch { /* ignore */ }

  console.log('');
  if (failed) {
    console.error(`  ✗ FAZ2-2 doğrulaması BAŞARISIZ (${failed} hata)`);
    process.exit(1);
  }
  console.log('  ✓ FAZ2-2 image pipeline doğrulaması OK');
  process.exit(0);
})().catch((err) => {
  console.error('verify-faz2-2-image-pipeline hata:', err);
  process.exit(1);
});
