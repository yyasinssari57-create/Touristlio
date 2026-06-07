require('dotenv').config();
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { findUserByEmail } = require('../auth');

const rows = db.prepare(`
  SELECT id, email, role, name, email_verified, failed_login_count, locked_until
  FROM users
  WHERE role IN ('admin', 'moderator', 'editor', 'staff')
  ORDER BY id
`).all();

console.log('=== Admin users ===');
for (const r of rows) {
  console.log(JSON.stringify(r));
}

const envEmail = (process.env.ADMIN_EMAIL || 'yasin@touristlio.local').toLowerCase();
const envPass = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
const user = findUserByEmail(envEmail);
if (user) {
  const ok = bcrypt.compareSync(envPass, user.password_hash);
  console.log('=== .env password check ===');
  console.log('email:', envEmail);
  console.log('role:', user.role);
  console.log('password_matches:', ok);
  console.log('locked:', user.locked_until || null);
  console.log('failed_login_count:', user.failed_login_count || 0);
} else {
  console.log('=== .env admin NOT FOUND ===', envEmail);
}
