#!/usr/bin/env node
/**
 * V5 Adım 3 — güvenlik açığı olan paketler güncellendi.
 *
 * Usage: npm run verify:v5-adim3
 *
 * Checks installed versions, npm audit --omit=dev (no critical/high),
 * and smoke-loads multer/sharp/nodemailer/file-type/node-cron APIs.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;

function ok(message) {
  console.log('  ✓', message);
}

function fail(message) {
  console.error('  ✗', message);
  failed += 1;
}

function pkgVersion(name) {
  const pkgPath = path.join(ROOT, 'node_modules', name, 'package.json');
  if (!fs.existsSync(pkgPath)) return null;
  return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;
}

function assertAtLeast(name, minParts) {
  const v = pkgVersion(name);
  if (!v) {
    fail(`${name} yüklü değil`);
    return;
  }
  const parts = String(v).split('.').map((n) => Number(n));
  const a = parts.concat([0, 0, 0]).slice(0, 3);
  const b = minParts.concat([0, 0, 0]).slice(0, 3);
  const ge = a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] >= b[2])));
  if (!ge) fail(`${name} sürümü düşük: ${v} (min ${minParts.join('.')})`);
  else ok(`${name}@${v}`);
}

async function main() {
  console.log('verify-v5-adim3-deps');

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  if (!pkg.dependencies?.nodemailer || !String(pkg.dependencies.nodemailer).includes('10')) {
    fail('package.json nodemailer 10.x olmalı');
  } else ok('package.json nodemailer 10.x');
  if (!pkg.dependencies?.['file-type'] || !String(pkg.dependencies['file-type']).includes('21')) {
    fail('package.json file-type 21.x olmalı');
  } else ok('package.json file-type 21.x');
  if (!pkg.dependencies?.['node-cron'] || !String(pkg.dependencies['node-cron']).includes('4')) {
    fail('package.json node-cron 4.x olmalı');
  } else ok('package.json node-cron 4.x');
  if (pkg.overrides?.qs !== '6.17.1') {
    fail('package.json overrides.qs = 6.17.1 olmalı');
  } else ok('overrides.qs = 6.17.1');

  assertAtLeast('express', [4, 22, 2]);
  assertAtLeast('multer', [2, 5, 0]);
  assertAtLeast('sharp', [0, 35, 5]);
  assertAtLeast('nodemailer', [10, 3, 1]);
  assertAtLeast('file-type', [21, 3, 4]);
  assertAtLeast('node-cron', [4, 6, 0]);
  assertAtLeast('body-parser', [1, 20, 9]);
  assertAtLeast('proxy-addr', [2, 0, 8]);
  assertAtLeast('qs', [6, 17, 1]);

  const audit = spawnSync('npm', ['audit', '--omit=dev', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  let report;
  try {
    report = JSON.parse(audit.stdout || '{}');
  } catch {
    fail('npm audit JSON okunamadı');
    report = {};
  }
  const vulns = report.vulnerabilities || {};
  const criticalHigh = Object.entries(vulns).filter(([, v]) => {
    const sev = String(v?.severity || '').toLowerCase();
    return sev === 'critical' || sev === 'high';
  });
  const total = typeof report.metadata?.vulnerabilities?.total === 'number'
    ? report.metadata.vulnerabilities.total
    : Object.keys(vulns).length;
  if (criticalHigh.length) {
    fail(`kritik/yüksek açık kaldı: ${criticalHigh.map(([n, v]) => `${n}(${v.severity})`).join(', ')}`);
  } else {
    ok(`npm audit --omit=dev: kritik/yüksek yok (toplam ${total})`);
  }

  // multer / sharp / nodemailer / node-cron / file-type smoke
  const multer = require('multer');
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
  if (typeof upload.single !== 'function') fail('multer.single yok');
  else ok('multer memoryStorage + single hazır');

  const sharp = require('sharp');
  const buf = await sharp({
    create: { width: 16, height: 12, channels: 3, background: { r: 10, g: 20, b: 30 } },
  }).jpeg().toBuffer();
  const meta = await sharp(buf).metadata();
  if (meta.format !== 'jpeg') fail(`sharp jpeg üretmedi: ${meta.format}`);
  else ok('sharp JPEG üretimi çalışıyor');

  const nodemailer = require('nodemailer');
  const tx = nodemailer.createTransport({
    host: '127.0.0.1',
    port: 2525,
    secure: false,
    tls: { rejectUnauthorized: false },
  });
  if (typeof tx.sendMail !== 'function') fail('nodemailer.createTransport.sendMail yok');
  else ok('nodemailer.createTransport API çalışıyor (gönderim yok)');
  if (typeof tx.close === 'function') tx.close();

  const cron = require('node-cron');
  if (!cron.validate('0 */6 * * *') || !cron.validate('*/5 * * * *')) {
    fail('node-cron ifadeleri geçersiz');
  } else ok('node-cron canlı veri + blog ifadeleri geçerli');
  const job = cron.schedule('0 */6 * * *', () => {}, { scheduled: false });
  if (typeof job.start !== 'function' || typeof job.stop !== 'function') {
    fail('node-cron schedule API eksik');
  } else {
    ok('node-cron schedule API (start/stop) hazır');
    try { job.stop(); } catch { /* ignore */ }
  }

  const { detectImageMimeFromBuffer, isAllowedImageMime } = require('../lib/image-mime');
  const jpegMime = await detectImageMimeFromBuffer(buf);
  if (!isAllowedImageMime(jpegMime)) fail(`file-type magic-byte JPEG algılamadı: ${jpegMime}`);
  else ok(`file-type magic-byte JPEG → ${jpegMime}`);
  const spoof = await detectImageMimeFromBuffer(Buffer.from('not-an-image'));
  if (spoof) fail(`düz metin mime döndü: ${spoof}`);
  else ok('file-type düz metni reddetti');

  // Require path still CJS-safe for image-mime (no top-level require('file-type'))
  const mimeSrc = fs.readFileSync(path.join(ROOT, 'server/lib/image-mime.js'), 'utf8');
  if (/require\(['"]file-type['"]\)/.test(mimeSrc)) {
    fail('image-mime.js hâlâ require("file-type") kullanıyor (ESM kırılır)');
  } else ok('image-mime.js dinamik import("file-type") kullanıyor');

  if (failed) {
    console.error(`\nverify-v5-adim3 FAILED (${failed})`);
    process.exit(1);
  }
  console.log('\nverify-v5-adim3 OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
