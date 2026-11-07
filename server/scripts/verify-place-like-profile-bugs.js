/**
 * Static checks for place-like / profile session / visited-control fixes.
 * Usage: node server/scripts/verify-place-like-profile-bugs.js
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

console.log('verify-place-like-profile-bugs');

const appJs = fs.readFileSync(path.join(ROOT, 'public', 'js', 'app.js'), 'utf8');
const bindJs = fs.readFileSync(path.join(ROOT, 'public', 'js', 'bind-actions.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const profileHtml = fs.readFileSync(path.join(ROOT, 'public', 'profile.html'), 'utf8');
const styleCss = fs.readFileSync(path.join(ROOT, 'public', 'css', 'style.css'), 'utf8');
const i18nJs = fs.readFileSync(path.join(ROOT, 'public', 'js', 'i18n.js'), 'utf8');

// 1) Place detail hero save uses closure activePlace (let is not on window)
if (!/function setActivePlace\(/.test(appJs) || !/window\.activePlace = activePlace/.test(appJs)) {
  fail('setActivePlace must sync window.activePlace');
} else ok('activePlace synced to window');

if (!/function toggleActivePlaceSave\(/.test(appJs) || !/toggleSave\(activePlace\.id/.test(appJs)) {
  fail('toggleActivePlaceSave must call toggleSave(activePlace.id)');
} else ok('hero save uses closure activePlace');

if (!/window\.toggleActivePlaceSave = toggleActivePlaceSave/.test(appJs)) {
  fail('toggleActivePlaceSave must be exposed on window');
} else ok('toggleActivePlaceSave exported');

if (!/id="pdSaveBtn"/.test(indexHtml) || !/data-act="toggleActivePlaceSave"/.test(indexHtml)) {
  fail('pdSaveBtn wiring missing');
} else ok('pdSaveBtn → toggleActivePlaceSave');

// 2) Profilim: logged-in authBtn must not keep openAuth
if (!/setAttribute\('data-act', 'goToMyProfile'\)/.test(appJs)) {
  fail('updateAuthUI must set data-act=goToMyProfile when logged in');
} else ok('logged-in authBtn → goToMyProfile');

if (!/setAttribute\('data-act', 'openAuth'\)/.test(appJs)) {
  fail('updateAuthUI must restore data-act=openAuth when logged out');
} else ok('logged-out authBtn → openAuth');

if (!/btn\.onclick = null/.test(appJs)) {
  fail('authBtn onclick must be cleared (data-act only)');
} else ok('authBtn no dual onclick/data-act');

// 3) Visited control parallel to saved heart
if (!/async function toggleVisit\(/.test(appJs)) {
  fail('toggleVisit missing');
} else ok('toggleVisit defined');

if (!/\/travel-lists\/visited/.test(appJs)) {
  fail('toggleVisit must call /travel-lists/visited');
} else ok('visited API wired');

if (!/id="pdVisitBtn"/.test(indexHtml) || !/data-act="toggleActivePlaceVisit"/.test(indexHtml)) {
  fail('pdVisitBtn missing on place detail hero');
} else ok('detail hero has + visit control');

if (!/class="pc-visit"/.test(appJs) || !/data-act="toggleVisit"/.test(appJs)) {
  fail('place cards missing pc-visit control');
} else ok('place cards have + visit control');

if (!/pc-visit on/.test(appJs) || !/#ptab-visited|visitedGrid/.test(appJs)) {
  fail('profile visited list missing visit control');
} else ok('profile visited list has visit control');

if (!/toggleProfileVisit/.test(profileHtml)) {
  fail('profile.html missing toggleProfileVisit');
} else ok('standalone profile can remove visited');

if (!/\.pc-visit\{/.test(styleCss) || !/\.pd-visit\{/.test(styleCss)) {
  fail('visit button styles missing');
} else ok('visit button CSS present');

if (!/visitAria:/.test(i18nJs) || !/addedToVisited:/.test(i18nJs)) {
  fail('visit i18n keys missing');
} else ok('visit i18n keys present');

if (!/toggleActivePlaceVisit/.test(bindJs)) {
  fail('bind-actions missing toggleActivePlaceVisit');
} else ok('bind-actions supports visit hero act');

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll place-like / profile / visited checks passed');
