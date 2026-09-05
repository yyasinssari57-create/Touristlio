/**
 * [DÜŞÜK-5 / v2 DÜŞÜK-1] Code cleanup: prod console silence, unused files/deps,
 * CSS merge leftovers, .env.example keys.
 * Usage: node server/scripts/verify-code-cleanup.js
 * Optional: VERIFY_CLEANUP_URL=http://127.0.0.1:3065 node server/scripts/verify-code-cleanup.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}

console.log('verify-code-cleanup');

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    if (name.name === 'node_modules' || name.name === '.git' || name.name === 'vendor') continue;
    const full = path.join(dir, name.name);
    if (name.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

const gone = [
  '_audit_git_out.js',
  'server/extract-css.js',
  'server/extract-places.js',
  'server/build-html.js',
  'public/images/_make-transparent.html',
];
for (const rel of gone) {
  if (fs.existsSync(path.join(ROOT, rel))) fail(`unused file still present: ${rel}`);
  else ok(`removed ${rel}`);
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
if (!pkg.scripts['verify:cleanup']) fail('package.json missing verify:cleanup');
else ok('verify:cleanup script');

const codeFiles = walk(ROOT).filter((f) => {
  const rel = path.relative(ROOT, f);
  if (rel === 'package.json' || rel === 'package-lock.json') return false;
  return /\.(js|html|css)$/.test(f);
});
const corpus = codeFiles.map((f) => {
  try { return fs.readFileSync(f, 'utf8'); } catch { return ''; }
}).join('\n');

for (const name of Object.keys(pkg.dependencies || {})) {
  const used = corpus.includes(`require('${name}')`)
    || corpus.includes(`require("${name}")`)
    || corpus.includes(`'${name}'`)
    || corpus.includes(`"${name}"`);
  if (!used) fail(`unused package.json dependency: ${name}`);
  else ok(`dep used: ${name}`);
}

const css = fs.readFileSync(path.join(ROOT, 'public', 'css', 'style.css'), 'utf8');
const dualCount = (css.match(/\.dual-rat\{/g) || []).length;
if (dualCount !== 1) fail(`.dual-rat defined ${dualCount} times`);
else ok('single .dual-rat rule');

const rootCount = (css.match(/:root\{/g) || []).length;
if (rootCount !== 1) fail(`:root defined ${rootCount} times`);
else ok('single :root block');

if (!css.includes('--nav-h:68px')) fail('merged --nav-h missing from :root');
else ok('--nav-h in :root');

if (css.includes('.admin-wrap{') || css.includes('.status-pending{') || css.includes('.photo-preview{')) {
  fail('dead CSS still in style.css (admin-wrap / status-pending / photo-preview)');
} else ok('dead extract-css leftovers removed');

const helmetSrc = fs.readFileSync(path.join(ROOT, 'server', 'index.js'), 'utf8');
if (/unpkg\.com/.test(helmetSrc)) fail('CSP still allows unused unpkg.com');
else ok('CSP does not include unpkg.com');

const htmlFiles = walk(path.join(ROOT, 'public')).filter((f) => f.endsWith('.html') && !f.includes(`${path.sep}vendor${path.sep}`));
const htmlJoined = htmlFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const htmlFont = (htmlJoined.match(/fonts\.googleapis\.com\/css2\?family=Inter/g) || []).length;
const cssFont = (css.match(/fonts\.googleapis\.com\/css2\?family=Inter/g) || []).length;
if (htmlFont !== 0) fail(`duplicate Inter <link> still in HTML (${htmlFont})`);
else ok('Inter loaded once via CSS @import');
if (cssFont !== 1) fail(`Inter @import count ${cssFont}`);
else ok('single Inter @import');

const catalog = fs.readFileSync(path.join(ROOT, 'server', 'lib', 'catalog-db.js'), 'utf8');
const normCount = (catalog.match(/function normalizeCategorySlug/g) || []).length;
if (normCount !== 1) fail(`normalizeCategorySlug defined ${normCount} times`);
else ok('single normalizeCategorySlug');

const slugifySrc = fs.readFileSync(path.join(ROOT, 'server', 'lib', 'slugify.js'), 'utf8');
if (!slugifySrc.includes('function slugify') || !catalog.includes("require('./slugify')")) {
  fail('shared slugify helper missing');
} else ok('shared slugify helper');

const cityImages = fs.readFileSync(path.join(ROOT, 'server', 'lib', 'city-images.js'), 'utf8');
if (cityImages.includes('function slugify')) fail('city-images.js still has duplicate slugify');
else ok('city-images uses shared slugify');

const { slugify } = require('../lib/slugify');
if (slugify('İstanbul') !== 'istanbul') fail(`slugify('İstanbul') → ${slugify('İstanbul')}`);
else ok('slugify helper works');

const seedSrc = fs.readFileSync(path.join(ROOT, 'server', 'seed.js'), 'utf8');
if (!seedSrc.includes("require('./lib/logger')")) fail('seed.js missing logger');
else ok('seed.js uses logger');
const seedRuntimeLogs = seedSrc
  .split('if (require.main === module)')[0]
  .match(/console\.log\s*\(/g);
if (seedRuntimeLogs && seedRuntimeLogs.length) fail('seed.js still console.log on startup path');
else ok('seed.js startup path has no console.log');

const envExample = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
const envKeys = [
  'TRUST_PROXY',
  'COOKIE_SECURE',
  'COOKIE_SAMESITE',
  'DISABLE_WWW_REDIRECT',
  'DISABLE_HTTPS_REDIRECT',
  'SEED_ON_START',
  'STORAGE_PERSISTENT',
  'APP_VERSION',
  'DATABASE_URL',
  'JWT_SECRET',
  'SITE_URL',
  'CORS_ORIGIN',
  'RECAPTCHA_SITE_KEY',
  'GA_MEASUREMENT_ID',
];
const missingEnv = envKeys.filter((k) => !envExample.includes(k));
if (missingEnv.length) fail('.env.example missing keys: ' + missingEnv.join(', '));
else ok('.env.example documents operator keys');
if (!envExample.includes('https://www.touristlio.com')) fail('.env.example CORS/SITE comment missing www');
else ok('.env.example production URL is www');

function walkJs(dir, acc = []) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    if (name.name === 'node_modules' || name.name === '.git' || name.name === 'scripts') continue;
    const full = path.join(dir, name.name);
    if (name.isDirectory()) walkJs(full, acc);
    else if (name.name.endsWith('.js')) acc.push(full);
  }
  return acc;
}
const runtimeJs = walkJs(path.join(ROOT, 'server')).filter((f) => {
  const rel = path.relative(ROOT, f);
  return rel !== path.join('server', 'seed.js') && rel !== path.join('server', 'lib', 'logger.js');
});
const runtimeLogHits = [];
for (const f of runtimeJs) {
  const src = fs.readFileSync(f, 'utf8');
  if (/console\.log\s*\(/.test(src)) runtimeLogHits.push(path.relative(ROOT, f));
}
if (runtimeLogHits.length) fail('runtime console.log still in: ' + runtimeLogHits.join(', '));
else ok('server runtime has no console.log (except seed CLI / logger fallback)');

const indexJs = fs.readFileSync(path.join(ROOT, 'server', 'index.js'), 'utf8');
if (indexJs.includes('write-logo-transparent')) fail('dev write-logo-transparent route still in index.js');
else ok('one-off logo API removed');
if (indexJs.includes('authRequired') || indexJs.includes('requireRole')) {
  fail('unused auth imports still in server/index.js');
} else ok('unused auth imports removed from index.js');

const eb = fs.readFileSync(path.join(ROOT, 'public', 'js', 'error-boundary.js'), 'utf8');
if (!eb.includes('function silenceProdConsole') || !eb.includes('c.log = noop') || !eb.includes('c.warn = noop')) {
  fail('error-boundary.js missing production console silence');
} else ok('production console.log/warn silenced');

function runBoundary(isDevFlag) {
  const logs = [];
  const sandbox = {
    window: {},
    document: {
      documentElement: { lang: 'tr', getAttribute: () => (isDevFlag ? '1' : '0') },
      readyState: 'complete',
      addEventListener: () => {},
    },
    location: { hostname: isDevFlag ? 'localhost' : 'www.touristlio.com', search: '' },
    localStorage: { getItem: () => 'tr' },
    console: { log: (...a) => logs.push(a), debug: () => {}, info: () => {}, error: () => {} },
    setTimeout: () => 0,
    URLSearchParams,
  };
  sandbox.window = sandbox;
  sandbox.window.console = sandbox.console;
  sandbox.window.document = sandbox.document;
  sandbox.window.location = sandbox.location;
  sandbox.window.localStorage = sandbox.localStorage;
  sandbox.window.addEventListener = () => {};
  sandbox.window.__TL_DEV__ = isDevFlag;
  sandbox.console.warn = (...a) => logs.push(['warn', ...a]);
  vm.runInNewContext(eb, sandbox);
  sandbox.console.log('probe-cleanup');
  sandbox.console.warn('probe-warn');
  return { logs, sandbox };
}

const prodRun = runBoundary(false);
if (prodRun.logs.some((a) => a[0] === 'probe-cleanup')) fail('production console.log still emits');
else ok('vm: production console.log is a no-op');
if (prodRun.logs.some((a) => a[0] === 'warn' && a[1] === 'probe-warn')) fail('production console.warn still emits');
else ok('vm: production console.warn is a no-op');

const devRun = runBoundary(true);
if (!devRun.logs.some((a) => a[0] === 'probe-cleanup')) fail('development console.log was silenced');
else ok('vm: development console.log still works');

const googleLeak = /google\s*rating|googleRating|aggregateRating.*google/i;
if (googleLeak.test(css) || googleLeak.test(eb) || googleLeak.test(catalog)) {
  fail('Google ratings must not appear');
} else ok('no Google ratings added');

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 8000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function waitForServer(base, max = 400) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      fetchText(base + '/').then((r) => {
        if (r.status && r.status < 500) resolve();
        else retry();
      }).catch(retry);
    };
    function retry() {
      n += 1;
      if (n > max) reject(new Error('server did not start'));
      else setTimeout(tick, 200);
    }
    tick();
  });
}

async function checkRoutes(base) {
  const routes = [
    ['/', ['error-boundary.js', 'css/style.css']],
    ['/js/error-boundary.js', ['silenceProdConsole', 'c.log = noop', 'c.warn = noop']],
    ['/css/style.css', ['.dual-rat{', '--nav-h:68px', '.tiola-grid{']],
  ];
  for (const [route, needles] of routes) {
    try {
      const r = await fetchText(base + route);
      if (r.status !== 200) fail(`${route} → ${r.status}`);
      else {
        const missing = needles.filter((n) => !r.body.includes(n));
        if (missing.length) fail(`${route} missing ${missing.join(', ')}`);
        else ok(`HTTP ${route} 200`);
      }
    } catch (e) {
      fail(`${route} ${e.message}`);
    }
  }
  try {
    const gonePage = await fetchText(base + '/images/_make-transparent.html');
    if (gonePage.status === 200 && gonePage.body.includes('Make logo transparent')) {
      fail('deleted _make-transparent.html still served');
    } else ok('_make-transparent.html not served');
  } catch (e) {
    fail(`_make-transparent.html ${e.message}`);
  }
}

(async () => {
  const external = process.env.VERIFY_CLEANUP_URL;
  if (external) {
    await checkRoutes(external.replace(/\/$/, ''));
  } else {
    const port = process.env.VERIFY_CLEANUP_PORT || '3065';
    const base = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
      env: { ...process.env, PORT: port, NODE_ENV: 'test' },
      stdio: 'ignore',
    });
    try {
      await waitForServer(base);
      await checkRoutes(base);
    } catch (e) {
      fail('local server: ' + e.message);
    } finally {
      child.kill('SIGTERM');
    }
  }

  if (failed) {
    console.error(`verify-code-cleanup: ${failed} failed`);
    process.exit(1);
  }
  console.log('verify-code-cleanup: ok');
})();
