# Touristlio — denetim sonrası kontrol listesi

Tüm KRİTİK / sonraki maddeler bitince bunları tek tek doğrula ve düzelt.

## KRİTİK-1 (veri)
- Canlı Render DB hâlâ boş olabilir: `places.json` deploy edilmeli; Render Free disk kalıcı değil.
- Seed görsellerinde tekrarlayan Unsplash URL’leri var (merge çıktısında duplicate).
- Üretimde `SEED_ON_START` / boş tablo senaryosunu canlıda doğrula.

## KRİTİK-2 (detay URL)
- `/places/:slug` SPA (`index.html`); sayfa başına tam SSR HTML yok.
- Eski `/?place=id` linkleri çalışır; sitemap güncellenene kadar Google eski URL’leri görebilir.
- Canlıya deploy edilmeden slug sayfaları 404 kalır.
- Daha önce ana sayfada `POST /track` 500 loglandı — analitik rotasını ayrıca kontrol et.

## KRİTİK-5 (SEO)
- OG/canonical sunucu enjeksiyonu SPA sekmeleri (`#explore`) için sınırlı; detay ve yasal sayfalar HTML’de doğru.
- `hero.webp` Unsplash kaynağı; özgün görsel istenirse değiştir.

## KRİTİK-4 (robots / sitemap)
- `public/sitemap.xml` gitignore’da; asıl kaynak artık dinamik `/sitemap.xml` rotası. Eski statik dosya kafa karıştırmasın diye deploy sonrası 200 doğrula.
- Blog URL’leri `/blog/{slug}`; overlay hâlâ SPA.

## KRİTİK-3 (iletişim)
- SMTP (`SMTP_HOST` / `SMTP_USER` / `SMTP_PASS`) yoksa form DB’ye yazar, e-posta gitmez.
- Admin panelde iletişim kutusu listesi yok.

## KRİTİK-7 (apex vs www)
- Tamamlandı: Express, yalnızca public host `touristlio.com` (apex) ise **301** → `https://www.touristlio.com` + aynı path/query. `www` ve diğer host’lar dokunulmaz. Localhost / `127.0.0.1` yönlendirilmez.
- KRİTİK-5 canonical www duruyor (`siteBaseUrl`, sitemap, `setCanonical`).
- **Döngü riski:** Cloudflare **www → apex** (Redirect www to root) açıksa + uygulama apex → www **ERR_TOO_MANY_REDIRECTS**. Cloudflare SSL **Full** (Flexible değil). Yön tek: apex → www.
- Acil kapatma: Render env `DISABLE_WWW_REDIRECT=true`.
- Render’da `SITE_URL` / `CORS_ORIGIN` = `https://www.touristlio.com`. Custom domain’e apex **ve** www eklenmeli.
- Canlı Cloudflare kurallarını Yasin’in panelinden doğrula (bu ortam CF’ye erişemez).

## KRİTİK-6 (şifre)
- Tamamlandı: bcrypt cost 12, mevcut `$2a$10$` hash’ler verify edilir, başarılı girişte cost < 12 ise sessiz rehash.
- Argon2id henüz yok (bcryptjs cost 12 ile kaldık). İleride argon2 eklenirse eski bcrypt hash’leri `isBcryptHash` ile ayırt edilmeli.
- 8–11 karakterlik eski şifreler login’de geçerli; 12 karakter kuralı sadece kayıt / reset / şifre değiştir / moderatör oluşturma.
- Varsayılan `ADMIN_PASSWORD` (`ChangeMe123!`) 12 karakter; üretimde mutlaka `.env` ile değiştirilmeli.
- bcryptjs saf JS; native `bcrypt` / argon2 native bağlama yok (CPU maliyeti Render free’de hissedilebilir).

