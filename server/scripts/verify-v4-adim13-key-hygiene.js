/**
 * V4 Adım 13 — anahtar hijyeni.
 * public/ JS ve HTML taranır. Gerçek anahtar depoya girmez.
 * .env gitignore'dadır. Git geçmişi git log -S ile bakılır.
 * Yenileme (Brevo, Supabase, veritabanı şifresi) bu betiğin işi değildir.
 *
 * Usage: npm run verify:v4-adim13
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;

function ok(message) {
  console.log('  ✓', message);
}

function fail(message) {
  console.error('  ✗', message);
  failed += 1;
}

function git(args) {
  return spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
}

function decodePw(pw) {
  try {
    return decodeURIComponent(pw);
  } catch {
    return pw;
  }
}

function passwordIsPlaceholder(pw) {
  const decoded = decodePw(pw);
  if (decoded === 'GERÇEK_ŞİFRE' || decoded === 'PASSWORD') return true;
  const low = decoded.toLowerCase();
  if (['password', 'postgres', 'changeme', 'change-me', 'secret', 'example', 'your-password', 'yourpassword'].includes(low)) {
    return true;
  }
  if (/password|sifre|example|changeme|placeholder|xxxx|\*{3,}/i.test(decoded)) return true;
  if (decoded.includes('ŞİFRE') || decoded.includes('şifre')) return true;
  return false;
}

/**
 * Secret-shaped tokens only. Regex source and placeholders do not match:
 * the character after sb_secret_ / xkeysib- must be alphanumeric, and the
 * token must be long. A pattern like sb_secret_[A-Za-z0-9]{16,} does not.
 */
function secretTokens(line) {
  const tokens = [];
  const rules = [
    [/sb_secret_[A-Za-z0-9][A-Za-z0-9._-]{15,}/g, 'sb_secret'],
    [/xkeysib-[A-Za-z0-9][A-Za-z0-9-]{15,}/g, 'xkeysib'],
    [/xsmtpsib-[A-Za-z0-9][A-Za-z0-9-]{15,}/g, 'xsmtpsib'],
    [/AIza[0-9A-Za-z_-]{30,}/g, 'AIza'],
    [/sk_(?:live|test)_[A-Za-z0-9]{10,}/g, 'sk_'],
    [/ghp_[A-Za-z0-9]{20,}/g, 'ghp'],
    [/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, 'jwt'],
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, 'private_key'],
  ];
  for (const [re, kind] of rules) {
    for (const match of line.matchAll(re)) {
      tokens.push({ kind, length: match[0].length });
    }
  }
  const urlRe = /postgres(?:ql)?:\/\/[^\s'"<>]+/gi;
  for (const match of line.matchAll(urlRe)) {
    const url = match[0];
    const parts = /:\/\/([^:/\s]+):([^@\s]+)@([^/\s]+)/.exec(url);
    if (!parts) continue;
    const pw = parts[2];
    const host = parts[3];
    if (passwordIsPlaceholder(pw)) continue;
    if ((host.startsWith('127.0.0.1') || host.startsWith('localhost')) && pw === 'postgres') continue;
    tokens.push({ kind: 'database_url', length: pw.length });
  }
  return tokens;
}

function assertClassifier() {
  const cases = [
    ['sb_secret_[A-Za-z0-9._-]{16,}', false],
    ['SUPABASE_SERVICE_KEY=sb_secret_...', false],
    ['SUPABASE_SERVICE_KEY=sb_secret_…', false],
    [`sb_secret_${'AbcdEfGh1234567890abcd'}`, true],
    ['postgresql://postgres:GERÇEK_ŞİFRE@db.PROJECT.supabase.co:5432/postgres', false],
    ['postgresql://postgres:postgres@127.0.0.1:5432/touristlio_test', false],
    [`postgresql://postgres:${'N0tARealSample99'}@db.PROJECT.supabase.co:5432/postgres`, true],
    ['xkeysib-...', false],
    [`xkeysib-${'a1b2c3d4e5f6g7h8i9j0'}`, true],
    ['AIzaSy[0-9A-Za-z_-]{20,}', false],
    [`AIza${'SyA1234567890abcdefghijklmnopqrstu'}`, true],
    ['SMTP yapılandırılmamış', false],
    ['<input type="password" name="password">', false],
  ];
  let bad = 0;
  for (const [line, expectReal] of cases) {
    const got = secretTokens(line).length > 0;
    if (got !== expectReal) bad += 1;
  }
  if (bad) fail(`sınıflandırıcı ${bad} örnekte şaştı`);
  else ok('sınıflandırıcı yer tutucuyu geçer, uydurma uzun jetonu yakalar');
}

