/**
 * Path for request logs — never include query strings (tokens, codes, keys).
 */
function requestLogPath(req) {
  const raw = String((req && (req.originalUrl || req.url)) || '');
  const q = raw.indexOf('?');
  const pathOnly = (q === -1 ? raw : raw.slice(0, q)) || '/';
  return pathOnly;
}

module.exports = { requestLogPath };
