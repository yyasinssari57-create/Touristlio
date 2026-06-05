/** Strip control chars and trim; cap length for text fields. */
function sanitizeText(value, maxLen = 5000) {
  if (value == null) return '';
  return String(value)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
    .slice(0, maxLen);
}

function sanitizeName(value, maxLen = 200) {
  return sanitizeText(value, maxLen);
}

function parsePositiveInt(raw, res, label = 'id') {
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 1) {
    if (res) res.status(400).json({ error: `Geçersiz ${label}` });
    return null;
  }
  return n;
}

module.exports = { sanitizeText, sanitizeName, parsePositiveInt };