function walkPublic(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walkPublic(full, acc);
    else if (/\.(js|html)$/i.test(name)) acc.push(full);
  }
  return acc;
}

function countNeedles(text) {
  return {
    sb_secret: text.split('sb_secret').length - 1,
    service_role: text.split('service_role').length - 1,
    SMTP: text.split('SMTP').length - 1,
    password: text.split('password').length - 1,
    secret: text.split('secret').length - 1,
    AIza: text.split('AIza').length - 1,
    sk_: text.split('sk_').length - 1,
  };
}

function addCounts(total, part) {
  for (const key of Object.keys(total)) total[key] += part[key];
}

console.log('verify-v4-adim13');
assertClassifier();

const publicFiles = walkPublic(path.join(ROOT, 'public'));
if (publicFiles.length < 10) fail('public taraması çok az dosya buldu');
else ok(`public JS/HTML ${publicFiles.length} dosya (vendor dahil)`);

const totals = {
  sb_secret: 0,
  service_role: 0,
  SMTP: 0,
  password: 0,
  secret: 0,
  AIza: 0,
  sk_: 0,
};
const publicHits = [];
for (const full of publicFiles) {
  const rel = path.relative(ROOT, full).replace(/\\/g, '/');
  const text = fs.readFileSync(full, 'utf8');
  addCounts(totals, countNeedles(text));
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const found = secretTokens(line);
    if (found.length) {
      publicHits.push(`${rel}:${index + 1} ${found.map((hit) => hit.kind).join(',')}`);
    }
  });
}

console.log(
  `  · public sayım: sb_secret=${totals.sb_secret} service_role=${totals.service_role} SMTP=${totals.SMTP} password=${totals.password} secret=${totals.secret} AIza=${totals.AIza} sk_=${totals.sk_}`,
);

if (totals.sb_secret || totals.service_role || totals.AIza || totals.sk_) {
  fail('public dosyada sb_secret / service_role / AIza / sk_ var; sunucuya taşınmalı');
} else ok('public dosyada sb_secret, service_role, AIza, sk_ yok');

if (publicHits.length) fail(`public dosyada anahtar biçimi: ${publicHits.join('; ')}`);
else ok('public dosyada anahtar biçiminde değer yok (SMTP ve password kelimeleri form/yardım metni)');

const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
const ignoreLines = gitignore.split(/\r?\n/);
for (const line of ['.env', '.env.*', '!.env.example', '!.env.*.example']) {
  if (!ignoreLines.includes(line)) fail(`.gitignore satırı yok: ${line}`);
}
if (ignoreLines.includes('.env') && ignoreLines.includes('.env.*')) ok('.gitignore .env ve .env.* satırlarını tutuyor');

function ignored(rel) {
  const result = git(['check-ignore', '-q', rel]);
  return result.status === 0;
}

if (!ignored('.env')) fail('.env yok sayılmıyor');
else ok('.env yok sayılıyor');
if (!ignored('.env.local') || !ignored('.env.production')) fail('.env.local / .env.production yok sayılmıyor');
else ok('.env.local ve .env.production yok sayılıyor');

const examples = ['.env.example', '.env.production.example', 'deploy/hetzner/.env.hetzner.example'];
const exampleIgnored = examples.filter((rel) => ignored(rel));
if (exampleIgnored.length) fail(`örnek env yok sayılıyor: ${exampleIgnored.join(', ')}`);
else ok('örnek env dosyaları depoya girebilir');

const tracked = git(['ls-files', '.env', '.env.local', '.env.production', '.env.development', '.env.backup']);
if (String(tracked.stdout || '').trim()) fail(`gerçek env dosyası izleniyor: ${tracked.stdout.trim()}`);
else ok('gerçek .env dosyası izlenmiyor');

const trackedExamples = git(['ls-files', ...examples]);
const trackedList = String(trackedExamples.stdout || '').trim().split(/\r?\n/).filter(Boolean);
if (trackedList.length !== examples.length) fail(`örnek env eksik izleniyor: ${trackedList.join(', ') || '(yok)'}`);
else ok('üç örnek env dosyası izleniyor');

for (const rel of examples) {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const hits = [];
  text.split(/\r?\n/).forEach((line, index) => {
    const found = secretTokens(line);
    if (found.length) hits.push(`${index + 1}:${found.map((hit) => hit.kind).join(',')}`);
  });
  if (hits.length) fail(`${rel} içinde anahtar biçimi: ${hits.join('; ')}`);
}
ok('örnek env dosyalarında gerçek anahtar yok');

