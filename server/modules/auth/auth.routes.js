const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const { body } = require('express-validator');
const { authRequired } = require('../../middleware/auth');
const { authLimiter, formLimiter } = require('../../middleware/rateLimit');
const { fail } = require('../../lib/apiResponse');
const { isValidEmail, EMAIL_RE } = require('../../lib/sanitize');
const { recaptchaGuard } = require('../../middleware/recaptcha');
const { honeypotGuard } = require('../../middleware/honeypot');
const controller = require('./auth.controller');
const { imageFileFilter, validateUploadedImage } = require('../../lib/image-mime');
const { processImageUpload } = require('../../middleware/process-image-upload');
const { MIN_PASSWORD_LENGTH } = require('../../auth');

const uploadRoot = path.join(__dirname, '..', '..', '..', 'uploads');
if (!fs.existsSync(uploadRoot)) fs.mkdirSync(uploadRoot, { recursive: true });

const avatarStorage = multer.diskStorage({
  destination: uploadRoot,
  filename: (_req, _file, cb) => {
    cb(null, `avatar-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);
  },
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: imageFileFilter,
});

const router = express.Router();

const passwordRules = () =>
  body('password')
    .isLength({ min: MIN_PASSWORD_LENGTH }).withMessage(`Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalı`)
    .matches(/[A-Z]/).withMessage('Şifre en az bir büyük harf içermeli')
    .matches(/[0-9]/).withMessage('Şifre en az bir rakam içermeli');

const emailRule = (message = 'Geçerli e-posta girin') =>
  body('email').trim().custom((v) => {
    const email = String(v || '').trim();
    if (!isValidEmail(email) || !EMAIL_RE.test(email)) throw new Error(message);
    return true;
  });

router.post('/register', formLimiter, authLimiter, recaptchaGuard('register'), honeypotGuard(), [
  body('name').trim().isLength({ min: 2 }).withMessage('Ad en az 2 karakter olmalı'),
  emailRule(),
  passwordRules(),
  body('kvkkAccepted').custom((v) => {
    if (v === true || v === 'true') return true;
    throw new Error('KVKK onayı zorunludur');
  }),
], controller.register);

router.post('/login', authLimiter, recaptchaGuard('login'), [
  emailRule(),
  body('password').notEmpty().withMessage('Şifre gerekli'),
], controller.login);

router.post('/logout', controller.logout);
router.get('/me', controller.me);
router.get('/profile', authRequired, controller.profile);

router.post('/forgot-password', formLimiter, authLimiter, recaptchaGuard('forgot'), [
  emailRule(),
], controller.forgotPassword);

router.post('/reset-password', authLimiter, [
  body('token').notEmpty().withMessage('Token gerekli'),
  passwordRules(),
], controller.resetPassword);

router.post('/verify-email', authLimiter, [
  body('token').notEmpty().withMessage('Token gerekli'),
], controller.verifyEmail);

router.post('/change-password', authRequired, authLimiter, [
  body('currentPassword').notEmpty().withMessage('Mevcut şifre gerekli'),
  passwordRules(),
], controller.changePassword);

router.post('/change-email', authRequired, authLimiter, [
  emailRule(),
  body('password').notEmpty().withMessage('Şifre gerekli'),
], controller.changeEmail);

router.post('/resend-verification', authRequired, authLimiter, controller.resendVerification);

router.get('/avatar-options', controller.avatarOptions);
router.patch('/avatar', authRequired, [
  body('avatarPreset').notEmpty().withMessage('Avatar karakteri gerekli'),
  body('avatarColor').optional().matches(/^#[0-9a-fA-F]{6}$/).withMessage('Geçersiz renk'),
], controller.updateAvatarPreset);
router.post('/avatar-upload', authRequired, (req, res, next) => {
  avatarUpload.single('photo')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return fail(res, 'Dosya en fazla 3 MB olabilir', 400);
      return fail(res, err.message || 'Fotoğraf yüklenemedi', 400);
    }
    next();
  });
}, validateUploadedImage(), processImageUpload(), controller.updateAvatarPhoto);

module.exports = router;
