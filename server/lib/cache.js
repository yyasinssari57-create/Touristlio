const TTL_MS = Number(process.env.CACHE_TTL_MS) || 5 * 60 * 1000;

const store = new Map();

function cacheKey(prefix, parts) {
  return `${prefix}:${JSON.stringify(parts)}`;
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

function wrap(key, fn, ttlMs = TTL_MS) {
  const cached = get(key);
  if (cached !== null) return cached;
  const value = fn();
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

module.exports = { cacheKey, get, set, wrap, clear, TTL_MS };
