#!/usr/bin/env node
/**
 * V6 Adım 12 — Kılavuz güncelliği + verify:v6 aggregator kilitleri.
 *
 * Rehberdeki Adım 12 maddeleri:
 * 1) Admin Kılavuz: sayaçlar, toplu arşiv/çöp + 15 gün, geri yükle, en iyi zaman,
 *    konaklama (şehir), slug uyarısı; TOC'ye bağlı yeni bölüm.
 * 2) npm run verify:v6: Adım 1–10 (+ bu adım) kilitlerini tek komutta çalıştırır;
 *    özellikle Adım 1 (robots), 4 (emoji), 8 (EN boş satır), 9 (slug 301).
 *
 * Usage: npm run verify:v6-adim12
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) { console.error('  ✗', msg); failed += 1; }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

console.log('verify-v6-adim12-kilavuz-verify');

const pkg = JSON.parse(read('package.json'));
if (pkg.scripts?.['verify:v6-adim12'] !== 'node server/scripts/verify-v6-adim12.js') {
  fail('package.json verify:v6-adim12 eksik/yanlış');
} else ok('package.json verify:v6-adim12');

if (pkg.scripts?.['verify:v6'] !== 'node server/scripts/verify-v6.js') {
  fail('package.json verify:v6 aggregator eksik/yanlış');
} else ok('package.json verify:v6');

const agg = read('server/scripts/verify-v6.js');
const adminHtml = read('public/admin.html');

/* ── 1. Aggregator Adım 1–10 + 12 ── */
const requiredSteps = [];
for (let n = 1; n <= 10; n += 1) requiredSteps.push(`verify:v6-adim${n}`);
requiredSteps.push('verify:v6-adim12');

for (const name of requiredSteps) {
  if (!agg.includes(`'${name}'`) && !agg.includes(`"${name}"`)) {
    fail(`verify-v6.js STEPS içinde ${name} yok`);
  }
  const script = pkg.scripts?.[name];
  if (!script || !/^node\s+server\/scripts\/[a-z0-9._-]+\.js$/.test(String(script).trim())) {
    fail(`package.json ${name} betiği yok`);
  }
}
if (failed === 0) ok('verify:v6 Adım 1–10 + 12 STEPS');

/* Rehber Adım 12’de adı geçen kilitler aggregator’da olmalı */
const guideLocks = [
  'verify:v6-adim1',
  'verify:v6-adim4',
  'verify:v6-adim8',
  'verify:v6-adim9',
];
for (const name of guideLocks) {
  if (!agg.includes(`'${name}'`) && !agg.includes(`"${name}"`)) {
    fail(`rehber kilidi aggregator’da yok: ${name}`);
  }
}
if (failed === 0 || guideLocks.every((n) => agg.includes(`'${n}'`))) {
  ok('rehber kilitleri: robots / emoji / EN gizleme / slug 301');
}

if (!agg.includes('GUIDE_STEPS') && !agg.includes('rehber')) {
  fail('verify-v6.js rehber özet etiketi yok');
} else ok('verify-v6 rehber özeti');

/* ── 2. Admin Kılavuz TOC + yeni bölüm ── */
const guideStart = adminHtml.indexOf('id="adm-guide"');
const guideEnd = adminHtml.indexOf('id="modalOverlay"');
if (guideStart < 0 || guideEnd < 0 || guideEnd <= guideStart) {
  fail('admin kılavuz bloğu bulunamadı');
} else ok('admin #adm-guide bloğu');

const guide = adminHtml.slice(guideStart, guideEnd);

if (!guide.includes('href="#guide-katalog-cop"') || !guide.includes('id="guide-katalog-cop"')) {
  fail('TOC / bölüm guide-katalog-cop eksik');
} else ok('TOC → guide-katalog-cop');

const topicNeedles = [
  ['15 gün', '15 gün kalıcı silme uyarısı'],
  ['KALICI', 'KALICI silme vurgusu'],
  ['Toplu sil (çöp)', 'toplu çöp'],
  ['Geri yükle', 'çöp geri yükleme'],
  ['Sayaç', 'sayaç şeridi'],
  ['Yayına hazır değil', 'satır eksik listesi'],
  ['En iyi zaman', 'en iyi zaman ayları'],
  ['Konaklama (şehir ortalaması)', 'şehir konaklama'],
  ["slug'ını değiştirmek", 'slug uyarısı'],
  ['Arşivle', 'çöp onayında Arşivle önerisi'],
];

for (const [needle, label] of topicNeedles) {
  if (!guide.includes(needle)) fail(`kılavuz eksik: ${label} («${needle}»)`);
}
if (failed === 0 || topicNeedles.every(([n]) => guide.includes(n))) {
  ok('kılavuz Adım 12 konuları');
}

/* İş akışları */
if (!guide.includes('Toplu çöp ve geri yükleme') || !guide.includes("Slug değişikliği")) {
  fail('kılavuz iş akışları (çöp / slug) eksik');
} else ok('iş akışları: çöp + slug');

/* Özet çöp bandı anlatımı */
if (!guide.includes('Çöp uyarısı') && !guide.includes('çöp bandı')) {
  fail('Özet çöp uyarı bandı kılavuzda yok');
} else ok('Özet çöp uyarı bandı anlatımı');

if (failed) {
  console.error(`verify-v6-adim12 KALDI (${failed} hata)`);
  process.exit(1);
}
console.log('verify-v6-adim12 TAMAM');
