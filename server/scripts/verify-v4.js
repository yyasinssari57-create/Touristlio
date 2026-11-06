/**
 * V4 Adım 16 — kilitli kontroller tek komutta.
 *
 * Usage:
 *   npm run verify:v4
 *   npm run verify:v4-adim16
 *
 * Sırayla verify:v4-adim1 … verify:v4-adim15, sonra test:smoke.
 * Biri kırılırsa tur biter ve çıkış kodu 1 olur. Özet en sonda.
 *
 * Adım betikleri kendi ortam atlamalarını yapar (ör. veritabanı yoksa
 * Adım 3 canlı sorguyu atlar). Bu koşucu adım atlamaz.
 *
 * Yayından sonra, canlı siteye salt okunur:
 *   SMOKE_BASE_URL=https://www.touristlio.com npm run test:smoke
 *
 * CI aynı komutu çalıştırır: npm run verify:v4
 * Chrome gerekir (CHROME_PATH veya sistemdeki Google Chrome).
 * verify:v4 yerel Postgres ister (.env içindeki DATABASE_URL).
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const SELF = 'node server/scripts/verify-v4.js';

const STEPS = [];
for (let n = 1; n <= 15; n += 1) STEPS.push(`verify:v4-adim${n}`);
STEPS.push('test:smoke');

function readPackage() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
}

function scriptFile(script) {
  const match = /^node\s+(server\/scripts\/[a-z0-9._-]+\.js)$/.exec(String(script || '').trim());
  return match ? match[1] : '';
}

function main() {
  console.log('verify-v4 (Adım 16 — otomatik kontrol)');
  const pkg = readPackage();
  const scripts = pkg.scripts || {};
  let failed = 0;

  if (scripts['verify:v4'] !== SELF) {
    console.error('  ✗ package.json verify:v4 yok');
    failed += 1;
  } else console.log('  ✓ package.json verify:v4');

  if (scripts['verify:v4-adim16'] !== SELF) {
    console.error('  ✗ package.json verify:v4-adim16 yok');
    failed += 1;
  } else console.log('  ✓ package.json verify:v4-adim16');

  if (scripts['test:smoke'] !== 'node server/scripts/smoke-test.js') {
    console.error('  ✗ package.json test:smoke yok');
    failed += 1;
  } else console.log('  ✓ package.json test:smoke');

  const results = [];
  for (const name of STEPS) {
    const file = scriptFile(scripts[name]);
    const started = Date.now();
    console.log(`\n── npm run ${name} ──`);
    if (!file || !fs.existsSync(path.join(ROOT, file))) {
      console.error(`  ✗ ${name} betiği package.json içinde yok`);
      results.push({ name, ok: false, ms: Date.now() - started });
      failed += 1;
      continue;
    }
    const child = spawnSync(process.execPath, [path.join(ROOT, file)], {
      cwd: ROOT,
      env: process.env,
      stdio: 'inherit',
    });
    const ok = child.status === 0;
    const ms = Date.now() - started;
    if (!ok) {
      const why = child.error ? child.error.message : `çıkış ${child.status == null ? child.signal || 'yok' : child.status}`;
      console.error(`  ✗ ${name} kaldı (${why})`);
      failed += 1;
    }
    results.push({ name, ok, ms });
  }

  console.log('\n════════ V4 kontrol özeti ════════');
  for (const row of results) {
    const mark = row.ok ? '✓' : '✗';
    const sec = (row.ms / 1000).toFixed(1);
    console.log(`  ${mark} ${row.name} (${sec}s)`);
  }
  const passed = results.filter((row) => row.ok).length;
  const broken = results.filter((row) => !row.ok).map((row) => row.name);
  if (failed || broken.length) {
    console.error(`verify-v4 KALDI (${passed} geçti, ${broken.length} kaldı: ${broken.join(', ')})`);
    process.exit(1);
  }
  console.log(`verify-v4 TAMAM (${passed} kontrol)`);
}

main();
