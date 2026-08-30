#!/usr/bin/env node
/**
 * .env ADMIN_* değerlerini SQLite users tablosuna kesin olarak yazar.
 * Kullanım: node server/scripts/ensure-admin.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { db } = require('../db');
const { createUser, findUserByEmail, hashPassword, comparePassword } = require('../auth');

const email = (process.env.ADMIN_EMAIL || 'yasin@touristlio.local').toLowerCase().trim();
const password = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
const name = (process.env.ADMIN_NAME || 'Yasin').trim();

function markEmailVerified(userId) {
  db.prepare('UPDATE users SET email_verified = 1, verification_token = NULL WHERE id = ?').run(userId);
}

function clearLockout(userId) {
  db.prepare('UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = ?').run(userId);
}

const legacyEmail = 'yasin@touristlio.local';
const existing = findUserByEmail(email);
let action;
if (existing) {
  const hash = hashPassword(password);
  db.prepare('UPDATE users SET password_hash = ?, name = ?, role = ? WHERE id = ?').run(
    hash, name, 'admin', existing.id,
  );
  markEmailVerified(existing.id);
  clearLockout(existing.id);
  action = 'updated';
} else {
  const user = createUser({ name, email, password, role: 'admin' });
  markEmailVerified(user.id);
  clearLockout(user.id);
  action = 'created';
}

// Eski varsayılan admin (farklı e-posta) aynı .env şifresiyle senkronize edilir.
if (email !== legacyEmail) {
  const legacy = findUserByEmail(legacyEmail);
  if (legacy && legacy.role === 'admin') {
    const hash = hashPassword(password);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, legacy.id);
    markEmailVerified(legacy.id);
    clearLockout(legacy.id);
    console.log('Legacy admin password synced:', legacyEmail);
  }
}

const user = findUserByEmail(email);
const passwordOk = comparePassword(password, user.password_hash);

const admins = db.prepare(`
  SELECT id, email, role, name, email_verified, failed_login_count, locked_until
  FROM users
  WHERE role IN ('admin', 'moderator', 'editor', 'staff')
  ORDER BY id
`).all();

const report = {
  action,
  envEmail: email,
  passwordMatches: passwordOk,
  role: user.role,
  emailVerified: !!user.email_verified,
  adminUsers: admins.map((a) => ({
    id: a.id,
    email: a.email,
    role: a.role,
    name: a.name,
    locked: !!a.locked_until,
    failedLoginCount: a.failed_login_count || 0,
  })),
};

const outPath = path.join(__dirname, '..', '..', '_admin-fix-report.json');
fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');

console.log('Admin', action + ':', email);
console.log('Password matches .env:', passwordOk);
console.log('Admin users in DB:');
for (const a of admins) {
  console.log(`  - ${a.email} (${a.role})${a.locked_until ? ' [LOCKED]' : ''}`);
}
console.log('Report:', outPath);

if (!passwordOk) {
  console.error('ERROR: password hash still does not match .env');
  process.exit(1);
}
