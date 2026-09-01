/**
 * [YÜKSEK-4] JSON-LD Schema.org checks.
 * Usage: node server/scripts/verify-jsonld.js
 * Optional: VERIFY_JSONLD_URL=http://127.0.0.1:3030 node server/scripts/verify-jsonld.js
 */
const fs = require('fs');
const path = require('path');
const {
  travelAgency,
  touristAttraction,
  reviewSchema,
  articleSchema,
  contactPage,
  jsonLdForPlace,
  jsonLdForBlog,
  jsonLdForHome,
  AGENCY_DESCRIPTION,
} = require('../lib/jsonld');
const { injectSeoHead } = require('../lib/seo');

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

console.log('verify-jsonld');

const agency = travelAgency();
if (agency['@type'] === 'TravelAgency'
  && agency.name === 'Touristlio'
  && agency.description === AGENCY_DESCRIPTION
  && /\/images\/logo\.webp$/.test(agency.logo)
  && agency.url) ok('TravelAgency builder');
else fail('TravelAgency builder mismatch');

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
};
const attraction = touristAttraction(place, 'tr');
if (attraction['@type'] === 'TouristAttraction'
  && attraction.aggregateRating
  && attraction.aggregateRating['@type'] === 'AggregateRating'
  && attraction.aggregateRating.reviewCount === 2
  && attraction.geo
  && /ayasofya/.test(attraction.url)) ok('TouristAttraction + Tiola AggregateRating');
else fail('TouristAttraction builder mismatch');

const noRating = touristAttraction({ ...place, tiolaCount: 0, tiolaRating: null });
if (!noRating.aggregateRating) ok('no AggregateRating without Tiola scores');
else fail('AggregateRating must not appear without Tiola scores');

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
if (placeBlocks[0]['@type'] === 'TouristAttraction' && placeBlocks[1]['@type'] === 'Review') {
  ok('place page graph: TouristAttraction + Review');
} else fail('place page graph mismatch');

const htmlPath = path.join(__dirname, '..', '..', 'public', 'index.html');
const raw = fs.readFileSync(htmlPath, 'utf8');
const homeHtml = injectSeoHead(raw, { pathname: '/', lang: 'tr', jsonLd: jsonLdForHome() });
const homeLd = parseScripts(homeHtml);
if (homeLd.some((b) => b['@type'] === 'TravelAgency' && b.name === 'Touristlio')) {
  ok('injectSeoHead homepage TravelAgency');
} else fail('homepage HTML missing TravelAgency JSON-LD');

const placeHtml = injectSeoHead(raw, { pathname: '/places/ayasofya-istanbul', lang: 'tr', jsonLd: jsonLdForPlace(place, []) });
const placeLd = parseScripts(placeHtml);
if (placeLd.some((b) => b['@type'] === 'TouristAttraction')) ok('injectSeoHead place TouristAttraction');
else fail('place HTML missing TouristAttraction JSON-LD');

const blogHtml = injectSeoHead(raw, {
  pathname: '/blog/istanbul-rehberi',
  lang: 'tr',
  jsonLd: jsonLdForBlog({ title: 'İstanbul Rehberi', slug: 'istanbul-rehberi', excerpt: 'x', authorName: 'Yasin', publishedAt: '2026-03-01' }),
});
if (parseScripts(blogHtml).some((b) => b['@type'] === 'Article')) ok('injectSeoHead blog Article');
else fail('blog HTML missing Article JSON-LD');

const contactRaw = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'legal', 'contact.html'), 'utf8');
const contactHtml = injectSeoHead(contactRaw, { pathname: '/legal/contact.html', lang: 'tr', jsonLd: [contact] });
if (parseScripts(contactHtml).some((b) => b['@type'] === 'ContactPage')) ok('injectSeoHead ContactPage');
else fail('contact HTML missing ContactPage JSON-LD');

async function curlCheck(base) {
  const paths = [
    { path: '/', type: 'TravelAgency' },
    { path: '/legal/contact.html', type: 'ContactPage' },
  ];
  for (const item of paths) {
    const res = await fetch(`${base}${item.path}`);
    const html = await res.text();
    const blocks = parseScripts(html);
    if (blocks.some((b) => b['@type'] === item.type)) ok(`curl ${item.path} → ${item.type}`);
    else fail(`curl ${item.path} missing ${item.type} (status ${res.status})`);
  }
}

(async () => {
  const base = process.env.VERIFY_JSONLD_URL;
  if (base) {
    try {
      await curlCheck(base.replace(/\/$/, ''));
    } catch (err) {
      fail(`curl failed: ${err.message}`);
    }
  } else {
    ok('skip live curl (set VERIFY_JSONLD_URL to hit a running server)');
  }

  if (failed) {
    console.error('  ✗ JSON-LD verification failed');
    process.exit(1);
  }
  console.log('  ✓ OK');
  process.exit(0);
})();
