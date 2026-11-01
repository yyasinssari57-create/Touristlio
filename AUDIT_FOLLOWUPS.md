# Touristlio — denetim sonrası kontrol listesi

Tüm KRİTİK / sonraki maddeler bitince bunları tek tek doğrula ve düzelt.

## Claude Master PRD — FAZ3-3 (Veritabanı index'leri)

Claude Master PRD "FAZ 3 — Teknik SEO" → [FAZ3-3] Veritabanı Index'leri
(Supabase SQL). PRD, SQL editöründe `places` / `tiola` / `blog_posts` /
`favorites` üzerinde şu index'leri istiyor: yayın durumu, slug, şehir+kategori,
puan, onaylı Tiola, kullanıcı, tekil oy, blog slug, yayın tarihi, e-posta,
favori, Türkçe GIN. Bu depo o tablo ve sütun adlarını kullanmıyor
(`verification_status`, `deleted_at`, `city_slug`, `avg_score`, `name_tr`,
`is_published` yok). Karşılıklar gerçek şemaya göre kontrol edildi. Görünen
sayfa, renk ve yerleşim değişmedi. FAZ3-4 (arama noindex) ve FAZ3-5 (sitemap
filtresi) yok.

### Zaten vardı (PRD adı → gerçek index)

- `idx_places_status` → `places(status)` (`migrations.js`). `deleted_at` yok;
  yayında olmayan mekân `draft` / `archived`.
- `idx_places_slug` → `places(slug)`.
- `idx_places_city_cat` → birebir sütun yok. Liste `LOWER(city) LIKE '%…%'`
  (başta joker) kullandığı için yeni bir `(city, category)` btree seçilmez.
  `idx_places_country_city_score`, `_lc` ve `idx_places_category_published`
  (008) duruyor.
- `idx_places_score` sütun hali → `idx_places_tiola_rating`. Canlı sıralama
  `COALESCE(tiola_rating, 0)` olduğu için bu tek başına yetmiyordu (aşağıda).
- `idx_tiola_place_approved` geniş hali → `idx_tiolas_place (place_id, status)`.
  Üst seviye + `created_at` sırası yoktu (aşağıda).
- `idx_tiola_user` → `idx_tiolas_user_place_month (user_id, place_id, created_at)`
  sol önek.
- Tekil oy → `idx_tiolas_unique_user_place_vote` (007), kısmi: yalnızca yıldız
  oyu. Tam `UNIQUE (user_id, place_id)` eklenmedi — yanıt ve birden fazla metin
  Tiola'sı bozulur. PRD'deki `ADD CONSTRAINT IF NOT EXISTS` de PostgreSQL'de
  geçerli değil.
- `idx_blog_slug` → `idx_blogs_slug`.
- `idx_blog_published` geniş hali → `idx_blogs_status (status, created_at)`.
  Liste `featured` + `COALESCE(published_at, created_at)` sıralıyor (aşağıda).
- `idx_users_email` → `users.email UNIQUE`.
- `idx_favorites_user` → `saved_places` birincil anahtarı `(user_id, place_id)`.
- Türkçe GIN `name_tr/description_tr/city_tr` → sütunlar yok.
  `idx_places_search_tsv` GIN (002) `name`, `location`, `country`, `city`,
  `district`, `search_aliases` üzerinde. Vektöre açıklama eklemek arama
  sonucunu değiştirir; bu turda yapılmadı.

### Bu turda eklenenler (`012_faz3_3_indexes`, sunucu açılınca)

- `idx_places_score` — `(COALESCE(tiola_rating, 0) DESC, id DESC)`. Varsayılan
  mekân listesi sıralaması.
- `idx_tiolas_place_approved` — `(place_id, created_at DESC)` yalnızca
  `status = 'approved' AND parent_id IS NULL`. Mekân sayfasındaki Tiola listesi.
- `idx_blogs_published` — `(featured DESC, COALESCE(published_at, created_at) DESC)`
  yalnızca `status = 'approved'`. Herkese açık blog listesi.

### Kapsam dışı

- FAZ3-4 arama sayfası noindex/canonical, FAZ3-5 sitemap filtresi, FAZ4 — yok.
- Arama metni (hangi alanlar eşleşir) değişmedi.

Doğrulama: `npm run verify:faz3-3` ve `npm run verify:indexes`.

## Claude Master PRD — FAZ3-2 (Dinamik SEO meta şablonu)

Claude Master PRD "FAZ 3 — Teknik SEO" → [FAZ3-2] Dinamik SEO Meta Template
Engine. PRD `server/lib/seo.js` içinde `generateMeta(type, data, locale)` ve
EJS `head` partial'ı istiyor (title, description ≤160, canonical, Open Graph,
Twitter card, robots, hreflang). Bu depo EJS kullanmıyor; meta zaten
`buildSeoHead()` + `injectSeoHead()` ile statik HTML'e yazılıyordu (v2
YÜKSEK-4). Bu tur şablonları tek fonksiyonda topladı ve gerçek boşlukları
kapattı. Görünen sayfa metni, renk ve yerleşim değişmedi. JSON-LD'ye
(FAZ3-1) dokunulmadı.

### Zaten vardı

- Canonical (`https://www.touristlio.com`), hreflang tr/en/x-default, robots,
  og:title/description/image/url/type/locale, twitter:card
  `summary_large_image` — `buildSeoHead()`.
- Mekân ve blog açıklaması 160 karakterde kesiliyordu.
- Varsayılan görsel `/images/hero.webp`.
- Giriş/kayıt/profil `noindex` ve bu sayfalarda hreflang yok.

### Kapatılan boşluklar

- **Ana sayfa başlığı** hâlâ sloganı kullanıyordu (`Sadece Ziyaret Etme.
  Hisset.`). PRD şablonu: `Touristlio — Gerçek Gezginlerle Dünyayı Keşfet` /
  EN `Discover the World with Real Travelers`. Açıklamadaki **135 ülke** ve
  **1.090+ destinasyon** `places.json` ile sayıldı (1090 yer, 135 ülke) —
  uydurma sayı yok. Ekrandaki hero sloganı duruyor.
- **`/explore`** ana sayfa meta'sını miras alıyordu. Artık ayrı keşif şablonu
  (TR/EN). `/gezilecek-yerler` ve `/blog` liste başlıkları aynı kaldı.
- **Mekân başlığı** `Ad — Touristlio` idi. Şehir varsa:
  `Ad | Şehir Gezilecek Yerler — Touristlio` / EN
  `Name | Things to Do in City — Touristlio`. Şehir yoksa eski kısa biçim.
- **Blog yazısı** son eki `— Touristlio Blog`. Özetten HTML etiketleri
  çıkarılıyor.
- **SPA `TL_I18N.apply()`** her sayfada (mekân, blog, giriş, yasal sayfalar)
  başlığı ana sayfa sloganına çeviriyordu. SSS akordeonu mekân sayfasında
  bunu sunucu başlığının ÜSTÜNE tekrar yazıyordu. Artık yalnızca kabuk
  rotaları (`/`, `/explore`, `/gezilecek-yerler`, `/blog` listesi) kendi
  şablonunu yazar; mekân/blog/giriş başlığı ezilmez. Sekme değişince doğru
  kabuk başlığı geri gelir.

### Bilinçli olarak yapılmayanlar

- FAZ3-3 veritabanı index'leri, FAZ3-4 arama sayfası noindex/canonical,
  FAZ3-5 sitemap filtresi, FAZ4 — yok. `/search` hâlâ `index,follow`.
- JSON-LD üreticileri değişmedi.
- Canonical'ın istemcide `/explore` → `/` çekilmesi (eski SPA davranışı)
  FAZ3-4 kapsamı; bu turda canonical kuralları değişmedi.

Doğrulama: `npm run verify:faz3-2` ve `npm run verify:og`.

## Claude Master PRD — FAZ3-1 (Dinamik JSON-LD)

