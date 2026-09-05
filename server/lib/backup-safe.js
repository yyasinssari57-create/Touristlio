/**
 * Admin backup/restore helpers — path allowlist, SHA-256, optional AES-256-GCM.
 * Encryption uses BACKUP_ENCRYPTION_KEY when set (placeholder in .env.example).
 * Does not invent a key and does not create a new object store.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SAFE_NAME_RE = /^touristlio[-_][A-Za-z0-9._-]+\.(sql|sql\.enc|sha256)$/i;
const ENC_MAGIC = Buffer.from('TL1');
const GCM_IV_LEN = 12;
const GCM_TAG_LEN = 16;

function backupsDir() {
  const raw = process.env.BACKUP_DIR || path.join(__dirname, '..', '..', 'backups');
  return path.resolve(raw);
}

function isPlaceholderKey(value) {
  return !value || /YOUR_|PLACEHOLDER|change-me|şifre|TODO/i.test(value);
}

function encryptionKey() {
  const raw = String(process.env.BACKUP_ENCRYPTION_KEY || '').trim();
  if (isPlaceholderKey(raw) || raw.length < 32) return null;
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

function encryptionConfigured() {
  return Boolean(encryptionKey());
}

/**
 * Reject path traversal, absolute paths, and names outside the touristlio-* allowlist.
 * Returns the safe basename or null.
 */
function safeBackupBasename(input) {
  if (input == null) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  if (raw.includes('\0')) return null;
  if (/[/\\]/.test(raw) || raw.includes('..')) return null;
  if (path.isAbsolute(raw)) return null;
  if (path.win32.isAbsolute(raw)) return null;
  const base = path.basename(raw);
  if (!base || base !== raw) return null;
  if (base === '.' || base === '..') return null;
  if (!SAFE_NAME_RE.test(base)) return null;
  return base;
}

function resolveBackupFile(name) {
  const base = safeBackupBasename(name);
  if (!base) return null;
  const dir = backupsDir();
  const full = path.resolve(dir, base);
  const rel = path.relative(dir, full);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return full;
}

function sha256Buffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function checksumsMatch(expected, actual) {
  const a = String(expected || '').trim().toLowerCase();
  const b = String(actual || '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(a) || !/^[0-9a-f]{64}$/.test(b)) return false;
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function encryptBuffer(plain) {
  const key = encryptionKey();
  if (!key) return Buffer.from(plain);
  const iv = crypto.randomBytes(GCM_IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([ENC_MAGIC, iv, tag, enc]);
}

function isEncryptedBackup(buf) {
  return Buffer.isBuffer(buf) && buf.length >= ENC_MAGIC.length + GCM_IV_LEN + GCM_TAG_LEN
    && buf.subarray(0, ENC_MAGIC.length).equals(ENC_MAGIC);
}

function decryptBuffer(buf) {
  if (!isEncryptedBackup(buf)) return Buffer.from(buf);
  const key = encryptionKey();
  if (!key) {
    const err = new Error('BACKUP_ENCRYPTION_KEY tanımlı değil; şifreli yedek açılamaz');
    err.status = 400;
    throw err;
  }
  const iv = buf.subarray(ENC_MAGIC.length, ENC_MAGIC.length + GCM_IV_LEN);
  const tag = buf.subarray(ENC_MAGIC.length + GCM_IV_LEN, ENC_MAGIC.length + GCM_IV_LEN + GCM_TAG_LEN);
  const data = buf.subarray(ENC_MAGIC.length + GCM_IV_LEN + GCM_TAG_LEN);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

function looksLikePgDump(buf) {
  const head = Buffer.from(buf).subarray(0, 800).toString('utf8');
  if (/^PGDMP/.test(head)) return true;
  return /PostgreSQL database dump|pg_dump|Dumped from database version|SET statement_timeout/i.test(head);
}

function writeSidecarChecksum(filePath, hex) {
  fs.writeFileSync(`${filePath}.sha256`, `${hex}  ${path.basename(filePath)}\n`, 'utf8');
}

function safeTmpPath(suffix) {
  const stamp = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
  return path.join(os.tmpdir(), `touristlio-backup-${stamp}${suffix || '.sql'}`);
}

module.exports = {
  SAFE_NAME_RE,
  backupsDir,
  encryptionConfigured,
  safeBackupBasename,
  resolveBackupFile,
  sha256Buffer,
  sha256File,
  checksumsMatch,
  encryptBuffer,
  decryptBuffer,
  isEncryptedBackup,
  looksLikePgDump,
  writeSidecarChecksum,
  safeTmpPath,
};
