/**
 * V4 Adım 5 — şablon ve adres-benzeri kopya taslak.
 * Usage: node server/scripts/verify-v4-adim5-places.js
 */
const fs = require('fs');
const path = require('path');
const audit = require('./audit-places-quality');
const { planUnpublish, withSeedSlugs } = require('../lib/v4-adim5-plan');
const { placeSitemapPath } = require('../lib/sitemap');
const { shellDescription } = require('../../public/js/place-count-copy');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;

function ok(msg) {
  console.log('  ✓', msg);
}
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function place(partial) {
  return audit.normalizePlace({
    id: partial.id,
    name: partial.name,
    slug: partial.slug,
    city: partial.city || 'Kars',
    country: partial.country || 'Turkey',
    category: partial.category || 'landmark',
    status: partial.status || 'published',
    location: partial.location || '',
    lat: partial.lat,
    lng: partial.lng,
    description: partial.description || 'x'.repeat(80),
    overview: partial.overview || '',
    imageUrl: partial.imageUrl || '',
    photos: partial.photos || [],
    tiolaCount: partial.tiolaCount || 0,
  }, null);
}

console.log('verify-v4-adim5-places');

const generated = place({
  id: 1,
  name: 'Vienna Old Town',
  slug: 'vienna-old-town-vienna',
  city: 'Vienna',
  country: 'Austria',
  location: 'Old Town, Vienna',
});
const review = place({
  id: 2,
  name: 'Tallinn Old Town',
  slug: 'tallinn-old-town-tallinn',
  city: 'Tallinn',
  country: 'Estonia',
  location: 'Tallinn',
});
const rich = place({
  id: 10,
  name: 'Ani Ruins',
  slug: 'ani-ruins-kars',
  city: 'Kars',
  lat: 40.5,
  lng: 43.5,
  description: 'a'.repeat(200),
  tiolaCount: 2,
});
const poor = place({
  id: 11,
  name: 'Kars Ani Ruins',
  slug: 'kars-ani-ruins-kars',
  city: 'Kars',
  lat: 40.9,
  lng: 43.1,
  description: 'b'.repeat(40),
});
const nearA = place({
  id: 20,
  name: 'Ayasofya',
  slug: 'ayasofya-istanbul',
  city: 'Istanbul',
  lat: 41.0086,
  lng: 28.9802,
});
const nearB = place({
  id: 21,
  name: 'Kapalıçarşı',
  slug: 'kapalicarsi-istanbul',
  city: 'Istanbul',
  lat: 41.0086,
  lng: 28.9825,
});
const photoA = place({
  id: 30,
  name: 'Bir',
  slug: 'bir-izmir',
  city: 'Izmir',
  imageUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600',
});
const photoB = place({
  id: 31,
  name: 'Iki',
  slug: 'iki-izmir',
  city: 'Izmir',
  lat: 38.4,
  lng: 27.1,
  imageUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200',
});

const sample = planUnpublish([generated, review, rich, poor, nearA, nearB, photoA, photoB]);
const sampleIds = new Set(sample.drafts.map((row) => Number(row.id)));
if (!sampleIds.has(1) || sample.drafts.find((row) => row.id === 1).reason !== 'sablon_uretim') {
  fail('üretim şablonu taslak değil');
} else ok('üretim şablonu taslak');
if (sampleIds.has(2)) fail('Tallinn Old Town taslağa alındı');
else ok('gözden geçir eski şehir duruyor');
if (!sampleIds.has(11)) fail('zayıf kopya taslak değil');
else ok('adres benzeri zayıf kopya taslak');
if (sampleIds.has(10)) fail('dolu kopya taslağa alındı');
else ok('dolu kopya yayında');
const aniRedirect = sample.redirects.find((row) => Number(row.fromId) === 11 && Number(row.toId) === 10);
if (!aniRedirect) fail('zayıf kopyadan dolu kayda yönlendirme yok');
else ok('301 zayıf slug → dolu slug');
if (sampleIds.has(20) || sampleIds.has(21)) fail('yalnızca yakın koordinat çifti taslağa alındı');
else ok('Ayasofya / Kapalıçarşı çifti duruyor');
if (sampleIds.has(30) || sampleIds.has(31)) fail('ortak görsel taslağa alındı');
else ok('ortak Unsplash görseli taslak sebebi değil');

const raw = JSON.parse(read('server/data/places.json'));
const saved = JSON.parse(read('server/data/v4-adim5-unpublish.json'));
const again = planUnpublish(withSeedSlugs(raw));
const againIds = again.drafts.map((row) => Number(row.id)).sort((a, b) => a - b);
const savedIds = saved.drafts.map((row) => Number(row.id)).sort((a, b) => a - b);
if (againIds.join(',') !== savedIds.join(',')) fail('plan dosyası places.json ile uyuşmuyor');
else ok('plan dosyası yeniden hesapla aynı');

const byId = new Map(raw.map((row) => [Number(row.id), row]));
let statusMiss = 0;
for (const item of saved.drafts) {
  const row = byId.get(Number(item.id));
  if (!row || row.status !== 'draft') statusMiss += 1;
}
if (statusMiss) fail(`places.json taslak durumu eksik: ${statusMiss}`);
else ok(`places.json ${saved.drafts.length} kayıt status=draft`);

const protectedDrafted = saved.protected.filter((item) => {
  const row = byId.get(Number(item.id));
  return row && row.status === 'draft';
});
if (protectedDrafted.length) fail('korunan eski şehir taslak');
else ok(`korunan ${saved.protected.length} eski şehir yayında`);

