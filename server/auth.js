const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('./db');
const { effectivePermissions } = require('./middleware/rbac');

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

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function comparePassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

function sanitizeUser(row) {
  if (!row) return null;
  const permissions = row.role === 'admin' ? null : effectivePermissions(row.role);
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

function findUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
}

function findUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function createUser({ name, email, password, role = 'member' }) {
  const colors = ['#0ea5e9', '#0d9488', '#b45309', '#e8642a', '#7c3aed'];
  const hash = hashPassword(password);
  const info = db.prepare(`
    INSERT INTO users (name, email, password_hash, role, avatar_color)
    VALUES (?, ?, ?, ?, ?)
  `).run(name.trim(), email.toLowerCase().trim(), hash, role, colors[Math.floor(Math.random() * colors.length)]);
  return findUserById(info.lastInsertRowid);
}

module.exports = {
  validateJwtSecret,
  signToken,
  verifyToken,
  hashPassword,
  comparePassword,
  sanitizeUser,
  findUserByEmail,
  findUserById,
  createUser,
};
