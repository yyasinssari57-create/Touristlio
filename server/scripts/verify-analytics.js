/**
 * [DÜŞÜK-6 / v2 ORTA-3] Analytics: GA4 after cookie consent, Search Console meta, web-vitals.
 * Usage: node server/scripts/verify-analytics.js
 * Optional: VERIFY_ANALYTICS_URL=http://127.0.0.1:3066 node server/scripts/verify-analytics.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const {
  gaMeasurementId,
  googleSiteVerification,
  publicAnalyticsConfig,
  gaCspSources,
  WEB_VITALS_PACKAGE,
} = require('../lib/analytics-config');
const { injectSeoHead } = require('../lib/seo');
const { injectAnalyticsScripts } = require('../lib/send-public-html');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}

console.log('verify-analytics');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
if (!pkg.dependencies || !pkg.dependencies[WEB_VITALS_PACKAGE]) {
  fail('package.json missing web-vitals');
} else ok('web-vitals npm dependency');
if (!pkg.scripts['verify:analytics']) fail('package.json missing verify:analytics');
else ok('verify:analytics script');

const iife = path.join(ROOT, 'public', 'vendor', 'web-vitals', 'web-vitals.iife.js');
if (!fs.existsSync(iife)) fail('vendored web-vitals.iife.js missing');
else {
  const src = fs.readFileSync(iife, 'utf8');
  if (!src.includes('onLCP') || !src.includes('onINP') || !src.includes('onCLS')) {
    fail('web-vitals IIFE missing Core Web Vitals exports');
  } else ok('vendored web-vitals IIFE (CLS/INP/LCP)');
}

const analyticsJs = fs.readFileSync(path.join(ROOT, 'public', 'js', 'analytics.js'), 'utf8');
if (!analyticsJs.includes("CONSENT_KEY = 'tl_cookie_ok'")) fail('analytics.js missing consent key');
else ok('analytics.js uses tl_cookie_ok');
if (!analyticsJs.includes('hasConsent()') || !analyticsJs.includes("if (!hasConsent()) return")) {
  fail('analytics.js missing consent gate');
} else ok('analytics.js gates tracking on consent');
if (analyticsJs.includes('googletagmanager.com') && !analyticsJs.includes('loadGa4')) {
  fail('GA4 script not consent-gated');
}
if (!analyticsJs.includes('loadGa4') || !analyticsJs.includes('googletagmanager.com/gtag/js')) {
  fail('analytics.js missing GA4 loader');
} else ok('analytics.js GA4 loader');
if (!analyticsJs.includes('web-vitals') || !analyticsJs.includes('onLCP') || !analyticsJs.includes('startWebVitals')) {
  fail('analytics.js missing web-vitals integration');
} else ok('analytics.js web-vitals after consent');
if (/googleRating|google_rating/.test(analyticsJs)) fail('Google ratings leaked into analytics.js');
else ok('no Google ratings');

const cookieJs = fs.readFileSync(path.join(ROOT, 'public', 'js', 'cookie-banner.js'), 'utf8');
if (!cookieJs.includes('tl-cookie-consent') || !cookieJs.includes('tl_cookie_ok')) {
  fail('cookie-banner missing consent event');
} else ok('cookie-banner notifies analytics');
if (!cookieJs.includes("cookie_consent") || !cookieJs.includes("'accepted'") || !cookieJs.includes("'rejected'")) {
  fail('cookie-banner missing cookie_consent accepted/rejected (v2 ORTA-3)');
} else ok('accept/reject persist cookie_consent (audit key)');
if (!cookieJs.includes('cookieAccept') || !cookieJs.includes('cookieReject')) {
  fail('cookie-banner missing accept/reject buttons');
} else ok('cookie-banner accept/reject buttons');
if (!cookieJs.includes('loadAnalytics')) {
  fail('cookie accept does not call loadAnalytics');
} else ok('cookie accept calls loadAnalytics');

if (!analyticsJs.includes('function loadAnalytics') || !analyticsJs.includes('if (!hasConsent()) return')) {
  fail('loadAnalytics missing or not consent-gated');
} else ok('loadAnalytics is consent-gated (v2 ORTA-3 name)');
if (/gtag\(\s*['"]config['"]\s*,\s*['"]G-/.test(analyticsJs) || /gtag\/js\?id=G-/.test(analyticsJs)) {
  fail('analytics.js hardcodes a GA measurement ID');
} else ok('no hardcoded GA measurement ID in analytics.js');

const envExample = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
if (!/^GA_MEASUREMENT_ID=\s*$/m.test(envExample)) {
  fail('.env.example must keep GA_MEASUREMENT_ID empty until a real G- id exists');
} else ok('.env.example GA_MEASUREMENT_ID stays empty');
if (!envExample.includes('GA_MEASUREMENT_ID=G-XXXXXXXXXX')) {
  fail('.env.example missing G-XXXXXXXXXX comment');
} else ok('.env.example documents G-XXXXXXXXXX format');

const publicHtmlDir = path.join(ROOT, 'public');
function walkHtml(dir, acc) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walkHtml(full, acc);
    else if (name.endsWith('.html')) acc.push(full);
  }
  return acc;
}
const htmlFiles = walkHtml(publicHtmlDir, []);
const gaEmbed = htmlFiles.filter((f) => {
  const html = fs.readFileSync(f, 'utf8');
  return html.includes('googletagmanager.com') || /gtag\s*\(/.test(html);
});
if (gaEmbed.length) fail(`static HTML embeds gtag: ${gaEmbed.map((f) => path.relative(ROOT, f)).join(', ')}`);
else ok('public HTML has no static gtag snippet');

const visitor = fs.readFileSync(path.join(ROOT, 'server/modules/analytics/visitor.service.js'), 'utf8');
if (!visitor.includes("'web_vital'") || !visitor.includes('VALID_VITALS')) {
  fail('visitor.service missing web_vital event');
} else ok('first-party track accepts web_vital');
if (!visitor.includes('hasAnalyticsConsent') || !visitor.includes("tl_cookie_ok === '1'")) {
  fail('trackEvent missing consent check');
} else ok('POST /api/analytics/track requires consent cookie');
if (!visitor.includes('ON CONFLICT') || !visitor.includes('await upsertSession')) {
  fail('upsertSession must use ON CONFLICT and be awaited (duplicate session_id must not crash prod)');
} else ok('session upsert is awaited and ON CONFLICT');
if (!visitor.includes('await analyticsTablesReady()')) {
  fail('visitorDashboard missing await on analyticsTablesReady');
} else ok('visitorDashboard awaits table check');

const { convertDialect } = require('../lib/pg-sql');
const upsertSql = convertDialect(`
    INSERT INTO analytics_sessions (session_id, user_id, started_at, last_seen_at)
    VALUES (?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(session_id) DO UPDATE SET
      last_seen_at = datetime('now'),
      user_id = COALESCE(excluded.user_id, analytics_sessions.user_id)
`);
if (!/ON CONFLICT\s*\(\s*session_id\s*\)/i.test(upsertSql)) {
  fail('pg dialect dropped ON CONFLICT(session_id)');
} else if (!/to_char\(timezone\('utc',\s*now\(\)\)/i.test(upsertSql)) {
  fail(`upsert datetime(now) not converted: ${upsertSql.slice(0, 220)}`);
} else ok('session upsert SQL converts to Postgres ON CONFLICT');

const indexHtml = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
if (indexHtml.includes('googletagmanager.com') || indexHtml.includes('gtag(')) {
  fail('index.html embeds GA without consent');
} else ok('index.html has no static GA snippet');
if (!indexHtml.includes('/js/analytics.js')) fail('index.html missing analytics.js');
else ok('index.html loads analytics.js');

const adminHtml = fs.readFileSync(path.join(ROOT, 'public', 'admin.html'), 'utf8');
if (adminHtml.includes('/js/analytics.js')) fail('admin.html should not load public visitor analytics');
else ok('admin.html skips public analytics.js');

const injectedAdmin = injectAnalyticsScripts(adminHtml, 'admin.html');
if (injectedAdmin.includes('/js/analytics.js')) fail('injectAnalyticsScripts added scripts to admin');
else ok('injectAnalyticsScripts skips admin');

const prevGa = process.env.GA_MEASUREMENT_ID;
const prevGsc = process.env.GOOGLE_SITE_VERIFICATION;
delete process.env.GA_MEASUREMENT_ID;
delete process.env.GOOGLE_SITE_VERIFICATION;
if (gaMeasurementId() || publicAnalyticsConfig().gaEnabled || gaCspSources().length) {
  fail('GA enabled without measurement id');
} else ok('GA off when GA_MEASUREMENT_ID empty');
if (googleSiteVerification()) fail('GSC token present when env empty');
else ok('Search Console token empty by default');

const rawHome = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const homeNoGsc = injectSeoHead(rawHome, { pathname: '/', lang: 'tr' });
if (/google-site-verification/.test(homeNoGsc)) fail('GSC meta injected without env');
else ok('no Search Console meta without env');

process.env.GA_MEASUREMENT_ID = 'not-a-ga-id';
if (gaMeasurementId()) fail('invalid GA id accepted');
else ok('invalid GA_MEASUREMENT_ID rejected');
process.env.GA_MEASUREMENT_ID = 'G-TEST12AB';
if (gaMeasurementId() !== 'G-TEST12AB' || !publicAnalyticsConfig().gaEnabled) {
  fail('valid G- id not enabled');
} else ok('GA4 enables for G- measurement id');
if (!gaCspSources().includes('https://www.googletagmanager.com')) fail('GA CSP missing gtm');
else ok('GA CSP includes googletagmanager');

process.env.GOOGLE_SITE_VERIFICATION = '<script>x</script>';
if (googleSiteVerification()) fail('GSC token allowed HTML');
else ok('GSC token rejects markup');
process.env.GOOGLE_SITE_VERIFICATION = 'gsc_token_verify99';
if (googleSiteVerification() !== 'gsc_token_verify99') fail('valid GSC token rejected');
else ok('valid Search Console token accepted');
const homeGsc = injectSeoHead(rawHome, { pathname: '/', lang: 'tr' });
if (!homeGsc.includes('name="google-site-verification"') || !homeGsc.includes('gsc_token_verify99')) {
  fail('GSC meta not injected');
} else ok('Search Console verification meta injected');

if (prevGa == null) delete process.env.GA_MEASUREMENT_ID;
else process.env.GA_MEASUREMENT_ID = prevGa;
if (prevGsc == null) delete process.env.GOOGLE_SITE_VERIFICATION;
else process.env.GOOGLE_SITE_VERIFICATION = prevGsc;

function postJson(url, body, extraHeaders) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = JSON.stringify(body);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        Origin: `${u.protocol}//${u.host}`,
        ...(extraHeaders || {}),
      },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let json = {};
        try { json = JSON.parse(data); } catch { /* ignore */ }
        resolve({ status: res.statusCode, json, body: data, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(payload);
    req.end();
  });
}

