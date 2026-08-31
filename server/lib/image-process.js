/**
 * [YÜKSEK-3] Image pipeline: magic-byte allowlist, EXIF strip, 1080p cap, WebP + srcset.
 * Sharp default (and .withMetadata(false)) strips EXIF/GPS — KVKK/GDPR.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { detectImageMime } = require('./image-mime');

const MAX_WIDTH = 1920;
const MAX_HEIGHT = 1080;
const WEBP_QUALITY = 82;
const SRCSET_WIDTHS = [480, 800];
const ALLOWED_PROCESS_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function webpStem(filePath) {
  return path.basename(filePath).replace(/\.(jpe?g|png|webp)$/i, '');
}

function variantName(stem, width) {
  return `${stem}-${width}w.webp`;
}

async function assertAllowedMagicBytes(filePath) {
  const mime = await detectImageMime(filePath);
  if (!mime || !ALLOWED_PROCESS_MIMES.has(mime)) {
    const err = new Error('Sadece JPEG, PNG veya WebP kabul edilir');
    err.status = 400;
    err.code = 'UNSUPPORTED_IMAGE_TYPE';
    throw err;
  }
  return mime;
}

/**
 * Strip EXIF (including GPS), cap at 1080p, write WebP.
 * Audit asked for .withMetadata(false); in Sharp 0.35 that CALL keeps EXIF.
 * Omitting withMetadata() is the documented strip (default).
 */
function webpPipeline(input) {
  return sharp(input, { failOn: 'none', sequentialRead: true })
    .rotate()
    .resize(MAX_WIDTH, MAX_HEIGHT, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY, effort: 4 });
}

async function writeSrcsetVariants(mainWebpPath) {
  const dir = path.dirname(mainWebpPath);
  const stem = webpStem(mainWebpPath);
  const meta = await sharp(mainWebpPath).metadata();
  const variants = [];
  const srcWidth = meta.width || 0;
  for (const w of SRCSET_WIDTHS) {
    if (srcWidth <= w) continue;
    const filename = variantName(stem, w);
    const outPath = path.join(dir, filename);
    await sharp(mainWebpPath, { failOn: 'none' })
        .resize(w, null, { withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY, effort: 4 })
        .toFile(outPath);
    variants.push({ width: w, filename, path: outPath });
  }
  return { width: srcWidth, height: meta.height || 0, variants };
}

async function processImageFile(filePath, { srcset = true } = {}) {
  await assertAllowedMagicBytes(filePath);
  const dir = path.dirname(filePath);
  const stem = webpStem(filePath);
  const filename = `${stem}.webp`;
  const outPath = path.join(dir, filename);
  const tmpPath = path.join(dir, `${stem}.${process.pid}.${Date.now()}.tmp.webp`);

  try {
    await webpPipeline(filePath).toFile(tmpPath);
    const resolvedIn = path.resolve(filePath);
    const resolvedOut = path.resolve(outPath);
    if (resolvedIn !== resolvedOut && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    fs.renameSync(tmpPath, outPath);
  } catch (e) {
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    throw e;
  }

  const stat = fs.statSync(outPath);
  let variants = [];
  let width = 0;
  let height = 0;
  if (srcset) {
    const extra = await writeSrcsetVariants(outPath);
    variants = extra.variants;
    width = extra.width;
    height = extra.height;
  } else {
    const meta = await sharp(outPath).metadata();
    width = meta.width || 0;
    height = meta.height || 0;
  }

  return {
    path: outPath,
    filename,
    mimetype: 'image/webp',
    size: stat.size,
    width,
    height,
    variants,
  };
}

/** Mutate a multer file object in place after disk storage. */
async function processUploadedFile(file, opts) {
  if (!file?.path) return null;
  const result = await processImageFile(file.path, opts);
  file.path = result.path;
  file.filename = result.filename;
  file.mimetype = result.mimetype;
  file.size = result.size;
  file.destination = path.dirname(result.path);
  return result;
}

function unlinkImageAndVariants(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return;
  const dir = path.dirname(filePath);
  const stem = webpStem(filePath);
  const targets = [filePath];
  for (const w of [...SRCSET_WIDTHS, MAX_WIDTH, MAX_HEIGHT]) {
    targets.push(path.join(dir, variantName(stem, w)));
  }
  for (const p of targets) {
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* ignore */ }
  }
}

module.exports = {
  MAX_WIDTH,
  MAX_HEIGHT,
  SRCSET_WIDTHS,
  ALLOWED_PROCESS_MIMES,
  assertAllowedMagicBytes,
  processImageFile,
  processUploadedFile,
  writeSrcsetVariants,
  unlinkImageAndVariants,
  webpStem,
  variantName,
};
