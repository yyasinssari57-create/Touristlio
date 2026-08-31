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

## YÜKSEK-7 (form güvenliği)

- Tamamlandı: sunucu tüm form metinlerini HTML/XSS temizliğiyle kaydeder (`sanitizeText` / `sanitizeName`); Tiola ve blog kullanıcı içeriği tag’siz saklanır; render’da mevcut `escapeHtml` duruyor.
- E-posta: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` (iletişim, kayıt, giriş, şifre unuttum, e-posta değiştir).
- Rate limit: aynı IP, 5 dakikada max 3 public form gönderimi (iletişim + kayıt + şifre unuttum). Giriş `authLimiter` (20/15 dk) — zayıflatılmadı.
- Honeypot: gizli `website` alanı; doluysa iletişim sahte 200, diğerleri 400; DB’ye yazılmaz.
- reCAPTCHA v3 (görünmez): `RECAPTCHA_SITE_KEY` + `RECAPTCHA_SECRET` ikisi de doluysa zorunlu. Anahtar yoksa atlanır — dev formları çalışır. Anahtar uydurulmadı.
- `npm run verify:forms` — sanitization birim testleri + curl (geçersiz e-posta, XSS, honeypot, 429, anahtar varken tokensuz 400).

### Leftover
- Canlıda reCAPTCHA **yok** (env boş). Yasin Google reCAPTCHA v3 çifti üretip Render/Hetzner’e `RECAPTCHA_SITE_KEY` ve `RECAPTCHA_SECRET` yazmalı; aksi halde yalnızca sanitization + honeypot + rate-limit aktif.
- reCAPTCHA skor eşiği varsayılan 0.5 (`RECAPTCHA_MIN_SCORE`). Gerçek anahtarla Search Console / admin skorunu izle.
- Redis yok; form limiti süreç belleğinde (Render free’de instance yeniden başlayınca sıfırlanır). ORTA-4 Tiola Redis limiter’ı ayrı.
- Admin iletişim kutusu listesi hâlâ yok (KRİTİK-3 leftover).
- Eski DB’deki Tiola/blog satırları retroaktif temizlenmedi; yeni kayıtlarda XSS strip var, eski metin çıkışta `escapeHtml`.
- Girişe 3/5 dk limiti uygulanmadı (yanlış şifrede kilitlenmesin diye); bot’a karşı reCAPTCHA (anahtar varsa) + `authLimiter`.

## ORTA-1 (Tiola görünürlüğü)

- Tamamlandı: mekân kartlarında (keşfet grid, discover listesi, arama, yakındaki/benzer) ortalama **Tiola** puanı + yorum sayısı. Google puanı yok.
- Detay formu girişsiz kilitli; login/kayıt sonrası yıldız + kategori + gönder aktif.
- `places.tiola_count` / `places.tiola_rating` kolonları; onay / kaldırma / silme / rapor geri alma sonrası yeniden hesaplanır. Liste AVG() yapmaz, kolon + 2 dk bellek önbelleği.
- Rozetler onaylı üst seviye Tiola sayısına göre: 1 İlk Tiola, 5 Gezgin, 10 Yerel Rehber, 25 Tiola Ustası, 50 Elçi. Profil + herkese açık profil.
- `npm run verify:tiolas`

### Leftover
- Bekleyen (pending) Tiola kamu ortalamasına yansımaz; ortalama onayda güncellenir.
- Keşfet kartlarında hâlâ Google yok; puan 0.0 / 0 Tiola boş mekânlarda görünür (tire yok).
- Rozetler hesaplanır, ayrı `user_badges` tablosu yok (silinen Tiola sayıyı düşürür).
- Redis/anti-bot Tiola limiti ORTA-4.
- Profil `profile.html` ayrı sayfası rozet HTML’si taşımaz; ana SPA profil kullanır.

## ORTA-2 (arama / filtre state)

- Tamamlandı: keşfet araması 300ms debounce ile hem dropdown hem grid’i günceller; boş arama da sonuçları sıfırlar.
- Aktif filtreler paylaşılabilir URL’ye yazılır: `/explore?country=turkey&category=nature&score=4` (`q`, `group`, `city`, `district`, `entry`, `local`, `sort` da eklenir). `/en/explore?...` İngilizce.
- İlk yükleme ve geri/ileri (popstate) query’den state’i geri yükler. `score` = minimum Tiola (Google yok).
- `#resCnt` “X yer bulundu” her sonuçta güncellenir (`aria-live`).
- “Filtreler Temizle” (keşfet sonuç çubuğu + gelişmiş filtre sekmesi + `/search`) tüm state + URL’yi sıfırlar. Eski kırık `syncFilterChipState` çağrısı kaldırıldı.
- `GET /explore` index.html; API `score` ≡ `minTiola`; ülke slug (`turkey`) SQL/filtrede eşleşir.
- `npm run verify:filters`

### Leftover
- Hava/erişilebilirlik chip’leri hâlâ görsel; listeyi filtrelemez (önceki davranış).
- Ana sayfa filtresizken URL `/#explore` kalır; query olunca `/explore?...`.
- `/search` kendi `q/category/sort/page` query’sini kullanır (`/explore` şeması değil).
- `tl_route` localStorage filtre tutmaz; kaynak URL.
- Ülke eşlemesi `LIKE %turkey%`; “South Turkey” diye bir ülke yok.