function get(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 10000 }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        let json = {};
        try { json = JSON.parse(body); } catch { /* ignore */ }
        resolve({ status: res.statusCode, json, body, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function waitForServer(url, tries) {
  const max = tries || 120;
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      n += 1;
      const req = http.get(url, { timeout: 1000 }, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (n >= max) reject(new Error('server did not start'));
        else setTimeout(tick, 400);
      });
      req.on('timeout', () => {
        req.destroy();
        if (n >= max) reject(new Error('server did not start'));
        else setTimeout(tick, 400);
      });
    };
    tick();
  });
}

async function checkLive(base, { expectGa, expectGsc } = {}) {
  const root = base.replace(/\/$/, '');
  const cfg = await get(`${root}/api/config/public`);
  if (cfg.status !== 200) fail(`GET /api/config/public HTTP ${cfg.status}`);
  else ok('GET /api/config/public HTTP 200');

  if (expectGa) {
    if (!cfg.json.gaEnabled || cfg.json.gaMeasurementId !== 'G-TEST12AB') {
      fail(`expected gaEnabled, got ${JSON.stringify(cfg.json)}`);
    } else ok('public config exposes GA4 id when set');
  } else if (cfg.json.gaEnabled || cfg.json.gaMeasurementId) {
    fail('gaMeasurementId leaked without env');
  } else ok('public config hides GA4 when unset');

  const home = await get(`${root}/`);
  if (home.status !== 200) fail(`GET / HTTP ${home.status}`);
  else ok('GET / 200');
  if (!home.body.includes('/js/analytics.js')) fail('served home missing analytics.js');
  else ok('served home includes analytics.js');
  if (home.body.includes('googletagmanager.com/gtag/js')) fail('served HTML includes gtag (must load after consent)');
  else ok('served HTML has no gtag snippet');
  if (expectGsc) {
    if (!home.body.includes('google-site-verification') || !home.body.includes('gsc_token_verify99')) {
      fail('served home missing Search Console meta');
    } else ok('served home has Search Console verification meta');
  } else if (/google-site-verification/.test(home.body)) {
    fail('served home has GSC meta without env');
  } else ok('served home has no GSC meta when unset');

  const contact = await get(`${root}/legal/contact.html`);
  if (contact.status !== 200) fail(`contact HTTP ${contact.status}`);
  else if (!contact.body.includes('/js/analytics.js') || !contact.body.includes('/js/cookie-banner.js')) {
    fail('contact page missing analytics/cookie scripts');
  } else ok('contact page has analytics + cookie banner');

  const admin = await get(`${root}/admin`);
  if (admin.status !== 200) fail(`admin HTTP ${admin.status}`);
  else if (admin.body.includes('/js/analytics.js')) fail('served admin includes public analytics.js');
  else ok('served admin has no public analytics.js');

  const noConsent = await postJson(`${root}/api/analytics/track`, {
    type: 'page_view',
    path: '/',
    tab: 'explore',
  });
  if (noConsent.status !== 200) fail(`track without consent HTTP ${noConsent.status}`);
  else if (noConsent.json?.data?.stored !== false) fail(`track without consent stored=${JSON.stringify(noConsent.json)}`);
  else ok('track without consent is not stored');

  const withConsent = await postJson(`${root}/api/analytics/track`, {
    type: 'page_view',
    path: '/',
    tab: 'explore',
  }, { Cookie: 'tl_cookie_ok=1' });
  if (withConsent.status !== 200) fail(`track with consent HTTP ${withConsent.status}: ${withConsent.body.slice(0, 180)}`);
  else if (withConsent.json?.data?.stored !== true) fail(`track with consent stored=${JSON.stringify(withConsent.json)}`);
  else ok('track with consent stores page_view');

  const sameSid = '2cfbe933-02f9-4314-b429-0e87ff2af010';
  const sameCookie = { Cookie: `tl_cookie_ok=1; tl_sid=${sameSid}` };
  const [raceA, raceB] = await Promise.all([
    postJson(`${root}/api/analytics/track`, { type: 'page_view', path: '/', tab: 'explore' }, sameCookie),
    postJson(`${root}/api/analytics/track`, { type: 'page_view', path: '/', tab: 'explore' }, sameCookie),
  ]);
  if (raceA.status !== 200 || raceB.status !== 200) {
    fail(`parallel track same session HTTP ${raceA.status}/${raceB.status} ${raceA.body.slice(0, 120)} ${raceB.body.slice(0, 120)}`);
  } else if (raceA.json?.data?.stored !== true || raceB.json?.data?.stored !== true) {
    fail(`parallel track stored=${JSON.stringify([raceA.json, raceB.json])}`);
  } else ok('parallel track with same session_id does not 500');

  const vital = await postJson(`${root}/api/analytics/track`, {
    type: 'web_vital',
    tab: 'LCP',
    path: '/',
  }, { Cookie: 'tl_cookie_ok=1' });
  if (vital.status !== 200 || vital.json?.data?.stored !== true) {
    fail(`web_vital HTTP ${vital.status} ${vital.body.slice(0, 180)}`);
  } else ok('web_vital stored after consent');

  const badVital = await postJson(`${root}/api/analytics/track`, {
    type: 'web_vital',
    tab: 'explore',
  }, { Cookie: 'tl_cookie_ok=1' });
  if (badVital.status !== 400) fail(`bad web_vital HTTP ${badVital.status}, expected 400`);
  else ok('invalid web_vital rejected');

  if (expectGa && home.headers['content-security-policy']) {
    const csp = String(home.headers['content-security-policy']);
    if (!csp.includes('googletagmanager.com')) fail('production CSP missing GA hosts');
    else ok('production CSP allows GA4');
  }
  if (!expectGa && home.headers['content-security-policy']) {
    const csp = String(home.headers['content-security-policy']);
    if (csp.includes('googletagmanager.com') || csp.includes('google-analytics.com')) {
      fail('CSP includes GA hosts while GA is off');
    } else ok('CSP has no GA hosts when unset');
  }
}

