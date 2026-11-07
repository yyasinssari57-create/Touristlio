#!/usr/bin/env node
/**
 * Dry-run / apply helper for V5 Adım 4 token hashing.
 *
 *   node server/scripts/migrate-v5-adim4-token-hash.js --dry-run
 *   node server/scripts/migrate-v5-adim4-token-hash.js --apply
 *
 * Boot already applies this via db/migrations/020_v5_adim4_token_hash.js.
 * Use --dry-run to preview counts without writing.
 */
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || !args.includes('--apply');
  if (!args.includes('--dry-run') && !args.includes('--apply')) {
    console.log('Usage: --dry-run (default) or --apply');
  }

  const { initDb, db } = require('../db');
  const { addColumnIfMissing } = require('../lib/migrations');
  const { migrateAuthTokenHashes } = require('../lib/migrate-auth-token-hashes');

  await initDb();
  await addColumnIfMissing(db, 'users', 'verification_token_expires_at', 'TEXT');
  const summary = await migrateAuthTokenHashes(db, { dryRun });
  console.log(JSON.stringify(summary, null, 2));
  if (dryRun) {
    console.log('Dry-run only. Re-run with --apply to write (or rely on boot migration 020).');
  } else {
    console.log('Applied.');
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
