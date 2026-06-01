/**

 * public/images/logo.png → icon.svg + icon-white.svg (nav mark from brand PNG)

 * Fallbacks: Desktop PNG or touristlio7c.html embedded JPEG → logo.png

 */

const fs = require('fs');

const path = require('path');



const imgDir = path.join(__dirname, '..', '..', 'public', 'images');

const logoOut = path.join(imgDir, 'logo.png');

const iconOut = path.join(imgDir, 'icon.svg');

const iconWhiteOut = path.join(imgDir, 'icon-white.svg');

const navOut = path.join(imgDir, 'nav-logo.jpg');



/** T+pin mark; embedded base64 (external refs break inside <img src="*.svg">). */

function buildIconSvg(logoBuf, mime) {

  const b64 = logoBuf.toString('base64');

  return `<?xml version="1.0" encoding="UTF-8"?>

<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 58" width="44" height="44" aria-hidden="true">

  <defs>

    <clipPath id="markTop">

      <rect width="100" height="58"/>

    </clipPath>

  </defs>

  <g clip-path="url(#markTop)">

    <image xlink:href="data:${mime};base64,${b64}" x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMin meet"/>

  </g>

</svg>

`;

}



/** Nav mark — top T+pin crop; feColorMatrix inverts dark-on-white PNG for black nav. */
function buildIconWhiteSvg(logoBuf, mime) {
  const b64 = logoBuf.toString('base64');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 58" width="44" height="44" aria-hidden="true">
  <defs>
    <clipPath id="markTop">
      <rect width="100" height="58"/>
    </clipPath>
    <filter id="navMarkInvert" color-interpolation-filters="sRGB">
      <feColorMatrix type="matrix" values="-1 0 0 0 1  0 -1 0 0 1  0 0 -1 0 1  0 0 0 1 0"/>
    </filter>
  </defs>
  <g clip-path="url(#markTop)" filter="url(#navMarkInvert)">
    <image xlink:href="data:${mime};base64,${b64}" x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMin meet"/>
  </g>
</svg>
`;
}



function loadLogoBuffer() {

  const candidates = [

    logoOut,

    path.join('C:', 'Users', 'Yasin', 'Desktop', 'touristlio-logo.png'),

    path.join('C:', 'Users', 'Yasin', 'Desktop', 'logo.png'),

  ];



  for (const p of candidates) {

    if (fs.existsSync(p)) {

      return { buf: fs.readFileSync(p), path: p };

    }

  }



  const htmlSrc = path.join('C:', 'Users', 'Yasin', 'Desktop', 'touristlio7c.html');

  if (fs.existsSync(htmlSrc)) {

    const html = fs.readFileSync(htmlSrc, 'utf8');

    const m = html.match(/class="logo"[\s\S]*?<img src="(data:image\/jpeg;base64,[^"]+)"/);

    if (m) {

      return { buf: Buffer.from(m[1].split(',')[1], 'base64'), path: htmlSrc, isJpeg: true };

    }

  }



  return null;

}



const loaded = loadLogoBuffer();

if (!loaded) {

  console.error('logo.png bulunamadi — public/images/logo.png veya Desktop fallbacks yok');

  process.exit(1);

}



const { buf, path: srcPath, isJpeg } = loaded;



fs.mkdirSync(imgDir, { recursive: true });



if (!fs.existsSync(logoOut) || srcPath !== logoOut) {

  fs.writeFileSync(logoOut, buf);

  console.log('OK:', logoOut, buf.length, 'bytes');

} else {

  console.log('OK: logo.png mevcut', buf.length, 'bytes');

}



if (isJpeg) {

  fs.writeFileSync(navOut, buf);

  console.log('OK:', navOut, buf.length, 'bytes');

}



const iconMime = isJpeg ? 'image/jpeg' : 'image/png';

fs.writeFileSync(iconOut, buildIconSvg(buf, iconMime));

console.log('OK:', iconOut, 'from', srcPath, '(embedded base64)');



fs.writeFileSync(iconWhiteOut, buildIconWhiteSvg(buf, iconMime));

console.log('OK:', iconWhiteOut, 'from', srcPath, '(embedded base64, top crop)');


