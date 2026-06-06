const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX) || 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Çok fazla istek. Lütfen bir süre sonra tekrar deneyin.' },
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

const liveDataLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.LIVE_DATA_RATE_LIMIT_MAX) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Çok fazla istek. Bir dakika bekleyin.' },
});

module.exports = { apiLimiter, authLimiter, searchLimiter, adminToolLimiter, liveDataLimiter };
