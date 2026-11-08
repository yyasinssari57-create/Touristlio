#!/usr/bin/env node
/**
 * V6 Adım 1 — client must not clobber server robots (noindex → index).
 *
 * Usage: npm run verify:v6-adim1
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const PORT = process.env.VERIFY_V6_ADIM1_PORT || '3191';

let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) { console.error('  ✗', msg); failed += 1; }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function request(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: 'GET',
      headers: { Accept: 'text/html,application/json' },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          body: Buffer.concat(chunks).toString('utf8'),
          headers: res.headers,
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function chromeBin() {
  const fromEnv = process.env.CHROME_PATH;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  for (const candidate of [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/local/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return '';
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
  return res.json();
}

function connectCdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let seq = 0;
  const pending = new Map();
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve());
    ws.addEventListener('error', () => reject(new Error('CDP websocket failed')));
  });
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const slot = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) slot.reject(new Error(JSON.stringify(msg.error)));
      else slot.resolve(msg.result || {});
    }
  });
  function send(method, params = {}) {
    const id = ++seq;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  return { ready, send, close: () => ws.close() };
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    const text = result.exceptionDetails.text
      || result.exceptionDetails.exception?.description
      || 'evaluate failed';
    throw new Error(text);
  }
  return result.result ? result.result.value : undefined;
}

async function waitEval(cdp, expression, readyFn, tries = 40) {
  let last;
  for (let i = 0; i < tries; i += 1) {
    last = await evaluate(cdp, expression);
    if (readyFn(last)) return last;
    await sleep(250);
  }
  return last;
}

function staticChecks() {
  console.log('verify-v6-adim1-robots');
  const app = read('public/js/app.js');
  const i18n = read('public/js/i18n.js');
  const blogs = read('server/routes/blogs.js');

  if (!/function captureServerRobots\s*\(/.test(app)) fail('captureServerRobots yok');
  else ok('captureServerRobots var');

  if (!/function setRobotsSafe\s*\(/.test(app)) fail('setRobotsSafe yok');
  else ok('setRobotsSafe var');

  if (!/window\.setRobotsSafe\s*=/.test(app)) fail('window.setRobotsSafe export yok');
  else ok('window.setRobotsSafe export');

  // Unconditional robots upgrades must go through setRobotsSafe.
  const bareIndex = [...app.matchAll(/setMetaContent\(\s*['"]meta\[name="robots"\]['"]\s*,\s*['"]index,\s*follow['"]/g)];
  if (bareIndex.length) fail(`koşulsuz setMetaContent robots index,follow kaldı (${bareIndex.length})`);
  else ok('koşulsuz setMetaContent index,follow yok');

  if (!/setRobotsSafe\(\s*['"]index,follow['"]/.test(app)) fail('setRobotsSafe(index,follow) kullanımı yok');
  else ok('setRobotsSafe(index,follow) kullanılıyor');

  if (!/setBlogListingSeo[\s\S]*publishedEnCount|publishedEnBlogCount/.test(app)) {
    fail('blog listesi EN sayımına bakmıyor');
  } else ok('blog listesi publishedEnCount kullanıyor');

  if (!/window\.setRobotsSafe/.test(i18n)) fail('i18n syncParamListingSeo setRobotsSafe kullanmıyor');
  else ok('i18n syncParamListingSeo → setRobotsSafe');

  if (!/publishedEnCount/.test(blogs) || !/countPublishedEnBlogs/.test(blogs)) {
    fail('/api/blogs/meta publishedEnCount eksik');
  } else ok('/api/blogs/meta publishedEnCount');
}

async function waitHealth(base) {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await request(`${base}/api/health`);
      if (res.status === 200) return;
    } catch { /* retry */ }
    await sleep(250);
  }
  throw new Error('sunucu ayağa kalkmadı');
}

