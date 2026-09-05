const path = require('path');

const HTML_NO_CACHE = 'no-cache, no-store, must-revalidate';
const API_NO_STORE = 'no-store';
const VERSIONED_ASSET_CACHE = 'public, max-age=31536000, immutable';
const DAY_CACHE = 'public, max-age=86400';
/** Narrow exception: public GET list/search/markers only. Mutations stay no-store. */
const PLACES_PUBLIC_GET_CACHE = 'public, max-age=30, stale-while-revalidate=120';

const PUBLIC_PLACES_GET_PATHS = [
  /^\/places\/?$/,
  /^\/places\/search\/?$/,
  /^\/places\/map\/markers\/?$/,
];

function requestPath(req) {
  const raw = String((req && (req.path || req.url)) || '');
  return raw.split('?')[0];
}

function isPublicPlacesListGet(req) {
  const method = String((req && req.method) || '').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return false;
  const p = requestPath(req);
  return PUBLIC_PLACES_GET_PATHS.some((re) => re.test(p));
}

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

/**
 * API JSON is no-store except successful public GET /api/places
 * list/search/markers. Mounted at `/api/` so req.path is `/places`, …
 * Auth, admin, saved, detail, POST/PATCH/DELETE stay no-store.
 * 4xx/5xx stay no-store so a brief outage is not cached.
 */
function apiNoStoreHeaders(req, res, next) {
  res.setHeader('Cache-Control', API_NO_STORE);
  if (!isPublicPlacesListGet(req)) return next();
  const prev = res.writeHead;
  res.writeHead = function writeHeadWithPlacesCache(statusCode, ...rest) {
    const code = typeof statusCode === 'number' ? statusCode : res.statusCode;
    if (code >= 200 && code < 400) {
      res.setHeader('Cache-Control', PLACES_PUBLIC_GET_CACHE);
    } else {
      res.setHeader('Cache-Control', API_NO_STORE);
    }
    return prev.call(this, statusCode, ...rest);
  };
  next();
}

module.exports = {
  staticAssetHeaders,
  apiNoStoreHeaders,
  isPublicPlacesListGet,
  HTML_NO_CACHE,
  API_NO_STORE,
  PLACES_PUBLIC_GET_CACHE,
  VERSIONED_ASSET_CACHE,
  DAY_CACHE,
};
