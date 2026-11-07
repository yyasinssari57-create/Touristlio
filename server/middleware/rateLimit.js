const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../auth');

const isDev = process.env.NODE_ENV !== 'production';

/** Same set as server/middleware/rbac.js PANEL_ROLES. A normal member token stays on the strict IP bucket. */
const PANEL_ROLES = new Set(['admin', 'moderator', 'editor', 'staff']);

/**
 * Authenticated panel use (lists, stats, settings, images, retries) used to
 * share one 150-then-400 counter with anonymous /api/admin hits. Render env
 * ADMIN_RATE_LIMIT_MAX=150 or 400 overrode the code default and kept that
 * block. Values below the floor are ignored. Set the dedicated vars to
 * choose a cap, including a lower one.
 */
const ADMIN_IP_DEFAULT = 1200;
const ADMIN_USER_DEFAULT = 4000;
const ADMIN_READ_DEFAULT = 5000;
const ADMIN_IP_FLOOR = 1200;
const ADMIN_USER_FLOOR = 2000;

/**
 * These limiters use express-rate-limit's in-memory store.
 * REDIS_URL only backs the Tiola vote counter (server/lib/rate-limit-store.js).
 * Without Redis, every bucket resets on process restart / Render deploy and is
 * not shared across instances. Buckets are still separate from each other.
 */
function readEnvInt(env, name) {
  const raw = env[name];
  if (raw == null || String(raw).trim() === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.floor(n);
}

function envMax(names, fallback) {
  for (const name of names) {
    const n = readEnvInt(process.env, name);
    if (n != null) return n;
  }
  return fallback;
}

function bucketMax(env, { names, legacy, floor, fallback }) {
  for (const name of names) {
    const n = readEnvInt(env, name);
    if (n != null) return n;
  }
  for (const name of legacy || []) {
    const n = readEnvInt(env, name);
    if (n == null) continue;
    if (n < floor) continue;
    return n;
  }
  return fallback;
}

function resolveAdminRateLimits(env = process.env) {
  return {
    ip: bucketMax(env, {
      names: ['ADMIN_IP_RATE_LIMIT_MAX'],
      legacy: ['ADMIN_RATE_LIMIT_MAX'],
      floor: ADMIN_IP_FLOOR,
      fallback: ADMIN_IP_DEFAULT,
    }),
    user: bucketMax(env, {
      names: ['ADMIN_USER_RATE_LIMIT_MAX'],
      legacy: ['ADMIN_RATE_LIMIT_MAX'],
      floor: ADMIN_USER_FLOOR,
      fallback: ADMIN_USER_DEFAULT,
    }),
    read: bucketMax(env, {
      names: ['ADMIN_READ_RATE_LIMIT_MAX'],
      legacy: ['ADMIN_RATE_LIMIT_MAX'],
      floor: ADMIN_USER_FLOOR,
      fallback: ADMIN_READ_DEFAULT,
    }),
  };
}

function warnStaleAdminRateLimit(env) {
  const legacy = readEnvInt(env, 'ADMIN_RATE_LIMIT_MAX');
  if (legacy == null || legacy >= ADMIN_USER_FLOOR) return;
  console.warn(
    `[rate-limit] ADMIN_RATE_LIMIT_MAX=${legacy} is below ${ADMIN_USER_FLOOR} and is ignored for the admin panel. `
    + 'Delete it in Render Environment (old 150 and 400 values blocked normal admin use). '
    + `Defaults unless overridden: unauthenticated IP ${ADMIN_IP_DEFAULT}, `
    + `authenticated writes ${ADMIN_USER_DEFAULT}, authenticated reads ${ADMIN_READ_DEFAULT} per 15 min. `
    + 'Dedicated vars: ADMIN_IP_RATE_LIMIT_MAX, ADMIN_USER_RATE_LIMIT_MAX, ADMIN_READ_RATE_LIMIT_MAX.',
  );
}

const adminCaps = resolveAdminRateLimits(process.env);
warnStaleAdminRateLimit(process.env);

function requestPath(req) {
  return req.originalUrl?.split('?')[0] || req.path || '';
}

function startsWithPath(path, prefix) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function isReportRequest(req) {
  const path = requestPath(req);
  return req.method === 'POST' && (path === '/api/reports' || path.endsWith('/reports'));
}

/** Admin dashboard polls multiple analytics GETs every 30s; routes are auth+RBAC protected. */
function isAdminAnalyticsRead(req) {
  if (req.method !== 'GET') return false;
  return requestPath(req).startsWith('/api/analytics/');
}

function isAnalyticsTrack(req) {
  if (req.method !== 'POST') return false;
  const path = requestPath(req);
  return path === '/api/analytics/track' || path.endsWith('/analytics/track');
}

/** Staff APIs. They must not share the public browse/write counter. */
function isStaffApi(req) {
  const path = requestPath(req);
  if (startsWithPath(path, '/api/admin')) return true;
  if (startsWithPath(path, '/api/users')) return true;
  if (startsWithPath(path, '/api/moderation')) return true;
  if (startsWithPath(path, '/api/settings') && path !== '/api/settings/public') return true;
  return false;
}

function requestToken(req) {
  const header = req.headers && req.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    if (token) return token;
  }
  const cookie = req.cookies && req.cookies.tl_token;
  if (typeof cookie === 'string' && cookie.trim()) return cookie.trim();
  return '';
}

