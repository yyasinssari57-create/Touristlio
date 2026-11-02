const rateLimit = require('express-rate-limit');

const isDev = process.env.NODE_ENV !== 'production';

/**
 * These limiters use express-rate-limit's in-memory store.
 * REDIS_URL only backs the Tiola vote counter (server/lib/rate-limit-store.js).
 * Without Redis, every bucket resets on process restart / Render deploy and is
 * not shared across instances. Buckets are still separate from each other.
 */
function envMax(names, fallback) {
  for (const name of names) {
    const raw = process.env[name];
    if (raw == null || String(raw).trim() === '') continue;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 1) return Math.floor(n);
  }
  return fallback;
}

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
 * Staff routes, counted by IP before auth runs.
 * Stops an unauthenticated flood without charging the public browse bucket.
 */
const adminIpLimiter = createLimiter({
  windowMs: WINDOW_15,
  max: envMax(['ADMIN_RATE_LIMIT_MAX'], 400),
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

/** Authenticated /api/admin only (mounted after auth). Keyed by user id. */
const adminLimiter = createLimiter({
  windowMs: WINDOW_15,
  max: envMax(['ADMIN_RATE_LIMIT_MAX'], 400),
  keyGenerator: async (req) => (req.user?.id ? `admin:user:${req.user.id}` : `admin:ip:${req.ip}`),
  message: 'Admin istek limiti aşıldı.',
});

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
  if (isStaffApi(req)) return adminIpLimiter(req, res, next);
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
  authLimiter,
  searchLimiter,
  adminToolLimiter,
  adminLimiter,
  liveDataLimiter,
  reportLimiter,
  adminAnalyticsLimiter,
  contactLimiter,
  formLimiter,
  tiolaFormLimiter,
};
