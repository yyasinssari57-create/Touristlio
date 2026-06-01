# Touristlio

Global seyahat keşif platformu — **yalnızca Tiola** (topluluk puanı ve yorumları). Google puanı veya harici yorumlar **gösterilmez**.

**Domain:** [touristlio.com](https://touristlio.com) (Cloudflare) — DNS/VPS sonraki aşama. Geliştirme: `localhost`.

## Hızlı başlangıç (Windows)

```powershell
cd C:\Users\Yasin\Projects\touristlio
npm install
npm run places:merge   # Tüm destinasyonlar (500 üst sınır kaldırıldı), Google alanları JSON'da yok
npm run seed
npm start
```

- **Site:** http://localhost:3000  
- **Admin:** http://localhost:3000/admin  

## Admin (.env)

`.env` dosyasını `.env.example` üzerinden oluşturun:

| Değişken | Açıklama |
|----------|----------|
| `ADMIN_EMAIL` | Admin e-postası |
| `ADMIN_PASSWORD` | Güçlü şifre (`ChangeMe123!` kullanmayın) |
| `ADMIN_NAME` | Görünen ad |
| `JWT_SECRET` | Uzun rastgele dize |

## Özellikler

- **400–500 destinasyon** — TR + global, alias arama (`Istanbul` / `İstanbul`)
- **Google yok** — Google puanı/yorumu ne arayüzde gösterilir ne de export'a (`places.json`) yazılır; veritabanında `google_*` alanları `NULL`
- **Siyah navbar** — `icon.svg` ikon (siyah T+pin rozeti) + beyaz Touristlio, TR/EN, Keşfet / Blog / Profil; admin paneli de aynı `tl-nav`'ı kullanır
- **Tiola** — isteğe bağlı yıldız, metin, foto; moderasyon sonrası yayın
- **Puan** — sadece onaylı Tiola yıldızlarından Touristlio puanı
- **OSM** — footer attribution; `/api/osm/search` VPS sonrası (şimdilik iskelet)
- **Admin** — Tiola/blog onay, yeni yer, moderatör ekleme

## Logo

- Navbar ikon: `public/images/icon.svg` (T + pin)
- Tam logo PNG (isteğe bağlı): `public/images/logo.png` ← `Desktop\touristlio-logo.png`

## Yer verisi

**Google puanı yok** — `places.json` ve arayüzde yalnızca Touristlio / Tiola puanları gösterilir. `google_rating` / `google_count` alanları export edilmez; seed sırasında NULL yazılır.

| Komut | Açıklama |
|-------|----------|
| `npm run places:merge` | `build-places-500.js` — batch3–5 birleştirir, **üst sınır yok** (700+ hedef), Google alanları silinir |
| `npm run places:fix-images` | Bozuk/tekrarlayan görselleri photo-pool ile düzeltir |
| `npm run seed` | `places.json` → SQLite |
| `npm run logo:extract` | `public/images/logo.png` (veya Desktop / `touristlio7c.html`) → `icon.svg` + `icon-white.svg` (üst T+pin kırpımı, invert yok) |
| `npm run places:run-all` | logo:extract + places:merge + seed (tek komut) |

### places:merge akışı

1. Mevcut `server/data/places.json` zenginleştirilir (batch3/4/5 + global extra).
2. Google alanları (`googleRating`, `googleCount`) kaldırılır.
3. Hedef **400–500** yer — fazlası kesilir.
4. `photo-pool.js` ile `imageUrl` dağıtılır (tekrarlar minimize edilir).
5. `server/data/merge-stats.json` — yer sayısı ve duplicate URL özeti.

Merge sonrası kontrol:

```powershell
npm run places:merge
npm run seed
# merge-stats.json → count, duplicateUrls
```

### Toplu import (uzun vade)

`server/data/import/places.csv` veya GeoJSON + `import-places.js` (planlı).

## OpenStreetMap

1. Şimdi: Touristlio DB + alias arama; footer © OSM.  
2. VPS: Nominatim proxy → `/api/osm/search` (max 1 req/s, cache, [ToS](https://operations.osmfoundation.org/policies/nominatim/)).

## Proje yapısı

```
touristlio/
├── server/scripts/   # build-places-500.js, places-batch3/4, photo-pool.js
├── server/data/places.json
├── public/images/    # icon.svg, logo.png
└── data/touristlio.db
```
