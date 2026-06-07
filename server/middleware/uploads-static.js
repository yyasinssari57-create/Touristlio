/** Security headers for /uploads static file responses. */
function uploadsStaticHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', 'inline');
  next();
}

module.exports = { uploadsStaticHeaders };
