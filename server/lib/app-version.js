const fs = require('fs');
const path = require('path');
const pkg = require('../../package.json');

let cached = null;

/** Cache-bust token: package version + newest core asset mtime (or APP_VERSION env). */
function getAppVersion() {
  if (process.env.APP_VERSION) return process.env.APP_VERSION;
  if (cached) return cached;

  const publicDir = path.join(__dirname, '..', '..', 'public');
  const assets = ['css/style.css', 'css/inline-overrides.css', 'js/app.js', 'index.html'];
  let maxMtime = 0;
  for (const rel of assets) {
    try {
      const mtime = fs.statSync(path.join(publicDir, rel)).mtimeMs;
      if (mtime > maxMtime) maxMtime = mtime;
    } catch {
      /* asset may not exist yet */
    }
  }

  cached = maxMtime ? `${pkg.version}-${Math.floor(maxMtime / 1000)}` : pkg.version;
  return cached;
}

function bustAppVersionCache() {
  cached = null;
}

module.exports = { getAppVersion, bustAppVersionCache };
