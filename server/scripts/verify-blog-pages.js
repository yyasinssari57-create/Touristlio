/**
 * [ORTA-6] Blog listing + /blog/:slug pages (Express + static HTML/JS, not Next.js).
 * Usage: node server/scripts/verify-blog-pages.js
 * Optional: VERIFY_BLOG_URL=http://127.0.0.1:3057 node server/scripts/verify-blog-pages.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { db } = require('../db');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}

console.log('verify-blog-pages');

const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
if (!html.includes('id="page-blog"') || !html.includes('id="blogGrid"') || !html.includes('id="blogListing"')) {
  fail('listing markup missing page-blog / blogGrid / blogListing');
} else ok('listing markup (page-blog, blogGrid, blogListing)');
if (!html.includes('id="blogArticle"') || !html.includes('id="blogDetailBody"')) {
  fail('detail markup missing blogArticle / blogDetailBody');
} else ok('detail markup (blogArticle, blogDetailBody)');
if (html.includes('id="blogDetailOv"')) fail('old overlay blogDetailOv still present');
else ok('overlay replaced by in-page article');

const appJs = fs.readFileSync(path.join(ROOT, 'public', 'js', 'app.js'), 'utf8');
if (!appJs.includes("path = '/blog'") || !appJs.includes('function blogPublicPath')) {
  fail('client routing missing /blog path');
} else ok('writeRouteToUrl uses /blog and /blog/:slug');
if (!appJs.includes('b.excerpt') || !appJs.includes('b.categoryLabel') || !appJs.includes('b.authorName')) {
  fail('cards missing title/category/author/excerpt fields');
} else ok('cards include category, author, excerpt');
if (!appJs.includes('class="bdate"') || !appJs.includes('b.publishedAt')) {
  fail('cards missing date');
} else ok('cards include published date');
if (!appJs.includes('function openBlogDetail') || !appJs.includes('function closeBlogDetail')) {
  fail('detail open/close missing');
} else ok('openBlogDetail / closeBlogDetail');
if (!appJs.includes('await applyRouteFromUrl({ skipFilters: true })')) {
  fail('init missing applyRouteFromUrl');
} else ok('init applies /blog route from URL');

const routesHtml = fs.readFileSync(path.join(ROOT, 'server', 'lib', 'send-public-html.js'), 'utf8');
if (!routesHtml.includes("'/blog': 'index.html'")) fail('/blog not in HTML_PAGE_ROUTES');
else ok('/blog serves index.html');

const indexJs = fs.readFileSync(path.join(ROOT, 'server', 'index.js'), 'utf8');
if (!indexJs.includes("app.get('/blog'") || !indexJs.includes("app.get('/blog/:slug'")) {
  fail('Express GET /blog and /blog/:slug missing');
} else ok('Express GET /blog and GET /blog/:slug');

const blogsJs = fs.readFileSync(path.join(ROOT, 'server', 'routes', 'blogs.js'), 'utf8');
if (!blogsJs.includes('PUBLIC_BLOG_STATUS') || !blogsJs.includes('isPublished')) {
  fail('API missing published filter / isPublished');
} else ok('API isPublished (status=approved)');

const seoJs = fs.readFileSync(path.join(ROOT, 'server', 'lib', 'seo.js'), 'utf8');
if (!seoJs.includes("p === '/blog'")) fail('SEO defaults missing /blog');
else ok('SEO titles for /blog listing');

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

function waitForServer(base, max = 50) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      n += 1;
      const req = http.get(`${base}/api/health`, { timeout: 1000 }, (res) => {
        res.resume();
        if (res.statusCode >= 200 && res.statusCode < 500) resolve();
        else if (n >= max) reject(new Error('server did not start'));
        else setTimeout(tick, 150);
      });
      req.on('error', () => {
        if (n >= max) reject(new Error('server did not start'));
        else setTimeout(tick, 150);
      });
      req.on('timeout', () => {
        req.destroy();
        if (n >= max) reject(new Error('server did not start'));
        else setTimeout(tick, 150);
      });
    };
    tick();
  });
}

function spawnServer(port) {
  return spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'development',
      SITEMAP_ON_START: 'false',
      LIVE_DATA_CRON: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function checkLive(base) {
  const root = base.replace(/\/$/, '');

  const listing = await fetchText(`${root}/blog`);
  if (listing.status !== 200) fail(`GET /blog HTTP ${listing.status}`);
  else ok('GET /blog → 200');
  if (!listing.body.includes('id="blogGrid"') || !listing.body.includes('id="page-blog"')) {
    fail('GET /blog HTML missing listing UI');
  } else ok('GET /blog includes listing UI');
  if (!/Seyahat Hikayeleri|Travel Stories/.test(listing.body)) {
    fail('GET /blog missing listing title');
  } else ok('GET /blog SEO title');
  if (!listing.body.includes('CollectionPage')) fail('GET /blog missing CollectionPage JSON-LD');
  else ok('GET /blog CollectionPage JSON-LD');

  const enListing = await fetchText(`${root}/en/blog`);
  if (enListing.status !== 200) fail(`GET /en/blog HTTP ${enListing.status}`);
  else ok('GET /en/blog → 200');

  const apiList = await fetchText(`${root}/api/blogs`);
  let listJson = {};
  try { listJson = JSON.parse(apiList.body); } catch { listJson = {}; }
  if (apiList.status !== 200) fail(`GET /api/blogs HTTP ${apiList.status}`);
  else ok('GET /api/blogs → 200');
  const blogs = listJson.blogs || [];
  const unpublished = blogs.filter((b) => b.status && b.status !== 'approved');
  if (unpublished.length) fail(`public list leaked unpublished (${unpublished.length})`);
  else ok('GET /api/blogs only approved (is_published)');
  const missingFields = blogs.filter((b) => !b.title || !b.slug || b.excerpt == null || !b.authorName || !b.category);
  if (blogs.length && missingFields.length) {
    fail(`list cards missing fields on ${missingFields.length} posts`);
  } else if (blogs.length) ok(`list posts have title, category, author, excerpt, slug (${blogs.length})`);
  else ok('list empty (no seeded blogs in this DB)');
  if (blogs.some((b) => b.isPublished === false)) fail('public list isPublished=false');
  else if (blogs.length) ok('public list isPublished=true');

  const sample = blogs[0] || db.prepare(`
    SELECT slug, title FROM blogs WHERE status = 'approved' AND slug IS NOT NULL AND slug != '' LIMIT 1
  `).get();

  if (sample && sample.slug) {
    const detail = await fetchText(`${root}/blog/${encodeURIComponent(sample.slug)}`);
    if (detail.status !== 200) fail(`GET /blog/${sample.slug} HTTP ${detail.status}`);
    else ok(`GET /blog/${sample.slug} → 200`);
    if (!detail.body.includes(sample.title) && !detail.body.includes('Article')) {
      fail('detail HTML missing title/Article');
    } else ok('GET /blog/:slug includes title or Article JSON-LD');
    if (!detail.body.includes('"@type":"Article"') && !detail.body.includes('"@type": "Article"')) {
      fail('GET /blog/:slug missing Article JSON-LD');
    } else ok('GET /blog/:slug Article JSON-LD');

    const apiDetail = await fetchText(`${root}/api/blogs/${encodeURIComponent(sample.slug)}`);
    let one = {};
    try { one = JSON.parse(apiDetail.body); } catch { one = {}; }
    if (apiDetail.status !== 200 || !one.blog) fail(`GET /api/blogs/${sample.slug} failed`);
    else if (one.blog.status !== 'approved' || one.blog.isPublished !== true) {
      fail('detail API returned unpublished post');
    } else ok('GET /api/blogs/:slug published post');
  } else {
    console.log('  · skipped live /blog/:slug (no approved posts)');
  }

  const missing = await fetchText(`${root}/blog/orta-6-does-not-exist-slug`);
  if (missing.status !== 404) fail(`unknown slug expected 404 got ${missing.status}`);
  else ok('GET /blog/unknown-slug → 404');

  let pendingSlug = null;
  try {
    const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get()
      || db.prepare('SELECT id FROM users LIMIT 1').get();
    if (admin) {
      pendingSlug = `orta6-pending-${Date.now()}`;
      db.prepare(`
        INSERT INTO blogs (user_id, category, title, slug, excerpt, body, status)
        VALUES (?, 'guide', 'ORTA-6 Pending', ?, 'hidden excerpt', 'hidden body', 'pending')
      `).run(admin.id, pendingSlug);
      const leaked = await fetchText(`${root}/api/blogs`);
      let leakedJson = {};
      try { leakedJson = JSON.parse(leaked.body); } catch { leakedJson = {}; }
      const found = (leakedJson.blogs || []).some((b) => b.slug === pendingSlug);
      if (found) fail('pending post appeared on public list');
      else ok('pending post hidden from GET /api/blogs');
      const pendingPage = await fetchText(`${root}/blog/${pendingSlug}`);
      if (pendingPage.status !== 404) fail(`pending HTML expected 404 got ${pendingPage.status}`);
      else ok('GET /blog/:slug pending → 404');
      const pendingApi = await fetchText(`${root}/api/blogs/${pendingSlug}`);
      if (pendingApi.status !== 404) fail(`pending API expected 404 got ${pendingApi.status}`);
      else ok('GET /api/blogs/:slug pending → 404');
    }
  } finally {
    if (pendingSlug) {
      try { db.prepare('DELETE FROM blogs WHERE slug = ?').run(pendingSlug); } catch { /* ignore */ }
    }
  }
}

async function main() {
  const preset = process.env.VERIFY_BLOG_URL;
  if (preset) {
    await checkLive(preset);
  } else {
    const port = 3057;
    const child = spawnServer(port);
    let stderr = '';
    child.stderr.on('data', (c) => { stderr += c; });
    const base = `http://127.0.0.1:${port}`;
    try {
      await waitForServer(base, 50);
      await checkLive(base);
    } catch (e) {
      fail(`live server :${port}: ${e.message}${stderr ? ` (${stderr.slice(0, 220)})` : ''}`);
    } finally {
      child.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 200));
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
    }
  }

  if (failed) {
    console.error(`verify-blog-pages FAILED (${failed})`);
    process.exit(1);
  }
  console.log('verify-blog-pages OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
