const argon2 = require('argon2');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('./db');
const { effectivePermissions } = require('./middleware/rbac');
const { sanitizeName } = require('./lib/sanitize');
const { publicImageUrl } = require('./lib/media-url');
const { MIN_PASSWORD_LENGTH, passwordPolicyError } = require('./lib/password-policy');

const crypto = require('crypto');

const MIN_JWT_SECRET_LENGTH = 32;

// Placeholders that are long enough to pass the length check.
// A shorter built-in fallback is not kept: production refuses anything under 32 characters.
const WEAK_JWT_SECRETS = new Set([
  'change-this-to-a-long-random-string',
  'touristlio-dev-secret-change-in-production',
]);

let devEphemeralSecret = '';

function jwtSecretError() {
  return new Error(
    'JWT_SECRET is missing, weak, or shorter than 32 characters. '
    + 'Production will not start and will not invent a secret. '
    + 'Set a long random value in the host environment. Run: npm run generate:jwt-secret',
  );
}

function acceptableJwtSecret(secret) {
  return typeof secret === 'string'
    && secret.length >= MIN_JWT_SECRET_LENGTH
    && !WEAK_JWT_SECRETS.has(secret);
}

function ensureDevJwtSecret() {
  if (process.env.NODE_ENV === 'production') return;
  if (acceptableJwtSecret(process.env.JWT_SECRET)) return;
  if (!devEphemeralSecret) {
    devEphemeralSecret = crypto.randomBytes(48).toString('hex');
    console.warn(
      '[auth] JWT_SECRET is missing or weak in development. '
      + 'Using a random secret for this process only. It is not stored and changes on the next start.',
    );
  }
}

function getJwtSecret() {
  if (acceptableJwtSecret(process.env.JWT_SECRET)) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV !== 'production') {
    ensureDevJwtSecret();
    if (devEphemeralSecret) return devEphemeralSecret;
  }
  throw jwtSecretError();
}

function validateJwtSecret() {
  if (process.env.NODE_ENV === 'production') {
    if (!acceptableJwtSecret(process.env.JWT_SECRET)) throw jwtSecretError();
    return;
  }
  ensureDevJwtSecret();
}

// Admin and regular users share one login/token system (no separate admin
// auth). Extended from 7d to 30d — Yasin (sole site-owner admin) reported
// being logged out mid-task while cropping/uploading a photo; 30 days
// matches MONTH_MS already used elsewhere in this codebase for long-lived
// cookies (see lib/cookie-opts.js) and is a reasonable, non-excessive window
// for an admin-only account, not just a 15–30 minute session.
const SESSION_TOKEN_EXPIRES_IN = '30d';

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    getJwtSecret(),
    { expiresIn: SESSION_TOKEN_EXPIRES_IN },
  );
}

function verifyToken(token) {
  return jwt.verify(token, getJwtSecret());
}

const BCRYPT_ROUNDS = 12;
const ARGON2_MEMORY_KIB = 65536;
const ARGON2_TIME_COST = 3;
const ARGON2_PARALLELISM = 1;
const ARGON2_OPTS = {
  type: argon2.argon2id,
  memoryCost: ARGON2_MEMORY_KIB,
  timeCost: ARGON2_TIME_COST,
  parallelism: ARGON2_PARALLELISM,
};

/** Dummy Argon2id hash used when the stored hash is missing or unknown. */
const DUMMY_ARGON2_HASH = '$argon2id$v=19$m=65536,p=1,t=3$+s2c2myev6yhs+RmPx9olQ$me91Kk2gqsOeisc2o7H9L1dZRW3C8yy59Asdd74vih4';

function isBcryptHash(hash) {
  return typeof hash === 'string' && /^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash);
}

function isArgon2Hash(hash) {
  return typeof hash === 'string' && /^\$argon2(?:id|i|d)\$/.test(hash);
}

function isArgon2idHash(hash) {
  return typeof hash === 'string' && hash.startsWith('$argon2id$');
}

function argon2Param(hash, name) {
  const match = new RegExp(`(?:^|[,$$])${name}=(\\d+)`).exec(String(hash || ''));
  if (!match) return 0;
  const n = parseInt(match[1], 10);
  return Number.isFinite(n) ? n : 0;
}

function needsRehash(hash) {
  if (!isArgon2idHash(hash)) return true;
  return argon2Param(hash, 'm') < ARGON2_MEMORY_KIB
    || argon2Param(hash, 't') < ARGON2_TIME_COST
    || argon2Param(hash, 'p') < ARGON2_PARALLELISM;
}

async function hashPassword(password) {
  return argon2.hash(String(password ?? ''), ARGON2_OPTS);
}

/**
 * Verify a password against a stored hash.
 * New hashes are Argon2id. Existing bcrypt hashes still verify so users are
 * not locked out; a successful login then rehashes to Argon2id.
 * Missing or unknown formats still run a full Argon2id verify so timing
 * does not leak whether a user exists.
 */
async function comparePassword(password, hash) {
  const candidate = String(password ?? '');
  if (isArgon2Hash(hash)) {
    try {
      return await argon2.verify(hash, candidate);
    } catch {
      return false;
    }
  }
  if (isBcryptHash(hash)) {
    return bcrypt.compareSync(candidate, hash);
  }
  try {
    await argon2.verify(DUMMY_ARGON2_HASH, candidate);
  } catch { /* ignore malformed dummy */ }
  return false;
}

async function sanitizeUser(row) {
  if (!row) return null;
  const permissions = row.role === 'admin' ? null : await effectivePermissions(row.role);
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    avatarColor: row.avatar_color,
    avatarUrl: publicImageUrl(row.avatar_url),
    avatarPreset: row.avatar_preset || null,
    createdAt: row.created_at,
    emailVerified: !!row.email_verified,
    riskScore: row.risk_score || 0,
    permissions,
  };
}

async function findUserByEmail(email) {
  return await db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
}

async function findUserById(id) {
  return await db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

async function createUser({ name, email, password, role = 'member' }) {
  const colors = ['#0ea5e9', '#0d9488', '#b45309', '#e8642a', '#7c3aed'];
  const hash = await hashPassword(password);
  const cleanName = sanitizeName(name, 120) || 'Gezgin';
  const info = await db.prepare(`
    INSERT INTO users (name, email, password_hash, role, avatar_color)
    VALUES (?, ?, ?, ?, ?)
  `).run(cleanName, email.toLowerCase().trim(), hash, role, colors[Math.floor(Math.random() * colors.length)]);
  return await findUserById(info.lastInsertRowid);
}

module.exports = {
  validateJwtSecret,
  getJwtSecret,
  SESSION_TOKEN_EXPIRES_IN,
  signToken,
  verifyToken,
  BCRYPT_ROUNDS,
  MIN_PASSWORD_LENGTH,
  hashPassword,
  comparePassword,
  needsRehash,
  isBcryptHash,
  isArgon2idHash,
  ARGON2_OPTS,
  passwordPolicyError,
  sanitizeUser,
  findUserByEmail,
  findUserById,
  createUser,
};
