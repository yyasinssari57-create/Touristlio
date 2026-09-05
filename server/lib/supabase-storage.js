/**
 * Supabase Storage for uploaded images (Render disk is ephemeral).
 * Uses Storage REST + service key. Never expose SUPABASE_SERVICE_KEY to the browser.
 */
const logger = require('./logger');

const BUCKET = String(process.env.SUPABASE_STORAGE_BUCKET || 'uploads').trim() || 'uploads';

function supabaseUrl() {
  return String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
}

function serviceKey() {
  return String(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '')
    .trim()
    .replace(/^\[/, '')
    .replace(/\]$/, '');
}

function isEnabled() {
  const url = supabaseUrl();
  const key = serviceKey();
  return Boolean(url && key && !/YOUR_|PLACEHOLDER|şifre/i.test(key));
}

function publicObjectUrl(objectPath) {
  const rel = normalizeKey(objectPath);
  if (!rel) return null;
  return `${supabaseUrl()}/storage/v1/object/public/${BUCKET}/${rel.split('/').map(encodeURIComponent).join('/')}`;
}

function normalizeKey(stored) {
  if (!stored) return '';
  let s = String(stored).trim();
  if (!s) return '';
  try {
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s);
      const marker = `/storage/v1/object/public/${BUCKET}/`;
      const idx = u.pathname.indexOf(marker);
      if (idx >= 0) return decodeURIComponent(u.pathname.slice(idx + marker.length).replace(/^\/+/, ''));
      const sign = `/storage/v1/object/sign/${BUCKET}/`;
      const sidx = u.pathname.indexOf(sign);
      if (sidx >= 0) return decodeURIComponent(u.pathname.slice(sidx + sign.length).replace(/^\/+/, ''));
    }
  } catch { /* ignore */ }
  s = s.replace(/^\/uploads\//, '').replace(/^uploads\//, '').replace(/^\/+/, '');
  if (s.includes('..') || s.startsWith('/') || s.includes('\\')) return '';
  return s;
}

