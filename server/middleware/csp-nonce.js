/**
 * v2 KRİTİK-6: per-request CSP nonce.
 *
 * `script-src` drops 'unsafe-inline' and trusts `'nonce-<value>'` instead, so an
 * injected <script> tag cannot run without the current request's nonce.
 *
 * `script-src-attr` is `'none'`. Clicks/changes use data-act + bind-actions.js.
 */

const crypto = require('crypto');

function cspNonceMiddleware() {
  return (_req, res, next) => {
    res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
    next();
  };
}

function nonceFromRes(res) {
  return (res && res.locals && res.locals.cspNonce) || '';
}

/** Add the nonce to inline <script> blocks (including application/ld+json). */
function injectNonce(html, nonce) {
  if (!nonce) return html;
  return String(html).replace(/<script\b([^>]*)>/gi, (tag, attrs) => {
    if (/\bsrc\s*=/i.test(attrs)) return tag;
    if (/\bnonce\s*=/i.test(attrs)) return tag;
    return `<script${attrs} nonce="${nonce}">`;
  });
}

module.exports = { cspNonceMiddleware, nonceFromRes, injectNonce };
