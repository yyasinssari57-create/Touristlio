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
- Admin panelde iletişim kutusu listesi **var** (`/admin` → İletişim sekmesi, `GET /api/admin/contact-messages`). SMTP hâlâ Yasin env.

## KRİTİK-7 (apex vs www) / v2 KRİTİK-4
- Tamamlandı: Express, yalnızca public host `touristlio.com` (apex) ise **301** → `https://www.touristlio.com` + aynı path/query. `www` ve diğer host’lar dokunulmaz. Localhost / `127.0.0.1` yönlendirilmez.
- Production’da `X-Forwarded-Proto: http` → **301 HTTPS** (aynı host; apex ise tek seferde www). `DISABLE_HTTPS_REDIRECT=true` ile kapatılır.
- Middleware `server/index.js` içinde helmet/cors/static’ten **önce**.
- KRİTİK-5 canonical www duruyor (`siteBaseUrl`, sitemap, `setCanonical`).
- **Döngü riski:** Cloudflare **www → apex** (Redirect www to root) açıksa + uygulama apex → www **ERR_TOO_MANY_REDIRECTS**. Cloudflare SSL **Full** (Flexible değil). Yön tek: apex → www.
- Acil kapatma: Render env `DISABLE_WWW_REDIRECT=true` (apex) / `DISABLE_HTTPS_REDIRECT=true` (HTTP).
- Render’da `SITE_URL` / `CORS_ORIGIN` = `https://www.touristlio.com`. Custom domain’e apex **ve** www eklenmeli.
- Canlı Cloudflare kurallarını Yasin’in panelinden doğrula (bu ortam CF’ye erişemez).
- `npm run verify:www`

## KRİTİK-6 (şifre) / v2 KRİTİK-3 (Argon2id)
- Tamamlandı: yeni şifreler **Argon2id** (`m=65536,t=3,p=1`). Eski bcrypt (`$2a$` / `$2b$`, cost 10 veya 12) girişte doğrulanır, sonra sessizce Argon2id’ye yükseltilir.
- AES hiçbir zaman kullanılmadı; `createCipher` yok. UI “AES-256” yazmıyor — “Güvenli şifreleme ile korunuyor”.
- JWT `tl_token` **HttpOnly** çerez (JSON body’de token yok). Süre 7 gün kaldı; 15 dakika oturumu yarıda keser.
- sameSite varsayılan `lax` (strict, e-posta doğrulama dönüşlerinde çerezi düşürebilir). `COOKIE_SAMESITE` ile değiştirilebilir.
- 8–11 karakterlik eski şifreler login’de geçerli; 12 karakter kuralı sadece kayıt / reset / şifre değiştir / moderatör oluşturma.
- Varsayılan `ADMIN_PASSWORD` (`ChangeMe123!`) 12 karakter; üretimde mutlaka `.env` ile değiştirilmeli.
- `argon2` native bağlama; Render build’de derlenir. bcryptjs yalnızca eski hash doğrulama için duruyor.
- `npm run verify:passwords`

## KRİTİK-7 sonrası leftover
- Canlıda `curl -I https://touristlio.com/places/ornek` → 301 Location `https://www.touristlio.com/places/ornek`.
- Cloudflare SSL Full + apex→www (veya CF 301 kapalı, sadece Express). www→apex kuralı olmamalı.
- Hetzner / VPS dokümanları hâlâ örnek olarak apex `https://touristlio.com` gösteriyor; canlı env www olmalı.
- `public/index.html` statik canonical www; SSR enjeksiyonu KRİTİK-5 ile aynı host.

## v2 KRİTİK-5 (KVKK placeholder)
- `public/legal/kvkk.html` veri sorumlusu satırı artık placeholder değil: şirket **yok**, proje gerçek kişi tarafından işletiliyor; başvuru/tebligat kanalı `touristlio.info@gmail.com`.
- Ticari unvan / adres **uydurulmadı**. Şirket kurulunca unvan + vergi + adres bu satıra eklenecek (tek satır düzenleme).
- Gerçek kişi adı bilinçli olarak yazılmadı (kişisel adres/isim yayınlamamak için). Yasin isterse eklenir.
- Saklama metni SQLite değil, Supabase PostgreSQL.
- privacy.html / terms.html’de TBD / güncellenecektir yok.
- Çerez: Reddet → `tl_cookie_ok=0` + `cookie_consent=rejected`. GA4 ve birinci taraf track yalnızca `accepted` / `1` iken.
- `npm run verify:legal`

