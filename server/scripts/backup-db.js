#!/usr/bin/env node
/**
 * PostgreSQL dump via pg_dump when DATABASE_URL is set.
 */
require('dotenv').config();
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const backupsDir = process.env.BACKUP_DIR || path.join(root, 'backups');
fs.mkdirSync(backupsDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const out = path.join(backupsDir, `touristlio-${stamp}.sql`);
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL required for backup:db');
  process.exit(1);
}

const r = spawnSync('pg_dump', [url, '-f', out], { stdio: 'inherit' });
if (r.status !== 0) {
  console.error('pg_dump failed — install postgresql-client or run dump from Supabase dashboard.');
  process.exit(r.status || 1);
}
console.log('Backup written:', out);