## KRİTİK-7 sonrası leftover
- Canlıda `curl -I https://touristlio.com/places/ornek` → 301 Location `https://www.touristlio.com/places/ornek`.
- Cloudflare SSL Full + apex→www (veya CF 301 kapalı, sadece Express). www→apex kuralı olmamalı.
- Hetzner / VPS dokümanları hâlâ örnek olarak apex `https://touristlio.com` gösteriyor; canlı env www olmalı.
- `public/index.html` statik canonical www; SSR enjeksiyonu KRİTİK-5 ile aynı host.

## KRİTİK-8 eşleşmesi (dosya vs önceki commit)

- Yüklenen tam denetim (`touristlio_cursor_audit.md`, 506 satır) **KRİTİK-8 başlığı içermiyor.** KRİTİK-7’den sonra doğrudan [YÜKSEK-1] geliyor.
- `origin/main` commit `7f43487` (“KVKK — Çerez onayı olmadan analitik”) dosyadaki bir KRİTİK-8 değil; önceki leftover’dan ekstra iş. Yeniden yapılmadı.
- Canlıda: çerez reddi sonrası Network’te `track` olmamalı; kabul sonrası `stored: true`.

## YÜKSEK-1 (hero görsel)

- Tamamlandı: `.hero .hbg` artık `/images/hero.webp` (cover + center); overlay `rgba(0,0,0,.4)`.
- Mevcut metin / şehir pill’leri taşınmadı; noktalı mesh görseli fotoğrafın üstünde bırakılmadı (HTML div duruyor).
- Repoda zaten `public/images/hero.webp` vardı (İstanbul / Galata, KRİTİK-5 OG). Denetimin önerdiği Unsplash flatlay (`photo-1488646953014`) ile **değiştirilmedi** — mevcut görsel markaya daha uygun.
- Slogan (“Sadece Ziyaret Etme. Hisset.”) navbar’da; hero içinde h1 yok. Taşınmadı.
- Mobilde `.hero { min-height: auto }` kısa kalabilir; cover/center yine geçerli.

## YÜKSEK-2 (harita)

- Tamamlandı: Leaflet + MarkerCluster `/public/vendor` altına alındı (unpkg SRI/CDN kırılınca `L` tanımsız kalıyordu).
- Harita, `display:none` sekmesinde 0 boyutla init edilmiyor; görünür olunca `invalidateSize` + ResizeObserver.
- Tüm mekânlar lat/lng: seed’de vardı; eksikler `ensurePlaceCoords` / migration backfill ile doldurulur. `GET /api/places/map/markers` her pin’de koordinat döner.
- Marker clustering (maxClusterRadius 50 / 48).
- Kategori/grup filtreleri harita pinleriyle senkron: `setExploreFilter` → `TL_MAP.setMapFilters` + markers API `category`/`group`.
- Görsel pin rengi, zoom konumu, OSM karoları aynı; layout’a dokunulmadı.

### Leftover
- `GET /api/osm/search` hâlâ 501 — Nominatim proxy yok; harita OSM karoları + dahili pin’lerle çalışır, serbest OSM araması yok.
- Markers API en fazla 500 pin (clustering bunun için). 1090 yerin hepsi tek seferde çizilmez.
- OSM karoları `tile.openstreetmap.org` ayakta olmalı; offline/engelli ağda gri kutu.
- `unpkg.com` CSP’de duruyor ama harita artık local vendor kullanıyor.
- Keşfet haritası (`#discoverMap`) ilk yüklemede Türkiye varsayılanı; şehir seçilince uçar.
- Detay haritası (`#pdMap`) lat/lng yoksa gizlenir (artık seed’de dolu).

## YÜKSEK-3 (görsel — WebP + lazy + EXIF)