## v2 KRİTİK-6 (CSP nonce)

- Tamamlandı: `script-src` artık `'unsafe-inline'` içermiyor. Her istekte rastgele nonce (`cspNonceMiddleware`), HTML gönderilirken inline `<script>` (JSON-LD dahil) o nonce’u alıyor.
- `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` eklendi.
- **Leftover:** `script-src-attr 'unsafe-inline'` duruyor. `index.html` / `admin.html` içinde ~220 `onclick`/`onchange`; nonce attribute’ları kapsamıyor. Ayrı refactor.
- `style-src` / `style-src-attr` hâlâ `'unsafe-inline'` (kritik CSS + admin `style=""`).
- Canlıda sorun: Render env `CSP_REPORT_ONLY=true` → engellemez, yalnızca raporlar. `CSP_FORCE=true` development’ta politikayı açar.
- `npm run verify:csp`

## v2 KRİTİK-7 (JSON-LD Schema.org)

- Tamamlandı (YÜKSEK-4 üzerine):
  - Ana sayfa HTML: **TravelAgency** + **WebSite** + **SearchAction** (`/explore?q={search_term_string}`).
  - TravelAgency açıklaması: “Sadece Ziyaret Etme. Hisset. Topluluk tabanlı seyahat rehberliği.”
  - `/places/:slug` sunucu HTML: **TouristAttraction** + **BreadcrumbList** (Ana Sayfa → ülke → mekân) + varsa **FAQPage** + Tiola **Review**.
  - `/blog/:slug` Article: `loadApprovedBlog` artık `await` (önce Promise kaçıyordu).
  - SPA JSON-LD script’lerine CSP nonce kopyalanır.
- `npm run verify:jsonld`

### Leftover
- `sameAs` Instagram **yok**: sitede/Instagram’da resmi `@touristlio` hesabı bulunamadı; uydurulmadı. Hesap açılınca Render `INSTAGRAM_URL` (ör. `https://www.instagram.com/HANDLE`) → TravelAgency `sameAs`.
- `addressCountry` ISO kod değil, DB’deki ülke adı (tabloda `country_code` yok).
- Ana sayfa ilk HTML’de Tiola Review yok (JS feed); crawler için asıl kaynak mekân URL’leri.
- `AggregateRating` yalnızca `tiolaCount > 0`.
- logo/url `SITE_URL` / `siteBaseUrl()` (www). Localhost curl’de origin localhost olabilir.

## v2 KRİTİK-8 (tek h1)

- Tamamlandı: logo metni artık `span`; ana sayfanın tek görünür `h1` başlığı “Sadece Ziyaret Etme. Hisset.”
- “Gezilecek Yerler” ve “Seyahat Hikayeleri” bölüm başlıkları `h2`.
- Mekân detayında `#pdTitle`, blog detayında `.bd-title` dinamik `h1`.
- Blog listeleme ve profil için ekran okuyucuya açık tek sayfa `h1` başlığı var.
- SPA ana sayfaları, alt sekmeler, mekân detay sekmeleri ve blog liste/detay geçişleri `hidden` + `aria-hidden` durumunu JS ile birlikte güncelliyor.
- Bağımsız HTML sayfalarının (arama, giriş, kayıt, yasal sayfalar, 404/500, admin, profil) her birinde tam bir `h1`.
- `npm run verify:h1`

## YÜKSEK-1 (hero görsel)

- Tamamlandı: `.hero .hbg` artık `/images/hero.webp` (cover + center); overlay `rgba(0,0,0,.4)`.
- Mevcut metin / şehir pill’leri taşınmadı; noktalı mesh görseli fotoğrafın üstünde bırakılmadı (HTML div duruyor).
- Repoda zaten `public/images/hero.webp` vardı (İstanbul / Galata, KRİTİK-5 OG). Denetimin önerdiği Unsplash flatlay (`photo-1488646953014`) ile **değiştirilmedi** — mevcut görsel markaya daha uygun.
- Slogan (“Sadece Ziyaret Etme. Hisset.”) v2 KRİTİK-8 ile hero içinde tek `h1`; navbar kopyası paragraf olarak duruyor.
- Mobilde `.hero { min-height: auto }` kısa kalabilir; cover/center yine geçerli.

