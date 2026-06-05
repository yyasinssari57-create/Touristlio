const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

function validateJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (process.env.NODE_ENV !== 'production') return;
  if (!secret || secret.length < 32 || secret === 'dev-secret-change-me') {
    throw new Error(
      'JWT_SECRET must be set to a long random string (32+ chars) in production. See .env.example.',
    );
  }
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function comparePassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

function sanitizeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    avatarColor: row.avatar_color,
    createdAt: row.created_at,
    emailVerified: !!row.email_verified,
    riskScore: row.risk_score || 0,
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
  JWT_SECRET,
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