Claude Master PRD "FAZ 3 — Gelişmiş Teknik SEO" → [FAZ3-1] Dinamik JSON-LD
Schema. PRD'nin illüstratif metni `server/lib/schema.js` (`generatePlaceSchema`,
`generateBlogSchema`, `generateHomeSchema`) + bir EJS head partial öneriyor; bu
depo EJS/template kullanmıyor — gerçek implementasyon `server/lib/jsonld.js`
(builder fonksiyonları) + `server/lib/seo.js`'in `injectSeoHead()` fonksiyonu
(üretilen statik HTML'e doğrudan string enjeksiyonu). Önceki kapsamlı denetimde
bu zaten "TAMAMLANDI" listesine girmişti ve PRD'nin istediğinden daha kapsamlı
olduğu doğru çıktı (BreadcrumbList + FAQPage + Review de var, PRD'de bunlar yok).
Bu PR o değerlendirmeyi PRD'nin tam kontrol listesine karşı doğruladı ve **iki
gerçek hata** buldu + düzeltti: `(0,0)` koordinatının `geo` olarak yazılması,
ve SPA'nın İngilizce blog makalesinde sunucunun doğru `Article` bloğunu yanlış
URL ile ezmesi.

### Kontrol listesi — PRD'nin istediği 3 sayfa tipi, hepsi server-side mi?

| Sayfa | JSON-LD tipleri | Nereden enjekte ediliyor | Server-side mi? |
|---|---|---|---|
| Ana sayfa (`/`, `/explore`) | `TravelAgency` + `WebSite`+`SearchAction` (ayrı objeler) | `server/index.js` `app.get('/')` → `sendPublicHtml` → `autoJsonLd()` → `jsonLdForHome()` | ✅ evet, `curl` ile doğrulandı |
| Mekân detay (`/places/:slug`) | `TouristAttraction` (+ `BreadcrumbList`, `FAQPage`, `Review[]` — PRD'nin istemediği ekstralar) | `server/index.js` `app.get('/places/:slug')` → `jsonLdForPlace()` | ✅ evet, `curl` ile doğrulandı |
| Blog detay (`/blog/:slug`) | `Article` | `server/index.js` `app.get('/blog/:slug')` → `jsonLdForBlog()` | ✅ evet, `curl` ile doğrulandı (TR + EN) |

Üçü de `server/lib/seo.js`'in `injectSeoHead()`'i üzerinden, yanıt `res.send()`
edilmeden ÖNCE `</head>`'e `<script type="application/ld+json">` olarak
yazılıyor — yani arama motoru taraycısı JS çalıştırmasa bile ilk HTML yanıtında
JSON-LD zaten var. Client-side JS (`public/js/app.js`) hiçbir zaman bunun
YERİNE geçen "tek kaynak" değil; aşağıda ayrıca ele alındı.

### Koşullu alanlar — PRD'nin 2 net kuralı

**1) `aggregateRating` — SADECE gerçek Tiola varsa.** `touristAttraction()`
(`server/lib/jsonld.js`) `tiolaCount > 0 && tiolaRating > 0` değilse bu alanı
hiç eklemiyor (`compact()` ile `undefined` alanlar JSON'dan tamamen çıkıyor —
`"aggregateRating": null` gibi yarı-dolu bir alan da kalmıyor). Canlı doğrulama:
`verify:faz3-1` script'i, test veritabanında gerçek 125 onaylı Tiola'sı olan bir
mekânda `aggregateRating` VAR, hiç Tiola'sı olmayan `ayasofya-istanbul`'da YOK
olduğunu `GET /places/...` yanıtının gerçek HTML'inden parse ederek doğruluyor.
Bu zaten doğruydu — değişiklik yapılmadı.

**2) `geo` — SADECE lat/lng gerçek ve sıfır olmayan değerlerse.** Burada
**gerçek bir hata bulundu ve düzeltildi**:

- Önceki kod sadece `lat != null && lng != null && Number.isFinite(...)`
  kontrol ediyordu — `(0, 0)` ("Null Island", gerçek bir koordinat değil, boş/
  eksik veri placeholder'ı) için de `geo` alanını ekliyordu.
- Bu TEORİK bir kenar durum değil: canlı test veritabanında (`faz2-4` test
  verisi kalıntısı, id 9990001-9990003) **gerçekten lat=0, lng=0 olan 3 satır**
  bulundu — ve bu depo zaten başka bir yerde (`server/lib/sitemap.js`,
  `isValidSitemapCoord()`, yorum: *"(0,0) is Null Island"*) bu kuralı sitemap
  için doğru uyguluyordu. `jsonld.js` bu paylaşılan korumayı kullanmıyordu.
- **Düzeltme:** `server/lib/jsonld.js`'teki `touristAttraction()`, artık
  `sitemap.js`'teki aynı `isValidSitemapCoord(lat, lng)` fonksiyonunu
  kullanıyor (yeni bir kural icat edilmedi, var olan kanıtlanmış kural yeniden
  kullanıldı). Client-side eşdeğeri (`public/js/app.js` `injectPlaceJsonLd()`)
  de aynı `(0,0)` + sınır (±90/±180) kontrolünü alıyor, böylece sunucu ve SPA
  birbiriyle tutarlı kalıyor.
- Canlı doğrulama: `verify:faz3-1`, lat=0/lng=0 olan gerçek bir satırda
  `GET /places/...` yanıtının HTML'inde `geo` alanının artık HİÇ olmadığını
  teyit ediyor; gerçek koordinatlı bir mekânda (`ayasofya-istanbul`,
  41.0/28.98) `geo`'nun normal şekilde var olduğunu da ayrıca doğruluyor.

### SPA client-side navigasyon — iki gerçek hata bulundu, ikisi de düzeltildi

Bu bir SPA (`history.pushState`, `public/js/app.js`). Her doğrudan URL isteği
(Google'ın sayfayı ilk indirdiği HTML) sunucuda doğru JSON-LD alıyor. Sayfa
JS çalışınca `setJsonLdBlocks()` sunucunun `<script data-tl-jsonld>` etiketini
silip kendi ürettiği blokla değiştiriyor. Çift/çakışan iki blok kalmıyor.
Mekân sayfasında bu değiştirme doğru mekâna güncelleniyor (`openDetail` →
`injectPlaceJsonLd`). Asıl hata blog makalesindeydi:

1. **EN makale URL'si ve dili düşüyordu.** `articleJsonLd()` adresi her zaman
   `/blog/...` yazıyordu; `/en` önekini ve `inLanguage` alanını koymuyordu.
   `/en/blog/:slug` açılınca sunucunun doğru `Article` bloğu (url `/en/blog/...`,
   `inLanguage: "en"`) silinip yerine Türkçe URL'li, dilsiz bir `Article`
   konuyordu. JS çalıştıran tarayıcı son DOM'da yanlış kanonik görürdü.
   Düzeltme: istemci de `blogPublicPath()` kullanıyor (mekân sayfasındaki
   `placePublicPath()` ile aynı kural) ve `inLanguage` ekliyor.
2. **Makale açılırken ara adımda şema `CollectionPage` oluyordu.**
   `showMainTab('blog')`, makale verisi gelmeden sunucu `Article` bloğunu
   liste şemasıyla değiştiriyordu. Geri yükleme yolunda (`/blog/:slug` ilk
   açılış) bu silme artık yapılmıyor; `openBlogDetail` doğru `Article`'ı
   yazıyor. İstek başarısız olursa liste şeması o zaman konuyor.

İki paralel üretici (`jsonld.js` + `app.js`) hâlâ duruyor — bu bir kod
tekrarı, FAZ3-1'de birleştirilmedi. Aynı kuralları uyguluyorlar (geo
`(0,0)` koruması dahil) ve aynı sayfada iki ayrı blok bırakmıyorlar.

### Ekstra inceleme — FAQPage / Review (PRD'de yok, ama aynı yüzey)

- **FAQPage:** Görünür SSS akordeonu (`renderFaqAccordion`) VE JSON-LD'nin
  `faqPage()`'i TAM OLARAK aynı veri kaynağından (`place.faqTR`/`faqEN`,
  `q`/`a` alanları) besleniyor — ayrı, bağımsız bir metin üretimi yok. Yani
  Google'ın "FAQPage markup görünür metinle eşleşmeli" kuralı, tasarım
  itibariyle (single-source) zaten sağlanıyor. Değişiklik gerekmedi.
- **Review:** JSON-LD'deki `reviewBody`/`reviewRating`/`author.name`,
  gösterilen Tiola kartlarıyla (`renderTiolaCard`/`renderRevList`) birebir
  aynı alanlardan (`tiola.text`, `tiola.stars`, `tiola.userName`) geliyor, ve
  sadece onaylı + üst seviye (yanıt değil) Tiola'lar dahil ediliyor — uydurma
  içerik yok. Değişiklik gerekmedi.

### Localizasyon (TR/EN)

`touristAttraction()` ve `articleSchema()` `lang` parametresi alıyor;
mekân açıklaması `descriptionEn`/`overviewEn` (varsa) kullanıyor, `Article`'ın
`inLanguage` alanı `tr`/`en` arasında değişiyor — `verify:faz3-1` bunu hem TR
hem EN için canlı `GET /blog/:slug` ve `/en/blog/:slug` üzerinden doğruluyor.
(`TravelAgency`/`WebSite` marka adı ve sloganı kasıtlı olarak her iki dilde de
Türkçe kalıyor — bu bir çeviri eksikliği değil, mevcut marka kararı; bu PR'da
dokunulmadı.)

### Değişen dosyalar

- `server/lib/jsonld.js` — `touristAttraction()`'daki `geo` koşulu artık
  `server/lib/sitemap.js`'teki `isValidSitemapCoord()`'u kullanıyor (yeni satır
  sayısı: 1 import + koşul değişikliği; görünür hiçbir UI/metin değişmedi).
- `public/js/app.js` — (a) `injectPlaceJsonLd()` geo koşulu sunucuyla aynı
  `(0,0)` + sınır kontrolü; (b) `articleJsonLd()` artık `blogPublicPath()` ve
  `inLanguage` kullanıyor; (c) blog makalesi geri yüklenirken sunucu `Article`
  bloğu veri gelene kadar silinmiyor. Görünür metin, renk, yerleşim değişmedi.
- `server/scripts/verify-faz3-1-jsonld.js` (yeni) + `package.json`
  (`verify:faz3-1` script'i) — canlı HTML'den JSON-LD parse eder; geo,
  aggregateRating, TR/EN Article URL ve JSON geçerliliğini doğrular.
- `AUDIT_FOLLOWUPS.md` — bu bölüm.

Dal, bilgi kutuları PR'ı (#75) dahil güncel `main` üzerine alındı. JSON-LD
dosyalarında çakışma yoktu; yalnızca `package.json` içindeki
`verify:place-info` satırı `verify:faz3-1` ile birlikte kaldı. `npm run
verify:faz3-1` bu güncellemeden sonra tekrar çalıştı ve geçti. `verify:jsonld`
ve `verify:sitemap` de regresyon için tekrar koşuldu.

### Kapsam dışı (bilinçli)

- İki paralel JSON-LD üretici (`server/lib/jsonld.js` + `public/js/app.js`)
  birleştirilmedi — bu ayrı bir refactor/tech-debt işi, FAZ3-1'in kapsamı değil
  ve "zaten çalışıyor" bir şeyi riske atmadan yapılacak bir iş.
- `TravelAgency`/`WebSite` marka açıklamasının EN çevirisi eklenmedi (bilinçli
  marka kararı gibi görünüyor, bu PR'ın görev tanımı dışında).
- FAZ3-2/3/4/5 ve FAZ4'e hiç dokunulmadı.

## Claude Master PRD — FAZ2-4 (N+1 Sorgu Temizliği)

Claude Master PRD "FAZ 2 — Performans ve Core Web Vitals" → [FAZ2-4] N+1 sorgu
temizliği. PRD'nin illüstratif metni `place_stats` materialized view + JOIN
önerir; bu depoda gerçek şema farklı — `places.tiola_count` / `places.tiola_rating`
zaten denormalize, önbelleğe alınmış kolonlar (ORTA-1'den beri), ayrı bir stats
tablosu/materialized view yok. Bu yüzden PRD'nin tam SQL'i yerine bu kod tabanının
gerçek N+1 desenleri bulundu ve düzeltildi.

### Bulunan ve düzeltilen gerçek N+1'ler

**1) `server/routes/admin.js` — `POST /tiolas/bulk` ve `POST /blogs/bulk`.**
Önceki hâli, istekteki her id için ayrı ayrı: bir SELECT (durumu/sahibini okumak
için, approve dışında) + bir UPDATE + bir stats-recompute (place_id okuma + COUNT/AVG
+ UPDATE places, 3 ayrı sorgu) + bir bildirim INSERT + bir admin_audit_log INSERT +
bir moderation_history INSERT çalıştırıyordu — 20 öğelik bir toplu işlem **60-120+
ayrı veritabanı sorgusu** demekti. Artık:
  - Tek bir `UPDATE ... WHERE id = ANY($1::int[]) ... RETURNING ...` ile tüm uygun
    öğeler tek sorguda güncelleniyor (approve); reddet/kaldır için tek bir toplu
    SELECT (durum/sahip bilgisi için) + tek bir toplu UPDATE.
  - `server/lib/tiola-stats.js`'e eklenen `recomputePlaceTiolaStatsBatch(placeIds)`:
    etkilenen TÜM mekânlar için tek bir GROUP BY sorgusuyla sayı/ortalama hesaplar,
    sonra yalnızca FARKLI (distinct) mekân sayısı kadar UPDATE çalıştırır — 20 öğe
    aynı mekâna aitse bu **1 mekân** demektir, farklı mekânlara dağılmışsa en fazla
    N ama genelde çok daha az.
  - `server/lib/auditLog.js`, `server/lib/moderation-history.js`,
    `server/lib/notifications.js`'e eklenen `logBatch()` / `createNotificationsBatch()`:
    her öğe için **ayrı bir satır** yazılmaya devam ediyor (denetim izinin / bildirimin
    tek satıra birleştirilmesi YOK — her Tiola/blog kendi audit + moderation history
    satırını koruyor) ama tek bir çok-satırlı `INSERT ... VALUES (...), (...), ...`
    ile, N ayrı INSERT yerine.
  - Alıcı başına e-posta gönderimi (`sendTiolaRejectionEmail` / `sendBlogRejectionEmail`)
    kasıtlı olarak döngüde BIRAKILDI — bu küçük, bellek içi bir döngü ve bir SMTP
    çağrısı değil bir veritabanı sorgusu; PRD'nin kendisi de "N e-posta gönderimi tek
    bir SQL sorgusunun yapabileceği bir şey değil" diyerek bunu hariç tutuyor.

**Somut sorgu sayısı (gerçek Postgres test DB'sinde, `verify:faz2-4` ile ölçüldü):**

| Senaryo | Öncesi | Sonrası |
|---|---|---|
| `tiolas/bulk` approve, 6 öğe | 37 sorgu | 6 sorgu |
| `tiolas/bulk` reject, 6 öğe | 49 sorgu | 8 sorgu |
| `blogs/bulk` approve, 5 öğe | 16 sorgu | 4 sorgu |
| `tiolas/bulk` approve, 5 öğe (aynı mekân) | 31 sorgu | 6 sorgu |
| `tiolas/bulk` approve, **20** öğe (aynı mekân) | 121 sorgu | **6 sorgu** (N'den bağımsız) |

20 öğelik bir toplu onayda sorgu sayısı artık öğe sayısından **bağımsız** (tek
UPDATE + tek stats hesaplama + mekân başına 1 UPDATE + tek audit INSERT + tek
moderation INSERT + 1 auth sorgusu) — eskiden öğe sayısıyla doğrusal büyüyordu.

**2) `server/routes/travel-lists.js`** — `GET /visited/all`, `GET /:id`,
`GET /public/:shareToken`: her mekân satırı için `placeStats(row.id)` çağrısı
`SELECT tiola_count, tiola_rating FROM places WHERE id = ?` ile AYRI bir sorgu
çalıştırıyordu — hâlbuki bu satırlar zaten `SELECT p.*, ...` ile `places` tablosunu
JOIN ediyor, yani `tiola_count`/`tiola_rating` ZATEN elde satırda vardı.
`mapPlaceRow(row)` stats parametresi verilmediğinde zaten `row.tiola_count` /
`row.tiola_rating`'e düşüyor (places.service.js ve search.js'in ZATEN kullandığı
aynı desen) — bu yüzden `placeStats()` çağrısı tamamen kaldırıldı, davranış/yanıt
şekli değişmedi, sadece gereksiz sorgu gitti. Bu, FAZ1-5/diğer FAZ'ların DEĞİL,
muhtemelen daha eski bir eklemenin (kullanıcı listeleri/ziyaret edilenler
özelliği) bıraktığı bir N+1'di.

**Daha önce doğrulandı, dokunulmadı:** `listCategories` N+1'i "Gemini Faz 4"
döngüsünde zaten düzeltilmişti (`catalog-db.js`) — kod incelendi, hâlâ tek sorgulu
(GROUP BY ile sayım), regresyon yok.

### Kapsam dışı bırakılanlar (bilinçli, ayrı bir iş kalemi)

- **`server/routes/places-legacy.js`'in arama otomatik-tamamlama ve "yakındaki/
  benzer mekânlar" özellikleri hâlâ `SELECT * FROM places` ile tam tablo taraması
  yapıyor** (denetimin flaglediği gibi). Bu FAZ2-4'e DAHİL EDİLMEDİ çünkü:
  - Otomatik tamamlama (`searchHandler`) zaten `wrap()` ile önbelleğe alınıyor
    (tekrarlanan aynı sorgu önbellekten döner) ve ayrı bir JS eşleştirme mantığı
    (`matchesQuery`) kullanıyor — bunu `places-search.js`'in `search_tsv` tabanlı
    sorgusuna geçirmek, otomatik tamamlamanın hangi alanları/şekilde eşleştirdiğini
    (ad, şehir, ülke, etiket, takma ad) değiştirme riski taşır; bu kullanıcıya
    görünür bir arama-sonucu davranış değişikliği olurdu — CRITICAL RULES bunu
    yasaklıyor ("asla API yanıt şeklini veya kullanıcı davranışını değiştirme").
  - "Benzer mekânlar" (`findSimilarPlaces`) için şu an PROVEN bir SQL eşdeğeri YOK
    (yalnızca "yakındaki" için `findNearbyPlacesSql`/PostGIS var) — PRD açıkça
    "mevcut kanıtlanmış yaklaşımı yeniden kullan, yeni bir yöntem icat etme" diyor;
    "benzer" için SQL mantığı icat etmek bu PR'ın kapsamını N+1 temizliğinden
    çıkarıp yeni bir özelliğe dönüştürürdü.
  - Bu tam tablo taraması zaten `AUDIT_FOLLOWUPS.md`'de (önceki kapsamlı denetimde)
    bilinen bir leftover olarak kayıtlı; ayrı, odaklı bir iş kalemi olarak kalmalı.
  - **Not:** `/:id` detay sayfası zaten ÖNCE `findNearbyPlacesSql` (PostGIS, indeksli)
    deniyor, yalnızca o `null` dönerse (PostGIS yoksa) `allRows` tam taramasına
    düşüyor — yani "yakındaki" için indeksli yol zaten birincil, tam tarama sadece
    yedek. Asıl tarama maliyeti "benzer mekânlar" için zorunlu.
- **`server/routes/trip-plans.js`'in `loadTripFull()`'u** her gün (day) için ayrı bir
  `SELECT ... FROM trip_plan_items WHERE day_id = ?` çalıştırıyor — teknik olarak bir
  N+1 (N = plan başına gün sayısı, tipik olarak 1-14), ama FAZ2-4'ün hedefi olan admin
  bulk uçlarından çok daha küçük ölçekli. **Ayrıca bu dosyada, FAZ2-4'ün kapsamı
  DIŞINDA iki ayrı doğruluk hatası fark edildi** (düzeltilmedi — bunlar N+1 değil,
  ayrı bir bugfix PR'ı gerektirir): `GET /trip-plans/:id` ve `/share/:token`,
  `res.json({ trip: loadTripFull(trip.id) })` çağırıyor — `loadTripFull` async
  olduğu için `await` EKSİK, yanıt muhtemelen boş bir nesne serileştiriyor; benzer
  şekilde `GET /suggest/nearby`'de origin yokken `all.slice(...).map(mapPlace)`
  da `await`'siz bir async map. Bunlar FAZ2-4'ün parçası OLARAK düzeltilmedi (N+1
  temizliği değil, farklı bir doğruluk sorunu) — Yasin'e ayrı bir bugfix item'ı
  olarak bildirilmeli.
- Supabase'de elle çalıştırılması gereken yeni bir SQL/migration **YOK** — bu madde
  saf sorgu-deseni refaktörü (yeni index/materialized view eklenmedi, var olan
  şema/indeksler yeniden kullanıldı).

### Doğrulama

- Yeni `server/scripts/verify-faz2-4-n-plus-one.js` (`npm run verify:faz2-4`):
  gerçek `admin.js` router'ını yerel bir Postgres test veritabanına karşı
  in-process bir sunucuda ayağa kaldırır, `Statement.prototype.get/all/run`'ı
  (yalnızca test sürecinde, kaynak kod değişmeden) yama ederek her DB sorgusunu
  sayar, birkaç test Tiola/blog'u toplu onaylar/reddeder ve: (a) durumun doğru
  güncellendiğini, (b) her öğe için audit-log + moderation-history + bildirim
  satırının hâlâ AYRI AYRI yazıldığını, (c) 5 öğelik ve 20 öğelik aynı toplu
  işlemin sorgu sayısının (6 vs 6) DOĞRUSAL ÖLÇEKLENMEDİĞİNİ doğrular — eski koda
  karşı çalıştırıldığında bu son kontrol gerçekten BAŞARISIZ olur (31 vs 121 sorgu),
  yani test N+1'i gerçekten yakalıyor.
- Regresyon: `verify:admin-security`, `verify:faz1-5`, `verify:votes` (`verify-anti-
  bot.js`), `verify:forms`, `verify:tiolas`, `verify:indexes` — hepsi yeşil (yerel
  Postgres test DB'sine karşı çalıştırıldı). `verify:faz1-5`'in admin.js'te her
  mutasyon rotasının `logAdmin()` çağırdığını doğrulayan statik taraması, artık
  toplu uçlar için eşdeğer `auditLog.logBatch()` desenini de kabul edecek şekilde
  güncellendi (davranış aynı — her öğe kendi audit satırını alıyor — yalnızca
  kontrol deseni güncellendi).
- `verify:tiolas`'taki "detail missing first-Tiola CTA" başarısızlığı bu PR'dan
  ÖNCE de mevcut (main'de de başarısız) — FAZ2-4 ile ilgisiz, dokunulmadı.



PR #71 (`public/js/place-crop.js`), admin "Düzenle" modalındaki kırpma penceresinin hiç
görünmemesine neden olan iki hata bulup düzeltti, ve AUDIT_FOLLOWUPS.md'de `avatar-crop.js`'te
(profil fotoğrafı yükleme) **aynı lazy-load hatasının muhtemelen olduğunu** dürüstçe not edip
kapsam dışı bıraktı. Bu takip maddesi o leftover'ı kapatıyor.

**Doğrulama sonucu:**

1. **Lazy-load çıkmazı — AYNI HATA, DOĞRULANDI.** `avatar-crop.js`'teki `#avatarCropImg` da
   `loading="lazy"` taşıyordu; kırpma penceresini (`.auth-ov`) görünür yapan `.on` sınıfı da
   burada YALNIZCA bu resmin kendi `onload` olayı içinde ekleniyordu. `display:none` kapsayıcı
   içinde lazy resim asla `onload` ateşlemiyor → pencere sonsuza dek görünmez kalıyor. Gerçek
   Chrome ile (Playwright + sistem `google-chrome-stable`, bu sandbox'ta geçici, repoya
   eklenmedi) doğrulandı: düzeltmeden ÖNCE Profil → Ayarlar → fotoğraf seçince kırpma penceresi
   DOM'da var ama `display:none`/`.on` yok, tamamen görünmez; düzeltmeden SONRA aynı adımlarla
   pencere açılıyor, yakınlaştırma çalışıyor, "Kaydet" ile kırpılmış dosya üretilip pencere
   kapanıyor. **Düzeltme:** `#avatarCropImg`'den `loading="lazy"` kaldırıldı — place-crop.js'teki
   birebir aynı tek satırlık, görsel/tasarım etkisi olmayan düzeltme.
2. **Z-index çakışması — İNCELENDİ, BU DOSYADA GEREKSİZ (uygulanmadı).** place-crop.js'in
   z-index sorunu yalnızca kırpma penceresinin bir admin "Düzenle" modalının (`.admin-modal-
   overlay`/`.admin-lightbox`, z-index 620/640) İÇİNDEN açılabildiği için ortaya çıkıyordu.
   Avatar kırpma penceresi için bu senaryo yok: `profile.html`'deki `#avatarFile` girişi
   sayfanın normal akışında, hiçbir modal/overlay içinde değil (avatar yükleme her zaman kendi
   tam sayfasında). `admin.html` ise `avatar-crop.js`/`TL_AVATAR_CROP`/`avatarFile`'ı hiç
   kullanmıyor — admin tarafındaki tek avatar özelliği "Profil fotoğrafını kaldır"
   (`POST /admin/users/:id/remove-avatar`), kırpma adımı OLMAYAN doğrudan bir silme işlemi. Bu
   yüzden `ov.style.zIndex` eklemek burada gereksiz, spekülatif bir değişiklik olurdu — eklenmedi.

**Doğrulama:** Yeni `server/scripts/verify-avatar-crop-visibility.js`
(`npm run verify:avatar-crop`) — statik regresyon muhafızı (place-crop.js'in `verify-admin-
image-picker.js`'iyle aynı desende): `#avatarCropImg`'de `loading="lazy"` kalmadığını, admin.html
hâlâ avatar-crop.js kullanmadığını, `#avatarFile`'ın bir admin modalı içine taşınmadığını ve
FAZ2-1'in (PR #69) `ensureAvatarCropLib()` lazy-load mekanizmasının bozulmadığını doğrular.
Regresyon kontrolü: `verify:admin-image-picker`, `verify:faz2-1`, `verify:admin-image-upload`,
`verify:admin-security`, `verify:user-system` — hepsi yeşil.

## Admin paneli: "Görseli ayarla" ile hiçbir şey olmuyor (Yasin — PR #67/#68 SONRASI yeni, daha spesifik bildirim)

**Bildirim:** "Yer düzenle" modalının "Fotoğraflar" bölümünde (16:9 kırpma; "Mevcut görseller" /
"Henüz görsel yok.", buton **"Görseli ayarla"** — tekil, çoklu galeri seçici değil) bir görsel
(765 KB, normal JPEG, 2296×1292, hiçbir boyut sınırının altında) seçilince **kelimenin tam
anlamıyla hiçbir şey olmuyordu**: hata yok, kırpma/önizleme penceresi açılmıyor, "Henüz görsel
yok." metni aynı kalıyor. Bu, PR #67'nin (5 MB → 12 MB) ve PR #68'in (gizli hata mesajı) çözdüğü
sorunlardan **farklı**: burada hiçbir istisna fırlatılmıyor, bu yüzden önceki iki düzeltme bunu
hiç yakalayamadı.

### Hangi ekran — tam olarak tespit edildi

Ekran görüntüsündeki birebir metinler (`"Mevcut görselleri kaldırabilir veya yeni görsel
ekleyebilirsiniz (16:9 kırpma)."`, `"Henüz görsel yok."`) `public/admin.html`'de yalnızca BİR
yerde geçiyor: **Yer "Düzenle" modalı** (`openPlaceEdit()` → `edPhotos` / `edPhotoExisting` /
`edPhotosBtnLabel`, kırpma motoru `public/js/place-crop.js`). Bu, PR #67'nin kapsadığı
"Yeni yer ekle" galerisinden (`plPhotos`, 4:3 oranlı `photo-preview-row`) FARKLI bir akış değil —
**aynı** `place-crop.js` motorunu kullanıyor, ama yalnızca "Düzenle" modalları içinde tetikleniyor
olması aşağıdaki ikinci hatayı (z-index) açığa çıkarıyor.

### Kök neden — gerçek Chrome ile doğrulandı (iki ayrı, birbirini güçlendiren hata)

Statik kod okuması (olay dinleyici bağlama, `bindPlacePhotoInput`, `window.TL_PLACE_CROP`) hiçbir
sorun göstermedi — her şey doğru bağlanmış görünüyordu. Hata yalnızca **gerçek bir tarayıcıda**
(bu sandbox'ta geçici olarak: Playwright + sistem `google-chrome-stable`, **repoya commit
edilmedi**, sadece doğrulama amaçlı) adım adım iz sürülünce ortaya çıktı:

1. **Kırpma önizleme resmi `loading="lazy"` taşıyordu.** `place-crop.js`'teki kırpma penceresi
   (`.auth-ov`) varsayılan olarak `display:none`; o pencereyi görünür yapan `.on` sınıfı
   YALNIZCA `<img id="placeCropImg">`'nin KENDİ `onload` olayının içinde ekleniyor. Tarayıcı,
   `display:none` bir kapsayıcı içindeki `loading="lazy"` resmi görünürlük kesişimi
   hesaplayamadığı için **asla yüklemiyor** — `onload` hiç ateşlenmiyor, `.on` hiç ekleniyor,
   pencere **sonsuza dek görünmez** kalıyor. Konsolda hata yok (tarayıcı resmi "reddetmiyor",
   sadece hiç talep etmiyor) — kendi kendini besleyen sessiz bir çıkmaz (deadlock). Bu satır
   `[YÜKSEK-3] Optimize images with WebP, lazy load, and EXIF strip` denetim maddesinde TÜM
   `<img>` etiketlerine toptan `loading="lazy"` eklenirken yanlışlıkla bu JS-tarafından
   oluşturulan, isteğe bağlı modal resmine de eklenmiş — gerçek kart/galeri resimleri için doğru
   olan bu optimizasyon, bu özel örnekte kendi görünürlüğüne bağımlı bir resme uygulanınca işlevi
   tamamen bozmuş.
2. **Kırpma penceresinin z-index'i, "Düzenle" modalının z-index'inden DÜŞÜK.** `public/css/
   inline-overrides.css`, `.admin-modal-overlay`'i (Yer/Şehir/Kategori "Düzenle" modalları) uzun
   süre önce z-index **620**'ye, `.admin-lightbox`'ı **640**'a yükseltmiş (`744e76e`, "Fix audit
   issues" commit'i) — ama kırpma penceresinin kullandığı paylaşılan `.auth-ov` sınıfı
   `style.css`'te hâlâ yalnızca z-index **600**. Yani bir "Düzenle" modalı AÇIKKEN kırpma
   penceresi açılırsa (tam da bu akış), kırpma penceresi DOM'da teknik olarak var ve `.on`
   sınıfıyla "açık" ama "Düzenle" modalının overlay'inin **ARKASINDA**, tamamen görünmez
   kalıyor.

Her iki hata da `place-crop.js`'in "Düzenle" modalları içindeki kullanımlarında (`edPhotos`,
`edCtImageFile`, `edCatImageFile` — hepsi `#modalOverlay` içinde) birlikte "hiçbir şey olmuyor"
hissini üretiyor. 1 numaralı lazy-load çıkmazı aslında modal-dışı "Yeni ekle" formlarındaki
(`plPhotos`, `ctImageFile`, `catImageFile`) aynı kırpma penceresini de etkiliyor — orada ikinci
(z-index) hata yok ama BİRİNCİ hata (resim hiç yüklenmiyor) orada da aynı şekilde kırpma
penceresini sonsuza dek görünmez bırakıyordu; yalnızca fark edilmemiş veya "Düzenle" akışı kadar
sık test edilmemiş olabilir — aynı kod yolu, aynı düzeltmeyle çözüldü.

**İlgili ama kapsam dışı bulgu (dokunulmadı):** `public/js/avatar-crop.js` (profilden avatar
yükleme, herkese açık site) `place-crop.js`'in birebir kopyası bir desenle AYNI `loading="lazy"`
hatasını taşıyor (`<img id="avatarCropImg" ... loading="lazy"/>`). Bu PR'ın kapsamı yalnızca
Yasin'in bildirdiği admin paneli sorunuydu; avatar yükleme ayrı, kullanıcı tarafı bir özellik —
tek, odaklı bir düzeltme kuralı gereği buraya dokunulmadı. **Leftover:** `avatar-crop.js`'teki
`loading="lazy"` de muhtemelen aynı nedenle profil avatarı kırpma penceresini hiç açılmaz hale
getiriyor; ayrı bir takip maddesi olarak ele alınmalı.

### Düzeltme (`public/js/place-crop.js`, tek dosya, 2 satır)

- `#placeCropImg`'den `loading="lazy"` kaldırıldı — bu resim zaten yalnızca kullanıcı bir dosya
  SEÇTİĞİNDE, JS tarafından talep üzerine oluşturuluyor; "ekranda görünene kadar geciktir"
  kazancı sıfır (asla "ekran dışında" değil, ya hiç yok ya da kullanıcının tam önünde), ama
  kendi görünürlüğüne bağımlı bir çıkmaz yaratıyordu.
- Kırpma penceresine (`ensureModal()` içinde) `ov.style.zIndex = '700'` ile açık, satır-içi bir
  z-index verildi — paylaşılan `.auth-ov` CSS kuralını (herkese açık giriş/kayıt modalı da
  kullanıyor) DEĞİŞTİRMEDEN, yalnızca BU kırpma penceresi örneğini admin "Düzenle" modalının
  (620) ve lightbox'ın (640) üstüne çıkarır. Görsel/tasarım değişikliği yok — pencerenin kendisi
  birebir aynı görünüyor, sadece artık doğru şekilde GÖRÜNÜYOR.

### Doğrulama

- `node server/scripts/verify-admin-image-picker.js` (yeni, `npm run
  verify:admin-image-picker`): statik olarak (a) `#placeCropImg`'in `loading="lazy"`
  taşımadığını, (b) kırpma penceresine açık bir z-index verildiğini VE bu değerin
  `inline-overrides.css`'teki `.admin-modal-overlay` (620) ve `.admin-lightbox` (640)
  z-index'lerinin üstünde olduğunu (regresyon muhafızı — ileride biri bu z-index'leri tekrar
  yükseltirse test kırmızı olur), (c) PR #67'nin 12 MB sınırının hâlâ durduğunu doğrular.
- `npm run verify:admin-image-upload` (PR #67) ve `npm run verify:admin-session` (PR #68) —
  regresyonsuz geçiyor (yerel Postgres + gerçek admin oturumuyla).
- `npm run verify:admin-security` ve `npm run verify:images` — regresyonsuz geçiyor.
- **Gerçek doğrulama (dürüstlük notu):** statik kod okuması bu hatayı YAKALAYAMAZDI — her iki
  kök neden de saf bir tarayıcı DOM/CSS görünürlük sorunu (sunucu tarafı bir HTTP isteğiyle test
  edilemez). Bu sandbox'ta geçici olarak (repoya eklenmedi) Playwright + sistem
  `google-chrome-stable` ile gerçek bir tarayıcıda uçtan uca doğrulandı: admin oturumu açıp
  sahte bir yer verisiyle "Düzenle" modalı açıldı, gerçek bir 2296×1292 JPEG dosya seçici
  üzerinden seçildi — **düzeltmeden ÖNCE** kırpma penceresi DOM'a ekleniyor ama `.on` sınıfı HİÇ
  gelmiyor, resim `complete:false`/`naturalWidth:0` olarak sonsuza dek takılı kalıyor, ekran
  görüntüsünde hiçbir değişiklik yok (birebir Yasin'in tarifiyle); **düzeltmeden SONRA** `.on`
  sınıfı geliyor, resim doğru yükleniyor (`naturalWidth:2296`), kırpma penceresi modalın
  ÜSTÜNDE görünüyor, "Kırp ve kaydet"e basınca kırpılmış önizleme doğru şekilde listeye ekleniyor
  ve buton metni "Fotoğraf ekle"ye dönüyor — tüm akış uçtan uca çalışıyor. Bu geçici doğrulama
  script'i/ekran görüntüleri PR açıklamasında tarif edildi ama repoya commit edilmedi (Playwright
  `package.json`'a yeni bir bağımlılık olarak eklenmedi — kapsam dışı bir araç kurulumu).
- Yasin'in canlıda doğrulaması gereken TEK şey: Render → Manual Deploy, tarayıcıda
  **Ctrl+Shift+R** (bu saf bir JS/CSS dosya değişikliği; versiyon dizesi değişmemiş olabilir,
  bkz. aşağıdaki ayrı "leftover" notu), sonra Admin → Yerler → herhangi bir yerde "Düzenle" →
  "Fotoğraflar" bölümünde "Görseli ayarla" → bir fotoğraf seç → artık kırpma penceresi açılmalı.

### Leftover — ayrı, ilgili bir bulgu (bu PR'da düzeltilmedi, kapsam dışı)

- `server/lib/app-version.js`'teki `getAppVersion()` cache-bust sürüm dizesi yalnızca 5 dosyanın
  (`css/style.css`, `css/inline-overrides.css`, `js/app.js`, `js/error-boundary.js`,
  `index.html`) mtime'ını izliyor — `admin.html` ve `public/js/*.js` (place-crop.js dahil)
  **İZLENMİYOR**. PR #67 ve #68'in ikisi de bu 5 dosyadan hiçbirine dokunmadı; eğer Render'ın
  deploy süreci git checkout sırasında TÜM dosyaların mtime'ını tazelemiyorsa (örn. katmanlı/
  incremental bir build), `?v=__APP_VERSION__` sürüm dizesi değişmemiş olabilir ve tarayıcılar
  `max-age=31536000, immutable` ile önbelleğe alınmış ESKİ `place-crop.js`'i sunmaya devam
  edebilir — bu PR'ın düzeltmesi dahil. Bu sandbox'tan Render'ın gerçek deploy/checkout
  davranışı doğrulanamıyor; eğer canlıda sorun ısrar ederse Yasin'e **sert yenileme
  (Ctrl+Shift+R)** önerilir (tarayıcı önbelleğini bypass eder), ayrıca kalıcı çözüm için
  `getAppVersion()`'ın izlediği dosya listesine `public/admin.html` ve `public/js/**/*.js`
  eklenmesi ayrı bir takip maddesi olarak düşünülebilir.
- `public/js/avatar-crop.js` (profil avatarı, kullanıcı tarafı) aynı `loading="lazy"` hatasını
  taşıyor — yukarıya bakın.
- Kullanıcı metinleri (hem "Yeni ekle" hem "Düzenle" bölümlerinde) hâlâ "16:9 kırpma" diyor ama
  `place-crop.js`'teki gerçek `ASPECT` sabiti `4/3` (v2 YÜKSEK-3 kart CLS düzeltmesiyle kartlar
  4:3'e geçince metin güncellenmemiş — eski bir kopya/kod uyuşmazlığı). Bu, "hiçbir şey olmuyor"
  hatasının NEDENİ değil (kırpma motoru doğru çalışırsa pencere yine açılırdı, sadece "16:9"
  dediği oranda değil "4:3" kırpardı) — bu yüzden bu PR'ın "tek, odaklı düzeltme" kuralı gereği
  metne DOKUNULMADI. İsterse ayrı bir küçük kopya-düzeltme PR'ı olarak ele alınabilir.

## Claude FAZ2-3 (Görsel CLS — denetlendi, DEĞİŞİKLİK YOK: zaten tamamdı)

Claude Master PRD "FAZ 2 — Performans ve Core Web Vitals" → [FAZ2-3] Görsel CLS düzeltmesi.
PRD metni kendi uyarısını taşıyordu: "Bu HTML değişikliği içeriyor. Uygulamadan önce onay iste."
**Bu madde için Yasin'e onay SORULMADI çünkü denetim sonucu uygulanacak hiçbir HTML/CSS
değişikliği bulunamadı** — PRD'nin istediği üç CSS kuralı ve lazy/eager stratejisi, geçmiş bir
çalışma döngüsünde ("v2 YÜKSEK-3", PR #41, `d3c9b1e`) zaten eklenmiş ve `main`'de duruyor.
Bu madde yalnızca doğrulama genişletti; görünür hiçbir şey değişmedi.

**Denetim bulguları (dosya/satır ile):**

1. **Mekân kartları (`place-card-image`) — TAMAM.** `public/css/style.css:181-182`:
   `.pc-img{aspect-ratio:4/3;...}` + `.pc-img img,.place-card img{...object-fit:cover;
   aspect-ratio:4/3;...}`. Ayrıca `public/js/img.js`'teki `TL_IMG.tag()` her kart görseline
   `width="400" height="300"` HTML attribute'u da ekliyor (çift koruma: CSS aspect-ratio + HTML
   boyutu). Kullanıldığı yerler: ana sayfa (`app.js:1119`), kategoriler (`app.js:533`), yakın/
   benzer yerler (`app.js:856/872`, `kind:'thumb'`+ sabit `.ni-img{width:34px;height:34px}`),
   favoriler/kaydedilenler (`app.js:2836/2883`), arama sonuçları (`search.html:174`), profil
   kaydedilen yerler (`profile.html:364/493`), keşfet şehir kartları (`discover-places.js:176`).
   Hepsi aynı `TL_IMG.tag()`/`responsiveImg()` yardımcısından geçiyor — tutarlı.
2. **Blog kartları (`blog-card-image`) — TAMAM, farklı ama eşdeğer teknikle.** PRD `aspect-
   ratio:16/9` önerdi; kod tabanı onun yerine **sabit piksel yüksekliği** kullanıyor
   (`public/css/style.css:233-235`: `.bimg{width:100%;object-fit:cover;...}`,
   `.bcard.feat .bimg{height:380px}`, `.bcard:not(.feat) .bimg{height:165px}`). Her ikisi de
   CLS'i aynı şekilde önler (resim yüklenmeden ÖNCE kutu boyutu kesinleşiyor); sabit yükseklik
   hatta aspect-ratio'dan daha garanti çünkü grid genişliği ne olursa olsun sabit kalıyor. Görseller
   de `TL_IMG.tag(..., { kind:'card' })` üzerinden `width="400" height="300"` + `loading="lazy"`
   alıyor (`app.js:2596`). Blog detay sayfasında "ilgili yazılar" grid'i YOK (böyle bir özellik bu
   kod tabanında hiç uygulanmamış) — kontrol edilecek bir CLS yüzeyi değil.
3. **Hero — TAMAM, PRD'nin önerdiğinden daha güçlü.** PRD `min-height:500px` önerdi; kod tabanı
   `public/css/style.css:110`: `.hero{min-height:100vh;min-height:100dvh;...}` kullanıyor — tam
   viewport yüksekliği, görsel yüklenmeden önce de sonra da ASLA değişmeyen bir rezervasyon
   (500px'ten daha güçlü bir CLS koruması, çünkü viewport'tan küçük hiçbir ekranda daralmıyor).
   Hero bir `<img>` DEĞİL; CSS `background-image` olan `.hero-slide` katmanları (carousel,
   `hero-carousel.js`) `.hero` içinde `position:absolute;inset:0` ile duruyor — yani hero görseli
   kendi kutusunu zaten hiç etkilemiyor (CLS riski yapısal olarak yok).
4. **Lazy vs eager/fetchpriority — TAMAM.** Hero LCP görseli `<img loading="eager">` değil,
   `public/index.html:34`: `<link rel="preload" as="image" href="/images/hero.webp"
   fetchpriority="high"/>` — PRD'nin istediği "yüksek öncelik + erken yükleme" hedefine `<img>`
   yerine `preload` ile ulaşılmış (carousel'i bozmamak için bilinçli tercih, bkz. "v2 YÜKSEK-3"
   bölümündeki leftover notu). Diğer TÜM görseller (`public/js/img.js`'teki `TL_IMG.tag()`
   varsayılanı) `loading="lazy"` + `decoding="async"` alıyor; `o.eager` bayrağı olmadan hiçbir
   kart/thumb/detay görseli eager yüklenmiyor. Statik HTML `<img>` etiketlerinin TAMAMI
   (404/500 logo, nav/footer logo, auth sayfaları, admin thumbnail'leri) `loading="lazy"` +
   `width`/`height` + `alt` taşıyor — `npm run verify:images` bunu otomatik tarıyor.
5. **Admin paneli görsel listeleri** — yer/kategori/medya/Tiola thumbnail'leri `admin.html`'de
   satır-içi `style="width:...px;height:...px;object-fit:cover"` ile zaten sabit boyutlu
   (örn. `admin.html:2397,2721,3768,3897`); CLS riski yok (Yasin'in kendi iş akışı için önemli
   bir yüzey, ayrıca kontrol edildi).

**Gerçek tarayıcıda ölçüm (Playwright + sistem `google-chrome-stable`, geçici — repoya
eklenmedi; yavaş 3G'ye yakın network throttling ile, `PerformanceObserver({type:'layout-shift'})`
her sayfada canlı sunucuya karşı çalıştırıldı, local Postgres + gerçek seed veri, 1106 mekan):**

| Sayfa | Toplam CLS | Görsel kaynaklı CLS |
|---|---|---|
| Ana sayfa (mekân kartları + hero) | 0.00005 | **0.00000** |
| Blog listesi (blog kartları) | 0.24603 | **0.00000** |
| Arama sonuçları | 0.68225 | **0.00000** |
| Mekân detay (yakın/benzer kartlar) | 0.01342 | **0.00000** |

Her sayfadaki ölçülen kayma kaynakları (`LayoutShift.sources[].node`) tek tek incelendi: hiçbiri
`<img>`, `.pc-img`, `.bcard`/`.bimg`, `.hero` veya `.ni-img` değil. Kaynaklar: `nav-tabs`/`authBtn`
(nav metin genişliği), `.hc` (hero metin kutusu — font/i18n ile ilgili, görselle ilgisi yok),
`site-footer` (blog sekmesinde görünürlük geçişi — bu da görselle ilgisiz, ayrı bir UI akışı),
`searchGrid`/`searchPager`/`searchSubmit`/`searchSort`/`searchCat` (arama sayfasında sonuç
grid'inin yüklenme durumundan gerçek sonuçlara geçişi — yine görsel boyutlandırmayla ilgisiz, ayrı
bir "loading state" konusu). **Sonuç: görsellerin kendisi hiçbir sayfada ölçülebilir bir layout
shift'e sebep olmuyor.** (Not: blog/arama sayfalarındaki görsel-dışı CLS kaynakları — footer
görünürlük geçişi, arama grid'i yüklenme durumu — gerçek ama FAZ2-3'ün kapsamı dışında; ayrı bir
"loading-state CLS" denetim maddesi olarak not edildi, bu PR'da dokunulmadı.)

**Sonuç: HİÇBİR CSS/HTML değişikliği önerilmedi/uygulanmadı.** Tek değişiklik: `npm run
verify:images` (`server/scripts/verify-images.js`), blog kartı sabit yüksekliğini (`165px`/
`380px`) ve `.hero{min-height:100vh}` rezervasyonunu da statik olarak doğrulayacak şekilde
genişletildi (önceden yalnızca mekân kartı `aspect-ratio:4/3`'ü kontrol ediyordu) — böylece
gelecekte biri bu CSS'i kazara silerse CI kırmızı yanar.

### Leftover
- Blog listesi ve arama sonuçları sayfalarında görsel-dışı CLS var (footer görünürlük geçişi
  ~0.25 toplam; arama grid'inin yüklenme-durumundan-sonuçlara geçişi ~0.68 toplam). Görsel
  CLS'i değil, ayrı bir "loading state / iskelet ekranı" konusu — ayrı bir denetim maddesi
  olarak değerlendirilmeli, bu PR'ın kapsamında değil.
- Mekân detay sayfasının ana görseli (`pdImg`, `public/index.html:456`) `loading="lazy"` —
  sayfa açılır açılmaz görünür olduğu için teorik olarak `eager` daha uygun olurdu (LCP), ama
  bu da görsel bir değişiklik değil, sadece bir yükleme önceliği ince ayarı; kapsam dışı
  bırakıldı (ayrı, küçük, görünmez bir performans maddesi olabilir).

`npm run verify:images`.

## Claude FAZ2-1 (JavaScript code splitting)

Claude Master PRD "FAZ 2 — Performans ve Core Web Vitals" → [FAZ2-1] JS code splitting.
Express + vanilla JS, build tool/bundler yok (webpack/vite/esbuild eklenmedi).

**Önce gerçek durum çıkarıldı** (`public/index.html`, `public/admin.html`, `public/js/app.js`,
`public/*.html`, `public/vendor/` okunarak):

1. **En büyük her-zaman-yüklü yük zaten bölünmüştü.** Leaflet (`~148 KB`) + leaflet.markercluster
   (`~33 KB`) + `map.js`/`map-discover.js`, önceki bir çalışmada (bkz. yukarıdaki "Gemini Faz 3"
   bölümü, `public/js/map-loader.js`) ana sayfanın ilk yüklemesinden çıkarılmış; `TL_MAP_LOADER.ensure()`
   yalnızca kullanıcı **Harita sekmesine tıklayınca** (`#et-map`) veya **Gezilecek Yerler** sayfasındaki
   harita paneli açılınca classic `<script>` (Leaflet UMD) + `import()` (`map.js`) ile yükleniyor.
   Bu PR'da buraya dokunulmadı; `npm run verify:faz3` hâlâ yeşil (regresyon yok, doğrulandı).
2. **Ayrı bir "blog editörü" modülü yok** — blog yazma, `app.js` içindeki küçük bir form (başlık +
   kategori + textarea), bölünecek ayrı/ağır bir kütüphane değil. PRD'nin örnek senaryosundaki
   `blog-editor.js` bu depoda karşılığı olmadığı için uygulanmadı (dürüstçe: yapacak bir şey yoktu).
3. **`analytics.js` / `cookie-banner.js`'e `defer` eklemek güvenli DEĞİL bulundu ve YAPILMADI.**
   `app.js`'in `init()` fonksiyonu, ilk `await`'ten ÖNCE senkron olarak
   `window.TL_COOKIE.render(lang)` çağırıyor ve `showMainTab()` (yine `init()` içinden, `await`'siz)
   `window.TL_ANALYTICS?.trackTab(tab)` çağırıyor. `app.js` deferlenmeden sadece `analytics.js`/
   `cookie-banner.js`'i deferlemek, bu globalleri `app.js` onlara ihtiyaç duyduğunda henüz tanımsız
   bırakırdı — **çerez onay bandı ilk ziyarette hiç görünmezdi** (KVKK riski) ve ilk `page_view`
   events'i kaybolurdu. PRD'nin kendi uyarısı ("script right after it depends on synchronous
   execution") tam bu senaryoyu işaret ediyordu; bu yüzden dokunulmadı.
4. **Gerçek, güvenli fırsat: `avatar-crop.js` (~9.8 KB).** `public/index.html` VE `public/profile.html`
   bunu her sayfa yüklemesinde statik `<script>` ile yüklüyordu, ama yalnızca kullanıcı Profil →
   Ayarlar → "Fotoğraf yükle" ile bir avatar dosyası SEÇTİĞİNDE kullanılıyor (`window.TL_AVATAR_CROP
   ?.open(...)`, dosya `input[type=file].onchange` içinde). Bu, var olan gerçek bir tetikleyici
   (dosya seçme) — PRD'nin "only apply lazy-loading where there is a genuine, pre-existing gate"
   kuralına tam uyuyor.

**Yapılan değişiklik:** `avatar-crop.js`'in statik `<script>` etiketi hem `index.html` hem
`profile.html`'den kaldırıldı. Yerine `app.js` (ve `profile.html`'in kendi inline script'i) içine,
`map-loader.js`'teki mevcut classic-script-injection deseniyle (`document.createElement('script')`
+ cache'lenmiş promise, aynı `?v=` sürümleme) birebir aynı yöntemle küçük bir `ensureAvatarCropLib()`
eklendi. Avatar dosya input'unun `onchange` handler'ı artık `await ensureAvatarCropLib()` yapıp
ardından `window.TL_AVATAR_CROP.open(...)`'u çağırıyor — kullanıcı deneyiminde HİÇBİR görünür
fark yok (dosya seçtikten sonra kırpma ekranı zaten bir API/DOM işlemi bekliyordu; birkaç KB'lık
script indirmesi bu beklemeye eklenen, gözle görülmeyen bir gecikme).

**Ölçülebilir etki:** Ana sayfa ve Profil sayfasının ilk yüklemesinde ~9.8 KB JS artık hiç
indirilmiyor (ziyaretçilerin büyük çoğunluğu avatar fotoğrafı hiç yüklemiyor). Haritadaki asıl
büyük kazanım (Leaflet + MarkerCluster, ~181 KB) zaten önceki sprintte yapılmıştı.

**Doğrulama:**
- `npm run verify:faz2-1` (yeni) — statik + canlı sunucu kontrolleri (`avatar-crop.js` ne
  `index.html` ne `profile.html`'de eager; `ensureAvatarCropLib()` ikisinde de var; dosya hâlâ
  `/js/avatar-crop.js`'ten on-demand erişilebilir).
- `npm run verify:faz3` — harita lazy-load'da regresyon yok (hâlâ yeşil).
- `npm run verify:forms`, `verify:images`, `verify:a11y`, `verify:user-system`, `verify:skeleton`,
  `verify:cleanup` — hepsi yeşil.
- Headless Chrome ile canlı tarayıcı testi (puppeteer-core, geçici — repo'ya eklenmedi): ana sayfa
  ilk yüklemede `leaflet.js`/`markercluster.js`/`avatar-crop.js` hiçbiri istenmiyor; Harita
  sekmesine tıklayınca Leaflet + MarkerCluster yükleniyor ve harita gerçekten render oluyor
  (`.leaflet-pane` DOM'da); `ensureAvatarCropLib()` çağrılınca `avatar-crop.js` indiriliyor ve
  `window.TL_AVATAR_CROP.open` tanımlı hâle geliyor; konsol hatası yok (bir önceden var olan,
  bu PR'dan bağımsız `favicon.ico` 404'ü hariç — `main` dalında da mevcut, bu PR'ın kapsamı değil).

### Leftover
- `favicon.ico` 404 (bu PR'dan önce de vardı, kapsam dışı — ayrı küçük bir düzeltme olabilir).
- `analytics.js` / `cookie-banner.js` deferlenebilir ama ancak `app.js`'in `init()` akışındaki
  `TL_COOKIE.render` / `trackTab` çağrıları `await`'ten sonraya taşınır ya da `app.js` de aynı
  sırayla deferlenirse — bu, bu FAZ2-1 maddesinin kapsamı dışına taşan, ayrı/daha dikkatli bir
  refactor gerektirir.
- Admin paneline (`admin.html`, ~5000 satır) bilerek dokunulmadı: ayrı bir sayfa, yalnızca Yasin
  admin'e giderken yükleniyor, herkese açık sayfaları hiç etkilemiyor.

`npm run verify:faz2-1` (+ `verify:faz3`).

## Claude Master PRD — FAZ2-2 (Görsel Optimizasyon Pipeline — Sharp)

Claude Master PRD "FAZ 2 — Performans ve Core Web Vitals" → [FAZ2-2] Sharp tabanlı görsel işleme
pipeline'ı. PRD örnek dosya yolu olarak `server/middleware/imageProcessor.js` + `processImage(buffer, options)`
veriyor; gerçek depo yapısı bu değil (`server/lib/image-process.js` + `server/lib/image-mime.js` +
`server/middleware/process-image-upload.js` + `server/lib/image-uploader.js`), ama işlevsel karşılık
tam olarak eşleşiyor. Önceki denetimin "ALREADY-COMPLETED" listesine aldığı madde doğrulandı —
PRD'nin 6 kontrol noktası tek tek koddan kanıtlanarak incelendi (varsayım değil).

### Gerçek pipeline ve tüm yükleme uçları

`grep -rn "sharp("` ve `grep -rn "fileType\|file-type"` ile tüm kullanım yerleri tarandı:
- Asıl işleme mantığı **tek bir yerde**: `server/lib/image-process.js` (`webpPipeline()`,
  `processImageFile()`, `processImageBuffer()`). Magic-byte doğrulaması `server/lib/image-mime.js`
  (`file-type` paketi) — ve bu doğrulama `processImageFile`/`processImageBuffer`'ın İÇİNDE
  (`assertAllowedMagicBytes(Buffer)`) çağrılıyor, yani aynı kod yolunda, ayrı/ilgisiz bir yerde değil.
- **Beş gerçek yükleme ucunun hepsi** aynı paylaşılan pipeline'dan geçiyor — `server/middleware/process-image-upload.js`
  (`processImageUpload()` → `processUploadedFile()` → `processImageBuffer`/`processImageFile`) ile:
  1. Admin yer/şehir/kategori fotoğrafları — `POST /api/admin/places/:id/photos` (`server/routes/admin.js:722`)
  2. Admin medya (yer/şehir/kategori görseli) — `POST /api/admin/media` (`server/routes/admin.js:759`)
  3. Admin hero görseli — `POST /api/admin/hero-image` (`server/routes/admin.js:766`)
  4. Kullanıcı avatar fotoğrafı — `POST /api/auth/avatar-upload` (`server/modules/auth/auth.routes.js:84-92`)
  5. Tiola fotoğrafı — `POST /api/tiolas` (`server/routes/tiolas.js:265`)
  Blog yazısı için ayrı bir dosya-yükleme ucu **yok** — `blogs.js`'teki `imageUrl` sadece bir URL
  metin alanı (yer/kategori görseline referans), dosya yükleme değil, dolayısı ile pipeline'ı
  atlaması diye bir durum söz konusu değil.
- FAZ1-5'teki "orphaned modüler rota" deseni (`server/modules/users`, `server/modules/moderation`)
  burada **tekrarlanmıyor**: `server/modules/users`/`moderation` hiçbir görsel/dosya yükleme kodu
  içermiyor (`grep -rn "avatar|photo|image|upload"` boş/ilgisiz sonuç verdi) — yani uploads için
  "orphaned" bir ikinci kod yolu yok, tüm görsel yükleme tek merkezi pipeline üzerinden gidiyor.

### 6 kontrol noktası — tek tek kanıt

1. **Magic-byte allowlist (file-type):** ✅ TAMAM. `server/lib/image-mime.js:1-11` — `FileType.fromBuffer()`
   ile JPEG/PNG/WebP allowlist'i (`ALLOWED_IMAGE_MIMES`); `server/lib/image-process.js`'teki
   `assertAllowedMagicBytes`/`assertAllowedMagicBytesBuffer` aynı kütüphaneyle pipeline'ın İÇİNDE
   tekrar kontrol ediyor (multer `fileFilter`'ın uzantı/MIME-header kontrolünü atlatan sahte
   dosyalara karşı ikinci katman). `verify-images.js`'teki "spoofed .jpg içinde PNG" testiyle
   doğrulanmış durumdaydı.
2. **Piksel-boyutu sıkıştırma-bombası koruması (.resize() ÖNCESİ):** ⚠️ KISMEN TAMAMDI → DÜZELTİLDİ.
   Sharp'ın kendi varsayılan `limitInputPixels` koruması zaten vardı ve test edildi: 20000×20000
   bir görsel oluşturulup okunmaya çalışıldığında Sharp "Input image exceeds pixel limit" hatası
   veriyordu — yani TAM korumasız değildi. Ama bu varsayılan sınır ~16383×16383 (268.402.689 piksel)
   — PRD'nin istediği 10000×10000'den belirgin biçimde daha gevşek; 12000×12000 gibi bir görsel
   (144 megapiksel, ham RGB'de ~400+ MB bellek) hiçbir hataya takılmadan geçiyordu (sandbox'ta
   doğrulandı). **Eklenen minimal düzeltme:** `server/lib/image-process.js`'e `MAX_INPUT_DIMENSION = 10000`
   ve `assertSafeDimensions()` eklendi; bu fonksiyon `sharp(input).metadata()` ile genişlik/yüksekliği
   okuyup PRD'nin istediği 10000×10000 sınırını `.resize()` çağrılmadan ÖNCE, hem `processImageFile`
   hem `processImageBuffer`'ın başında kontrol ediyor (`image-process.js` satır ~108-116). Sharp'ın
   kendi varsayılan limiti de (ekstra güvenlik ağı olarak) kaldırılmadı, değiştirilmedi.
3. **EXIF rotation, metadata silinmeden ÖNCE uygulanıyor mu:** ✅ TAMAM. `webpPipeline()`
   (`image-process.js`) zincirinde `.rotate()` ilk adım, `.webp()` (çıkış/strip anı) son adım —
   sandbox'ta orientation=6 (90° CW) etiketli bir test JPEG'i işlenip çıkışın piksel boyutlarının
   gerçekten takas edildiği (20×10 girdi → 10×20 çıktı) doğrulandı; yani döndürme piksellere
   gerçekten uygulanıyor, sadece etiket silinmiyor.
4. **TÜM metadata (GPS dahil) siliniyor mu:** ✅ TAMAM — ve kodun kendi yorum satırındaki iddia
   (satır 76-78) sandbox'ta test edilip DOĞRULANDI: bu Sharp sürümünde (`0.35.4`) `.withMetadata(false)`
   çağrısı GARİP bir şekilde EXIF'i KORUYOR (sadece orientation'ı 1'e resetliyor, EXIF bloğu buffer'da
   hâlâ duruyor) — PRD'nin önerdiği `.withMetadata(false)` kalıbı bu sürümde YANLIŞ olurdu.
   Pipeline bunun yerine `withMetadata()`'yı HİÇ ÇAĞIRMAYARAK Sharp'ın varsayılan (sessiz, tam strip)
   davranışına güveniyor — test: sahte GPS IFD (enlem/boylam) + kamera marka bilgisi gömülü bir JPEG
   işlendi, çıkışta `sharp().metadata().exif` tamamen `undefined`, çıkış byte dizisinde GPS IFD tag'i
   (`0x8825`) veya "GPSLatitude"/kamera marka string'i hiç bulunamadı. Yani gerçek sonuç PRD'nin
   istediğinden DAHA SIKI: tek tek GPS alanı silmek değil, EXIF bloğunun KENDİSİ hiç yazılmıyor.
5. **Sabit maksimum boyut (1920×1080), withoutEnlargement ile tutarlı:** ✅ TAMAM.
   `MAX_WIDTH=1920`/`MAX_HEIGHT=1080` + `{ fit: 'inside', withoutEnlargement: true }` — tüm işleme
   yollarının (dosya/buffer) ortak kullandığı AYNI `webpPipeline()` fonksiyonunda, yukarıdaki 5
   yükleme ucunun hepsi için. Test: 3000×2200 girdi → 1473×1080'e küçültüldü (sınır içinde); 50×40
   girdi → 50×40 kaldı (büyütülmedi).
6. **Çıkış formatı tutarlı WebP mi:** ✅ TAMAM (bilinçli bir istisnayla). `webpPipeline()` her zaman
   `.webp({ quality: 82 })` ile bitiyor. GIF, PRD'nin "allowlist'e dahil et ama WebP'ye çevirirken
   animasyonu bozma" önerisinin aksine, **allowlist'in dışında tutulup tamamen reddediliyor**
   (`ALLOWED_PROCESS_MIMES` = sadece jpeg/png/webp; `image-mime.js`'teki `imageFileFilter`/`ALLOWED_IMAGE_MIMES`
   de aynı). Bu, PRD'nin kendi notuyla da ("if GIF is deliberately excluded... that's a reasonable,
   intentional exception, not a bug") uyumlu, bilinçli bir ürün kararı — animasyonlu GIF desteği bu
   projede hiç yok, statik GIF'e çevirip animasyonu kırmak yerine en baştan reddediliyor. `verify-images.js`
   bunu zaten test ediyordu ("GIF rejected").

### Yapılan DEĞİŞİKLİK (sadece 1 nokta — madde 2)

`server/lib/image-process.js`: `MAX_INPUT_DIMENSION` sabiti (10000) + `assertSafeDimensions()`
fonksiyonu eklendi, `processImageFile`/`processImageBuffer`'ın en başında (magic-byte kontrolünden
sonra, `.resize()`'dan önce) çağrılıyor. UI/UX'e, mevcut çıkış kalitesine, boyutlandırmaya veya
herhangi bir yükleme ucunun davranışına (normal boyuttaki hiçbir gerçek fotoğraf 10000×10000'i
aşmaz) görünür bir etkisi yok — sadece anormal/kötü niyetli uç durum için ek bir güvenlik katmanı.
Diğer 5 kontrol noktasına **hiçbir kod değişikliği yapılmadı** (zaten PRD'nin istediğini karşılıyordu).

### Dokunulmayanlar (bilinçli)

- i18n, Argon2id, H1/a11y/blog-excerpt, yedek/geri yükleme, secret-scan, rate limiting, RBAC/audit-log,
  admin görsel yükleme/oturum düzeltmeleri, FAZ2-1 (lazy-loading) — **dokunulmadı**.
- GIF allowlist'e eklenmedi (bilinçli, yukarıda gerekçelendirildi).
- Sharp'ın kendi varsayılan `limitInputPixels` koruması kaldırılmadı/değiştirilmedi — yeni kontrol
  buna EK, onun YERİNE değil.
- FAZ2-3, FAZ2-4, FAZ3, FAZ4 — bu PR'ın kapsamı dışında, dokunulmadı.

**Doğrulama:** Yeni `node server/scripts/verify-faz2-2-image-pipeline.js` (`npm run verify:faz2-2`) —
rotation, GPS/metadata strip, sıkıştırma-bombası koruması (yeni eklenen kontrol dahil), 1920×1080
sınırı + withoutEnlargement, WebP çıkış formatı, magic-byte reddi; hepsi gerçek küçük test görselleriyle
(sahte EXIF/GPS JPEG, 3000×2200 JPEG, 50×40 JPEG, 10500px genişlikte PNG, düz metin dosyası, .jpg
uzantılı PNG). Regresyon: `npm run verify:images`, `npm run verify:admin-image-upload` (canlı admin
girişi + gerçek `/api/admin/media`, `/api/admin/hero-image`, `/api/admin/places/:id/photos` yüklemeleri),
`npm run verify:admin-security` — üçü de yeşil.

## Admin paneli: "hâlâ olmuyor görsel ekleme" + "kısa sürede çıkış yapıyor" (PR #67 sonrası ikinci bildirim)

**Bildirim (Yasin, PR #67 — 5 MB → 12 MB düzeltmesi deploy edildikten sonra):**
"hala olmuyor görsel ekleme" + "admin panelinde kısa sürede hesaptan çıkış yapıyor onu uzat".

### Soru: iki bildirim aynı kök nedenin mi parçası?

**Kısmen evet, ama birebir "JWT süresi 15-30 dakika gibi kısaymış" varsayımı DOĞRU DEĞİLDİ.**
İnceleme öncesi hipotez, JWT `exp` ile çerez `maxAge`'in uyuşmadığı klasik bir hataydı — ama
kontrol edilince `server/auth.js`'teki JWT zaten 7 gün, `server/lib/cookie-opts.js`'teki `tl_token`
çerezi de zaten 7 gündü (`WEEK_MS`) — **ikisi zaten birbiriyle uyumluydu**, 15-30 dakikalık bir süre
hiç yoktu. Admin girişi de normal kullanıcılarla AYNI `/api/auth/login` ucunu, aynı `signToken()`'ı
kullanıyor — ayrı/daha kısa bir "admin oturumu" sistemi yok.

**Ama gerçek ve çok daha olası kök neden bulundu:** `server/auth.js`'teki `ensureJwtSecret()`,
production'da `JWT_SECRET` ortam değişkeni ayarlı/güçlü değilse **her süreç başlangıcında rastgele
yeni bir secret üretiyordu** (sadece bir konsol uyarısıyla, görünür bir hata olmadan). Render (ve
çoğu host) **her deploy'da** süreci yeniden başlatır — yani `JWT_SECRET` Render Environment'ta
ayarlı değilse, **her restart** (her deploy, muhtemelen bazı planlarda boşta kaldıktan sonraki
otomatik restart da) önceden verilmiş TÜM JWT'leri (admin dahil) JWT'nin kendi `exp` alanı hâlâ
günlerce geçerliyken bile anında geçersiz kılıyordu. Bu, "oturumum kısa sürede bitiyor" hissiyle
TAM örtüşüyor ve PR #67'nin deploy'u (bir restart) muhtemelen tam da Yasin'in yükleme denediği
sırada oturumunu sıfırlamış olabilir — **iki bildirim muhtemelen aynı kök nedenin iki farklı
belirtisi**: restart → secret değişir → eski token geçersiz → sonraki istek (örn. görsel yükleme)
401 ile başarısız olur ama (aşağıdaki ikinci bulgu nedeniyle) bu 401 görünmez, "hiçbir şey olmuyor"
gibi görünür.

Bu, canlı Render ortamında `JWT_SECRET`'ın gerçekten ayarlanıp ayarlanmadığı bu sandbox'tan
doğrulanamadığı için **kesin KANIT değil, ama kod + davranış kanıtıyla çok güçlü bir aday** —
sandbox'ta bire bir simüle edilip doğrulandı (aşağıya bakın).

### Düzeltme 1 — JWT secret artık restart'larda kalıcı (asıl düzeltme)

`server/lib/jwt-secret-store.js` eklendi: üretilen secret artık mevcut `site_settings` tablosuna
yazılıyor; `server/index.js`'teki `boot()` → `reconcileJwtSecret()` DB hazır olduğunda önce bu
tabloyu kontrol ediyor — kayıtlı bir secret varsa onu kullanıyor (yeni rastgele biri yerine), yoksa
şimdi üretileni kaydediyor. Sonuç: `JWT_SECRET` Render'da hâlâ ayarlanmamış olsa bile, bir sonraki
restart artık oturumları sıfırlamıyor. `JWT_SECRET`'ı Render Environment'ta gerçek bir değerle
ayarlamak yine de ÖNERİLİR (DB'ye bağımlı olmayan, daha sağlam çözüm) — ama bu düzeltme bir
güvenlik ağı sağlıyor.

**Sandbox'ta doğrulandı:** `JWT_SECRET` boş bırakılarak prod modunda sunucu iki kez art arda
başlatıldı (gerçek bir Render redeploy'unu simüle ediyor). Düzeltmeden ÖNCEKİ davranışla
(doğrulama için ayrıca test edildi): ilk başlatmada alınan admin token'ı, ikinci başlatmadan sonra
`401` ile reddediliyordu (secret değişmişti). Düzeltmeden SONRA: aynı senaryoda ikinci başlatmadan
sonra aynı token hâlâ `200` ile kabul ediliyor (log: "Reused previously-generated JWT secret from
the database so existing sessions survive this restart").

### Düzeltme 2 — oturum süresi 7 günden 30 güne çıkarıldı (Yasin'in açık isteği)

Yukarıdaki asıl düzeltmeyle JWT/çerez süresinin kendisi artık asıl sorun değildi, ama Yasin açıkça
"uzat" dediği ve 7 gün zaten makul olsa da daha rahat bir pay istediği için: `server/auth.js`'teki
`signToken()` `expiresIn` 7d → 30d, `server/lib/cookie-opts.js`'teki `tl_token` (auth) VE `tl_csrf`
(double-submit CSRF) çerezlerinin `maxAge`'i de aynı şekilde 30 güne (`MONTH_MS` — kod tabanında
zaten var olan bir sabit, analitik oturum çerezinde kullanılıyordu) çıkarıldı. Admin ve normal
kullanıcılar aynı giriş sistemini paylaştığı için bu, normal kullanıcı oturumlarını da uzatıyor —
bu kasıtlı ve zararsız (çoğu sitede tüm oturumlar aynı süreyi kullanır), ayrı bir "admin token'ı"
sistemi icat etmek bu kapsam için gereksiz karmaşıklık olurdu. `tl_csrf` de `tl_token` ile birlikte
uzatıldı — aksi halde (ikisi senkronize değilse) 7 gün sonra oturum hâlâ geçerliyken Tiola
oluşturma/beğenme gibi CSRF-token korumalı uçlar (double-submit) "İstek reddedildi (CSRF)" ile
başarısız olurdu; bu da aynı sınıftan ayrı bir gizli hataydı, önceden önlendi.

### Düzeltme 3 — ayrı, gerçek bir ön-yüz hatası: düzenle modallarında hata mesajı görünmüyordu

`public/admin.html`'de Yer/Şehir/Kategori **"Düzenle"** modallarının (`savePlaceEdit`,
`saveCityEdit`, `saveCategoryEdit` ve bunların içindeki anlık kapak görseli yükleme) `catch`
blokları `showErr(e.message)` kullanıyordu — bu, sayfa başındaki `#globalErr` öğesini hedefliyor.
Ama `.admin-modal-overlay` CSS'i `position:fixed;inset:0;z-index:200` — yani modal açıkken
`#globalErr` **modalın tam arkasında, görünmez** kalıyor. Sonuç: oturum süresi dolmuş olsun ya da
olmasın, yükleme başarısız olsun ya da olmasın, modal açıkken oluşan HER hata sessizce yutuluyordu
— kaydet butonu tekrar aktif oluyordu ama hiçbir mesaj görünmüyordu. Bu, Yasin'in "görseli seçtim,
hiçbir şey olmadı" tarifiyle birebir örtüşüyor ve büyük olasılıkla PR #67'nin 12 MB düzeltmesinden
SONRA da "hâlâ olmuyor" hissinin asıl sebebiydi (örn. restart sonrası geçersiz oturumla "Kaydet"e
basınca 401 dönüyordu ama hiç görünmüyordu).

**İlginç not:** Blog sayfası/kategorisi/yazısı formları ZATEN doğru yapılmıştı
(`showFormErr('blogPostFormErr', ...)` vb.) çünkü onlar modal değil, sayfa içi sekme formları.
"Ekle" (yeni oluşturma) formları da zaten doğruydu (`placeFormErr`, `cityFormErr`, `catFormErr`).
Sorun yalnızca üç **"Düzenle"** modalındaydı.

**Düzeltme:** Her üç düzenle modalına, "Ekle" formlarında zaten kullanılan aynı `.admin-form-err`
deseniyle kendi hata kutusu eklendi (`edFormErr`, `edCtFormErr`, `edCatFormErr`) ve ilgili
`catch` blokları artık `showFormErr(...)` ile hatayı **modalın içinde, kullanıcının baktığı yerde**
gösteriyor. `bindCityImageInput()` artık opsiyonel bir `formErrId` parametresi alıyor, böylece
şehir/kategori düzenle modallarındaki anlık görsel yükleme hataları da aynı şekilde görünür (sayfa
içi "Ekle" formlarındaki görsel seçiciler değişmedi — onlar zaten modal dışında, doğru çalışıyordu).
Görsel/CSS/layout değişikliği YOK — kutu varsayılan olarak gizli, sadece bir hata oluştuğunda
görünür oluyor (önceden hiç görünmeyen bir mesajı artık görünür kılıyor).

### Doğrulama

- `node server/scripts/verify-admin-session.js` (yeni): statik olarak 30 günlük JWT/çerez hizasını,
  `jwt-secret-store.js`'in varlığını, `reconcileJwtSecret()`'in `boot()`'tan çağrıldığını ve üç
  düzenle modalındaki yeni hata kutularını/`showFormErr` bağlamasını doğruluyor; canlı sunucuyla
  (a) taze girişin gerçekten ~30 günlük token+çerez ürettiğini, (b) süresi dolmuş/bozuk bir token
  ile admin yükleme ucuna (`/api/admin/media`) gidildiğinde net `401` + `sessionExpired:true` +
  anlaşılır Türkçe mesaj döndüğünü VE `tl_token` çerezinin temizlendiğini, (c) normal (süresi
  dolmamış) bir oturumla medya/hero/şehir/kategori/yer fotoğrafı yüklemenin hâlâ uçtan uca
  çalıştığını (PR #67 + bu düzeltme birlikte) doğruluyor.
- `node server/scripts/verify-admin-image-upload.js` (PR #67) — regresyon yok, hâlâ geçiyor.
- `npm run verify:admin-security`, `verify:faz1-5`, `verify:forms`, `verify:user-system` — hepsi
  regresyonsuz geçiyor (`verify:user-system` zaten süresi dolmuş JWT'nin `401 sessionExpired`
  verdiğini ve çerezi temizlediğini test ediyordu — hâlâ geçiyor).
- JWT secret kalıcılığı ayrıca manuel olarak iki ardışık süreç başlatmayla (production modu,
  `JWT_SECRET` boş) simüle edildi — düzeltmeden önce ikinci başlatmadan sonra ilk oturumun token'ı
  `401` dönüyordu, düzeltmeden sonra `200` dönüyor (yukarıya bakın).

### Dürüstlük notu — canlıda (Render) doğrulanamayan kısım

Bu sandbox'ta gerçek Render ortamı veya onun `JWT_SECRET` / `SUPABASE_URL` / `SUPABASE_SERVICE_KEY`
değerleri yok. Yukarıdaki JWT-secret-rotasyonu teorisi kod davranışıyla ve yerel simülasyonla güçlü
şekilde destekleniyor ama Render'ın GERÇEKTEN `JWT_SECRET`'sız çalıştığı ya da ne sıklıkta restart
olduğu buradan kanıtlanamaz. Düzeltme her iki durumda da (ayarlı/ayarsız) zararsız ve geriye dönük
uyumlu: `JWT_SECRET` zaten ayarlıysa `reconcileJwtSecret()` hiçbir şey yapmadan çıkıyor. Yasin'e
Render → Environment'ta `JWT_SECRET` adında, uzun/rastgele bir değerin (ör. `npm run
generate:jwt-secret` çıktısı) gerçekten var olup olmadığını kontrol etmesi, yoksa eklemesi önerilir
— bu, veritabanına hiç bağımlı olmayan en sağlam çözümdür.

## Admin paneli: görsel yükleme çalışmıyor (Yasin bildirdi)

**Bildirim:** "admin panelinden görsel ekle diyince çalışmıyor sanırım eklemiyor çünkü" — hangi sayfa, hangi hata belirtilmedi.

### Yapılan inceleme

Admin panelindeki **7 görsel yükleme noktasının hepsi** tek tek okundu ve uçtan uca izlendi:
yer (place) fotoğrafları (`plPhotos` / `edPhotos`), şehir görseli (`ctImageFile` / `edCtImageFile`),
kategori görseli (`catImageFile` / `edCatImageFile`), hero görseli (`heroImageFile`). Medya kütüphanesi
yalnızca listeleme/silme; blog kapak görseli yalnızca URL alanı — bu ikisinde dosya seçici yok.

- **Statik:** `public/admin.html` (tek satır-içi `<script>`, 1097–5021) `node --check` ile sözdizimi hatası
  yok; tekrarlanan `const`/`let` yok. Her `<input type="file">` için `FormData` alan adı (`image`/`photos`)
  sunucudaki `multer` (`upload.single('image')` / `upload.array('photos', 10)`) ile birebir eşleşiyor.
  Rotalar `server/index.js`'teki `/api/admin` mount noktasıyla uyumlu. `/api/admin`'deki `csrfProtection`
  Origin/Referer tabanlı (token değil) — `FormData` istekleri için ekstra başlık gerekmiyor. CSP
  (`script-src`, `img-src: https:`, `connect-src`) hiçbir yükleme veya önizleme isteğini engellemiyor.
  `git log` ile `admin.html`, `server/routes/admin.js`, `image-process.js`, `image-uploader.js`,
  `supabase-storage.js` dosyalarının geçmişi tarandı — PR #58–#66 bu dosyalara dokunmamış, yakın zamanlı
  bir regresyon bulunamadı.
- **Canlı:** Bu sandbox'ta gerçek bir Postgres + Express sunucusu ayağa kaldırılıp admin olarak giriş
  yapıldı, gerçek bir JPEG ile üç uç nokta de doğrudan HTTP ile çağrıldı:
  `POST /api/admin/media`, `POST /api/admin/hero-image`, `POST /api/admin/places/:id/photos` —
  **üçü de 200 döndü**, `sharp` EXIF temizleme/1920p sınırlama/WebP dönüşümü çalıştı, disk'e (bu
  sandbox'ta `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` tanımlı değil, yerel disk fallback'i kullanıldı)
  yazıldı, DB güncellendi, doğru `url` JSON yanıtı döndü. (`server/scripts/verify-admin-image-upload.js`)

### Bulunan gerçek hata: istemci taraflı 5 MB sınırı çok düşük

`public/js/place-crop.js` (yer/şehir/kategori görseli kırpma modalı), seçilen **orijinal** dosyanın
5 MB'ı geçmesini `alert()` ile reddediyordu — bu kontrol kırpma/küçültme adımından ÖNCE çalışıyor.
Oysa kırpma çıktısı her zaman ~1280px genişliğe küçültülüyor (çıktı tipik olarak birkaç yüz KB),
yani sunucunun gerçek 5 MB yükleme sınırı bu çıktı için zaten bol bol yetiyor — sorun SEÇİLEN
orijinal dosyada. Modern telefon kameraları (özellikle Android, yüksek çözünürlüklü iPhone fotoğrafları)
sık sık 6–15 MB JPEG üretir; bu dosyalar kırpma ekranına hiç girmeden `alert()` ile reddediliyordu.
Hero görseli yükleme (`compressHeroImageFile`, `admin.html`) bu sorunu daha önce 12 MB sınırı +
otomatik küçültme ile çözmüştü, ama aynı düzeltme yer/şehir/kategori görselleri için hiç yapılmamıştı.

Bir `alert()` kutusu teknik olarak "görünür" bir hata mesajıdır, ama Yasin'in tarif ettiği "görseli
seçtim, hiçbir şey olmadı" hissiyle tam örtüşüyor: popup'ı fark etmeyen veya mesajı net anlamayan bir
kullanıcı için sonuç "yüklemiyor" gibi görünür — hele ki aynı ekranda (hero) daha yüksek bir sınırın
zaten çalıştığını bilmiyorsa.

**Düzeltme:** `place-crop.js`'teki `MAX_FILE_BYTES` 5 MB → 12 MB (hero ile aynı sınır) yükseltildi,
`admin.html`'deki 4 yerdeki "max 5 MB" ipucu metni "max 12 MB" olarak güncellendi. Sunucu tarafı
`multer` sınırları (5 MB) **değiştirilmedi** — kırpılmış çıktı için zaten yeterli, sorun hiç oraya
ulaşmıyordu.

### Dürüstlük notu — kesin kök neden teyit edilemedi

Bu sandbox'ta `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` yok, yani gerçek Supabase Storage çağrısı test
edilemedi (yalnızca disk fallback'i doğrulandı — kod yolu aynı, `server/lib/supabase-storage.js`
hem POST hem de 409'da PUT deniyor, hata mesajları `showErr`/`showFormErr` ile her yükleme yolunda
yakalanıp gösteriliyor). 5 MB sınırı gerçek bir hata ve düzeltildi, ama Yasin'in TAM olarak hangi
dosyayı hangi ekranda denediği bilinmediği için bunun onun karşılaştığı **tek** sorun olduğu kesin
değil. Canlıda hâlâ sorun varsa muhtemel sebepler: (a) Render'daki `SUPABASE_SERVICE_KEY` yanlış/süresi
dolmuş veya bucket izinleri eksik (bu sandbox'tan test edilemez), (b) seçilen dosya HEIC/RAW gibi
desteklenmeyen bir format (JPEG/PNG/WebP dışı — `alert()` ile açıkça reddediliyor), (c) 12 MB'ı da
aşan çok büyük bir orijinal dosya. Yasin'e: tarayıcıda F12 → Network sekmesinde ilgili `/api/admin/...`
isteğinin durumunu ve Console'daki kırmızı hatayı PR açıklamasında istendiği gibi iletmesi istendi.

`npm run verify:admin-image-upload` — yeni eklendi: yerel sunucu + admin oturumu ile üç yükleme
ucunu da gerçek bir JPEG ile uçtan uca test eder (disk fallback), `place-crop.js`'teki yeni 12 MB
sınırını statik olarak doğrular, admin.html'deki ipucu metinlerinin güncellendiğini kontrol eder.

## Claude Master PRD — FAZ1-5 (RBAC / admin audit log)

**Şeffaflık notu:** Bu maddenin orijinal PRD metni (Claude'un yazdığı Touristlio Cursor Master PRD) bu sandbox'ta mevcut değildi — önceki bir sohbette yüklenmiş ama diske kalıcı olarak geçmemiş. `AUDIT_FOLLOWUPS.md`, git geçmişi ve `/home/ubuntu/.cursor/projects/workspace/uploads/` aranmış, bulunamamıştır. Kapsam, önceki ajanın bağlamından çıkarıldı: **"RBAC zorlaması + hassas admin eylemleri için audit log"**. Bu nedenle madde ismi/kapsamı PRD'nin orijinaliyle %100 örtüşmeyebilir — ama güvenlik açısından en kritik, mantıklı yorumdur.

### Gap analizi: `/api/admin` (gerçek admin paneli) zaten tam korumalıydı

`server/routes/admin.js` — admin panelinin GERÇEKTEN kullandığı tek rota dosyası:
- Tüm rotalar `router.use(authRequired, requireRole(...PANEL_ROLES))` ile baştan korunuyor (blanket), üstüne her rota kendi `checkPermission(...)` veya `requireRole('admin')`'ini ekliyor.
- **Statik tarama: ~50 mutasyon rotasının (POST/PUT/PATCH/DELETE) HEPSİ `logAdmin()` çağırıyor** → `admin_audit_log` tablosuna yazıyor (v2 ORTA-5 / `cursor/admin-security-10f2` işi — zaten vardı, dokunulmadı).
- Rol (`req.user.role`) her istekte sunucu tarafında DB'den taze okunuyor (`findUserById`), istemciden gelen bir değer asla güvenilmiyor — RBAC implementasyonu güvenli.
- **Bu dosyada eksik middleware bulunan TEK bir rota bile yoktu.** Yani "admin panelinde korumasız bir uç var mı" sorusunun cevabı: hayır.

### Gerçek boşluk: kullanılmayan ama ERİŞİLEBİLİR modüler rotalar (`server/modules/`)

Projede eski bir "modüler refactor" denemesinden kalan, **admin paneli JS'i tarafından hiç çağrılmayan ama `server/index.js`'te mount edilmiş** (dolayısıyla doğru token'la herkes tarafından çağrılabilir) üç dosya bulundu ve incelendi:

1. **`server/modules/users/users.routes.js` → `PATCH /api/users/:id/role` — EN CİDDİ BULGU:**
   - Rol listesi `['member', 'editor', 'moderator', 'staff', 'admin']` idi — **`admin` dahil!** Kendi rolünü değiştirme engeli yoktu, mevcut bir admin hesabının rolünü koruma yoktu, **audit log'a hiç yazmıyordu**.
   - Bu rota yalnızca `checkPermission('admin.users')` ile korunuyordu. `server/middleware/rbac.js`'teki `ROLE_DEFAULT_PERMS` yedek listesi `moderator` ve `staff`'a `admin.users` izni veriyordu — ki bu, `server/db.js`'teki GERÇEK seed (`rolePerms`) ile **çelişiyordu** (seed bu izni hiç vermiyor). Pratikte DB'de seed çalıştığı için `role_permissions` tablosu doğru (admin.users yok) geliyordu, ama bu iki kaynağın çelişmesi kendi başına bir risk + gelecekte birinin yedek listeyi "düzelteyim" derken gerçek açığı üretme ihtimali taşıyordu.
   - **Düzeltme:** `admin.js`'teki kanıtlanmış mantıkla birebir hizalandı — `ASSIGNABLE_ROLES` (admin hariç), `isProtectedUserRole` (mevcut admin korunur), kendi-rol değişikliği engeli, her değişiklik `admin_audit_log`'a yazılıyor (`user.role_change`). Rotaya ayrıca **`requireRole('admin')`** eklendi (defansif ikinci kat — tek başına `checkPermission` yeterli olsa da). `rbac.js`'teki yedek liste de seed'le hizalandı (moderator/staff'tan `admin.users` çıkarıldı).
   - **Risk, gerçek anlamda sömürülebilir miydi?** DB'de seed her zaman çalıştığı için (server açılışında otomatik), canlıda bir moderator/staff hesabının bu spesifik ucu `admin.users` izniyle geçebilmesi günümüzde mümkün değildi — ama kod iki farklı yerde (seed vs. yedek liste) çelişen bir gerçeği tutuyordu ve rol-atama ucunun kendisi zaten "admin" rolünü serbestçe atayabiliyordu (hangi rol çağırırsa çağırsın). Bu, "düzeltilmemiş olsa kritik, gelecekte kolayca tetiklenebilecek bir ayrıcalık yükseltme açığı" olarak değerlendirildi ve kapatıldı.

2. **`server/modules/moderation/moderation.routes.js`** (Tiola/blog onay-red, admin panelindeki "Moderasyon" sekmesi gerçekte `/api/admin/tiolas/...` kullanıyor, bu modül değil):
   - RBAC doğruydu (`checkPermission('admin.moderate')`), ama onay/red eylemleri **audit log'a hiç yazmıyordu**. Eklendi: `tiola.approve` / `tiola.reject` / `blog.approve` / `blog.reject`.

3. **CSRF:** `/api/users` ve `/api/moderation`, `/api/admin`'in aksine `csrfProtection` middleware'i almıyordu. İkisi de admin'e özel mutasyon içerdiği için `/api/admin` ile aynı korumaya kavuşturuldu.

### Dokunulmayanlar (bilinçli)

- `/api/settings` (`PUT /`) — aynı "kullanılmayan modül" ailesinden, audit log yazmıyor. **Bilinçli olarak dokunulmadı**: `admin.settings` izni hiçbir rolün varsayılanında yok (yalnızca `admin` rolü, `checkPermission` içindeki erken dönüşle geçer) → ayrıcalık yükseltme riski taşımıyor; PRD'nin açıkça saydığı kategoriler (rol değişimi, silme, yedek/geri yükleme, içerik moderasyonu) arasında değil. Minimal/katı kapsam kararı — AUDIT_FOLLOWUPS.md'de not edildi, ileride istenirse ayrı bir madde olabilir.
- `admin_audit_log` tablosu **yeni eklenmedi** — zaten vardı (v2 ORTA-5), yeni migration/SQL gerekmedi. Yasin'in Supabase'de hiçbir şey çalıştırmasına gerek yok.
- FAZ1-1 (yedek), FAZ1-2 (Argon2id), FAZ1-3 (anahtar sızıntı), FAZ1-4 (rate limit), i18n, H1/a11y/blog-excerpt — **dokunulmadı**.

`npm run verify:faz1-5` — statik olarak (a) `/api/admin`'in blanket korumasını ve tüm mutasyon rotalarının `logAdmin` çağırdığını, (b) `/api/users` rol ucunun düzeltmelerini, (c) `rbac.js`/`db.js` seed hizasını, (d) `moderation.controller.js`'in audit log eklerini, (e) yeni CSRF mount'larını doğrular; ardından gerçek bir yerel sunucuda (prod Supabase'e dokunmadan) unauth/member/moderator/admin ile canlı 401/403/200 ve `admin_audit_log`'a gerçekten satır yazıldığını doğrular. Regresyon: `npm run verify:forms`, `verify:votes`, `verify:faz1-4`, `verify:sprint1`, `verify:admin-security`, `verify:admin-role` — hepsi geçti.

## Claude Master PRD — FAZ1-4 (rate limit / tüm kritik endpoint'ler)

Gap analizi: PRD'nin 6 limiter kategorisinin **hepsi zaten vardı** (v1 YÜKSEK-7, v2 YÜKSEK-2, ORTA-4, v2 ORTA-5). Yeni limiter eklenmedi; mevcut korumalar doğrulandı ve tek bir bilinçli "ekleme" kararı belgelendi.

- **auth (login/register)**: `authLimiter` IP başına 20 / 15 dk, tüm kritik auth uçlarına bağlı (`/register`, `/login`, `/forgot-password`, `/reset-password`, `/verify-email`, `/change-password`, `/change-email`, `/resend-verification`). Login'de ayrıca hesap bazlı kilit: 5 yanlış şifre → 15 dk `locked_until` (423, v2 ORTA-5). PRD'nin `skipSuccessfulRequests` fikri zaten hesap-kilidiyle karşılanıyor; IP limiterına eklenmedi (yanlış şifrede normal kullanıcı kilitlenmesin diye — YÜKSEK-7 kararı, değişmedi).
- **passwordReset**: `/forgot-password` zaten `formLimiter` (3 / 5 dk, kayıt+iletişim ile ortak IP kovası) + `authLimiter` kullanıyor — PRD'nin önerdiği 5/saatten daha sıkı. `/reset-password` geçerli bir token gerektirdiği için yalnızca `authLimiter`; token olmadan brute-force zaten imkânsız. Ayrı bir `passwordReset` limiterı **eklenmedi** (gerçek boşluk yok).
- **tiola**: `tiolaFormLimiter` (gönderim, 3 / 5 dk) ve `tiolaVoteLimiter` (beğeni, ORTA-4, 5 / dk) aynen duruyor, **dokunulmadı**.
- **search**: `searchLimiter` (60 / dk) zaten `GET /api/search` ve `GET /api/places/search` üzerinde — PRD'nin istediği değerle birebir aynı. **Dokunulmadı**.
- **contact**: `contactLimiter` = `formLimiter` (3 / 5 dk) zaten `POST /api/contact` üzerinde. **Dokunulmadı**.
- **genel `/api/*` catch-all**: PRD'nin en olası "boşluk" dediği madde aslında projenin en eski limiterı — `apiLimiter` (300 / 15 dk, `RATE_LIMIT_MAX` ile ayarlanabilir) ilk commit'ten beri `app.use('/api/', apiLimiter)` ile tüm `/api/*` uçlarını kapsıyor. **Yeni eklenmedi**, zaten vardı.

### Bilinçli karar: bot User-Agent istisnası eklenmedi

PRD'nin örnek kodu genel limiterda "bot UA ise GET isteklerini atla" öneriyor (Googlebot/Bingbot). Bunu **eklemedik**: User-Agent başlığı istemci tarafından serbestçe ayarlanabilir, "Googlebot" taklidi yapan bir kötüye kullanıcı tam da `apiLimiter`'ın durdurmaya çalıştığı trafiği sınırsız hale getirir — bu bir koruma değil, bypass kapısı olur. Mevcut 300 istek / 15 dk payı gerçek arama motoru botları için zaten yeterli (bu ölçekte bir katalog sitesi için Googlebot/Bingbot bu tavana pratikte ulaşmaz) ve kritik uçların (arama, iletişim, Tiola) zaten kendi route-özel limiterları var — bu limiterlar UA'dan bağımsız çalıştığı için istisnaya ihtiyaç da yok.

`npm run verify:faz1-4` — mevcut tüm limiter ayarlarının (window/max) değişmediğini statik olarak doğrular, her limiterın doğru route'a bağlı olduğunu kontrol eder, bot-UA istisnası eklenmediğini teyit eder ve yerel bir test sunucusunda (prod Supabase'e dokunmadan) `authLimiter` + `searchLimiter` için gerçek 429 yanıtını doğrular. Ayrıca `npm run verify:forms` (contactLimiter + tiolaFormLimiter 429) ve `npm run verify:votes` (tiolaVoteLimiter 5/dk) ile regresyon yok.

## Claude Master PRD — FAZ1-3 (anahtar sızıntı)

Tarayıcıda (`public/`, vendor hariç) gerçek `sb_secret` / `sk_live` / `AIza` / `xkeysib` / `ghp_` yok. Service key yalnızca sunucu (`supabase-storage.js` + env). Yeni `@supabase/supabase-js` client yazılmadı.

`verify:sprint0` artık tüm public HTML/JS tarar. reCAPTCHA **site** key `/api/config` ile gelir; **secret** env’de.

## Claude Master PRD — FAZ1-1 (yedek)

Sprint 1 yedek güvenliği duruyor (allowlist, SHA-256, dry-run, isteğe bağlı AES). `owner` rolü yok — yedek `admin`. Yeni bucket / JSON dump yok.

Boşluk: gerçek restore öncesi `pg_dump` kopyası; `psql` düşerse kopya geri yüklenir. Snapshot alınamazsa restore iptal. Audit: `db.restore_snapshot` / `rollback_ok|failed` / `restore_failed`.

`npm run verify:sprint1`.

## Claude Master PRD — FAZ0-2 (dil / rota)

Mevcut `TL_I18N` duruyor (LocaleManager / `/locales/*.json` yok — o dosyalar projede yok, yazılmadı).

- URL `/en` kazanır; `setLang` `persistLang` + `apply` + `syncRoute` (`/blog` ↔ `/en/blog`).
- `html lang` + hreflang zaten vardı.
- Boşluk: blog hero/özet/arama `data-i18n` yoktu; `/en/blog` açıkken “Seyahat Hikayeleri” Türkçe kalıyordu. Şimdi `apply()` ile değişir. Kategori chip EN’de `nameTr` yedeklemez.

`npm run verify:sprint0`. Claude i18n.js’i sıfırdan yazmadı.

## Empty states CTA

0 sonuç ekranına yönlendirme butonu (tasarım aynı). “0 yer bulundu” / keşfet / gezilecek yerler boş listesinde **Filtreler Temizle**; favori boşsa **Keşfet**; mekân detayında 0 Tiola zaten **İlk Tiola'yı sen yaz!**. `npm run verify:empty-states`.

## Onaylı risk maddeleri (1 / 4 / 5)

Yasin onayladı: H1, honeypot/klavye çerçevesi, blog özet tekrarı. **Madde 3 (CLS / destinasyonları gizleme) yok.**

1. **H1** — `index.html` statik olarak tek H1 (hero). Diğer sayfa başlıkları H2; `syncPageHeading` açık görünümde tek H1 yapar. Görünüm aynı (CSS h1/h2 ortak).
4. **a11y** — honeypot `.tl-hp` + `aria-hidden` + clip; `button:focus-visible` çerçevesi.
5. **Blog** — `bodyWithoutExcerpt`: özet gövdede tekrar etmez.

`npm run verify:h1 && npm run verify:a11y && npm run verify:blog`.

## Gemini Faz 4 (PostGIS / JSON-LD / N+1)

Gemini “Faz 4”. Express + vanilla JS. Tasarım / UI yok. Next.js yok.

1. **PostGIS** — `places.location` TEXT (adres) duruyor. Yeni nullable `geom geography(Point, 4326)`. `CREATE EXTENSION postgis` try/catch; yoksa site açılır. Backfill + trigger + admin dual-write. İndeks: SP-GiST, olmazsa GIST. `lat`/`lng` Leaflet, API, sitemap için duruyor. Yakın yerler: PostGIS varsa `ST_DWithin`/`ST_Distance`, yoksa mevcut haversine (`geo.js` aynı).
2. **JSON-LD** — İkinci sistem yok. KRİTİK-7 / YÜKSEK-4: Place zaten `TouristAttraction` + `AggregateRating` + `Review` (TR + `/en`). Faz 4: `@id`, `containedInPlace` (City/Country), `geo` GeoCoordinates, Review hem ayrı blok hem `attraction.review`.
3. **N+1** — `listCategories` her slug için `countCategoryUsage` (places taraması) yapıyordu. Tek `COUNT(DISTINCT)` JOIN. `categories` TEXT kaldı (`LIKE %"slug"%`). Liste/arama/keşfet hâlâ `SELECT p.*` + satırdan parse; API şekli aynı.

`npm run verify:faz4` (veya `node scripts/verify-gemini-faz4.mjs`).

### Leftover
- PostGIS Supabase Dashboard → Database → Extensions’ta kapalıysa `geom` oluşmaz; site yine çalışır. Yasin panelden **postgis** açıp Render’da restart etmeli.
- `categories` TEXT → JSONB + GIN yok (Faz 1 leftover; LIKE duruyor).
- Detay yakını hâlâ gerekirse tüm `places` çeker (similar + haversine yedek). Supercluster yok.
- SPA istemci JSON-LD (app.js) sunucu builder’ın kopyası; birleştirilmedi.

## Gemini Faz 3 (Performans / Core Web Vitals)

Gemini “Faz 3: Performans (Core Web Vitals)”. Express + vanilla JS. React / Next yok. Tasarım yok.

1. **Code splitting** — Script’ler zaten ayrı dosya + `?v=__APP_VERSION__`. Admin ayrı HTML; blog SPA içinde. Tek büyük always-on yük: Leaflet + MarkerCluster + `map.js`. Ana sayfada artık yok; `map-loader.js` + `import()` (Leaflet UMD classic `<script>`, CSP `'self'`). `React.lazy()` eklenmedi.
2. **Harita** — Leaflet CSS head’de duruyor (layout yok). JS, keşfet harita sekmesi / Yerler haritası / detay haritası açılınca yüklenir. MarkerCluster + max 500 + `invalidateSize` aynı. Supercluster / Canvas / MapLibre yok (pin rengi ve chrome değişirdi).
3. **API cache** — Global `GET /api/*` `no-store` duruyor. Dar istisna: başarılı public `GET /api/places`, `/search`, `/map/markers` → `public, max-age=30, stale-while-revalidate=120`. Auth / kayıtlı yerler / detay / POST hâlâ `no-store`. Bellek 30s + `REDIS_URL` varsa Redis; yazınca `invalidatePlacesCache`.

`npm run verify:faz3` (+ `verify:cache`).

### Leftover
- Supercluster + Canvas renderer yok; mevcut MarkerCluster + lazy-load. Pin rengi / cluster görünümü aynı kalsın diye.
- Admin / blog ayrı paket yok (zaten ayrı sayfa / SPA dosyaları). `app.js` tek vanilla giriş; webpack chunk yok.
- Redis yoksa cache süreç belleği (Render instance paylaşmaz). `REDIS_URL` (Upstash) varsa list/search/markers paylaşılır.
- HTTP cache 30s: yeni yer ~30–150s sonra (SWR) görünür. Yazma bellek/Redis’i düşürür; paylaşılan CDN hâlâ TTL’ye kadar bayat tutabilir.
- `style-src` hâlâ `'unsafe-inline'`. AVIF yok.

## Gemini Sprint 1 (güvenlik / veri bütünlüğü)

Gemini “Faz 2: Güvenlik ve Veri Bütünlüğü (Sprint 1)”. Express + vanilla JS. Tasarım yok.

1. **Admin yedek** — İndirme/geri yükleme dosya adı allowlist (`touristlio-*.sql`); `..` ve mutlak yol reddedilir. SHA-256 (`X-Checksum-SHA256` + sidecar). Geri yükleme checksum şart; `dryRun` dump’ı doğrular, uygulamaz. Şifreleme yalnızca mevcut `BACKUP_ENCRYPTION_KEY` (≥32, placeholder değil) ile AES-256-GCM; yeni anahtar uydurulmadı. İsimli dosya varsa mevcut Supabase Storage `createSignedUrl` (`backups/` prefix).
2. **Sharp** — EXIF silme, 1920×1080, WebP, magic byte duruyor (YÜKSEK-3 / Faz 1). AVIF eklenmedi.
3. **CSP** — `onclick`/`onchange`/`oninput`/`onerror` → `data-act` + `bind-actions.js`. Nonce duruyor. `script-src-attr 'unsafe-inline'` kalktı (`'none'`).

`npm run verify:sprint1` (+ `verify:csp` / `verify:images` / `verify:filters`).

### Leftover
- Canlı yedek **ephemeral**: `GET /backup/download` anlık `pg_dump` (Render disk kalıcı değil). Kalıcı kopya = Supabase Dashboard Backups veya `npm run backup:db` çıktısını dışarı taşımak.
- Uploads bucket yalnızca görsel MIME kabul eder; `.sql` oraya yazılmıyor. Yeni S3/bucket açılmadı. İleride ayrı private bucket + `createSignedUrl` mümkün.
- `BACKUP_ENCRYPTION_KEY` boşsa dump düz SQL. Render’da uzun rastgele değer yoksa şifreleme kapalı kalır.
- Eski SQLite `.db` geri yükleme yok (Postgres `.sql`).
- `style-src` / `style-src-attr` hâlâ `'unsafe-inline'` (kritik CSS + `style=""`).
- AVIF yok (eski tarayıcı + `picture`/kart oranı).

## Gemini Sprint 0 (logic / API — tasarım yok)

Gemini “2. GÜVENLİ VE ONAYLI GELİŞTİRMELER”. Express + vanilla JS. Next.js SSR yok.

1. **[object Object] blog** — `mapBlog` `categoryLabel` artık `await`. Prisma/i18n nesnesi → `blogs.category` TEXT slug, `tags` string[]. İstemci `displayLabel` (`.name` / `nameTr` / `nameEn`). Admin liste + düzenleme aynı.
2. **Dil + rota** — Tek çözümleyici `TL_I18N.resolveLang`: URL `/en` kazanır, yoksa `tl_lang`, yoksa `tr`. `setLang` yolu senkron tutar (`/` ↔ `/en/`, `/places/x` ↔ `/en/places/x`, `/blog/x` ↔ `/en/blog/x`). Flash: `html lang` + `data-tl-lang` head’de erken (inline boot + `sendPublicHtml`).
3. **Anahtarlar** — Commit’li gizli anahtar yok. Secret’lar `.env` / Render (gitignore). `.env.example` yer tutucu. Public reCAPTCHA **site** key HTML’de normal; **secret** env’de.

`npm run verify:sprint0`

### Leftover
- Git geçmişinde sızıntı yok; yine de Render’daki `SUPABASE_SERVICE_KEY` / `JWT_SECRET` / `SMTP_PASS` / `BREVO_API_KEY` / `RECAPTCHA_SECRET` periyodik rotate (alışkanlık).
- reCAPTCHA site key public-by-design; secret asla `public/js`’e konmaz.
- Mapbox / Google Maps kullanılmıyor (Leaflet + OSM); örnek env satırları boş.
- `.env.local` (Next.js) yok ve açılmayacak.

## Gemini Faz 1 (güvenlik / DB / medya / harita)

Gemini PRD yalnızca Faz 1. UI/CSS/Next.js yok. Express + vanilla JS + Render + Supabase PostgreSQL.

1. **Şifre / çerez** — Argon2id (`m=65536,t=3,p=1`) + bcrypt yükseltme zaten vardı. `tl_token` / `tl_csrf` / `tl_sid` artık ortak `cookie-opts`: **HttpOnly** (CSRF hariç; çift gönderim), production **Secure**, varsayılan **SameSite=Strict**. OAuth yok; giriş/admin aynı origin POST + XHR. `COOKIE_SAMESITE` ile override. JWT secret uydurulmadı.
2. **Veritabanı** — `009_jsonb_gin`: gerçek `jsonb` sütununa GIN (şu an yok; categories TEXT). `idx_places_lat_lng` btree. PostGIS `geom` + SP-GiST/GIST **Faz 4**’te isteğe bağlı (extension yoksa atlanır; `lat`/`lng` durur).
3. **Medya** — Sharp EXIF silme, 1920×1080, WebP, magic byte duruyor. **AVIF eklenmedi** (eski tarayıcı + `picture`/CSS oranı değişir).
4. **Harita** — Leaflet + MarkerCluster local vendor **kaldı**. MapLibre / Supercluster görsel/UX değişikliği — Faz 1 yasak.

`npm run verify:faz1` (+ `verify:passwords` / `verify:indexes`).

### Leftover
- Render’da eski `COOKIE_SAMESITE=lax` varsa kod varsayılanı ezilir; kaldır veya `strict` yaz.
- E-posta linkinden ilk tam sayfa GET Strict çerezi göndermez; doğrulama URL token + aynı origin `POST /api/auth/verify-email`.
- `tl_cookie_ok` / `cookie_consent` JS çerezleri Lax (HttpOnly değil; onay bandı).
- JSONB’ye çeviri + GIN ifade index’i yok (sorgu `LIKE`). PostGIS `geom` Faz 4’te isteğe bağlı.
- AVIF ve MapLibre Yasin onayı + Faz 2+ bekler.

## site-audit-fix (2026-09)

Canlı + kod taraması. Tat değil, doğrulanmış hatalar.

- Sitemap’e `/en/places/:slug`, `/en/blog/:slug` ve EN listing/yasal ikizleri eklendi (hreflang 200 iken sitemap’te yoktu).
- Yinelenen kanonik: `/about` `/contact` `/index.html` `/search.html` vb. artık 301 → sitemap/footer URL.
- `/login` `/admin` `/404` başlığı artık ana sayfa sloganı değil.
- `robots.txt` giriş/kayıt/profil/admin (TR+EN) yollarını Disallow eder. noindex zaten vardı.
- Sitemap / robots `Cache-Control: public, max-age=3600`.
- noindex sayfalarda hreflang yok.
- `npm run verify:audit` (+ `verify:sitemap` / `verify:og` / `verify:links` / `verify:cache`).

Bilinçli bırakılanlar: tasarım 2–5 (OG kart, yazar sıralama, affiliate, ekstra rozet); hava chip’leri; hero 16/9; Instagram `sameAs`; `/admin` HTML herkese açık (API kilitli); GA4/reCAPTCHA/SMTP env Yasin’de. CSP `script-src-attr` Sprint 1’de kalktı.

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
- sameSite varsayılan `strict` (Gemini Faz 1). E-posta doğrulama URL token kullanır. `COOKIE_SAMESITE=lax` ile eski davranış.
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
- Sprint 1: `script-src-attr 'unsafe-inline'` kaldırıldı (`bind-actions.js` + `data-act`).
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

## v2 YÜKSEK-1 (hero karusel)

- Tamamlandı: ana sayfa hero 5 saniyede bir fade (1.5s). İlk kare yerel `/images/hero.webp` (Galata, LCP preload aynı). Sonraki kareler Unsplash: Paris, Kyoto, Roma, Santorini.
- Slogan, arama kutusu ve şehir pill’leri `.hc` içinde duruyor; taşınmadı.
- Overlay `rgba(0,0,0,.4)` duruyor. `prefers-reduced-motion` ve gizli sekme karuseli durdurur.
- Admin Görünüm’den özel hero yüklenirse o görsel **ilk kare** olur; Unsplash kareleri ardından döner.
- `npm run verify:hero`

### Leftover
- Unsplash kareleri uzak URL; WebP srcset yok (CSS background). İlk kare yerel srcset duruyor.
- 2. kare preload edilmedi (LCP’yi bozmamak için).
- Denetimdeki İstanbul Unsplash (`photo-1527838832700`) kullanılmadı — yerelde zaten Galata `hero.webp` var.

## v2 YÜKSEK-2 (reCAPTCHA + form rate limit)

- Tamamlandı: iletişim zaten `contactLimiter` (3 / 5 dk) + reCAPTCHA v3 + honeypot sahte 200.
- Tiola **gönderimi** (`POST /api/tiolas`): `tiolaFormLimiter` 3 / 5 dk (ayrı kova; kayıt/iletişim yorumu kilitlemesin), `recaptchaGuard('tiola')`, honeypot doluysa **sahte 200** (DB’ye yazılmaz, görsel işlenmez). Beğeni (`POST /:id/like`) ORTA-4 `tiolaVoteLimiter` 5/dk — zayıflatılmadı.
- Honeypot, reCAPTCHA’dan önce (bot token’suz da sahte başarı görür). İletişim sırası aynı.
- İstemci: `form-security.js` `attach(..., 'tiola'|'contact')`; mekân ve profil Tiola formlarında gizli `website` alanı. Birden fazla honeypot varsa dolu olan gönderilir.
- Anahtar yoksa reCAPTCHA atlanır (dev). Anahtar uydurulmadı. `.env.example`: `RECAPTCHA_SITE_KEY` / `RECAPTCHA_SECRET` / `RECAPTCHA_MIN_SCORE`.
- `npm run verify:forms` + `npm run verify:votes`

### Leftover
- Canlıda reCAPTCHA **yok** (Render env boş). Yasin https://www.google.com/recaptcha/admin v3 çifti üretip `RECAPTCHA_SITE_KEY` + `RECAPTCHA_SECRET` yazmalı.
- Denetim kopyası “Bot tespit edildi”; ürün metni “Güvenlik doğrulaması başarısız…” (kullanıcıyı bot diye suçlamamak için).
- Denetim 429 metni “Çok fazla deneme. 5 dakika bekleyin.”; ürün “Çok fazla gönderim. 5 dakika sonra tekrar deneyin.”
- 409 mükerrer yıldız da 3/5 dk kovasını tüketir.
- Redis yok; form limiti süreç belleği (Render free restart sıfırlar).

## v2 YÜKSEK-3 (görsel — WebP + lazy + CLS)

- Tamamlandı (önceki YÜKSEK-3 WebP/EXIF üzerine):
  - Mekân kartı `.pc-img` **aspect-ratio 4/3** + `object-fit: cover` (denetim `.place-card img`).
  - `img { max-width: 100%; height: auto }` zaten vardı.
  - `TL_IMG.tag` kartlara `width="400" height="300"` ve alt `"[mekân] — Touristlio"`.
  - Public HTML `<img>`: `loading="lazy"`, `width`/`height`, `alt` (404/500 logo, footer, pdImg).
  - Hero LCP: CSS arka plan + `<link rel="preload" fetchpriority="high">` — `<img loading="eager">` değil (karusel bozulmasın).
  - Karusel Unsplash kareleri `fm=webp`.
- `npm run verify:images`

### Leftover
- Hero tam ekran (100vh); denetimin `.hero-slide { aspect-ratio: 16/9 }` kuralı overlay `inset:0` yüzünden uygulanmadı — 16/9 hero’yu kısaltır.
- `hero.webp` gerçek boyutu 1200×800, denetim 1920×1080.
- Admin paneli img width/height tek tek eklenmedi.
- Leaflet tile PNG’leri WebP değil (harita kırılmasın).

## v2 YÜKSEK-4 (OG meta)

- Tamamlandı (KRİTİK-5 enjeksiyonu üzerine):
  - Ana sayfa: `og:title` slogan, `og:image` + `twitter:image` **hero.webp** (mutlak `SITE_URL` / www), `twitter:card` = summary_large_image, `og:url`, canonical, hreflang tr/en/x-default.
  - Mekân `/places/:slug`: `og:type` **place**, başlık `{ad} — Touristlio`, açıklama ≤160, görsel mekân fotoğrafı.
  - Blog `/blog/:slug`: `og:type` **article**, kapak görseli, açıklama ≤160.
  - Diğer sayfalar `og:type` website. Statik `index.html` fallback artık logo değil hero.webp.
  - İstemci detay açılınca OG/Twitter güncellenir (paylaşım / SPA).
- `npm run verify:og`

### Leftover
- Denetim ana sayfa açıklaması “Topluluk tabanlı seyahat rehberi.”; ürün daha uzun (destinasyon + Tiola + OSM) — Google için daha iyi, kısaltılmadı.
- Facebook resmi OG tipleri arasında `place` nadir; denetim istediği için kullanıldı.
- Dil değiştirince `i18n.js` ana sayfa OG’sine çekebilir (mekân sayfasında). Crawler sunucu HTML’i okur.
- SPA sekmeleri (`#explore` hash) sunucu OG’si ana sayfa kalır.

## v2 YÜKSEK-5 (sitemap kalite filtresi)

- Tamamlandı (mevcut dinamik `GET /sitemap.xml` üzerine):
  - Mekânlar: `COALESCE(status,'published') = 'published'` (denetim `verification_status`; bu şemada `status`). Draft ve arşiv yok.
  - Slug zorunlu — `/places/{id}` yedek URL sitemap’e yazılmaz.
  - Koordinat: `lat`/`lng` dolu ve **0 değil** (Null Island). Aralık dışı da elenir.
  - Bloglar: `status = 'approved'` (denetim `is_published=true` / `blog_posts` yok). `lastmod` = `published_at` veya `created_at`, öncelik **0.7**, `monthly`.
  - Mekân önceliği denetim örneği gibi **0.8** / weekly.
  - Statik 200 sayfalar duruyor (/, /en/, gezilecek-yerler, blog, search, yasal). `/admin` `/login` yok.
- `npm run verify:sitemap`

### Leftover
- `places` tablosunda `updated_at` yok; mekân `lastmod` bugünün tarihi (Google kabul eder).
- İngilizce mekân `/en/places/:slug` ve blog `/en/blog/:slug` sitemap’te yok (hreflang HTML’de var). Denetim örneği yalnızca TR `/places/` ve `/blog/`.
- Ekvator / Greenwich (lat veya lng tam 0) olan gerçek noktalar da elenir — denetim “0 olmamalı”.
- `public/sitemap.xml` gitignore’da; canlı kaynak rota. Deploy sonrası `https://www.touristlio.com/sitemap.xml` 200 doğrula.

## v2 ORTA-2 (mobil uyum)

- Tamamlandı (DÜŞÜK-1 48px / overflow-x / viewport üzerine; yalnızca boşluklar):
  - Global `* { box-sizing: border-box }` ve `img { max-width: 100% }` zaten vardı — silinmedi.
  - Viewport tüm kamu HTML’de `width=device-width, initial-scale=1.0` (denetim `1`).
  - 48×48 dokunma hamburger kırılımına alındı (`≤900px`): `.btn`, `.ntab`, `.nav-toggle`, `.nav-link-plain`, `.nav-btn-*` + `inline-flex` / `align-items:center`. Masaüstü şerit aynı. İkon/chip hâlâ `::after` (görsel kutu büyümez).
  - Menü açıkken `document.body.style.overflow = 'hidden'`, kapanınca `''` (CSS `nav-open` kilidi duruyor).
  - 320px: `overflow-x: clip` + çerez / tur saati / harita popup `min-width:0`.
- `npm run verify:mobile`

### Leftover
- Chip 48px isabet komşu pill ile örtüşebilir (görsel boyut bilinçli).
- Admin hamburger yok; topnav yatay kayar.
- Canlı 320px telefon testi Yasin’de (bu ortam gerçek cihaz yok).

## v2 ORTA-3 (Google Analytics — rıza sonrası)

- Tamamlandı (DÜŞÜK-6 üzerine; denetim kopyası yeniden yazılmadı):
  - Denetim `localStorage cookie_consent` → gerçek anahtar `tl_cookie_ok` (`1` / `0`). Kabul/red aynı anda `cookie_consent=accepted|rejected` yazar.
  - Denetim `loadAnalytics` → `analytics.js` içinde rıza kapılı `loadAnalytics` (DOMContentLoaded + çerez kabulü). GA4 ID `/api/config/public` üzerinden gelir; G- kodu HTML/JS’e gömülmez.
  - Kabul: `tl_cookie_ok=1` + `cookie_consent=accepted` + `loadAnalytics()`. Red: `tl_cookie_ok=0` + `cookie_consent=rejected` — gtag yüklenmez.
  - `GA_MEASUREMENT_ID` boşken GA4 kapalı; CSP Google host’ları yalnızca geçerli `G-` ID varken açılır.
  - `.env.example` değeri boş duruyor (`GA_MEASUREMENT_ID=`). Yorumda format: `GA_MEASUREMENT_ID=G-XXXXXXXXXX`.
- `npm run verify:analytics`

### Leftover
- Canlıda GA4 **yok** (Render env boş). Yasin Google Analytics 4’te Measurement ID üretip `GA_MEASUREMENT_ID` yazmalı.
- Sahte `G-` ID uydurulmadı. ID yokken yalnızca birinci taraf izleme (yine rıza sonrası) çalışır.
- DÜŞÜK-6 Search Console / web-vitals aynı kaldı; bu madde yalnızca rıza sonrası GA4 boşluklarını hizalar.

## v2 ORTA-5 (admin paneli güvenliği)

- Tamamlandı (mevcut `requireRole` / argon2id / CSRF / rate limit üzerine; yalnızca boşluklar):
  - Tüm `/api/admin` zaten `authRequired` + `requireRole(...PANEL_ROLES)`. UI gizleme yetmez; API 403 `Yetki yok`. Hassas uçlar `requireRole('admin')`.
  - Brute force zaten vardı: 5 hatalı giriş → 15 dk `locked_until`. Eksik olan **log**: `event: failed_login` (maskeli e-posta, IP, kilit). Şifre loglanmaz.
  - Silme artık soft: yer `status='archived'` (`archivePlace`; denetim `deleted_at` yok), blog `status='deleted'`, şehir/kategori `is_active=0`. Tiola kaldırma zaten `rejected`.
  - `admin_audit_log` (denetim `admin_logs`) duruyor; eksik yazan mutasyonlar eklendi (info-box, medya, araçlar, blog sayfası).
- `npm run verify:admin-security` (+ `verify:admin-role`)

### Leftover
- `/admin` HTML herkese açık; panel JS ile kilitli. Korunan yüzey API.
- `deleted_at` kolonu eklenmedi — şemada `status` / `is_active`.
- `deletePlace()` hard fonksiyonu duruyor; HTTP onu çağırmıyor.
- IP `authLimiter` 20 / 15 dk (hesap kilidi 5 / 15 ayrı).
- `banned_words` ve yüklenen dosya silmesi hâlâ kalıcı (sözlük / disk).
- Kategori kullanımda taşınıp pasifleşir (eski otomatik taşıma).

## v2 DÜŞÜK-1 (kod temizliği)

- Tamamlandı (v1 DÜŞÜK-5 üzerine; yeniden yazılmadı, yalnızca boşluklar):
  - Production tarayıcı: `console.log` / `debug` / `info` / **warn** no-op. `console.error` duruyor.
  - Sunucu seed (açılışta çalışır) `console.log` → `logger.info`. CLI `npm run seed` “Seed complete.” aynı.
  - `npx depcheck`: silinecek paket yok. `web-vitals` require edilmez; `public/vendor/web-vitals` + `analytics.js` kullanır — silinmedi.
  - CSS: v1 birleştirmesi duruyor. Medya sorgusu kopyaları (`style.css` + `inline-overrides.css`) bilinçli bırakıldı.
  - `.env.example` güncellendi: `TRUST_PROXY`, `COOKIE_*`, `DISABLE_WWW_REDIRECT`, `DISABLE_HTTPS_REDIRECT`, `SEED_ON_START`, `STORAGE_PERSISTENT`, `APP_VERSION`. CORS yorumu www. Değer uydurulmadı.
  - `npm run verify:cleanup` (yerel sunucu bekleme 400 deneme — DB yavaş açılınca 10 sn yetmiyordu)

### Leftover
- İstemci `escapeHtml` hâlâ birden fazla dosyada.
- CLI `verify:*` / yer script’leri `console.log` kullanır (tarayıcı değil).
- `inline-overrides.css` büyük; medya sorgusu tekrarları birleştirilmedi.
- `pino-pretty` yalnızca development.
- `server/scripts/awaitify-db.py` commit edilmedi.

## v2 DÜŞÜK-2 (Cache-Control başlıkları)

- Tamamlandı (mevcut `staticAssetHeaders` / HTML no-cache üzerine; v1 DÜŞÜK-2 erişilebilirlik ile karıştırma):
  - HTML zaten `no-cache, no-store, must-revalidate` (`sendPublicHtml` + `.html` static). Helmet Cache-Control yazmıyor — dokunulmadı.
  - JS/CSS zaten `public, max-age=31536000, immutable` (`?v=__APP_VERSION__`). Denetimin 1 gün kopyası uygulanmadı — sürümlemeli dosya 1 yıl güvenli.
  - Görseller/font zaten `public, max-age=86400`. Denetimin `/images` 1 yıl kopyası uygulanmadı — `hero.webp` hash’siz; admin/değişimde 1 yıl bayat kalırdı.
  - **Boşluk kapatıldı:** `GET /api/*` → `Cache-Control: no-store` (`apiNoStoreHeaders`).
  - **Boşluk kapatıldı:** `/uploads` artık `public, max-age=86400` (aynı yol üzerine yazılabilir; 1 yıl immutable değil).
  - Ayrı `/images` `/css` `/js` mount yok; tek `express.static` + `setHeaders` duruyor.
  - `npm run verify:cache`

### Leftover
- Denetim görseller 1 yıl / JS-CSS 1 gün; ürün tersi (görsel 1 gün, sürümlemeli JS/CSS 1 yıl). Bilinçli.
- `hero.webp` ve logo `?v=6` hash değil; dosya değişince Ctrl+Shift+R veya sürüm bump.
- Sitemap / robots.txt özel Cache-Control yok (dinamik rota, Express varsayılanı).
- Cloudflare / Render CDN kendi cache kuralı eklerse HTML/API `no-store` yine kazanmalı; Yasin panelinden doğrula.
- `server/scripts/awaitify-db.py` commit edilmedi.

## v2 ORTA-4 (0 Tiola gösterimi)

- Tamamlandı (ORTA-1 kart puanı üzerine; v1 ORTA-4 anti-bot ile karıştırma):
  - Puan 0 / null ise yıldız ve `0.0` yok. Kart, keşfet, arama, yakındaki/benzer ve detay: **Henüz değerlendirme yok**.
  - Puan varsa yıldız + `4.2 (12 Tiola)` duruyor. Google puanı yok.
  - Detayda **İlk Tiola'yı sen yaz!** (`#firstTiolaCta`): girişsiz `openAuth`, girişli forma kaydırır.
  - Unique `(user_id, place_id)` zaten var: `idx_tiolas_unique_user_place_vote` (007). İkinci tam UNIQUE eklenmedi — `parent_id` yanıtları ve yıldızsız yorum (ayda 5) aynı çifti kullanır.
  - Ortalama yalnızca `status = 'approved'` + üst seviye + yıldız > 0 (`tiola-stats.js`).
- `npm run verify:tiolas`

### Leftover
- Tam `UNIQUE (user_id, place_id)` yok: yanıt satırları ve yıldızsız ikinci Tiola (aylık 5) kırılırdı. Oy unique + 409 duruyor.
- Arama kartında boş durumda yıldız yok; dolu durumda sayı + adet (keşfet kartındaki tam yıldız satırı değil).
- CTA yalnızca puan 0 iken. Listede zaten onaylı Tiola varken form kilit metni duruyor.

## v2 ORTA-1 (erişilebilirlik WCAG)

- Tamamlandı (DÜŞÜK-2 skip-link / label / aria üzerine):
  - Skip link “İçeriğe geç” + `#main-content` (odaklanınca görünür). Denetimin `left:-9999px` kopyası kullanılmadı — mevcut `top:-80px` / `:focus { top:8px }` daha az kaydırır.
  - Nav logo `alt="Touristlio ana sayfaya git"` (`logoHomeAlt` i18n). Footer / auth logosu tıklanabilir değil, `alt="Touristlio"` kaldı.
  - Formlar gerçek `<label for>` (görünür veya `.sr-only`); `a11y.js` eksikleri tamamlar.
  - Favori kalbi: `aria-label="Favorilere ekle: {yer adı}"`.
  - Filtre sonucu `#results-count` `aria-live="polite"` (`resCnt` + “yer bulundu”). Arama sayfası aynı id.
  - `:focus-visible` global duruyor; tur formu `outline:none` sonrası geri yüklendi.
- `npm run verify:a11y`

### Leftover
- Denetim outline rengi `#007bff`; marka `--b2` kullanılıyor (3px).
- Leaflet vendor PNG alt’ları yok (harita kontrol ikonları).
- Admin dinamik hücre görselleri jenerik alt.
- Canlı ekran okuyucu testi Yasin’de.

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
- v2: kart CLS 4/3 + width/height `img.js` / `.pc-img` ile tamamlandı.

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
- Honeypot: gizli `website` alanı; doluysa iletişim **ve Tiola gönderimi** sahte 200; kayıt hâlâ 400; DB’ye yazılmaz.
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
- Keşfet kartlarında hâlâ Google yok. Boş puan v2 ORTA-4 ile “Henüz değerlendirme yok”.
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
  - JSON etiketler: `idx_places_categories` TEXT. `009_jsonb_gin` yalnızca gerçek JSONB sütununa GIN ekler (şimdilik yok).
  - Sıralama/LIMIT: `idx_places_tiola_rating`.
- ORTA-3 leftover: `GET /api/places` ve `GET /api/search` artık SQL `COUNT` + `LIMIT/OFFSET` (`searchPlacesPage`). Bellekte slice yalnızca FTS yoksa.
- `npm run verify:indexes` — PRAGMA index_info, EXPLAIN QUERY PLAN, SQL LIMIT, canlı liste.
- Google puanı yok; skor `places.tiola_rating`.

### Leftover
- SQLite `LIKE '%x%'` baştaki joker yüzünden her zaman index kullanmayabilir; `turkey%` öneki + expression index var.
- `az` sıralama SQL `COLLATE NOCASE` (Türkçe `localeCompare` değil).
- JSON dizi üyeliği GIN değil; `LIKE %"slug"%`. TEXT→JSONB dönüşümü yok (Gemini Faz 1 leftover).
- PostGIS yok; `idx_places_lat_lng` btree. Harita `lat`/`lng` kullanmaya devam eder.
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
- `console.warn` production kapatması v2 DÜŞÜK-1’de.
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

## v2 tasarım-1 (mobil filtre → alt çekmece)

- Tamamlandı (Yasin yalnızca bu tasarım notunu onayladı; OG kart / Tiola sıralama / sponsored / ekstra rozet yok):
  - ≤900px (hamburger kırılımı): Keşfet ve Gezilecek Yerler’de **Filtrele** mevcut filtreleri alt çekmeceye taşır (chip, kategori, gelişmiş ülke/şehir/yıldız). İkinci filtre sistemi yok; `TL_EXPLORE_QUERY` aynı.
  - Karartılmış backdrop; backdrop / Kapat / Uygula kapatır. Açıkken `overflow: hidden` (nav menü ile aynı), kapanınca açılır.
  - Masaüstü/tablet (≥901px) şerit ve Gelişmiş Filtrele sekmesi aynı. Mobilde o sekme çekmeceyi açar.
  - i18n TR/EN: Filtrele / Uygula / Kapat. `role="dialog"` `aria-modal` odak + Escape.
- `npm run verify:filter-sheet`

### Leftover
- Hava / erişilebilirlik chip’leri hâlâ görsel (listeyi filtrelemez) — önceki davranış.
- Canlı telefon kaydırması Yasin’de (bu ortam gerçek cihaz değil).
- Tasarım notları 2–5 (paylaşım OG kartı, Tiola yazar sıralaması, sponsored/affiliate, ekstra rozet) **yapılmadı**.

## Genel
- Görevler bitince bu listedeki her maddeyi sırayla açıp kapat.
- Tam denetim kopyası: `/workspace/touristlio_cursor_audit.md`