## YÜKSEK-2 (harita)

- Tamamlandı: Leaflet + MarkerCluster `/public/vendor` altına alındı (unpkg SRI/CDN kırılınca `L` tanımsız kalıyordu).
- Harita, `display:none` sekmesinde 0 boyutla init edilmiyor; görünür olunca `invalidateSize` + ResizeObserver.
- Tüm mekânlar lat/lng: seed’de vardı; eksikler `ensurePlaceCoords` / migration backfill ile doldurulur. `GET /api/places/map/markers` her pin’de koordinat döner.
- Marker clustering (maxClusterRadius 50 / 48).
- Kategori/grup filtreleri harita pinleriyle senkron: `setExploreFilter` → `TL_MAP.setMapFilters` + markers API `category`/`group`.
- Görsel pin rengi, zoom konumu, OSM karoları aynı; layout’a dokunulmadı.

### Leftover
- Nominatim proxy yok; `GET /api/osm/search` artık **200 + boş `results`** (`enabled: false`). UI OSM araması çağırmaz; osmHint haritaya yönlendirir.
- Markers API en fazla 500 pin (clustering bunun için). 1090 yerin hepsi tek seferde çizilmez.
- OSM karoları `tile.openstreetmap.org` ayakta olmalı; offline/engelli ağda gri kutu.
- `unpkg.com` CSP’den çıkarıldı (Leaflet local vendor).
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

- Tamamlandı: sunucu HTML’e `application/ld+json` enjekte eder (Googlebot JS’siz görür). v2 KRİTİK-7 ile genişletildi.
  - Ana sayfa `/` ve `/en/` → **TravelAgency** + **WebSite** SearchAction.
  - `/places/:slug` → **TouristAttraction**, **BreadcrumbList**, varsa **FAQPage**. Tiola ortalaması varsa **AggregateRating**.
  - Her onaylı üst seviye Tiola → ayrı **Review**.
  - `/blog/:slug` → **Article**.
  - `/legal/contact.html` → **ContactPage**.
- SPA: `TouristDestination` → `TouristAttraction`; ana sayfa feed Review ekler; blog CollectionPage / Article.
- UI’da Google puanı yok; AggregateRating yalnızca mevcut Tiola yıldızlarıyla (kartlarda zaten görünen).

### Leftover
- Instagram `sameAs` yok (hesap doğrulanmadı). `INSTAGRAM_URL` ile eklenir.
- Tiola’ların kendi kanonik URL’si yok; Review mekân sayfasına bağlı.
- Ana sayfa ilk HTML’de Tiola Review yok (JS sonrası).
- `AggregateRating` yalnızca `tiolaCount > 0`.
- logo.webp Absolute URL `SITE_URL` / `siteBaseUrl()` (www).

## YÜKSEK-5 (ana sayfa istatistikleri)

- Tamamlandı: şerit artık `—` göstermiyor. İlk HTML `...` (yükleme); API null/undefined/hata → **0**.
- `GET /api/stats` ve `GET /api/places/stats` tam katalog sayıları döner: kapsanan ülke, listelenen yer (arşiv hariç), onaylı üst seviye **Tiola** (Google puanı yok).
- Değer gelince ease-out sayaç animasyonu; `prefers-reduced-motion` veya 0 ise anında yazılır.
- Üçüncü sütun artık "Tiola" yazısı değil, `id="stat-tiolas"` sayı alanı.
- `updateCategoryCounts` şeridi yüklü sayfa boyutuyla ezmiyor.

### Leftover
- Kategori kartlarındaki `cat-cnt-*` katalog `placeCount` kullanır (`0 yer` / `N yer`); em-dash yok.
- Public `GET /api/places` hâlâ taslak yerleri de sayabilir; şerit `status != archived` kullanır.
- İstatistik önbelleği 2 dk; Tiola onayında `refreshPlaceStatsForTiola` → `invalidateStatsCache` zaten çağrılır.
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
- Admin iletişim kutusu listesi eklendi (KRİTİK-3 leftover kapatıldı). SMTP hâlâ env.
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
- Discover (`gezilecek-yerler`) `page` + `limit=20` + “Daha Fazla Yükle” (keşfet grid ile aynı boyut).
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
- Discover (`gezilecek-yerler`) `page` + `limit=20` (ORTA-3 leftover kapatıldı).
- Markers API 500 pin tavanı aynı.
- Admin listeleri kendi sayfalama; public helper’dan ayrı.
- FTS tablosu yoksa liste eski in-memory yola düşer.

