/** Form / user-content sanitization: strip HTML/XSS, cap length, validate email. */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function decodeBasicEntities(value) {
  return String(value)
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&#x0*27;/gi, "'")
    .replace(/&amp;/gi, '&');
}

function stripHtml(value) {
  let out = String(value == null ? '' : value);
  for (let i = 0; i < 3; i += 1) {
    const next = decodeBasicEntities(out);
    if (next === out) break;
    out = next;
  }
  out = out.replace(/<(script|style|iframe|object|embed|link|meta|svg|math|form)[\s\S]*?<\/\1>/gi, '');
  out = out.replace(/<\/?[a-zA-Z][^>]*>/g, '');
  out = out.replace(/javascript\s*:/gi, '');
  out = out.replace(/vbscript\s*:/gi, '');
  out = out.replace(/data\s*:\s*text\/html/gi, '');
  out = out.replace(/on[a-z]+\s*=/gi, '');
  return out;
}

/**
 * Strip control chars and HTML/XSS payloads; trim; cap length.
 * Does not HTML-entity-encode (callers escape on render to avoid double-encoding).
 */
function sanitizeText(value, maxLen = 5000) {
  if (value == null) return '';
  return stripHtml(String(value))
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
    .slice(0, maxLen);
}

function sanitizeName(value, maxLen = 200) {
  return sanitizeText(value, maxLen);
}

function isValidEmail(value) {
  const email = String(value || '').trim();
  if (!email || email.length > 200) return false;
  if (email.includes('<') || email.includes('>')) return false;
  return EMAIL_RE.test(email);
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const { fail } = require('./apiResponse');

function parsePositiveInt(raw, res, label = 'id') {
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 1) {
    if (res) fail(res, `Geçersiz ${label}`);
    return null;
  }
  return n;
}

module.exports = {
  EMAIL_RE,
  sanitizeText,
  sanitizeName,
  isValidEmail,
  escapeHtml,
  stripHtml,
  parsePositiveInt,
};
