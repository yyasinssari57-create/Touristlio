require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const express = require('express');
require('./lib/express-async-errors').patchExpressAsyncErrors();
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const logger = require('./lib/logger');
const { validateJwtSecret } = require('./auth');
const { validateProductionEnv } = require('./lib/production-env');
const { apiLimiter, adminLimiter } = require('./middleware/rateLimit');
const { clear: clearCache } = require('./lib/cache');
const { csrfProtection, csrfTokenHandler, issueCsrfCookie } = require('./middleware/csrf');
const { uploadsStaticHeaders } = require('./middleware/uploads-static');
const { uploadsSrcsetFallback } = require('./middleware/uploads-srcset');
const { staticAssetHeaders } = require('./middleware/static-cache');
const { sendPublicHtml, publicHtmlMiddleware, htmlPageRoutesMiddleware } = require('./lib/send-public-html');
const { getAppVersion } = require('./lib/app-version');
const { parseCorsOrigins, getConnectSrcOrigins, isCorsOriginAllowed } = require('./lib/cors-origins');
const { canonicalHostMiddleware } = require('./middleware/canonical-host');
const { recaptchaConfig, publicRecaptchaConfig } = require('./middleware/recaptcha');
const { publicAnalyticsConfig, gaCspSources } = require('./lib/analytics-config');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

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

app.use(canonicalHostMiddleware());

const corsOrigins = parseCorsOrigins(process.env.CORS_ORIGIN);
const { apiPreflightMiddleware } = require('./middleware/api-preflight');
const recaptchaOn = recaptchaConfig().enabled;
const recaptchaSrc = recaptchaOn
  ? ['https://www.google.com', 'https://www.gstatic.com', 'https://www.recaptcha.net']
  : [];
const gaSrc = gaCspSources();

app.use(apiPreflightMiddleware(corsOrigins));

app.use(helmet({
  contentSecurityPolicy: isProd ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", ...recaptchaSrc, ...gaSrc],
      scriptSrcAttr: ["'unsafe-inline'"],
      // unsafe-inline: index.html critical <style> + admin panel visibility toggles (style="" / el.style)
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      styleSrcAttr: ["'unsafe-inline'"],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:', 'blob:', 'https://*.tile.openstreetmap.org', 'https://tile.openstreetmap.org'],
      connectSrc: [...getConnectSrcOrigins(), ...recaptchaSrc, ...gaSrc],
      frameSrc: recaptchaOn ? recaptchaSrc : ["'self'"],
      frameAncestors: ["'self'"],
    },
  } : false,
  crossOriginEmbedderPolicy: false,
}));
app.use(async (req, res, next) => {
  cors({
    origin(origin, cb) {
      if (isCorsOriginAllowed(origin, corsOrigins, req.get('host'))) {
        cb(null, true);
      } else {
        cb(new Error('CORS blocked'));
      }
    },
    credentials: true,
  })(req, res, next);
});
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(async (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const pathOnly = req.path || '';
  if (pathOnly.startsWith('/api')) return next();
  if (pathOnly === '/en' || pathOnly === '/en/') {
    req.tlLang = 'en';
    const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    req.url = `/${q}`;
    return next();
  }
  if (pathOnly.startsWith('/en/')) {
    req.tlLang = 'en';
    req.url = req.url.replace(/^\/en/, '') || '/';
    return next();
  }
  next();
});
const { maintenanceMiddleware } = require('./middleware/maintenance');
app.use(maintenanceMiddleware);
app.use('/api/', apiLimiter);

app.use(async (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info({ method: req.method, url: req.url, status: res.statusCode, ms: Date.now() - start });
  });
  next();
});

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
app.use('/uploads', uploadsStaticHeaders, (req, res, next) => {
  const storage = require('./lib/supabase-storage');
  if (!storage.isEnabled()) return next();
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const rel = decodeURIComponent((req.path || '').replace(/^\/+/, ''));
  if (!rel || rel.includes('..')) return next();
  return res.redirect(302, storage.publicObjectUrl(rel));
}, uploadsSrcsetFallback(UPLOADS_DIR), express.static(UPLOADS_DIR));

const { buildSitemapXml, buildRobotsTxt } = require('./lib/sitemap');
app.get('/robots.txt', async (_req, res) => {
  res.type('text/plain; charset=utf-8').send(buildRobotsTxt());
});
app.get('/sitemap.xml', async (_req, res) => {
  res.type('application/xml; charset=utf-8').send(await buildSitemapXml());
});

app.use(htmlPageRoutesMiddleware(PUBLIC_DIR));
app.use(publicHtmlMiddleware(PUBLIC_DIR));
app.use(express.static(PUBLIC_DIR, {
  index: false,
  setHeaders: staticAssetHeaders,
}));

