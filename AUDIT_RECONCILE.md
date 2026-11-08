# Touristlio — Claude/Ailar V6 raporu uzlaştırma

**Tarih:** 2026-11-08  
**Kaynak rapor:** `touristlio_cursor_v6_adim_adim.md` (yükleme: `uploads/touristlio_cursor_v6_adim_adim_0962.md`, Claude · 8 Kas 2026)  
**Karşılaştırma:** `origin/main` @ `e06d55a` (PR #144 dahil) + açık PR #137  
**Not:** Workspace’te `AUDIT_REPORT_V6.md` yok (Cursor’ın ayrı teknik denetim canvas’ı V6 P0/P1 güvenlik/SEO listesi; bu dosya **Claude ürün adım planı** ile uzlaştırır). Commit/PR yok.

**Merge özeti (#132–#144):**  
MERGED: #132–#136, #138–#144. OPEN: **#137** (Keşfet karma destinasyonlar).

Kilitli ürün kararları (Yasin): en iyi zaman = ay çoklu; otel = «Bölge otel ortalaması» / doluysa göster; Keşfet çip şeridi yok; gelişmiş filtreler kalsın; çöp 15 gün.

---

## 1. Raporda yazılan ama BİZDE BİTENLER

| Claude maddesi | Kanıt (PR / main) | Not |
|---|---|---|
| Kalp / kaydet (`window.activePlace`) | **#132 MERGED** `08b7c1b` — `window.activePlace` + `toggleActivePlaceSave` | ADIM 2a doğrulama görevi; kod main’de |
| Profil «Ziyaret ettik» (`pdVisitBtn`) | **#132** | ADIM 2b |
| Üst menü Profilim ≠ login overlay | **#132** — girişliyken `openAuth` kaldırılır | ADIM 2c |
| Toplu arşiv + checkbox | **#134 → #140 → #142 → #143** | ADIM 2d; TEXT `created_at` COALESCE #143 |
| Toplu çöp 15 gün + geri yükle/purge | **#142/#143** — `deleted_at`, `purgeExpiredTrash`, onayda «N gün sonra kalıcı» | Claude «acil uyarı» doğru; özellik zaten kodda |
| Yapılacaklar / kültür / tavsiye + boş gizle | **#135** | ADIM 2e |
| En iyi zaman = `best_months` çoklu ay | **#135** | ADIM 6.1 ürün kararı uygulanmış |
| Bölge otel ortalaması; boşsa gizle | **#135 + #139** etiket «Bölge otel ortalaması» | ADIM 6.2; Claude’un «şehir formu» alternatifi seçilmedi — kilitli karar yer alanı |
| Keşfet yatay kategori çip şeridi kaldır | **#133** — index.html: «Keşfet sayfa şeridi yok» | ADIM 3’ün Keşfet kısmı |
| Profil soft polish + başlık emojileri | **#136** | ADIM 5’in yumuşak hali (büyük redesign değil) |
| Keşfet/filtre/sekme emojileri kaldır | **#139** | ADIM 4 kısmi |
| Admin kılavuz güncelleme (detay, toplu arşiv vb.) | **#138** | ADIM 12.1 kısmi |
| Keşfet sayacı filtre yokken gizle | **#141** | Claude planında yok; Yasin isteği — main’de |
| Admin yer listesi sayfalama ←→ | **#144** | Claude planında yok; main’de |
| Sayfa h1 + harita min-height | **V5 #129** | Claude **ADIM 11** ve ADIM 7 harita boyutu — **bayat** (zaten yapıldı) |
| V5 güvenlik/SEO kilitleri (seed, JWT, CSRF mount’lar, EN blog server noindex, imageVerified kapısı, …) | **#118–#130** | Claude «v5 sonrası durum» tablosu — doğru |

---

## 2. Hâlâ açık / yarım (gerçek residual)

| Madde | Durum | Kanıt |
|---|---|---|
| **ADIM 1** — istemci `index,follow` ile sunucu noindex’i ezmesin | **AÇIK (kod)** | `origin/main` `app.js`: `setBlogListingSeo` ~1978, tab ~2217/2221/2232, blog detay ~3237 hâlâ koşulsuz `index,follow` |
| **ADIM 2** — Playwright ile #132–#143 canlı doğrulama | **BİTTİ (süreç)** | `verify:v6-adim2` 390/1280 CDP; soft SORUNLU: çöp satır-kalan-gün (ADIM 10), ay aralığı (ADIM 6) |
| **ADIM 3** — `#discoverCatStrip` (Gezilecek Yerler) | **YARIM** | Keşfet şeridi #133 ile gitti; `discoverCatStrip` + `discover-places.js` hâlâ var. Yasin kararı Keşfet odaklıydı — strip’i kaldırmak ayrı onay |
| **ADIM 4** — public emoji temizliği (tam) | **YARIM** | #136/#139 sonrası hâlâ: hero pill/şehir çipleri, searchBtn, blogCat*, authSecure, SSS, empty-state ikonları (`i18n.js` / `index.html` / `profile.html`) |
| **ADIM 5** — profil «profesyonel» redesign | **YARIM / ürün** | #136 soft polish merged; Claude’un sekme/istatistik yeniden düzeni onaylı ayrı iş |
| **ADIM 7** — 0’lı kategori + hero şehir çipleri otomatik gizle | **AÇIK** | Hero `hpills` sabit İstanbul/Paris/…; onaylı |
| **ADIM 8** — EN «Free» / boş EN satır gizle / honeypot «Website» label | **AÇIK** | `icEntry` hâlâ `placeField(...,'entryFee')`; honeypot `<label>Website` DOM’da (`form-security.js`, contact.html) |
| **ADIM 9** — slug değişince otomatik `place_slug_redirects` | **AÇIK** | Tablo + okuma var (mig 018 / `place-redirects.js`); admin slug UPDATE yazarken INSERT yok |
| **ADIM 10** — katalog sayaçları / satır «neden hazır değil» / satırda kalan gün | **YARIM** | Çöp+onay+15g + quality bar (`loadPlacesQualityBar`) var; Yayında/Taslak/Arşiv/Çöp tıklanır sayaç satırı ve satır başı kalan-gün Claude seviyesinde değil |
| **ADIM 12** — kılavuz çöp 15g netleştir + `verify:v6` | **YARIM** | #138 kılavuz var; `package.json`’da `verify:v6` yok |
| **PR #137** — Keşfet karma destinasyonlar | **AÇIK (unmerged)** | OPEN, mergeable; main’de değil |
| **Ops / veri** — canlıda az yayın / çöpte yer riski | **Yasin** | Kod değil; Claude uyarısı geçerli |

**Cursor Denetim V6 canvas’tan (Claude planında yok, hâlâ teknik açık):** `/api/places` CSRF’siz mount; bot SSR gövde boş; `image_verified` yayın 0 → sitemap yer URL 0; trip/search full scan; JWT `token_version` yok. Bunlar ayrı backlog.

---

## 3. Raporda yeni / yanlış / tekrar (bayat öneriler)

| Claude iddiası | Değerlendirme |
|---|---|
| ADIM 3 «kategori şeridini kaldır» (sanki hiç yapılmamış) | **Tekrar / bayat (Keşfet).** #133 merged. Gezilecek Yerler strip ayrı. |
| ADIM 6 otel/en iyi zaman keşfi + uygulama | **Bayat ürün.** #135/#139 + kilitli kararlar. İnceleme adımı gereksiz. |
| ADIM 11 h1 ölç / değiştir + harita yüksekliği | **Bayat.** V5 #129: `/explore`→Keşfet h1, map `min-height` 480/320. |
| ADIM 2 maddeleri «yapılacak iş» gibi | **Yanlış çerçeve.** Claude girişte «Cursor zaten yaptı» diyor; adım doğrulama, implementasyon değil. |
| ADIM 5 büyük profil redesign | **Kısmen bayat.** Soft polish #136; tam mockup ayrı ürün isteği. |
| ADIM 10 çöp güvenliği (15g uyarı, geri yükle) | **Çoğu bayat.** #142 onay metni + hint + restore/purge var. |
| ADIM 12 kılavuz sıfırdan | **Kısmen bayat.** #138 güncelledi; çöp/sayaç cümleleri sıkılaştırılabilir. |
| Grok: Tiola seed / HTML max-age=60 | Claude reddetti — **doğru**; yapılmayacak. |
| Ayasofya’ya alakasız 301 | Claude reddetti — **doğru.** |
| «Sadece 2 yer yayında» → büyük kod işi | **Veri/op**, kalite kapısını gevşetme YASAK (Claude DOKUNMA ile uyumlu). |

---

## 4. Önerilen sıradaki 3 iş (yalnız gerçek açıklar)

1. **ADIM 1 — `setRobotsSafe` / istemci noindex ezmesini kes**  
   SEO regresyonu; main’de satır kanıtı var. Tek PR, UI yok.

2. **PR #137 merge veya ADIM 9 slug→301 otomatik yazma**  
   #137: Keşfet’te çipsiz karma liste (Yasin’in «altta destinasyonlar görünsün» isteği) — kod hazır, main’de değil.  
   Alternatif P1: slug değişince `place_slug_redirects` INSERT (sessiz 404 önleme).

3. **ADIM 8 — EN etiketleri (`Free`) + honeypot Website gizleme**  
   Küçük, net, onay gerektirmeyen etiket/a11y; içerik üretmez.

*(Bilinçli ertele: ADIM 4 tam emoji süpürme, ADIM 7 onaylı gizleme, ADIM 5 redesign, ADIM 10 sayaç kozmetiği, Cursor V6 SSR/CSRF — sonra.)*

---

## Kaynak haritası

| Dosya / ajan | Rol |
|---|---|
| `uploads/touristlio_cursor_v6_adim_adim_0962.md` | Claude/Ailar V6 adım planı (bu uzlaştırma konusu) |
| Canvas `Touristlio_Denetim_V6` / ajan `bc-a4433dd5…` | Cursor teknik denetim (CSRF/SSR/imageVerified) — ayrı liste |
| `AUDIT_FOLLOWUPS.md` | Eski follow-up; checkbox’lar bayat olabilir |
| `touristlio_cursor_audit.md` | Ağustos 2026 eski panel — güncel değil |
