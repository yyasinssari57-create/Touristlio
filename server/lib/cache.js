const TTL_MS = Number(process.env.CACHE_TTL_MS) || 5 * 60 * 1000;

const store = new Map();

function normalizeCacheParts(parts) {
  if (parts == null || typeof parts !== 'object') return parts;
  const sorted = {};
  for (const key of Object.keys(parts).sort()) {
    const v = parts[key];
    sorted[key] = v != null && typeof v === 'object' && !Array.isArray(v)
      ? normalizeCacheParts(v)
      : v;
  }
  return sorted;
}

function cacheKey(prefix, parts) {
  return `${prefix}:${JSON.stringify(normalizeCacheParts(parts))}`;
}

function get(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

function set(key, value, ttlMs = TTL_MS) {
  store.set(key, { value, expires: Date.now() + ttlMs });
}

async function wrap(key, fn, ttlMs = TTL_MS) {
  const cached = get(key);
  if (cached !== null) return cached;
  const value = await fn();
  set(key, value, ttlMs);
  return value;
}

function clear(prefix) {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}

module.exports = { cacheKey, normalizeCacheParts, get, set, wrap, clear, TTL_MS };