function spawnServer(port, extraEnv) {
  return spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: extraEnv.NODE_ENV || 'development',
      SITEMAP_ON_START: 'false',
      LIVE_DATA_CRON: 'false',
      GA_MEASUREMENT_ID: '',
      GOOGLE_SITE_VERIFICATION: '',
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function withServer(port, extraEnv, fn) {
  const child = spawnServer(port, extraEnv);
  let stderr = '';
  let stdout = '';
  child.stderr.on('data', (c) => { stderr += c; });
  child.stdout.on('data', (c) => { stdout += c; });
  const base = `http://127.0.0.1:${port}`;
  try {
    await waitForServer(base, 240);
    await fn(base);
  } catch (e) {
    const extra = `${stderr}${stdout}`.trim().slice(0, 280);
    fail(`live server :${port}: ${e.message}${extra ? ` (${extra})` : ''}`);
  } finally {
    child.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 200));
    try { child.kill('SIGKILL'); } catch { /* ignore */ }
  }
}

async function checkSessionUpsertRace() {
  const { initDb, db, closePool } = require('../db');
  if (!String(process.env.DATABASE_URL || '').trim()) {
    ok('skipped session upsert race (no DATABASE_URL)');
    return;
  }
  await initDb();
  const sid = `verify-upsert-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const sql = `
    INSERT INTO analytics_sessions (session_id, user_id, started_at, last_seen_at)
    VALUES (?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(session_id) DO UPDATE SET
      last_seen_at = datetime('now'),
      user_id = COALESCE(excluded.user_id, analytics_sessions.user_id)
  `;
  try {
    await Promise.all([
      db.prepare(sql).run(sid, null),
      db.prepare(sql).run(sid, null),
    ]);
    const row = await db.prepare(
      'SELECT COUNT(*) AS c FROM analytics_sessions WHERE session_id = ?',
    ).get(sid);
    if (Number(row?.c) !== 1) fail(`expected 1 session row for race, got ${row && row.c}`);
    else ok('parallel session upsert keeps one row');
  } catch (err) {
    fail(`parallel session upsert: ${err.message}`);
  } finally {
    try {
      await db.prepare('DELETE FROM analytics_events WHERE session_id = ?').run(sid);
      await db.prepare('DELETE FROM analytics_sessions WHERE session_id = ?').run(sid);
    } catch {
      /* ignore cleanup */
    }
    await closePool();
  }
}

async function main() {
  const given = process.env.VERIFY_ANALYTICS_URL;
  await checkSessionUpsertRace();
  if (given) {
    await checkLive(given, {});
  } else {
    await withServer(process.env.VERIFY_ANALYTICS_PORT || '3066', {}, (base) => checkLive(base, {}));
    await withServer(process.env.VERIFY_ANALYTICS_GA_PORT || '3067', {
      NODE_ENV: 'production',
      JWT_SECRET: 'verify-analytics-jwt-secret-32chars-min',
      GA_MEASUREMENT_ID: 'G-TEST12AB',
      GOOGLE_SITE_VERIFICATION: 'gsc_token_verify99',
    }, (base) => checkLive(base, { expectGa: true, expectGsc: true }));
  }
  if (failed) {
    console.error(`verify-analytics: ${failed} failed`);
    process.exit(1);
  }
  console.log('verify-analytics: ok');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
