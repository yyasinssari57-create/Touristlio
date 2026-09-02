const storage = require('./supabase-storage');

/**
 * Turn a DB path (/uploads/..., relative key, or absolute URL) into a browser URL.
 */
function publicImageUrl(stored) {
  if (!stored) return null;
  const s = String(stored).trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  const rel = storage.normalizeKey(s);
  if (!rel) return null;
  if (storage.isEnabled()) return storage.publicObjectUrl(rel);
  return `/uploads/${rel}`;
}

function storedUploadPath(objectKey) {
  const rel = storage.normalizeKey(objectKey);
  if (!rel) return null;
  if (storage.isEnabled()) return storage.publicObjectUrl(rel);
  return `/uploads/${rel}`;
}

function isOurUploadUrl(url) {
  const s = String(url || '');
  if (!s) return false;
  if (s.startsWith('/uploads/')) return true;
  try {
    const u = new URL(s);
    return u.pathname.includes('/storage/v1/object/public/')
      || u.pathname.includes('/storage/v1/object/sign/');
  } catch {
    return false;
  }
}

module.exports = { publicImageUrl, storedUploadPath, isOurUploadUrl };
