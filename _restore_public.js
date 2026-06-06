/**
 * Restore public/index.html, app.js, style.css from commit 8a7bde3 (no git CLI).
 * Preserves black-T splash CSS; removes Admin from public navbar.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const REPO = __dirname;
const COMMIT = '8a7bde3f3ca014453569b4ba306e847d962de6f5';
const FILES = ['public/index.html', 'public/js/app.js', 'public/css/style.css'];

function readObject(hash) {
  const p = path.join(REPO, '.git', 'objects', hash.slice(0, 2), hash.slice(2));
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
    const sp2 = body.indexOf(0, sp);
    const name = body.slice(sp + 1, sp2).toString('utf8');
    const hash = body.slice(sp2 + 1, sp2 + 21).toString('hex');
    entries.push({ name, hash, mode: body.slice(i, sp).toString('utf8') });
    i = sp2 + 21;
  }
  return entries;
}

function resolvePath(treeHash, wantPath) {
  const parts = wantPath.split('/');
  let hash = treeHash;
  for (let d = 0; d < parts.length; d++) {
    const { body } = readObject(hash);
    const ent = parseTree(body).find((e) => e.name === parts[d]);
    if (!ent) throw new Error('Missing ' + parts.slice(0, d + 1).join('/'));
    hash = ent.hash;
  }
  const { type, body } = readObject(hash);
  if (type !== 'blob') throw new Error('Not blob for ' + wantPath);
  return body;
}

function getTreeHash(commitHash) {
  const { body } = readObject(commitHash);
  const line = body.toString('utf8').split('\n').find((l) => l.startsWith('tree '));
  return line.slice(5).trim();
}

function extractSplashCss(css) {
  const start = css.indexOf('.tl-splash{');
  if (start < 0) return '';
  let end = css.indexOf('.hero-stats{', start);
  if (end < 0) end = css.length;
  return css.slice(start, end);
}

function patchIndex(html) {
  return html
    .replace(/\s*<a[^>]*id="adminLink"[^>]*>[\s\S]*?<\/a>\s*/gi, '\n')
    .replace(/\s*<a[^>]*href="\/admin"[^>]*data-i18n="admin"[^>]*>[\s\S]*?<\/a>\s*/gi, '\n');
}

function patchAppJs(js) {
  let out = js;
  out = out.replace(/\s*const adminLink = document\.getElementById\('adminLink'\);\n/g, '\n');
  out = out.replace(
    /\s*if \(adminLink && \['admin', 'moderator'\]\.includes\(user\.role\)\) \{\s*adminLink\.style\.display = 'inline-flex';\s*\}/g,
    ''
  );
  out = out.replace(/\s*if \(adminLink\) adminLink\.style\.display = 'none';\n/g, '\n');
  return out;
}

function main() {
  const tree = getTreeHash(COMMIT);
  const cssPath = path.join(REPO, 'public', 'css', 'style.css');
  const splashKeep = fs.existsSync(cssPath) ? extractSplashCss(fs.readFileSync(cssPath, 'utf8')) : '';

  for (const rel of FILES) {
    const blob = resolvePath(tree, rel);
    const dest = path.join(REPO, rel.replace(/\//g, path.sep));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, blob);
    console.log('Restored', rel, 'from', COMMIT.slice(0, 7));
  }

  const idxPath = path.join(REPO, 'public', 'index.html');
  let html = fs.readFileSync(idxPath, 'utf8');
  html = patchIndex(html);
  if (!html.includes('id="tlSplash"')) {
    const splash = `<div id="tlSplash" class="tl-splash">
  <div class="tl-splash-inner">
    <div class="tl-splash-logo">
      <span class="tl-splash-t">T</span>
      <span class="tl-splash-rest">ourist<span class="brand-accent">lio</span></span>
    </div>
    <div class="tl-splash-bar"><span></span></div>
  </div>
</div>`;
    html = html.replace(/<body[^>]*>/i, (m) => m + '\n\n' + splash + '\n');
  }
  fs.writeFileSync(idxPath, html, 'utf8');

  const appPath = path.join(REPO, 'public', 'js', 'app.js');
  fs.writeFileSync(appPath, patchAppJs(fs.readFileSync(appPath, 'utf8')), 'utf8');

  if (splashKeep && splashKeep.includes('.tl-splash-t')) {
    let css = fs.readFileSync(cssPath, 'utf8');
    const blockStart = css.indexOf('.tl-splash{');
    const blockEnd = css.indexOf('.hero-stats{');
    if (blockStart >= 0 && blockEnd > blockStart) {
      css = css.slice(0, blockStart) + splashKeep + css.slice(blockEnd);
    } else if (blockStart < 0) {
      css = splashKeep + '\n' + css;
    }
    fs.writeFileSync(cssPath, css, 'utf8');
    console.log('Merged black-T splash CSS');
  }

  const check = fs.readFileSync(idxPath, 'utf8');
  console.log('hero:', check.includes('class="hero"'));
  console.log('map-tab:', check.includes('es-map'));
  console.log('loadMore:', check.includes('loadMoreBtn'));
  console.log('nav-minimal:', check.includes('nav-minimal'));
  console.log('admin in nav:', /adminLink|href="\/admin"/i.test(check));
}

main();
