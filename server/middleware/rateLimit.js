const rateLimit = require('express-rate-limit');

const isDev = process.env.NODE_ENV !== 'production';

function requestPath(req) {
  return req.originalUrl?.split('?')[0] || req.path || '';
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

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX) || 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: async (req) => isReportRequest(req) || isAdminAnalyticsRead(req),
  message: { error: 'Çok fazla istek. Lütfen bir süre sonra tekrar deneyin.' },
});

const adminAnalyticsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.ADMIN_ANALYTICS_RATE_LIMIT_MAX) || 600,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: async (req) => (req.user?.id ? `analytics:user:${req.user.id}` : `analytics:ip:${req.ip}`),
  message: { error: 'Analitik istek limiti aşıldı. Lütfen kısa süre sonra tekrar deneyin.' },
});

const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.REPORT_RATE_LIMIT_MAX) || (isDev ? 30 : 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: async (req) => (req.user?.id ? `report:user:${req.user.id}` : `report:ip:${req.ip}`),
  message: { error: 'Çok fazla şikayet gönderdiniz. Lütfen bir süre sonra tekrar deneyin.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Çok fazla giriş denemesi. 15 dakika sonra tekrar deneyin.' },
});

const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.SEARCH_RATE_LIMIT_MAX) || 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Arama limiti aşıldı. Bir dakika bekleyin.' },
});

const adminToolLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.ADMIN_TOOL_RATE_LIMIT_MAX) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Admin araç limiti aşıldı. Lütfen bekleyin.' },
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.ADMIN_RATE_LIMIT_MAX) || 150,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: async (req) => (req.user?.id ? `admin:user:${req.user.id}` : `admin:ip:${req.ip}`),
  message: { error: 'Admin istek limiti aşıldı. Lütfen kısa süre sonra tekrar deneyin.' },
});

const liveDataLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.LIVE_DATA_RATE_LIMIT_MAX) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Çok fazla istek. Bir dakika bekleyin.' },
});

/** Public form posts: same IP, 3 submissions / 5 minutes (contact, register, forgot-password). */
const formLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: Number(process.env.FORM_RATE_LIMIT_MAX) || 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: async (req) => `form:ip:${req.ip}`,
  message: { error: 'Çok fazla gönderim. 5 dakika sonra tekrar deneyin.' },
});

const contactLimiter = formLimiter;

/** Tiola create (not likes): same 3 / 5 min cap, own bucket so register/contact do not starve comments. */
const tiolaFormLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: Number(process.env.FORM_RATE_LIMIT_MAX) || 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: async (req) => `form:tiola:ip:${req.ip}`,
  message: { error: 'Çok fazla gönderim. 5 dakika sonra tekrar deneyin.' },
});

module.exports = {
  apiLimiter,
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