/** Short-lived signed URL for a storage object. Used if a backup ever lives in the existing bucket. */
async function createSignedUrl(objectPath, expiresIn = 120) {
  const key = normalizeKey(objectPath);
  if (!key) return null;
  const encoded = key.split('/').map(encodeURIComponent).join('/');
  const parsed = await storageFetch(`/object/sign/${BUCKET}/${encoded}`, {
    method: 'POST',
    json: { expiresIn: Math.max(30, Math.min(Number(expiresIn) || 120, 300)) },
  });
  const signed = parsed && (parsed.signedURL || parsed.signedUrl);
  if (!signed) return null;
  if (/^https?:\/\//i.test(signed)) return signed;
  return `${supabaseUrl()}/storage/v1${signed.startsWith('/') ? signed : `/${signed}`}`;
}

async function storageFetch(pathname, { method = 'GET', body, contentType, json } = {}) {
  if (!isEnabled()) {
    const err = new Error('Supabase Storage tanımlı değil (SUPABASE_URL / SUPABASE_SERVICE_KEY)');
    err.status = 500;
    throw err;
  }
  const headers = {
    Authorization: `Bearer ${serviceKey()}`,
    apikey: serviceKey(),
  };
  let payload = body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(json);
  } else if (contentType) {
    headers['Content-Type'] = contentType;
  }
  const res = await fetch(`${supabaseUrl()}/storage/v1${pathname}`, {
    method,
    headers,
    body: payload,
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  if (!res.ok) {
    const msg = (parsed && (parsed.message || parsed.error || parsed.msg)) || text || res.statusText;
    const err = new Error(`Supabase Storage ${res.status}: ${msg}`);
    err.status = res.status >= 400 && res.status < 500 ? res.status : 502;
    err.body = parsed;
    throw err;
  }
  return parsed;
}

let bucketReady = false;

async function ensureBucket() {
  if (!isEnabled()) return false;
  if (bucketReady) return true;
  try {
    await storageFetch('/bucket', {
      method: 'POST',
      json: {
        id: BUCKET,
        name: BUCKET,
        public: true,
        fileSizeLimit: 6 * 1024 * 1024,
        allowedMimeTypes: ['image/webp', 'image/jpeg', 'image/png', 'image/gif'],
      },
    });
  } catch (err) {
    const already = err.status === 409
      || /already exists|duplicate|resource already/i.test(String(err.message || ''));
    if (!already) {
      try {
        await storageFetch(`/bucket/${BUCKET}`, { method: 'GET' });
      } catch (inner) {
        logger.error({ msg: 'Supabase Storage bucket missing', err: inner.message });
        throw inner;
      }
    }
  }
  try {
    await storageFetch(`/bucket/${BUCKET}`, {
      method: 'PUT',
      json: {
        public: true,
        fileSizeLimit: 6 * 1024 * 1024,
        allowedMimeTypes: ['image/webp', 'image/jpeg', 'image/png', 'image/gif'],
      },
    });
  } catch (err) {
    logger.warn({ msg: 'Could not update Storage bucket settings', err: err.message });
  }
  bucketReady = true;
  logger.info({ msg: 'Supabase Storage ready', bucket: BUCKET });
  return true;
}

async function uploadObject(objectPath, buffer, contentType = 'image/webp') {
  await ensureBucket();
  const key = normalizeKey(objectPath);
  if (!key) throw new Error('Boş Storage yolu');
  const encoded = key.split('/').map(encodeURIComponent).join('/');
  await storageFetch(`/object/${BUCKET}/${encoded}`, {
    method: 'POST',
    body: buffer,
    contentType,
  });
  return publicObjectUrl(key);
}

async function uploadObjectUpsert(objectPath, buffer, contentType = 'image/webp') {
  await ensureBucket();
  const key = normalizeKey(objectPath);
  const encoded = key.split('/').map(encodeURIComponent).join('/');
  try {
    await storageFetch(`/object/${BUCKET}/${encoded}`, {
      method: 'POST',
      body: buffer,
      contentType,
    });
  } catch (err) {
    if (err.status !== 409 && !/already exists|Duplicate/i.test(String(err.message || ''))) throw err;
    await storageFetch(`/object/${BUCKET}/${encoded}`, {
      method: 'PUT',
      body: buffer,
      contentType,
    });
  }
  return publicObjectUrl(key);
}

async function removeObject(objectPath) {
  if (!isEnabled()) return false;
  const key = normalizeKey(objectPath);
  if (!key) return false;
  try {
    await storageFetch(`/object/${BUCKET}`, {
      method: 'DELETE',
      json: { prefixes: [key] },
    });
    return true;
  } catch (err) {
    logger.warn({ msg: 'Storage delete failed', key, err: err.message });
    return false;
  }
}

async function listObjects(prefix = '', limit = 1000) {
  await ensureBucket();
  const parsed = await storageFetch(`/object/list/${BUCKET}`, {
    method: 'POST',
    json: {
      prefix: prefix.replace(/^\/+/, ''),
      limit,
      offset: 0,
      sortBy: { column: 'updated_at', order: 'desc' },
    },
  });
  return Array.isArray(parsed) ? parsed : [];
}

async function listAllObjects(prefix = '', limit = 2000) {
  const out = [];
  async function walk(p) {
    if (out.length >= limit) return;
    const batch = await listObjects(p, 1000);
    for (const obj of batch) {
      if (out.length >= limit) return;
      const child = p ? `${p.replace(/\/+$/, '')}/${obj.name}` : obj.name;
      const isFolder = obj.id == null || obj.metadata == null;
      if (isFolder && !/\.[a-z0-9]+$/i.test(obj.name)) {
        await walk(child);
      } else {
        out.push({ ...obj, name: child });
      }
    }
  }
  await walk(prefix);
  return out;
}

module.exports = {
  BUCKET,
  isEnabled,
  supabaseUrl,
  publicObjectUrl,
  normalizeKey,
  ensureBucket,
  uploadObject,
  uploadObjectUpsert,
  createSignedUrl,
  removeObject,
  listObjects,
  listAllObjects,
};
