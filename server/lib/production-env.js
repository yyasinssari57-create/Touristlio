const mailer = require('./mailer');
const logger = require('./logger');

function validateProductionEnv() {
  if (process.env.NODE_ENV !== 'production') return;

  const cors = process.env.CORS_ORIGIN || '';
  if (!cors || cors.includes('localhost')) {
    logger.warn({
      msg: 'Production: CORS_ORIGIN should be your live domain (e.g. https://www.touristlio.com)',
    });
  }

  if (process.env.REQUIRE_EMAIL_VERIFICATION === 'true' && !mailer.isConfigured()) {
    logger.warn({
      msg: 'Production: REQUIRE_EMAIL_VERIFICATION=true but SMTP is not configured — verification emails will not be sent',
    });
  }

  if (!String(process.env.REDIS_URL || process.env.RATE_LIMIT_REDIS_URL || '').trim()) {
    logger.warn({
      msg: 'Production: REDIS_URL not set — Tiola vote limiter uses in-process memory (resets on restart, not shared across instances). Set REDIS_URL for Redis-backed 5/min limits.',
    });
  }

  if (mailer.isConfigured()) {
    logger.info({ msg: 'SMTP configured for transactional email' });
  }

  const siteKey = String(process.env.RECAPTCHA_SITE_KEY || '').trim();
  const secret = String(process.env.RECAPTCHA_SECRET || '').trim();
  if (!siteKey || !secret) {
    logger.warn({
      msg: 'Production: RECAPTCHA_SITE_KEY / RECAPTCHA_SECRET not set — forms work without reCAPTCHA v3. Set both in env to enable invisible v3.',
    });
  }

  const { gaMeasurementId, googleSiteVerification } = require('./analytics-config');
  if (!gaMeasurementId()) {
    logger.warn({
      msg: 'Production: GA_MEASUREMENT_ID not set — GA4 stays off. First-party visit analytics still run after cookie consent. Set GA_MEASUREMENT_ID (G-XXXXXXXX) to enable GA4.',
    });
  }
  if (!googleSiteVerification()) {
    logger.warn({
      msg: 'Production: GOOGLE_SITE_VERIFICATION not set — Search Console HTML tag is not injected. Paste the token from Search Console → URL prefix verification.',
    });
  }
}

module.exports = { validateProductionEnv };