/** Verified panel JWT, or null. Does not hit the database. Invalid tokens stay on the IP bucket. */
function panelClaims(req) {
  if (Object.prototype.hasOwnProperty.call(req, '_tlPanelClaims')) return req._tlPanelClaims;
  const token = requestToken(req);
  let claims = null;
  if (token) {
    try {
      const payload = jwt.verify(token, getJwtSecret());
      if (payload && payload.id != null && PANEL_ROLES.has(payload.role)) {
        claims = { id: payload.id, role: payload.role };
      }
    } catch {
      claims = null;
    }
  }
  req._tlPanelClaims = claims;
  return claims;
}

function isAdminRead(req) {
  return req.method === 'GET' || req.method === 'HEAD';
}

async function adminActorKey(req, prefix) {
  if (req.user?.id != null) return `${prefix}:user:${req.user.id}`;
  const claims = panelClaims(req);
  if (claims?.id != null) return `${prefix}:user:${claims.id}`;
  return `${prefix}:ip:${req.ip}`;
}

function limitMessage(base) {
  return (req) => {
    const reset = req.rateLimit && req.rateLimit.resetTime;
    let seconds = 60;
    if (reset instanceof Date) {
      seconds = Math.max(1, Math.ceil((reset.getTime() - Date.now()) / 1000));
    }
    const minutes = Math.max(1, Math.ceil(seconds / 60));
    const wait = minutes === 1
      ? 'Yaklaşık 1 dakika sonra tekrar deneyin.'
      : `Yaklaşık ${minutes} dakika sonra tekrar deneyin.`;
    return { error: `${base} ${wait}`, retryAfterSeconds: seconds };
  };
}

function createLimiter({
  windowMs,
  max,
  message,
  keyGenerator,
}) {
  const options = {
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: limitMessage(message),
  };
  if (keyGenerator) options.keyGenerator = keyGenerator;
  return rateLimit(options);
}

const WINDOW_15 = 15 * 60 * 1000;

/**
 * Public reads (lists, place pages, config). Own bucket so login, contact,
 * admin saves, and analytics heartbeats do not fill it.
 * RATE_LIMIT_MAX still overrides this cap when set (older Render env).
 */
const browseLimiter = createLimiter({
  windowMs: WINDOW_15,
  max: envMax(['BROWSE_RATE_LIMIT_MAX', 'RATE_LIMIT_MAX'], 600),
  message: 'Çok fazla istek.',
});

/** Public writes that are not login, contact, or staff APIs (saves, comments, etc.). */
const writeLimiter = createLimiter({
  windowMs: WINDOW_15,
  max: envMax(['WRITE_RATE_LIMIT_MAX'], 120),
  message: 'Çok fazla kayıt isteği.',
});

/** Cookie-consent heartbeats and web-vitals. One open tab is ~30 posts / 15 min. */
const trackLimiter = createLimiter({
  windowMs: WINDOW_15,
  max: envMax(['TRACK_RATE_LIMIT_MAX'], 180),
  message: 'Çok fazla izleme isteği.',
});

/**
 * Unauthenticated staff routes, counted by IP.
 * A logged-in panel session does not use this bucket.
 */
const adminIpLimiter = createLimiter({
  windowMs: WINDOW_15,
  max: adminCaps.ip,
  message: 'Admin istek limiti aşıldı.',
});

const adminAnalyticsLimiter = createLimiter({
  windowMs: WINDOW_15,
  max: envMax(['ADMIN_ANALYTICS_RATE_LIMIT_MAX'], 600),
  keyGenerator: async (req) => (req.user?.id ? `analytics:user:${req.user.id}` : `analytics:ip:${req.ip}`),
  message: 'Analitik istek limiti aşıldı.',
});

const reportLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: envMax(['REPORT_RATE_LIMIT_MAX'], isDev ? 30 : 10),
  keyGenerator: async (req) => (req.user?.id ? `report:user:${req.user.id}` : `report:ip:${req.ip}`),
  message: 'Çok fazla şikayet gönderdiniz.',
});

const authLimiter = createLimiter({
  windowMs: WINDOW_15,
  max: envMax(['AUTH_RATE_LIMIT_MAX'], 20),
  message: 'Çok fazla giriş denemesi.',
});

const searchLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: envMax(['SEARCH_RATE_LIMIT_MAX'], 60),
  message: 'Arama limiti aşıldı.',
});

const adminToolLimiter = createLimiter({
  windowMs: WINDOW_15,
  max: envMax(['ADMIN_TOOL_RATE_LIMIT_MAX'], 30),
  message: 'Admin araç limiti aşıldı.',
});

/** Authenticated panel writes. Keyed by user id. Cheap GET/HEAD does not land here. */
const adminWriteLimiter = createLimiter({
  windowMs: WINDOW_15,
  max: adminCaps.user,
  keyGenerator: async (req) => adminActorKey(req, 'admin'),
  message: 'Admin istek limiti aşıldı.',
});

/** Authenticated panel reads (lists, stats, settings, images). Own bucket so refreshes do not eat the write cap. */
const adminReadLimiter = createLimiter({
  windowMs: WINDOW_15,
  max: adminCaps.read,
  keyGenerator: async (req) => adminActorKey(req, 'adminread'),
  message: 'Admin istek limiti aşıldı.',
});

/**
 * Staff gate. Anonymous hits use the stricter IP bucket. A verified panel
 * JWT uses the read or write bucket. Mounted on /api/ (before auth) and
 * again after auth on /api/admin; the flag avoids counting one request twice
 * (express-rate-limit throws ERR_ERL_DOUBLE_COUNT).
 */
function adminSessionLimiter(req, res, next) {
  if (req.adminRateLimited) return next();
  const claims = panelClaims(req);
  const limiter = claims
    ? (isAdminRead(req) ? adminReadLimiter : adminWriteLimiter)
    : adminIpLimiter;
  return limiter(req, res, (err) => {
    if (err) return next(err);
    req.adminRateLimited = true;
    return next();
  });
}

const adminLimiter = adminSessionLimiter;

const liveDataLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: envMax(['LIVE_DATA_RATE_LIMIT_MAX'], 30),
  message: 'Çok fazla istek.',
});

/** Public form posts: same IP, 3 submissions / 5 minutes (contact, register, forgot-password). */
const formLimiter = createLimiter({
  windowMs: 5 * 60 * 1000,
  max: envMax(['FORM_RATE_LIMIT_MAX'], 3),
  keyGenerator: async (req) => `form:ip:${req.ip}`,
  message: 'Çok fazla gönderim.',
});

const contactLimiter = formLimiter;

/** Tiola create (not likes): same 3 / 5 min cap, own bucket so register/contact do not starve comments. */
const tiolaFormLimiter = createLimiter({
  windowMs: 5 * 60 * 1000,
  max: envMax(['FORM_RATE_LIMIT_MAX'], 3),
  keyGenerator: async (req) => `form:tiola:ip:${req.ip}`,
  message: 'Çok fazla gönderim.',
});

/**
 * Catch-all mounted at /api/. Splits buckets instead of one shared IP counter.
 * Login and contact are not counted here; they keep authLimiter and formLimiter.
 */
function apiLimiter(req, res, next) {
  if (isReportRequest(req) || isAdminAnalyticsRead(req)) return next();
  const path = requestPath(req);
  if (startsWithPath(path, '/api/auth')) return next();
  if (startsWithPath(path, '/api/contact')) return next();
  if (isAnalyticsTrack(req)) return trackLimiter(req, res, next);
  if (isStaffApi(req)) return adminSessionLimiter(req, res, next);
  if (req.method === 'GET' || req.method === 'HEAD') return browseLimiter(req, res, next);
  if (req.method === 'OPTIONS') return next();
  return writeLimiter(req, res, next);
}

module.exports = {
  apiLimiter,
  browseLimiter,
  writeLimiter,
  trackLimiter,
  adminIpLimiter,
  adminReadLimiter,
  adminSessionLimiter,
  authLimiter,
  searchLimiter,
  adminToolLimiter,
  adminLimiter,
  resolveAdminRateLimits,
  liveDataLimiter,
  reportLimiter,
  adminAnalyticsLimiter,
  contactLimiter,
  formLimiter,
  tiolaFormLimiter,
};
