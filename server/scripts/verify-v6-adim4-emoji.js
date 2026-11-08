#!/usr/bin/env node
/**
 * V6 Adım 4 — public yüzdeki dekoratif emojiler kaldırıldı.
 * Allowlist: ★ / ☆ (puan) ve kalp kaydet göstergeleri (🤍 ❤️ ❤ ♥).
 * Admin paneli ve vendor kapsam dışı. Kategori DB icon public'te gösterilmez.
 *
 * Usage: npm run verify:v6-adim4
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) { console.error('  ✗', msg); failed += 1; }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

console.log('verify-v6-adim4-emoji');

/** Pictographic / flag / dingbat scan; allowlist applied per match. */
const EMOJI_RE = /(?:[\u{1F1E0}-\u{1F1FF}]{2}|[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{2300}-\u{23FF}]|[\u{2B50}\u{2B55}]|\u{2139})[\u{FE0F}\u{200D}]*/gu;

const ALLOW_BASE = new Set(['★', '☆', '✓', '✕', '☰', '🤍', '❤', '♥', '❤️']);

function baseGlyph(match) {
  return String(match || '').replace(/[\uFE0F\u200D]/g, '');
}

function isAllowed(match) {
  const base = baseGlyph(match);
  if (ALLOW_BASE.has(base) || ALLOW_BASE.has(match)) return true;
  if (base.includes('🤍') || base.includes('❤') || base.includes('♥')) return true;
  return false;
}

const SKIP_DIR_PARTS = new Set(['vendor', 'node_modules']);
const SKIP_FILES = new Set(['admin.html']);

function walkPublicFiles(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIR_PARTS.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walkPublicFiles(full, out);
      continue;
    }
    if (SKIP_FILES.has(ent.name)) continue;
    if (!/\.(html|js|css)$/.test(ent.name)) continue;
    out.push(full);
  }
  return out;
}

const publicRoot = path.join(ROOT, 'public');
const files = walkPublicFiles(publicRoot);
const violations = [];

for (const file of files) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    EMOJI_RE.lastIndex = 0;
    let m;
    while ((m = EMOJI_RE.exec(line)) !== null) {
      if (isAllowed(m[0])) continue;
      violations.push({
        file: rel,
        line: i + 1,
        glyph: m[0],
        preview: line.trim().slice(0, 120),
      });
    }
  }
}

if (violations.length) {
  fail(`public metinlerde emoji kaldı (${violations.length})`);
  for (const v of violations.slice(0, 40)) {
    console.error(`    ${v.file}:${v.line} ${JSON.stringify(v.glyph)} | ${v.preview}`);
  }
  if (violations.length > 40) console.error(`    … +${violations.length - 40} daha`);
} else {
  ok(`public HTML/JS/CSS emoji-free (${files.length} dosya, allowlist ★☆ + kalp)`);
}

// Kategori / blog kategori icon public UI'da birleştirilmesin
const appJs = read('public/js/app.js');
const i18nJs = read('public/js/i18n.js');
const discoverJs = read('public/js/discover-places.js');
const blogsJs = read('server/routes/blogs.js');

if (/meta\.icon\s*\?\s*`\$\{meta\.icon\}/.test(appJs) || /meta\.icon\s*\?\s*`\$\{meta\.icon\}/.test(i18nJs)) {
  fail('catLabel hâlâ meta.icon önekliyor');
} else ok('catLabel kategori icon göstermiyor');

if (/const icon = c\.icon \? `\$\{c\.icon\}/.test(appJs)
  || /\$\{icon\}\$\{escapeHtml\(label\)\}/.test(appJs)) {
  fail('explore filtre çipleri hâlâ c.icon kullanıyor');
} else ok('explore filtre çiplerinde kategori icon yok');

if (/const icon = c\.icon \? `\$\{c\.icon\}/.test(discoverJs)
  || /\$\{icon\}\$\{catLabel/.test(discoverJs)) {
  fail('discover-places hâlâ kategori icon basıyor');
} else ok('discover-places kategori icon göstermiyor');

if (/c\.icon \? `\$\{c\.icon\} \$\{c\.name/.test(blogsJs)) {
  fail('blogs public label hâlâ icon içeriyor');
} else ok('blogs public label icon içermiyor');

const i18nKeys = [
  'discoverPickCity', 'heroPill', 'searchBtn', 'authSecure',
  'blogCatGuide', 'blogCatHidden', 'blogCatFood', 'blogCatNature', 'blogCatCulture',
  'detailTiolas', 'antiFraud', 'writeTiola', 'oneRatingPer', 'faqTitle',
];
for (const key of i18nKeys) {
  const re = new RegExp(`${key}:\\s*['"]([^'"]*)['"]`, 'g');
  let hit = 0;
  let m;
  while ((m = re.exec(i18nJs)) !== null) {
    hit += 1;
    EMOJI_RE.lastIndex = 0;
    const bad = [...m[1].matchAll(EMOJI_RE)].map((x) => x[0]).filter((g) => !isAllowed(g));
    if (bad.length) fail(`i18n ${key} emoji içeriyor: ${bad.join(' ')}`);
  }
  if (!hit) fail(`i18n anahtarı yok: ${key}`);
}
if (!failed) ok(`i18n hedef anahtarlar emoji-free (${i18nKeys.length})`);

const pkg = JSON.parse(read('package.json'));
if (pkg.scripts?.['verify:v6-adim4'] !== 'node server/scripts/verify-v6-adim4-emoji.js') {
  fail('package.json verify:v6-adim4 eksik/yanlış');
} else ok('package.json verify:v6-adim4');

if (failed) {
  console.error(`verify-v6-adim4-emoji FAILED (${failed})`);
  process.exit(1);
}
console.log('verify-v6-adim4-emoji OK');
