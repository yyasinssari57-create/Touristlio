const fs = require('fs');
const path = require('path');

const src = fs.readFileSync('C:/Users/Yasin/Desktop/touristlio6.html', 'utf8');
let html = src.replace(/<style>[\s\S]*?<\/style>/, '<link rel="stylesheet" href="/css/style.css"/>');
html = html.replace(/<script>[\s\S]*?<\/script>\s*<\/body>/, '<script src="/js/app.js"></script>\n</body>');

// Tiola tab in explore nav
html = html.replace(
  '<div class="etab" id="et-categories" onclick="showExploreTab(\'categories\',this)">📂 Kategoriler</div>',
  '<div class="etab" id="et-tiolas" onclick="showExploreTab(\'tiolas\',this)">✨ Tiola\'lar</div>\n      <div class="etab" id="et-categories" onclick="showExploreTab(\'categories\',this)">📂 Kategoriler</div>'
);

// Tiola explore section before categories
const tiolaSection = `
  <!-- TIOLA TAB -->
  <div class="explore-section" id="es-tiolas">
    <div class="discover-wrap">
      <div class="results-bar">
        <h3>Gezginlerden <em style="font-style:italic;color:var(--b)">Tiola</em></h3>
        <span style="font-size:.75rem;color:var(--t2)">Onaylı kısa deneyimler</span>
      </div>
      <div class="tiola-grid" id="tiolaFeed"></div>
      <div class="no-res" id="tiolaEmpty" style="display:none">Henüz onaylı Tiola yok. İlk sen yaz!</div>
    </div>
  </div>

`;
html = html.replace('  <!-- CATEGORIES TAB -->', tiolaSection + '  <!-- CATEGORIES TAB -->');

// Sort: Touristlio first in cards (swap rat order in template - handled in JS)

// Detail page: Tiola branding
html = html.replace('💬 Yorumlar & Puanlar', '✨ Tiola\'lar');
html = html.replace('onclick="postReview()"', 'onclick="postTiola()"');
html = html.replace('>Paylaş</button>', '>Tiola Gönder</button>');
html = html.replace(
  '<textarea class="rft" id="rfTxt" placeholder="Deneyiminizi paylaşın..."></textarea>',
  `<div class="member-ex" id="starStep" style="margin-bottom:10px">
                <div class="me-g"><div class="me-lbl">1. Yıldız (isteğe bağlı)</div>
                  <div class="rfstars" id="rfStars"><span onclick="rate(1)">★</span><span onclick="rate(2)">★</span><span onclick="rate(3)">★</span><span onclick="rate(4)">★</span><span onclick="rate(5)">★</span></div>
                </div>
              </div>
              <textarea class="rft" id="rfTxt" placeholder="2. Deneyimini yaz (Tiola)..."></textarea>
              <div style="margin-bottom:8px"><label style="font-size:.7rem;color:var(--t2)">3. Fotoğraf (isteğe bağlı)</label><br/>
              <input type="file" id="rfPhoto" accept="image/*" style="font-size:.75rem;margin-top:4px"/></div>`
);

// Swap rating boxes - Touristlio first visually via CSS, update labels
html = html.replace('pdTC').replace('pdTC', 'pdTC');
html = html.replace("' Google'", "' Google (referans)'");
html = html.replace("' Touristlio'", "' Tiola'");

// Profile tabs
html = html.replace(
  `<div class="ptab on" onclick="showPTab('diary',this)">📝 Günlük</div>
        <div class="ptab" onclick="showPTab('revs',this)">⭐ Yorumlarım</div>
        <div class="ptab" onclick="showPTab('saved',this)">❤️ Kaydedilenler</div>
        <div class="ptab" onclick="showPTab('write',this)">✏️ Yorum Yaz</div>`,
  `<div class="ptab on" onclick="showPTab('tiolas',this)">✨ Tiola'larım</div>
        <div class="ptab" onclick="showPTab('blogs',this)">📝 Bloglarım</div>
        <div class="ptab" onclick="showPTab('pending',this)">⏳ Bekleyenler</div>
        <div class="ptab" onclick="showPTab('saved',this)">❤️ Kaydedilenler</div>
        <div class="ptab" onclick="showPTab('write',this)">✏️ Tiola / Blog Yaz</div>`
);

html = html.replace('id="ptab-diary"', 'id="ptab-tiolas"');
html = html.replace('id="diaryGrid"', 'id="myTiolaList"');
html = html.replace('id="diaryEmpty"', 'id="tiolaListEmpty"');
html = html.replace(
  'Seyahat <em style="font-style:italic;color:var(--b)">Günlüğüm</em>',
  'Tiola <em style="font-style:italic;color:var(--b)">larım</em>'
);
html = html.replace(
  'Ziyaret ettiğin yerler burada blog tarzında görünür',
  'Yazdığın onaylı ve bekleyen Tiola\'lar'
);

