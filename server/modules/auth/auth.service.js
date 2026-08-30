const crypto = require('crypto');
const { validationResult } = require('express-validator');
const path = require('path');
const fs = require('fs');
const { createUser, comparePassword, sanitizeUser, signToken, hashPassword, findUserById, needsRehash } = require('../../auth');
const { AVATAR_PRESETS, AVATAR_COLORS, isValidPreset, isValidColor } = require('../../lib/avatars');
const authModel = require('./auth.model');
const logger = require('../../lib/logger');
const mailer = require('../../lib/mailer');

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.COOKIE_SECURE === 'true'
    || (process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false'),
  sameSite: process.env.COOKIE_SAMESITE || 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
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
  res.clearCookie('tl_token', {
    path: '/',
    httpOnly: true,
    secure: COOKIE_OPTS.secure,
    sameSite: COOKIE_OPTS.sameSite,
  });
}

function isLocked(row) {
  if (!row?.locked_until) return false;
  return new Date(row.locked_until + 'Z') > new Date();
}

function siteBase() {
  return (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
}

function isLocalDevEmail(email) {
  return String(email || '').toLowerCase().endsWith('@touristlio.local');
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
  let emailVerificationSent = false;
  try {
    emailVerificationSent = await mailer.sendVerificationEmail(user.email, verifyUrl);
    if (emailVerificationSent) {
      logger.info({ msg: 'Verification email sent', email: user.email });
    } else {
      logger.warn({ msg: 'Verification email skipped (SMTP not configured)', email: user.email });
    }
  } catch (e) {
    logger.warn({ msg: 'Verification email failed', email: user.email, err: e.message });
  }
  const token = signToken(user);
  return {
    status: 201,
    token,
    cookie: token,
    user: sanitizeUser(user),
    emailVerificationSent,
  };
}

function login(req) {
  const err = validationError(req);
  if (err) return { error: err, status: 400 };
  const { email, password } = req.body;
  const row = authModel.findByEmail(email);
  if (!row) {
    comparePassword(password, null);
    return { error: 'E-posta veya şifre hatalı', status: 401 };
  }
  if (isLocked(row)) {
    return { error: 'Çok fazla başarısız deneme. Lütfen daha sonra tekrar deneyin.', status: 423 };
  }
  if (!comparePassword(password, row.password_hash)) {
    authModel.recordFailedLogin(row, MAX_FAILED, LOCK_MINUTES);
    return { error: 'E-posta veya şifre hatalı', status: 401 };
  }
  if (needsRehash(row.password_hash)) {
    authModel.upgradePasswordHash(row.id, hashPassword(password));
  }
  if (row.is_blocked) {
    return { error: 'Hesabınız engellenmiştir', status: 403 };
  }
  if (
    process.env.REQUIRE_EMAIL_VERIFICATION === 'true'
    && !row.email_verified
    && !isLocalDevEmail(row.email)
  ) {
    return { error: 'Lütfen önce e-posta adresinizi doğrulayın.', status: 403 };
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

async function changePassword(req, userId) {
  const err = validationError(req);
  if (err) return { error: err, status: 400 };
  const { currentPassword, password } = req.body;
  const row = authModel.findById(userId);
  if (!row) return { error: 'Kullanıcı bulunamadı', status: 404 };
  if (!comparePassword(currentPassword, row.password_hash)) {
    return { error: 'Mevcut şifre hatalı', status: 401 };
  }
  authModel.updatePasswordHash(userId, hashPassword(password));
  authModel.clearFailedLogin(userId);
  return { status: 200, message: 'Şifre güncellendi' };
}

async function changeEmail(req, userId) {
  const err = validationError(req);
  if (err) return { error: err, status: 400 };
  const { email, password } = req.body;
  const row = authModel.findById(userId);
  if (!row) return { error: 'Kullanıcı bulunamadı', status: 404 };
  if (!comparePassword(password, row.password_hash)) {
    return { error: 'Şifre hatalı', status: 401 };
  }
  const normalized = email.toLowerCase().trim();
  const existing = authModel.findByEmail(normalized);
  if (existing && existing.id !== userId) {
    return { error: 'Bu e-posta zaten kayıtlı', status: 409 };
  }
  authModel.updateEmailAddress(userId, normalized);
  const verifyToken = crypto.randomBytes(24).toString('hex');
  authModel.updateVerification(userId, verifyToken);
  const verifyUrl = `${siteBase()}/verify-email?token=${verifyToken}`;
  try {
    await mailer.sendVerificationEmail(normalized, verifyUrl);
  } catch (e) {
    logger.warn({ msg: 'Verification email failed after email change', email: normalized, err: e.message });
  }
  const updated = authModel.findById(userId);
  return { status: 200, message: 'E-posta güncellendi. Lütfen yeni adresinizi doğrulayın.', user: sanitizeUser(updated) };
}

function getAvatarOptions() {
  return { presets: AVATAR_PRESETS, colors: AVATAR_COLORS };
}

function updateAvatarPreset(userId, { avatarPreset, avatarColor }) {
  if (!isValidPreset(avatarPreset)) {
    return { error: 'Geçersiz avatar karakteri', status: 400 };
  }
  const color = avatarColor && isValidColor(avatarColor) ? avatarColor : null;
  const row = authModel.findById(userId);
  if (!row) return { error: 'Kullanıcı bulunamadı', status: 404 };
  authModel.updateAvatarPreset(
    userId,
    avatarPreset,
    color || row.avatar_color || '#0ea5e9',
  );
  return {
    status: 200,
    message: 'Avatar güncellendi.',
    pending: false,
    user: sanitizeUser(findUserById(userId)),
  };
}

function updateAvatarPhoto(userId, file) {
  if (!file) return { error: 'Fotoğraf gerekli', status: 400 };
  const row = authModel.findById(userId);
  if (!row) return { error: 'Kullanıcı bulunamadı', status: 404 };

  const url = `/uploads/${path.basename(file.filename || file.path)}`;
  if (row.avatar_url && row.avatar_url !== url) {
    const oldPath = path.join(__dirname, '..', '..', '..', row.avatar_url.replace(/^\//, ''));
    try { if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath); } catch { /* ignore */ }
  }
  authModel.updateAvatarUrl(userId, url);
  return {
    status: 200,
    message: 'Profil fotoğrafı güncellendi.',
    pending: false,
    user: sanitizeUser(findUserById(userId)),
  };
}

async function resendVerification(userId) {
  const row = authModel.findById(userId);
  if (!row) return { error: 'Kullanıcı bulunamadı', status: 404 };
  if (row.email_verified) return { error: 'E-posta zaten doğrulanmış', status: 400 };
  const verifyToken = crypto.randomBytes(24).toString('hex');
  authModel.updateVerification(userId, verifyToken);
  const verifyUrl = `${siteBase()}/verify-email?token=${verifyToken}`;
  try {
    await mailer.sendVerificationEmail(row.email, verifyUrl);
  } catch (e) {
    logger.warn({ msg: 'Verification resend failed', email: row.email, err: e.message });
    return { error: 'Doğrulama e-postası gönderilemedi', status: 500 };
  }
  return { status: 200, message: 'Doğrulama e-postası gönderildi' };
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
  changePassword,
  changeEmail,
  resendVerification,
  getAvatarOptions,
  updateAvatarPreset,
  updateAvatarPhoto,
};
