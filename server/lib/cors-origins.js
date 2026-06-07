/**
 * Parse CORS_ORIGIN (comma-separated) and auto-include www/apex pairs
 * so https://touristlio.com also allows https://www.touristlio.com.
 */
function parseCorsOrigins(raw) {
  const origins = (raw || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const expanded = new Set(origins);
  for (const origin of origins) {
    if (origin === '*') continue;
    try {
      const url = new URL(origin);
      const portSuffix = url.port ? `:${url.port}` : '';
      const base = `${url.protocol}//`;
      if (url.hostname.startsWith('www.')) {
        expanded.add(`${base}${url.hostname.slice(4)}${portSuffix}`);
      } else if (
        url.hostname !== 'localhost'
        && !/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)
        && !url.hostname.endsWith('.localhost')
      ) {
        expanded.add(`${base}www.${url.hostname}${portSuffix}`);
      }
    } catch {
      /* ignore invalid origin */
    }
  }
  return [...expanded];
}

module.exports = { parseCorsOrigins };
