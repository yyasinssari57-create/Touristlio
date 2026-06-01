/** One-time helper: extract P[] from touristlio6.html into places.json */
const fs = require('fs');
const path = require('path');

const htmlPath = process.argv[2] || path.join(process.env.USERPROFILE || '', 'Desktop', 'touristlio6.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const match = html.match(/const P=\[([\s\S]*?)\];\s*\n\s*\/\/ BLOG DATA/);
if (!match) {
  console.error('Could not find P array in HTML');
  process.exit(1);
}
const P = eval('[' + match[1] + ']');
const out = P.map((p) => ({
  id: p.id,
  name: p.n,
  location: p.l,
  country: p.co,
  city: p.ci,
  district: p.di,
  category: p.cat,
  googleRating: p.gR,
  googleCount: p.gC,
  imageUrl: p.img,
  isLocal: !!p.local,
  entryFee: p.entry,
  bestTime: p.best,
  description: p.d,
  history: p.h,
  tips: p.t,
  tags: p.tags || [],
}));
fs.writeFileSync(path.join(__dirname, 'data', 'places.json'), JSON.stringify(out, null, 2));
console.log('Extracted', out.length, 'places');
