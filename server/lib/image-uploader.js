const multer = require('multer');
const { imageFileFilter } = require('./image-mime');

/** Memory storage — files are processed then sent to Supabase or written to disk. */
function imageUploader(opts = {}) {
  return multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: opts.fileSize || 5 * 1024 * 1024,
      files: opts.files || 1,
    },
    fileFilter: imageFileFilter,
  });
}

module.exports = { imageUploader };
