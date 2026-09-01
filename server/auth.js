const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('./db');
const { effectivePermissions } = require('./middleware/rbac');
const { sanitizeName } = require('./lib/sanitize');

const crypto = require('crypto');

const WEAK_JWT_SECRETS = new Set([
  'dev-secret-change-me',
  'change-this-to-a-long-random-string',
  'touristlio-dev-secret-change-in-production',
]);

function getJwtSecret() {
  return process.env.JWT_SECRET || 'dev-secret-change-me';
}

function ensureJwtSecret() {
  if (process.env.NODE_ENV !== 'production') return;
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 32 && !WEAK_JWT_SECRETS.has(secret)) return;
  process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
  console.warn(
    '[auth] JWT_SECRET was missing or weak — auto-generated for this process. '
    + 'Set a stable JWT_SECRET in Render Environment so sessions survive redeploys.',
  );
}

function validateJwtSecret() {
  if (process.env.NODE_ENV !== 'production') return;
  ensureJwtSecret();
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32 || WEAK_JWT_SECRETS.has(secret)) {
    throw new Error(
      'JWT_SECRET must be a long random string (32+ chars) in production. Run: npm run generate:jwt-secret',
    );
  }
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    getJwtSecret(),
    { expiresIn: '7d' },
  );
}

function verifyToken(token) {
  return jwt.verify(token, getJwtSecret());
}

const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 12;

/** Dummy bcrypt hash (cost 12) used when the stored hash is missing or not bcrypt. */
const DUMMY_BCRYPT_HASH = '$2b$12$F9aU1.MRV04jYh.eJY1UTe3GPFJDiWpNSZZJCTGaO137a7DxOkBd6';

function isBcryptHash(hash) {
  return typeof hash === 'string' && /^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash);
}

function bcryptCost(hash) {
  if (!isBcryptHash(hash)) return 0;
  const cost = parseInt(hash.split('$')[2], 10);
  return Number.isFinite(cost) ? cost : 0;
}

function needsRehash(hash) {
  return !isBcryptHash(hash) || bcryptCost(hash) < BCRYPT_ROUNDS;
}

function hashPassword(password) {
  return bcrypt.hashSync(password, BCRYPT_ROUNDS);
}

/**
 * Verify a password against a stored hash.
 * bcrypt.compareSync compares the derived digest in constant time.
 * Missing or unknown hash formats still run a full bcrypt compare so timing
 * does not leak whether a user exists.
 */
function comparePassword(password, hash) {
  const candidate = String(password ?? '');
  const stored = isBcryptHash(hash) ? hash : DUMMY_BCRYPT_HASH;
  const matches = bcrypt.compareSync(candidate, stored);
  return isBcryptHash(hash) && matches;
}

function passwordPolicyError(password) {
  const pw = String(password || '');
  if (pw.length < MIN_PASSWORD_LENGTH) {
    return `Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalı`;
  }
  if (!/[A-Z]/.test(pw)) return 'Şifre en az bir büyük harf içermeli';
  if (!/[0-9]/.test(pw)) return 'Şifre en az bir rakam içermeli';
  return null;
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
    avatarUrl: row.avatar_url || null,
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
  const hash = hashPassword(password);
  const cleanName = sanitizeName(name, 120) || 'Gezgin';
  const info = await db.prepare(`
    INSERT INTO users (name, email, password_hash, role, avatar_color)
    VALUES (?, ?, ?, ?, ?)
  `).run(cleanName, email.toLowerCase().trim(), hash, role, colors[Math.floor(Math.random() * colors.length)]);
  return await findUserById(info.lastInsertRowid);
}

module.exports = {
  validateJwtSecret,
  signToken,
  verifyToken,
  BCRYPT_ROUNDS,
  MIN_PASSWORD_LENGTH,
  hashPassword,
  comparePassword,
  needsRehash,
  isBcryptHash,
  passwordPolicyError,
  sanitizeUser,
  findUserByEmail,
  findUserById,
  createUser,
};
