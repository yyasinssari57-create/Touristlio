/**
 * One password rule for every NEW or CHANGED password.
 * Login does not use this. Stored hashes stay valid.
 *
 * Yasin: at least 9 characters, one uppercase letter, one digit.
 * Argon2id settings live in server/auth.js and are not part of this rule.
 */

const MIN_PASSWORD_LENGTH = 9;
const HTML_PATTERN = `(?=.*[A-Z])(?=.*[0-9]).{${MIN_PASSWORD_LENGTH},}`;

function copyFor(lang) {
  const n = MIN_PASSWORD_LENGTH;
  if (lang === 'en') {
    return {
      label: `Password (min ${n} characters)`,
      newLabel: `New password (min ${n} characters)`,
      message: `Password must be at least ${n} characters with one uppercase letter and one number.`,
    };
  }
  return {
    label: `Şifre (min ${n} karakter)`,
    newLabel: `Yeni şifre (min ${n} karakter)`,
    message: `Şifre en az ${n} karakter, bir büyük harf ve bir rakam içermelidir.`,
  };
}

function passwordLang(lang) {
  return lang === 'en' ? 'en' : 'tr';
}

/** Same sentence for too short, missing uppercase, and missing digit. */
function passwordPolicyError(password, lang) {
  const pw = String(password ?? '');
  const message = copyFor(passwordLang(lang)).message;
  if (pw.length < MIN_PASSWORD_LENGTH) return message;
  if (!/[A-Z]/.test(pw)) return message;
  if (!/[0-9]/.test(pw)) return message;
  return null;
}

function passwordLangFromRequest(req) {
  const header = req && typeof req.get === 'function' ? req.get('x-tl-lang') : '';
  const raw = String(header || '').trim().toLowerCase();
  if (raw === 'en' || raw.startsWith('en-')) return 'en';
  return 'tr';
}

/** Browser copy of the same constants. Injected into HTML; not a second rule. */
function clientScript() {
  const payload = JSON.stringify({
    minLength: MIN_PASSWORD_LENGTH,
    pattern: HTML_PATTERN,
    copy: { tr: copyFor('tr'), en: copyFor('en') },
  });
  return [
    '(function (root) {',
    `  var policy = ${payload};`,
    '  function pack(lang) { return lang === "en" ? policy.copy.en : policy.copy.tr; }',
    '  function error(password, lang) {',
    '    var pw = String(password == null ? "" : password);',
    '    var msg = pack(lang).message;',
    '    if (pw.length < policy.minLength) return msg;',
    '    if (!/[A-Z]/.test(pw)) return msg;',
    '    if (!/[0-9]/.test(pw)) return msg;',
    '    return "";',
    '  }',
    '  root.TL_PASSWORD = {',
    '    minLength: policy.minLength,',
    '    pattern: policy.pattern,',
    '    copy: policy.copy,',
    '    message: function (lang) { return pack(lang).message; },',
    '    label: function (lang) { return pack(lang).label; },',
    '    newLabel: function (lang) { return pack(lang).newLabel; },',
    '    error: error',
    '  };',
    '})(typeof window !== "undefined" ? window : globalThis);',
  ].join('\n');
}

function replaceToken(html, token, value) {
  return String(html).split(token).join(value);
}

/**
 * Fill password placeholders from this module and inline TL_PASSWORD
 * before the page scripts. Inline keeps the homepage from fetching another file.
 */
function decoratePasswordPolicyHtml(html) {
  const tr = copyFor('tr');
  let next = replaceToken(String(html || ''), '__PW_MIN__', String(MIN_PASSWORD_LENGTH));
  next = replaceToken(next, '__PW_PATTERN__', HTML_PATTERN);
  next = replaceToken(next, '__PW_MSG_TR__', tr.message);
  next = replaceToken(next, '__PW_LABEL_TR__', tr.label);
  next = replaceToken(next, '__PW_NEW_TR__', tr.newLabel);
  if (next.includes('data-tl-password-policy')) return next;
  const tag = `<script data-tl-password-policy="1">\n${clientScript()}\n</script>\n`;
  if (/<script\s+src="\/js\/i18n\.js/i.test(next)) {
    return next.replace(/<script\s+src="\/js\/i18n\.js/i, `${tag}<script src="/js/i18n.js`);
  }
  if (/<script\s+src="\/js\//i.test(next)) {
    return next.replace(/<script\s+src="\/js\//i, `${tag}<script src="/js/`);
  }
  if (/<\/body>/i.test(next)) return next.replace(/<\/body>/i, `${tag}</body>`);
  return tag + next;
}

module.exports = {
  MIN_PASSWORD_LENGTH,
  HTML_PATTERN,
  copyFor,
  passwordPolicyError,
  passwordLangFromRequest,
  clientScript,
  decoratePasswordPolicyHtml,
};
