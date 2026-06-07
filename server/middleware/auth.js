const { verifyToken, sanitizeUser, findUserById } = require('../auth');
const { fail } = require('../lib/apiResponse');
const authService = require('../modules/auth/auth.service');

function loadUserFromToken(req) {
  const header = req.headers.authorization;
  const cookieToken = req.cookies?.tl_token;
  let raw = null;
  if (header?.startsWith('Bearer ')) raw = header.slice(7);
  else if (cookieToken) raw = cookieToken;

  if (!raw) return { user: null, blocked: false };
  try {
    const payload = verifyToken(raw);
    const row = findUserById(payload.id);
    if (!row) return { user: null, blocked: false };
    if (row.is_blocked) return { user: null, blocked: true };
    if (row.password_changed_at && payload.iat) {
      const raw = String(row.password_changed_at).trim();
      const iso = raw.includes('T') ? raw : raw.replace(' ', 'T');
      const changedMs = Date.parse(iso.endsWith('Z') ? iso : `${iso}Z`);
      if (!Number.isNaN(changedMs)) {
        const changedAt = Math.floor(changedMs / 1000);
        if (payload.iat < changedAt) return { user: null, blocked: false, stale: true };
      }
    }
    return { user: sanitizeUser(row), blocked: false };
  } catch {
    return { user: null, blocked: false };
  }
}

function authOptional(req, res, next) {
  const { user } = loadUserFromToken(req);
  req.user = user;
  next();
}

function authRequired(req, res, next) {
  const { user, blocked, stale } = loadUserFromToken(req);
  if (blocked) {
    authService.clearAuthCookie(res);
    return fail(res, 'Hesabınız engellenmiştir', 403);
  }
  if (stale) {
    authService.clearAuthCookie(res);
    return fail(res, 'Oturum süresi doldu, lütfen tekrar giriş yapın', 401);
  }
  if (!user) return fail(res, 'Giriş gerekli', 401);
  req.user = user;
  next();
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
