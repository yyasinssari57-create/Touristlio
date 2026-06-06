const { verifyToken, sanitizeUser, findUserById } = require('../auth');
const { fail } = require('../lib/apiResponse');

function authOptional(req, res, next) {
  const header = req.headers.authorization;
  const cookieToken = req.cookies?.tl_token;
  let raw = null;
  if (header?.startsWith('Bearer ')) raw = header.slice(7);
  else if (cookieToken) raw = cookieToken;

  if (!raw) {
    req.user = null;
    return next();
  }
  try {
    const payload = verifyToken(raw);
    const row = findUserById(payload.id);
    req.user = sanitizeUser(row);
  } catch {
    req.user = null;
  }
  next();
}

function authRequired(req, res, next) {
  authOptional(req, res, () => {
    if (!req.user) return fail(res, 'Giriş gerekli', 401);
    next();
  });
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return fail(res, 'Yetki yok', 403);
    }
    next();
  };
}

module.exports = { authOptional, authRequired, requireRole };
