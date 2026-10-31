/**
 * Best-effort persistence for an auto-generated JWT_SECRET.
 *
 * Render (and most hosts) restart the Node process on every deploy, and on
 * some plans after idle periods too. If JWT_SECRET is not set in the host's
 * environment, server/auth.js's ensureJwtSecret() invents a brand new random
 * secret on EVERY restart — which silently invalidates every logged-in
 * session (admin included) even though the JWT's own `exp` claim says it is
 * still valid for days. From the user's side this looks exactly like "my
 * session keeps ending early" with no obvious cause.
 *
 * Reusing the DB's existing `site_settings` key/value table, this module
 * lets the server remember the auto-generated secret across restarts so an
 * admin session actually lasts the full configured expiry. Setting a real
 * JWT_SECRET in the host environment remains the recommended, more robust
 * fix (no dependency on the DB); this is a safety net for when that has not
 * been done yet.
 */
const logger = require('./logger');

const SETTING_KEY = 'auth_jwt_secret_fallback';

async function loadPersistedJwtSecret() {
  try {
    const { db } = require('../db');
    const row = await db.prepare('SELECT value FROM site_settings WHERE key = ?').get(SETTING_KEY);
    const value = row?.value ? String(row.value) : '';
    return value.length >= 32 ? value : null;
  } catch (err) {
    logger.warn({ msg: 'Could not read persisted JWT secret fallback', err: err.message });
    return null;
  }
}

async function persistJwtSecret(secret) {
  const value = String(secret || '');
  if (value.length < 32) return false;
  try {
    const { db } = require('../db');
    await db.prepare(`
      INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `).run(SETTING_KEY, value);
    return true;
  } catch (err) {
    logger.warn({ msg: 'Could not persist auto-generated JWT secret fallback', err: err.message });
    return false;
  }
}

module.exports = { loadPersistedJwtSecret, persistJwtSecret, SETTING_KEY };
