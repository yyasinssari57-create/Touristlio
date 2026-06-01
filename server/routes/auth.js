const express = require('express');
const { createUser, findUserByEmail, comparePassword, sanitizeUser, signToken } = require('../auth');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

router.post('/register', (req, res) => {
  const { name, email, password, kvkkAccepted } = req.body || {};
  if (!name?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: 'Ad, e-posta ve şifre gerekli' });
  }
  if (!kvkkAccepted) {
    return res.status(400).json({ error: 'KVKK onayı zorunludur' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Şifre en az 8 karakter olmalı' });
  }
  if (findUserByEmail(email)) {
    return res.status(409).json({ error: 'Bu e-posta zaten kayıtlı' });
  }
  const user = createUser({ name, email, password, role: 'member' });
  const token = signToken(user);
  res.status(201).json({ user: sanitizeUser(user), token });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'E-posta ve şifre gerekli' });
  }
  const row = findUserByEmail(email);
  if (!row || !comparePassword(password, row.password_hash)) {
    return res.status(401).json({ error: 'E-posta veya şifre hatalı' });
  }
  res.json({ user: sanitizeUser(row), token: signToken(row) });
});

router.get('/me', authRequired, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
