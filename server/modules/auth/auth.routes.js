const express = require('express');
const { body } = require('express-validator');
const { authRequired } = require('../../middleware/auth');
const { authLimiter } = require('../../middleware/rateLimit');
const controller = require('./auth.controller');

const router = express.Router();

const passwordRules = () =>
  body('password')
    .isLength({ min: 8 }).withMessage('Şifre en az 8 karakter olmalı')
    .matches(/[A-Z]/).withMessage('Şifre en az bir büyük harf içermeli')
    .matches(/[0-9]/).withMessage('Şifre en az bir rakam içermeli');

router.post('/register', authLimiter, [
  body('name').trim().isLength({ min: 2 }).withMessage('Ad en az 2 karakter olmalı'),
  body('email').trim().isEmail().withMessage('Geçerli e-posta girin'),
  passwordRules(),
  body('kvkkAccepted').custom((v) => {
    if (v === true || v === 'true') return true;
    throw new Error('KVKK onayı zorunludur');
  }),
], controller.register);

router.post('/login', authLimiter, [
  body('email').trim().isEmail().withMessage('Geçerli e-posta girin'),
  body('password').notEmpty().withMessage('Şifre gerekli'),
], controller.login);

router.post('/logout', controller.logout);
router.get('/me', authRequired, controller.me);

router.post('/forgot-password', authLimiter, [
  body('email').trim().isEmail().withMessage('Geçerli e-posta girin'),
], controller.forgotPassword);

router.post('/reset-password', authLimiter, [
  body('token').notEmpty().withMessage('Token gerekli'),
  passwordRules(),
], controller.resetPassword);

router.post('/verify-email', authLimiter, [
  body('token').notEmpty().withMessage('Token gerekli'),
], controller.verifyEmail);

module.exports = router;
