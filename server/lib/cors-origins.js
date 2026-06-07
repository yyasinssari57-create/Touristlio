/**
 * Parse CORS_ORIGIN (comma-separated) and auto-include www/apex pairs
 * so https://touristlio.com also allows https://www.touristlio.com.
 * Also merges SITE_URL and Render's RENDER_EXTERNAL_URL when set.
 */
function parseCorsOrigins(raw) {
  const parts = (raw || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  for (const extra of [process.env.SITE_URL, process.env.RENDER_EXTERNAL_URL]) {
    if (!extra) continue;
    try {
      parts.push(new URL(extra.replace(/\/$/, '')).origin);
    } catch {
      /* ignore invalid URL */
    }
  }

  const expanded = new Set(parts);
  for (const origin of parts) {
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

/** http/https origins for the incoming Host header (same-origin behind proxy). */
function hostOrigins(host) {
  if (!host) return [];
  return [`http://${host}`, `https://${host}`];
}

function isCorsOriginAllowed(origin, corsOrigins, host) {
  if (!origin || corsOrigins.includes(origin) || corsOrigins.includes('*')) return true;
  return hostOrigins(host).includes(origin);
}

/** CSP connect-src: 'self' plus apex/www variants from SITE_URL and CORS_ORIGIN. */
function getConnectSrcOrigins() {
  const raw = [process.env.CORS_ORIGIN, process.env.SITE_URL, process.env.RENDER_EXTERNAL_URL]
    .filter(Boolean)
    .join(',');
  return ["'self'", ...parseCorsOrigins(raw)];
}

module.exports = { parseCorsOrigins, hostOrigins, isCorsOriginAllowed, getConnectSrcOrigins };
