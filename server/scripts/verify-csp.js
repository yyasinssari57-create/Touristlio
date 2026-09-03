/**
 * [KRİTİK-6] CSP: nonce for inline scripts, no script-src 'unsafe-inline'.
 * Usage: node server/scripts/verify-csp.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { injectNonce } = require('../middleware/csp-nonce');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}

console.log('verify-csp');

const nonce = 'TESTNONCE123456';
const sample = [
  '<script src="/js/app.js?v=1"></script>',
  '<script>console.error("inline");</script>',
  '<script type="application/ld+json">{"@type":"WebSite"}</script>',
  '<script nonce="already">1;</script>',
].join('\n');
const injected = injectNonce(sample, nonce);
if (/<script src="\/js\/app\.js\?v=1" nonce=/.test(injected)) fail('external script got a nonce');
else ok('external <script src> untouched');
if (!injected.includes(`<script nonce="${nonce}">console.error`)) fail('inline block did not get the nonce');
else ok('inline <script> gets the nonce');
if (!injected.includes(`<script type="application/ld+json" nonce="${nonce}">`)) {
  fail('JSON-LD block did not get the nonce');
} else ok('JSON-LD block gets the nonce');
if ((injected.match(/nonce="already"/g) || []).length !== 1 || injected.includes('nonce="already" nonce=')) {
  fail('existing nonce was rewritten');
} else ok('existing nonce left alone');
if (injectNonce(sample, '') !== sample) fail('missing nonce should be a no-op');
else ok('no nonce → HTML unchanged');

const indexSrc = fs.readFileSync(path.join(ROOT, 'server/index.js'), 'utf8');
if (/scriptSrc:\s*\[[^\]]*'unsafe-inline'/s.test(indexSrc)) {
  fail("script-src still allows 'unsafe-inline'");
} else ok("script-src has no 'unsafe-inline'");
if (!indexSrc.includes("`'nonce-${res.locals.cspNonce}`") && !indexSrc.includes("'nonce-${res.locals.cspNonce}'")) {
  fail('script-src does not include the per-request nonce');
} else ok('script-src includes the per-request nonce');
if (!indexSrc.includes('cspNonceMiddleware()')) fail('nonce middleware not mounted');
else ok('nonce middleware mounted');
if (indexSrc.indexOf('cspNonceMiddleware()') > indexSrc.indexOf('app.use(helmet')) {
  fail('nonce middleware must run before helmet');
} else ok('nonce middleware runs before helmet');
if (!indexSrc.includes("objectSrc: [\"'none'\"]")) fail("object-src 'none' missing");
else ok("object-src 'none'");
if (!indexSrc.includes("baseUri: [\"'self'\"]")) fail("base-uri 'self' missing");
else ok("base-uri 'self'");
if (!indexSrc.includes('reportOnly: cspReportOnly')) fail('no report-only rollout switch');
else ok('CSP_REPORT_ONLY switch present');

const sender = fs.readFileSync(path.join(ROOT, 'server/lib/send-public-html.js'), 'utf8');
if (!sender.includes('injectNonce(html, nonceFromRes(res))')) {
  fail('sendPublicHtml does not inject the nonce');
} else ok('sendPublicHtml injects the nonce last');

function request(port, p, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port, path: p, method: 'GET', headers: headers || {},
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

function waitForServer(port, tries = 300) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      n += 1;
      const req = http.get({ hostname: '127.0.0.1', port, path: '/api/health', timeout: 1000 }, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (n >= tries) reject(new Error('server did not start'));
        else setTimeout(tick, 400);
      });
      req.on('timeout', () => {
        req.destroy();
        if (n >= tries) reject(new Error('server did not start'));
        else setTimeout(tick, 400);
      });
    };
    tick();
  });
}

async function checkLive() {
  const port = 3077;
  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'development',
      CSP_FORCE: 'true',
      SITEMAP_ON_START: 'false',
      LIVE_DATA_CRON: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (c) => { out += c; });
  child.stderr.on('data', (c) => { out += c; });
  try {
    await waitForServer(port);
    const pages = ['/', '/login', '/legal/kvkk.html', '/admin', '/search'];
    for (const p of pages) {
      const res = await request(port, p);
      const csp = res.headers['content-security-policy'] || '';
      if (res.status !== 200) {
        fail(`GET ${p} HTTP ${res.status}`);
        continue;
      }
      if (!csp) {
        fail(`GET ${p} has no CSP header`);
        continue;
      }
      const scriptSrc = (csp.split(';').find((d) => d.trim().startsWith('script-src ')) || '').trim();
      if (!scriptSrc) {
        fail(`GET ${p} CSP has no script-src`);
        continue;
      }
      if (scriptSrc.includes("'unsafe-inline'")) {
        fail(`GET ${p} script-src still has unsafe-inline`);
        continue;
      }
      const m = /'nonce-([A-Za-z0-9+/=]+)'/.exec(scriptSrc);
      if (!m) {
        fail(`GET ${p} script-src has no nonce`);
        continue;
      }
      const headerNonce = m[1];
      const inline = res.body.match(/<script\b(?![^>]*\bsrc=)[^>]*>/gi) || [];
      const missing = inline.filter((tag) => !tag.includes(`nonce="${headerNonce}"`));
      if (missing.length) {
        fail(`GET ${p} has ${missing.length} inline script(s) without the header nonce: ${missing[0].slice(0, 80)}`);
        continue;
      }
      ok(`GET ${p} → ${inline.length} inline script(s), all match CSP nonce`);
    }

    const a = await request(port, '/');
    const b = await request(port, '/');
    const na = /'nonce-([A-Za-z0-9+/=]+)'/.exec(a.headers['content-security-policy'] || '');
    const nb = /'nonce-([A-Za-z0-9+/=]+)'/.exec(b.headers['content-security-policy'] || '');
    if (!na || !nb || na[1] === nb[1]) fail('nonce is reused across requests');
    else ok('nonce is unique per request');
  } catch (e) {
    fail(`live CSP check :${port}: ${e.message} ${out.trim().slice(0, 200)}`);
  } finally {
    child.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 200));
    try { child.kill('SIGKILL'); } catch { /* ignore */ }
  }
}

checkLive().then(() => {
  if (failed) {
    console.error(`verify-csp FAILED (${failed})`);
    process.exit(1);
  }
  console.log('verify-csp OK');
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
