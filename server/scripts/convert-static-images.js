/**
 * Convert public/images raster files to WebP and emit hero srcset variants.
 * Usage: node server/scripts/convert-static-images.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const IMG_DIR = path.join(__dirname, '..', '..', 'public', 'images');
const SKIP = new Set(['_write-test.png']);
const SRCSET_WIDTHS = [480, 800];
const WEBP_QUALITY = 82;

async function convertFile(absPath) {
  const ext = path.extname(absPath).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) return null;
  const base = path.basename(absPath);
  if (SKIP.has(base) || base.startsWith('_')) return null;
  if (/-\d+w\.webp$/i.test(base)) return null;

  const stem = base.replace(/\.(jpe?g|png|webp)$/i, '');
  const outPath = path.join(path.dirname(absPath), `${stem}.webp`);
  const inputMeta = await sharp(absPath).metadata();

  await sharp(absPath, { failOn: 'none' })
    .rotate()
    .webp({ quality: WEBP_QUALITY, effort: 5 })
    .toFile(outPath + '.tmp');
  fs.renameSync(outPath + '.tmp', outPath);

  const variants = [];
  if (stem === 'hero' || (inputMeta.width || 0) >= 1000) {
    for (const w of SRCSET_WIDTHS) {
      if ((inputMeta.width || 0) <= w) continue;
      const vPath = path.join(path.dirname(absPath), `${stem}-${w}w.webp`);
      await sharp(outPath, { failOn: 'none' })
        .resize(w, null, { withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY, effort: 5 })
        .toFile(vPath);
      variants.push(path.basename(vPath));
    }
  }

  const outStat = fs.statSync(outPath);
  const inStat = fs.statSync(absPath);
  return {
    src: base,
    webp: path.basename(outPath),
    fromKb: +(inStat.size / 1024).toFixed(1),
    toKb: +(outStat.size / 1024).toFixed(1),
    variants,
  };
}

async function main() {
  const names = fs.readdirSync(IMG_DIR);
  const results = [];
  for (const name of names) {
    const abs = path.join(IMG_DIR, name);
    if (!fs.statSync(abs).isFile()) continue;
    try {
      const r = await convertFile(abs);
      if (r) results.push(r);
    } catch (err) {
      console.error('skip', name, err.message);
    }
  }
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
