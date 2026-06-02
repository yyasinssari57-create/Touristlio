/**
 * Restore Touristlio to pre-nihai commit (1dd581d) without git CLI.
 * Preserves .env and server/data/*.db. Merges black-T splash + removes Admin nav.
 *
 * Usage: node _git_restore.js
 *    or: npm run restore:pre-nihai
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const REPO = __dirname;
const TARGET = '1dd581dd9e162b136db1d9e2d0af2c0810916046';
const LOG = path.join(REPO, '_restore_result.txt');

function log(msg) {
  fs.appendFileSync(LOG, msg + '\n', 'utf8');
  console.log(msg);
}

function readObject(hash) {
  const p = path.join(REPO, '.git', 'objects', hash.slice(0, 2), hash.slice(2));
  if (!fs.existsSync(p)) throw new Error('Missing object ' + hash);
  const raw = zlib.inflateSync(fs.readFileSync(p));
  const nul = raw.indexOf(0);
  const header = raw.slice(0, nul).toString('utf8');
  const body = raw.slice(nul + 1);
  const [type] = header.split(' ');
  return { type, body };
}

function parseTree(body) {
  const entries = [];
  let i = 0;
  while (i < body.length) {
    const sp = body.indexOf(32, i);
    const mode = body.slice(i, sp).toString('utf8');
    const sp2 = body.indexOf(0, sp);
    const name = body.slice(sp + 1, sp2).toString('utf8');
    const hash = body.slice(sp2 + 1, sp2 + 21).toString('hex');
    entries.push({ mode, name, hash });
    i = sp2 + 21;
  }
  return entries;
}

function walkTree(hash, prefix = '') {
  const { type, body } = readObject(hash);
  if (type !== 'tree') throw new Error('Not a tree: ' + hash);
  const files = [];
  for (const e of parseTree(body)) {
    const rel = prefix ? prefix + '/' + e.name : e.name;
    if (e.mode.startsWith('40')) files.push(...walkTree(e.hash, rel));
    else files.push({ path: rel, hash: e.hash });
  }
  return files;
}

function checkoutCommit(commitHash) {
  const { body } = readObject(commitHash);
  const treeLine = body.toString('utf8').split('\n').find((l) => l.startsWith('tree '));
  if (!treeLine) throw new Error('No tree in commit');
  return walkTree(treeLine.slice(5).trim());
}

function writeBlob(hash, dest) {
  const { type, body } = readObject(hash);
  if (type !== 'blob') throw new Error('Not blob: ' + hash);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, body);
}

function shouldSkip(relPath) {
  if (relPath.includes('node_modules')) return true;
  if (relPath === '.env') return true;
  if (/^server\/data\/.*\.db$/i.test(relPath)) return true;
  if (/^uploads\/.+/i.test(relPath) && !relPath.endsWith('.gitkeep')) return true;
  return false;
}

function extractSplashCss(css) {
  const start = css.indexOf('.tl-splash{');
  if (start < 0) return '';
  const end = css.indexOf('.hero-stats{', start);
  return end > start ? css.slice(start, end) : css.slice(start);
}

function updateRef(hash) {
  const refPath = path.join(REPO, '.git', 'refs', 'heads', 'main');
  const prev = fs.existsSync(refPath) ? fs.readFileSync(refPath, 'utf8').trim() : hash;
  fs.writeFileSync(refPath, hash + '\n', 'utf8');
  const ts = Math.floor(Date.now() / 1000);
  const line = `${prev} ${hash} Yasin Sarı <restore@local> ${ts} +0300\treset: restore pre-nihai ${hash.slice(0, 7)}\n`;
  fs.appendFileSync(path.join(REPO, '.git', 'logs', 'HEAD'), line);
  fs.appendFileSync(path.join(REPO, '.git', 'logs', 'refs', 'heads', 'main'), line);
}

function patchIndexHtml() {
  const p = path.join(REPO, 'public', 'index.html');
  let html = fs.readFileSync(p, 'utf8');
  const before = html;
  html = html.replace(/\s*<a[^>]*id="adminLink"[^>]*>[\s\S]*?<\/a>\s*/gi, '\n');
  html = html.replace(/\s*<a[^>]*href="\/admin"[^>]*data-i18n="admin"[^>]*>[\s\S]*?<\/a>\s*/gi, '\n');
  if (html !== before) log('Patched: removed Admin link from public navbar');
  fs.writeFileSync(p, html, 'utf8');
}

