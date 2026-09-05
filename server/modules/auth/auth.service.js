const crypto = require('crypto');
const path = require('path');
const { validationResult } = require('express-validator');
const { deleteStoredImage } = require('../../lib/image-process');
const { createUser, comparePassword, sanitizeUser, signToken, hashPassword, findUserById, needsRehash } = require('../../auth');
const { AVATAR_PRESETS, AVATAR_COLORS, isValidPreset, isValidColor } = require('../../lib/avatars');
const { sanitizeName, isValidEmail } = require('../../lib/sanitize');
const authModel = require('./auth.model');
const logger = require('../../lib/logger');
const mailer = require('../../lib/mailer');
const { authCookieOptions } = require('../../lib/cookie-opts');

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

function maskEmail(email) {
  const s = String(email || '').toLowerCase().trim();
  const at = s.indexOf('@');
  if (at < 1 || at === s.length - 1) return '[redacted]';
  const local = s.slice(0, at);
  const domain = s.slice(at + 1);
  const keep = local.length <= 2 ? local[0] : local.slice(0, 2);
  return `${keep}***@${domain}`;
}

function clientIp(req) {
  return req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null;
}

/** Defensive signal only — never logs password or full token. */
function logFailedLogin(req, { userId, locked, reason } = {}) {
  logger.warn({
    event: 'failed_login',
    userId: userId != null ? Number(userId) || userId : null,
    email: maskEmail(req.body?.email),
    locked: !!locked,
    reason: String(reason || 'bad_password'),
    ip: clientIp(req),
    path: req.originalUrl || req.path || '/api/auth/login',
  });
}

function cookieOpts() {
  return authCookieOptions();
}

function validationError(req) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return errors.array()[0].msg;
  return null;
}

function setAuthCookie(res, token) {
  res.cookie('tl_token', token, cookieOpts());
}

