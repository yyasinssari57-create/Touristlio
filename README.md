# Touristlio

Global seyahat keşif platformu — **yalnızca Tiola** (topluluk puanı ve yorumları). Google puanı veya harici yorumlar **gösterilmez**.

**Domain:** [touristlio.com](https://touristlio.com) — geliştirme: `localhost`.

## Hızlı başlangıç (Windows)

```powershell
cd C:\Users\Yasin\Projects\touristlio
npm install
copy .env.example .env
npm run places:merge    # places.json — 800+ destinasyon
npm run places:enrich   # TR/EN içerik alanları
npm run seed            # SQLite
npm run places:validate # doğrulama
npm run sitemap         # public/sitemap.xml
npm start
```

- **Site:** http://localhost:3000  
- **Admin:** http://localhost:3000/admin  
- **Giriş/Kayıt:** `/login` · `/register` · `/profile`  
- **Derin link:** `/?place=1`

## Admin (.env)

| Değişken | Açıklama |
|----------|----------|
| `ADMIN_EMAIL` | Admin e-postası |
| `ADMIN_PASSWORD` | Güçlü şifre |
| `JWT_SECRET` | Uzun rastgele dize |
| `CORS_ORIGIN` | İzin verilen origin(ler) |
| `UNSPLASH_ACCESS_KEY` | İsteğe bağlı fotoğraf fetch |

## Mimari (v1.2)

```
touristlio/
├── server/
│   ├── index.js              # Express + helmet + rate-limit + pino
│   ├── middleware/rateLimit.js
│   ├── lib/cache.js          # 5 dk TTL
│   ├── lib/unsplash.js       # photos[] fetch
│   ├── routes/places.js      # pagination, /search, cache
│   └── data/places.json      # Tek kaynak
├── public/
│   ├── js/app.js             # lazy load, Load More, Map tab
│   ├── login.html register.html profile.html
│   └── legal/                # about, contact, privacy, kvkk, terms
└── data/touristlio.db
```

## Özellikler (v1.2)

- **800+ destinasyon** — history, overview, thingsToDo, cuisine, travelTips, bestTime, howToGetThere (TR+EN)
- **Güvenlik** — helmet, express-rate-limit, express-validator, sıkı CORS
- **Ana sayfa** — 100vh hero, debounced `/api/places/search`, ilk yüklemede kart yok, 12'li sayfalama + Load More
- **photos[]** — Unsplash script, detay galeri 5 thumb, admin çoklu upload
- **JWT httpOnly cookie** + Bearer (saved_places = favoriler)
- **Cache** — 5 dk TTL liste/arama
- **SEO** — dinamik title/meta/OG/canonical, tam sitemap
- **KVKK** — çerez banner, yasal sayfalar
- **Admin** — dashboard, moderasyon, kullanıcı listesi, lat/lng, foto upload

## Yer verisi komutları

| Komut | Açıklama |
|-------|----------|
| `npm run places:merge` | Batch birleştirme → places.json |
| `npm run places:enrich` | İçerik alanlarını doldur |
| `npm run places:fetch-photos` | Unsplash → photos[] (API key gerekli) |
| `npm run places:validate` | Şema/count doğrulama (min 800) |
| `npm run seed` | places.json → SQLite |
| `npm run sitemap` | sitemap.xml |

## Güvenlik (v2.2)

- Production: `JWT_SECRET` zorunlu (32+ karakter), Helmet CSP, API hata maskeleme
- Dev logo endpoint yalnızca `NODE_ENV !== production`
- Admin moderasyon: `escapeHtml`, Tiola spam filtresi (`spam` / `pending` ayrı sayaç)
- `safeUrl()` blog/yer görselleri; admin araçları `spawnSync` + rate limit

## API (v2.2)

| Yol | Açıklama |
|-----|----------|
| `/api/trip-plans` | Gezi planları API (UI sekmesi yok; navbar değişmez) |
| `/api/travel-lists/public/:token` | Herkese açık liste |
| `/api/travel-lists/:id/publish` | Liste yayınla + share token |

## E-posta (SMTP)

`.env` içinde `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` tanımlanırsa kayıt doğrulama ve şifre sıfırlama e-postası gönderilir; aksi halde yalnızca log.

## v2.1 (ertelenen)

- Affiliate gerçek partner API entegrasyonu
- jsPDF tam PDF export (şu an print CSS)
- PostgreSQL, Nominatim geocoding proxy
- OSM canlı arama (VPS sonrası)

## Touristlio V2 — Profesyonel Seviye Geliştirme Paketi

### Faz A — Temel
- JSON-LD: TouristDestination, BreadcrumbList, FAQPage (detay sayfası)
- Toast sistemi (`public/js/toast.js`) — giriş, favori, Tiola, hatalar
- Skeleton shimmer yükleyiciler (`public/js/skeleton.js`)
- FAQ TR/EN — `place-content.js` + `enrich-content.js` (min 5 SSS/yer)
- Detay: SSS accordion, yakın yerler (Haversine, ülke önceliği, 6 kart), benzer yerler (6)

### Faz B — Harita
- Leaflet MarkerCluster (CDN)
- Harita sekmesinde arama + kategori filtreleri
- Kullanıcı konumu işaretçisi (izin ile)

### Faz C — Kullanıcı
- `travel_lists`, `travel_list_items`, `visited_places` tabloları
- `/api/travel-lists` — listeler + ziyaret istatistikleri
- Profil: Gezi Planlarım, Ziyaret Ettiklerim sekmeleri

### Faz D — Detay zenginleştirme
- Open-Meteo hava widget (önbellekli, fallback)
- Yerel saat + para birimi + TRY giriş tahmini
- Affiliate placeholder (`AFFILIATE_ENABLED=false` → UI gizli)

### Faz E — Auth güvenlik
- Şifre sıfırlama token + forgot/reset API (e-posta konsol stub)
- E-posta doğrulama bayrağı
- 5 başarısız girişte 15 dk kilit

### Faz F — Admin OS
- RBAC: roles, permissions, `checkPermission`
- Dashboard genişletildi, içerik kalite raporu
- Sistem araçları: cache clear, sitemap, validate
- Moderasyon risk skoru heuristiği

### Faz G — Arama sayfası
- `/search?q=` — filtreler, sayfalama, SEO title, paylaşılabilir URL

### Faz H — Gezi Planlayıcı Pro
- `trip_plans`, `trip_plan_days`, `trip_plan_items`
- `/trip-planner.html` — sihirbaz, DnD program, harita rotası
- Otomatik plan, kaydet/güncelle, paylaşım linki, print CSS

### Faz I — Canlı Veri
- `place_live_data` + `liveDataService.js`
- `GET /api/live-data/:placeId` — asla boş dönmez (tahmini fallback)
- node-cron 6 saatte bir yenileme

### V2 komutları

```powershell
cd C:\Users\Yasin\Projects\touristlio
npm install
npm run places:merge
npm run places:enrich
npm run seed
npm run live-data:refresh
npm start
```

- **Arama:** http://localhost:3000/search?q=istanbul
- **Gezi Planlayıcı:** http://localhost:3000/trip-planner

## v2 (ertelenen — eski liste)

- 1000+ destinasyon tam doldurma (şu an 800+ yapı hazır, validate min 800)
- Unsplash otomatik fetch CI pipeline
- Nominatim geocoding proxy
- Rich-text CMS, e-posta doğrulama
- PostgreSQL / ayrık API katmanı
