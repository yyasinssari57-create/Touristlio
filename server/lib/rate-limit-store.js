/**
 * Redis-backed counter with in-memory fallback (ORTA-4).
 * Used for Tiola vote rate limits: INCR + expire window.
 * REDIS_URL unset or Redis down → process memory (per instance).
 */
const logger = require('./logger');

const memory = new Map();
let redisClient = null;
let redisTried = false;
let redisFailed = false;
let connecting = null;

function memoryIncrement(key, windowMs) {
  const now = Date.now();
  const row = memory.get(key);
  if (!row || row.resetAt <= now) {
    const next = { count: 1, resetAt: now + windowMs };
    memory.set(key, next);
    return { count: 1, ttlMs: windowMs, backend: 'memory' };
  }
  row.count += 1;
  return { count: row.count, ttlMs: Math.max(0, row.resetAt - now), backend: 'memory' };
}

function pruneMemory(now = Date.now()) {
  for (const [key, row] of memory) {
    if (row.resetAt <= now) memory.delete(key);
  }
}

if (typeof setInterval === 'function') {
  const t = setInterval(() => pruneMemory(), 60 * 1000);
  if (t && typeof t.unref === 'function') t.unref();
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
      logger.warn({ msg: 'redis package missing, Tiola limiter using memory', err: err.message });
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
      logger.warn({ msg: 'Redis client error, falling back to memory', err: err.message });
      redisFailed = true;
    });
    try {
      await client.connect();
      redisClient = client;
      logger.info({ msg: 'Tiola vote limiter connected to Redis' });
      return client;
    } catch (err) {
      redisFailed = true;
      logger.warn({ msg: 'Redis connect failed, Tiola limiter using memory', err: err.message });
      try { await client.quit(); } catch { /* ignore */ }
      return null;
    } finally {
      connecting = null;
    }
  })();

  return connecting;
}

async function redisIncrement(key, windowMs) {
  const client = await connectRedis();
  if (!client) return memoryIncrement(key, windowMs);

  try {
    const count = await client.incr(key);
    if (count === 1) {
      await client.pExpire(key, windowMs);
    }
    let ttlMs = await client.pTTL(key);
    if (ttlMs < 0) {
      await client.pExpire(key, windowMs);
      ttlMs = windowMs;
    }
    return { count, ttlMs, backend: 'redis' };
  } catch (err) {
    logger.warn({ msg: 'Redis INCR failed, using memory', err: err.message, key });
    return memoryIncrement(key, windowMs);
  }
}

/**
 * Increment a windowed counter.
 * @param {string} key
 * @param {number} windowMs
 * @returns {Promise<{count:number,ttlMs:number,backend:string}>}
 */
async function increment(key, windowMs) {
  const ms = Math.max(1000, Number(windowMs) || 60 * 1000);
  if (redisUrl() && !redisFailed) {
    return redisIncrement(key, ms);
  }
  return memoryIncrement(key, ms);
}

function backendName() {
  if (redisClient && !redisFailed) return 'redis';
  if (redisUrl() && redisTried && redisFailed) return 'memory-fallback';
  return 'memory';
}

function resetMemory() {
  memory.clear();
}

async function closeRedis() {
  if (!redisClient) return;
  try { await redisClient.quit(); } catch { /* ignore */ }
  redisClient = null;
  redisTried = false;
  redisFailed = false;
}

module.exports = {
  increment,
  memoryIncrement,
  backendName,
  resetMemory,
  closeRedis,
  redisUrl,
};
