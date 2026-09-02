#!/usr/bin/env node
/**
 * SMTP bağlantısını doğrular — .env içindeki SMTP_* değişkenlerini kullanır.
 * Kullanım: npm run verify:smtp
 */
require('dotenv').config();
const nodemailer = require('nodemailer');
const { smtpStatus, looksPlaceholder } = require('../lib/mailer');

function fail(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

const status = smtpStatus();
if (!status.configured) {
  if (status.reason === 'placeholder') {
    fail(
      'SMTP_USER / SMTP_PASS hâlâ örnek değer (your-brevo-…). '
      + 'Brevo → SMTP & API → SMTP anahtarı oluşturup .env / Render Environment’a yazın. API anahtarı değil.',
    );
  }
  fail('SMTP_HOST, SMTP_USER ve SMTP_PASS .env dosyasında tanımlı olmalı.');
}

const SMTP_HOST = String(process.env.SMTP_HOST || '').trim();
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_USER = String(process.env.SMTP_USER || '').trim();
const SMTP_PASS = String(process.env.SMTP_PASS || '').trim().replace(/^['"]|['"]$/g, '');

if (looksPlaceholder(SMTP_USER) || looksPlaceholder(SMTP_PASS)) {
  fail('SMTP bilgileri örnek/placeholder. Gerçek Brevo SMTP anahtarı gerekli.');
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  requireTLS: SMTP_PORT === 587,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});

(async () => {
  try {
    await transporter.verify();
    console.log('\n✓ SMTP bağlantısı başarılı');
    console.log(`  Host: ${SMTP_HOST}:${SMTP_PORT}`);
    console.log(`  User: ${SMTP_USER}`);
    console.log(`  From: ${process.env.SMTP_FROM || 'touristlio.info@gmail.com'}\n`);
  } catch (err) {
    fail(`SMTP doğrulama başarısız: ${err.message}`);
  }
})();