// Add blog tab content — profile: write-only (no blog list)
html = html.replace(
  '<div class="ptab-c" id="ptab-revs">',
  `<div class="ptab-c" id="ptab-blogs">
        <div class="write-card">
          <div class="write-card-title">Blog yaz</div>
          <p class="profile-tiola-sub">Uzun rehber yazınız; onay sonrası ana sayfadaki Blog bölümünde yayınlanır.</p>
          <input class="w-sel" id="blogTitle" placeholder="Blog başlığı"/>
          <select class="w-sel" id="blogCat" aria-label="Blog kategorisi"></select>
          <textarea class="rft" id="blogBody" placeholder="Uzun rehber yazınız..." style="min-height:140px"></textarea>
          <button class="btn bp bsm" type="button" onclick="submitBlog()">Blog Gönder</button>
        </div>
      </div>
      <div class="ptab-c" id="ptab-pending">
        <div id="myPendingList"></div>
        <div class="empty-state" id="pendingEmpty"><div class="empty-icon">⏳</div><p>Onay bekleyen içerik yok.</p></div>
      </div>
      <div class="ptab-c" id="ptab-revs" style="display:none">`
);

// Write tab - Tiola + Blog
html = html.replace(
  '<div style="font-family:var(--fd);font-size:1rem;font-weight:700;color:var(--navy);margin-bottom:14px">Bir Yere Yorum Yaz</div>',
  `<div style="font-family:var(--fd);font-size:1rem;font-weight:700;color:var(--navy);margin-bottom:14px">Yeni Tiola veya Blog</div>
          <div class="ptabs" style="margin-bottom:14px">
            <div class="ptab on" id="write-tiola-tab" onclick="showWriteMode('tiola',this)">✨ Tiola</div>
            <div class="ptab" id="write-blog-tab" onclick="showWriteMode('blog',this)">📝 Blog</div>
          </div>
          <div id="writeTiolaForm">`
);
html = html.replace(
  '<select class="w-sel" id="arcPlace"><option value="">Yer seçin...</option></select>',
  `<select class="w-sel" id="arcPlace"><option value="">Mekân (isteğe bağlı)</option></select>
          <input class="w-sel" id="arcCity" placeholder="Şehir etiketi (genel Tiola için, isteğe bağlı)" style="margin-bottom:8px"/>
          <input type="file" id="arcPhoto" accept="image/*" style="font-size:.75rem;margin-bottom:10px"/>`
);
const writeBlogBlock = [
  'onclick="submitArc()">Tiola Gönder</button></div>',
  '<div id="writeBlogForm" style="display:none">',
  '<input class="w-sel" id="blogTitle" placeholder="Blog başlığı"/>',
  '<select class="w-sel" id="blogCat"><option value="guide">Rehber</option><option value="hidden">Gizli Köşe</option><option value="food">Yemek</option><option value="nature">Doğa</option><option value="culture">Kültür</option></select>',
  '<textarea class="rft" id="blogBody" placeholder="Uzun rehber yazınız..." style="height:120px"></textarea>',
  '<button class="btn bp bsm" onclick="submitBlog()">Blog Gönder</button>',
  '</div>',
].join('\n          ');
html = html.replace('onclick="submitArc()">Yayınla</button>', writeBlogBlock);

// Auth modal text
html = html.replace('Misafirler yorum yapabilir', 'Misafirler okuyabilir');
html = html.replace('Puan için üye olun', 'Tiola yazmak için üye olun');
html = html.replace('<button class="aguest" onclick="doLogin(\'guest\')">👤 Misafir Olarak Devam Et</button>', '');

// Admin link in nav for admins (hidden by default)
html = html.replace(
  '<button class="btn bp bsm" onclick="openAuth()">Katıl</button>',
  '<a class="btn bo bsm" id="adminLink" href="/admin" style="display:none;text-decoration:none">🛡️ Admin</a>\n      <button class="btn bp bsm" onclick="openAuth()">Katıl</button>'
);

// Sort dropdown - add Tiola sort
html = html.replace(
  '<option value="rated">En Yüksek Puanlı</option>',
  '<option value="tiola">En Yüksek Tiola Puanı</option>\n          <option value="rated">En Yüksek Google Puanı</option>'
);

fs.writeFileSync(path.join('public', 'index.html'), html);
console.log('index.html created');
