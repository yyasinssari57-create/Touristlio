const { db } = require('../../db');

const { findUserByEmail, findUserById } = require('../../auth');



async function findByEmail(email) {

  return await findUserByEmail(email);

}



async function findById(id) {

  return await findUserById(id);

}



async function updateVerification(userId, token) {

  await db.prepare('UPDATE users SET verification_token = ?, email_verified = 0 WHERE id = ?').run(token, userId);

}



async function recordFailedLogin(row, maxFailed, lockMinutes) {

  const count = (row.failed_login_count || 0) + 1;

  if (count >= maxFailed) {

    const until = new Date(Date.now() + lockMinutes * 60000).toISOString().slice(0, 19).replace('T', ' ');

    await db.prepare('UPDATE users SET failed_login_count = ?, locked_until = ? WHERE id = ?').run(count, until, row.id);

  } else {

    await db.prepare('UPDATE users SET failed_login_count = ? WHERE id = ?').run(count, row.id);

  }

}



async function clearFailedLogin(userId) {

  await db.prepare('UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = ?').run(userId);

}



async function insertPasswordReset(userId, token, expires) {

  await db.prepare('INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)').run(userId, token, expires);

}



async function findPasswordReset(token) {

  return await db.prepare(`

    SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0 AND expires_at > datetime('now')

  `).get(token);

}



async function usePasswordReset(id, userId, passwordHash) {
  await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
  await touchPasswordChangedAt(userId);
  await db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE id = ?').run(id);
  await db.prepare(`
    DELETE FROM password_reset_tokens
    WHERE used = 1 OR expires_at <= datetime('now')
  `).run();
}



async function verifyEmailToken(token) {

  return await db.prepare('SELECT id FROM users WHERE verification_token = ?').get(token);

}



async function markEmailVerified(userId) {

  await db.prepare('UPDATE users SET email_verified = 1, verification_token = NULL WHERE id = ?').run(userId);

}



async function touchPasswordChangedAt(userId) {
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  await db.prepare('UPDATE users SET password_changed_at = ? WHERE id = ?').run(now, userId);
}

async function updatePasswordHash(userId, passwordHash) {
  await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
  await touchPasswordChangedAt(userId);
}

/** Re-encode hash after login (cost upgrade) without invalidating the current session. */
async function upgradePasswordHash(userId, passwordHash) {
  await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
}



async function updateEmailAddress(userId, email) {
  await db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email.toLowerCase().trim(), userId);
}

async function updateAvatarPreset(userId, preset, color) {
  await db.prepare('UPDATE users SET avatar_preset = ?, avatar_color = ?, avatar_url = NULL WHERE id = ?')
    .run(preset, color, userId);
}

async function updateAvatarUrl(userId, url) {
  await db.prepare('UPDATE users SET avatar_url = ?, avatar_preset = NULL WHERE id = ?')
    .run(url, userId);
}

async function clearAvatarPhoto(userId) {
  await db.prepare('UPDATE users SET avatar_url = NULL WHERE id = ?').run(userId);
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

  updatePasswordHash,

  upgradePasswordHash,

  updateEmailAddress,

  updateAvatarPreset,

  updateAvatarUrl,

  clearAvatarPhoto,

};

