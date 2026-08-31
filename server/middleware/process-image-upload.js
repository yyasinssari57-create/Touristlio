const fs = require('fs');
const { processUploadedFile } = require('../lib/image-process');

/**
 * Post-multer / post-magic-byte: EXIF strip, 1080p, WebP, srcset variants.
 */
function processImageUpload(opts = {}) {
  return async (req, res, next) => {
    const files = req.files?.length ? req.files : (req.file ? [req.file] : []);
    if (!files.length) return next();
    try {
      for (const file of files) {
        await processUploadedFile(file, opts);
      }
      return next();
    } catch (err) {
      for (const f of files) {
        if (f.path) {
          try { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); } catch { /* ignore */ }
        }
      }
      err.status = err.status || 400;
      return next(err);
    }
  };
}

module.exports = { processImageUpload };
