# Touristlio

Global seyahat keşif platformu — **yalnızca Tiola** (topluluk puanı ve yorumları). Google puanı veya harici yorumlar **gösterilmez**.

**Domain:** [touristlio.com](https://touristlio.com) (Cloudflare) — DNS/VPS sonraki aşama. Geliştirme: `localhost`.

## Hızlı başlangıç (Windows)

```powershell
cd C:\Users\Yasin\Projects\touristlio
npm install
npm run places:merge   # places.json — zengin içerik, koordinatlar, çoklu kategori
npm run seed           # SQLite
npm run sitemap        # public/sitemap.xml (isteğe bağlı)
npm start
```

- **Site:** http://localhost:3000  
- **Admin:** http://localhost:3000/admin  
- **Derin link:** `/?place=1` (detay sayfası)

## Admin (.env)

`.env` dosyasını `.env.example` üzerinden oluşturun:

| Değişken | Açıklama |
|----------|----------|
| `ADMIN_EMAIL` | Admin e-postası |
| `ADMIN_PASSWORD` | Güçlü şifre |
| `ADMIN_NAME` | Görünen ad |
| `JWT_SECRET` | Uzun rastgele dize |

## Mimari (v1.1)

```
touristlio/
├── server/
│   ├── index.js              # Express giriş
│   ├── db.js                 # SQLite şema + migration
│   ├── seed.js               # places.json → DB
│   ├── lib/
│   │   ├── place-content.js  # Bölüm metinleri, kategori grupları
│   │   ├── place-map.js      # API DTO
│   │   └── city-coords.js    # Leaflet koordinatları
│   ├── routes/
│   │   ├── places.js         # REST: liste, detay, harita, filtre
│   │   ├── admin.js          # Moderasyon + CMS yer ekleme
│   │   └── ...
│   └── data/places.json      # Tek kaynak (UI'da hardcoded liste yok)
├── public/
│   ├── js/i18n.js            # TR/EN — data-i18n anında geçiş
│   ├── js/map.js             # Leaflet + OpenStreetMap
│   ├── js/app.js             # Keşfet, detay, filtreler
│   ├── robots.txt
│   └── sitemap.xml
└── data/touristlio.db
```

## Özellikler

- **700+ destinasyon** — TR + EN içerik bölümleri: genel bakış, tarihçe, yapılacaklar, kültür/yemek, seyahat ipuçları
- **TR/EN** — Navbar dil anahtarı tüm UI + yer içeriğini anında değiştirir (`descriptionEn`, `overviewEn`, …)
- **Leaflet + OSM** — Keşfet haritası ve detay yan panel; kategoriye göre renkli işaretler, popup önizleme
- **Gelişmiş filtreler** — Tarihi, doğa, müze, yeme-içme, otel, aktivite grupları + legacy kategori şeridi
- **Sıralama** — Popülerlik, Tiola puanı, Tiola sayısı, yerel seçim, A→Z
- **SEO** — Meta/OG etiketleri, `robots.txt`, `sitemap.xml`, semantik detay bölümleri
- **Tiola** — moderasyon, sahte oy koruması
- **Google yok** — Ne JSON'da ne arayüzde Google puanı

## Yer verisi komutları

| Komut | Açıklama |
|-------|----------|
| `npm run places:merge` | `build-places-500.js` — batch birleştirme, içerik zenginleştirme, lat/lng |
| `npm run seed` | `places.json` → SQLite (yeni kolonlar) |
| `npm run places:fix-images` | Bozuk görselleri düzelt |
| `npm run sitemap` | `public/sitemap.xml` üret |
| `npm run places:run-all` | merge + seed |

Merge sonrası:

```powershell
npm run places:merge
npm run seed
npm run sitemap
```

## Görseller ve performans

- Kart ve detay görsellerinde `loading="lazy"`
- İsteğe bağlı WebP: Unsplash URL'lerine `&fm=webp` eklenebilir (CDN destekliyorsa); üretimde `imageUrl` pool güncellemesi yeterli

## OpenStreetMap

Footer attribution. Harita karoları: `tile.openstreetmap.org`. VPS sonrası Nominatim proxy (`/api/osm/search`).

## v2 (plan)

- Tam adres geocoding (Nominatim), otel kategorisi veri genişletmesi
- Rich-text CMS, çoklu fotoğraf yükleme
- Node API ayrımı + isteğe bağlı PostgreSQL
