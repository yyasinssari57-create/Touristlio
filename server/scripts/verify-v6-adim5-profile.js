#!/usr/bin/env node
/**
 * V6 Adım 5 — profil sayfası profesyonel yapı.
 * Guide default: sade başlık (avatar/ad/üyelik/rol), kaydırmasız istatistik
 * (Tiola, Blog, Ziyaret, Kaydedilen), 5 sekme, gruplu ayarlar, boş durumda tek CTA.
 *
 * Usage: npm run verify:v6-adim5
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) { console.error('  ✗', msg); failed += 1; }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

console.log('verify-v6-adim5-profile');

const pkg = JSON.parse(read('package.json'));
if (pkg.scripts?.['verify:v6-adim5'] !== 'node server/scripts/verify-v6-adim5-profile.js') {
  fail('package.json verify:v6-adim5 eksik/yanlış');
} else ok('package.json verify:v6-adim5');

const indexHtml = read('public/index.html');
const profileHtml = read('public/profile.html');
const appJs = read('public/js/app.js');
const i18nJs = read('public/js/i18n.js');
const css = read('public/css/inline-overrides.css');

const EXPECTED_TABS = ['tiolas', 'saved', 'visited', 'blogs', 'settings'];

function tabButtons(html) {
  const re = /<button[^>]*data-ptab="([^"]+)"[^>]*>/g;
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

function assertTabs(label, html) {
  const tabs = tabButtons(html);
  const visible = tabs.filter((t) => EXPECTED_TABS.includes(t));
  const extras = tabs.filter((t) => !EXPECTED_TABS.includes(t));
  if (extras.length) fail(`${label}: beklenmeyen sekme ${extras.join(',')}`);
  else ok(`${label}: ekstra sekme yok`);
  for (const t of EXPECTED_TABS) {
    if (!visible.includes(t)) fail(`${label}: eksik sekme ${t}`);
  }
  if (EXPECTED_TABS.every((t) => visible.includes(t))) ok(`${label}: 5 tutarlı sekme`);
}

assertTabs('index.html', indexHtml);
assertTabs('profile.html', profileHtml);

for (const id of ['pRevCnt', 'pBlogCnt', 'pVisitedCnt', 'pSavedCnt']) {
  if (!indexHtml.includes(`id="${id}"`)) fail(`index.html istatistik ${id} yok`);
  else ok(`index.html ${id}`);
  if (!profileHtml.includes(`id="${id}"`)) fail(`profile.html istatistik ${id} yok`);
  else ok(`profile.html ${id}`);
}

if (!indexHtml.includes('prof-stats-row') || !profileHtml.includes('prof-stats-row')) {
  fail('prof-stats-row eksik');
} else ok('prof-stats-row (kaydırmasız satır)');

if (!indexHtml.includes('prof-role-badge') || !profileHtml.includes('prof-role-badge')) {
  fail('prof-role-badge eksik');
} else ok('prof-role-badge');

if (!/function renderProfileMeta\(/.test(appJs) || !/memberSince/.test(appJs) || !/roleLabel\(/.test(appJs)) {
  fail('app.js üyelik tarihi / rol rozeti render yok');
} else ok('app.js üyelik + rol');

if (!/resolveProfileTab|PROFILE_TAB_ALIAS/.test(appJs)) {
  fail('app.js sekme alias (write/pending → tiolas) yok');
} else ok('app.js sekme alias');

if (!/focusWriteTiola|focusWriteBlog/.test(appJs)) {
  fail('app.js boş durum CTA odakları yok');
} else ok('app.js boş durum CTA');

if (!/settingsSectionAvatar/.test(indexHtml) || !/settingsSectionAccount/.test(indexHtml) || !/settingsSectionSecurity/.test(indexHtml)) {
  fail('index.html ayarlar grupları eksik');
} else ok('index.html ayarlar grupları');

if (!/settingsSectionAvatar/.test(profileHtml) || !/settingsSectionAccount/.test(profileHtml) || !/settingsSectionSecurity/.test(profileHtml)) {
  fail('profile.html ayarlar grupları eksik');
} else ok('profile.html ayarlar grupları');

// Empty-state CTAs: one clear action each
if (!/id="tiolaListEmpty"[\s\S]*?(data-act="focusWriteTiola"|data-i18n="writeTiola")/.test(indexHtml)) {
  fail('index.html Tiola boş durum CTA yok');
} else ok('index.html Tiola boş CTA');

if (!/id="savedEmpty"[\s\S]*?data-i18n="explore"/.test(indexHtml)) {
  fail('index.html Kaydedilenler boş CTA yok');
} else ok('index.html Kaydedilenler boş CTA');

if (!/id="visitedEmpty"[\s\S]*?data-i18n="explore"/.test(indexHtml)) {
  fail('index.html Ziyaret boş CTA yok');
} else ok('index.html Ziyaret boş CTA');

if (!/id="blogListEmpty"[\s\S]*?(data-act="focusWriteBlog"|profileWriteBlogTitle)/.test(indexHtml)) {
  fail('index.html Blog boş CTA yok');
} else ok('index.html Blog boş CTA');

if (!/profileStatBlog:\s*'Blog'/.test(i18nJs) || !/profileTabBlogs:\s*'Bloglarım'/.test(i18nJs)) {
  fail('i18n TR Bloglarım / Blog istatistik eksik');
} else ok('i18n TR Bloglarım');

if (!/profileTabBlogs:\s*'My blogs'/.test(i18nJs) || !/profileStatBlog:\s*'Blogs'/.test(i18nJs)) {
  fail('i18n EN My blogs / Blogs eksik');
} else ok('i18n EN My blogs');

if (!/\.prof-stats-row\s*\{/.test(css) || !/flex-wrap:\s*nowrap/.test(css)) {
  fail('CSS prof-stats-row kaydırmasız stil yok');
} else ok('CSS prof-stats-row');

// Likes/countries should not be primary header stats anymore
if (/id="pLikeCnt"/.test(indexHtml) || /id="pCntCnt"/.test(indexHtml) || /id="pCountriesCnt"/.test(profileHtml)) {
  fail('eski Beğeni/Ülke üst istatistikleri hâlâ duruyor');
} else ok('Beğeni/Ülke üst istatistikten çıkarıldı');

if (failed) {
  console.error(`\nverify-v6-adim5 KALDI (${failed})`);
  process.exit(1);
}
console.log('\nverify-v6-adim5 TAMAM');
