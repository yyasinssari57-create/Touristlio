/**
 * Cursor V4 Adım 1 — one locale resolver.
 * TR content URLs stay Turkish even when tl_lang=en. Page load does not rewrite the path.
 * Usage: node server/scripts/verify-v4-adim1-locale.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

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

console.log('verify-v4-adim1-locale');

const locale = require('../../public/js/locale-resolve');

const cases = [
  ['/blog', 'en', 'tr'],
  ['/blog/gezgin-notu', 'en', 'tr'],
  ['/places/ayasofya-istanbul', 'en', 'tr'],
  ['/explore', 'en', 'tr'],
  ['/gezilecek-yerler', 'en', 'tr'],
  ['/en/blog', 'tr', 'en'],
  ['/en/blog/gezgin-notu', '', 'en'],
  ['/en/', 'tr', 'en'],
  ['/en', '', 'en'],
  ['/', 'en', 'en'],
  ['/', 'tr', 'tr'],
  ['/', '', 'tr'],
  ['/login', 'en', 'tr'],
  ['/search', 'en', 'tr'],
  ['/legal/about.html', 'en', 'tr'],
  ['/en/search', 'tr', 'en'],
];

for (const [pathname, stored, want] of cases) {
  const got = locale.resolveLocale(pathname, stored);
  if (got !== want) fail(`resolveLocale(${pathname}, ${stored || '∅'}) = ${got}, expected ${want}`);
}
if (!failed) ok('resolveLocale: /en wins, TR routes ignore tl_lang, only / uses it');

if (locale.pathForLang('/blog/foo', 'en') !== '/en/blog/foo') fail('EN counterpart of /blog/foo');
else if (locale.pathForLang('/en/blog/foo', 'tr') !== '/blog/foo') fail('TR counterpart of /en/blog/foo');
else if (locale.pathForLang('/', 'en') !== '/en/') fail('EN counterpart of /');
else if (locale.pathForLang('/en/', 'tr') !== '/') fail('TR counterpart of /en/');
else ok('language button counterparts: /blog/foo ↔ /en/blog/foo');

const { langFromPath } = require('../lib/seo');
if (langFromPath('/blog') !== 'tr' || langFromPath('/en/blog') !== 'en' || langFromPath('/') !== 'tr') {
  fail(`langFromPath diverges from shared resolver (${langFromPath('/blog')}, ${langFromPath('/en/blog')}, ${langFromPath('/')})`);
} else ok('SEO langFromPath uses the shared resolver (no stored language)');

const boot = locale.buildEarlyBootScript();
if (!boot.includes('data-tl-lang-boot') || !boot.includes('function resolveLocale') || !boot.includes('function isTrContentPath')) {
  fail('early boot script is not generated from the shared functions');
} else if (boot.includes('</script><script') || (boot.match(/<\/script>/g) || []).length !== 1) {
  fail('early boot script is not a single inline script');
} else ok('early boot script is generated from locale-resolve.js');

function runBoot(pathname, stored) {
  const document = {
    documentElement: {
      lang: '',
      attrs: {},
      setAttribute(name, value) { this.attrs[name] = value; },
    },
  };
  const localStorage = {
    getItem(key) { return key === 'tl_lang' ? (stored || '') : ''; },
  };
  const context = { document, location: { pathname }, localStorage };
  vm.createContext(context);
  const js = boot.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
  vm.runInContext(js, context);
  return document.documentElement.lang;
}

if (runBoot('/blog', 'en') !== 'tr') fail('boot: /blog + tl_lang=en became ' + runBoot('/blog', 'en'));
else if (runBoot('/en/blog', 'tr') !== 'en') fail('boot: /en/blog was not English');
else if (runBoot('/', 'en') !== 'en') fail('boot: homepage ignored tl_lang=en');
else if (runBoot('/', 'tr') !== 'tr') fail('boot: homepage ignored tl_lang=tr');
else if (runBoot('/explore', 'en') !== 'tr') fail('boot: /explore followed tl_lang');
else ok('early boot matches the resolver (no URL rewrite)');

const { injectEarlyLangBoot } = require('../lib/send-public-html');
const stale = '<html><head><script data-tl-lang-boot>var lang="stale";</script></head><body></body></html>';
const injected = injectEarlyLangBoot(stale);
if (injected.includes('var lang="stale"')) fail('stale data-tl-lang-boot was kept');
else if (!injected.includes('function isTrContentPath') || (injected.match(/data-tl-lang-boot/g) || []).length !== 1) {
  fail('server did not replace the boot script with the shared one');
} else ok('sendPublicHtml replaces any copied boot script');

const i18nSrc = read('public/js/i18n.js');
const appSrc = read('public/js/app.js');
const searchSrc = read('public/search.html');
const indexSrc = read('public/index.html');
if (!i18nSrc.includes('resolveLocale') || !/if \(opts && opts\.syncPath === true\) syncPathToLang\(lang\);/.test(i18nSrc)) {
  fail('i18n bootLocale still rewrites the path on load');
} else ok('bootLocale does not call syncPathToLang unless the caller asks');
if (/bootLocale\(\{\s*syncPath:\s*true\s*\}\)/.test(appSrc) || /bootLocale\(\{\s*syncPath:\s*true\s*\}\)/.test(searchSrc)) {
  fail('page load still requests syncPath:true');
} else ok('app.js and search.html do not sync the path on load');
if (!/function setLang[\s\S]*syncPathToLang\(lang\)/.test(appSrc) || !searchSrc.includes('syncPathToLang(lang)')) {
  fail('language button does not call syncPathToLang');
} else ok('EN/TR button is what calls syncPathToLang');
if (!appSrc.includes('pathIsEnglish(location.pathname)')) {
  fail('route writer still prefixes /en from the in-memory language alone');
} else ok('route writer follows the URL prefix, not a stored language on /');
if (indexSrc.includes('data-tl-lang-boot') || indexSrc.includes("s==='en'?'en':'tr'")) {
  fail('index.html still has its own language resolver');
} else if (!indexSrc.includes('/js/locale-resolve.js')) {
  fail('index.html does not load locale-resolve.js');
} else ok('index.html has no second resolver');

const htmlFiles = [];
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (name.endsWith('.html')) htmlFiles.push(full);
  }
}
walk(path.join(ROOT, 'public'));
const missingModule = htmlFiles.filter((file) => {
  const src = fs.readFileSync(file, 'utf8');
  return src.includes('/js/i18n.js') && !src.includes('/js/locale-resolve.js');
});
if (missingModule.length) fail(`i18n.js without locale-resolve.js: ${missingModule.join(', ')}`);
else ok('every i18n page loads locale-resolve.js first');

function bootI18n(pathname, stored) {
  const replaced = { url: null };
  const document = {
    documentElement: {
      lang: '',
      setAttribute() {},
    },
    querySelectorAll() { return []; },
    querySelector() { return null; },
  };
  const localStorage = {
    getItem(key) { return key === 'tl_lang' ? (stored || '') : null; },
    setItem() { throw new Error('boot must not write tl_lang'); },
  };
  const history = {
    replaceState(_s, _t, url) { replaced.url = url; },
    pushState(_s, _t, url) { replaced.url = url; },
    state: null,
  };
  const context = {
    window: null,
    document,
    location: { pathname, search: '', hash: '' },
    localStorage,
    history,
    TL_LOCALE: locale,
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(i18nSrc, context);
  const lang = context.window.TL_I18N.bootLocale();
  return { lang, replaced, api: context.window.TL_I18N, history, location: context.location };
}

const blogBoot = bootI18n('/blog', 'en');
if (blogBoot.lang !== 'tr' || blogBoot.replaced.url != null) {
  fail(`i18n boot /blog + tl_lang=en → lang ${blogBoot.lang}, url ${blogBoot.replaced.url}`);
} else ok('i18n boot keeps /blog in Turkish and does not touch the URL');

const homeBoot = bootI18n('/', 'en');
if (homeBoot.lang !== 'en' || homeBoot.replaced.url != null) {
  fail(`i18n boot / + tl_lang=en → lang ${homeBoot.lang}, url ${homeBoot.replaced.url}`);
} else ok('i18n boot keeps / and uses the stored English preference');

const enBlog = bootI18n('/en/blog/foo', 'tr');
if (enBlog.lang !== 'en') fail('i18n boot /en/blog/foo was not English');
else {
  enBlog.location.pathname = '/blog/foo';
  const jumped = enBlog.api.syncPathToLang('en');
  if (!jumped || enBlog.replaced.url !== '/en/blog/foo') fail(`button counterpart was ${enBlog.replaced.url}`);
  else ok('syncPathToLang(/blog/foo, en) → /en/blog/foo');
}

if (failed) {
  console.error(`verify-v4-adim1-locale FAILED (${failed})`);
  process.exit(1);
}
console.log('verify-v4-adim1-locale OK');
