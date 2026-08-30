const express = require('express');
const { body, validationResult } = require('express-validator');
const { db } = require('../db');
const { sanitizeName, sanitizeText } = require('../lib/sanitize');
const { sendContactFormEmail, isConfigured } = require('../lib/mailer');
const { contactLimiter } = require('../middleware/rateLimit');
const logger = require('../lib/logger');

const router = express.Router();

router.post('/', contactLimiter, [
  body('name').trim().isLength({ min: 2, max: 120 }).withMessage('Ad soyad en az 2 karakter olmalı'),
  body('email').trim().isEmail().withMessage('Geçerli bir e-posta girin').isLength({ max: 200 }),
  body('subject').trim().isLength({ min: 3, max: 200 }).withMessage('Konu en az 3 karakter olmalı'),
  body('message').trim().isLength({ min: 10, max: 4000 }).withMessage('Mesaj en az 10 karakter olmalı'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }

  const name = sanitizeName(req.body.name, 120);
  const email = sanitizeText(req.body.email, 200).toLowerCase();
  const subject = sanitizeText(req.body.subject, 200);
  const message = sanitizeText(req.body.message, 4000);

  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: 'Tüm alanları doldurun' });
  }

  try {
    db.prepare(`
      INSERT INTO contact_messages (name, email, subject, message, ip)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, email, subject, message, req.ip || null);
  } catch (err) {
    logger.error({ msg: 'Contact insert failed', err: err.message });
    return res.status(500).json({ error: 'Mesaj kaydedilemedi. Lütfen daha sonra deneyin.' });
  }

  try {
    await sendContactFormEmail({ name, email, subject, message });
  } catch (err) {
    logger.error({ msg: 'Contact email failed', err: err.message });
  }

  const emailed = isConfigured();
  return res.json({
    ok: true,
    message: emailed
      ? 'Mesajınız gönderildi. En kısa sürede dönüş yapacağız.'
      : 'Mesajınız kaydedildi. En kısa sürede dönüş yapacağız.',
  });
});

module.exports = router;
