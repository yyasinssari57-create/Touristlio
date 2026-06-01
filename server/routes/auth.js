const express = require('express');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const { createUser, findUserByEmail, comparePassword, sanitizeUser, signToken, hashPassword } = require('../auth');
const { authRequired } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');
const { db } = require('../db');
const logger = require('../lib/logger');

const router = express.Router();
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000,
  path: '/',
};

function setAuthCookie(res, token) {
  res.cookie('tl_token', token, COOKIE_OPTS);
}

function clearAuthCookie(res) {
  res.clearCookie('tl_token', { path: '/' });
}

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: errors.array()[0].msg });
    return false;
  }
  return true;
}

function isLocked(row) {
  if (!row?.locked_until) return false;
  return new Date(row.locked_until + 'Z') > new Date();
}

function recordFailedLogin(row) {
  const count = (row.failed_login_count || 0) + 1;
  if (count >= MAX_FAILED) {
    const until = new Date(Date.now() + LOCK_MINUTES * 60000).toISOString().slice(0, 19).replace('T', ' ');
    db.prepare('UPDATE users SET failed_login_count = ?, locked_until = ? WHERE id = ?').run(count, until, row.id);
  } else {
    db.prepare('UPDATE users SET failed_login_count = ? WHERE id = ?').run(count, row.id);
  }
}

function clearFailedLogin(userId) {
  db.prepare('UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = ?').run(userId);
}

router.post('/register', authLimiter, [
  body('name').trim().isLength({ min: 2 }).withMessage('Ad en az 2 karakter olmalı'),
  body('email').trim().isEmail().withMessage('Geçerli e-posta girin'),
  body('password').isLength({ min: 8 }).withMessage('Şifre en az 8 karakter olmalı'),
  body('kvkkAccepted').custom((v) => {
    if (v === true || v === 'true') return true;
    throw new Error('KVKK onayı zorunludur');
  }),
], (req, res) => {
  if (!handleValidation(req, res)) return;
  const { name, email, password } = req.body;
  if (findUserByEmail(email)) {
    return res.status(409).json({ error: 'Bu e-posta zaten kayıtlı' });
  }
  const verifyToken = crypto.randomBytes(24).toString('hex');
  const user = createUser({ name, email, password, role: 'member' });
  db.prepare('UPDATE users SET verification_token = ?, email_verified = 0 WHERE id = ?').run(verifyToken, user.id);
  logger.info({ msg: 'Email verification (stub)', email: user.email, token: verifyToken, url: `/verify-email?token=${verifyToken}` });
  const token = signToken(user);
  setAuthCookie(res, token);
  res.status(201).json({ user: sanitizeUser(user), token, emailVerificationSent: true });
});

router.post('/login', authLimiter, [
  body('email').trim().isEmail().withMessage('Geçerli e-posta girin'),
  body('password').notEmpty().withMessage('Şifre gerekli'),
], (req, res) => {
  if (!handleValidation(req, res)) return;
  const { email, password } = req.body;
  const row = findUserByEmail(email);
  if (!row) {
    return res.status(401).json({ error: 'E-posta veya şifre hatalı' });
  }
  if (isLocked(row)) {
    return res.status(423).json({ error: 'Çok fazla başarısız deneme. Lütfen daha sonra tekrar deneyin.' });
  }
  if (!comparePassword(password, row.password_hash)) {
    recordFailedLogin(row);
    return res.status(401).json({ error: 'E-posta veya şifre hatalı' });
  }
  clearFailedLogin(row.id);
  const token = signToken(row);
  setAuthCookie(res, token);
  res.json({ user: sanitizeUser(row), token });
});

router.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', authRequired, (req, res) => {
  res.json({ user: req.user });
});

router.post('/forgot-password', authLimiter, [
  body('email').trim().isEmail().withMessage('Geçerli e-posta girin'),
], (req, res) => {
  if (!handleValidation(req, res)) return;
  const row = findUserByEmail(req.body.email);
  if (row) {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000).toISOString().slice(0, 19).replace('T', ' ');
    db.prepare('INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)').run(row.id, token, expires);
    logger.info({ msg: 'Password reset (stub)', email: row.email, token, url: `/reset-password?token=${token}` });
  }
  res.json({ ok: true, message: 'E-posta kayıtlıysa sıfırlama bağlantısı gönderildi.' });
});

router.post('/reset-password', authLimiter, [
  body('token').notEmpty().withMessage('Token gerekli'),
  body('password').isLength({ min: 8 }).withMessage('Şifre en az 8 karakter olmalı'),
], (req, res) => {
  if (!handleValidation(req, res)) return;
  const { token, password } = req.body;
  const row = db.prepare(`
    SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0 AND expires_at > datetime('now')
  `).get(token);
  if (!row) return res.status(400).json({ error: 'Geçersiz veya süresi dolmuş token' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), row.user_id);
  db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE id = ?').run(row.id);
  clearFailedLogin(row.user_id);
  res.json({ ok: true, message: 'Şifre güncellendi' });
});

router.post('/verify-email', authLimiter, [
  body('token').notEmpty().withMessage('Token gerekli'),
], (req, res) => {
  if (!handleValidation(req, res)) return;
  const user = db.prepare('SELECT id FROM users WHERE verification_token = ?').get(req.body.token);
  if (!user) return res.status(400).json({ error: 'Geçersiz token' });
  db.prepare('UPDATE users SET email_verified = 1, verification_token = NULL WHERE id = ?').run(user.id);
  res.json({ ok: true, message: 'E-posta doğrulandı' });
});

module.exports = router;
