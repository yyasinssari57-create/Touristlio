const fs = require('fs');
const h = fs.readFileSync('C:/Users/Yasin/Desktop/touristlio6.html', 'utf8');
const m = h.match(/<style>([\s\S]*?)<\/style>/);
const extra = `
/* Tiola extras */
.tiola-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;}
.tiola-card{background:var(--w);border:1.5px solid var(--l2);border-radius:var(--r2);overflow:hidden;box-shadow:var(--sh);cursor:pointer;transition:transform .2s;}
.tiola-card:hover{transform:translateY(-2px);}
.tiola-card img{width:100%;height:180px;object-fit:cover;}
.tiola-body{padding:12px;}
.tiola-meta{font-size:.68rem;color:var(--t3);margin-bottom:6px;}
.tiola-stars{color:var(--star);font-size:.8rem;}
.tiola-txt{font-size:.82rem;color:var(--t2);line-height:1.6;margin-top:6px;}
.status-pending{color:#b45309;font-size:.65rem;font-weight:600;}
.status-approved{color:var(--ok);font-size:.65rem;font-weight:600;}
.status-rejected{color:#ef4444;font-size:.65rem;font-weight:600;}
.photo-preview{max-width:120px;max-height:80px;border-radius:8px;margin-top:8px;object-fit:cover;}
.dual-rat{display:flex;flex-direction:column;gap:7px;}
.dr.t{background:rgba(56,189,248,.12);border:2px solid rgba(56,189,248,.35);order:-1;}
.admin-wrap{max-width:900px;margin:80px auto 40px;padding:0 20px;}
.admin-card{background:var(--w);border:1.5px solid var(--l2);border-radius:var(--r2);padding:16px;margin-bottom:12px;}
`;
fs.writeFileSync('public/css/style.css', m[1] + extra);
console.log('CSS written');
