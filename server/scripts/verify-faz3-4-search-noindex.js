/**
 * Claude Master PRD — FAZ3-4 (arama sayfası canonical + noindex).
 * Usage: node server/scripts/verify-faz3-4-search-noindex.js
 *
 * Parametreli /explore, /search ve /places noindex olur; canonical sorguyu
 * taşımaz. Parametresiz liste ve mekân detayı indexlenir. Veritabanı gerekmez.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
  shouldNoindexPath,
  shouldNoindexDocument,
  buildSeoHead,
  injectSeoHead,
  siteBaseUrl,
} = require('../lib/seo');
const { sendPublicHtml } = require('../lib/send-public-html');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function headOf(html) {
  const i = String(html).toLowerCase().indexOf('</head>');
  return i === -1 ? String(html) : String(html).slice(0, i);
}

function robotsOf(html) {
  const m = headOf(html).match(/name="robots" content="([^"]*)"/);
  return m ? m[1] : '';
}

function canonicalOf(html) {
  const m = headOf(html).match(/rel="canonical" href="([^"]*)"/);
  return m ? m[1] : '';
}

console.log('verify-faz3-4-search-noindex');

const base = siteBaseUrl();

if (shouldNoindexPath('/search', {})) fail('bare /search must stay indexable');
else ok('bare /search is indexable');
if (!shouldNoindexPath('/search', { q: 'istanbul' })) fail('/search?q= must be noindex');
else ok('/search?q= noindex');
if (!shouldNoindexPath('/en/explore', { country: 'turkey' })) fail('EN /explore?country= noindex');
else ok('EN /explore?country= noindex');
if (shouldNoindexPath('/explore', {})) fail('bare /explore must stay indexable');
else ok('bare /explore is indexable');
if (!shouldNoindexPath('/places', { tab: 'map' })) fail('/places?tab= noindex');
else ok('/places?tab= noindex');
if (shouldNoindexPath('/places/ayasofya-istanbul', { utm: '1' })) fail('place detail with query must stay indexable');
else ok('place detail with query stays indexable');
if (shouldNoindexPath('/', { country: 'turkey' })) fail('homepage query is not a listing path');
else ok('homepage query is not noindex by itself');
if (shouldNoindexPath('/gezilecek-yerler', { q: 'a' })) fail('/gezilecek-yerler is outside FAZ3-4 paths');
else ok('/gezilecek-yerler query is unchanged');
if (!shouldNoindexPath('/admin', {})) fail('/admin always noindex');
else ok('/admin always noindex');
if (!shouldNoindexPath('/en/login', {})) fail('/en/login always noindex');
else ok('/en/login always noindex');
if (!shouldNoindexPath('/account', {})) fail('/account always noindex');
else ok('/account always noindex');
if (!shouldNoindexDocument('login.html', '/login', {})) fail('login.html file noindex');
else ok('login.html file noindex');
if (!shouldNoindexDocument('404.html', '/missing', {})) fail('404.html file noindex');
else ok('404.html file noindex');
if (shouldNoindexDocument('search.html', '/search', {})) fail('search.html without query noindex');
else ok('search.html without query is indexable');
if (!shouldNoindexDocument('search.html', '/search', { q: 'paris', page: '2' })) fail('search.html with query');
else ok('search.html with query is noindex');

const bareSearch = buildSeoHead({ pathname: '/search', lang: 'tr' });
if (bareSearch.includes('noindex')) fail('buildSeoHead /search without flag is noindex');
else ok('buildSeoHead does not noindex bare /search by itself');
if (!bareSearch.includes(`rel="canonical" href="${base}/search"`)) fail('bare search canonical');
else ok('bare /search canonical has no query');

const filtered = buildSeoHead({ pathname: '/explore', lang: 'tr', noindex: true });
if (!filtered.includes('noindex, nofollow')) fail('filtered robots text');
else ok('noindex robots text is noindex, nofollow');
if (filtered.includes('hreflang=')) fail('noindex head still has hreflang');
else ok('noindex head omits hreflang');
if (!filtered.includes(`rel="canonical" href="${base}/explore"`)) fail('filtered canonical');
else ok('filtered canonical is /explore without query');

const filteredEn = buildSeoHead({ pathname: '/en/search', lang: 'en', noindex: true });
if (!filteredEn.includes(`rel="canonical" href="${base}/en/search"`)) fail('EN search canonical');
else ok('EN filtered canonical is /en/search');

const place = injectSeoHead('<html><head></head><body></body></html>', {
  pathname: '/places/ayasofya-istanbul',
  lang: 'tr',
  noindex: shouldNoindexDocument('index.html', '/places/ayasofya-istanbul', { utm_source: 'share' }),
  title: 'Ayasofya — Touristlio',
});
if (robotsOf(place) !== 'index,follow') fail(`place robots ${robotsOf(place)}`);
else ok('place?utm stays index,follow');
if (canonicalOf(place) !== `${base}/places/ayasofya-istanbul`) fail(`place canonical ${canonicalOf(place)}`);
else ok('place canonical drops the query');

async function render(relativePath, originalUrl, query) {
  let body = '';
  const res = {
    req: {
      originalUrl,
      url: originalUrl,
      query,
      tlLang: String(originalUrl).startsWith('/en') ? 'en' : 'tr',
    },
    locals: {},
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    set() { return this; },
    send(html) { body = html; },
  };
  await sendPublicHtml(res, path.join(ROOT, 'public'), relativePath);
  return body;
}

(async () => {
  const searchBare = await render('search.html', '/search', {});
  if (robotsOf(searchBare) !== 'index,follow') fail(`GET /search robots ${robotsOf(searchBare)}`);
  else ok('GET /search robots index,follow');
  if (canonicalOf(searchBare) !== `${base}/search`) fail(`GET /search canonical ${canonicalOf(searchBare)}`);
  else ok('GET /search canonical');
  if (!headOf(searchBare).includes('hreflang="tr"')) fail('GET /search missing hreflang');
  else ok('GET /search has hreflang');

  const searchQ = await render('search.html', '/search?q=istanbul&page=2', { q: 'istanbul', page: '2' });
  if (robotsOf(searchQ) !== 'noindex, nofollow') fail(`GET /search?q robots ${robotsOf(searchQ)}`);
  else ok('GET /search?q=istanbul robots noindex, nofollow');
  if (canonicalOf(searchQ) !== `${base}/search`) fail(`GET /search?q canonical ${canonicalOf(searchQ)}`);
  else ok('GET /search?q canonical strips the query');
  if (headOf(searchQ).includes('hreflang=')) fail('GET /search?q still has hreflang');
  else ok('GET /search?q omits hreflang');
  if (canonicalOf(searchQ).includes('q=')) fail('canonical leaked the query');
  else ok('canonical has no q=');

  const searchEn = await render('search.html', '/en/search?q=paris', { q: 'paris' });
  if (robotsOf(searchEn) !== 'noindex, nofollow') fail(`GET /en/search?q robots ${robotsOf(searchEn)}`);
  else ok('GET /en/search?q robots noindex');
  if (canonicalOf(searchEn) !== `${base}/en/search`) fail(`GET /en/search?q canonical ${canonicalOf(searchEn)}`);
  else ok('GET /en/search?q canonical is /en/search');

  const login = await render('login.html', '/login', {});
  if (robotsOf(login) !== 'noindex, nofollow') fail(`GET /login robots ${robotsOf(login)}`);
  else ok('GET /login stays noindex');

  const exploreFiltered = injectSeoHead(read('public/index.html'), {
    pathname: '/explore',
    lang: 'tr',
    noindex: shouldNoindexDocument('index.html', '/explore', { country: 'turkey', category: 'nature' }),
  });
  if (robotsOf(exploreFiltered) !== 'noindex, nofollow') fail('injected /explore?country robots');
  else ok('injected /explore?country robots noindex');
  if (canonicalOf(exploreFiltered) !== `${base}/explore`) fail(`injected explore canonical ${canonicalOf(exploreFiltered)}`);
  else ok('injected /explore?country canonical is /explore');

  const exploreClean = injectSeoHead(read('public/index.html'), {
    pathname: '/explore',
    lang: 'tr',
    noindex: shouldNoindexDocument('index.html', '/explore', {}),
  });
  if (robotsOf(exploreClean) !== 'index,follow') fail('clean /explore robots');
  else ok('clean /explore stays index,follow');
  if (canonicalOf(exploreClean) !== `${base}/explore`) fail('clean /explore canonical drifted');
  else ok('clean /explore canonical stays /explore');

  const sendSrc = read('server/lib/send-public-html.js');
  if (!sendSrc.includes('shouldNoindexDocument')) fail('sendPublicHtml does not use shouldNoindexDocument');
  else ok('sendPublicHtml uses shouldNoindexDocument');

  const appJs = read('public/js/app.js');
  const i18n = read('public/js/i18n.js');
  const searchHtml = read('public/search.html');
  if (!i18n.includes('function syncParamListingSeo')) fail('i18n missing syncParamListingSeo');
  else ok('i18n syncParamListingSeo');
  if (!appJs.includes("tab === 'explore') window.TL_I18N?.syncParamListingSeo?.()")) {
    fail('showMainTab does not sync listing seo');
  } else ok('showMainTab syncs explore listing seo');
  if (!appJs.includes("route.main === 'explore') window.TL_I18N?.syncParamListingSeo?.()")) {
    fail('writeRouteToUrl does not sync listing seo');
  } else ok('filter URL updates sync listing seo');
  if (!searchHtml.includes('syncParamListingSeo')) fail('search page does not sync listing seo');
  else ok('search page syncs listing seo');

  const client = runClient();
  assertClient(client, '/explore', '?country=turkey', 'https://www.touristlio.com', {
    robots: 'noindex, nofollow',
    canonical: 'https://www.touristlio.com/explore',
  }, 'client /explore?country=');
  assertClient(client, '/explore', '', 'https://www.touristlio.com', {
    robots: 'index,follow',
    canonical: 'https://www.touristlio.com/explore',
  }, 'client clean /explore');
  assertClient(client, '/en/search', '?q=paris', 'https://www.touristlio.com', {
    robots: 'noindex, nofollow',
    canonical: 'https://www.touristlio.com/en/search',
  }, 'client /en/search?q=');
  assertClient(client, '/search', '', 'https://www.touristlio.com', {
    robots: 'index,follow',
    canonical: 'https://www.touristlio.com/search',
  }, 'client bare /search');
  assertClient(client, '/', '', 'https://www.touristlio.com', {
    robots: 'index,follow',
    canonical: 'https://www.touristlio.com/',
  }, 'client home /');
  assertClient(client, '/en/', '', 'https://www.touristlio.com', {
    robots: 'index,follow',
    canonical: 'https://www.touristlio.com/en/',
  }, 'client home /en/');
  const placeClient = client('/places/ayasofya-istanbul', '?utm=1', 'https://www.touristlio.com');
  if (placeClient.robots !== 'index,follow' || placeClient.canonical !== 'https://www.touristlio.com/stay') {
    fail(`client place page was rewritten robots=${placeClient.robots} canonical=${placeClient.canonical}`);
  } else ok('client leaves /places/:slug alone');

  const local = client('/search', '?q=roma', 'http://localhost:3000');
  if (local.canonical !== 'http://localhost:3000/search' || local.robots !== 'noindex, nofollow') {
    fail(`localhost client canonical ${local.canonical} robots ${local.robots}`);
  } else ok('localhost canonical stays on the local origin');

  if (failed) {
    console.error(`verify-faz3-4-search-noindex: ${failed} failed`);
    process.exit(1);
  }
  console.log('verify-faz3-4-search-noindex: ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

function createDocument(origin) {
  const nodes = [];
  function matches(el, sel) {
    if (sel === 'link[rel="canonical"]') return el.tag === 'link' && el.attrs.rel === 'canonical';
    const meta = /^meta\[(name|property)="([^"]+)"\]$/.exec(sel);
    if (meta) return el.tag === 'meta' && el.attrs[meta[1]] === meta[2];
    return false;
  }
  const canonical = {
    tag: 'link',
    attrs: { rel: 'canonical', href: `${origin}/stay` },
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; },
    remove() {},
  };
  const robots = {
    tag: 'meta',
    attrs: { name: 'robots', content: 'index,follow' },
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; },
    remove() {},
  };
  nodes.push(canonical, robots);
  return {
    head: { appendChild(el) { nodes.push(el); } },
    querySelector(sel) { return nodes.find((el) => matches(el, sel)) || null; },
    createElement(tag) {
      return {
        tag,
        attrs: {},
        setAttribute(k, v) { this.attrs[k] = v; },
        getAttribute(k) { return this.attrs[k]; },
        remove() {},
      };
    },
    _nodes: nodes,
  };
}

function runClient() {
  const code = read('public/js/i18n.js');
  return function visit(pathname, search, origin) {
    const document = createDocument(origin);
    const sandbox = {
      console,
      URLSearchParams,
      document,
      location: {
        pathname,
        search,
        hostname: origin.includes('localhost') ? 'localhost' : 'www.touristlio.com',
        origin,
      },
      localStorage: {
        getItem() { return null; },
        setItem() {},
      },
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    sandbox.TL_I18N.syncParamListingSeo();
    const canon = document.querySelector('link[rel="canonical"]');
    const robots = document.querySelector('meta[name="robots"]');
    return {
      canonical: canon && canon.getAttribute('href'),
      robots: robots && robots.getAttribute('content'),
    };
  };
}

function assertClient(client, pathname, search, origin, expect, label) {
  const got = client(pathname, search, origin);
  if (got.robots !== expect.robots || got.canonical !== expect.canonical) {
    fail(`${label} robots=${got.robots} canonical=${got.canonical}`);
  } else ok(label);
}
