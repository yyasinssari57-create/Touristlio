const settingsService = require('../modules/settings/settings.service');

function maintenanceMiddleware(req, res, next) {
  if (!req.path.startsWith('/api/')) return next();
  if (req.path.startsWith('/api/auth/login')) return next();
  if (req.path.startsWith('/api/auth/me')) return next();
  if (req.path.startsWith('/api/auth/logout')) return next();
  if (req.path.startsWith('/api/admin')) return next();
  if (req.path.startsWith('/api/analytics')) return next();

  const settings = settingsService.getAll();
  if (settings.maintenance_mode !== 'true') return next();

  const message = settings.maintenance_message
    || 'Site bakımda. Lütfen daha sonra tekrar deneyin.';
  return res.status(503).json({ error: message, maintenance: true });
}

module.exports = { maintenanceMiddleware };
