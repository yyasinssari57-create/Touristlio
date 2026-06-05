const crypto = require('crypto');

const { validationResult } = require('express-validator');

const { createUser, comparePassword, sanitizeUser, signToken, hashPassword } = require('../../auth');

const authModel = require('./auth.model');

const logger = require('../../lib/logger');

const mailer = require('../../lib/mailer');

const MAX_FAILED = 5;

const LOCK_MINUTES = 15;

const COOKIE_OPTS = {

  httpOnly: true,

  secure: process.env.NODE_ENV === 'production',

  sameSite: 'lax',

  maxAge: 30 * 24 * 60 * 60 * 1000,

  path: '/',

};

function validationError(req) {

  const errors = validationResult(req);

  if (!errors.isEmpty()) return errors.array()[0].msg;

  return null;

}

function setAuthCookie(res, token) {

  res.cookie('tl_token', token, COOKIE_OPTS);

}

function clearAuthCookie(res) {

  res.clearCookie('tl_token', { path: '/' });

}

function isLocked(row) {

  if (!row?.locked_until) return false;

  return new Date(row.locked_until + 'Z') > new Date();

}

function siteBase() {

  return (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');

}

async function register(req) {

  const err = validationError(req);

  if (err) return { error: err, status: 400 };

  const { name, email, password } = req.body;

  if (authModel.findByEmail(email)) {

    return { error: 'Bu e-posta zaten kayıtlı', status: 409 };

  }

  const verifyToken = crypto.randomBytes(24).toString('hex');

  const user = createUser({ name, email, password, role: 'member' });

  authModel.updateVerification(user.id, verifyToken);

  const verifyUrl = `${siteBase()}/verify-email?token=${verifyToken}`;

  try {

    await mailer.sendVerificationEmail(user.email, verifyUrl);

    logger.info({ msg: 'Verification email sent', email: user.email });

  } catch (e) {

    logger.warn({ msg: 'Verification email failed', email: user.email, err: e.message });

  }

  const token = signToken(user);

  return {

    status: 201,

    token,

    cookie: token,

    user: sanitizeUser(user),

    emailVerificationSent: true,

  };

}

function login(req) {

  const err = validationError(req);

  if (err) return { error: err, status: 400 };

  const { email, password } = req.body;

  const row = authModel.findByEmail(email);

  if (!row) return { error: 'E-posta veya şifre hatalı', status: 401 };

  if (isLocked(row)) {

    return { error: 'Çok fazla başarısız deneme. Lütfen daha sonra tekrar deneyin.', status: 423 };

  }

  if (!comparePassword(password, row.password_hash)) {

    authModel.recordFailedLogin(row, MAX_FAILED, LOCK_MINUTES);

    return { error: 'E-posta veya şifre hatalı', status: 401 };

  }

  authModel.clearFailedLogin(row.id);

  const token = signToken(row);

  return { status: 200, token, cookie: token, user: sanitizeUser(row) };

}

async function forgotPassword(req) {

  const err = validationError(req);

  if (err) return { error: err, status: 400 };

  const row = authModel.findByEmail(req.body.email);

  if (row) {

    const token = crypto.randomBytes(32).toString('hex');

    const expires = new Date(Date.now() + 3600000).toISOString().slice(0, 19).replace('T', ' ');

    authModel.insertPasswordReset(row.id, token, expires);

    const resetUrl = `${siteBase()}/reset-password?token=${token}`;

    try {

      await mailer.sendPasswordResetEmail(row.email, resetUrl);

      logger.info({ msg: 'Password reset email sent', email: row.email });

    } catch (e) {

      logger.warn({ msg: 'Password reset email failed', email: row.email, err: e.message });

    }

  }

  return { status: 200, message: 'E-posta kayıtlıysa sıfırlama bağlantısı gönderildi.' };

}

function resetPassword(req) {

  const err = validationError(req);

  if (err) return { error: err, status: 400 };

  const { token, password } = req.body;

  const row = authModel.findPasswordReset(token);

  if (!row) return { error: 'Geçersiz veya süresi dolmuş token', status: 400 };

  authModel.usePasswordReset(row.id, row.user_id, hashPassword(password));

  authModel.clearFailedLogin(row.user_id);

  return { status: 200, message: 'Şifre güncellendi' };

}

function verifyEmail(req) {

  const err = validationError(req);

  if (err) return { error: err, status: 400 };

  const user = authModel.verifyEmailToken(req.body.token);

  if (!user) return { error: 'Geçersiz token', status: 400 };

  authModel.markEmailVerified(user.id);

  return { status: 200, message: 'E-posta doğrulandı' };

}

module.exports = {

  validationError,

  setAuthCookie,

  clearAuthCookie,

  register,

  login,

  forgotPassword,

  resetPassword,

  verifyEmail,

};