- Tamamlandı: statik raster logolar WebP (`logo.webp`, `logo-round.webp`, `nav-logo.webp`); `hero.webp` + `hero-480w` / `hero-800w` srcset.
- Tüm HTML `<img>` `loading="lazy"` (ana sayfa hero CSS `background-image`, eager preload `/images/hero.webp`).
- Upload: Sharp — EXIF/GPS strip (Sharp 0.35: `withMetadata()` çağrılmaz; `.withMetadata(false)` bu sürümde EXIF’i **korur**), max 1920×1080, otomatik WebP, magic byte yalnızca jpeg/png/webp.
- Srcset: Unsplash `fm=webp&w=`, `/uploads` 480/800/1080; eksik varyantlar on-the-fly üretilir.
- GIF yeni yüklemede reddedilir. SVG / Leaflet vendor PNG dokunulmadı.
- Eski `uploads/` dosyaları gitignore’da; retroaktif dönüşüm yok (yeni yüklemeler WebP).
- `logo-round.png` 700KB → `logo-round.webp` ~8KB; PNG kopyaları fallback için duruyor.
- OG `index.html` statik fallback logo-round.webp; sunucu SEO hâlâ `hero.webp` (KRİTİK-5).

### Leftover
- Mevcut diskteki eski JPEG/PNG upload’lar (Tiola/avatar) EXIF içerebilir — bir kerelik migration yazılmadı.
- GIF animasyon desteği kalktı; eski GIF URL’leri 404 olabilir.
- Hero LCP preload hâlâ tam `hero.webp` (mobilde 480w gösterilse de büyük dosya önyüklenebilir).
- Unsplash uzak görseller indirilip WebP’ye çevrilmiyor; tarayıcı `fm=webp` srcset kullanır.
- Leaflet `vendor/**/*.png` (marker/layers) dönüştürülmedi.

## YÜKSEK-4 (JSON-LD Schema.org)

- Tamamlandı: sunucu HTML’e `application/ld+json` enjekte eder (Googlebot JS’siz görür).
  - Ana sayfa `/` ve `/en/` → **TravelAgency** (`name`, `url`, `logo` `/images/logo.webp`, `description` denetimdeki metin).
  - `/places/:slug` → **TouristAttraction** (dinamik: ad, açıklama, url, görsel, adres, geo). Tiola ortalaması varsa **AggregateRating** (yalnızca Tiola; Google puanı yok).
  - Her onaylı üst seviye Tiola → ayrı **Review** (`itemReviewed` = mekân, `reviewRating` Tiola yıldızı).
  - `/blog/:slug` → **Article** (headline, yazar, publisher Touristlio, tarih).
  - `/legal/contact.html` → **ContactPage** (`mainEntity` TravelAgency + e-posta).
- SPA: `TouristDestination` → `TouristAttraction`; ana sayfa feed ve mekân Tiola listesi Review ekler; blog overlay Article.
- UI’da Google puanı yok; AggregateRating yalnızca mevcut Tiola yıldızlarıyla (kartlarda zaten görünen).

### Leftover
- SPA içinden blog açılınca URL hâlâ `#blog`; Article HTML’si yalnızca doğrudan `/blog/:slug` isteğinde. Overlay kapanınca TravelAgency’ye döner.
- Tiola’ların kendi kanonik URL’si yok; Review mekân sayfasına / ana sayfa feed’ine bağlı. Google Review zengin sonucu için `itemReviewed` + görünür yıldız şart — Search Console’da doğrula.
- Ana sayfa ilk HTML’de sadece TravelAgency; feed Review’ları JS sonrası (crawler JS çalıştırmazsa mekân URL’lerindeki Review’lar asıl kaynak).
- `AggregateRating` yalnızca `tiolaCount > 0` iken; puansız mekânda rich snippet rating çıkmaz.
- FAQPage / BreadcrumbList hâlâ istemci tarafında (önceki davranış); sunucu HTML’sine taşınmadı.
- logo.webp Absolute URL `SITE_URL` / `siteBaseUrl()` (www). Localhost curl’de origin localhost olabilir.

## YÜKSEK-5 (ana sayfa istatistikleri)

