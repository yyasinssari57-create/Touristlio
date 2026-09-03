/**
 * [KRİTİK-5] Legal placeholders + cookie-reject analytics gate.
 * Usage: node server/scripts/verify-legal-placeholders.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const LEGAL_DIR = path.join(ROOT, 'public', 'legal');
const PLACEHOLDER_RE = /güncellenecektir|domain yayını sonrası|yasal unvan|buraya yazın|\bTBD\b|\bTODO\b|doldurun/i;
const MARKER = 'DOLDURULACAK';

let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}

console.log('verify-legal-placeholders');
console.log('Legal placeholder list:');

const files = ['privacy.html', 'kvkk.html', 'terms.html', 'about.html', 'contact.html'];
const found = [];
for (const name of files) {
  const file = path.join(LEGAL_DIR, name);
  if (!fs.existsSync(file)) {
    fail(`missing ${name}`);
    continue;
  }
  const html = fs.readFileSync(file, 'utf8');
  const lines = html.split('\n');
  lines.forEach((line, i) => {
    if (line.includes('data-i18n-placeholder') || line.includes('placeholder="')) return;
    if (PLACEHOLDER_RE.test(line) || line.includes(MARKER)) {
      const text = line.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      found.push({ file: `public/legal/${name}`, line: i + 1, text });
    }
  });
}

if (!found.length) {
  console.log('  (none — no leftover phrases and no DOLDURULACAK marks)');
} else {
  for (const row of found) {
    console.log(`  - ${row.file}:${row.line}  ${row.text.slice(0, 160)}`);
  }
}

const kvkk = fs.readFileSync(path.join(LEGAL_DIR, 'kvkk.html'), 'utf8');
if (!/Veri sorumlusu:<\/strong>/.test(kvkk)) fail('kvkk.html missing Veri sorumlusu line');
else ok('kvkk.html states a data controller');
if (kvkk.includes('DOLDURULACAK')) {
  fail('kvkk.html still shows a DOLDURULACAK placeholder to visitors');
} else ok('no DOLDURULACAK placeholder left on the live page');
if (!/touristlio\.info@gmail\.com/.test(kvkk)) {
  fail('kvkk.html controller has no contact channel');
} else ok('controller has a working contact channel');
if (/yasal unvan ve adres domain yayını sonrası güncellenecektir/.test(kvkk)) {
  fail('kvkk.html still has unmarked “güncellenecektir” placeholder');
} else ok('unmarked “güncellenecektir” phrase removed');
if (/SQLite/.test(kvkk)) fail('kvkk.html still says SQLite');
else ok('kvkk.html storage text is not SQLite');

const privacy = fs.readFileSync(path.join(LEGAL_DIR, 'privacy.html'), 'utf8');
const terms = fs.readFileSync(path.join(LEGAL_DIR, 'terms.html'), 'utf8');
if (PLACEHOLDER_RE.test(privacy.replace(/placeholder=/g, ''))) fail('privacy.html has unmarked placeholder phrase');
else ok('privacy.html has no TBD/TODO/güncellenecektir leftovers');
if (PLACEHOLDER_RE.test(terms)) fail('terms.html has unmarked placeholder phrase');
else ok('terms.html has no TBD/TODO/güncellenecektir leftovers');

const cookieJs = fs.readFileSync(path.join(ROOT, 'public/js/cookie-banner.js'), 'utf8');
if (!cookieJs.includes("cookie_consent") || !cookieJs.includes("'rejected'") || !cookieJs.includes("'accepted'")) {
  fail('cookie-banner does not persist cookie_consent accepted/rejected');
} else ok('reject stores cookie_consent=rejected');
if (!cookieJs.includes("localStorage.setItem(KEY, accepted ? '1' : '0')") && !cookieJs.includes("setItem(KEY, '0')")) {
  if (!cookieJs.includes("accepted ? '1' : '0'")) fail('cookie-banner missing tl_cookie_ok write');
  else ok('tl_cookie_ok still written');
} else ok('tl_cookie_ok still written');

const analyticsJs = fs.readFileSync(path.join(ROOT, 'public/js/analytics.js'), 'utf8');
if (!analyticsJs.includes('if (!hasConsent()) return') || !analyticsJs.includes('loadGa4')) {
  fail('analytics.js missing consent gate / GA loader');
} else ok('GA4 loader is consent-gated');
if (!analyticsJs.includes("CONSENT_KEY === '0'") && !analyticsJs.includes("getItem(CONSENT_KEY) === '0'")) {
  fail('analytics.js does not treat reject (0) as no consent');
} else ok('rejected consent does not load analytics');
if (analyticsJs.includes("document.write") && analyticsJs.includes('gtag/js')) {
  fail('GA snippet is hardcoded');
}

if (failed) {
  console.error(`verify-legal-placeholders FAILED (${failed})`);
  process.exit(1);
}
console.log('verify-legal-placeholders OK');
