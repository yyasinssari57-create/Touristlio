#!/usr/bin/env node
/**
 * V6 — tek komutla kontrol (şimdilik Adım 1–4).
 * Adım 8/9/12 kilitleri sonraki adımlarda eklenecek.
 *
 * Usage: npm run verify:v6
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
];

function readPackage() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
}

function scriptFile(script) {
  const match = /^node\s+(server\/scripts\/[a-z0-9._-]+\.js)$/.exec(String(script || '').trim());
  return match ? match[1] : '';
}

function main() {
  console.log('verify-v6 (Adım 1–4)');
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
      results.push({ name, ok: false, ms: Date.now() - started });
      failed += 1;
      break;
    }
    const run = spawnSync('npm', ['run', name], {
      cwd: ROOT,
      encoding: 'utf8',
      env: process.env,
      stdio: 'inherit',
    });
    const ok = run.status === 0;
    results.push({ name, ok, ms: Date.now() - started });
    if (!ok) {
      failed += 1;
      break;
    }
  }

  console.log('\n── özet ──');
  for (const r of results) {
    console.log(`  ${r.ok ? '✓' : '✗'} ${r.name} (${r.ms}ms)`);
  }
  if (failed) {
    console.error(`verify-v6 KALDI (${results.filter((r) => r.ok).length} geçti)`);
    process.exit(1);
  }
  console.log(`verify-v6 TAMAM (${results.length} kontrol)`);
}

main();
