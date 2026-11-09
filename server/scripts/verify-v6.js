#!/usr/bin/env node
/**
 * V6 Adım 12 — tek komutla kontrol (final aggregator).
 *
 * Usage:
 *   npm run verify:v6
 *   npm run verify:v6-adim12  (kılavuz + aggregator kilitleri; bu dosya tüm adımları koşturur)
 *
 * Sırayla verify:v6-adim1 … verify:v6-adim10, sonra verify:v6-adim12 çalıştırır.
 * Adım 11 (h1 ölçümü, onaylı) rehberde skip/bayat; aggregator’a dahil değil.
 * Biri kırılırsa tur biter ve çıkış kodu 1 olur. Özet en sonda.
 *
 * Rehberdeki Adım 12 kilitleri:
 * - Client robots ezmesi yok (adım1)
 * - Public metinlerde emoji yok (adım4)
 * - EN boş satır gizleme (adım8)
 * - Slug değişince yönlendirme (adım9)
 * Ayrıca adım2–3,5–7,10 ve adım12 (kılavuz) kilitleri de bu süitte kalır.
 *
 * Adım betikleri kendi ortam atlamalarını yapar. Bu koşucu adım atlamaz.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const SELF = 'node server/scripts/verify-v6.js';

const STEPS = [
  'verify:v6-adim1',
  'verify:v6-adim2',
  'verify:v6-adim3',
  'verify:v6-adim4',
  'verify:v6-adim5',
  'verify:v6-adim6',
  'verify:v6-adim7',
  'verify:v6-adim8',
  'verify:v6-adim9',
  'verify:v6-adim10',
  'verify:v6-adim12',
];

/** Rehber Adım 12’te adı geçen kontroller (özet satırında işaretlenir). */
const GUIDE_STEPS = new Set([
  'verify:v6-adim1',
  'verify:v6-adim4',
  'verify:v6-adim8',
  'verify:v6-adim9',
  'verify:v6-adim12',
]);

function readPackage() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
}

function scriptFile(script) {
  const match = /^node\s+(server\/scripts\/[a-z0-9._-]+\.js)$/.exec(String(script || '').trim());
  return match ? match[1] : '';
}

function main() {
  console.log('verify-v6 (Adım 12 — tek komutla kontrol)');
  const pkg = readPackage();
  const scripts = pkg.scripts || {};
  let failed = 0;

  if (scripts['verify:v6'] !== SELF) {
    console.error('  ✗ package.json verify:v6 yok');
    failed += 1;
  } else console.log('  ✓ package.json verify:v6');

  const results = [];
  for (const name of STEPS) {
    const file = scriptFile(scripts[name]);
    const started = Date.now();
    console.log(`\n── npm run ${name} ──`);
    if (!file || !fs.existsSync(path.join(ROOT, file))) {
      console.error(`  ✗ ${name} betiği package.json içinde yok`);
      results.push({ name, ok: false, ms: Date.now() - started, guide: GUIDE_STEPS.has(name) });
      failed += 1;
      break;
    }
    // Adım 12 kendini doğrular; aggregator içinde tekrar çalıştırırken
    // sonsuz döngü olmasın diye doğrudan betiği çağırırız (adım12 verify:v6 çağırmaz).
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
      results.push({ name, ok: false, ms, guide: GUIDE_STEPS.has(name) });
      break;
    }
    results.push({ name, ok: true, ms, guide: GUIDE_STEPS.has(name) });
  }

  console.log('\n════════ V6 kontrol özeti ════════');
  for (const row of results) {
    const mark = row.ok ? '✓' : '✗';
    const sec = (row.ms / 1000).toFixed(1);
    const tag = row.guide ? ' [rehber]' : '';
    console.log(`  ${mark} ${row.name} (${sec}s)${tag}`);
  }

  console.log('\n── Rehber Adım 12 maddeleri ──');
  const guideLabels = {
    'verify:v6-adim1': 'Client robots ezmesi yok (noindex korunur)',
    'verify:v6-adim4': 'Public metinlerde emoji yok (★/kalp hariç)',
    'verify:v6-adim8': 'EN boş satır gizleme + honeypot a11y',
    'verify:v6-adim9': 'Slug değişince otomatik 301',
    'verify:v6-adim12': 'Kılavuz güncel + verify:v6 aggregator',
  };
  for (const name of [
    'verify:v6-adim1',
    'verify:v6-adim4',
    'verify:v6-adim8',
    'verify:v6-adim9',
    'verify:v6-adim12',
  ]) {
    const row = results.find((r) => r.name === name);
    const mark = row && row.ok ? '✓' : '✗';
    console.log(`  ${mark} ${guideLabels[name]}`);
  }

  const passed = results.filter((row) => row.ok).length;
  const broken = results.filter((row) => !row.ok).map((row) => row.name);
  if (failed || broken.length) {
    console.error(`verify-v6 KALDI (${passed} geçti, ${broken.length} kaldı: ${broken.join(', ')})`);
    process.exit(1);
  }
  console.log(`verify-v6 TAMAM (${passed} kontrol)`);
}

main();
