/**
 * Hash plaintext verification / password-reset tokens in place.
 * Safe to re-run: already-prefixed rows are skipped.
 */
const { hashAuthToken, isHashedAuthToken, verificationExpiresAt } = require('./token-hash');

async function migrateAuthTokenHashes(db, { dryRun = false } = {}) {
  const summary = {
    dryRun: !!dryRun,
    verificationToHash: 0,
    verificationHashed: 0,
    resetExpiredDeleted: 0,
    resetToHash: 0,
    resetHashed: 0,
  };

  const verifyRows = await db.prepare(`
    SELECT id, verification_token AS token, verification_token_expires_at AS expires_at
    FROM users
    WHERE verification_token IS NOT NULL AND verification_token != ''
  `).all();

  for (const row of verifyRows) {
    if (isHashedAuthToken(row.token)) continue;
    summary.verificationToHash += 1;
    if (dryRun) continue;
    const expires = row.expires_at || verificationExpiresAt();
    await db.prepare(`
      UPDATE users
      SET verification_token = ?, verification_token_expires_at = ?
      WHERE id = ?
    `).run(hashAuthToken(row.token), expires, row.id);
    summary.verificationHashed += 1;
  }

  const resetRows = await db.prepare(`
    SELECT id, token, used, expires_at
    FROM password_reset_tokens
  `).all();

  for (const row of resetRows) {
    const expiredOrUsed = Number(row.used) === 1
      || !row.expires_at
      || String(row.expires_at) <= new Date().toISOString().slice(0, 19).replace('T', ' ');
    if (expiredOrUsed && !isHashedAuthToken(row.token)) {
      summary.resetExpiredDeleted += 1;
      if (!dryRun) {
        await db.prepare('DELETE FROM password_reset_tokens WHERE id = ?').run(row.id);
      }
      continue;
    }
    if (isHashedAuthToken(row.token)) continue;
    summary.resetToHash += 1;
    if (dryRun) continue;
    await db.prepare('UPDATE password_reset_tokens SET token = ? WHERE id = ?').run(hashAuthToken(row.token), row.id);
    summary.resetHashed += 1;
  }

  return summary;
}

module.exports = { migrateAuthTokenHashes };
