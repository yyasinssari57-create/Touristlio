/** Public analytics config: GA4 + Search Console (DÜŞÜK-6). Measurement IDs are not secrets. */

const WEB_VITALS_PACKAGE = 'web-vitals';
const GA_ID_RE = /^G-[A-Z0-9]{4,20}$/i;
const GSC_TOKEN_RE = /^[A-Za-z0-9_-]{8,128}$/;

const GA_CSP = [
  'https://www.googletagmanager.com',
  'https://www.google-analytics.com',
  'https://*.google-analytics.com',
  'https://*.analytics.google.com',
  'https://*.googletagmanager.com',
];

function gaMeasurementId() {
  const id = String(process.env.GA_MEASUREMENT_ID || '').trim();
  return GA_ID_RE.test(id) ? id : '';
}

function googleSiteVerification() {
  const token = String(process.env.GOOGLE_SITE_VERIFICATION || '').trim();
  return GSC_TOKEN_RE.test(token) ? token : '';
}

function publicAnalyticsConfig() {
  const id = gaMeasurementId();
  return {
    gaEnabled: Boolean(id),
    gaMeasurementId: id,
  };
}

function gaCspSources() {
  return gaMeasurementId() ? GA_CSP.slice() : [];
}

module.exports = {
  WEB_VITALS_PACKAGE,
  GA_ID_RE,
  GSC_TOKEN_RE,
  gaMeasurementId,
  googleSiteVerification,
  publicAnalyticsConfig,
  gaCspSources,
};
