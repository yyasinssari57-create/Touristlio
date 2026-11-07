/**
 * Single source for public site base URL (canonical www).
 * Production never falls back to localhost.
 */
const logger = require('./logger');

const DEFAULT_PROD = 'https://www.touristlio.com';
const DEFAULT_DEV = 'http://localhost:3000';

let warnedMissingSiteUrl = false;

function defaultBase() {
  if (process.env.NODE_ENV === 'production') {
    if (!warnedMissingSiteUrl) {
      warnedMissingSiteUrl = true;
      logger.warn({
        msg: 'SITE_URL missing or invalid in production; using https://www.touristlio.com',
      });
    }
    return DEFAULT_PROD;
  }
  return DEFAULT_DEV;
}

function siteBaseUrl() {
  const raw = String(process.env.SITE_URL || '').trim();
  let base = raw ? raw.replace(/\/$/, '') : defaultBase();
  try {
    const u = new URL(base.includes('://') ? base : `https://${base}`);
    if (u.hostname === 'touristlio.com') u.hostname = 'www.touristlio.com';
    base = `${u.protocol}//${u.host}`;
  } catch {
    base = defaultBase();
  }
  return base.replace(/\/$/, '');
}

function siteOrigin() {
  try {
    return new URL(siteBaseUrl()).origin;
  } catch {
    return siteBaseUrl();
  }
}

module.exports = {
  siteBaseUrl,
  siteOrigin,
  DEFAULT_PROD,
  DEFAULT_DEV,
};
