/**
 * Gemini Sprint 1 — backup path/checksum/dry-run, Sharp leftover, CSP attr cleanup.
 * Usage: node server/scripts/verify-gemini-sprint1.js
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}

console.log('verify-gemini-sprint1');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

const backupSafe = require('../lib/backup-safe');

if (backupSafe.safeBackupBasename('../etc/passwd') !== null) {
  fail('safeBackupBasename accepted parent path');
} else ok('backup name rejects parent path');
if (backupSafe.safeBackupBasename('/tmp/touristlio-backup-2026-09-05.sql') !== null) {
  fail('safeBackupBasename accepted absolute path');
} else ok('backup name rejects absolute path');
if (backupSafe.safeBackupBasename('touristlio-backup-2026-09-05.sql') !== 'touristlio-backup-2026-09-05.sql') {
  fail('safeBackupBasename rejected a valid dump name');
} else ok('backup name allowlists touristlio-*.sql');
if (backupSafe.resolveBackupFile('touristlio-backup-2026-09-05.sql')
  && !backupSafe.resolveBackupFile('touristlio-backup-2026-09-05.sql').includes('..')) {
  ok('resolveBackupFile stays under backups dir');
} else fail('resolveBackupFile missing or escaped backups dir');

const dumpHead = Buffer.from('--\n-- PostgreSQL database dump\n--\nSET statement_timeout = 0;\n');
if (!backupSafe.looksLikePgDump(dumpHead)) fail('looksLikePgDump missed pg_dump header');
else ok('looksLikePgDump recognizes pg_dump text');
if (backupSafe.looksLikePgDump(Buffer.from('<html>not a dump</html>'))) fail('looksLikePgDump too loose');
else ok('looksLikePgDump rejects non-dump');

const hex = backupSafe.sha256Buffer(Buffer.from('abc'));
if (!backupSafe.checksumsMatch(hex, hex)) fail('checksumsMatch failed on equal hashes');
else ok('checksumsMatch accepts equal SHA-256');
if (backupSafe.checksumsMatch(hex, '0'.repeat(64))) fail('checksumsMatch accepted a mismatch');
else ok('checksumsMatch rejects mismatch');

const adminJs = read('server/routes/admin.js');
if (!adminJs.includes("router.get('/backup/download'") || !adminJs.includes('safeBackupBasename')) {
  fail('admin backup download missing path allowlist');
} else ok('admin backup download sanitizes names');
if (!adminJs.includes('X-Checksum-SHA256') || !adminJs.includes('checksumsMatch')) {
  fail('backup checksum header / restore match missing');
} else ok('backup download checksum + restore match');
if (!adminJs.includes('dryRun') || !adminJs.includes('db.restore_dry_run')) {
  fail('restore dry-run missing');
} else ok('restore dry-run validates without apply');
if (!adminJs.includes('decryptBuffer')) {
  fail('restore decrypt hook missing');
} else ok('restore uses backup-safe decrypt hook');
const backupLib = read('server/lib/backup-safe.js');
if (!backupLib.includes('BACKUP_ENCRYPTION_KEY') || !backupLib.includes('aes-256-gcm')) {
  fail('backup-safe missing optional AES-256-GCM via BACKUP_ENCRYPTION_KEY');
} else ok('optional encryption uses BACKUP_ENCRYPTION_KEY env (no invented secret)');
if (!adminJs.includes('createSignedUrl') || !adminJs.includes('backups/')) {
  fail('signed URL path for stored backups missing');
} else ok('named backup can use existing Storage signed URL');

const storageJs = read('server/lib/supabase-storage.js');
if (!storageJs.includes('async function createSignedUrl') || !storageJs.includes('s.includes(\'..\')')) {
  fail('createSignedUrl / key traversal guard missing');
} else ok('Storage signed URL + key traversal guard');

const backupDb = read('server/scripts/backup-db.js');
if (!backupDb.includes('writeSidecarChecksum') || !backupDb.includes('safeBackupBasename')) {
  fail('backup-db.js missing checksum sidecar / path allowlist');
} else ok('backup-db.js writes checksum sidecar under allowlisted path');

const imgSrc = read('server/lib/image-process.js');
if (!imgSrc.includes('MAX_WIDTH = 1920') || !imgSrc.includes('MAX_HEIGHT = 1080') || !imgSrc.includes('.webp(')) {
  fail('Sharp pipeline lost 1920×1080 / WebP');
} else ok('Sharp still EXIF-strip + 1920×1080 + WebP');
if (/\.avif\(|image\/avif/.test(imgSrc)) fail('AVIF added (Sprint 1 leftover — do not add)');
else ok('AVIF still not in Sharp pipeline');

const indexJs = read('server/index.js');
if (/scriptSrcAttr:\s*\[[^\]]*'unsafe-inline'/.test(indexJs)) {
  fail("script-src-attr still 'unsafe-inline'");
} else ok("CSP script-src-attr no longer 'unsafe-inline'");

const indexHtml = read('public/index.html');
if (/\sonclick\s*=/.test(indexHtml) || /\sonchange\s*=/.test(indexHtml)) {
  fail('index.html still has inline on* handlers');
} else ok('index.html has no onclick/onchange');
if (!indexHtml.includes('/js/bind-actions.js')) fail('index.html missing bind-actions.js');
else ok('index.html loads bind-actions.js');

const adminHtml = read('public/admin.html');
if (/\sonclick\s*=/.test(adminHtml)) fail('admin.html still has onclick=');
else ok('admin.html has no onclick=');
if (!adminHtml.includes('dbRestoreDryRun') || !adminHtml.includes('sha256HexFile')) {
  fail('admin restore UI missing dry-run / checksum');
} else ok('admin restore sends checksum + dry-run');

const envEx = read('.env.example');
if (!envEx.includes('BACKUP_ENCRYPTION_KEY')) fail('.env.example missing BACKUP_ENCRYPTION_KEY placeholder');
else ok('.env.example has BACKUP_ENCRYPTION_KEY placeholder (no secret)');

const csp = spawnSync(process.execPath, [path.join(ROOT, 'server/scripts/verify-csp.js')], {
  cwd: ROOT,
  encoding: 'utf8',
});
if (csp.status !== 0) {
  fail(`verify:csp failed\n${(csp.stdout + csp.stderr).slice(0, 800)}`);
} else ok('verify:csp passed');

if (failed) {
  console.error(`verify-gemini-sprint1 FAILED (${failed})`);
  process.exit(1);
}
console.log('verify-gemini-sprint1 OK');
