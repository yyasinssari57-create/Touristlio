/** V5 Adım 4 — hash auth tokens at rest; add verification expiry column. */
const { migrateAuthTokenHashes } = require('../../server/lib/migrate-auth-token-hashes');

async function up(db, { addColumnIfMissing }) {
  await addColumnIfMissing(db, 'users', 'verification_token_expires_at', 'TEXT');
  await migrateAuthTokenHashes(db, { dryRun: false });
}

module.exports = { id: '020_v5_adim4_token_hash', up };
