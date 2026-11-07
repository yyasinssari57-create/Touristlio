#!/usr/bin/env node
/**
 * V5 Adım 10 — küçük temizlikler:
 * XSS kaçışları, /uploads decodeURIComponent, datetime('now') → NOW(),
 * honeypot görünürlük ölçümü (kod değiştirmeden).
 *
 * Usage: npm run verify:v5-adim10
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const PUBLIC = path.join(ROOT, 'public');

let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) { console.error('  ✗', msg); failed += 1; }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

console.log('verify-v5-adim10-cleanup');

const appJs = read('public/js/app.js');
const appCode = stripComments(appJs);
const indexJs = read('server/index.js');

// --- 1–2: XSS escapes in saved places + error messages ---
const savedCard = appJs.match(/saved\.places\.map\(\(p\)\s*=>\s*`[\s\S]*?`\)\.join/);
if (!savedCard) {
  fail('kayıtlı yerler (saved.places.map) bulunamadı');
} else {
  const block = savedCard[0];
  if (!/\$\{escapeHtml\(p\.name\)\}/.test(block)) {
    fail('saved card pc-name escapeHtml(p.name) kullanmıyor');
  } else ok('saved card pc-name escapeHtml(p.name)');
  if (!/data-fallback-cat="\$\{escapeHtml\(p\.category\)/.test(block)) {
    fail('saved card data-fallback-cat escapeHtml(p.category) kullanmıyor');
  } else ok('saved card data-fallback-cat escapeHtml(p.category)');
}

const bareErr = [
  ...appCode.matchAll(/innerHTML\s*=\s*`[^`]*\$\{e\.message\}[^`]*`/g),
];
const residual = bareErr.filter((m) => !/escapeHtml\s*\(\s*e\.message\s*\)/.test(m[0]));
if (residual.length) {
  fail(`e.message innerHTML kaçışsız (${residual.length}): ${residual[0][0].slice(0, 80)}`);
} else ok('e.message innerHTML kaçışlı (tiola feed + blog grid)');

// Explicit sites from the guide
if (!/feed\.innerHTML\s*=\s*`<div class="no-res">\$\{escapeHtml\(e\.message\)\}<\/div>`/.test(appJs)) {
  fail('tiola feed e.message escapeHtml yok');
} else ok('tiola feed e.message escapeHtml');
if (!/grid\.innerHTML\s*=\s*`<div class="no-res">\$\{escapeHtml\(e\.message\)\}<\/div>`/.test(appJs)) {
  fail('blog grid e.message escapeHtml yok');
} else ok('blog grid e.message escapeHtml');

// --- 3: /uploads decodeURIComponent try/catch → 400 ---
const uploadsMw = indexJs.match(/app\.use\(\s*'\/uploads'[\s\S]*?express\.static\(UPLOADS_DIR\)\s*\)/);
if (!uploadsMw) {
  fail('/uploads middleware bulunamadı');
} else {
  const block = uploadsMw[0];
  if (!/try\s*\{[\s\S]*decodeURIComponent[\s\S]*\}\s*catch/.test(block)) {
    fail('/uploads decodeURIComponent try/catch yok');
  } else ok('/uploads decodeURIComponent try/catch');
  if (!/status\(\s*400\s*\)/.test(block)) {
    fail('/uploads hatalı % dizisinde 400 yok');
  } else ok('/uploads hatalı path → 400');
}

// --- 4: no datetime('now') in app/runtime SQL ---
const skip = new Set([
  path.join(ROOT, 'server/lib/pg-sql.js'),
  path.join(ROOT, 'server/scripts/verify-v5-adim10.js'),
  path.join(ROOT, 'server/scripts/verify-v5-adim9.js'),
]);
const hits = [];
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.git') continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.(js|sql)$/.test(ent.name)) continue;
    if (skip.has(full)) continue;
    const text = fs.readFileSync(full, 'utf8');
    if (/datetime\s*\(\s*'now'/i.test(text)) {
      hits.push(path.relative(ROOT, full));
    }
  }
}
walk(path.join(ROOT, 'server'));
walk(path.join(ROOT, 'db'));
if (hits.length) {
  fail(`datetime('now') kaldı: ${hits.slice(0, 8).join(', ')}${hits.length > 8 ? '…' : ''}`);
} else ok("datetime('now') uygulama SQL'inde yok (NOW() kullanılıyor)");

const authModel = read('server/modules/auth/auth.model.js');
const seedJs = read('server/seed.js');
if (!/\bNOW\s*\(\s*\)/.test(authModel)) fail('auth.model.js NOW() kullanmıyor');
else ok('auth.model.js NOW()');
if (!/\bNOW\s*\(\s*\)/.test(seedJs)) fail('seed.js NOW() kullanmıyor');
else ok('seed.js NOW()');

// --- 5: honeypot visibility (no code change) ---
function extractElement(html, id) {
  const openRe = new RegExp(`<([a-zA-Z0-9]+)([^>]*\\bid="${id}"[^>]*)>`, 'i');
  const open = openRe.exec(html);
  if (!open) return '';
  const tag = open[1].toLowerCase();
  const token = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  token.lastIndex = open.index;
  let depth = 0;
  let match;
  while ((match = token.exec(html))) {
    const selfClosing = /\/\s*>$/.test(match[0]);
    if (match[1] === '/') depth -= 1;
    else if (!selfClosing) depth += 1;
    if (depth === 0) return html.slice(open.index, token.lastIndex);
  }
  return '';
}

function chromeBin() {
  const fromEnv = process.env.CHROME_PATH;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  for (const candidate of [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/local/bin/google-chrome',
  ]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return '';
}

function contentType(file) {
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
  return 'application/octet-stream';
}

async function measureHoneypot() {
  const indexHtml = read('public/index.html');
  const contactHtml = read('public/legal/contact.html');
  const loginHtml = read('public/login.html');
  const registerHtml = read('public/register.html');
  const contact = extractElement(contactHtml, 'contactForm');
  const place = extractElement(indexHtml, 'tiolaDetailForm');
  const profile = extractElement(indexHtml, 'writeTiolaForm');
  const loginHp = (loginHtml.match(/<div class="tl-hp"[\s\S]*?<\/div>/) || [''])[0];
  const registerHp = (registerHtml.match(/<div class="tl-hp"[\s\S]*?<\/div>/) || [''])[0];

  const html = `<!DOCTYPE html>
<html lang="tr"><head><meta charset="utf-8"/>
<link rel="stylesheet" href="/css/style.css"/>
<link rel="stylesheet" href="/css/inline-overrides.css"/>
</head><body>
<form id="contactForm">${contact}</form>
<div id="tiolaDetailForm">${place}</div>
<div id="writeTiolaForm">${profile}</div>
<form id="loginForm">${loginHp}</form>
<form id="registerForm">${registerHp}</form>
<pre id="report">pending</pre>
<script>
try {
const ids = ['contactForm', 'tiolaDetailForm', 'writeTiolaForm', 'loginForm', 'registerForm'];
const rows = ids.map((id) => {
  const root = document.getElementById(id);
  const input = root && root.querySelector('input[name="website"]');
  const wrap = input && input.closest('.tl-hp');
  const cs = wrap ? getComputedStyle(wrap) : null;
  const rect = wrap ? wrap.getBoundingClientRect() : null;
  const onScreen = !!(rect && rect.width > 0 && rect.height > 0
    && rect.bottom > 0 && rect.right > 0
    && rect.left < window.innerWidth && rect.top < window.innerHeight);
  return {
    id: id,
    found: !!input,
    position: cs ? cs.position : '',
    left: cs ? cs.left : '',
    display: cs ? cs.display : '',
    visibility: cs ? cs.visibility : '',
    opacity: cs ? cs.opacity : '',
    onScreen: onScreen,
    leftPx: rect ? rect.left : null,
  };
});
document.getElementById('report').textContent = JSON.stringify({ rows: rows });
} catch (err) {
  document.getElementById('report').textContent = JSON.stringify({ error: String(err && err.stack || err) });
}
</script>
</body></html>`;

  const bin = chromeBin();
  if (!bin) {
    fail('Chrome yok — honeypot ölçümü atlandı');
    return;
  }

  const server = await new Promise((resolve, reject) => {
    const s = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
      if (urlPath === '/' || urlPath === '/fixture.html') {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end(html);
        return;
      }
      const file = path.normalize(path.join(PUBLIC, urlPath));
      if (!file.startsWith(PUBLIC)) {
        res.statusCode = 403;
        res.end('no');
        return;
      }
      fs.readFile(file, (err, data) => {
        if (err) {
          res.statusCode = 404;
          res.end('missing');
          return;
        }
        res.setHeader('content-type', contentType(file));
        res.end(data);
      });
    });
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => resolve(s));
  });

  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/fixture.html`;
  let stdout = '';
  try {
    stdout = await new Promise((resolve, reject) => {
      const child = spawn(bin, [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--window-size=1280,800',
        '--dump-dom',
        url,
      ], { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      let err = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('chrome zaman aşımı'));
      }, 25000);
      child.stdout.on('data', (c) => { out += c; });
      child.stderr.on('data', (c) => { err += c; });
      child.on('error', (e) => { clearTimeout(timer); reject(e); });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0 && !out.includes('id="report"')) {
          reject(new Error(`chrome ${code}: ${err.slice(-400)}`));
          return;
        }
        resolve(out);
      });
    });
  } finally {
    await new Promise((r) => server.close(() => r()));
  }

  const m = stdout.match(/<pre id="report">([\s\S]*?)<\/pre>/);
  if (!m) {
    fail('honeypot ölçüm raporu yok');
    return;
  }
  let report;
  try {
    report = JSON.parse(m[1]);
  } catch (e) {
    fail(`honeypot rapor JSON değil: ${e.message}`);
    return;
  }
  if (report.error) {
    fail(`honeypot ölçüm hatası: ${report.error}`);
    return;
  }

  const names = {
    contactForm: '/legal/contact.html',
    tiolaDetailForm: 'Tiola (mekân)',
    writeTiolaForm: 'Tiola (profil)',
    loginForm: '/login',
    registerForm: '/register',
  };
  for (const row of report.rows || []) {
    const name = names[row.id] || row.id;
    const left = parseFloat(row.left);
    if (!row.found) {
      fail(`${name}: website alanı yok`);
      continue;
    }
    if (row.onScreen || row.display === 'none' || row.visibility === 'hidden') {
      fail(`${name}: görünür veya display/visibility ile gizli (onScreen=${row.onScreen}, display=${row.display})`);
      continue;
    }
    if (row.position !== 'absolute' || !(left <= -9999)) {
      fail(`${name}: stil beklenen değil (position=${row.position}, left=${row.left})`);
      continue;
    }
    ok(`${name}: website ekranda değil — yanlış alarm (left=${row.left}, opacity=${row.opacity})`);
  }
}

async function main() {
  await measureHoneypot();

  // --- 6: session revoke is proposal-only (must NOT be implemented yet) ---
  const authMw = read('server/middleware/auth.js');
  if (/\btoken_version\b|\bsessions_valid_after\b/.test(authMw)) {
    fail('oturum iptali (token_version/sessions_valid_after) onaysız uygulanmış');
  } else {
    ok('oturum iptali uygulanmadı (öneri bekliyor — 30 gün süresi aynı)');
  }

  if (failed) {
    console.error(`\nverify-v5-adim10 FAILED (${failed})`);
    process.exit(1);
  }
  console.log('\nverify-v5-adim10 OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
