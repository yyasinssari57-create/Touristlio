const nodemailer = require('nodemailer');
const logger = require('./logger');

let transporter = null;
let transporterKey = '';
let lastMailError = null;

function setLastMailError(err, extra) {
  const code = err?.code ? `[${err.code}] ` : '';
  const port = extra?.port != null ? ` port=${extra.port}` : '';
  lastMailError = `${code}${err?.message || String(err)}${port}`.slice(0, 300);
}

function getLastMailError() {
  return lastMailError;
}

function trimEnv(value) {
  return String(value || '').trim().replace(/^['"]|['"]$/g, '');
}

function looksPlaceholder(value) {
  const v = String(value || '').trim();
  if (!v) return true;
  return /^(your-brevo|changeme|placeholder|smtp-key-here|şifre|password-here|TODO)/i.test(v)
    || /example\.com/i.test(v)
    || /your-brevo-login|your-brevo-smtp-key/i.test(v);
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
  const api = brevoApiKey();
  if (api) {
    return { configured: true, reason: null, host: 'api.brevo.com', port: 443, transport: 'brevo-api' };
  }
  if (!cfg.host || !cfg.user || !cfg.pass) {
    return { configured: false, reason: 'missing', host: cfg.host || '', port: cfg.port, transport: 'none' };
  }
  if (looksPlaceholder(cfg.host) || looksPlaceholder(cfg.user) || looksPlaceholder(cfg.pass)) {
    return { configured: false, reason: 'placeholder', host: cfg.host, port: cfg.port, transport: 'none' };
  }
  return { configured: true, reason: null, host: cfg.host, port: cfg.port, transport: 'smtp' };
}

function isConfigured() {
  return smtpStatus().configured;
}

function brevoApiKey() {
  const explicit = trimEnv(process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY);
  if (explicit && !looksPlaceholder(explicit)) return explicit;
  const pass = smtpEnv().pass;
  if (/^xkeysib-/i.test(pass)) return pass;
  return '';
}

function isConnError(err) {
  const blob = `${err?.code || ''} ${err?.message || ''} ${err?.command || ''}`;
  return /ETIMEDOUT|ECONNREFUSED|ECONNRESET|ESOCKET|ECONNECTION|ENOTFOUND|EHOSTUNREACH|ENETUNREACH|Greeting never received|Connection timeout|timeout/i.test(blob);
}

function createTransporter(port) {
  const cfg = smtpEnv();
  const p = Number(port) || cfg.port;
  return nodemailer.createTransport({
    host: cfg.host,
    port: p,
    secure: p === 465,
    requireTLS: p === 587 || p === 2525,
    family: 4,
    auth: { user: cfg.user, pass: cfg.pass },
    connectionTimeout: 12000,
    greetingTimeout: 12000,
    socketTimeout: 20000,
  });
}

function getTransporter() {
  const status = smtpStatus();
  if (!status.configured || status.transport === 'brevo-api') return null;
  const cfg = smtpEnv();
  const key = `${cfg.host}:${cfg.port}:${cfg.user}:${cfg.pass.length}`;
  if (transporter && transporterKey === key) return transporter;
  transporter = createTransporter(cfg.port);
  transporterKey = key;
  return transporter;
}

async function sendViaBrevoApi(message) {
  const key = brevoApiKey();
  if (!key) return false;
  const cfg = smtpEnv();
  const payload = {
    sender: { name: 'Touristlio', email: cfg.from },
    to: [{ email: message.to }],
    subject: message.subject,
    htmlContent: message.html || undefined,
    textContent: message.text || undefined,
  };
  if (message.replyTo) payload.replyTo = { email: message.replyTo };
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': key,
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`Brevo API ${res.status}: ${text.slice(0, 180)}`);
    err.status = res.status;
    throw err;
  }
  logger.info({ msg: 'Email sent via Brevo HTTP API', to: message.to, subject: message.subject });
  return true;
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
  const cfg = smtpEnv();
  const status = smtpStatus();
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

  if (brevoApiKey()) {
    try {
      await sendViaBrevoApi(message);
      lastMailError = null;
      return true;
    } catch (err) {
      setLastMailError(err, { port: 443 });
      logger.warn({ msg: 'Brevo HTTP send failed', to, subject, err: err.message });
      if (!cfg.host || !cfg.user || !cfg.pass || looksPlaceholder(cfg.pass)) {
        throw err;
      }
      logger.warn({ msg: 'Falling back to SMTP after Brevo HTTP failure' });
    }
  }

  if (!status.configured && !cfg.host) {
    logger.info({
      msg: 'Email skipped (SMTP not configured)',
      to,
      subject,
      reason: status.reason || 'missing',
    });
    return false;
  }
  if (!cfg.host || !cfg.user || !cfg.pass || looksPlaceholder(cfg.user) || looksPlaceholder(cfg.pass)) {
    logger.info({
      msg: 'Email skipped (SMTP not configured)',
      to,
      subject,
      reason: status.reason || 'missing',
    });
    return false;
  }

  const ports = [...new Set([cfg.port, 2525, 587, 465].filter((p) => Number(p) > 0))];
  let lastErr = null;
  for (const port of ports) {
    try {
      const tx = createTransporter(port);
      await tx.sendMail(message);
      lastMailError = null;
      logger.info({ msg: 'Email sent', to, subject, port });
      return true;
    } catch (err) {
      lastErr = err;
      setLastMailError(err, { port });
      logger.warn({
        msg: 'SMTP send failed',
        to,
        subject,
        port,
        code: err.code,
        command: err.command,
        err: err.message,
      });
      if (!isConnError(err)) {
        const hint = /535|auth/i.test(String(err.message || ''))
          ? ' Check SMTP_USER/SMTP_PASS (Brevo SMTP key, not API key) and that SMTP_FROM is a verified sender.'
          : /550|sender|unrecognised|verified/i.test(String(err.message || ''))
            ? ' SMTP_FROM must be a verified sender in Brevo (Settings → Senders).'
            : '';
        const wrapped = new Error(`${err.message}${hint}`);
        wrapped.cause = err;
        throw wrapped;
      }
    }
  }
  const wrapped = new Error(
    lastErr?.message
      ? `${lastErr.message} (SMTP ports blocked or unreachable; tried ${ports.join(', ')})`
      : 'SMTP send failed',
  );
  wrapped.cause = lastErr;
  throw wrapped;
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
  getLastMailError,
  isConnError,
  sendMail,
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendTiolaRejectionEmail,
  sendBlogRejectionEmail,
  sendAdminMessageEmail,
  sendContactFormEmail,
};
