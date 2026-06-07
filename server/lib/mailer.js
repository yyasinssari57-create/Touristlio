const nodemailer = require('nodemailer');
const logger = require('./logger');

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || 'touristlio.info@gmail.com';

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

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHtmlEmail({ title, intro, actionLabel, actionUrl, footer }) {
  const safeUrl = escapeHtml(actionUrl);
  const safeTitle = escapeHtml(title);
  const safeIntro = escapeHtml(intro);
  const safeLabel = escapeHtml(actionLabel);
  const safeFooter = escapeHtml(footer || 'Touristlio ekibi');
  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background:#f2f8ff;font-family:Inter,Arial,sans-serif;color:#0c2340;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2f8ff;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border-radius:16px;border:1px solid #dceeff;overflow:hidden;">
          <tr>
            <td style="padding:28px 28px 8px;font-size:22px;font-weight:700;color:#0c2340;">Touristlio</td>
          </tr>
          <tr>
            <td style="padding:8px 28px 16px;font-size:18px;font-weight:700;color:#0c2340;">${safeTitle}</td>
          </tr>
          <tr>
            <td style="padding:0 28px 20px;font-size:15px;line-height:1.6;color:#4a6580;">${safeIntro}</td>
          </tr>
          <tr>
            <td style="padding:0 28px 24px;">
              <a href="${safeUrl}" style="display:inline-block;background:#0ea5e9;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:999px;">${safeLabel}</a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 20px;font-size:13px;line-height:1.5;color:#8ba8c0;">Bağlantı çalışmıyorsa aşağıdaki adresi tarayıcınıza yapıştırın:<br/><span style="word-break:break-all;color:#0ea5e9;">${safeUrl}</span></td>
          </tr>
          <tr>
            <td style="padding:16px 28px 24px;border-top:1px solid #dceeff;font-size:12px;color:#8ba8c0;">${safeFooter}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendMail({ to, subject, text, html }) {
  const tx = getTransporter();
  if (!tx) {
    logger.info({ msg: 'Email skipped (SMTP not configured)', to, subject });
    return false;
  }
  const message = {
    from: `"Touristlio" <${SMTP_FROM}>`,
    to,
    subject,
    text: text || '',
    html: html || undefined,
    encoding: 'utf-8',
  };
  if (!message.text && message.html) {
    message.text = message.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  await tx.sendMail(message);
  logger.info({ msg: 'Email sent', to, subject });
  return true;
}

async function sendPasswordResetEmail(email, resetUrl) {
  const text = [
    'Touristlio — Şifre sıfırlama',
    '',
    'Şifrenizi sıfırlamak için aşağıdaki bağlantıyı açın:',
    resetUrl,
    '',
    'Bu isteği siz yapmadıysanız bu e-postayı yok sayabilirsiniz.',
    '',
    'Touristlio ekibi',
  ].join('\n');
  const html = buildHtmlEmail({
    title: 'Şifre sıfırlama',
    intro: 'Touristlio hesabınız için şifre sıfırlama talebi aldık. Yeni şifrenizi belirlemek için aşağıdaki düğmeye tıklayın. Bu isteği siz yapmadıysanız bu e-postayı yok sayabilirsiniz.',
    actionLabel: 'Şifremi sıfırla',
    actionUrl: resetUrl,
  });
  return sendMail({
    to: email,
    subject: 'Touristlio — Şifre sıfırlama',
    text,
    html,
  });
}

async function sendVerificationEmail(email, verifyUrl) {
  const text = [
    'Touristlio — E-posta doğrulama',
    '',
    'Touristlio\'ya hoş geldiniz! Hesabınızı etkinleştirmek için e-posta adresinizi doğrulamanız gerekiyor.',
    '',
    'Doğrulamak için aşağıdaki bağlantıyı açın:',
    verifyUrl,
    '',
    'Bağlantı 24 saat geçerlidir. Bu kaydı siz yapmadıysanız bu e-postayı yok sayabilirsiniz.',
    '',
    'Touristlio ekibi',
  ].join('\n');
  const html = buildHtmlEmail({
    title: 'E-posta adresinizi doğrulayın',
    intro: 'Touristlio\'ya hoş geldiniz! Hesabınızı etkinleştirmek ve Tiola yazmaya başlamak için e-posta adresinizi doğrulamanız gerekiyor.',
    actionLabel: 'E-postamı doğrula',
    actionUrl: verifyUrl,
  });
  return sendMail({
    to: email,
    subject: 'Touristlio — E-posta doğrulama',
    text,
    html,
  });
}

async function sendTiolaRejectionEmail(email, { userName, placeName, reason, profileUrl }) {
  const safeName = userName || 'Gezgin';
  const text = [
    'Touristlio — Tiola reddedildi',
    '',
    `Merhaba ${safeName},`,
    '',
    `"${placeName}" için gönderdiğiniz Tiola moderasyon ekibimiz tarafından reddedildi.`,
    '',
    'Red nedeni:',
    reason,
    '',
    'Profilinizden Tiola durumunuzu kontrol edebilirsiniz:',
    profileUrl,
    '',
    'Touristlio ekibi',
  ].join('\n');
  const html = buildHtmlEmail({
    title: 'Tiola reddedildi',
    intro: `Merhaba ${safeName}, "${placeName}" için gönderdiğiniz Tiola yayınlanmadı. Red nedeni: ${reason}`,
    actionLabel: 'Profilime git',
    actionUrl: profileUrl,
  });
  return sendMail({
    to: email,
    subject: 'Touristlio — Tiola reddedildi',
    text,
    html,
  });
}

async function sendBlogRejectionEmail(email, { userName, title, reason, profileUrl }) {
  const safeName = userName || 'Gezgin';
  const text = [
    'Touristlio — Blog reddedildi',
    '',
    `Merhaba ${safeName},`,
    '',
    `"${title}" başlıklı blog yazınız moderasyon ekibimiz tarafından reddedildi.`,
    '',
    'Red nedeni:',
    reason,
    '',
    'Profilinizden blog durumunuzu kontrol edebilirsiniz:',
    profileUrl,
    '',
    'Touristlio ekibi',
  ].join('\n');
  const html = buildHtmlEmail({
    title: 'Blog reddedildi',
    intro: `Merhaba ${safeName}, "${title}" başlıklı blog yazınız yayınlanmadı. Red nedeni: ${reason}`,
    actionLabel: 'Profilime git',
    actionUrl: profileUrl,
  });
  return sendMail({
    to: email,
    subject: 'Touristlio — Blog reddedildi',
    text,
    html,
  });
}

module.exports = {
  isConfigured,
  sendMail,
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendTiolaRejectionEmail,
  sendBlogRejectionEmail,
};
