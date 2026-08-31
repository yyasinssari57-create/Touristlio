# TOURISTLIO.COM — KAPSAMLI TEKNİK DENETİM & CURSOR GÖREV PANELİ

> **Kaynak:** DeepSeek AI + Manus AI + Gemini AI raporları + Site incelemesi  
> **Tarih:** 30 Ağustos 2026  
> **URL:** https://www.touristlio.com  
> **Amaç:** Cursor'da sırayla uygulanacak teknik görevler listesi.

---

## 🗺️ PLATFORM BİLGİSİ (Context)

Touristlio.com, "Sadece Ziyaret Etme. Hisset." mottosuyla konumlanan topluluk tabanlı bir seyahat rehberliği platformudur. Kullanıcılar mekânları **Tiola** adı verilen mikro değerlendirmeler ve gezi yazıları (blog) aracılığıyla paylaşır.

**Temel modüller:**
- Tiola değerlendirme sistemi (1–5 yıldız, 14 kategori, fotoğraf yükleme)
- Seyahat hikayeleri / Blog (onay mekanizmalı)
- Çok boyutlu filtreleme motoru (kıta, ülke, şehir, fiyat, hava, erişilebilirlik, skor)
- Kullanıcı paneli (gezilen ülkeler, favoriler, rozetler)
- OpenStreetMap tabanlı harita katmanı
- Çok dilli arayüz (TR / EN)
- Misafir modu: okuyabilir, Tiola için üye olması gerekir

---

## 🚨 KRİTİK SORUNLAR — ÖNCE BUNLAR (Seviye 1)

---

### [KRİTİK-1] Veritabanı Boş — "0 places found"

**Sorun:** Tüm destinasyon/mekan tablosu boş. Arama, filtreleme ve kategori çalışmıyor.

**Cursor Görevi:**
```
1. Destinations / locations tablosunu kontrol et, neden boş olduğunu bul.
2. API endpoint'i test et: /api/locations veya /api/places — yanıt döndürüyor mu?
3. Seed data dosyası oluştur: En az 50 profesyonel destinasyon (Türkiye + Avrupa + Asya).
   - Her kayıtta: ad, slug, açıklama (TR+EN), koordinatlar, kategori, fiyat aralığı, görsel URL
4. Seed script'i çalıştır ve API'nin veri döndürdüğünü doğrula.
```

---

### [KRİTİK-2] Detay Sayfaları 404 Hatası Veriyor

**Sorun:** `/places/{slug}` dinamik rota sayfaları 404 dönüyor.

**Cursor Görevi:**
```
1. /places/:slug rotasını kontrol et — dinamik route tanımlı mı?
2. Server-side rendering veya client-side routing'i düzelt.
3. Detay sayfasında şunlar gösterilmeli:
   - Görseller, açıklama (TR/EN), harita koordinatı,
     Tiola puanı, yorum sayısı, favoriye ekleme butonu
4. Geçersiz slug gelirse özelleştirilmiş 404 sayfasına yönlendir.
```

---

### [KRİTİK-3] İletişim Formu "Under Development" Durumunda

**Sorun:** `/legal/contact.html` sadece "Under Development" mesajı gösteriyor.

**Cursor Görevi:**
```
1. İletişim formunu tamamla:
   - Alanlar: Ad Soyad, E-posta, Konu, Mesaj
   - Client-side ve server-side validation
   - Başarı/hata mesajları kullanıcıya gösterilmeli
2. Rate limiting: aynı IP'den 5 dakikada max 3 form gönderimi.
3. Tasarıma dokunma, sadece fonksiyonelliği tamamla.
```

---

### [KRİTİK-4] robots.txt ve sitemap.xml Erişilemiyor

**Sorun:** Her iki dosya da erişilemiyor. Google siteyi düzgün indeksleyemiyor.

**Cursor Görevi:**
```
1. /public/robots.txt dosyası oluştur:

User-agent: *
Allow: /
Disallow: /admin
Disallow: /api
Sitemap: https://www.touristlio.com/sitemap.xml

2. Dinamik sitemap.xml oluştur (/sitemap.xml route):
   - Ana sayfa, tüm mekan sayfaları, tüm blog yazıları, statik sayfalar
   - Her URL için lastmod, changefreq, priority ekle
```

---

### [KRİTİK-5] SEO — Canonical URL Çakışması + OG Image Sorunu

