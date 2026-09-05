/**
 * [KRİTİK-3] Argon2id hashing, bcrypt login upgrade, no AES-256 UI.
 * Usage: node server/scripts/verify-password-hash.js
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const {
  hashPassword,
  comparePassword,
  needsRehash,
  isArgon2idHash,
  isBcryptHash,
} = require('../auth');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}

console.log('verify-password-hash');

async function main() {
  const password = 'UserSystem1234';
  const hash = await hashPassword(password);
  if (!isArgon2idHash(hash) || !hash.includes('m=65536')) {
    fail(`new hash is not Argon2id 64MiB: ${String(hash).slice(0, 40)}`);
  } else ok('register hash is Argon2id (m=65536)');

  if (!(await comparePassword(password, hash))) fail('Argon2id verify failed for correct password');
  else ok('Argon2id verify accepts the password');

  if (await comparePassword('WrongPass12345', hash)) fail('Argon2id verify accepted a wrong password');
  else ok('Argon2id verify rejects a wrong password');

  if (needsRehash(hash)) fail('fresh Argon2id hash marked for rehash');
  else ok('fresh Argon2id hash does not need rehash');

  const bcryptHash = bcrypt.hashSync(password, 12);
  if (!isBcryptHash(bcryptHash)) fail('bcryptjs did not produce a bcrypt hash');
  else ok('legacy bcrypt hash still recognized');

  if (!(await comparePassword(password, bcryptHash))) fail('bcrypt verify failed (migration would lock users out)');
  else ok('legacy bcrypt hash still verifies');

  if (!needsRehash(bcryptHash)) fail('bcrypt hash should be upgraded to Argon2id on login');
  else ok('bcrypt hash is marked for Argon2id upgrade');

  if (await comparePassword(password, null)) fail('missing hash compared as a match');
  else ok('missing hash does not match');

  if (await comparePassword(password, 'aes-not-a-hash')) fail('unknown hash compared as a match');
  else ok('unknown (non-AES leftover) hash does not match');

  const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
  const i18n = fs.readFileSync(path.join(ROOT, 'public/js/i18n.js'), 'utf8');
  const publicJs = fs.readFileSync(path.join(ROOT, 'public/js/app.js'), 'utf8');
  const scanned = `${html}\n${i18n}\n${publicJs}`;
  if (/AES-?256/i.test(scanned)) fail('AES-256 still appears in public UI copy');
  else ok('no AES-256 in public UI copy');
  if (!/Güvenli şifreleme ile korunuyor/.test(html) || !/Güvenli şifreleme ile korunuyor/.test(i18n)) {
    fail('authSecure copy missing “Güvenli şifreleme ile korunuyor”');
  } else ok('UI says secure encryption, not the algorithm');

  const cookieSrc = fs.readFileSync(path.join(ROOT, 'server/modules/auth/auth.service.js'), 'utf8');
  const cookieOptsSrc = fs.readFileSync(path.join(ROOT, 'server/lib/cookie-opts.js'), 'utf8');
  if (!/cookie\('tl_token'/.test(cookieSrc) || !cookieSrc.includes('authCookieOptions')) {
    fail('auth cookie is not HttpOnly tl_token via cookie-opts');
  } else ok('JWT is stored in HttpOnly tl_token cookie');
  if (!cookieOptsSrc.includes("process.env.COOKIE_SAMESITE || 'strict'")
    || !cookieOptsSrc.includes('httpOnly: true')) {
    fail('cookie-opts default is not HttpOnly + SameSite=Strict');
  } else ok('cookie-opts default SameSite=Strict + HttpOnly');
  if (/localStorage\.setItem\(\s*['"]tl_token['"]/.test(publicJs)) {
    fail('app.js still writes JWT to localStorage');
  } else ok('client does not store JWT in localStorage');

  const cryptoSrc = fs.readFileSync(path.join(ROOT, 'server/auth.js'), 'utf8');
  if (/createCipher(?:iv)?|AES-256|createDecipher/.test(cryptoSrc)) {
    fail('server/auth.js still uses AES for passwords');
  } else ok('server/auth.js has no AES password cipher');

  if (failed) {
    console.error(`verify-password-hash FAILED (${failed})`);
    process.exit(1);
  }
  console.log('verify-password-hash OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
