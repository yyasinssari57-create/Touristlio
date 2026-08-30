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

  if (mailer.isConfigured()) {
    logger.info({ msg: 'SMTP configured for transactional email' });
  }
}

module.exports = { validateProductionEnv };
