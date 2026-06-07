require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const logger = require('./lib/logger');
const { validateJwtSecret } = require('./auth');
const { validateProductionEnv } = require('./lib/production-env');
const { apiLimiter } = require('./middleware/rateLimit');
const { clear: clearCache } = require('./lib/cache');
const { authRequired, requireRole } = require('./middleware/auth');
const { csrfProtection } = require('./middleware/csrf');
const { uploadsStaticHeaders } = require('./middleware/uploads-static');

validateJwtSecret();
validateProductionEnv();

const authRoutes = require('./modules/auth/auth.routes');
const placesRoutes = require('./routes/places');
const tiolasRoutes = require('./routes/tiolas');
const blogsRoutes = require('./routes/blogs');
const adminRoutes = require('./routes/admin');
const osmRoutes = require('./routes/osm');
const travelListsRoutes = require('./routes/travel-lists');
const tripPlansRoutes = require('./routes/trip-plans');
const liveDataRoutes = require('./routes/live-data');
const searchRoutes = require('./routes/search');
const settingsRoutes = require('./modules/settings/settings.routes');
const usersRoutes = require('./modules/users/users.routes');
const moderationRoutes = require('./modules/moderation/moderation.routes');
const analyticsRoutes = require('./modules/analytics/analytics.routes');
const notificationsRoutes = require('./routes/notifications');
const { router: reportsRoutes } = require('./routes/reports');
const profilesRoutes = require('./routes/profiles');

const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';
const app = express();

if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(helmet({
  contentSecurityPolicy: isProd ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'self'"],
    },
  } : false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({
  origin(origin, cb) {
    if (!origin || corsOrigins.includes(origin) || corsOrigins.includes('*')) {
      cb(null, true);
    } else {
      cb(new Error('CORS blocked'));
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use('/api/', apiLimiter);

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info({ method: req.method, url: req.url, status: res.statusCode, ms: Date.now() - start });
  });
  next();
});

app.use('/uploads', uploadsStaticHeaders, express.static(path.join(__dirname, '..', 'uploads')));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/auth', csrfProtection, authRoutes);
app.use('/api/places', placesRoutes);
app.use('/api/tiolas', csrfProtection, tiolasRoutes);
app.use('/api/blogs', csrfProtection, blogsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/osm', osmRoutes);
app.use('/api/travel-lists', travelListsRoutes);
app.use('/api/trip-plans', tripPlansRoutes);
app.use('/api/live-data', liveDataRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/moderation', moderationRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/profiles', csrfProtection, profilesRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'Touristlio', version: '2.0.0', ts: new Date().toISOString() });
});

app.get('/api/config/public', (_req, res) => {
  const settingsService = require('./modules/settings/settings.service');
  res.json({
    affiliateEnabled: process.env.AFFILIATE_ENABLED === 'true',
    siteUrl: process.env.SITE_URL || 'http://localhost:3000',
    ...settingsService.getPublic(),
  });
});

/** Dev-only: write processed navbar logo PNG from base64 payload (agent). */
if (!isProd) {
  app.post('/api/dev/write-logo-transparent', express.json({ limit: '5mb' }), (req, res) => {
    const b64 = req.body?.b64;
    if (!b64 || typeof b64 !== 'string') {
      return res.status(400).json({ error: 'missing b64' });
    }
    const out = path.join(__dirname, '..', 'public', 'images', 'logo-transparent.png');
    const buf = Buffer.from(b64, 'base64');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, buf);
    res.json({ ok: true, size: buf.length, path: 'public/images/logo-transparent.png' });
  });
} else {
  app.post('/api/dev/write-logo-transparent', authRequired, requireRole('admin'), (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
}

app.get('/sitemap.xml', (_req, res, next) => {
  const sitemapPath = path.join(__dirname, '..', 'public', 'sitemap.xml');
  if (fs.existsSync(sitemapPath)) return res.sendFile(sitemapPath);
  next();
});

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

app.get('/login', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

app.get('/register', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'register.html'));
});

app.get('/profile', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'profile.html'));
});

app.get('/verify-email', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'verify-email.html'));
});

app.get('/reset-password', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'reset-password.html'));
});

app.get('/search', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'search.html'));
});

app.get('/gezilecek-yerler', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  if (req.path.match(/\.(html|xml|txt|css|js|png|jpg|svg|webp|ico)$/)) {
    return res.status(404).sendFile(path.join(__dirname, '..', 'public', '404.html'));
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use((err, req, res, _next) => {
  logger.error({ err: err.message, stack: err.stack });
  if (res.headersSent) return;
  if (req.path.startsWith('/api/')) {
    const message = isProd ? 'Sunucu hatası' : (err.message || 'Sunucu hatası');
    return res.status(500).json({ error: message });
  }
  res.status(500).sendFile(path.join(__dirname, '..', 'public', '500.html'));
});

function spawnSitemapIfStale() {
  if (process.env.SITEMAP_ON_START === 'false') return;
  const script = path.join(__dirname, 'scripts', 'generate-sitemap.js');
  const out = path.join(__dirname, '..', 'public', 'sitemap.xml');
  const staleMs = 24 * 60 * 60 * 1000;
  try {
    const stat = fs.existsSync(out) ? fs.statSync(out) : null;
    if (stat && Date.now() - stat.mtimeMs < staleMs) return;
  } catch { /* regenerate */ }
  const child = spawn(process.execPath, [script], {
    cwd: path.join(__dirname, '..'),
    stdio: 'ignore',
    detached: true,
  });
  child.unref();
  logger.info({ msg: 'Sitemap generation spawned on startup' });
}

app.listen(PORT, () => {
  logger.info(`Touristlio V2 → http://localhost:${PORT}`);
  logger.info(`Admin → http://localhost:${PORT}/admin`);
  logger.info(`Search → http://localhost:${PORT}/search`);
  logger.info(`Gezilecek Yerler → http://localhost:${PORT}/?tab=places`);
  spawnSitemapIfStale();
});

if (process.env.LIVE_DATA_CRON !== 'false') {
  const cron = require('node-cron');
  const { refreshAllPlaces } = require('./services/liveDataService');
  cron.schedule('0 */6 * * *', () => {
    const n = refreshAllPlaces();
    logger.info({ msg: 'Live data cron', places: n });
  });
}

process.on('SIGINT', () => {
  clearCache();
  process.exit(0);
});
