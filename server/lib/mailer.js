const nodemailer = require('nodemailer');
const logger = require('./logger');

let transporter = null;
let transporterKey = '';

function trimEnv(value) {
  return String(value || '').trim().replace(/^['"]|['"]$/g, '');
}

function looksPlaceholder(value) {
  return /your-brevo|example\.com|changeme|placeholder|smtp-key-here|şifre|password-here|xxx+|TODO/i.test(String(value || ''));
}

function smtpEnv() {
  return {
    host: trimEnv(process.env.SMTP_HOST),
    port: Number(process.env.SMTP_PORT) || 587,
    user: trimEnv(process.env.SMTP_USER),
    pass: trimEnv(process.env.SMTP_PASS),
    from: trimEnv(process.env.SMTP_FROM) || 'touristlio.info@gmail.com',
  };
}

function smtpStatus() {
  const cfg = smtpEnv();
  if (!cfg.host || !cfg.user || !cfg.pass) {
    return { configured: false, reason: 'missing', host: cfg.host || '', port: cfg.port };
  }
  if (looksPlaceholder(cfg.host) || looksPlaceholder(cfg.user) || looksPlaceholder(cfg.pass)) {
    return { configured: false, reason: 'placeholder', host: cfg.host, port: cfg.port };
  }
  return { configured: true, reason: null, host: cfg.host, port: cfg.port };
}

function isConfigured() {
  return smtpStatus().configured;
}

function getTransporter() {
  const status = smtpStatus();
  if (!status.configured) return null;
  const cfg = smtpEnv();
  const key = `${cfg.host}:${cfg.port}:${cfg.user}:${cfg.pass.length}`;
  if (transporter && transporterKey === key) return transporter;
  transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    requireTLS: cfg.port === 587,
    auth: { user: cfg.user, pass: cfg.pass },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });
  transporterKey = key;
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

async function sendMail({ to, subject, text, html, replyTo }) {
  const tx = getTransporter();
  const cfg = smtpEnv();
  if (!tx) {
    const status = smtpStatus();
    logger.info({
      msg: 'Email skipped (SMTP not configured)',
      to,
      subject,
      reason: status.reason || 'missing',
    });
    return false;
  }
  const message = {
    from: `"Touristlio" <${cfg.from}>`,
    to,
    subject,
    text: text || '',
    html: html || undefined,
    encoding: 'utf-8',
  };
  if (replyTo) message.replyTo = replyTo;
  if (!message.text && message.html) {
    message.text = message.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  try {
    await tx.sendMail(message);
  } catch (err) {
    const hint = /535|auth/i.test(String(err.message || ''))
      ? ' Check SMTP_USER/SMTP_PASS (Brevo SMTP key, not API key) and that SMTP_FROM is a verified sender.'
      : '';
    logger.warn({ msg: 'Email send failed', to, subject, err: err.message });
    const wrapped = new Error(`${err.message}${hint}`);
    wrapped.cause = err;
    throw wrapped;
  }
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

async function sendAdminMessageEmail(email, { userName, subject, body, siteUrl }) {
  const safeName = userName || 'Gezgin';
  const safeSubject = subject || 'Touristlio';
  const safeBody = body || '';
  const text = [
    `Touristlio — ${safeSubject}`,
    '',
    `Merhaba ${safeName},`,
    '',
    safeBody,
    '',
    siteUrl ? `Site: ${siteUrl}` : '',
    '',
    'Touristlio ekibi',
  ].filter(Boolean).join('\n');
  const html = buildHtmlEmail({
    title: safeSubject,
    intro: `Merhaba ${safeName},\n\n${safeBody}`,
    actionLabel: 'Touristlio\'ya git',
    actionUrl: siteUrl || (process.env.SITE_URL || 'http://localhost:3000'),
  });
  return sendMail({
    to: email,
    subject: `Touristlio — ${safeSubject}`,
    text,
    html,
  });
}

async function sendContactFormEmail({ name, email, subject, message }) {
  const cfg = smtpEnv();
  const to = process.env.CONTACT_EMAIL || process.env.ADMIN_EMAIL || cfg.from;
  const safeName = String(name || '').slice(0, 120);
  const safeEmail = String(email || '').slice(0, 200);
  const safeSubject = String(subject || '').slice(0, 200);
  const safeMessage = String(message || '').slice(0, 4000);
  const text = [
    'Touristlio iletişim formu',
    '',
    `Ad: ${safeName}`,
    `E-posta: ${safeEmail}`,
    `Konu: ${safeSubject}`,
    '',
    safeMessage,
  ].join('\n');
  const html = `<pre style="font-family:Inter,Arial,sans-serif;white-space:pre-wrap">${escapeHtml(text)}</pre>`;
  return sendMail({
    to,
    replyTo: safeEmail,
    subject: `[İletişim] ${safeSubject}`,
    text,
    html,
  });
}

module.exports = {
  isConfigured,
  smtpStatus,
  looksPlaceholder,
  sendMail,
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendTiolaRejectionEmail,
  sendBlogRejectionEmail,
  sendAdminMessageEmail,
  sendContactFormEmail,
};
