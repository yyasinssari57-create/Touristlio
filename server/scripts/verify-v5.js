#!/usr/bin/env node
/**
 * V5 Adım 13 — tek komutla kontrol.
 *
 * Usage:
 *   npm run verify:v5
 *   npm run verify:v5-adim13
 *
 * Sırayla verify:v5-adim1 … verify:v5-adim12 çalıştırır.
 * Biri kırılırsa tur biter ve çıkış kodu 1 olur. Özet en sonda.
 *
 * Rehberdeki kilitler (Adım 13):
 * - ADMIN seed ikinci çalıştırmada hash değiştirmez (adım1)
 * - JWT production varsayılan/zayıf anahtarla başlamaz (adım2)
 * - npm audit --omit=dev kritik/yüksek yok (adım3)
 * - Log'larda token= yok; DB'de ham token yok (adım4)
 * - CSRF'siz yazma mount'u yok (adım5)
 * - /api/health yalnız ok (adım6)
 * - /en/blog boşken noindex + sitemap dışı (adım8)
 * - Sitemap DB hatasında 503/önbellek, kısmi 200 değil (adım9)
 * Ayrıca adım7/10/11/12 kilitleri de bu süitte kalır.
 *
 * Adım betikleri kendi ortam atlamalarını yapar. Bu koşucu adım atlamaz.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const SELF = 'node server/scripts/verify-v5.js';

const STEPS = [];
for (let n = 1; n <= 12; n += 1) STEPS.push(`verify:v5-adim${n}`);

/** Rehber Adım 13'te adı geçen kontroller (özet satırında işaretlenir). */
const GUIDE_STEPS = new Set([
  'verify:v5-adim1',
  'verify:v5-adim2',
  'verify:v5-adim3',
  'verify:v5-adim4',
  'verify:v5-adim5',
  'verify:v5-adim6',
  'verify:v5-adim8',
  'verify:v5-adim9',
]);

function readPackage() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
}

function scriptFile(script) {
  const match = /^node\s+(server\/scripts\/[a-z0-9._-]+\.js)$/.exec(String(script || '').trim());
  return match ? match[1] : '';
}

function main() {
  console.log('verify-v5 (Adım 13 — tek komutla kontrol)');
  const pkg = readPackage();
  const scripts = pkg.scripts || {};
  let failed = 0;

  if (scripts['verify:v5'] !== SELF) {
    console.error('  ✗ package.json verify:v5 yok');
    failed += 1;
  } else console.log('  ✓ package.json verify:v5');

  if (scripts['verify:v5-adim13'] !== SELF) {
    console.error('  ✗ package.json verify:v5-adim13 yok');
    failed += 1;
  } else console.log('  ✓ package.json verify:v5-adim13');

  const results = [];
  for (const name of STEPS) {
    const file = scriptFile(scripts[name]);
    const started = Date.now();
    console.log(`\n── npm run ${name} ──`);
    if (!file || !fs.existsSync(path.join(ROOT, file))) {
      console.error(`  ✗ ${name} betiği package.json içinde yok`);
      results.push({ name, ok: false, ms: Date.now() - started, guide: GUIDE_STEPS.has(name) });
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
      const why = child.error
        ? child.error.message
        : `çıkış ${child.status == null ? child.signal || 'yok' : child.status}`;
      console.error(`  ✗ ${name} kaldı (${why})`);
      failed += 1;
    }
    results.push({ name, ok, ms, guide: GUIDE_STEPS.has(name) });
  }

  console.log('\n════════ V5 kontrol özeti ════════');
  for (const row of results) {
    const mark = row.ok ? '✓' : '✗';
    const sec = (row.ms / 1000).toFixed(1);
    const tag = row.guide ? ' [rehber]' : '';
    console.log(`  ${mark} ${row.name} (${sec}s)${tag}`);
  }

  console.log('\n── Rehber Adım 13 maddeleri ──');
  const guideLabels = {
    'verify:v5-adim1': 'ADMIN: seed ikinci çalıştırmada hash değişmez',
    'verify:v5-adim2': 'JWT: production varsayılan/zayıf anahtarla başlamaz',
    'verify:v5-adim3': 'npm audit --omit=dev: kritik/yüksek yok',
    'verify:v5-adim4': 'Log token= yok; DB ham token yok',
    'verify:v5-adim5': 'CSRF’siz yazma mount’u yok',
    'verify:v5-adim6': '/api/health yalnız ok',
    'verify:v5-adim8': '/en/blog boşken noindex + sitemap dışı',
    'verify:v5-adim9': 'Sitemap DB hatasında 503/önbellek',
  };
  for (const name of [
    'verify:v5-adim1',
    'verify:v5-adim2',
    'verify:v5-adim3',
    'verify:v5-adim4',
    'verify:v5-adim5',
    'verify:v5-adim6',
    'verify:v5-adim8',
    'verify:v5-adim9',
  ]) {
    const row = results.find((r) => r.name === name);
    const mark = row && row.ok ? '✓' : '✗';
    console.log(`  ${mark} ${guideLabels[name]}`);
  }

  const passed = results.filter((row) => row.ok).length;
  const broken = results.filter((row) => !row.ok).map((row) => row.name);
  if (failed || broken.length) {
    console.error(`verify-v5 KALDI (${passed} geçti, ${broken.length} kaldı: ${broken.join(', ')})`);
    process.exit(1);
  }
  console.log(`verify-v5 TAMAM (${passed} kontrol)`);
}

main();
