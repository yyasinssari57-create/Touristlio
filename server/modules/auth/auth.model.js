const { db } = require('../../db');

const { findUserByEmail, findUserById } = require('../../auth');



function findByEmail(email) {

  return findUserByEmail(email);

}



function findById(id) {

  return findUserById(id);

}



function updateVerification(userId, token) {

  db.prepare('UPDATE users SET verification_token = ?, email_verified = 0 WHERE id = ?').run(token, userId);

}



function recordFailedLogin(row, maxFailed, lockMinutes) {

  const count = (row.failed_login_count || 0) + 1;

  if (count >= maxFailed) {

    const until = new Date(Date.now() + lockMinutes * 60000).toISOString().slice(0, 19).replace('T', ' ');

    db.prepare('UPDATE users SET failed_login_count = ?, locked_until = ? WHERE id = ?').run(count, until, row.id);

  } else {

    db.prepare('UPDATE users SET failed_login_count = ? WHERE id = ?').run(count, row.id);

  }

}



function clearFailedLogin(userId) {

  db.prepare('UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = ?').run(userId);

}



function insertPasswordReset(userId, token, expires) {

  db.prepare('INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)').run(userId, token, expires);

}



function findPasswordReset(token) {

  return db.prepare(`

    SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0 AND expires_at > datetime('now')

  `).get(token);

}



function usePasswordReset(id, userId, passwordHash) {

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);

  db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE id = ?').run(id);

}



function verifyEmailToken(token) {

  return db.prepare('SELECT id FROM users WHERE verification_token = ?').get(token);

}



function markEmailVerified(userId) {

  db.prepare('UPDATE users SET email_verified = 1, verification_token = NULL WHERE id = ?').run(userId);

}



module.exports = {

  findByEmail,

  findById,

  updateVerification,

  recordFailedLogin,

  clearFailedLogin,

  insertPasswordReset,

  findPasswordReset,

  usePasswordReset,

  verifyEmailToken,

  markEmailVerified,

};

