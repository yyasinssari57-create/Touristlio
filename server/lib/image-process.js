/**
 * [YÜKSEK-3] Image pipeline: magic-byte allowlist, EXIF strip, 1080p cap, WebP + srcset.
 * Sharp default (and .withMetadata(false)) strips EXIF/GPS — KVKK/GDPR.
 * When SUPABASE_URL + SUPABASE_SERVICE_KEY are set, files go to Supabase Storage.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { detectImageMime, detectImageMimeFromBuffer } = require('./image-mime');
const storage = require('./supabase-storage');
const { storedUploadPath } = require('./media-url');

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

async function assertAllowedMagicBytesBuffer(buf) {
  const mime = await detectImageMimeFromBuffer(buf);
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

async function processImageBuffer(inputBuffer, { stem, srcset = true } = {}) {
  await assertAllowedMagicBytesBuffer(inputBuffer);
  const safeStem = String(stem || `img-${Date.now()}`).replace(/[^\w.-]+/g, '_');
  const mainBuf = await webpPipeline(inputBuffer).toBuffer();
  const meta = await sharp(mainBuf).metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  const variants = [];
  if (srcset) {
    for (const w of SRCSET_WIDTHS) {
      if (width <= w) continue;
      const buf = await sharp(mainBuf, { failOn: 'none' })
        .resize(w, null, { withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY, effort: 4 })
        .toBuffer();
      variants.push({ width: w, filename: variantName(safeStem, w), buffer: buf });
    }
  }
  return {
    filename: `${safeStem}.webp`,
    buffer: mainBuf,
    mimetype: 'image/webp',
    size: mainBuf.length,
    width,
    height,
    variants,
  };
}

function diskUploadRoot() {
  return path.join(__dirname, '..', '..', 'uploads');
}

async function persistProcessed({ processed, destRel }) {
  const relDir = String(destRel || '').replace(/^\/+|\/+$/g, '');
  const objectKey = relDir ? `${relDir}/${processed.filename}` : processed.filename;
  if (storage.isEnabled()) {
    await storage.uploadObjectUpsert(objectKey, processed.buffer, 'image/webp');
    for (const v of processed.variants || []) {
      const vKey = relDir ? `${relDir}/${v.filename}` : v.filename;
      await storage.uploadObjectUpsert(vKey, v.buffer, 'image/webp');
    }
    return {
      storageKey: objectKey,
      filename: processed.filename,
      url: storedUploadPath(objectKey),
      mimetype: processed.mimetype,
      size: processed.size,
      width: processed.width,
      height: processed.height,
    };
  }

  const dir = path.join(diskUploadRoot(), relDir);
  fs.mkdirSync(dir, { recursive: true });
  const outPath = path.join(dir, processed.filename);
  fs.writeFileSync(outPath, processed.buffer);
  for (const v of processed.variants || []) {
    fs.writeFileSync(path.join(dir, v.filename), v.buffer);
  }
  return {
    storageKey: objectKey,
    filename: processed.filename,
    path: outPath,
    url: `/uploads/${objectKey}`,
    mimetype: processed.mimetype,
    size: processed.size,
    width: processed.width,
    height: processed.height,
  };
}

function originalStem(file) {
  const raw = file.originalname || file.filename || `img-${Date.now()}`;
  return path.basename(raw).replace(/\.(jpe?g|png|webp|gif)$/i, '') || `img-${Date.now()}`;
}

async function processUploadedFile(file, opts = {}) {
  if (!file) return null;
  const destRel = opts.destRel || '';
  const stemBase = `${Date.now()}-${originalStem(file)}`.replace(/[^\w.-]+/g, '_');
  let processed;
  if (file.buffer && file.buffer.length) {
    processed = await processImageBuffer(file.buffer, { stem: stemBase, srcset: opts.srcset !== false });
  } else if (file.path) {
    const onDisk = await processImageFile(file.path, opts);
    const buf = fs.readFileSync(onDisk.path);
    const variants = [];
    for (const v of onDisk.variants || []) {
      if (v.path && fs.existsSync(v.path)) {
        variants.push({ width: v.width, filename: v.filename, buffer: fs.readFileSync(v.path) });
      }
    }
    processed = {
      filename: onDisk.filename,
      buffer: buf,
      mimetype: onDisk.mimetype,
      size: onDisk.size,
      width: onDisk.width,
      height: onDisk.height,
      variants,
    };
  } else {
    return null;
  }

  const saved = await persistProcessed({ processed, destRel });
  file.filename = saved.filename;
  file.mimetype = saved.mimetype;
  file.size = saved.size;
  file.storageKey = saved.storageKey;
  file.publicUrl = saved.url;
  if (saved.path) {
    file.path = saved.path;
    file.destination = path.dirname(saved.path);
  } else {
    file.path = null;
    file.buffer = processed.buffer;
  }
  return saved;
}

function variantKeysFor(objectKey) {
  const key = storage.normalizeKey(objectKey);
  if (!key) return [];
  const dir = path.posix.dirname(key);
  const stem = webpStem(key);
  const prefix = dir && dir !== '.' ? `${dir}/` : '';
  const keys = [key];
  for (const w of [...SRCSET_WIDTHS, MAX_WIDTH, MAX_HEIGHT]) {
    keys.push(`${prefix}${variantName(stem, w)}`);
  }
  return keys;
}

function unlinkImageAndVariants(filePath) {
  if (!filePath) return;
  if (storage.isEnabled() && (/^https?:\/\//i.test(filePath) || String(filePath).includes('storage/v1'))) {
    Promise.all(variantKeysFor(filePath).map((k) => storage.removeObject(k))).catch(() => {});
    return;
  }
  let target = filePath;
  if (!fs.existsSync(target)) {
    const local = path.join(diskUploadRoot(), storage.normalizeKey(filePath));
    if (!fs.existsSync(local)) return;
    target = local;
  }
  const dir = path.dirname(target);
  const stem = webpStem(target);
  const targets = [target];
  for (const w of [...SRCSET_WIDTHS, MAX_WIDTH, MAX_HEIGHT]) {
    targets.push(path.join(dir, variantName(stem, w)));
  }
  for (const p of targets) {
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* ignore */ }
  }
}

async function deleteStoredImage(urlOrKey) {
  if (!urlOrKey) return;
  if (storage.isEnabled()) {
    await Promise.all(variantKeysFor(urlOrKey).map((k) => storage.removeObject(k)));
    return;
  }
  const local = path.join(diskUploadRoot(), storage.normalizeKey(urlOrKey));
  unlinkImageAndVariants(local);
}

module.exports = {
  MAX_WIDTH,
  MAX_HEIGHT,
  SRCSET_WIDTHS,
  ALLOWED_PROCESS_MIMES,
  assertAllowedMagicBytes,
  processImageFile,
  processImageBuffer,
  processUploadedFile,
  persistProcessed,
  writeSrcsetVariants,
  unlinkImageAndVariants,
  deleteStoredImage,
  webpStem,
  variantName,
  diskUploadRoot,
};
