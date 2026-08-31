/**
 * [YÜKSEK-3] Image pipeline checks — magic bytes, EXIF strip, 1080p, WebP.
 * Usage: node server/scripts/verify-images.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { processImageFile, MAX_WIDTH, MAX_HEIGHT } = require('../lib/image-process');
const { detectImageMime, isAllowedImageMime } = require('../lib/image-mime');

const IMG_DIR = path.join(__dirname, '..', '..', 'public', 'images');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-img-'));

function fail(msg) {
  console.error('  ✗', msg);
  process.exitCode = 1;
}

function ok(msg) {
  console.log('  ✓', msg);
}

async function makeJpegWithExif(filePath) {
  await sharp({
    create: { width: 2400, height: 1600, channels: 3, background: { r: 20, g: 80, b: 140 } },
  })
    .withMetadata({
      exif: {
        IFD0: { Copyright: 'TOURISTLIO-EXIF-LEAK', Software: 'verify-images' },
      },
    })
    .jpeg({ quality: 90 })
    .toFile(filePath);
}

async function makeGif(filePath) {
  // GIF89a 1x1
  fs.writeFileSync(filePath, Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00\x3b', 'binary'));
}

async function makePngSpoofedAsJpg(filePath) {
  const png = await sharp({
    create: { width: 16, height: 16, channels: 3, background: '#0a0' },
  }).png().toBuffer();
  fs.writeFileSync(filePath, png);
}

(async () => {
  console.log('verify-images');

  const required = ['hero.webp', 'hero-480w.webp', 'hero-800w.webp', 'logo.webp', 'logo-round.webp', 'nav-logo.webp'];
  for (const name of required) {
    const p = path.join(IMG_DIR, name);
    if (fs.existsSync(p)) ok(`static ${name} exists (${(fs.statSync(p).size / 1024).toFixed(1)} KB)`);
    else fail(`missing static ${name}`);
  }

  const jpegPath = path.join(tmp, 'gps-leak.jpg');
  await makeJpegWithExif(jpegPath);
  const inMeta = await sharp(jpegPath).metadata();
  if (!inMeta.exif) fail('test jpeg should contain EXIF before processing');
  else ok('test jpeg has EXIF before processing');

  const processed = await processImageFile(jpegPath);
  const outMeta = await sharp(processed.path).metadata();
  if (outMeta.format !== 'webp') fail(`expected webp, got ${outMeta.format}`);
  else ok(`output format webp (${processed.size} bytes)`);
  if (outMeta.exif) fail('EXIF still present after processing');
  else ok('EXIF stripped (Sharp default: omit withMetadata)');
  const outBuf = fs.readFileSync(processed.path);
  if (outBuf.includes('TOURISTLIO-EXIF-LEAK') || outBuf.includes('GPS')) {
    fail('EXIF/GPS string leaked into output bytes');
  } else {
    ok('no EXIF copyright/GPS strings in output');
  }
  if (outMeta.width > MAX_WIDTH || outMeta.height > MAX_HEIGHT) {
    fail(`exceeds 1080p: ${outMeta.width}x${outMeta.height}`);
  } else {
    ok(`capped within 1080p: ${outMeta.width}x${outMeta.height}`);
  }
  if (!processed.variants.length) fail('expected srcset variants for 2400px source');
  else ok(`srcset variants: ${processed.variants.map((v) => v.filename).join(', ')}`);

  const gifPath = path.join(tmp, 'x.gif');
  await makeGif(gifPath);
  const gifMime = await detectImageMime(gifPath);
  if (isAllowedImageMime(gifMime)) fail(`GIF should be rejected, mime=${gifMime}`);
  else ok(`GIF rejected (mime=${gifMime || 'none'})`);
  try {
    await processImageFile(gifPath);
    fail('GIF processImageFile should throw');
  } catch (e) {
    ok(`GIF processing throws: ${e.message}`);
  }

  const spoof = path.join(tmp, 'spoof.jpg');
  await makePngSpoofedAsJpg(spoof);
  const spoofMime = await detectImageMime(spoof);
  if (spoofMime !== 'image/png') fail(`spoofed jpg should detect as png, got ${spoofMime}`);
  else ok('magic bytes detect PNG inside .jpg name');

  const htmlRoot = path.join(__dirname, '..', '..', 'public');
  function walkHtml(dir, acc = []) {
    for (const name of fs.readdirSync(dir)) {
      if (name === 'vendor' || name === 'images') continue;
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) walkHtml(p, acc);
      else if (name.endsWith('.html')) acc.push(p);
    }
    return acc;
  }
  let missingLazy = 0;
  let pngLogoRefs = 0;
  for (const f of walkHtml(htmlRoot)) {
    const html = fs.readFileSync(f, 'utf8');
    const imgs = html.match(/<img\b[^>]*>/gi) || [];
    for (const tag of imgs) {
      if (!/\bloading\s*=\s*["']lazy["']/i.test(tag)) missingLazy += 1;
      if (/logo-round\.png|\/images\/logo\.png/i.test(tag)) pngLogoRefs += 1;
    }
  }
  if (missingLazy) fail(`HTML <img> missing loading=lazy: ${missingLazy}`);
  else ok('all public HTML <img> tags have loading="lazy" (hero is CSS, not <img>)');
  if (pngLogoRefs) fail(`HTML still references PNG logos: ${pngLogoRefs}`);
  else ok('HTML logos point to .webp');

  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch { /* ignore */ }

  if (process.exitCode) {
    console.error('  ✗ image verification failed');
    process.exit(1);
  }
  console.log('  ✓ OK');
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
