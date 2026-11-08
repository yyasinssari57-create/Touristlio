/**
 * V4 Adım 12 — hide the Website honeypot. Do not remove it.
 * The server check stays. The field stays type=text, off-screen.
 * display:none is not allowed.
 *
 * Contact and the two Tiola forms are checked separately.
 * FAZ4-2 already locked .tl-hp at left:-10000px (further off-screen
 * than the guide's -9999px example). This script does not move it.
 *
 * Usage: npm run verify:v4-adim12
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

if (!process.env.LOG_LEVEL) process.env.LOG_LEVEL = 'silent';
const { honeypotGuard, isHoneypotFilled, HONEYPOT_FIELDS } = require('../middleware/honeypot');

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

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

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

function websiteTags(html) {
  return [...html.matchAll(/<input\b[^>]*\bname="website"[^>]*>/gi)].map((match) => match[0]);
}

function honeypotBlock(html) {
  const match = html.match(/<div class="tl-hp"[\s\S]*?<\/div>/);
  return match ? match[0] : '';
}

function cssRules(css) {
  const rules = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = re.exec(css))) {
    rules.push({ selectors: match[1].trim(), body: match[2].replace(/\s+/g, '') });
  }
  return rules;
}

function checkForm(name, html) {
  if (!html) {
    fail(`${name}: form bulunamadı`);
    return '';
  }
  const tags = websiteTags(html);
  if (tags.length !== 1) {
    fail(`${name}: ${tags.length} website alanı (1 olmalı)`);
    return '';
  }
  const tag = tags[0];
  const type = ((tag.match(/\btype="([^"]*)"/i) || [, 'text'])[1] || 'text').toLowerCase();
  const problems = [];
  if (type !== 'text') problems.push(`type=${type}`);
  if (!tag.includes('tabindex="-1"')) problems.push('tabindex yok');
  if (!tag.includes('autocomplete="off"')) problems.push('autocomplete yok');
  if (!tag.includes('aria-hidden="true"')) problems.push('input aria-hidden yok');
  if (/style\s*=\s*"[^"]*display\s*:\s*none/i.test(tag)) problems.push('input display:none');
  if (/type="hidden"/i.test(tag)) problems.push('type=hidden');
  const block = honeypotBlock(html);
  if (!block || !block.includes('name="website"')) problems.push('website .tl-hp içinde değil');
  if (!/<div class="tl-hp"[^>]*aria-hidden="true"/.test(block)) problems.push('kutu aria-hidden değil');
  if (/<label>\s*Website\b/i.test(block)) problems.push('görünür Website etiket metni duruyor (V6 Adım 8)');
  if (!/<label>\s*<input\b[^>]*\bname="website"/i.test(block)) problems.push('website alanı label içinde değil');
  const outside = html.replace(/<div class="tl-hp"[\s\S]*?<\/div>/g, '');
  if (/website/i.test(outside)) problems.push('Website yazısı gizli kutunun dışında');
  if (/display\s*:\s*none|visibility\s*:\s*hidden|type="hidden"/i.test(block)) {
    problems.push('gizleme display:none, visibility:hidden veya type=hidden');
  }
  if (problems.length) fail(`${name}: ${problems.join(', ')}`);
  else ok(`${name}: website alanı gizli (type=text, .tl-hp, autocomplete=off)`);
  return block;
}

function runGuard(body, fake) {
  let nexted = false;
  const res = {
    statusCode: 0,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.payload = obj; return this; },
  };
  honeypotGuard(fake)(
    { body, ip: '127.0.0.1', originalUrl: '/adim12' },
    res,
    () => { nexted = true; }
  );
  return { nexted, statusCode: res.statusCode, payload: res.payload };
}

function chromeBin() {
  const fromEnv = process.env.CHROME_PATH;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  for (const candidate of ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/local/bin/google-chrome']) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return '';
}

function contentType(file) {
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
  return 'application/octet-stream';
}

function startFixture(blocks) {
  const html = `<!DOCTYPE html>
<html lang="tr"><head><meta charset="utf-8"/>
<link rel="stylesheet" href="/css/style.css"/>
<link rel="stylesheet" href="/css/inline-overrides.css"/>
</head><body>
<form id="contactForm">${blocks.contact}</form>
<div id="tiolaDetailForm">${blocks.place}</div>
<div id="writeTiolaForm">${blocks.profile}</div>
<pre id="report">pending</pre>
<script src="/js/a11y.js"></script>
<script>
try {
if (window.TL_A11Y) window.TL_A11Y.ensureLabels(document);
const ids = ['contactForm', 'tiolaDetailForm', 'writeTiolaForm'];
const rows = ids.map((id) => {
  const root = document.getElementById(id);
  const input = root && root.querySelector('input[name="website"]');
  const wrap = input && input.closest('.tl-hp');
  const label = wrap && wrap.querySelector('label');
  const cs = wrap ? getComputedStyle(wrap) : null;
  const rect = wrap ? wrap.getBoundingClientRect() : null;
  const onScreen = !!(rect && rect.width > 0 && rect.height > 0
    && rect.bottom > 0 && rect.right > 0
    && rect.left < window.innerWidth && rect.top < window.innerHeight);
  const srOnly = [...document.querySelectorAll('label.sr-only')]
    .some((el) => /website/i.test(el.textContent || ''));
  return {
    id: id,
    found: !!input,
    type: input ? input.type : '',
    tabindex: input ? input.getAttribute('tabindex') : '',
    autocomplete: input ? input.getAttribute('autocomplete') : '',
    inputAria: input ? input.getAttribute('aria-hidden') : '',
    wrapAria: wrap ? wrap.getAttribute('aria-hidden') : '',
    position: cs ? cs.position : '',
    left: cs ? cs.left : '',
    display: cs ? cs.display : '',
    visibility: cs ? cs.visibility : '',
    opacity: cs ? cs.opacity : '',
    pointerEvents: cs ? cs.pointerEvents : '',
    onScreen: onScreen,
    labelHidden: !!(label && label.closest('[aria-hidden="true"]')),
    srOnly: srOnly
  };
});
const doc = document.documentElement;
const report = {
  rows: rows,
  scrollWidth: doc.scrollWidth,
  clientWidth: doc.clientWidth
};
document.getElementById('report').textContent = JSON.stringify(report);
} catch (err) {
  const slot = document.getElementById('report');
  if (slot) slot.textContent = JSON.stringify({ error: String(err && err.stack || err) });
}
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

function runChrome(url) {
  const bin = chromeBin();
  if (!bin) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const child = spawn(bin, [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1280,800',
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

function expectPainted(row) {
  const names = {
    contactForm: 'iletişim formu',
    tiolaDetailForm: 'mekân Tiola formu',
    writeTiolaForm: 'profil Tiola formu',
  };
  const name = names[row.id] || row.id;
  const left = parseFloat(row.left);
  const problems = [];
  if (!row.found) problems.push('alan yok');
  if (row.type !== 'text') problems.push(`type=${row.type}`);
  if (row.tabindex !== '-1') problems.push('tabindex');
  if (row.autocomplete !== 'off') problems.push('autocomplete');
  if (row.inputAria !== 'true' || row.wrapAria !== 'true') problems.push('aria-hidden');
  if (row.position !== 'absolute') problems.push(`position=${row.position}`);
  if (!(left <= -9999)) problems.push(`left=${row.left}`);
  if (row.display === 'none' || row.visibility === 'hidden') problems.push('display/visibility ile gizlenmiş');
  if (row.opacity !== '0') problems.push(`opacity=${row.opacity}`);
  if (row.pointerEvents !== 'none') problems.push(`pointer-events=${row.pointerEvents}`);
  if (row.onScreen) problems.push('ekranda görünüyor');
  if (!row.labelHidden) problems.push('etiket ekran okuyucuya açık');
  if (row.srOnly) problems.push('görünür Website etiketi eklenmiş');
  if (problems.length) fail(`${name}: ${problems.join(', ')}`);
  else ok(`${name}: hesaplanan stil absolute, left ${row.left}, opacity 0, ekranda değil`);
}

console.log('verify-v4-adim12 (honeypot gizleme)');

const indexHtml = read('public/index.html');
const contactHtml = read('public/legal/contact.html');
const contactForm = extractElement(contactHtml, 'contactForm');
const placeForm = extractElement(indexHtml, 'tiolaDetailForm');
const profileForm = extractElement(indexHtml, 'writeTiolaForm');

const blocks = {
  contact: checkForm('iletişim formu', contactForm),
  place: checkForm('mekân Tiola formu', placeForm),
  profile: checkForm('profil Tiola formu', profileForm),
};

if (contactForm && placeForm && profileForm
  && contactForm !== placeForm && placeForm !== profileForm && contactForm !== profileForm) {
  ok('üç form ayrı ayrı okundu');
} else if (contactForm || placeForm || profileForm) {
  fail('formlar birbirine karışmış');
}

const css = read('public/css/style.css') + '\n' + read('public/css/inline-overrides.css');
const rules = cssRules(css);
const exact = rules.filter((rule) => rule.selectors.split(',').some((part) => part.trim() === '.tl-hp'));
const body = exact[0] ? exact[0].body : '';
const leftMatch = body.match(/left:(-?\d+)px!important/);
const leftPx = leftMatch ? Number(leftMatch[1]) : null;
if (exact.length !== 1 || !body.includes('position:absolute!important') || leftPx == null || leftPx > -9999) {
  fail(`.tl-hp ekran dışında değil (left=${leftPx})`);
} else if (/display:none|visibility:hidden/i.test(body)) {
  fail('.tl-hp display:none veya visibility:hidden kullanıyor');
} else {
  ok(`.tl-hp position:absolute, left:${leftPx}px (rehber örneği -9999px; kilitli değer daha dışarıda)`);
}

const a11y = read('public/js/a11y.js');
if (!a11y.includes(".tl-hp") || !a11y.includes('aria-hidden="true"')) {
  fail('a11y.js honeypot etiketini görünür etiket taramasından çıkarmıyor');
} else ok('ekran okuyucu, honeypot için ayrı Website etiketi basmaz');

if (!Array.isArray(HONEYPOT_FIELDS) || HONEYPOT_FIELDS.join(',') !== 'website,url,homepage') {
  fail(`honeypot alan listesi değişmiş: ${(HONEYPOT_FIELDS || []).join(',')}`);
} else ok('sunucu hâlâ website, url ve homepage okur');

const empty = runGuard({ website: '', name: 'Yasin' }, { ok: true });
const blank = runGuard({ website: '   ' }, { ok: true });
const filled = runGuard({ website: 'http://spam.example' }, { ok: true, message: 'sahte' });
const hard = runGuard({ website: 'http://spam.example' });
if (!empty.nexted || !blank.nexted || isHoneypotFilled({ website: '' }) || isHoneypotFilled({ name: 'Yasin' })) {
  fail('boş honeypot isteği kesiyor');
} else if (!filled.nexted && filled.statusCode === 200 && filled.payload && filled.payload.ok === true && filled.payload.message === 'sahte'
  && !hard.nexted && hard.statusCode === 400) {
  ok('dolu website sahte başarıya düşer; boş alan bir sonraki adıma geçer');
} else {
  fail(`honeypot cevabı değişmiş: ${JSON.stringify({ filled, hard })}`);
}

const contactRoute = read('server/routes/contact.js');
const tiolaRoute = read('server/routes/tiolas.js');
if (!contactRoute.includes('honeypotGuard(CONTACT_OK)')) fail('iletişim rotası honeypot kontrolünü kaybetmiş');
else ok('POST /api/contact honeypot kontrolü duruyor');
if (!tiolaRoute.includes('honeypotGuard(TIOLA_OK)')) fail('Tiola rotası honeypot kontrolünü kaybetmiş');
else ok('POST /api/tiolas honeypot kontrolü duruyor');

(async () => {
  const bin = chromeBin();
  if (!bin) {
    ok('Chrome yok; hesaplanan stil atlandı');
  } else if (!blocks.contact || !blocks.place || !blocks.profile) {
    fail('Chrome ölçümü için üç gizli kutu da gerekli');
  } else {
    let server;
    try {
      server = await startFixture(blocks);
      const port = server.address().port;
      const dom = await runChrome(`http://127.0.0.1:${port}/fixture.html`);
      const match = dom && dom.match(/<pre id="report">([^<]*)<\/pre>/);
      if (!match) fail('Chrome honeypot raporu okunamadı');
      else {
        const json = match[1]
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&#39;/g, "'");
        const report = JSON.parse(json);
        if (report.error) {
          fail(`Chrome sayfa betiği: ${String(report.error).split('\n')[0]}`);
        } else {
          for (const row of report.rows) expectPainted(row);
          if (report.scrollWidth > report.clientWidth + 1) {
            fail(`honeypot yatay kaydırma açtı (${report.scrollWidth} > ${report.clientWidth})`);
          } else ok('üç gizli kutu yatay kaydırma açmıyor');
        }
      }
    } catch (err) {
      fail(`Chrome ölçümü: ${err.message}`);
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve));
    }
  }

  const faz = spawnSync(process.execPath, [path.join(__dirname, 'verify-faz4-2-honeypot.js')], {
    stdio: 'inherit',
  });
  if (faz.status !== 0) fail('verify:faz4-2 geçmedi');
  else ok('verify:faz4-2 kiliti duruyor');

  if (failed) {
    console.error(`verify-v4-adim12 FAILED (${failed})`);
    process.exit(1);
  }
  console.log('verify-v4-adim12 OK');
})();
