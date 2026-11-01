/**
 * Claude Master PRD — FAZ3-1 (Dinamik JSON-LD Schema).
 *
 * Bu repo zaten server-side application/ld+json enjeksiyonuna sahip
 * (server/lib/jsonld.js + server/lib/seo.js injectSeoHead), ve PRD'nin
 * istediğinden daha kapsamlı (BreadcrumbList, FAQPage, Review de var).
 * verify-jsonld.js bunu büyük ölçüde zaten doğruluyor.
 *
 * Bu script, PRD'nin FAZ3-1 kontrol listesini GERÇEK, çalışan bir sunucu
 * üzerinden (unit-seviye builder çağrıları değil) ucu ucuna doğrular:
 *
 *   1) Ana sayfa (TR + EN) → TravelAgency + WebSite(SearchAction), ikisi de
 *      ayrı JSON-LD obje olarak var mı.
 *   2) Gerçek yorumu OLAN bir mekân → aggregateRating VAR.
 *      Gerçek yorumu OLMAYAN bir mekân → aggregateRating YOK (uydurma puan
 *      eklenmiyor).
 *   3) geo sadece lat/lng gerçek ve (0,0) olmadığında görünüyor — DB'de
 *      lat=0/lng=0 olan gerçek bir satır üzerinden canlı doğrulanır
 *      ("Null Island" — server/lib/sitemap.js'teki isValidSitemapCoord ile
 *      aynı kural, FAZ3-1 kapsamında jsonld.js'e de taşındı).
 *   4) Blog detay sayfası (TR + EN) → Article var.
 *   5) Her <script type="application/ld+json"> bloğu GEÇERLİ JSON mu
 *      (kaçırılmamış tırnak/HTML → bozuk JSON, yaygın gerçek dünya hatası).
 *   6) SPA client-side re-render sonrası JSON-LD "bayatlamıyor" mu —
 *      public/js/app.js'in her client-side route değişiminde
 *      setJsonLdBlocks(...) çağırdığını statik olarak doğrular. Ayrıca
 *      EN blog makalesinde istemci Article URL'sinin /en önekini ve
 *      inLanguage alanını düşürmediğini (sunucu şemasını ezip yanlış
 *      TR URL bırakmadığını) kontrol eder.
 *
 * Usage: node server/scripts/verify-faz3-1-jsonld.js
 * Optional: VERIFY_FAZ31_JSONLD_URL=http://127.0.0.1:3089 node server/scripts/verify-faz3-1-jsonld.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) { console.error('  ✗', msg); failed += 1; }

console.log('verify-faz3-1-jsonld');

// ---------------------------------------------------------------------------
// 0) Static source checks — geo zero-guard + SPA re-injection wiring.
// ---------------------------------------------------------------------------
const jsonldSrc = fs.readFileSync(path.join(ROOT, 'server/lib/jsonld.js'), 'utf8');
if (jsonldSrc.includes('isValidSitemapCoord')) {
  ok('jsonld.js geo, sitemap.js ile aynı (0,0) koruma kuralını kullanıyor');
} else {
  fail('jsonld.js geo (0,0) korumasını kullanmıyor');
}

const appJsSrc = fs.readFileSync(path.join(ROOT, 'public/js/app.js'), 'utf8');
if (/latNum !== 0 && lngNum !== 0/.test(appJsSrc)) {
  ok('client-side (app.js) geo de (0,0) koruması uyguluyor (server ile tutarlı)');
} else {
  fail('client-side (app.js) geo (0,0) koruması eksik — server ile tutarsız olur');
}

const spaCallSites = [
  'injectHomeJsonLd()',
  'setJsonLdBlocks([collectionPageJsonLd()])',
  'setJsonLdBlocks(homeJsonLdBase())',
  'injectPlaceJsonLd(p)',
  'injectPlaceJsonLd(activePlace, data.tiolas)',
  'setJsonLdBlocks([articleJsonLd(b)])',
];
const missingSpaCalls = spaCallSites.filter((snippet) => !appJsSrc.includes(snippet));
if (!missingSpaCalls.length) {
  ok('SPA client-side router, her rota değişiminde (explore/blog/place/detay) JSON-LD\'yi yeniden enjekte ediyor — "bayatlama" riski yok');
} else {
  fail(`SPA JSON-LD re-injection noktaları eksik: ${missingSpaCalls.join(', ')}`);
}

if (/document\.querySelectorAll\('script\[data-tl-jsonld\]'\)\.forEach\(\(s\) => s\.remove\(\)\)/.test(appJsSrc)
  && jsonldSrc.includes('data-tl-jsonld="1"')) {
  ok('client-side setJsonLdBlocks, server-rendered bloğu da data-tl-jsonld ile temizleyip tek bir script seti bırakıyor (çift/çakışan JSON-LD yok)');
} else {
  fail('server ve client JSON-LD script etiketleri aynı data-tl-jsonld işaretçisini paylaşmıyor — çift JSON-LD riski');
}

const articleFn = appJsSrc.match(/function articleJsonLd\(b\) \{[\s\S]*?\n\}/);
if (articleFn && articleFn[0].includes('blogPublicPath(b)') && articleFn[0].includes("inLanguage: lang === 'en' ? 'en' : 'tr'")) {
  ok('client Article JSON-LD, EN rotasında /en URL ve inLanguage kullanıyor (sunucu şemasıyla aynı)');
} else {
  fail('client Article JSON-LD, sunucudaki /en URL veya inLanguage alanını düşürüyor — SPA hidrasyonu EN makaleyi TR URL ile ezer');
}

if (/skipRoute && activeBlogSlug/.test(appJsSrc)) {
  ok('blog makalesi geri yüklenirken sunucu Article bloğu, veri gelene kadar CollectionPage ile ezilmiyor');
} else {
  fail('blog makalesi açılırken sunucu Article JSON-LD\'si hemen CollectionPage ile değiştiriliyor');
}

const { touristAttraction, articleSchema, serializeJsonLd } = require('../lib/jsonld');
const zeroGeo = touristAttraction({ name: 'Null Island', slug: 'null-island', id: 1, lat: 0, lng: 0 }, 'tr');
if (zeroGeo && !zeroGeo.geo) ok('builder: lat=0/lng=0 için geo yok');
else fail(`builder: (0,0) için geo eklenmemeli: ${JSON.stringify(zeroGeo && zeroGeo.geo)}`);

const realGeo = touristAttraction({ name: 'Ayasofya', slug: 'ayasofya-istanbul', id: 1, lat: 41.0082, lng: 28.9784 }, 'tr');
if (realGeo?.geo?.['@type'] === 'GeoCoordinates' && realGeo.geo.latitude === 41.0082) {
  ok('builder: gerçek koordinatta geo var');
} else fail('builder: gerçek koordinatta geo eksik');

const noTiola = touristAttraction({ name: 'X', slug: 'x', id: 1, lat: 41, lng: 29, tiolaCount: 0, tiolaRating: 0 }, 'tr');
if (noTiola && !noTiola.aggregateRating) ok('builder: tiola yoksa aggregateRating yok');
else fail('builder: tiola yokken aggregateRating eklenmemeli');

const withTiola = touristAttraction({ name: 'X', slug: 'x', id: 1, lat: 41, lng: 29, tiolaCount: 4, tiolaRating: 4.5 }, 'tr');
if (withTiola?.aggregateRating?.reviewCount === 4 && withTiola.aggregateRating.ratingValue === '4.5') {
  ok('builder: gerçek tiola varken aggregateRating var');
} else fail('builder: gerçek tiola varken aggregateRating eksik');

const enArticle = articleSchema({ title: 'Hello', slug: 'hello-world', excerpt: 'A short excerpt' }, 'en');
if (enArticle?.inLanguage === 'en' && /\/en\/blog\/hello-world$/.test(enArticle.url || '')) {
  ok('builder: EN Article url /en/blog/... ve inLanguage=en');
} else fail(`builder: EN Article uyumsuz: ${JSON.stringify({ url: enArticle && enArticle.url, inLanguage: enArticle && enArticle.inLanguage })}`);

const trArticle = articleSchema({ title: 'Merhaba', slug: 'merhaba', excerpt: 'Kısa' }, 'tr');
if (trArticle?.inLanguage === 'tr' && /\/blog\/merhaba$/.test(trArticle.url || '') && !/\/en\/blog\//.test(trArticle.url || '')) {
  ok('builder: TR Article url /blog/... ve inLanguage=tr');
} else fail('builder: TR Article url veya inLanguage hatalı');

const escaped = serializeJsonLd({ reviewBody: '</script><script>alert(1)' });
try {
  JSON.parse(escaped);
  if (escaped.includes('</script>')) fail('serializeJsonLd </script> kaçışını yapmıyor');
  else ok('serializeJsonLd < karakterini kaçırıyor ve JSON geçerli kalıyor');
} catch (e) {
  fail(`serializeJsonLd geçersiz JSON üretti: ${e.message}`);
}

// ---------------------------------------------------------------------------
// HTML parsing helpers.
// ---------------------------------------------------------------------------
function parseScripts(html) {
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const out = [];
  let m;
  while ((m = re.exec(html))) {
    try {
      out.push(JSON.parse(m[1]));
    } catch (e) {
      fail(`geçersiz JSON-LD (JSON.parse başarısız): ${e.message}`);
    }
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
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
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

async function findFixtures() {
  const fixtures = {
    placeWithoutReviews: 'ayasofya-istanbul',
    placeWithReviews: null,
    placeWithGeo: null,
    blogSlug: null,
    zeroCoordSlug: null,
  };
  try {
    const { db, initDb } = require('../db');
    await initDb();
    const noReview = await db.prepare(`
      SELECT slug FROM places
      WHERE slug IS NOT NULL AND slug != '' AND COALESCE(status, '') != 'archived'
        AND COALESCE(tiola_count, 0) = 0
      ORDER BY id LIMIT 1
    `).get();
    if (noReview?.slug) fixtures.placeWithoutReviews = noReview.slug;

    const withReview = await db.prepare(`
      SELECT slug FROM places
      WHERE slug IS NOT NULL AND slug != '' AND COALESCE(status, '') != 'archived'
        AND COALESCE(tiola_count, 0) > 0
      ORDER BY tiola_count DESC LIMIT 1
    `).get();
    if (withReview?.slug) fixtures.placeWithReviews = withReview.slug;

    const zeroCoord = await db.prepare(`
      SELECT slug FROM places
      WHERE slug IS NOT NULL AND slug != '' AND COALESCE(status, '') != 'archived'
        AND lat = 0 AND lng = 0
      ORDER BY id LIMIT 1
    `).get();
    if (zeroCoord?.slug) fixtures.zeroCoordSlug = zeroCoord.slug;

    const withGeo = await db.prepare(`
      SELECT slug FROM places
      WHERE slug IS NOT NULL AND slug != '' AND COALESCE(status, '') != 'archived'
        AND lat IS NOT NULL AND lng IS NOT NULL
        AND lat <> 0 AND lng <> 0
        AND abs(lat) <= 90 AND abs(lng) <= 180
      ORDER BY id LIMIT 1
    `).get();
    if (withGeo?.slug) fixtures.placeWithGeo = withGeo.slug;

    const blog = await db.prepare(`
      SELECT slug FROM blogs WHERE status = 'approved' AND slug IS NOT NULL ORDER BY id LIMIT 1
    `).get();
    if (blog?.slug) fixtures.blogSlug = blog.slug;
  } catch (e) {
    fail(`fixture sorgusu başarısız: ${e.message}`);
  }
  return fixtures;
}

async function curlCheck(port) {
  const get = (p) => request(port, p);
  const fixtures = await findFixtures();

  // 1) Home TR + EN — TravelAgency + WebSite(SearchAction), ayrı obje olarak.
  for (const [label, p] of [['TR', '/'], ['EN', '/en/']]) {
    const res = await get(p);
    if (res.status !== 200) { fail(`GET ${p} (${label}) → HTTP ${res.status}`); continue; }
    const blocks = parseScripts(res.body);
    const agency = blocks.find((b) => b['@type'] === 'TravelAgency');
    const site = blocks.find((b) => b['@type'] === 'WebSite');
    if (agency && site && site.potentialAction?.['@type'] === 'SearchAction') {
      ok(`Ana sayfa (${label}): TravelAgency + WebSite/SearchAction ayrı objeler olarak var`);
    } else {
      fail(`Ana sayfa (${label}): TravelAgency ve/veya WebSite+SearchAction eksik`);
    }
  }

  // 2) Place without reviews — aggregateRating YOK, geo VAR (gerçek koordinat varsa).
  if (fixtures.placeWithoutReviews) {
    const res = await get(`/places/${encodeURIComponent(fixtures.placeWithoutReviews)}`);
    if (res.status === 200) {
      const blocks = parseScripts(res.body);
      const attraction = blocks.find((b) => b['@type'] === 'TouristAttraction');
      if (attraction && !attraction.aggregateRating) {
        ok(`Yorumu olmayan mekân (${fixtures.placeWithoutReviews}): aggregateRating YOK — uydurma puan eklenmiyor`);
      } else if (!attraction) {
        fail(`Yorumu olmayan mekân (${fixtures.placeWithoutReviews}): TouristAttraction bulunamadı`);
      } else {
        fail(`Yorumu olmayan mekân (${fixtures.placeWithoutReviews}): aggregateRating VAR olmamalıydı: ${JSON.stringify(attraction.aggregateRating)}`);
      }
    } else {
      fail(`GET /places/${fixtures.placeWithoutReviews} → HTTP ${res.status}`);
    }
  } else {
    fail('yorumsuz bir mekân fixture\'ı bulunamadı (DB boş olabilir)');
  }

  // 3) Place with real reviews — aggregateRating VAR, reviewCount gerçek sayı.
  if (fixtures.placeWithReviews) {
    const res = await get(`/places/${encodeURIComponent(fixtures.placeWithReviews)}`);
    if (res.status === 200) {
      const blocks = parseScripts(res.body);
      const attraction = blocks.find((b) => b['@type'] === 'TouristAttraction');
      if (attraction?.aggregateRating?.reviewCount > 0) {
        ok(`Gerçek Tiola'sı olan mekân (${fixtures.placeWithReviews}): aggregateRating VAR (reviewCount=${attraction.aggregateRating.reviewCount})`);
      } else {
        fail(`Gerçek Tiola'sı olan mekân (${fixtures.placeWithReviews}): aggregateRating eksik`);
      }
    } else {
      fail(`GET /places/${fixtures.placeWithReviews} → HTTP ${res.status}`);
    }
  } else {
    ok('gerçek yorumu olan bir mekân fixture\'ı yok (atlandı) — DB\'de approved Tiola bulunamadı');
  }

  // 4) Gerçek koordinat — geo VAR.
  if (fixtures.placeWithGeo) {
    const res = await get(`/places/${encodeURIComponent(fixtures.placeWithGeo)}`);
    if (res.status === 200) {
      const blocks = parseScripts(res.body);
      const attraction = blocks.find((b) => b['@type'] === 'TouristAttraction');
      if (attraction?.geo?.['@type'] === 'GeoCoordinates'
        && Number(attraction.geo.latitude) !== 0
        && Number(attraction.geo.longitude) !== 0) {
        ok(`Gerçek koordinatlı mekân (${fixtures.placeWithGeo}): geo VAR`);
      } else if (!attraction) {
        fail(`Gerçek koordinatlı mekân (${fixtures.placeWithGeo}): TouristAttraction bulunamadı`);
      } else {
        fail(`Gerçek koordinatlı mekân (${fixtures.placeWithGeo}): geo eksik veya 0: ${JSON.stringify(attraction.geo)}`);
      }
    } else {
      fail(`GET /places/${fixtures.placeWithGeo} → HTTP ${res.status}`);
    }
  } else {
    fail('gerçek koordinatlı bir mekân fixture\'ı bulunamadı');
  }

  // 5) (0,0) koordinatlı gerçek bir satır — geo KESİNLİKLE görünmemeli.
  if (fixtures.zeroCoordSlug) {
    const res = await get(`/places/${encodeURIComponent(fixtures.zeroCoordSlug)}`);
    if (res.status === 200) {
      const blocks = parseScripts(res.body);
      const attraction = blocks.find((b) => b['@type'] === 'TouristAttraction');
      if (attraction && !attraction.geo) {
        ok(`lat=0/lng=0 olan mekân (${fixtures.zeroCoordSlug}): geo YOK — "Null Island" (0,0) uydurma koordinat olarak eklenmiyor`);
      } else if (attraction?.geo) {
        fail(`lat=0/lng=0 olan mekân (${fixtures.zeroCoordSlug}): geo VAR olmamalıydı: ${JSON.stringify(attraction.geo)}`);
      } else {
        fail(`lat=0/lng=0 olan mekân (${fixtures.zeroCoordSlug}): TouristAttraction bulunamadı`);
      }
    } else {
      fail(`GET /places/${fixtures.zeroCoordSlug} → HTTP ${res.status}`);
    }
  } else {
    ok('(0,0) koordinatlı test satırı yok (atlandı) — temiz bir DB\'de bu normal');
  }

  // 6) Blog detay — TR + EN, Article var ve URL dile uyuyor.
  if (fixtures.blogSlug) {
    for (const [label, prefix] of [['TR', ''], ['EN', '/en']]) {
      const res = await get(`${prefix}/blog/${encodeURIComponent(fixtures.blogSlug)}`);
      if (res.status === 200) {
        const blocks = parseScripts(res.body);
        const article = blocks.find((b) => b['@type'] === 'Article');
        const wantLang = label === 'EN' ? 'en' : 'tr';
        const url = String(article?.url || '');
        const urlOk = label === 'EN' ? /\/en\/blog\//.test(url) : (/\/blog\//.test(url) && !/\/en\/blog\//.test(url));
        if (article?.headline && article.inLanguage === wantLang && urlOk) {
          ok(`Blog detay (${label}): Article var, inLanguage="${article.inLanguage}", url dile uyuyor`);
        } else if (!article) {
          fail(`Blog detay (${label}): Article bulunamadı`);
        } else {
          fail(`Blog detay (${label}): inLanguage/url uyumsuz (inLanguage=${article.inLanguage}, url=${url})`);
        }
      } else {
        fail(`GET ${prefix}/blog/${fixtures.blogSlug} (${label}) → HTTP ${res.status}`);
      }
    }
  } else {
    fail('onaylı bir blog fixture\'ı bulunamadı (DB boş olabilir)');
  }
}

async function checkLive() {
  const preset = process.env.VERIFY_FAZ31_JSONLD_URL;
  if (preset) {
    const port = Number(new URL(preset).port) || 80;
    await curlCheck(port);
    return;
  }
  const port = 3089;
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
    fail(`canlı JSON-LD kontrolü :${port}: ${e.message} ${out.trim().slice(0, 400)}`);
  } finally {
    child.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 200));
    try { child.kill('SIGKILL'); } catch { /* ignore */ }
  }
}

checkLive().then(() => {
  if (failed) {
    console.error('  ✗ FAZ3-1 JSON-LD verification failed');
    process.exit(1);
  }
  console.log('  ✓ OK');
  process.exit(0);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
