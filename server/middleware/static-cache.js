const path = require('path');

function staticAssetHeaders(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.html') {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return;
  }

  if (ext === '.js' || ext === '.css') {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return;
  }

  if (/\.(png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot)$/i.test(ext)) {
    res.setHeader('Cache-Control', 'public, max-age=86400');
  }
}

module.exports = { staticAssetHeaders };
