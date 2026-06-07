const fs = require('fs');

const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

async function detectImageMime(filePath) {
  const { fileTypeFromBuffer } = await import('file-type');
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(4100);
    const bytesRead = fs.readSync(fd, buf, 0, 4100, 0);
    const detected = await fileTypeFromBuffer(buf.subarray(0, bytesRead));
    return detected?.mime || null;
  } finally {
    fs.closeSync(fd);
  }
}

function isAllowedImageMime(mime) {
  return mime && ALLOWED_IMAGE_MIMES.has(mime);
}

/**
 * Multer fileFilter — header check only; call validateUploadedImage after upload for magic bytes.
 */
function imageFileFilter(_req, file, cb) {
  if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
  else cb(new Error('Sadece resim dosyaları (JPG, PNG, WebP, GIF)'));
}

/**
 * Post-multer middleware: verify file content via magic bytes, delete spoofed uploads.
 */
async function validateFilePath(filePath) {
  const mime = await detectImageMime(filePath);
  return isAllowedImageMime(mime);
}

function validateUploadedImage(errorMessage = 'Geçersiz veya desteklenmeyen görsel dosyası') {
  return async (req, res, next) => {
    const files = req.files?.length
      ? req.files
      : (req.file ? [req.file] : []);
    if (!files.length) return next();
    try {
      for (const file of files) {
        const ok = await validateFilePath(file.path);
        if (!ok) {
          for (const f of files) {
            if (f.path) fs.unlink(f.path, () => {});
          }
          const err = new Error(errorMessage);
          err.status = 400;
          return next(err);
        }
      }
      return next();
    } catch (e) {
      for (const f of files) {
        if (f.path) fs.unlink(f.path, () => {});
      }
      return next(e);
    }
  };
}

module.exports = {
  ALLOWED_IMAGE_MIMES,
  detectImageMime,
  isAllowedImageMime,
  imageFileFilter,
  validateUploadedImage,
};