function clearAuthCookie(res) {
  const opts = cookieOpts();
  res.clearCookie('tl_token', {
    path: opts.path,
    httpOnly: opts.httpOnly,
    secure: opts.secure,
    sameSite: opts.sameSite,
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
  const name = sanitizeName(req.body.name, 120);
  const email = String(req.body.email || '').trim().toLowerCase();
  const { password } = req.body;
  if (!name || name.length < 2) return { error: 'Ad en az 2 karakter olmalı', status: 400 };
  if (!isValidEmail(email)) return { error: 'Geçerli e-posta girin', status: 400 };
  if (await authModel.findByEmail(email)) {
    return { error: 'Bu e-posta zaten kayıtlı', status: 409 };
  }
  const verifyToken = crypto.randomBytes(24).toString('hex');
  const user = await createUser({ name, email, password, role: 'member' });
  await authModel.updateVerification(user.id, verifyToken);
  const verifyUrl = `${siteBase()}/verify-email?token=${verifyToken}`;
  let emailVerificationSent = false;
  try {
    emailVerificationSent = await mailer.sendVerificationEmail(user.email, verifyUrl);
    if (emailVerificationSent) {
      logger.info({ msg: 'Verification email sent', email: user.email });
    } else {
      const smtp = mailer.smtpStatus();
      logger.warn({
        msg: 'Verification email skipped (SMTP not configured)',
        email: user.email,
        reason: smtp.reason,
      });
      if (process.env.NODE_ENV !== 'production') {
        logger.info({ msg: 'Dev verification URL (SMTP off)', email: user.email, verifyUrl });
      }
    }
  } catch (e) {
    logger.warn({
      msg: 'Verification email failed',
      email: user.email,
      err: e.message,
      last: mailer.getLastMailError(),
    });
  }
  const token = signToken(user);
  return {
    status: 201,
    token,
    cookie: token,
    user: await sanitizeUser(user),
    emailVerificationSent,
  };
}

async function login(req) {
  const err = validationError(req);
  if (err) return { error: err, status: 400 };
  const { email, password } = req.body;
  const row = await authModel.findByEmail(email);
  if (!row) {
    await comparePassword(password, null);
    logFailedLogin(req, { reason: 'unknown_user' });
    return { error: 'E-posta veya şifre hatalı', status: 401 };
  }
  if (isLocked(row)) {
    logFailedLogin(req, { userId: row.id, locked: true, reason: 'locked' });
    return { error: 'Çok fazla başarısız deneme. Lütfen daha sonra tekrar deneyin.', status: 423 };
  }
  if (!(await comparePassword(password, row.password_hash))) {
    await authModel.recordFailedLogin(row, MAX_FAILED, LOCK_MINUTES);
    const nextCount = (row.failed_login_count || 0) + 1;
    const nowLocked = nextCount >= MAX_FAILED;
    logFailedLogin(req, {
      userId: row.id,
      locked: nowLocked,
      reason: nowLocked ? 'locked' : 'bad_password',
    });
    return { error: 'E-posta veya şifre hatalı', status: 401 };
  }
  if (needsRehash(row.password_hash)) {
    await authModel.upgradePasswordHash(row.id, await hashPassword(password));
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
  await authModel.clearFailedLogin(row.id);
  const token = signToken(row);
  return { status: 200, token, cookie: token, user: await sanitizeUser(row) };
}

async function forgotPassword(req) {
  const err = validationError(req);
  if (err) return { error: err, status: 400 };
  const row = await authModel.findByEmail(req.body.email);
  if (row) {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000).toISOString().slice(0, 19).replace('T', ' ');
    await authModel.insertPasswordReset(row.id, token, expires);
    const resetUrl = `${siteBase()}/reset-password?token=${token}`;
    try {
      const sent = await mailer.sendPasswordResetEmail(row.email, resetUrl);
      if (sent) logger.info({ msg: 'Password reset email sent', email: row.email });
      else logger.warn({ msg: 'Password reset email skipped (SMTP not configured)', email: row.email });
    } catch (e) {
      logger.warn({ msg: 'Password reset email failed', email: row.email, err: e.message });
    }
  }
  return { status: 200, message: 'E-posta kayıtlıysa sıfırlama bağlantısı gönderildi.' };
}

async function resetPassword(req) {
  const err = validationError(req);
  if (err) return { error: err, status: 400 };
  const { token, password } = req.body;
  const row = await authModel.findPasswordReset(token);
  if (!row) return { error: 'Geçersiz veya süresi dolmuş token', status: 400 };
  await authModel.usePasswordReset(row.id, row.user_id, await hashPassword(password));
  await authModel.clearFailedLogin(row.user_id);
  return { status: 200, message: 'Şifre güncellendi' };
}

async function verifyEmail(req) {
  const err = validationError(req);
  if (err) return { error: err, status: 400 };
  const user = await authModel.verifyEmailToken(req.body.token);
  if (!user) return { error: 'Geçersiz token', status: 400 };
  await authModel.markEmailVerified(user.id);
  return { status: 200, message: 'E-posta doğrulandı' };
}

async function changePassword(req, userId) {
  const err = validationError(req);
  if (err) return { error: err, status: 400 };
  const { currentPassword, password } = req.body;
  const row = await authModel.findById(userId);
  if (!row) return { error: 'Kullanıcı bulunamadı', status: 404 };
  if (!(await comparePassword(currentPassword, row.password_hash))) {
    return { error: 'Mevcut şifre hatalı', status: 401 };
  }
  await authModel.updatePasswordHash(userId, await hashPassword(password));
  await authModel.clearFailedLogin(userId);
  const updated = await authModel.findById(userId);
  const token = signToken(updated);
  return {
    status: 200,
    message: 'Şifre güncellendi',
    cookie: token,
    user: await sanitizeUser(updated),
  };
}

async function changeEmail(req, userId) {
  const err = validationError(req);
  if (err) return { error: err, status: 400 };
  const { email, password } = req.body;
  const row = await authModel.findById(userId);
  if (!row) return { error: 'Kullanıcı bulunamadı', status: 404 };
  if (!(await comparePassword(password, row.password_hash))) {
    return { error: 'Şifre hatalı', status: 401 };
  }
  const normalized = email.toLowerCase().trim();
  const existing = await authModel.findByEmail(normalized);
  if (existing && existing.id !== userId) {
    return { error: 'Bu e-posta zaten kayıtlı', status: 409 };
  }
  await authModel.updateEmailAddress(userId, normalized);
  const verifyToken = crypto.randomBytes(24).toString('hex');
  await authModel.updateVerification(userId, verifyToken);
  const verifyUrl = `${siteBase()}/verify-email?token=${verifyToken}`;
  try {
    const sent = await mailer.sendVerificationEmail(normalized, verifyUrl);
    if (!sent) {
      logger.warn({ msg: 'Verification email skipped after email change (SMTP not configured)', email: normalized });
    }
  } catch (e) {
    logger.warn({ msg: 'Verification email failed after email change', email: normalized, err: e.message });
  }
  const updated = await authModel.findById(userId);
  return { status: 200, message: 'E-posta güncellendi. Lütfen yeni adresinizi doğrulayın.', user: await sanitizeUser(updated) };
}

function getAvatarOptions() {
  return { presets: AVATAR_PRESETS, colors: AVATAR_COLORS };
}

async function updateAvatarPreset(userId, { avatarPreset, avatarColor }) {
  if (!isValidPreset(avatarPreset)) {
    return { error: 'Geçersiz avatar karakteri', status: 400 };
  }
  const color = avatarColor && isValidColor(avatarColor) ? avatarColor : null;
  const row = await authModel.findById(userId);
  if (!row) return { error: 'Kullanıcı bulunamadı', status: 404 };
  await authModel.updateAvatarPreset(
    userId,
    avatarPreset,
    color || row.avatar_color || '#0ea5e9',
  );
  return {
    status: 200,
    message: 'Avatar güncellendi.',
    pending: false,
    user: await sanitizeUser(await findUserById(userId)),
  };
}

async function updateAvatarPhoto(userId, file) {
  if (!file) return { error: 'Fotoğraf gerekli', status: 400 };
  const row = await authModel.findById(userId);
  if (!row) return { error: 'Kullanıcı bulunamadı', status: 404 };

  const url = file.publicUrl || `/uploads/${path.basename(file.filename || file.path || '')}`;
  if (row.avatar_url && row.avatar_url !== url) {
    try { await deleteStoredImage(row.avatar_url); } catch { /* ignore */ }
  }
  await authModel.updateAvatarUrl(userId, url);
  return {
    status: 200,
    message: 'Profil fotoğrafı güncellendi.',
    pending: false,
    user: await sanitizeUser(await findUserById(userId)),
  };
}

async function resendVerification(userId) {
  const row = await authModel.findById(userId);
  if (!row) return { error: 'Kullanıcı bulunamadı', status: 404 };
  if (row.email_verified) return { error: 'E-posta zaten doğrulanmış', status: 400 };
  const verifyToken = crypto.randomBytes(24).toString('hex');
  await authModel.updateVerification(userId, verifyToken);
  const verifyUrl = `${siteBase()}/verify-email?token=${verifyToken}`;
  try {
    const sent = await mailer.sendVerificationEmail(row.email, verifyUrl);
    if (!sent) {
      return { error: 'E-posta servisi yapılandırılmamış. SMTP_HOST / SMTP_USER / SMTP_PASS kontrol edin.', status: 503 };
    }
  } catch (e) {
    logger.warn({ msg: 'Verification resend failed', email: row.email, err: e.message });
    return { error: 'Doğrulama e-postası gönderilemedi', status: 500 };
  }
  return { status: 200, message: 'Doğrulama e-postası gönderildi' };
}

async function getDashboard(userId, lang = 'tr') {
  const row = await authModel.findById(userId);
  if (!row) return { error: 'Kullanıcı bulunamadı', status: 404 };
  const { db } = require('../../db');
  const { badgesForUser } = require('../../lib/tiola-badges');
  const placesService = require('../places/places.service');
  const { getStatsMap } = require('../../lib/stats-cache');

  const badgePayload = await badgesForUser(userId, lang === 'en' ? 'en' : 'tr');
  const statsMap = await getStatsMap();

  const tiolaRows = await db.prepare(`
    SELECT t.id, t.text, t.stars, t.place_id, t.created_at, t.status,
           p.name AS place_name, p.country AS place_country
    FROM tiolas t
    LEFT JOIN places p ON p.id = t.place_id
    WHERE t.user_id = ? AND t.parent_id IS NULL AND t.status != 'deleted'
    ORDER BY t.created_at DESC
    LIMIT 50
  `).all(userId);

  const savedRows = await db.prepare(`
    SELECT p.* FROM saved_places sp
    JOIN places p ON p.id = sp.place_id
    WHERE sp.user_id = ?
    ORDER BY sp.created_at DESC
  `).all(userId);

  const visitedRows = await db.prepare(`
    SELECT p.*, vp.visited_at FROM visited_places vp
    JOIN places p ON p.id = vp.place_id
    WHERE vp.user_id = ?
    ORDER BY vp.visited_at DESC
  `).all(userId);

  const countries = [];
  const seenCountry = new Set();
  for (const r of visitedRows) {
    const name = String(r.country || '').trim();
    if (!name || seenCountry.has(name.toLowerCase())) continue;
    seenCountry.add(name.toLowerCase());
    countries.push(name);
  }

  return {
    status: 200,
    user: await sanitizeUser(row),
    tiolas: tiolaRows.map((t) => ({
      id: t.id,
      text: t.text,
      stars: t.stars,
      placeId: t.place_id,
      placeName: t.place_name,
      country: t.place_country,
      createdAt: t.created_at,
      status: t.status,
    })),
    favorites: savedRows.map((r) => placesService.mapPlace(r, statsMap)),
    visited: visitedRows.map((r) => ({
      ...placesService.mapPlace(r, statsMap),
      visitedAt: r.visited_at,
    })),
    visitedStats: {
      totalVisited: visitedRows.length,
      countriesVisited: countries.length,
      countries,
    },
    badges: badgePayload.badges,
    earnedBadges: badgePayload.earned,
    nextBadge: badgePayload.next,
    tiolaCount: badgePayload.tiolaCount,
  };
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
  getDashboard,
};
