const { ok, fail } = require('../../lib/apiResponse');
const authService = require('./auth.service');
const { loadUserFromToken, SESSION_EXPIRED_MSG } = require('../../middleware/auth');

async function register(req, res) {
  const result = await authService.register(req);
  if (result.error) return fail(res, result.error, result.status);
  authService.setAuthCookie(res, result.cookie);
  return ok(res, {
    user: result.user,
    emailVerificationSent: result.emailVerificationSent,
  }, result.status);
}

function login(req, res) {
  const result = authService.login(req);
  if (result.error) return fail(res, result.error, result.status);
  authService.setAuthCookie(res, result.cookie);
  return ok(res, { user: result.user });
}

function logout(_req, res) {
  authService.clearAuthCookie(res);
  return ok(res, { loggedOut: true });
}

function me(req, res) {
  const loaded = loadUserFromToken(req);
  if (loaded.blocked) {
    authService.clearAuthCookie(res);
    return fail(res, 'Hesabınız engellenmiştir', 403);
  }
  if (loaded.stale || loaded.expired || loaded.invalid) {
    authService.clearAuthCookie(res);
    return fail(res, SESSION_EXPIRED_MSG, 401, { sessionExpired: true });
  }
  return ok(res, { user: loaded.user || null });
}

function profile(req, res) {
  const lang = req.query.lang === 'en' ? 'en' : 'tr';
  const result = authService.getDashboard(req.user.id, lang);
  if (result.error) return fail(res, result.error, result.status);
  return ok(res, {
    user: result.user,
    tiolas: result.tiolas,
    favorites: result.favorites,
    visited: result.visited,
    visitedStats: result.visitedStats,
    badges: result.badges,
    earnedBadges: result.earnedBadges,
    nextBadge: result.nextBadge,
    tiolaCount: result.tiolaCount,
  });
}

async function forgotPassword(req, res) {
  const result = await authService.forgotPassword(req);
  if (result.error) return fail(res, result.error, result.status);
  return ok(res, { message: result.message });
}

function resetPassword(req, res) {
  const result = authService.resetPassword(req);
  if (result.error) return fail(res, result.error, result.status);
  authService.clearAuthCookie(res);
  return ok(res, { message: result.message });
}

function verifyEmail(req, res) {
  const result = authService.verifyEmail(req);
  if (result.error) return fail(res, result.error, result.status);
  return ok(res, { message: result.message });
}

async function changePassword(req, res) {
  const result = await authService.changePassword(req, req.user.id);
  if (result.error) return fail(res, result.error, result.status);
  if (result.cookie) authService.setAuthCookie(res, result.cookie);
  return ok(res, { message: result.message, user: result.user });
}

async function changeEmail(req, res) {
  const result = await authService.changeEmail(req, req.user.id);
  if (result.error) return fail(res, result.error, result.status);
  return ok(res, { message: result.message, user: result.user });
}

async function resendVerification(req, res) {
  const result = await authService.resendVerification(req.user.id);
  if (result.error) return fail(res, result.error, result.status);
  return ok(res, { message: result.message });
}

function avatarOptions(_req, res) {
  return ok(res, authService.getAvatarOptions());
}

function updateAvatarPreset(req, res) {
  const err = authService.validationError(req);
  if (err) return fail(res, err, 400);
  const result = authService.updateAvatarPreset(req.user.id, req.body || {});
  if (result.error) return fail(res, result.error, result.status);
  return res.status(result.status || 200).json({
    user: result.user,
    message: result.message,
    pending: result.pending || false,
  });
}

function updateAvatarPhoto(req, res) {
  const result = authService.updateAvatarPhoto(req.user.id, req.file);
  if (result.error) return fail(res, result.error, result.status);
  return res.status(result.status || 200).json({
    user: result.user,
    message: result.message,
    pending: result.pending || false,
  });
}

module.exports = {
  register,
  login,
  logout,
  me,
  profile,
  forgotPassword,
  resetPassword,
  verifyEmail,
  changePassword,
  changeEmail,
  resendVerification,
  avatarOptions,
  updateAvatarPreset,
  updateAvatarPhoto,
};
