/**
 * Claude Master PRD — FAZ4-4 (Focus outline).
 * Usage: npm run verify:faz4-4
 *
 * PRD: Klavye kullanıcıları için focus göstergesi yoktu.
 * button:focus-visible ve a:focus-visible eklenecek.
 * Mevcut tasarıma minimum etki, marka rengi kullanılacak.
 *
 * Buton çerçevesi onaylı a11y turunda (PR #61) vardı. Bağlantı
 * seçicisi eksikti. Bu betik ikisini de kilitler. Dinlenme hali,
 * renk ve yerleşim değişmez. Chrome varsa hesaplanan çerçeveyi de
 * ölçer.
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const PUBLIC = path.join(ROOT, 'public');
let failed = 0;

function ok(message) {
  console.log('  ✓', message);
}

function fail(message) {
  console.error('  ✗', message);
  failed += 1;
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function cssRules(css) {
  const rules = [];
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = re.exec(clean))) {
    const selectors = match[1].trim();
    if (!selectors || selectors.startsWith('@')) continue;
    rules.push({ selectors, body: match[2].replace(/\s+/g, '') });
  }
  return rules;
}

function selectorList(selectors) {
  return selectors.split(',').map((part) => part.trim()).filter(Boolean);
}

function normBody(body) {
  return String(body || '').replace(/;+$/g, '');
}

function ruleBodies(rules, needle) {
  return rules
    .filter((rule) => selectorList(rule.selectors).includes(needle))
    .map((rule) => normBody(rule.body));
}

function outlineNone(body) {
  return /(?:^|;)outline:(?:none|0)(?:!important)?(?:;|$)/.test(body);
}

function visibleOutline(body) {
  if (!body || outlineNone(body)) return false;
  return /(?:^|;)outline:/.test(body) || /(?:^|;)outline-style:(?:solid|dashed|dotted|double)/.test(body);
}

function focusBase(selector) {
  return selector
    .replace(/:focus-visible\b/g, '')
    .replace(/:focus-within\b/g, '')
    .replace(/:focus\b/g, '')
    .replace(/:hover\b/g, '')
    .replace(/:active\b/g, '')
    .trim();
}

console.log('verify-faz4-4 (klavye focus çerçevesi)');

const style = read('public/css/style.css');
const overrides = read('public/css/inline-overrides.css');
const rules = cssRules(`${style}\n${overrides}`);

const brand = 'outline:3pxsolidvar(--b2);outline-offset:2px';
const named = ['button:focus-visible', '.btn:focus-visible', 'a:focus-visible'];
for (const needle of named) {
  const bodies = ruleBodies(rules, needle);
  if (bodies.length !== 1 || bodies[0] !== brand) {
    fail(`${needle} marka çerçevesi değil: ${bodies.join(' | ') || 'yok'}`);
  } else ok(`${needle} → 3px solid var(--b2)`);
}

const globalFocus = ruleBodies(rules, ':focus-visible');
if (globalFocus.length !== 1 || globalFocus[0] !== brand) {
  fail(`genel :focus-visible marka çerçevesi değil: ${globalFocus.join(' | ') || 'yok'}`);
} else ok('genel :focus-visible marka --b2');

if (!/:root\{[^}]*--b2:#0284c7/.test(style.replace(/\s+/g, ''))) {
  fail('marka --b2 değişmiş');
} else ok('marka rengi --b2:#0284c7 duruyor');

const namedRule = rules.find((rule) => selectorList(rule.selectors).includes('a:focus-visible')
  && selectorList(rule.selectors).includes('button:focus-visible'));
if (!namedRule) fail('bağlantı ve buton aynı çerçeve kuralında değil');
else if (/color:|background|border(?!-)|box-shadow|text-decoration|transform:|padding:|margin:/.test(namedRule.body)) {
  fail('focus kuralı dinlenme görünümünü de değiştiriyor');
} else ok('focus kuralı yalnızca çerçeve; dinlenme hali yok');

const contrast = ruleBodies(rules, '.tl-nav :focus-visible');
const hero = ruleBodies(rules, '.hero :focus-visible');
if (contrast.length !== 1 || contrast[0] !== 'outline-color:#fff' || hero.length !== 1 || hero[0] !== 'outline-color:#fff') {
  fail('menü/hero klavye çerçevesi beyaz değil');
} else ok('koyu menü ve hero çerçevesi beyaz (mevcut kontrast)');

const skip = rules.filter((rule) => selectorList(rule.selectors).includes('.skip-link:focus-visible'));
if (!skip.length || !skip.some((rule) => rule.body.includes('outline:3pxsolid#fff') && rule.body.includes('top:8px'))) {
  fail('skip link klavyede görünür değil');
} else ok('skip link klavyede görünür');

let hidden = 0;
let restored = 0;
for (const rule of rules) {
  if (!outlineNone(rule.body)) continue;
  for (const selector of selectorList(rule.selectors)) {
    if (selector.includes(':focus-visible')) {
      fail(`${selector} klavye çerçevesini siliyor`);
      continue;
    }
    hidden += 1;
    const base = focusBase(selector);
    const companions = rules.filter((item) => selectorList(item.selectors).includes(`${base}:focus-visible`) && visibleOutline(item.body));
    if (!companions.length) fail(`${selector} outline:none ama :focus-visible geri gelmiyor`);
    else restored += 1;
  }
}
if (hidden && restored === hidden) ok(`outline:none ${hidden} kutu; hepsinde klavye çerçevesi geri geliyor`);
else if (!hidden) fail('outline:none taraması boş döndü');

const banned = ['a', 'a:focus', 'a:hover', 'button', 'button:focus', 'button:hover', '.btn', '.btn:focus'];
let wiped = 0;
for (const needle of banned) {
  const bad = ruleBodies(rules, needle).filter(outlineNone);
  if (bad.length) {
    wiped += 1;
    fail(`${needle} dinlenme/odak çerçevesini siliyor`);
  }
}
if (!wiped) ok('bağlantı ve buton dinlenme kuralı çerçeveyi silmiyor');

function contentType(file) {
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (file.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
}

function startFixture() {
  const html = `<!DOCTYPE html>
<html lang="tr"><head><meta charset="utf-8"/>
<link rel="stylesheet" href="/css/style.css"/>
<link rel="stylesheet" href="/css/inline-overrides.css"/>
<style>*,*::before,*::after{transition:none!important;animation:none!important}</style>
</head><body style="background:#f2f8ff">
<nav class="tl-nav"><a id="nav" href="#n">Menü</a></nav>
<main style="padding:120px 24px 40px">
<a id="link" href="#x">Düz bağlantı</a>
<button id="btn" class="btn" type="button">Buton</button>
<input id="ain" class="ain" value=""/>
<footer><a id="foot" href="#f">Yasal</a></footer>
<input id="blog" class="blog-search-inp" value=""/>
</main>
<pre id="report"></pre>
<script>
const cases = ['link','btn','nav','foot','ain','blog'];
const out = cases.map((id) => {
  const el = document.getElementById(id);
  const rest = getComputedStyle(el);
  const before = { style: rest.outlineStyle, width: rest.outlineWidth, color: rest.outlineColor };
  el.focus({ focusVisible: true });
  const live = getComputedStyle(el);
  const row = {
    id: id,
    restStyle: before.style,
    width: live.outlineWidth,
    style: live.outlineStyle,
    color: live.outlineColor,
    offset: live.outlineOffset
  };
  el.blur();
  return row;
});
document.getElementById('report').textContent = JSON.stringify(out);
</script>
</body></html>`;

  const server = http.createServer((req, res) => {
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
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function chromeBin() {
  const fromEnv = process.env.CHROME_PATH;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  for (const candidate of ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/local/bin/google-chrome']) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return '';
}

function runChrome(url) {
  const bin = chromeBin();
  if (!bin) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const child = spawn(bin, [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--dump-dom',
      url,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('chrome zaman aşımı'));
    }, 25000);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 && !stdout.includes('id="report"')) {
        reject(new Error(`chrome ${code}: ${stderr.slice(-400)}`));
        return;
      }
      resolve(stdout);
    });
  });
}

function expectRow(row, colorName) {
  const brandColor = 'rgb(2, 132, 199)';
  const white = 'rgb(255, 255, 255)';
  if (row.restStyle !== 'none') {
    fail(`${row.id} dinlenme halinde çerçeve stili ${row.restStyle}`);
    return;
  }
  if (row.style !== 'solid' || row.width !== '3px' || row.offset !== '2px') {
    fail(`${row.id} klavye çerçevesi ${row.style} ${row.width} offset ${row.offset}`);
    return;
  }
  const want = colorName === 'white' ? white : brandColor;
  if (row.color !== want) {
    fail(`${row.id} çerçeve rengi ${row.color} (${colorName} beklenirdi)`);
    return;
  }
  ok(`${row.id} klavye ${colorName === 'white' ? 'beyaz' : 'marka'} 3px; dinlenmede yok`);
}

(async () => {
  const bin = chromeBin();
  if (!bin) {
    ok('Chrome yok; hesaplanan stil atlandı');
  } else {
    let server;
    try {
      server = await startFixture();
      const port = server.address().port;
      const dom = await runChrome(`http://127.0.0.1:${port}/fixture.html`);
      const match = dom && dom.match(/<pre id="report">([^<]*)<\/pre>/);
      if (!match) fail('Chrome focus raporu okunamadı');
      else {
        const rows = JSON.parse(match[1].replace(/&quot;/g, '"'));
        const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
        expectRow(byId.link, 'brand');
        expectRow(byId.btn, 'brand');
        expectRow(byId.nav, 'white');
        expectRow(byId.foot, 'brand');
        expectRow(byId.ain, 'brand');
        expectRow(byId.blog, 'white');
      }
    } catch (err) {
      fail(`Chrome ölçümü: ${err.message}`);
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve));
    }
  }

  if (failed) {
    console.error(`verify-faz4-4 FAILED (${failed})`);
    process.exit(1);
  }
  console.log('verify-faz4-4 OK');
})();
