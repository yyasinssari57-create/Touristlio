/**
 * [YÜKSEK-4] / v2 KRİTİK-7 JSON-LD Schema.org checks.
 * Usage: node server/scripts/verify-jsonld.js
 * Optional: VERIFY_JSONLD_URL=http://127.0.0.1:3088 node server/scripts/verify-jsonld.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const {
  travelAgency,
  webSite,
  touristAttraction,
  reviewSchema,
  articleSchema,
  contactPage,
  breadcrumbList,
  faqPage,
  jsonLdForPlace,
  jsonLdForBlog,
  jsonLdForHome,
  AGENCY_DESCRIPTION,
} = require('../lib/jsonld');
const { injectSeoHead } = require('../lib/seo');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}

async function parseScripts(html) {
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const out = [];
  let m;
  while ((m = re.exec(html))) {
    try { out.push(JSON.parse(m[1])); }
    catch { fail('invalid JSON-LD script'); }
  }
  return out;
}

function request(port, p) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port, path: p, method: 'GET',
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

function waitForServer(port, tries = 80) {
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
        else setTimeout(tick, 250);
      });
      req.on('timeout', () => {
        req.destroy();
        if (n >= tries) reject(new Error('server did not start'));
        else setTimeout(tick, 250);
      });
    };
    tick();
  });
}

console.log('verify-jsonld');

const indexSrc = fs.readFileSync(path.join(ROOT, 'server/index.js'), 'utf8');
if (!indexSrc.includes('await loadApprovedBlog(slug)')) fail('/blog/:slug does not await loadApprovedBlog');
else ok('/blog/:slug awaits loadApprovedBlog');

const agency = travelAgency();
if (agency['@type'] === 'TravelAgency'
  && agency.name === 'Touristlio'
  && agency.description === AGENCY_DESCRIPTION
  && /Hisset/.test(agency.description)
  && /\/images\/logo\.webp$/.test(agency.logo)
  && agency.url) ok('TravelAgency builder');
else fail('TravelAgency builder mismatch');
if (agency.sameAs) fail('sameAs must stay empty until INSTAGRAM_URL is set');
else ok('sameAs omitted without INSTAGRAM_URL');

const site = webSite();
if (site['@type'] === 'WebSite'
  && site.potentialAction
  && site.potentialAction['@type'] === 'SearchAction'
  && /\/explore\?q=\{search_term_string\}$/.test(site.potentialAction.target)
  && site.potentialAction['query-input'] === 'required name=search_term_string') {
  ok('WebSite SearchAction builder');
} else fail('WebSite SearchAction builder mismatch');

const homeBlocks = jsonLdForHome();
if (homeBlocks.some((b) => b['@type'] === 'TravelAgency')
  && homeBlocks.some((b) => b['@type'] === 'WebSite')) {
  ok('homepage graph: TravelAgency + WebSite');
} else fail('homepage graph missing TravelAgency or WebSite');

const place = {
  name: 'Ayasofya',
  slug: 'ayasofya-istanbul',
  city: 'İstanbul',
  country: 'Türkiye',
  description: 'Tarihi yapı',
  imageUrl: '/images/hero.webp',
  lat: 41.0086,
  lng: 28.9802,
  tiolaCount: 2,
  tiolaRating: 4.5,
  faqTR: [{ q: 'Giriş ücreti var mı?', a: 'Evet, müze kartı geçerlidir.' }],
};
const attraction = touristAttraction(place, 'tr');
if (attraction['@type'] === 'TouristAttraction'
  && attraction.aggregateRating
  && attraction.aggregateRating['@type'] === 'AggregateRating'
  && attraction.aggregateRating.reviewCount === 2
  && attraction.aggregateRating.ratingValue === '4.5'
  && attraction.geo
  && /ayasofya/.test(attraction.url)) ok('TouristAttraction + Tiola AggregateRating');
else fail('TouristAttraction builder mismatch');

const noRating = touristAttraction({ ...place, tiolaCount: 0, tiolaRating: null });
if (!noRating.aggregateRating) ok('no AggregateRating without Tiola scores');
else fail('AggregateRating must not appear without Tiola scores');

const crumbs = breadcrumbList(place, 'tr');
if (crumbs
  && crumbs['@type'] === 'BreadcrumbList'
  && crumbs.itemListElement[0].name === 'Ana Sayfa'
  && crumbs.itemListElement[1].name === 'Türkiye'
  && /explore\?country=turkiye/.test(crumbs.itemListElement[1].item)
  && crumbs.itemListElement[2].name === 'Ayasofya') {
  ok('BreadcrumbList Ana Sayfa → ülke → mekân');
} else fail('BreadcrumbList builder mismatch');

const faq = faqPage(place, 'tr');
if (faq && faq['@type'] === 'FAQPage' && faq.mainEntity[0].name === 'Giriş ücreti var mı?') {
  ok('FAQPage from faqTR');
} else fail('FAQPage builder mismatch');

const review = reviewSchema({
  userName: 'Yasin',
  text: 'Harika bir deneyim',
  stars: 5,
  createdAt: '2026-01-15 10:00:00',
}, place);
if (review['@type'] === 'Review'
  && review.itemReviewed['@type'] === 'TouristAttraction'
  && review.reviewRating.ratingValue === '5'
  && review.author.name === 'Yasin') ok('Review (Tiola) builder');
else fail('Review builder mismatch');

const article = articleSchema({
  title: 'İstanbul Rehberi',
  slug: 'istanbul-rehberi',
  excerpt: 'Kısa özet',
  imageUrl: '/images/hero.webp',
  authorName: 'Yasin',
  publishedAt: '2026-03-01T12:00:00Z',
}, 'tr');
if (article['@type'] === 'Article'
  && article.headline === 'İstanbul Rehberi'
  && article.publisher.name === 'Touristlio') ok('Article builder');
else fail('Article builder mismatch');

const contact = contactPage('tr');
if (contact['@type'] === 'ContactPage'
  && contact.mainEntity['@type'] === 'TravelAgency'
  && /contact/.test(contact.url)) ok('ContactPage builder');
else fail('ContactPage builder mismatch');

const placeBlocks = jsonLdForPlace(place, [{
  user_name: 'Ali',
  text: 'Tiola yorumu',
  stars: 4,
  created_at: '2026-02-01 08:00:00',
  status: 'approved',
}]);
const types = placeBlocks.map((b) => b['@type']);
if (types[0] === 'TouristAttraction'
  && types.includes('BreadcrumbList')
  && types.includes('FAQPage')
  && types.includes('Review')) {
  ok('place page graph: TouristAttraction + BreadcrumbList + FAQPage + Review');
} else fail(`place page graph mismatch: ${types.join(', ')}`);

const htmlPath = path.join(ROOT, 'public', 'index.html');
const raw = fs.readFileSync(htmlPath, 'utf8');
const homeHtml = injectSeoHead(raw, { pathname: '/', lang: 'tr', jsonLd: jsonLdForHome() });
const homeLd = parseScripts(homeHtml);
if (homeLd.some((b) => b['@type'] === 'TravelAgency' && b.name === 'Touristlio')) {
  ok('injectSeoHead homepage TravelAgency');
} else fail('homepage HTML missing TravelAgency JSON-LD');
if (homeLd.some((b) => b['@type'] === 'WebSite' && b.potentialAction && b.potentialAction['@type'] === 'SearchAction')) {
  ok('injectSeoHead homepage WebSite SearchAction');
} else fail('homepage HTML missing WebSite JSON-LD');

const placeHtml = injectSeoHead(raw, { pathname: '/places/ayasofya-istanbul', lang: 'tr', jsonLd: jsonLdForPlace(place, []) });
const placeLd = parseScripts(placeHtml);
if (placeLd.some((b) => b['@type'] === 'TouristAttraction')) ok('injectSeoHead place TouristAttraction');
else fail('place HTML missing TouristAttraction JSON-LD');
if (placeLd.some((b) => b['@type'] === 'BreadcrumbList')) ok('injectSeoHead place BreadcrumbList');
else fail('place HTML missing BreadcrumbList JSON-LD');

const blogHtml = injectSeoHead(raw, {
  pathname: '/blog/istanbul-rehberi',
  lang: 'tr',
  jsonLd: jsonLdForBlog({ title: 'İstanbul Rehberi', slug: 'istanbul-rehberi', excerpt: 'x', authorName: 'Yasin', publishedAt: '2026-03-01' }),
});
if (parseScripts(blogHtml).some((b) => b['@type'] === 'Article')) ok('injectSeoHead blog Article');
else fail('blog HTML missing Article JSON-LD');

const contactRaw = fs.readFileSync(path.join(ROOT, 'public', 'legal', 'contact.html'), 'utf8');
const contactHtml = injectSeoHead(contactRaw, { pathname: '/legal/contact.html', lang: 'tr', jsonLd: [contact] });
if (parseScripts(contactHtml).some((b) => b['@type'] === 'ContactPage')) ok('injectSeoHead ContactPage');
else fail('contact HTML missing ContactPage JSON-LD');

const appJs = fs.readFileSync(path.join(ROOT, 'public/js/app.js'), 'utf8');
if (!appJs.includes("target: `${origin}/explore?q={search_term_string}`")) {
  fail('client WebSite SearchAction missing');
} else ok('client WebSite SearchAction');
if (!appJs.includes('s.nonce = nonce') && !appJs.includes('s.nonce=nonce')) {
  fail('client JSON-LD scripts do not copy CSP nonce');
} else ok('client JSON-LD copies CSP nonce');

async function curlCheck(portOrBase) {
  const isUrl = String(portOrBase).startsWith('http');
  const get = isUrl
    ? async (p) => {
      const res = await fetch(`${String(portOrBase).replace(/\/$/, '')}${p}`);
      return { status: res.status, body: await res.text() };
    }
    : (p) => request(portOrBase, p);

  const home = await get('/');
  if (home.status !== 200) fail(`GET / HTTP ${home.status}`);
  else ok('GET / → 200');
  const homeLdLive = await parseScripts(home.body);
  if (homeLdLive.some((b) => b['@type'] === 'TravelAgency')) ok('GET / TravelAgency');
  else fail('GET / missing TravelAgency');
  if (homeLdLive.some((b) => b['@type'] === 'WebSite' && b.potentialAction && /explore\?q=/.test(b.potentialAction.target || ''))) {
    ok('GET / WebSite SearchAction');
  } else fail('GET / missing WebSite SearchAction');

  const explore = await get('/explore');
  const exploreLd = await parseScripts(explore.body);
  if (explore.status === 200 && exploreLd.some((b) => b['@type'] === 'WebSite')) ok('GET /explore WebSite');
  else fail(`GET /explore missing WebSite (status ${explore.status})`);

  let slug = 'ayasofya-istanbul';
  try {
    const { db } = require('../db');
    const row = await db.prepare(`
      SELECT slug FROM places
      WHERE slug IS NOT NULL AND slug != '' AND COALESCE(status, '') != 'archived'
      ORDER BY id LIMIT 1
    `).get();
    if (row && row.slug) slug = row.slug;
  } catch { /* use default slug */ }

  const placeRes = await get(`/places/${encodeURIComponent(slug)}`);
  const placeLive = await parseScripts(placeRes.body);
  if (placeRes.status === 200) {
    ok(`GET /places/${slug} → 200`);
    if (placeLive.some((b) => b['@type'] === 'TouristAttraction')) ok('place TouristAttraction in HTML');
    else fail('place HTML missing TouristAttraction');
    if (placeLive.some((b) => b['@type'] === 'BreadcrumbList')) ok('place BreadcrumbList in HTML');
    else fail('place HTML missing BreadcrumbList');
  } else if (placeRes.status === 404) {
    ok(`GET /places/${slug} → 404 (no matching place in this DB)`);
  } else {
    fail(`GET /places/${slug} HTTP ${placeRes.status}`);
  }
}

async function checkLive() {
  const preset = process.env.VERIFY_JSONLD_URL;
  if (preset) {
    await curlCheck(preset);
    return;
  }
  const port = 3088;
  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
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
  let out = '';
  child.stdout.on('data', (c) => { out += c; });
  child.stderr.on('data', (c) => { out += c; });
  try {
    await waitForServer(port);
    await curlCheck(port);
  } catch (e) {
    fail(`live JSON-LD check :${port}: ${e.message} ${out.trim().slice(0, 220)}`);
  } finally {
    child.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 200));
    try { child.kill('SIGKILL'); } catch { /* ignore */ }
  }
}

checkLive().then(() => {
  if (failed) {
    console.error('  ✗ JSON-LD verification failed');
    process.exit(1);
  }
  console.log('  ✓ OK');
  process.exit(0);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
