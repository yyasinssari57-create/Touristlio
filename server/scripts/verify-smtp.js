#!/usr/bin/env node
/**
 * SMTP bağlantısını doğrular — .env içindeki SMTP_* değişkenlerini kullanır.
 * Kullanım: npm run verify:smtp
 */
require('dotenv').config();
const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

function fail(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
  fail('SMTP_HOST, SMTP_USER ve SMTP_PASS .env dosyasında tanımlı olmalı.');
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
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
