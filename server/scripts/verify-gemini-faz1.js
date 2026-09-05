/**
 * Gemini Faz 1 — cookie flags, no PostGIS rewrite, WebP (not AVIF), Leaflet kept.
 * Usage: node server/scripts/verify-gemini-faz1.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}

console.log('verify-gemini-faz1');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

const prevSameSite = process.env.COOKIE_SAMESITE;
const prevNodeEnv = process.env.NODE_ENV;
const prevCookieSecure = process.env.COOKIE_SECURE;
delete process.env.COOKIE_SAMESITE;
delete require.cache[require.resolve('../lib/cookie-opts')];
const {
  cookieSameSite,
  cookieSecure,
  authCookieOptions,
  csrfCookieOptions,
  sessionCookieOptions,
} = require('../lib/cookie-opts');

if (cookieSameSite() !== 'strict') fail(`default SameSite is ${cookieSameSite()}, expected strict`);
else ok('cookie default SameSite=Strict');

process.env.NODE_ENV = 'production';
delete process.env.COOKIE_SECURE;
if (!cookieSecure()) fail('production Secure flag is off');
else ok('production cookies set Secure');
process.env.NODE_ENV = 'development';
process.env.COOKIE_SECURE = 'false';
if (cookieSecure()) fail('COOKIE_SECURE=false still marked Secure');
else ok('COOKIE_SECURE=false honored in development');
if (prevCookieSecure === undefined) delete process.env.COOKIE_SECURE;
else process.env.COOKIE_SECURE = prevCookieSecure;
if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
else process.env.NODE_ENV = prevNodeEnv;

const authOpts = authCookieOptions();
if (authOpts.httpOnly !== true || authOpts.path !== '/' || authOpts.sameSite !== 'strict') {
  fail(`auth cookie opts: ${JSON.stringify(authOpts)}`);
} else ok('tl_token: HttpOnly + Path=/ + SameSite=Strict');

const csrfOpts = csrfCookieOptions();
if (csrfOpts.httpOnly !== false || csrfOpts.sameSite !== 'strict') {
  fail(`csrf cookie opts: ${JSON.stringify(csrfOpts)}`);
} else ok('tl_csrf readable by JS, SameSite=Strict');

const sidOpts = sessionCookieOptions();
if (sidOpts.httpOnly !== true || sidOpts.sameSite !== 'strict' || sidOpts.path !== '/') {
  fail(`sid cookie opts: ${JSON.stringify(sidOpts)}`);
} else ok('tl_sid: HttpOnly + SameSite=Strict');

if (prevSameSite !== undefined) process.env.COOKIE_SAMESITE = prevSameSite;

const authSrc = read('server/modules/auth/auth.service.js');
if (!authSrc.includes("require('../../lib/cookie-opts')") || !authSrc.includes('authCookieOptions')) {
  fail('auth.service.js does not use shared cookie-opts');
} else ok('auth.service uses cookie-opts');

const csrfSrc = read('server/middleware/csrf.js');
if (!csrfSrc.includes("require('../lib/cookie-opts')") || !csrfSrc.includes('csrfCookieOptions')) {
  fail('csrf.js does not use shared cookie-opts');
} else ok('csrf.js uses cookie-opts');

const visitorSrc = read('server/modules/analytics/visitor.service.js');
if (!visitorSrc.includes("require('../../lib/cookie-opts')") || !visitorSrc.includes('sessionCookieOptions')) {
  fail('visitor.service.js does not use shared cookie-opts');
} else ok('analytics session uses cookie-opts');

const authJs = read('server/auth.js');
if (/createCipher(?:iv)?|AES-256/.test(authJs)) fail('auth.js invented AES crypto');
else ok('no invented JWT/AES password crypto');
if (!authJs.includes('argon2id') && !authJs.includes('argon2.argon2id')) {
  fail('Argon2id missing from auth.js');
} else ok('Argon2id still the password hasher');

const geoSrc = read('server/lib/geo.js');
if (/\bST_|geography\(|PostGIS/i.test(geoSrc)) fail('geo.js rewritten to PostGIS');
else ok('geo queries still haversine on lat/lng');

const mig009 = read('db/migrations/009_jsonb_gin.js');
if (!mig009.includes('data_type = \'jsonb\'') || !mig009.includes('USING GIN')) {
  fail('009_jsonb_gin.js missing safe JSONB GIN probe');
} else ok('009 adds GIN only for real JSONB columns');
if (!mig009.includes('idx_places_lat_lng')) fail('009 missing lat/lng btree analog');
else ok('009 adds lat/lng btree (no PostGIS)');
if (/CREATE EXTENSION|geography\(Point/i.test(mig009)) fail('009 enables PostGIS');
else ok('009 does not enable PostGIS');

const imgSrc = read('server/lib/image-process.js');
if (!imgSrc.includes('MAX_WIDTH = 1920') || !imgSrc.includes('MAX_HEIGHT = 1080')) {
  fail('image pipeline lost 1920×1080 cap');
} else ok('Sharp still caps 1920×1080');
if (!imgSrc.includes('.webp(') || !imgSrc.includes('mimetype: \'image/webp\'')) {
  fail('WebP pipeline missing');
} else ok('uploads still write WebP');
if (/\.avif\(|image\/avif|avif\(/.test(imgSrc)) fail('AVIF added to Sharp pipeline (layout/browser risk)');
else ok('AVIF not added to upload pipeline');

const indexHtml = read('public/index.html');
if (!indexHtml.includes('/vendor/leaflet/leaflet.js')
  || !indexHtml.includes('/vendor/leaflet.markercluster/leaflet.markercluster.js')) {
  fail('Leaflet vendor tags missing from index.html');
} else ok('Leaflet + MarkerCluster still local vendor');
if (/maplibre|supercluster|mapbox-gl/i.test(indexHtml)) fail('MapLibre/Supercluster injected into HTML');
else ok('no MapLibre swap in HTML');

const envEx = read('.env.example');
const envProd = read('.env.production.example');
if (!envEx.includes('COOKIE_SAMESITE') || !envProd.includes('COOKIE_SAMESITE=strict')) {
  fail('env examples missing COOKIE_SAMESITE=strict');
} else ok('env examples default SameSite=strict');

if (failed) {
  console.error(`verify-gemini-faz1 FAILED (${failed})`);
  process.exit(1);
}
console.log('verify-gemini-faz1 OK');