const expectedProtected = [
  'Albuquerque Old Town', 'Bucharest Old Town', 'Dubrovnik Old Town', 'Jakarta Old Town',
  'Lubeck Old Town', 'Lviv Old Town', 'Nessebar Old Town', 'Plovdiv Old Town',
  'Rhodes Old Town', 'Riga Old Town', 'Salzburg Old Town', 'Takayama Old Town',
  'Tallinn Old Town', 'Tbilisi Old Town', 'Vilnius Old Town', 'Warsaw Old Town',
];
const protectedNames = saved.protected.map((row) => row.name).sort();
if (protectedNames.join('|') !== expectedProtected.slice().sort().join('|')) {
  fail(`korunan adlar: ${protectedNames.join(', ')}`);
} else ok('16 gözden geçir listesi aynı');

if (saved.counts.templateDrafts !== 119 || saved.counts.duplicateDrafts !== 24 || saved.counts.drafts !== 143) {
  fail(`sayılar ${saved.counts.templateDrafts}/${saved.counts.duplicateDrafts}/${saved.counts.drafts}`);
} else ok('119 şablon + 24 kopya = 143 taslak');
if (saved.counts.nearbyOnlyPairs !== 42 || saved.counts.similarPairs !== 24) {
  fail(`çift sayıları yakın ${saved.counts.nearbyOnlyPairs} benzer ${saved.counts.similarPairs}`);
} else ok('42 yakın çift duruyor, 24 adres-benzeri işlendi');
if (saved.redirects.length !== 24) fail(`yönlendirme ${saved.redirects.length}`);
else ok('24 kopya yönlendirmesi');

const report = audit.buildReport(withSeedSlugs(raw), { source: 'places.json' });
const counts = report.summary.counts;
if (counts.A_sablon_uretim_published !== 0) fail(`yayındaki üretim şablonu ${counts.A_sablon_uretim_published}`);
else ok('yayındaki üretim şablonu 0');
if (counts.A_gozden_gecir_published !== 16) fail(`yayındaki gözden geçir ${counts.A_gozden_gecir_published}`);
else ok('16 gözden geçir hâlâ yayında');
if (report.summary.publishedCount !== raw.length - saved.drafts.length) {
  fail(`yayın ${report.summary.publishedCount}, beklenen ${raw.length - saved.drafts.length}`);
} else ok(`yayın ${report.summary.publishedCount} (önce ${raw.length})`);

const sampleDraft = saved.drafts[0];
const sitemapRow = {
  slug: sampleDraft.slug,
  lat: 41.01,
  lng: 28.97,
  description: 'y'.repeat(80),
  overview: 'y'.repeat(80),
};
if (placeSitemapPath({ ...sitemapRow, status: 'draft' })) {
  fail('taslak site haritasına girdi');
} else ok('taslak site haritasında yok');
if (!placeSitemapPath({ ...sitemapRow, status: 'published' })) {
  fail('yayın durumuna alınca site haritası yolu yok');
} else ok('yeniden yayın site haritasına döner');

const migration = read('db/migrations/018_v4_adim5_draft_places.js');
if (/DELETE\s+FROM\s+places/i.test(migration)) fail('migration yer siliyor');
else ok('migration yer silmiyor');
if (!migration.includes("status = 'draft'") || !migration.includes('v4-adim5-unpublish.json')) {
  fail('migration taslak planını uygulamıyor');
} else ok('migration status=draft ve plan dosyası');
if (!migration.includes('place_slug_redirects')) fail('301 tablosu yok');
else ok('eski slug yönlendirme tablosu');
if (!migration.includes('protected')) fail('korunan kayıt kontrolü yok');
else ok('korunan kayıtlar atlanıyor');

const seed = read('server/seed.js');
if (!seed.includes('@status') || !seed.includes('p.status')) fail('seed status yazmıyor');
else ok('seed places.json durumunu yazar');

const search = read('server/lib/places-search.js');
const stats = read('server/lib/stats-cache.js');
const adminRoute = read('server/routes/admin.js');
const adminHtml = read('public/admin.html');
const home = read('server/index.js');
if (!search.includes('publishedPlaceSql')) fail('liste taslağı da gösteriyor');
else ok('genel yer listesi yalnızca yayında');
if (!stats.includes('publishedPlaceSql')) fail('ana sayfa sayacı taslakları sayıyor');
else ok('ana sayfa sayacı yayındaki yer');
if (!adminRoute.includes('req.query.status')) fail('admin durum filtresini iletmiyor');
else ok('admin liste durum parametresi');
if (!adminHtml.includes('placeStatusFilter') || !adminHtml.includes('>Taslak<')) fail('admin Taslak filtresi yok');
else ok('admin Taslak filtresi');
if (!home.includes('publishedRedirectSlug') || !home.includes('301')) fail('eski slug 301 değil');
else ok('yayından çıkan kopya 301');

const counted = shellDescription('home', 'tr', { countries: 12, places: 340 });
if (!counted.includes('12 ülke') || !counted.includes('340 destinasyon') || counted.includes('1.090')) {
  fail(`sayaç metni: ${counted}`);
} else ok('ana sayfa metni sabit 1.090 kullanmıyor');

const seo = read('server/lib/seo.js');
const i18n = read('public/js/i18n.js');
const indexHtml = read('public/index.html');
if (seo.includes('1.090+') || i18n.includes('1.090+') || indexHtml.includes('1.090+')) {
  fail('sabit 1.090+ metni duruyor');
} else ok('sabit 1.090+ metni kalktı');

if (failed) {
  console.error(`verify-v4-adim5-places: ${failed} hata`);
  process.exit(1);
}
console.log('verify-v4-adim5-places: tamam');
console.log(`  yayın: ${report.summary.publishedCount} / ${raw.length}`);
console.log(`  üretim şablonu yayında: ${counts.A_sablon_uretim_published}`);
console.log(`  gözden geçir yayında: ${counts.A_gozden_gecir_published}`);
