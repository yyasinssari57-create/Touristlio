const path = require('path');

const HTML_NO_CACHE = 'no-cache, no-store, must-revalidate';
const API_NO_STORE = 'no-store';
const VERSIONED_ASSET_CACHE = 'public, max-age=31536000, immutable';
const DAY_CACHE = 'public, max-age=86400';

function staticAssetHeaders(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.html') {
    res.setHeader('Cache-Control', HTML_NO_CACHE);
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return;
  }

  // JS/CSS are requested with ?v=__APP_VERSION__ — long cache is safe.
  if (ext === '.js' || ext === '.css') {
    res.setHeader('Cache-Control', VERSIONED_ASSET_CACHE);
    return;
  }

  // Unversioned brand images / fonts (hero.webp can change). 1 day, not 1 year.
  if (/\.(png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot)$/i.test(ext)) {
    res.setHeader('Cache-Control', DAY_CACHE);
  }
}

/** API JSON must not be cached by browsers or shared proxies. */
function apiNoStoreHeaders(_req, res, next) {
  res.setHeader('Cache-Control', API_NO_STORE);
  next();
}

module.exports = {
  staticAssetHeaders,
  apiNoStoreHeaders,
  HTML_NO_CACHE,
  API_NO_STORE,
  VERSIONED_ASSET_CACHE,
  DAY_CACHE,
};
