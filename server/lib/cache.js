const logger = require('./logger');

const TTL_MS = Number(process.env.CACHE_TTL_MS) || 5 * 60 * 1000;
const PLACES_TTL_MS = Number(process.env.PLACES_CACHE_TTL_MS) || 30 * 1000;

const store = new Map();

let redisClient = null;
let redisTried = false;
let redisFailed = false;
let connecting = null;

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

function redisUrl() {
  return String(process.env.REDIS_URL || process.env.RATE_LIMIT_REDIS_URL || '').trim();
}

async function connectRedis() {
  if (redisClient) return redisClient;
  if (redisFailed || !redisUrl()) return null;
  if (connecting) return connecting;

  connecting = (async () => {
    redisTried = true;
    let createClient;
    try {
      ({ createClient } = require('redis'));
    } catch (err) {
      redisFailed = true;
      logger.warn({ msg: 'redis package missing, cache using memory', err: err.message });
      return null;
    }
    const client = createClient({
      url: redisUrl(),
      socket: {
        connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT_MS) || 1500,
        reconnectStrategy: false,
      },
    });
    client.on('error', (err) => {
      logger.warn({ msg: 'Redis cache client error, using memory', err: err.message });
      redisFailed = true;
    });
    try {
      await client.connect();
      redisClient = client;
      logger.info({ msg: 'Places cache connected to Redis' });
      return client;
    } catch (err) {
      redisFailed = true;
      logger.warn({ msg: 'Redis cache connect failed, using memory', err: err.message });
      try { await client.quit(); } catch { /* ignore */ }
      return null;
    } finally {
      connecting = null;
    }
  })();

  return connecting;
}

function redisKey(key) {
  return `tl:cache:${key}`;
}

async function redisGet(key) {
  const client = await connectRedis();
  if (!client) return null;
  try {
    const raw = await client.get(redisKey(key));
    if (raw == null) return null;
    const parsed = JSON.parse(raw);
    return parsed && Object.prototype.hasOwnProperty.call(parsed, 'v') ? parsed.v : parsed;
  } catch (err) {
    logger.warn({ msg: 'Redis cache GET failed', err: err.message, key });
    return null;
  }
}

async function redisSet(key, value, ttlMs) {
  const client = await connectRedis();
  if (!client) return;
  try {
    const ms = Math.max(1000, Number(ttlMs) || TTL_MS);
    await client.set(redisKey(key), JSON.stringify({ v: value }), { PX: ms });
  } catch (err) {
    logger.warn({ msg: 'Redis cache SET failed', err: err.message, key });
  }
}

async function redisClear(prefix) {
  const client = await connectRedis();
  if (!client) return;
  const match = prefix ? `${redisKey(prefix)}*` : 'tl:cache:*';
  try {
    let cursor = '0';
    do {
      const res = await client.scan(cursor, { MATCH: match, COUNT: 100 });
      cursor = String(res.cursor);
      if (res.keys && res.keys.length) await client.del(res.keys);
    } while (cursor !== '0');
  } catch (err) {
    logger.warn({ msg: 'Redis cache CLEAR failed', err: err.message, prefix });
  }
}

async function wrap(key, fn, ttlMs = TTL_MS) {
  const cached = get(key);
  if (cached !== null) return cached;
  const fromRedis = await redisGet(key);
  if (fromRedis !== null) {
    set(key, fromRedis, ttlMs);
    return fromRedis;
  }
  const value = await fn();
  set(key, value, ttlMs);
  redisSet(key, value, ttlMs).catch(() => {});
  return value;
}

function clear(prefix) {
  if (!prefix) {
    store.clear();
  } else {
    for (const k of store.keys()) {
      if (k.startsWith(prefix)) store.delete(k);
    }
  }
  redisClear(prefix).catch(() => {});
}

function backendName() {
  if (redisClient && !redisFailed) return 'redis';
  if (redisUrl() && redisTried && redisFailed) return 'memory-fallback';
  return 'memory';
}

async function closeRedis() {
  if (!redisClient) return;
  try { await redisClient.quit(); } catch { /* ignore */ }
  redisClient = null;
  redisTried = false;
  redisFailed = false;
}

module.exports = {
  cacheKey,
  normalizeCacheParts,
  get,
  set,
  wrap,
  clear,
  TTL_MS,
  PLACES_TTL_MS,
  backendName,
  closeRedis,
  redisUrl,
};
