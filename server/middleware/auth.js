const { verifyToken, sanitizeUser, findUserById } = require('../auth');
const { fail } = require('../lib/apiResponse');
const authService = require('../modules/auth/auth.service');

const SESSION_EXPIRED_MSG = 'Oturum süresi doldu, lütfen tekrar giriş yapın';

function loadUserFromToken(req) {
  const header = req.headers.authorization;
  const cookieToken = req.cookies?.tl_token;
  let raw = null;
  if (header?.startsWith('Bearer ')) raw = header.slice(7);
  else if (cookieToken) raw = cookieToken;

  if (!raw) return { user: null, reason: 'none' };
  try {
    const payload = verifyToken(raw);
    const row = findUserById(payload.id);
    if (!row) return { user: null, reason: 'invalid' };
    if (row.is_blocked) return { user: null, blocked: true, reason: 'blocked' };
    if (row.password_changed_at && payload.iat) {
      const changedRaw = String(row.password_changed_at).trim();
      const iso = changedRaw.includes('T') ? changedRaw : changedRaw.replace(' ', 'T');
      const changedMs = Date.parse(iso.endsWith('Z') ? iso : `${iso}Z`);
      if (!Number.isNaN(changedMs)) {
        const changedAt = Math.floor(changedMs / 1000);
        if (payload.iat < changedAt) return { user: null, stale: true, reason: 'stale' };
      }
    }
    return { user: sanitizeUser(row), reason: 'ok' };
  } catch (err) {
    if (err && err.name === 'TokenExpiredError') {
      return { user: null, expired: true, reason: 'expired' };
    }
    return { user: null, invalid: true, reason: 'invalid' };
  }
}

function rejectExpiredSession(res) {
  authService.clearAuthCookie(res);
  return fail(res, SESSION_EXPIRED_MSG, 401, { sessionExpired: true });
}

function authOptional(req, res, next) {
  const { user } = loadUserFromToken(req);
  req.user = user;
  next();
}

function authRequired(req, res, next) {
  const { user, blocked, stale, expired, invalid } = loadUserFromToken(req);
  if (blocked) {
    authService.clearAuthCookie(res);
    return fail(res, 'Hesabınız engellenmiştir', 403);
  }
  if (stale || expired || invalid) return rejectExpiredSession(res);
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

module.exports = {
  loadUserFromToken,
  authOptional,
  authRequired,
  requireRole,
  SESSION_EXPIRED_MSG,
  rejectExpiredSession,
};
