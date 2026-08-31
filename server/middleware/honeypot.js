const logger = require('../lib/logger');

const HONEYPOT_FIELDS = ['website', 'url', 'homepage'];

function honeypotValue(body) {
  const src = body || {};
  for (const field of HONEYPOT_FIELDS) {
    if (src[field] == null) continue;
    if (String(src[field]).trim() !== '') return String(src[field]).trim();
  }
  return '';
}

function isHoneypotFilled(body) {
  return honeypotValue(body) !== '';
}

/**
 * Hidden field bots tend to fill. Real users never see it.
 * fakeSuccess: JSON body to return (no side effects). Default 400.
 */
function honeypotGuard(fakeSuccess) {
  return function honeypotMiddleware(req, res, next) {
    if (!isHoneypotFilled(req.body)) return next();
    logger.info({ msg: 'form honeypot tripped', ip: req.ip, path: req.originalUrl });
    if (fakeSuccess) {
      return res.status(200).json(fakeSuccess);
    }
    return res.status(400).json({ error: 'Geçersiz istek' });
  };
}

module.exports = {
  HONEYPOT_FIELDS,
  honeypotValue,
  isHoneypotFilled,
  honeypotGuard,
};
