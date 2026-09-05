const { DAY_CACHE } = require('./static-cache');

/** Security + cache headers for /uploads (same path can be overwritten). */
function uploadsStaticHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cache-Control', DAY_CACHE);
  next();
}

module.exports = { uploadsStaticHeaders };