function ensureSplash(splashKeep) {
  const indexPath = path.join(REPO, 'public', 'index.html');
  const cssPath = path.join(REPO, 'public', 'css', 'style.css');
  let html = fs.readFileSync(indexPath, 'utf8');

  if (!html.includes('id="tlSplash"')) {
    const splashHtml = `<div id="tlSplash" class="tl-splash">
  <div class="tl-splash-inner">
    <div class="tl-splash-logo">
      <span class="tl-splash-t">T</span>
      <span class="tl-splash-rest">ourist<span class="brand-accent">lio</span></span>
    </div>
    <div class="tl-splash-bar"><span></span></div>
  </div>
</div>`;
    html = html.replace(/<body[^>]*>/i, (m) => m + '\n\n' + splashHtml + '\n');
    fs.writeFileSync(indexPath, html, 'utf8');
    log('Added splash HTML');
  }

  if (splashKeep && splashKeep.includes('.tl-splash-t')) {
    let css = fs.readFileSync(cssPath, 'utf8');
    const blockStart = css.indexOf('.tl-splash{');
    const blockEnd = css.indexOf('.hero-stats{');
    if (blockStart >= 0 && blockEnd > blockStart) {
      css = css.slice(0, blockStart) + splashKeep + css.slice(blockEnd);
    } else if (blockStart < 0) {
      css = splashKeep + css;
    }
    fs.writeFileSync(cssPath, css, 'utf8');
    log('Merged black-T splash CSS');
  }
}

function patchAppJs() {
  const p = path.join(REPO, 'public', 'js', 'app.js');
  if (!fs.existsSync(p)) return;
  let js = fs.readFileSync(p, 'utf8');
  const before = js;
  js = js.replace(/\s*const adminLink = document\.getElementById\('adminLink'\);\n/g, '\n');
  js = js.replace(
    /\s*if \(adminLink && \['admin', 'moderator'\]\.includes\(user\.role\)\) \{\s*adminLink\.style\.display = 'inline-flex';\s*\}/g,
    ''
  );
  js = js.replace(/\s*if \(adminLink\) adminLink\.style\.display = 'none';\n/g, '\n');
  js = js.replace(/\s*renderGrid\(\[\]\);\n/, '\n');
  if (!js.includes('await applyFilters()') && js.includes('async function init()')) {
    js = js.replace(
      /(\}\s*catch \(e\) \{\s*console\.error\(e\);\s*\})\s*handleDeepLink\(\);/,
      '$1\n  await applyFilters();\n  handleDeepLink();'
    );
  }
  if (js !== before) log('Patched app.js: admin nav removed, cards load on init');
  fs.writeFileSync(p, js, 'utf8');
}

function runRestore() {
  if (fs.existsSync(LOG)) fs.unlinkSync(LOG);
  log('=== Restore pre-nihai: ' + TARGET + ' ===');

  const cssPath = path.join(REPO, 'public', 'css', 'style.css');
  const splashKeep = fs.existsSync(cssPath) ? extractSplashCss(fs.readFileSync(cssPath, 'utf8')) : '';

  const files = checkoutCommit(TARGET);
  log('Files in tree: ' + files.length);

  for (const f of files) {
    if (shouldSkip(f.path)) {
      log('Skip (preserve): ' + f.path);
      continue;
    }
    writeBlob(f.hash, path.join(REPO, f.path.replace(/\//g, path.sep)));
  }

  updateRef(TARGET);
  log('Git ref main -> ' + TARGET);

  patchIndexHtml();
  patchAppJs();
  ensureSplash(splashKeep);

  const idx = fs.readFileSync(path.join(REPO, 'public', 'index.html'), 'utf8');
  log('Check hero: ' + idx.includes('class="hero"'));
  log('Check explore tab: ' + idx.includes('nt-explore'));
  log('Check nav-minimal: ' + idx.includes('nav-minimal'));
  log('Check admin in nav: ' + /adminLink|href="\/admin"/i.test(idx));
  log('Check splash T: ' + idx.includes('tl-splash-t'));
  log('DONE');
  return true;
}

module.exports = { runRestore, patchIndexHtml, patchAppJs, ensureSplash, extractSplashCss, TARGET };

if (require.main === module) {
  const patchOnly = process.argv.includes('--patch-only');
  try {
    if (patchOnly) {
      if (fs.existsSync(LOG)) fs.unlinkSync(LOG);
      log('=== Patch only (Admin nav + splash) ===');
      const cssPath = path.join(REPO, 'public', 'css', 'style.css');
      const splashKeep = fs.existsSync(cssPath) ? extractSplashCss(fs.readFileSync(cssPath, 'utf8')) : '';
      patchIndexHtml();
      patchAppJs();
      ensureSplash(splashKeep);
      log('PATCH DONE');
    } else {
      runRestore();
    }
  } catch (e) {
    log('ERROR: ' + (e.stack || e.message));
    process.exit(1);
  }
}
