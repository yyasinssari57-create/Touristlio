/**
 * [ORTA-1] Tiola visibility: card ratings, login-gated form, persisted averages, badges.
 * Usage: node server/scripts/verify-tiola-visibility.js
 */
const fs = require('fs');
const path = require('path');
const { badgesForCount, TIOLA_BADGES } = require('../lib/tiola-badges');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}

console.log('verify-tiola-visibility');

if (TIOLA_BADGES.length < 5) fail('expected at least 5 Tiola badges');
else ok(`${TIOLA_BADGES.length} badge tiers`);

const zero = badgesForCount(0, 'tr');
if (zero.earned.length !== 0) fail('0 Tiolas should earn nothing');
else ok('0 Tiolas → no badges');
if (!zero.next || zero.next.min !== 1) fail('next badge at 1 missing');
else ok('next badge is first Tiola');

const one = badgesForCount(1, 'tr');
if (!one.earned.some((b) => b.id === 'first-tiola')) fail('1 Tiola should earn first-tiola');
else ok('1 approved Tiola → İlk Tiola');

const fifty = badgesForCount(50, 'en');
if (fifty.earned.length !== TIOLA_BADGES.length) fail('50 Tiolas should earn all badges');
else ok('50 Tiolas → all badges (EN names)');
if (fifty.next) fail('no next badge after max');
else ok('max tier has no next badge');
if (!fifty.badges.some((b) => b.name === 'Ambassador')) fail('EN name missing');
else ok('English badge names');

const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
if (!html.includes('id="tiolaDetailForm"')) fail('detail Tiola form missing id');
else ok('detail Tiola form');
if (!html.includes('id="rfLock"') || !html.includes('tiolaFormLocked')) fail('login lock copy missing');
else ok('login lock on detail form');
if (!html.includes('id="rfSendBtn"') || !html.includes('disabled')) fail('submit not gated');
else ok('submit starts disabled for guests');
if (!html.includes('id="profBadges"')) fail('profile badges container missing');
else ok('profile badges container');
if (!html.includes('id="pdTS"') || !html.includes('id="pdTC"')) fail('detail rating box missing');
else ok('detail Tiola rating box');

const appJs = fs.readFileSync(path.join(ROOT, 'public', 'js', 'app.js'), 'utf8');
if (!appJs.includes('renderTiolaRatingLine')) fail('place cards missing rating helper');
else ok('place card Tiola rating helper');
if (!appJs.includes('setTiolaFormActive')) fail('form activate helper missing');
else ok('form activate after login');
if (!appJs.includes('renderBadgesHtml') || !appJs.includes('renderOwnBadges')) fail('badge render missing');
else ok('badge render on profiles');
if (!appJs.includes('rform--active')) fail('active form class missing');
else ok('rform--active class');
if (/googleRating|google_rating|gRating/.test(appJs)) fail('Google rating leaked into UI JS');
else ok('no Google ratings in app.js');

const discover = fs.readFileSync(path.join(ROOT, 'public', 'js', 'discover-places.js'), 'utf8');
if (!discover.includes('discover-tiola-rat') || !discover.includes('tiolaLine')) {
  fail('discover cards missing Tiola score');
} else ok('discover cards show Tiola score');

const css = fs.readFileSync(path.join(ROOT, 'public', 'css', 'style.css'), 'utf8');
if (!css.includes('.rform--guest') || !css.includes('.tiola-badge')) fail('CSS for form lock / badges missing');
else ok('form lock and badge CSS');

const migration = fs.readFileSync(path.join(ROOT, 'db', 'migrations', '006_place_tiola_stats.js'), 'utf8');
if (!migration.includes('tiola_count') || !migration.includes('tiola_rating')) {
  fail('migration missing cached columns');
} else ok('places.tiola_count / tiola_rating migration');

const { initDb, db } = require('../db');
const { roundAvg, recomputePlaceTiolaStats, readStoredPlaceTiolaStats } = require('../lib/tiola-stats');
if (roundAvg(4.26) !== 4.3) fail(`roundAvg 4.26 expected 4.3 got ${roundAvg(4.26)}`);
else ok('roundAvg to 1 decimal');
if (roundAvg(null) !== null) fail('roundAvg null should stay null');
else ok('roundAvg null');

async function checkDb() {
  const url = String(process.env.DATABASE_URL || '').trim();
  if (!url || /şifreni buraya yaz|YOUR_PASSWORD|\[.*\]/i.test(url)) {
    ok('skipped DB write test (DATABASE_URL not set)');
    return;
  }
  await initDb();
  try {
    await db.prepare('SELECT tiola_count, tiola_rating FROM places LIMIT 1').get();
    ok('places table has cached Tiola columns');
  } catch (e) {
    fail('cached columns not available: ' + e.message);
  }

  const place = await db.prepare('SELECT id FROM places LIMIT 1').get();
  const user = await db.prepare('SELECT id FROM users LIMIT 1').get();
  if (place && user) {
    ok('skipped destructive DB write test on live Postgres');
  } else {
    ok('skipped DB write test (no place/user yet)');
  }
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
if (!pkg.scripts || pkg.scripts['verify:tiolas'] !== 'node server/scripts/verify-tiola-visibility.js') {
  fail('package.json missing verify:tiolas');
} else ok('verify:tiolas script');

checkDb().then(() => {
  if (failed) {
    console.error(`verify-tiola-visibility: ${failed} failed`);
    process.exit(1);
  }
  console.log('verify-tiola-visibility: ok');
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
