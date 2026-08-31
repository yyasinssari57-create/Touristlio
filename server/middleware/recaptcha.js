const logger = require('../lib/logger');

const VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';

function recaptchaConfig() {
  const siteKey = String(process.env.RECAPTCHA_SITE_KEY || '').trim();
  const secret = String(process.env.RECAPTCHA_SECRET || '').trim();
  return {
    siteKey,
    secret,
    enabled: Boolean(siteKey && secret),
    minScore: Number(process.env.RECAPTCHA_MIN_SCORE) || 0.5,
  };
}

function publicRecaptchaConfig() {
  const cfg = recaptchaConfig();
  return {
    recaptchaEnabled: cfg.enabled,
    recaptchaSiteKey: cfg.enabled ? cfg.siteKey : '',
  };
}

async function verifyToken(token, ip) {
  const { secret } = recaptchaConfig();
  const body = new URLSearchParams({
    secret,
    response: String(token || ''),
  });
  if (ip) body.set('remoteip', String(ip));
  const res = await fetch(VERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new Error(`reCAPTCHA HTTP ${res.status}`);
  }
  return res.json();
}

function tokenFromRequest(req) {
  const body = req.body || {};
  return body.recaptchaToken
    || body['g-recaptcha-response']
    || req.headers['x-recaptcha-token']
    || '';
}

/**
 * Invisible reCAPTCHA v3. Skips when SITE_KEY or SECRET is missing
 * so local/dev forms keep working; production can enable via env.
 */
function recaptchaGuard(expectedAction) {
  return async function recaptchaMiddleware(req, res, next) {
    const cfg = recaptchaConfig();
    if (!cfg.enabled) {
      req.recaptcha = { skipped: true };
      return next();
    }
    const token = tokenFromRequest(req);
    if (!token) {
      return res.status(400).json({ error: 'Güvenlik doğrulaması başarısız. Lütfen tekrar deneyin.' });
    }
    try {
      const result = await verifyToken(token, req.ip);
      const score = typeof result.score === 'number' ? result.score : 1;
      const actionOk = !expectedAction || !result.action || result.action === expectedAction;
      if (!result.success || score < cfg.minScore || !actionOk) {
        logger.warn({
          msg: 'reCAPTCHA rejected',
          success: result.success,
          score,
          action: result.action,
          expectedAction,
        });
        return res.status(400).json({ error: 'Güvenlik doğrulaması başarısız. Lütfen tekrar deneyin.' });
      }
      req.recaptcha = result;
      return next();
    } catch (err) {
      logger.error({ msg: 'reCAPTCHA verify failed', err: err.message });
      return res.status(503).json({ error: 'Güvenlik doğrulaması geçici olarak kullanılamıyor.' });
    }
  };
}

module.exports = {
  recaptchaConfig,
  publicRecaptchaConfig,
  recaptchaGuard,
  tokenFromRequest,
};
