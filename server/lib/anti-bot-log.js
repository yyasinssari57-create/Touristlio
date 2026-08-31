/**
 * Structured log for abnormal Tiola vote / review behaviour (ORTA-4).
 * Does not write exploits or payloads — only defensive signals.
 */
const logger = require('./logger');

function clientIp(req) {
  return req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null;
}

function userAgent(req) {
  const raw = String(req.get?.('user-agent') || req.headers?.['user-agent'] || '');
  return raw.slice(0, 180);
}

/**
 * @param {object} opts
 * @param {string} opts.kind  rate_limit | duplicate_vote | csrf_fail | spam_tiola | store_error
 * @param {import('express').Request} [opts.req]
 * @param {number|string} [opts.userId]
 * @param {object} [opts.extra]
 */
function logAbnormal({ kind, req, userId, extra } = {}) {
  const payload = {
    event: 'anti_bot',
    kind: String(kind || 'unknown'),
    userId: userId != null ? Number(userId) || userId : (req?.user?.id || null),
    ip: req ? clientIp(req) : null,
    path: req ? (req.originalUrl || req.path || '') : null,
    method: req ? req.method : null,
    ua: req ? userAgent(req) : null,
    ...(extra && typeof extra === 'object' ? extra : {}),
  };
  logger.warn(payload);
  return payload;
}

module.exports = { logAbnormal, clientIp };