const render = fs.readFileSync(path.join(ROOT, 'render.yaml'), 'utf8');
const blocks = render.split(/\n {6}- key: /).slice(1);
const secretKeys = {
  DATABASE_URL: 'sync',
  SUPABASE_URL: 'sync',
  SUPABASE_SERVICE_KEY: 'sync',
  SMTP_USER: 'sync',
  SMTP_PASS: 'sync',
  BREVO_API_KEY: 'sync',
  ADMIN_PASSWORD: 'sync',
  JWT_SECRET: 'generate',
};
const seenKeys = new Set();
for (const block of blocks) {
  const key = block.split('\n')[0].trim();
  const mode = secretKeys[key];
  if (!mode) continue;
  seenKeys.add(key);
  if (/^\s*value:/m.test(block)) fail(`render.yaml ${key} içine değer yazılmış`);
  if (mode === 'sync' && !/sync:\s*false/.test(block)) fail(`render.yaml ${key} sync: false değil`);
  if (mode === 'generate' && !/generateValue:\s*true/.test(block)) fail('render.yaml JWT_SECRET generateValue değil');
}
const missingKeys = Object.keys(secretKeys).filter((key) => !seenKeys.has(key));
if (missingKeys.length) fail(`render.yaml anahtar satırı yok: ${missingKeys.join(', ')}`);
else ok('render.yaml gizli değişkenleri depoya yazmıyor');

const trackedFiles = String(git(['ls-files']).stdout || '')
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((rel) => /\.(js|html|mjs|cjs|json|md|yml|yaml|example|txt|css|sql)$/i.test(rel) || rel.includes('.env'));
const repoHits = [];
for (const rel of trackedFiles) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) continue;
  const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    const found = secretTokens(line);
    if (found.length) repoHits.push(`${rel}:${index + 1} ${found.map((hit) => `${hit.kind}:${hit.length}`).join(',')}`);
  });
}
if (repoHits.length) fail(`depoda anahtar biçimi: ${repoHits.join('; ')}`);
else ok('izlenen dosyalarda anahtar biçiminde değer yok');

const shallow = git(['rev-parse', '--is-shallow-repository']);
if (String(shallow.stdout || '').trim() === 'true') {
  ok('git klonu sığ; eldeki commitler yine tarandı');
} else ok('git geçmişi tam');

const envHistory = git([
  'log', '--all', '--full-history', '--pretty=format:%h', '--',
  '.env', '.env.local', '.env.production', '.env.development', '.env.backup',
]);
if (String(envHistory.stdout || '').trim()) fail(`.env geçmişte commit edilmiş: ${envHistory.stdout.trim().split(/\s+/).slice(0, 5).join(' ')}`);
else ok('geçmişte .env commit yok');

const historyNeedles = [
  'sb_secret',
  'service_role',
  'AIza',
  'sk_live',
  'sk_test',
  'xkeysib-',
  'xsmtpsib-',
  'ghp_',
  'BEGIN PRIVATE KEY',
  'BEGIN RSA PRIVATE KEY',
  'postgresql://',
];
const historyHits = [];
const historyCommits = new Set();
for (const needle of historyNeedles) {
  const log = git(['log', '--all', '-S', needle, '--pretty=format:%H']);
  const commits = String(log.stdout || '').split(/\r?\n/).filter(Boolean);
  for (const commit of commits) historyCommits.add(commit);
  const patch = git(['log', '--all', '-p', '-U0', '--pretty=format:COMMIT %H', '-S', needle]);
  let commit = '';
  for (const line of String(patch.stdout || '').split(/\r?\n/)) {
    if (line.startsWith('COMMIT ')) {
      commit = line.slice(7, 17);
      continue;
    }
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    const found = secretTokens(line.slice(1));
    if (found.length) {
      historyHits.push(`${commit || '?'} ${found.map((hit) => hit.kind).join(',')} (${needle})`);
    }
  }
}
if (historyHits.length) fail(`git geçmişinde anahtar biçimi: ${historyHits.join('; ')}`);
else ok(`git log -S temiz (${historyNeedles.length} iğne, ${historyCommits.size} commit incelendi, değer yazdırılmadı)`);

if (failed) {
  console.error(`verify-v4-adim13 FAILED (${failed})`);
  process.exit(1);
}
console.log('verify-v4-adim13 OK');
