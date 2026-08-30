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

## Genel
- Görevler bitince bu listedeki her maddeyi sırayla açıp kapat.