## ORTA-3 (sayfalama)

- Tamamlandı: `GET /api/places` ve `GET /api/search` `?page=1&limit=20` (varsayılan limit 20). Yanıt: `total`, `page`, `limit`, `offset`, `count`, `totalPages`, `hasMore`. Eski `offset` hâlâ çalışır; `page` varsa o kazanır.
- Keşfet: “Daha Fazla Yükle” + sayfa numaraları (önceki / pencere / sonraki). `PAGE_SIZE=20`. URL `/explore?...&page=2` (page=1 yazılmaz).
- `/search` prev/next artık sayfayı sıfırlamıyor; `page`+`limit=20` gönderir; toplam API’den.
- `npm run verify:pagination`
- Google puanı yok; Tiola kullanıcı üretimi.

### Leftover
- “Daha Fazla Yükle” kartları biriktirir; paylaşılabilir URL yalnızca numaralı sayfa atlamasını tutar (append oturumu restore edilmez).
- Discover (`gezilecek-yerler`) hâlâ `limit=100` tek istek — keşfet grid’i değil.
- Liste SQL LIMIT ORTA-5’te kapandı (`searchPlacesPage`); FTS yoksa bellek yedeği.
- Markers API 500 pin tavanı aynı (YÜKSEK-2 leftover).
- Admin listeleri kendi `parsePagination` (max 100) — public helper’dan ayrı.

## ORTA-4 (anti-bot / sahte oy)

- Tamamlandı: Tiola ekleme ve beğeni (`POST /api/tiolas`, `POST /api/tiolas/:id/like`) IP + kullanıcı kimliği ile dakikada 5 istek. Redis (`REDIS_URL`) varsa paylaşımlı sayaç; yoksa süreç belleği.
- CSRF token: `GET /api/csrf` + `tl_csrf` çerezi; mutating Tiola isteklerinde `X-CSRF-Token` (veya gövde `csrfToken`) çerezle eşleşmeli. Mevcut origin kontrolü duruyor. Karşılaştırma `timingSafeEqual`.
- Aynı kullanıcı + mekân için ikinci yıldız oyu 409; kısmi unique index `idx_tiolas_unique_user_place_vote`.
- Anormal davranış pino `event: anti_bot` ile loglanır: `rate_limit`, `duplicate_vote`, `csrf_fail`, `spam_tiola`, `store_error`.
- `npm run verify:votes` — rate limit 429, duplicate 409, CSRF 403.
- Google puanı yok; yalnızca Tiola kullanıcı oyu.

### Leftover
- Canlıda Redis yoksa limit instance bellek; Render free yeniden başlayınca sıfırlanır, birden fazla instance paylaşmaz. Yasin `REDIS_URL` (Upstash / Redis Cloud / Render Redis) eklemeli.
- CSRF token yalnızca Tiola mutating uçlarına zorunlu; iletişim/kayıt hâlâ origin + honeypot + form limiter (YÜKSEK-7).
- Unique index mevcut çift oyları en eski kaydı tutup diğerlerini `deleted` yapar; silinen satırlar istatistikte yok (ORTA-1 recompute onayda).
- Redis paketi yüklü; `REDIS_URL` boşken bağlanılmaz.

## ORTA-5 (veritabanı index'leri)

- Tamamlandı: SQLite migration `008_filter_indexes.js` (Postgres GIN/JSONB yok).
  - Mekân listesi: `idx_places_country_city_score` `(country, city, tiola_rating)` — denetimdeki `(country_id, city_id, score)`.
  - `idx_places_country_city_score_lc` `(LOWER(country), LOWER(city), tiola_rating)` — LIKE sorguları.
  - Filtreleme: `idx_places_category_published` `(category, status)` — `(category_id, is_published)`.
  - Blog: `idx_blogs_created_at` `(created_at)` (`idx_blogs_status (status, created_at)` zaten vardı).
  - JSON etiketler: `idx_places_categories` TEXT (GIN yok). Kategori üyeliği `category =` + `categories LIKE`.
  - Sıralama/LIMIT: `idx_places_tiola_rating`.
- ORTA-3 leftover: `GET /api/places` ve `GET /api/search` artık SQL `COUNT` + `LIMIT/OFFSET` (`searchPlacesPage`). Bellekte slice yalnızca FTS yoksa.
- `npm run verify:indexes` — PRAGMA index_info, EXPLAIN QUERY PLAN, SQL LIMIT, canlı liste.
- Google puanı yok; skor `places.tiola_rating`.

### Leftover
- SQLite `LIKE '%x%'` baştaki joker yüzünden her zaman index kullanmayabilir; `turkey%` öneki + expression index var.
- `az` sıralama SQL `COLLATE NOCASE` (Türkçe `localeCompare` değil).
- JSON dizi üyeliği GIN değil; `LIKE %"slug"%`.
- Discover (`gezilecek-yerler`) hâlâ `limit=100` tek istek (ORTA-3 leftover).
- Markers API 500 pin tavanı aynı.
- Admin listeleri kendi sayfalama; public helper’dan ayrı.
- FTS tablosu yoksa liste eski in-memory yola düşer.

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
