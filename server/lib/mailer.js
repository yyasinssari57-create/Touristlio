const nodemailer = require('nodemailer');
const logger = require('./logger');

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || 'noreply@touristlio.com';

let transporter = null;

function isConfigured() {
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

function getTransporter() {
  if (!isConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transporter;
}

async function sendMail({ to, subject, text, html }) {
  const tx = getTransporter();
  if (!tx) {
    logger.info({ msg: 'Email skipped (SMTP not configured)', to, subject });
    return false;
  }
  await tx.sendMail({ from: SMTP_FROM, to, subject, text, html });
  logger.info({ msg: 'Email sent', to, subject });
  return true;
}

async function sendPasswordResetEmail(email, resetUrl) {
  return sendMail({
    to: email,
    subject: 'Touristlio — Şifre sıfırlama',
    text: `Şifrenizi sıfırlamak için: ${resetUrl}`,
    html: `<p>Şifrenizi sıfırlamak için <a href="${resetUrl}">buraya tıklayın</a>.</p>`,
  });
}

async function sendVerificationEmail(email, verifyUrl) {
  return sendMail({
    to: email,
    subject: 'Touristlio — E-posta doğrulama',
    text: `Hesabınızı doğrulamak için: ${verifyUrl}`,
    html: `<p>Hesabınızı doğrulamak için <a href="${verifyUrl}">buraya tıklayın</a>.</p>`,
  });
}

module.exports = {
  isConfigured,
  sendMail,
  sendPasswordResetEmail,
  sendVerificationEmail,
};
