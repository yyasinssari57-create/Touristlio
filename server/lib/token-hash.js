const crypto = require('crypto');

/** Stored auth tokens use this prefix so plaintext rows can be migrated once. */
const AUTH_TOKEN_HASH_PREFIX = 'sha256$';

/** Email verification links expire after 24 hours. */
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

function hashAuthToken(rawToken) {
  const raw = String(rawToken || '');
  const digest = crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
  return `${AUTH_TOKEN_HASH_PREFIX}${digest}`;
}

function isHashedAuthToken(stored) {
  return String(stored || '').startsWith(AUTH_TOKEN_HASH_PREFIX);
}

function verificationExpiresAt(fromMs = Date.now()) {
  return new Date(fromMs + VERIFICATION_TTL_MS).toISOString().slice(0, 19).replace('T', ' ');
}

module.exports = {
  AUTH_TOKEN_HASH_PREFIX,
  VERIFICATION_TTL_MS,
  hashAuthToken,
  isHashedAuthToken,
  verificationExpiresAt,
};