app.use('/api/auth', csrfProtection, authRoutes);
app.get('/api/csrf', csrfTokenHandler);
app.use('/api/places', placesRoutes);
app.use('/api/tiolas', csrfProtection, tiolasRoutes);
app.use('/api/blogs', csrfProtection, blogsRoutes);
app.use('/api/admin', csrfProtection, adminLimiter, adminRoutes);
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
app.use('/api/contact', csrfProtection, require('./routes/contact'));

app.get('/api/health', async (_req, res) => {
  try {
    const { db } = require('./db');
    await db.prepare('SELECT 1 AS ok').get();
    res.json({
      ok: true,
      service: 'Touristlio',
      db: 'postgres',
      storage: require('./lib/supabase-storage').isEnabled() ? 'supabase' : 'disk',
      smtp: require('./lib/mailer').isConfigured(),
      smtpTransport: require('./lib/mailer').smtpStatus().transport || null,
      smtpLastError: require('./lib/mailer').getLastMailError(),
      version: getAppVersion(),
      ts: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({
      ok: false,
      service: 'Touristlio',
      db: 'error',
      error: err.message,
      ts: new Date().toISOString(),
    });
  }
});

/** Public homepage counters: countries, listed places, approved Tiolas (never null). */
app.get('/api/stats', async (_req, res) => {
  try {
    const { getHomepageStats } = require('./lib/stats-cache');
    res.json(await getHomepageStats());
  } catch {
    res.json({ countries: 0, places: 0, tiolas: 0 });
  }
});

app.get('/api/config/public', async (req, res) => {
  const settingsService = require('./modules/settings/settings.service');
  const csrfToken = issueCsrfCookie(req, res);
  res.json({
    affiliateEnabled: process.env.AFFILIATE_ENABLED === 'true',
    siteUrl: process.env.SITE_URL || 'http://localhost:3000',
    csrfToken,
    ...(await settingsService.getPublic()),
    ...publicRecaptchaConfig(),
    ...publicAnalyticsConfig(),
  });
});

app.get('/', async (_req, res) => {
  sendPublicHtml(res, PUBLIC_DIR, 'index.html');
});

app.get('/admin', async (_req, res) => {
  sendPublicHtml(res, PUBLIC_DIR, 'admin.html');
});

app.get('/login', async (_req, res) => {
  sendPublicHtml(res, PUBLIC_DIR, 'login.html');
});

app.get('/register', async (_req, res) => {
  sendPublicHtml(res, PUBLIC_DIR, 'register.html');
});

app.get('/profile', async (_req, res) => {
  sendPublicHtml(res, PUBLIC_DIR, 'profile.html');
});

app.get('/verify-email', async (_req, res) => {
  sendPublicHtml(res, PUBLIC_DIR, 'verify-email.html');
});

app.get('/reset-password', async (_req, res) => {
  sendPublicHtml(res, PUBLIC_DIR, 'reset-password.html');
});

app.get('/search', async (_req, res) => {
  sendPublicHtml(res, PUBLIC_DIR, 'search.html');
});

app.get('/explore', async (_req, res) => {
  sendPublicHtml(res, PUBLIC_DIR, 'index.html');
});

app.get('/gezilecek-yerler', async (_req, res) => {
  sendPublicHtml(res, PUBLIC_DIR, 'index.html');
});

app.get(['/places', '/places/'], async (_req, res) => {
  res.redirect(302, '/gezilecek-yerler');
});

app.get('/places/:slug', async (req, res) => {
  const { findPlaceRow } = require('./lib/place-lookup');
  const { mapPlaceRow } = require('./lib/place-map');
  const { placeStats } = require('./db');
  const { jsonLdForPlace, loadApprovedTiolasForPlace } = require('./lib/jsonld');
  const row = await findPlaceRow(req.params.slug);
  if (!row) {
    res.status(404);
    return sendPublicHtml(res, PUBLIC_DIR, '404.html');
  }
  const place = mapPlaceRow(row, await placeStats(row.id));
  const lang = req.tlLang === 'en' ? 'en' : 'tr';
  const desc = lang === 'en'
    ? (place.descriptionEn || place.overviewEn || place.description || '')
    : (place.description || place.overview || '');
  const tiolas = await loadApprovedTiolasForPlace(place.id);
  return sendPublicHtml(res, PUBLIC_DIR, 'index.html', {
    title: `${place.name} — Touristlio`,
    description: String(desc).slice(0, 200),
    image: place.imageUrl,
    jsonLd: jsonLdForPlace(place, tiolas, lang),
  });
});

app.get('/blog', async (req, res) => {
  const lang = req.tlLang === 'en' ? 'en' : 'tr';
  return sendPublicHtml(res, PUBLIC_DIR, 'index.html', {
    title: lang === 'en' ? 'Travel Stories — Touristlio' : 'Seyahat Hikayeleri — Touristlio',
    description: lang === 'en'
      ? 'Travel guides, hidden gems and cultural stories from local writers on Touristlio.'
      : 'Yerel yazarlardan gezi rehberleri, gizli köşeler ve kültürel keşifler.',
  });
});

app.get('/blog/:slug', async (req, res) => {
  const slug = String(req.params.slug || '').trim();
  if (!slug) {
    res.status(404);
    return sendPublicHtml(res, PUBLIC_DIR, '404.html');
  }
  const { loadApprovedBlog, jsonLdForBlog } = require('./lib/jsonld');
  const blog = loadApprovedBlog(slug);
  if (!blog) {
    res.status(404);
    return sendPublicHtml(res, PUBLIC_DIR, '404.html');
  }
  const lang = req.tlLang === 'en' ? 'en' : 'tr';
  return sendPublicHtml(res, PUBLIC_DIR, 'index.html', {
    title: `${blog.title} — Touristlio`,
    description: String(blog.excerpt || blog.body || '').slice(0, 200),
    image: blog.imageUrl,
    jsonLd: jsonLdForBlog(blog, lang),
  });
});

/** Dev-only: throw so the HTML 500 fallback can be verified. */
if (!isProd) {
  app.get('/__error-test', () => {
    throw new Error('YÜKSEK-6 test 500');
  });
}

app.get('*', async (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.status(404);
  return sendPublicHtml(res, PUBLIC_DIR, '404.html');
});

app.use((err, req, res, _next) => {
  logger.error({ err: err.message, stack: err.stack });
  if (res.headersSent) return;
  if (req.path.startsWith('/api/')) {
    if (err.message === 'CORS blocked') {
      return res.status(403).json({ error: 'İstek reddedildi (CORS)' });
    }
    const status = Number(err.status);
    const code = (status >= 400 && status < 500) ? status : 500;
    const message = (code < 500 || !isProd) ? (err.message || 'Sunucu hatası') : 'Sunucu hatası';
    return res.status(code).json({ error: message });
  }
  res.status(500);
  sendPublicHtml(res, PUBLIC_DIR, '500.html', {
    errorDetail: isProd ? null : (err && (err.stack || err.message)),
  });
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

async function boot() {
  const { initDb } = require('./db');
  await initDb();
  try {
    const storage = require('./lib/supabase-storage');
    if (storage.isEnabled()) await storage.ensureBucket();
  } catch (err) {
    logger.warn({ msg: 'Supabase Storage init skipped', err: err.message });
  }
  try {
    const { seedDefaults } = require('./modules/settings/settings.service');
    await seedDefaults();
  } catch (err) {
    logger.warn({ msg: 'Settings defaults seed skipped', err: err.message });
  }
  app.listen(PORT, async () => {
  logger.info(`Touristlio V2 → http://localhost:${PORT}`);
  logger.info(`Admin → http://localhost:${PORT}/admin`);
  logger.info(`Search → http://localhost:${PORT}/search`);
  logger.info(`Gezilecek Yerler → http://localhost:${PORT}/?tab=places`);
  spawnSitemapIfStale();
  try {
    const { maybeSeedOnStartup } = require('./lib/startup-seed');
    await maybeSeedOnStartup();
  } catch (err) {
    logger.warn({ msg: 'Startup seed hook skipped', err: err.message });
  }
  try {
    const { publishDueBlogs } = require('./lib/blog-scheduler');
    const n = await publishDueBlogs();
    if (n) logger.info({ msg: 'Startup scheduled blog publish', count: n });
  } catch (err) {
    logger.warn({ msg: 'Startup blog scheduler skipped', err: err.message });
  }
  startBackgroundJobs();
  });
}

boot().catch((err) => {
  logger.error({ msg: 'Startup failed', err: err.message, stack: err.stack });
  process.exit(1);
});

async function startBackgroundJobs() {
  if (process.env.LIVE_DATA_CRON === 'false') return;
  try {
    const cron = require('node-cron');
    const { refreshAllPlaces } = require('./services/liveDataService');
    const { publishDueBlogs } = require('./lib/blog-scheduler');
    cron.schedule('0 */6 * * *', () => {
      Promise.resolve()
        .then(() => refreshAllPlaces())
        .then((n) => logger.info({ msg: 'Live data cron', places: n }))
        .catch((err) => logger.warn({ msg: 'Live data cron failed', err: err.message }));
    });
    cron.schedule('*/5 * * * *', () => {
      Promise.resolve()
        .then(() => publishDueBlogs())
        .then((n) => { if (n) logger.info({ msg: 'Scheduled blogs published', count: n }); })
        .catch((err) => logger.warn({ msg: 'Blog scheduler cron failed', err: err.message }));
    });
  } catch (err) {
    logger.warn({ msg: 'Background cron jobs disabled', err: err.message });
  }
}

process.on('SIGINT', () => {
  clearCache();
  process.exit(0);
});