## ORTA-6 (blog sayfası)

- Tamamlandı: Express + statik HTML/JS (Next.js yok). Google puanı yok.
  - `GET /blog` ve `GET /en/blog` liste sayfası (`index.html` + SEO “Seyahat Hikayeleri”).
  - `GET /api/blogs` yalnızca `status = 'approved'` (`is_published = true` karşılığı); kart: başlık, kategori, yazar, tarih, özet, kapak.
  - `GET /blog/:slug` (KRİTİK-4) artık tam sayfa: overlay kalktı, `#blogArticle` içinde kapak + gövde + Article JSON-LD. Yayınlanmamış / bilinmeyen slug → 404.html.
  - SPA URL: `/blog`, `/blog/:slug` (eski `#blog` hash hâlâ okunur). Kartlar gerçek `<a href="/blog/slug">`.
- Sitemap’e `/blog` ve `/en/blog` eklendi.
- `npm run verify:blog`

### Leftover
- `/blog` hâlâ SPA (`index.html`); tam SSR makale gövdesi HTML’de yok (yerler gibi) — crawler Article JSON-LD + title görür, gövde JS sonrası.
- Eski `#blog` / `?tab=blog` linkleri çalışır; paylaşılabilir kanonik artık `/blog`.
- Overlay (modal) kaldırıldı; detay sayfa içi. Profil “yazılarım” bekleyen taslağı `/blog/:slug` ile açarsa sahip API’den görür, kamu 404.
- Blog listesinde sayfalama yok (ORTA-3 yalnızca mekân).
- Seed blog gövdesi excerpt ile aynı (kısa).

## ORTA-7 (kullanıcı sistemi)

- Tamamlandı: Express + statik HTML/JS (Next.js yok). Google puanı yok.
  - Login/register (SPA overlay + `/login` + `/register`) sunucu hata metnini satır içi gösterir (`{ success:false, error }`, şifre politikası, KVKK, yinelenen e-posta).
  - `GET /api/auth/me` girişsiz **200 `{ user: null }`** (ana sayfa “Giriş gerekli” toast’ı yok). JWT süresi dolmuş / geçersiz / şifre sonrası eski token → **401 `sessionExpired`** + `tl_token` çerezi silinir; istemci `setAuth(null)`.
  - Favori `POST/DELETE /api/places/:id/save` `saved_places` tablosuna yazılır; giriş sonrası kalpler API’den yenilenir.
  - `GET /api/auth/profile`: Tiola’lar, favoriler, gezilen ülkeler, rozetler. `/profile` ve SPA profil bunları gösterir.
  - Şifre unutma / sıfırlama: token 1 saat, kullanılmış token geçersiz; sıfırlama eski oturumu düşürür. Şifre değiştirince yeni JWT verilir (e-posta değişimi oturumu düşürmez).
  - E-posta doğrulama: `/verify-email?token=` + `POST /api/auth/verify-email`.
- `npm run verify:user-system`
- bcrypt cost 12 / min 12 karakter zayıflatılmadı.

### Leftover
- SMTP yoksa doğrulama / sıfırlama e-postası gitmez; token DB’de durur. Yasin `SMTP_*` yazmalı.
- Argon2id yok (KRİTİK-6 leftover); bcrypt cost 12.
- Çok cihazlı oturum listesi / “diğer cihazlardan çıkış” yok (tek JWT çerezi).
- `REQUIRE_EMAIL_VERIFICATION=true` olmadıkça doğrulanmamış hesap giriş yapabilir (kayıt sonrası cookie).
- `/profile` SPA’dan sade; blog yaz / bekleyenler sekmeleri yalnızca ana SPA profilde.
- Redis oturum deposu yok.

## DÜŞÜK-1 (mobil uyum)