**Sorun (site incelemesinde tespit edildi):**
- Canonical tag `https://touristlio.com/` (www'suz) gösteriyor ama site `www.touristlio.com` üzerinde çalışıyor. Bu çakışma Google'ı karıştırır.
- `og:image` değeri logo dosyası olarak ayarlı (`/images/logo-round.png`). Sosyal medyada paylaşılınca logo görünür, hiç profesyonel durmuyor.
- Twitter Card etiketleri eksik.

**Cursor Görevi:**
```
1. Canonical URL'yi www ile eşleştir:
   <link rel="canonical" href="https://www.touristlio.com/[sayfa]" />

2. og:image'ı logo yerine gerçek bir hero görsel URL'siyle değiştir:
   <meta property="og:image" content="https://www.touristlio.com/images/hero.webp">

3. Her sayfaya dinamik og:title ve og:description ekle
   (şu an hepsi aynı genel metni gösteriyor).

4. Twitter Card etiketlerini ekle:
   <meta name="twitter:card" content="summary_large_image">
   <meta name="twitter:title" content="...">
   <meta name="twitter:description" content="...">
   <meta name="twitter:image" content="...">

5. TR/EN dil desteği var ama hreflang yok, ekle:
   <link rel="alternate" hreflang="tr" href="https://www.touristlio.com/" />
   <link rel="alternate" hreflang="en" href="https://www.touristlio.com/en/" />
```

---

### [KRİTİK-6] Şifre Saklama Güvenlik Hatası

**Sorun (Gemini + site incelemesi):**
- Arayüzde "🔒 AES-256 şifreleme" yazıyor. Simetrik şifreleme şifreler için yanlış bir yöntem — anahtar sızdırılırsa tüm şifreler açık metin olarak ele geçirilir.
- Ayrıca bu bilgiyi UI'da göstermek gereksiz — potansiyel saldırganlara ipucu veriyor.
- Mevcut şifre politikası: min 8 karakter — yetersiz.

**Cursor Görevi:**
```
1. Auth servisinde şifre saklama mekanizmasını Argon2id ile değiştir.
   (bcrypt da kabul edilebilir, salt rounds min 12)
2. Sabit zamanlı karşılaştırma kullan (constant-time comparison).
3. Şifre politikasını güncelle: minimum 12 karakter.
4. UI'daki "AES-256 şifreleme" yazısını kaldır veya sadece
   "Güvenli şifreleme" şeklinde değiştir — teknik detay dışarıya yazılmamalı.
```

---

### [KRİTİK-7] WWW Yönlendirme (301 Redirect) + Canonical Tutarsızlığı

**Sorun:** `touristlio.com` ve `www.touristlio.com` arasında 301 yönlendirme eksik. Canonical ile çakışıyor.

**Cursor Görevi:**
```
1. touristlio.com → https://www.touristlio.com şeklinde 301 yönlendirme kur.
2. http:// → https:// yönlendirmesinin aktif olduğunu doğrula.
3. next.config.js / vercel.json / nginx config'de tanımla.
4. Canonical tag'leri de www ile tutarlı hale getir ([KRİTİK-5] ile birlikte).
```

---

## ⚠️ YÜKSEK ÖNCELİKLİ SORUNLAR (Seviye 2)

---

### [YÜKSEK-1] Hero Bölümüne Profesyonel Görsel Eklenmesi

**Sorun:** Hero alanı şu an sadece metin içeriyor. Seyahat platformu için büyük görsel standarttır.

**Cursor Görevi:**
```
1. Hero bölümüne tam genişlikte (full-width) statik bir arka plan görseli ekle.
2. Görsel önerisi (ücretsiz, lisanssız):
   https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=1920&q=80
   (Seyahat/dünya temalı, profesyonel)
   Alternatif:
   https://images.unsplash.com/photo-1506929562872-bb421503ef21?w=1920&q=80

3. Görselin üzerine hafif karanlık overlay ekle (rgba(0,0,0,0.4))
   böylece üstündeki metin rahat okunur.

4. Mevcut metinler ("Sadece Ziyaret Etme. Hisset." ve şehir butonları)
   görselin üzerinde olduğu gibi kalsın — hiçbir şeyi taşıma veya silme.

5. Görsel mobile'da da düzgün görünsün (background-size: cover, background-position: center).

6. Görseli /images/ klasörüne hero.webp olarak kaydet (WebP formatında).
```

---

### [YÜKSEK-2] Harita Entegrasyonu Çalışmıyor

**Sorun:** Harita butonu var ancak harita gösterilmiyor. Koordinat verileri eksik.

**Cursor Görevi:**
```
1. OpenStreetMap (Leaflet.js) bileşenini kontrol et, hata loglarına bak.
2. Mekân verilerinde lat/lng koordinatlarının dolu olduğunu doğrula.
3. Çok sayıda pin yüklendiğinde performans için marker clustering uygula.
4. Kategori filtresiyle harita pinleri senkronize olmalı.
5. Haritanın görsel yapısına dokunma, sadece çalışmasını sağla.
```

---

### [YÜKSEK-3] Görsel Optimizasyon — WebP + Lazy Loading + EXIF Temizleme

**Sorun:** Görseller optimize edilmemiş. Yüklenen fotoğraflarda GPS koordinatları EXIF metadata olarak sızıyor (KVKK/GDPR ihlali).

**Cursor Görevi:**
```
1. Mevcut statik görselleri .webp formatına çevir.
2. Tüm <img> tag'lerine loading="lazy" ekle (hero görseli hariç — o eager olacak).
3. Sharp kütüphanesiyle upload middleware yaz:
   - EXIF metadata tamamen temizle (.withMetadata(false))
   - Max çözünürlük: 1080p
   - Otomatik WebP dönüşümü
   - Magic Byte doğrulaması: sadece jpeg, png, webp kabul et
4. Büyük görseller için srcset ekle.
```

---

### [YÜKSEK-4] JSON-LD Schema.org Yapılandırılmış Veri Eksik

**Sorun:** Google zengin sonuç gösteremiyor. "Lio" araması El Nido/Lio Beach ile çakışıyor.

**Cursor Görevi:**
```
1. Ana sayfaya TravelAgency şeması ekle:
{
  "@context": "https://schema.org",
  "@type": "TravelAgency",
  "name": "Touristlio",
  "url": "https://www.touristlio.com",
  "logo": "https://www.touristlio.com/images/logo.webp",
  "description": "Topluluk tabanlı seyahat rehberliği platformu"
}

2. Her mekan detay sayfasına dinamik TouristAttraction şeması ekle.
3. Her blog yazısına Article şeması ekle.
4. Her Tiola için Review şeması ekle.
5. İletişim sayfasına ContactPage şeması ekle.
```

---

### [YÜKSEK-5] Ana Sayfa İstatistikleri "—" Gösteriyor

**Sorun (site incelemesinde tespit edildi):** Ana sayfada "Kapsanan Ülke —, Listelenen Yer —, Tiola —" şeklinde tire gösteriyor. Hiç değer yoksa 0 göstermeli, profesyonel durmuyor.

**Cursor Görevi:**
```
1. İstatistik değerleri API'den null/undefined gelirse "—" yerine "0" göster.
2. Veri yüklenirken placeholder olarak "..." veya skeleton göster.
3. Değerler gelince animasyonlu sayaç ile göster (opsiyonel ama etkileyici).
```

---

### [YÜKSEK-6] Error Boundary Eksikliği

**Sorun:** JS hatası olunca sayfa tamamen beyaz kalıyor.

**Cursor Görevi:**
```
1. Tüm uygulamayı saran <ErrorBoundary> bileşeni oluştur.
2. Hata durumunda fallback UI:
   - "Bir şeyler ters gitti" mesajı
   - "Ana Sayfaya Dön" ve "Sayfayı Yenile" butonları
   - Hata detayı sadece development modunda görünsün
3. Harita, Tiola listesi ve form bölümlerini ayrı ErrorBoundary ile sar.
4. Görsel tasarıma dokunma, sadece fonksiyon.
```

---

### [YÜKSEK-7] Form Güvenliği — reCAPTCHA + Sanitization

**Cursor Görevi:**
```
1. Google reCAPTCHA v3 entegre et (görünmez).
2. Server-side'da tüm form verilerini sanitize et (XSS koruması).
3. Email validasyonu: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
4. Rate limiting: aynı IP'den 5 dakikada max 3 gönderim.
```

---

## 🟡 ORTA ÖNCELİKLİ GÖREVLER (Seviye 3)

---

### [ORTA-1] Tiola Sistemi Görünmüyor

**Cursor Görevi:**
```
1. Mekân kartlarında ortalama Tiola puanı ve yorum sayısını göster.
2. Tiola ekleme formu: login sonrası mekân detay sayfasında aktif olsun.
3. Ortalama puan hesabı: her yeni Tiola'da veritabanında güncelle
   (her seferinde dinamik hesaplatma — performans için önbellekte tut).
4. Rozet sistemi: Tiola sayısına göre rozet kazanma.
```

---

### [ORTA-2] Arama ve Filtreleme State Yönetimi

**Cursor Görevi:**
```
1. Arama değiştikçe sonuçlar gerçek zamanlı güncellensin (debounce: 300ms).
2. Aktif filtreler URL query params'a yazılsın:
   /explore?country=turkey&category=nature&score=4
3. "X yer bulundu" dinamik güncellensin.
4. "Filtreler Temizle" butonu tüm state'i sıfırlasın.
```

---

### [ORTA-3] Sayfalama (Pagination) Eksikliği

**Cursor Görevi:**
```
1. API endpoint'e sayfalama ekle: ?page=1&limit=20
2. "Daha Fazla Yükle" butonu veya sayfa numaraları ekle.
3. Toplam sonuç sayısını API'den döndür.
```

---

### [ORTA-4] Anti-Bot / Sahte Oy Koruması

**Cursor Görevi:**
```
1. Tiola ekleme API'sine Redis tabanlı rate limiter ekle:
   - Kullanıcı başına dakikada 5 istek limiti
   - IP + user ID kombinasyonu kullan
2. CSRF token kontrolü ekle.
3. Anormal davranış için log tut.
```

---

### [ORTA-5] Veritabanı Index'leri — Filtreleme Performansı

**Cursor Görevi:**
```
1. Sık sorgulanan alanlara composite index ekle:
   - (country_id, city_id, score) — mekân listesi
   - (category_id, is_published) — filtreleme
   - (created_at) — blog yazıları
2. JSONB kategori etiketleri varsa GIN index ekle.
3. Migration script olarak yaz.
```

---

### [ORTA-6] Blog Sayfası Çalışır Hale Getir

**Cursor Görevi:**
```
1. Blog yazıları listesini API'den çek ve listele.
2. Her kart: başlık, kategori, yazar, tarih, özet, kapak görseli.
3. Blog detay sayfası (/blog/:slug) çalışır hale getir.
4. is_published = true olan yazılar gösterilsin.
```

---

### [ORTA-7] Kullanıcı Sistemi Tamamlama

**Cursor Görevi:**
```
1. Login/Register hata mesajlarını düzelt.
2. JWT/session: token expire olunca kullanıcı logout olsun.
3. Favori ekleme/çıkarma backend'e kaydedilsin.
4. Profil sayfası: Tiola'lar, favoriler, gezilen ülkeler, rozetler.
5. Şifre unutma/sıfırlama akışı çalışsın.
```

---

## 🟢 DÜŞÜK ÖNCELİKLİ İYİLEŞTİRMELER (Seviye 4)

---

### [DÜŞÜK-1] Mobil Uyum Kontrolleri

```
1. 320px–480px ekranlarda tüm sayfaları test et.
2. Butonlara minimum 48x48px dokunma alanı ver.
3. Görseller max-width: 100% ile taşmamalı.
4. Menü açıkken sayfa scroll'unu kilitle.
5. Layout, renk ve buton şekillerine dokunma.
```

---

### [DÜŞÜK-2] Erişilebilirlik (Accessibility)

```
1. Tüm görsellere açıklayıcı alt text ekle.
2. Tüm form input'larına <label> ekle.
3. İkon butonlarına aria-label ekle.
4. Tab ile gezinme çalışıyor olmalı, focus outline görünür olmalı.
```

---

### [DÜŞÜK-3] Loading States — Skeleton Loader

```
1. API isteği süresince mekân kartları için skeleton göster.
2. Buton tıklanınca loading spinner ekle (form submit, favori ekleme).
3. Skeleton rengi mevcut renk paleti ile uyumlu olsun.
```

---

### [DÜŞÜK-4] Kırık Linkleri Düzelt

```
1. Footer ve menüdeki tüm iç linkleri test et.
2. 404 veren linkleri düzelt veya kaldır.
3. Özelleştirilmiş 404 sayfasında ana sayfaya yönlendiren buton olsun.
```

---

### [DÜŞÜK-5] Kod Temizliği

```
1. Production'da console.log'ları kaldır.
2. package.json — kullanılmayan paketleri sil.
3. Tekrar eden CSS stillerini birleştir.
4. Kullanılmayan import'ları temizle.
```

---

### [DÜŞÜK-6] Analitik ve İzleme

```
1. Google Analytics 4 (GA4) entegre et.
2. Google Search Console doğrulama meta tag'i ekle.
3. Core Web Vitals için web-vitals kütüphanesi ekle.
```

---

## 📋 ÖNCELİK SIRALI GÖREV LİSTESİ

| # | Görev | Seviye | Kategori |
|---|-------|--------|----------|
| 1 | Veritabanı doldur (50+ destinasyon) | KRİTİK | Backend |
| 2 | Detay sayfaları 404 düzelt | KRİTİK | Frontend |
| 3 | İletişim formu tamamla | KRİTİK | Full-stack |
| 4 | robots.txt + sitemap.xml oluştur | KRİTİK | SEO |
| 5 | Canonical + OG image + hreflang düzelt | KRİTİK | SEO |
| 6 | Şifre → Argon2id + UI'dan AES yaz kaldır | KRİTİK | Güvenlik |
| 7 | WWW 301 yönlendirme | KRİTİK | Altyapı |
| 8 | Hero profesyonel görsel ekle | YÜKSEK | UX |
| 9 | Harita entegrasyonu düzelt | YÜKSEK | Frontend |
| 10 | WebP + lazy loading + EXIF temizle | YÜKSEK | Performans/KVKK |
| 11 | JSON-LD Schema.org ekle | YÜKSEK | SEO |
| 12 | Ana sayfa istatistikleri "—" → "0" | YÜKSEK | Frontend |
| 13 | Error Boundary ekle | YÜKSEK | Kod kalitesi |
| 14 | Form güvenliği (reCAPTCHA) | YÜKSEK | Güvenlik |
| 15 | Tiola sistemi görünür hale getir | ORTA | Feature |
| 16 | Arama/filtreleme state yönetimi | ORTA | Frontend |
| 17 | Pagination ekle | ORTA | Frontend |
| 18 | Anti-bot rate limiting | ORTA | Güvenlik |
| 19 | Veritabanı index'leri | ORTA | Performans |
| 20 | Blog sayfası çalışır hale getir | ORTA | Feature |
| 21 | Kullanıcı sistemi tamamla | ORTA | Feature |
| 22 | Mobil uyum kontrolleri | DÜŞÜK | UX |
| 23 | Erişilebilirlik (alt, label, aria) | DÜŞÜK | A11y |
| 24 | Loading states (skeleton) | DÜŞÜK | UX |
| 25 | Kırık linkleri düzelt | DÜŞÜK | Teknik |
| 26 | Kod temizliği | DÜŞÜK | Kalite |
| 27 | Google Analytics + Search Console | DÜŞÜK | Analitik |

---

## 🔍 SİTE İNCELEMESİNDE TESPİT EDİLEN EK BULGULAR
*(AI botlarının raporlarında yer almayan, benim fark ettiğim sorunlar)*

1. **Canonical ↔ WWW çakışması:** Canonical `touristlio.com` gösterirken site `www.touristlio.com` üzerinde çalışıyor. Çift sorun.
2. **og:image logo dosyası:** Sosyal medyada paylaşılınca logo görünüyor, hero görsel değil.
3. **hreflang eksik:** TR/EN dil desteği var ama arama motorlarına bildirilmiyor.
4. **İstatistikler "—" gösteriyor:** 0 bile göstermemek profesyonel durmuyor.
5. **"AES-256" UI'da yazıyor:** Güvenlik açığı bilgisi dışarıya açık — kaldırılmalı.

---

## 🔧 CURSOR'DA KULLANIM TALİMATI

```
@touristlio_cursor_audit.md — [KRİTİK-1] numaralı görevi uygula.
Her görevi tamamladıktan sonra dur ve onay bekle.
```

---

*Derleyen: Claude (DeepSeek + Manus + Gemini raporları + canlı site incelemesi)*  
*Son güncelleme: 30 Ağustos 2026*