async function browserAfterJs(origin) {
  const bin = chromeBin();
  if (!bin) {
    fail('Chrome yok; JS sonrası robots ölçülemedi');
    return;
  }
  const debugPort = 9341;
  const profile = fs.mkdtempSync(path.join('/tmp', 'v6a1-chrome-'));
  const chrome = spawn(bin, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--window-size=1280,900',
    `--remote-debugging-port=${debugPort}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  chrome.stderr.on('data', (chunk) => { stderr += chunk; });
  let cdp = null;
  try {
    let version = null;
    for (let i = 0; i < 40; i += 1) {
      try {
        version = await getJson(`http://127.0.0.1:${debugPort}/json/version`);
        break;
      } catch { /* starting */ }
      await sleep(250);
    }
    if (!version) throw new Error(`chrome debug port açılmadı ${stderr.slice(-200)}`);
    const list = await getJson(`http://127.0.0.1:${debugPort}/json/list`);
    const page = list.find((t) => t.type === 'page') || list[0];
    cdp = connectCdp(page.webSocketDebuggerUrl);
    await cdp.ready;
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    async function visit(urlPath, label, expectNoindex) {
      try {
        await cdp.send('Page.navigate', { url: `${origin}${urlPath}` });
        // Wait for document complete before reading meta (SPA still may mutate robots).
        await waitEval(cdp, `document.readyState`, (v) => v === 'complete' || v === 'interactive', 40);
        await sleep(800);
        const got = await waitEval(cdp, `(() => {
          try {
            const ready = document.documentElement
              && (document.documentElement.classList.contains('tl-ready')
                || document.readyState === 'complete');
            const el = document.querySelector('meta[name="robots"]');
            return {
              ready: !!ready,
              robots: el ? (el.getAttribute('content') || '') : '',
              hasSetRobotsSafe: typeof window.setRobotsSafe === 'function',
              title: document.title || '',
            };
          } catch (e) {
            return { ready: false, robots: '', hasSetRobotsSafe: false, err: String(e && e.message || e) };
          }
        })()`, (v) => v && v.ready && v.robots, 60);
        if (got?.err) fail(`${label}: evaluate err ${got.err}`);
        if (!got?.hasSetRobotsSafe) fail(`${label}: setRobotsSafe yüklenmedi (robots=${got?.robots || ''})`);
        else ok(`${label}: setRobotsSafe yüklü`);
        const robots = String(got?.robots || '');
        const isNoindex = /\bnoindex\b/i.test(robots);
        if (expectNoindex) {
          if (!isNoindex) fail(`${label}: JS sonrası robots="${robots}" (noindex beklenirdi)`);
          else ok(`${label}: JS sonrası robots=${robots}`);
        } else if (isNoindex) {
          fail(`${label}: JS sonrası hâlâ noindex (${robots})`);
        } else ok(`${label}: JS sonrası robots=${robots}`);
        return robots;
      } catch (err) {
        fail(`${label}: ${err.message || String(err)}`);
        return '';
      }
    }

    require('dotenv').config({ path: path.join(ROOT, '.env') });
    const { initDb, db } = require('../db');
    const { countPublishedEnBlogs, hasPublishedEnBlogs } = require('../lib/blog-i18n');
    const { isIndexablePlace } = require('../lib/place-i18n');
    await initDb();

    const enCount = await countPublishedEnBlogs(db);
    if (enCount === 0) {
      const serverHtml = await request(`${origin}/en/blog`);
      if (!/noindex/i.test(serverHtml.body)) fail('SSR /en/blog boşken noindex değil');
      else ok('SSR /en/blog boş → noindex');
      await visit('/en/blog', 'boş /en/blog', true);
    } else {
      ok(`DB’de ${enCount} EN blog — boş /en/blog tarayıcı testi atlandı`);
      await visit('/en/blog', 'dolu /en/blog', false);
    }

    await visit('/explore?q=v6adim1', '/explore?q=', true);

    // Untranslated EN blog detail (if any approved TR-only post exists)
    const untranslated = await db.prepare(`
      SELECT slug, slug_en, title_en, excerpt_en, body_en
      FROM blogs
      WHERE status = 'approved'
        AND slug IS NOT NULL AND btrim(slug) <> ''
        AND (
          slug_en IS NULL OR btrim(slug_en) = ''
          OR title_en IS NULL OR btrim(title_en) = ''
          OR excerpt_en IS NULL OR btrim(excerpt_en) = ''
          OR body_en IS NULL OR btrim(body_en) = ''
        )
      ORDER BY id ASC
      LIMIT 1
    `).get();
    if (untranslated?.slug) {
      const enSlug = untranslated.slug_en || untranslated.slug;
      await visit(`/en/blog/${encodeURIComponent(enSlug)}`, 'çevirisiz EN blog detay', true);
    } else {
      ok('çevirisiz EN blog yok — detay noindex tarayıcı testi atlandı');
    }

    // Indexable place (TR)
    const places = await db.prepare(`
      SELECT * FROM places
      WHERE status = 'published'
      ORDER BY id ASC
      LIMIT 40
    `).all();
    const indexable = places.find((p) => isIndexablePlace(p, 'tr'));
    if (indexable?.slug) {
      await visit(`/places/${encodeURIComponent(indexable.slug)}`, 'indexlenebilir yer', false);
    } else {
      ok('indexlenebilir yer yok — yer index testi atlandı');
    }

    // After empty EN blog SSR, publishing one EN post + full reload must index.
    if (enCount === 0) {
      const stamp = Date.now();
      const slug = `v6a1-tr-${stamp}`;
      const slugEn = `v6a1-en-${stamp}`;
      const { createUser } = require('../auth');
      let user;
      try {
        user = await createUser({
          name: 'V6A1',
          email: `v6a1-${stamp}@touristlio.local`,
          password: 'ValidPass1',
          role: 'member',
        });
      } catch {
        user = await db.prepare('SELECT id FROM users ORDER BY id ASC LIMIT 1').get();
      }
      if (!user?.id) {
        fail('test kullanıcısı yok');
      } else {
        await db.prepare(`
          INSERT INTO blogs (
            user_id, category, title, excerpt, body, title_en, excerpt_en, body_en,
            slug, slug_en, status, published_at
          ) VALUES (?, 'travel', ?, ?, ?, ?, ?, ?, ?, ?, 'approved',
            to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS'))
        `).run(
          user.id,
          `V6A1 TR ${stamp}`,
          'TR excerpt for verify v6 adim1 body length pad pad pad.',
          'TR body for verify v6 adim1. '.repeat(40),
          `V6A1 EN ${stamp}`,
          'EN excerpt for verify v6 adim1 body length pad pad pad.',
          'EN body for verify v6 adim1. '.repeat(40),
          slug,
          slugEn,
        );
        if (!(await hasPublishedEnBlogs(db))) fail('EN blog insert sonrası hasPublishedEnBlogs false');
        else ok('1 çevrilmiş EN blog eklendi');
        await visit('/en/blog', 'EN blog sonrası /en/blog', false);
        await db.prepare('DELETE FROM blogs WHERE slug = ? OR slug_en = ?').run(slug, slugEn);
        ok('test blog satırı silindi');
      }
    }
  } catch (err) {
    fail(err.message || String(err));
  } finally {
    try { cdp?.close(); } catch { /* ignore */ }
    chrome.kill('SIGTERM');
    await sleep(400);
    try { chrome.kill('SIGKILL'); } catch { /* ignore */ }
  }
}

async function main() {
  staticChecks();

  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'development',
      SITE_URL: 'https://www.touristlio.com',
      SITEMAP_ON_START: 'false',
      LIVE_DATA_CRON: 'false',
      SEED_ON_START: 'false',
      LOG_LEVEL: 'warn',
    },
    stdio: 'ignore',
  });

  const base = `http://127.0.0.1:${PORT}`;
  try {
    await waitHealth(base);
    const meta = await request(`${base}/api/blogs/meta?lang=en`);
    if (meta.status !== 200) fail(`GET /api/blogs/meta HTTP ${meta.status}`);
    else {
      let body;
      try { body = JSON.parse(meta.body); } catch { body = null; }
      if (body && typeof body.publishedEnCount === 'number') ok('API publishedEnCount sayı');
      else fail('API publishedEnCount yok');
    }
    await browserAfterJs(base);
  } catch (err) {
    fail(err.message || String(err));
  } finally {
    child.kill('SIGTERM');
    await sleep(400);
    try { child.kill('SIGKILL'); } catch { /* ignore */ }
  }

  if (failed) {
    console.error(`\nverify-v6-adim1 FAILED (${failed})`);
    process.exit(1);
  }
  console.log('\nverify-v6-adim1 OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