- Tamamlandı: Express + statik CSS/JS (Next.js yok). Google puanı yok.
  - 320–480px: `overflow-x: clip`, grid `minmax(min(…,100%),1fr)`, form/hero/auth kutuları `max-width:100%`.
  - Butonlar: `.btn` / hamburger / sekmeler / sayfa numarası **min 48×48**. Chip/pill ve `.aclose` görsel kutuyu değiştirmeden `::after` isabet alanı.
  - `img,picture,video { max-width:100% }`.
  - Menü açıkken `html/body.nav-open { overflow:hidden }`; sekme / giriş / ≥901px resize menüyü kapatır.
  - Layout, renk, `border-radius` aynı.
- `npm run verify:mobile`

### Leftover
- Chip’lerde 48px isabet komşu pill’lerle örtüşebilir (görsel boyut bilinçli korunuyor).
- Admin hamburger yok; topnav yatay kaydırılır.
- Canlı 320px cihaz testi Yasin’in telefonunda doğrulanmalı.
- [DÜŞÜK-2] tamamlandı (bu PR).

## DÜŞÜK-2 (erişilebilirlik)

- Tamamlandı: Express + statik HTML/JS (Next.js yok). Google puanı yok.
  - Tüm kamu HTML görsellerinde açıklayıcı `alt` (logo Touristlio; kart/harita/keşfet mekân adı; avatar ad).
  - Form input'larına `<label>` (`for` veya saran label). Görünür tasarımı bozmamak için çoğu `.sr-only`; iletişim ve filtre etiketleri zaten görünür. Eksik kalanlar `a11y.js` ile eklenir.
  - İkon butonları `aria-label`: kapat, menü, favori, yıldız, dil.
  - Skip link "İçeriğe geç" / "Skip to content"; Tab ile görünür `:focus-visible` outline.
  - Tıklanabilir sekmeler/chip/pill'ler `<button>`; kalan `onclick` div'ler klavye (Enter/Space).
  - `--t3` `#8ba8c0` → `#5a7894` (küçük metin AA ~4.6:1).
- `npm run verify:a11y`

### Leftover
- Leaflet vendor PNG alt'ları dokunulmadı (harita kontrol ikonları).
- Admin tablolarında bazı dinamik hücre görselleri jenerik alt kullanır.
- Skip link odaklandığında navbar'ın üstünde; ilk Tab'da görünür.
- Canlı ekran okuyucu testi Yasin'de doğrulanmalı.

## DÜŞÜK-3 (skeleton loader)

- Tamamlandı: Express + statik CSS/JS (Next.js yok). Google puanı yok.
  - API süresince mekân kartı skeleton: keşfet `#pgrid`, arama `#searchGrid` (ilk yükleme + sayfa), arama dropdown, discover listesi, profil favori grid.
  - Buton spinner: form gönder (giriş, kayıt, iletişim, şifre sıfırla, Tiola, blog, arama, ayarlar) ve favori (`toggleSave` / `pc-save` / `pd-save`).
  - Skeleton paleti `--l2` / `--l` / brand-accent `#6EC6FF`; `prefers-reduced-motion` shimmer'ı kapatır.
  - `npm run verify:skeleton`

### Leftover
- Admin panel kendi `setBtnLoading` metnini kullanır; kamu skeleton.js'e bağlanmadı.
- Harita pin listesi skeleton değil (kart grid değil).
- Canlı yavaş ağda Yasin tarayıcıda shimmer/spinner'ı doğrulamalı.
- [DÜŞÜK-4] tamamlandı (bu PR).

## DÜŞÜK-4 (kırık linkler)

- Tamamlandı: Express + statik HTML/JS (Next.js yok). Google puanı yok.
  - Footer yasal linkleri tüm SPA sekmelerinde görünür (Keşfet dışına alındı).
  - Eski `/?place=id` kart linkleri `/places/:slug` (veya id). `/?place=` okuma hâlâ çalışır.
  - `href="#"` ölü çapa kaldırıldı (şifremi unuttum buton; Tiola giriş `/login`).
  - Eski kısa yollar: `/about` `/contact` `/privacy` `/terms` `/kvkk` ve `/legal/about` (uzantısız).
  - Bilinmeyen path artık yumuşak 200 SPA değil, özel **404** + "Ana sayfaya dön".
  - `npm run verify:links`

