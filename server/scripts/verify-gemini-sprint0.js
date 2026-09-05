/**
 * Gemini Sprint 0 — blog [object Object], TR/EN locale+path, no committed secrets.
 * Usage: node server/scripts/verify-gemini-sprint0.js
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}

console.log('verify-gemini-sprint0');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

const blogDb = require('../lib/blog-db');

if (blogDb.categorySlugFromUnknown({ slug: 'guide', name: { tr: 'Rehber' } }) !== 'guide') {
  fail('categorySlugFromUnknown missed Prisma-style slug');
} else ok('categorySlugFromUnknown reads .slug');

if (blogDb.labelFromUnknown({ nameTr: 'Rehberler', nameEn: 'Guides' }, 'en') !== 'Guides') {
  fail('labelFromUnknown missed i18n nameEn');
} else ok('labelFromUnknown uses nameEn');

if (blogDb.labelFromUnknown({ name: 'Hidden' }) !== 'Hidden') {
  fail('labelFromUnknown missed .name');
} else ok('labelFromUnknown uses .name');

const parsedTags = blogDb.parseTagsStored(JSON.stringify([{ name: 'İstanbul' }, 'boğaz']));
if (parsedTags.length !== 2 || parsedTags[0] !== 'İstanbul' || parsedTags[1] !== 'boğaz') {
  fail(`parseTagsStored objects → ${JSON.stringify(parsedTags)}`);
} else ok('parseTagsStored maps {name} + string');

if (blogDb.categorySlugFromUnknown('{"slug":"food","name":"Yemek"}') !== 'food') {
  fail('JSON category string not mapped to slug');
} else ok('JSON category string → slug');

const blogsJs = read('server/routes/blogs.js');
if (!blogsJs.includes('categoryLabel: await categoryLabel')) {
  fail('mapBlog still assigns categoryLabel without await');
} else ok('mapBlog awaits categoryLabel (not a Promise/{})');
if (!blogsJs.includes('categorySlugFromUnknown')) {
  fail('public blogs route does not normalize category');
} else ok('public blogs normalize category to TEXT slug');

const adminJs = read('server/routes/admin.js');
if (!adminJs.includes('await mapAdminBlog(row)')) {
  fail('admin blog get/put/post still JSON-serializes mapAdminBlog Promise');
} else ok('admin mapAdminBlog awaited on get/put/post');
if (!adminJs.includes('categoryLabel: await blogDb.blogCategoryLabel')) {
  fail('admin blog map missing string categoryLabel');
} else ok('admin blogs expose string categoryLabel');

const appJs = read('public/js/app.js');
if (!appJs.includes('function displayLabel') || !appJs.includes('displayLabel(b.categoryLabel)')) {
  fail('app.js blog cards do not stringify category before HTML');
} else ok('app.js normalizes category/tag before HTML');
if (!appJs.includes('bootLocale') || !appJs.includes('persistLang') || !appJs.includes('syncRoute(true)')) {
  fail('setLang / init missing locale resolver + path sync');
} else ok('app.js uses one locale resolver and syncs route after setLang');

const i18nJs = read('public/js/i18n.js');
if (!i18nJs.includes('function resolveLang') || !i18nJs.includes('function pathForLang') || !i18nJs.includes('function bootLocale')) {
  fail('i18n.js missing single locale resolver');
} else ok('i18n.js resolveLang + pathForLang + bootLocale');
if (!i18nJs.includes('if (pathIsEnglish(p)) return \'en\'')) {
  fail('resolveLang does not let /en win');
} else ok('URL /en wins over tl_lang');

const indexHtml = read('public/index.html');
if (!indexHtml.includes('data-tl-lang-boot')) {
  fail('index.html missing early lang boot script');
} else ok('index.html early lang + data-tl-lang');

const sender = read('server/lib/send-public-html.js');
if (!sender.includes('injectEarlyLangBoot') || !sender.includes('data-tl-lang-boot')) {
  fail('sendPublicHtml does not inject early lang boot');
} else ok('all HTML pages get early lang boot (nonce last)');

const searchHtml = read('public/search.html');
if (!searchHtml.includes('pathForLang(\'/search\'') && !searchHtml.includes('pathForLang("/search"')) {
  fail('search.html updateUrl does not keep /en/search');
} else ok('search.html TR/EN path stays in sync');

const envEx = read('.env.example');
if (envEx.includes('.env.local')) fail('.env.example points at Next.js .env.local');
else ok('no Next.js .env.local');
if (!envEx.includes('UNSPLASH_ACCESS_KEY=') || !envEx.includes('RECAPTCHA_SECRET=') || !envEx.includes('SUPABASE_SERVICE_KEY=')) {
  fail('.env.example missing secret placeholders');
} else ok('.env.example has secret placeholders (empty)');
if (!envEx.includes('MAPBOX_ACCESS_TOKEN=') || !envEx.includes('GOOGLE_MAPS_API_KEY=')) {
  fail('.env.example missing unused map key placeholders');
} else ok('.env.example documents Mapbox/Google placeholders');

const gitignore = read('.gitignore');
if (!gitignore.split(/\r?\n/).includes('.env')) {
  fail('.env is not gitignored');
} else ok('.env is gitignored');

if (fs.existsSync(path.join(ROOT, '.env.local'))) {
  fail('.env.local should not exist in this stack');
} else ok('no .env.local');

const secretLike = [
  { rel: 'public/js/app.js', src: appJs },
  { rel: 'public/js/i18n.js', src: i18nJs },
  { rel: 'public/index.html', src: indexHtml },
  { rel: 'public/admin.html', src: read('public/admin.html') },
  { rel: 'server/index.js', src: read('server/index.js') },
  { rel: 'render.yaml', src: read('render.yaml') },
];
const leaked = [];
const leakRe = /AIzaSy[0-9A-Za-z_-]{20,}|sk_live_[0-9A-Za-z]+|pk\.ey[0-9A-Za-z._-]{20,}|xkeysib-[0-9A-Za-z-]{20,}|sb_secret_[0-9A-Za-z._-]{16,}|ghp_[0-9A-Za-z]{20,}/g;
for (const file of secretLike) {
  const hits = file.src.match(leakRe);
  if (hits) leaked.push(`${file.rel}: ${hits[0].slice(0, 12)}…`);
}
if (leaked.length) fail(`possible committed secret: ${leaked.join('; ')}`);
else ok('no Google/Mapbox/Brevo/Supabase secret literals in public/server entry files');

const formSec = read('public/js/form-security.js');
if (formSec.includes('RECAPTCHA_SECRET') || /secret['"]?\s*[:=]\s*['"][A-Za-z0-9_-]{20,}/.test(formSec)) {
  fail('public form-security.js looks like it embeds a reCAPTCHA secret');
} else ok('reCAPTCHA client uses site key from /api/config (secret stays env)');

const trackedEnv = spawnSync('git', ['ls-files', '.env', '.env.local'], { cwd: ROOT, encoding: 'utf8' });
const tracked = String(trackedEnv.stdout || '').trim();
if (tracked) fail(`secret env file is tracked: ${tracked}`);
else ok('.env / .env.local are not tracked');

if (failed) {
  console.error(`verify-gemini-sprint0 FAILED (${failed})`);
  process.exit(1);
}
console.log('verify-gemini-sprint0 OK');
