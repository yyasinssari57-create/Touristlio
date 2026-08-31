const fs = require('fs');
const path = require('path');
const { SRCSET_WIDTHS, webpStem } = require('../lib/image-process');
const sharp = require('sharp');

const ALLOWED_WIDTHS = new Set([...SRCSET_WIDTHS, 1080, 1920]);

/**
 * If a srcset sibling (foo-480w.webp) is missing, generate it from foo.webp/jpg/png.
 * Prevents 404s for older uploads when the client emits srcset.
 */
function uploadsSrcsetFallback(uploadRoot) {
  const rootResolved = path.resolve(uploadRoot);
  return async (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const rel = decodeURIComponent((req.path || '').replace(/^\/+/, ''));
    const m = rel.match(/^(.+)-(\d+)w\.webp$/i);
    if (!m) return next();
    const width = Number(m[2]);
    if (!ALLOWED_WIDTHS.has(width)) return next();

    const requested = path.resolve(path.join(uploadRoot, rel));
    if (!requested.startsWith(rootResolved + path.sep) && requested !== rootResolved) {
      return next();
    }
    if (fs.existsSync(requested)) return next();

    const dir = path.dirname(requested);
    const stem = webpStem(requested).replace(new RegExp(`-${width}w$`), '');
    const candidates = ['.webp', '.jpg', '.jpeg', '.png'].map((ext) => path.join(dir, stem + ext));
    const source = candidates.find((p) => fs.existsSync(p));
    if (!source) return next();

    try {
      await sharp(source, { failOn: 'none' })
        .rotate()
        .resize(width, null, { withoutEnlargement: true })
        .webp({ quality: 82, effort: 4 })
        .toFile(requested);
      return next();
    } catch {
      return next();
    }
  };
}

module.exports = { uploadsSrcsetFallback, variantName };
