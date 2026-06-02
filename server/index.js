require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const logger = require('./lib/logger');
const { apiLimiter } = require('./middleware/rateLimit');
const { clear: clearCache } = require('./lib/cache');

const authRoutes = require('./routes/auth');
const placesRoutes = require('./routes/places');
const tiolasRoutes = require('./routes/tiolas');
const blogsRoutes = require('./routes/blogs');
const adminRoutes = require('./routes/admin');
const osmRoutes = require('./routes/osm');
const travelListsRoutes = require('./routes/travel-lists');
const tripPlansRoutes = require('./routes/trip-plans');
const liveDataRoutes = require('./routes/live-data');
const searchRoutes = require('./routes/search');

const PORT = process.env.PORT || 3000;
const app = express();

const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(helmet({
  contentSecurityPolicy: false,
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

app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/places', placesRoutes);
app.use('/api/tiolas', tiolasRoutes);
app.use('/api/blogs', blogsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/osm', osmRoutes);
app.use('/api/travel-lists', travelListsRoutes);
app.use('/api/trip-plans', tripPlansRoutes);
app.use('/api/live-data', liveDataRoutes);
app.use('/api/search', searchRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'Touristlio', version: '2.0.0', ts: new Date().toISOString() });
});

app.get('/api/config/public', (_req, res) => {
  res.json({
    affiliateEnabled: process.env.AFFILIATE_ENABLED === 'true',
    siteUrl: process.env.SITE_URL || 'http://localhost:3000',
  });
});

/** Dev-only: write processed navbar logo PNG from base64 payload. */
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

app.get('/search', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'search.html'));
});

app.get('/trip-planner', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'trip-planner.html'));
});

app.get('/trip/:id', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'trip-planner.html'));
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  if (req.path.match(/\.(html|xml|txt|css|js|png|jpg|svg|webp|ico)$/)) {
    return res.status(404).sendFile(path.join(__dirname, '..', 'public', '404.html'));
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use((err, _req, res, _next) => {
  logger.error({ err: err.message, stack: err.stack });
  if (res.headersSent) return;
  if (_req.path.startsWith('/api/')) {
    return res.status(500).json({ error: err.message || 'Sunucu hatası' });
  }
  res.status(500).sendFile(path.join(__dirname, '..', 'public', '500.html'));
});

app.listen(PORT, () => {
  logger.info(`Touristlio V2 → http://localhost:${PORT}`);
  logger.info(`Admin → http://localhost:${PORT}/admin`);
  logger.info(`Search → http://localhost:${PORT}/search`);
  logger.info(`Trip Planner → http://localhost:${PORT}/trip-planner`);
});

if (process.env.LIVE_DATA_CRON !== 'false') {
  try {
    const cron = require('node-cron');
    const { refreshAllPlaces } = require('./services/liveDataService');
    cron.schedule('0 */6 * * *', () => {
      const n = refreshAllPlaces();
      logger.info({ msg: 'Live data cron', places: n });
    });
  } catch (e) {
    logger.warn({ msg: 'node-cron not available', err: e.message });
  }
}

process.on('SIGINT', () => {
  clearCache();
  process.exit(0);
});