- Tamamlandı: şerit artık `—` göstermiyor. İlk HTML `...` (yükleme); API null/undefined/hata → **0**.
- `GET /api/stats` ve `GET /api/places/stats` tam katalog sayıları döner: kapsanan ülke, listelenen yer (arşiv hariç), onaylı üst seviye **Tiola** (Google puanı yok).
- Değer gelince ease-out sayaç animasyonu; `prefers-reduced-motion` veya 0 ise anında yazılır.
- Üçüncü sütun artık "Tiola" yazısı değil, `id="stat-tiolas"` sayı alanı.
- `updateCategoryCounts` şeridi yüklü sayfa boyutuyla ezmiyor.

### Leftover
- Kategori kartlarındaki `cat-cnt-*` hâlâ ilk boyamada `—` (şerit değil; kart doldurulunca `0 yer`).
- Public `GET /api/places` hâlâ taslak yerleri de sayabilir; şerit `status != archived` kullanır.
- İstatistik önbelleği 2 dk; Tiola onayında anında invalidate yok (places cache ile birlikte düşer).
- Ülke adları flag-normalize edilmeden `COUNT(DISTINCT country)`.
- Dil değişince sayı formatı (1.090 / 1,090) yeniden çizilmez; ilk yükleme diline bağlı.
- `verify:stats` canlı HTTP için `VERIFY_STATS_URL` ister.

## YÜKSEK-6 (error boundary)

- Tamamlandı: React yok; vanilla JS + Express karşılığı.
  - `public/js/error-boundary.js` ilk script: `window` `error` + `unhandledrejection`.
  - Global fallback: "Bir şeyler ters gitti", "Ana Sayfaya Dön", "Sayfayı Yenile".
  - Hata detayı yalnızca development (`data-tl-dev=1` / localhost); production stack göstermez.
  - Harita (`#es-map`, `#discoverMap`, `#pdMapWrap`), Tiola listesi (`#es-tiolas`, `#revList`) ve formlar (Tiola formu, auth, iletişim, arama) ayrı `data-error-boundary` ile sarılı.
  - Express 500 HTML: aynı CTA'lar; dev'de stack `<!-- TL_ERROR_DETAIL -->` ile enjekte.
- `npm run verify:errors` statik + inject + yerel `/__error-test` 500.

### Leftover
- React `<ErrorBoundary>` yok (stack Express + static JS).
- Bölüm fallback'i aynı zone'daki tüm sarmalayıcıları değiştirir (keşfet haritası + detay haritası birlikte).
- Cross-origin `Script error.` yutulur (tarayıcı gizler).
- `/__error-test` ve `?tl_error_test=` yalnızca development.
- Admin panel kendi uzun inline JS'ine sahip; global handler yüklenir (sunucu enjeksiyonu) ama bölüm sarmalayıcıları yok.
- Eski 404 metni aynı; yalnızca 500 + JS overlay denetim kopyasına çekildi.

- [YÜKSEK-7] Form Güvenliği — reCAPTCHA + Sanitization
- [ORTA-1] Tiola Sistemi Görünmüyor
- [ORTA-2] Arama ve Filtreleme State Yönetimi
- [ORTA-3] Sayfalama (Pagination) Eksikliği
- [ORTA-4] Anti-Bot / Sahte Oy Koruması
- [ORTA-5] Veritabanı Index'leri — Filtreleme Performansı
- [ORTA-6] Blog Sayfası Çalışır Hale Getir
- [ORTA-7] Kullanıcı Sistemi Tamamlama
- [DÜŞÜK-1] Mobil Uyum Kontrolleri
- [DÜŞÜK-2] Erişilebilirlik (Accessibility)
- [DÜŞÜK-3] Loading States — Skeleton Loader
- [DÜŞÜK-4] Kırık Linkleri Düzelt
- [DÜŞÜK-5] Kod Temizliği
- [DÜŞÜK-6] Analitik ve İzleme

## Genel
- Görevler bitince bu listedeki her maddeyi sırayla açıp kapat.
- Tam denetim kopyası: `/workspace/touristlio_cursor_audit.md`
