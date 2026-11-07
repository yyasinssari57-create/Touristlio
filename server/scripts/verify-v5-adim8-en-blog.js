#!/usr/bin/env node
/**
 * V5 Adım 8 — /en/blog noindex + out of sitemap/hreflang when no EN posts.
 *
 * Usage: npm run verify:v5-adim8
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const PORT = process.env.VERIFY_V5_ADIM8_PORT || '3198';

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
      headers: { Accept: 'text/html,application/xml,application/json' },
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

function staticChecks() {
  console.log('verify-v5-adim8-en-blog');
  const indexJs = read('server/index.js');
  const sitemapJs = read('server/lib/sitemap.js');
  const blogI18n = read('server/lib/blog-i18n.js');

  if (!/hasPublishedEnBlogs/.test(indexJs) || !/noindex,follow/.test(indexJs)) {
    fail('/blog rotası boş EN için noindex,follow kullanmıyor');
  } else ok('/blog rotası hasPublishedEnBlogs + noindex,follow');

  if (!/includeEnBlogIndex/.test(sitemapJs)) {
    fail('sitemap includeEnBlogIndex bayrağı yok');
  } else ok('sitemap /en/blog bayrağı var');

  if (!/countPublishedEnBlogs|hasPublishedEnBlogs/.test(blogI18n)) {
    fail('blog-i18n sayaç fonksiyonları eksik');
  } else ok('blog-i18n EN sayaçları');

  const { withEnglishAlternates } = require('../lib/sitemap');
  const base = 'https://www.touristlio.com';
  const withEn = withEnglishAlternates([{ loc: `${base}/blog`, priority: '0.8' }], base, { includeEnBlogIndex: true });
  const withoutEn = withEnglishAlternates([{ loc: `${base}/blog`, priority: '0.8' }], base, { includeEnBlogIndex: false });
  if (!withEn.some((u) => u.loc === `${base}/en/blog`)) fail('includeEnBlogIndex=true /en/blog eklemedi');
  else ok('includeEnBlogIndex=true → /en/blog');
  if (withoutEn.some((u) => u.loc === `${base}/en/blog`)) fail('includeEnBlogIndex=false hâlâ /en/blog ekliyor');
  else ok('includeEnBlogIndex=false → /en/blog yok');
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

async function runtimeChecks(baseUrl) {
  require('dotenv').config({ path: path.join(ROOT, '.env') });
  const { initDb, db } = require('../db');
  const { hasPublishedEnBlogs, countPublishedEnBlogs } = require('../lib/blog-i18n');
  await initDb();

  const stamp = Date.now();
  const slug = `v5a8-tr-${stamp}`;
  const slugEn = `v5a8-en-${stamp}`;

  // Ensure zero EN blogs for empty-state checks: stash any existing EN rows' slug_en
  // by only using our disposable post for the "has EN" phase.
  const beforeCount = await countPublishedEnBlogs(db);

  // Force empty view by temporarily clearing EN fields on all approved rows? Too invasive.
  // Instead: if beforeCount>0, only assert "has EN" path; if 0, assert empty path then insert one.

  async function checkEmptyState() {
    const enPage = await request(`${baseUrl}/en/blog`);
    if (enPage.status !== 200) fail(`GET /en/blog HTTP ${enPage.status}`);
    else if (!/name="robots"\s+content="noindex,\s*follow"/i.test(enPage.body)
      && !/content="noindex,follow"/i.test(enPage.body)) {
      fail('boş /en/blog robots noindex,follow değil');
    } else ok('/en/blog boş → noindex,follow');

    const trPage = await request(`${baseUrl}/blog`);
    if (/hreflang="en"[^>]*\/en\/blog/i.test(trPage.body) || /hreflang="en" href="[^"]*\/en\/blog"/i.test(trPage.body)) {
      fail('TR /blog boşken /en/blog hreflang veriyor');
    } else ok('TR /blog boşken /en/blog hreflang yok');

    const sm = await request(`${baseUrl}/sitemap.xml`);
    if (sm.status !== 200) fail(`sitemap HTTP ${sm.status}`);
    else if (/<loc>[^<]*\/en\/blog<\/loc>/.test(sm.body)) {
      fail('sitemap boşken /en/blog listeliyor');
    } else ok('sitemap boşken /en/blog yok');
  }

  async function checkReadyState() {
    const enPage = await request(`${baseUrl}/en/blog`);
    if (enPage.status !== 200) fail(`GET /en/blog (dolu) HTTP ${enPage.status}`);
    else if (/content="noindex/i.test(enPage.body) && !/content="index,follow"/i.test(enPage.body)) {
      fail('EN blog varken /en/blog hâlâ noindex');
    } else ok('/en/blog dolu → indexlenebilir');

    const trPage = await request(`${baseUrl}/blog`);
    if (!/hreflang="en"[^>]*\/en\/blog|href="[^"]*\/en\/blog"[^>]*hreflang="en"|hreflang="en" href="[^"]*\/en\/blog"/i.test(trPage.body)) {
      fail('EN blog varken TR /blog /en/blog hreflang vermiyor');
    } else ok('TR /blog → hreflang en=/en/blog');

    const sm = await request(`${baseUrl}/sitemap.xml`);
    if (!/<loc>[^<]*\/en\/blog<\/loc>/.test(sm.body)) fail('EN blog varken sitemap /en/blog yok');
    else ok('sitemap /en/blog var');
  }

  // Create a throwaway member for FK
  const email = `v5a8-${stamp}@touristlio.local`;
  const { createUser } = require('../auth');
  let user;
  try {
    user = await createUser({ name: 'V5A8', email, password: 'ValidPass1', role: 'member' });
  } catch {
    user = await db.prepare('SELECT id FROM users ORDER BY id ASC LIMIT 1').get();
  }
  if (!user?.id) {
    fail('test kullanıcısı yok');
    return;
  }

  if (beforeCount === 0) {
    ok('DB’de çevrilmiş EN blog yok — boş durum testi');
    await checkEmptyState();
  } else {
    ok(`DB’de zaten ${beforeCount} EN blog — boş durum atlandı, dolu durum doğrulanacak`);
  }

  // Insert one fully translated approved blog
  await db.prepare(`
    INSERT INTO blogs (
      user_id, category, title, excerpt, body, title_en, excerpt_en, body_en, slug, slug_en, status, published_at
    ) VALUES (?, 'travel', ?, ?, ?, ?, ?, ?, ?, ?, 'approved', to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS'))
  `).run(
    user.id,
    `V5A8 TR ${stamp}`,
    'TR excerpt for verify adim8 body length pad pad pad.',
    'TR body for verify adim8. '.repeat(40),
    `V5A8 EN ${stamp}`,
    'EN excerpt for verify adim8 body length pad pad pad.',
    'EN body for verify adim8. '.repeat(40),
    slug,
    slugEn,
  );

  if (!(await hasPublishedEnBlogs(db))) {
    fail('insert sonrası hasPublishedEnBlogs false');
  } else ok('1 çevrilmiş EN blog eklendi');

  await checkReadyState();

  // Cleanup disposable post
  await db.prepare('DELETE FROM blogs WHERE slug = ? OR slug_en = ?').run(slug, slugEn);
  ok('test blog satırı silindi');

  // If we started empty, confirm empty again after cleanup
  if (beforeCount === 0 && !(await hasPublishedEnBlogs(db))) {
    await checkEmptyState();
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
    await runtimeChecks(base);
  } catch (err) {
    fail(err.message || String(err));
  } finally {
    child.kill('SIGTERM');
    await sleep(400);
    try { child.kill('SIGKILL'); } catch { /* ignore */ }
  }

  if (failed) {
    console.error(`\nverify-v5-adim8 FAILED (${failed})`);
    process.exit(1);
  }
  console.log('\nverify-v5-adim8 OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
