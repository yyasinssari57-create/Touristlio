const { ok, fail } = require('../../lib/apiResponse');

const authService = require('./auth.service');



function register(req, res) {

  const result = authService.register(req);

  if (result.error) return fail(res, result.error, result.status);

  authService.setAuthCookie(res, result.cookie);

  return ok(res, {

    user: result.user,

    token: result.token,

    emailVerificationSent: result.emailVerificationSent,

  }, result.status);

}



function login(req, res) {

  const result = authService.login(req);

  if (result.error) return fail(res, result.error, result.status);

  authService.setAuthCookie(res, result.cookie);

  return ok(res, { user: result.user, token: result.token });

}



function logout(_req, res) {

  authService.clearAuthCookie(res);

  return ok(res, { loggedOut: true });

}



function me(req, res) {

  return ok(res, { user: req.user });

}



function forgotPassword(req, res) {

  const result = authService.forgotPassword(req);

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



module.exports = {

  register,

  login,

  logout,

  me,

  forgotPassword,

  resetPassword,

  verifyEmail,

};

