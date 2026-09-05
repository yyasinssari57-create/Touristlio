#!/usr/bin/env node
/**
 * PostgreSQL dump via pg_dump when DATABASE_URL is set.
 * Writes touristlio-*.sql (optionally .enc) + .sha256 sidecar. Path is allowlisted.
 */
require('dotenv').config();
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const backupSafe = require('../lib/backup-safe');

const backupsDir = backupSafe.backupsDir();
fs.mkdirSync(backupsDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const plainName = `touristlio-${stamp}.sql`;
if (!backupSafe.safeBackupBasename(plainName)) {
  console.error('Refusing unsafe backup filename');
  process.exit(1);
}
const plainPath = backupSafe.resolveBackupFile(plainName);
if (!plainPath) {
  console.error('Backup path rejected');
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL required for backup:db');
  process.exit(1);
}

const r = spawnSync('pg_dump', [url, '-f', plainPath], { stdio: 'inherit' });
if (r.status !== 0) {
  console.error('pg_dump failed — install postgresql-client or run dump from Supabase dashboard.');
  process.exit(r.status || 1);
}

let outPath = plainPath;
if (backupSafe.encryptionConfigured()) {
  const encName = `${plainName}.enc`;
  const encPath = backupSafe.resolveBackupFile(encName);
  if (!encPath) {
    console.error('Encrypted backup path rejected');
    process.exit(1);
  }
  const enc = backupSafe.encryptBuffer(fs.readFileSync(plainPath));
  fs.writeFileSync(encPath, enc);
  fs.unlinkSync(plainPath);
  outPath = encPath;
}

const hex = backupSafe.sha256File(outPath);
backupSafe.writeSidecarChecksum(outPath, hex);
console.log('Backup written:', outPath);
console.log('SHA-256:', hex);