### Leftover
- `/?place=id` yer imleri hâlâ açılır (geriye dönük); yeni link üretilmez.
- Admin kılavuz `#guide-*` çapaları aynı sayfada; ayrı 404 değil.
- Canlıda eski Google taramalı URL'ler 404'e düşer — Search Console'da yeniden gönder.
- [DÜŞÜK-5] tamamlandı (bu PR).

## DÜŞÜK-5 (kod temizliği)

- Tamamlandı: Express + statik HTML/JS (Next.js yok). Google puanı yok.
  - Production'da `console.log` / `debug` / `info` no-op (`error-boundary.js` `silenceProdConsole`; `data-tl-dev=0`). `console.error` duruyor.
  - Kullanılmayan tek-seferlik dosyalar silindi: `server/extract-css.js`, `server/extract-places.js`, `server/build-html.js`, `_audit_git_out.js`, `public/images/_make-transparent.html` + `/api/dev/write-logo-transparent`.
  - CSS: tek `:root` (`--nav-h` birleşti), tek `.dual-rat` / `.dr.t`, ölü `.admin-wrap` / `.status-*` / `.photo-preview` kalktı; Inter font tek `@import`.
  - Ölü `normalizeCategorySlug` kopyası silindi; `slugify` `server/lib/slugify.js`.
  - `package.json` bağımlılıklarının hepsi kullanılıyor — silinecek paket yok.
  - `npm run verify:cleanup`

### Leftover
- İstemci `escapeHtml` hâlâ birden fazla dosyada (ekstra script etiketi istemedik).
- `console.warn` production'da açık (harita / kategori meta).
- CLI `verify:*` / seed script'leri `console.log` kullanmaya devam eder (tarayıcı değil).
- `inline-overrides.css` büyük; yalnızca `style.css` içindeki tekrarlar birleştirildi.
- `pino-pretty` yalnızca development transport.

## DÜŞÜK-6 (analitik ve izleme)

- Tamamlandı: Express + statik HTML/JS (Next.js yok). Google puanı yok.
  - Mevcut birinci taraf izleme duruyor: `tl_cookie_ok` + `POST /api/analytics/track` (page_view, tab_click, heartbeat, session_end). Onaysız `stored: false`.
  - **GA4:** `GA_MEASUREMENT_ID` (`G-XXXXXXXX`) varsa, yalnızca çerez kabulünden sonra `gtag.js` yüklenir. Anahtar yoksa Google script’i hiç yüklenmez. CSP host’ları yalnızca ID tanımlıyken açılır.
  - **Search Console:** `GOOGLE_SITE_VERIFICATION` doluysa HTML `google-site-verification` meta enjekte edilir (izleme çerezi değil; onay gerekmez). Token uydurulmadı.
  - **web-vitals 4.2.4:** `package.json` + `public/vendor/web-vitals/web-vitals.iife.js`. Onay sonrası CLS / INP / LCP / FCP / TTFB; birinci taraf `web_vital` + GA4 event.
  - Yasal / 404 / 500 / auth sayfalarına analytics + çerez bandı; admin paneli kamu izlemesine alınmadı.
  - `npm run verify:analytics`

### Leftover
- Canlıda GA4 **yok** (env boş). Yasin Google Analytics 4’te Measurement ID üretip Render/Hetzner’e `GA_MEASUREMENT_ID` yazmalı; aksi halde yalnızca birinci taraf (onaylı) analitik çalışır.
- Search Console HTML etiketi **yok**. Yasin Search Console’da URL-prefix (`https://www.touristlio.com`) doğrulama token’ını `GOOGLE_SITE_VERIFICATION` olarak yazmalı.
- CrUX / Search Console hız raporu Chrome kullanıcılarından gelir; `web-vitals` RUM’u onaylı oturumlarla sınırlı.
- Numaralı denetim maddeleri (KRİTİK → DÜŞÜK-6) bu maddeyle bitti. Kalan Yasin-only ops: env anahtarları, SMTP, Render, Cloudflare, GA4, reCAPTCHA, stacked PR merge.

## Genel
- Görevler bitince bu listedeki her maddeyi sırayla açıp kapat.
- Tam denetim kopyası: `/workspace/touristlio_cursor_audit.md`
