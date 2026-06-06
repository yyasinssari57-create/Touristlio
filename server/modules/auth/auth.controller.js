const { ok, fail } = require('../../lib/apiResponse');
const authService = require('./auth.service');

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
  return ok(res, { user: req.user });
}

async function forgotPassword(req, res) {
  const result = await authService.forgotPassword(req);
  if (result.error) return fail(res, result.error, result.status);
  return ok(res, { message: result.message });
}

function resetPassword(req, res) {
  const result = authService.resetPassword(req);
  if (result.error) return fail(res, result.error, result.status);
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
  return ok(res, { message: result.message });
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
  return ok(res, { user: result.user });
}

function updateAvatarPhoto(req, res) {
  const result = authService.updateAvatarPhoto(req.user.id, req.file);
  if (result.error) return fail(res, result.error, result.status);
  return ok(res, { user: result.user });
}

module.exports = {
  register,
  login,
  logout,
  me,
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
