const { verifyToken, sanitizeUser, findUserById } = require('../auth');

function authOptional(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }
  try {
    const payload = verifyToken(header.slice(7));
    const row = findUserById(payload.id);
    req.user = sanitizeUser(row);
  } catch {
    req.user = null;
  }
  next();
}

function authRequired(req, res, next) {
  authOptional(req, res, () => {
    if (!req.user) return res.status(401).json({ error: 'Giriş gerekli' });
    next();
  });
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Yetki yok' });
    }
    next();
  };
}

module.exports = { authOptional, authRequired, requireRole };
