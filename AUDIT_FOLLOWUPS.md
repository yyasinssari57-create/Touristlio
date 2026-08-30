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
- KRİTİK-8 **başlanmadı**.

## KRİTİK-8 (KVKK analitik / çerez onayı)

- Tamamlandı (kod): ziyaret analitiği `localStorage tl_cookie_ok=1` + çerez `tl_cookie_ok=1` olmadan **POST yazılmaz**.
- Banner’da **Kabul / Reddet**; giriş, kayıt, arama, profil sayfalarında da banner.
- **Dosya notu:** `touristlio_cursor_audit.md` bu ortamda 507 satır; okunan kopya satır 150’de KRİTİK-7’de kesiliyor. KRİTİK-8 başlığı dosyada doğrulanamadı; bu madde KVKK + sessiz `/api/analytics/track` (önceki leftover) ile ele alındı.
- Canlıda: çerez reddi sonrası Network’te `track` olmamalı; kabul sonrası `stored: true`.
- Eski `tl_cookie_ok` kabulü olan kullanıcılar analitiği sürdürür (cookie senkron).

## Kalan başlıklar (satır 151–497 okunamadı)

Tam listedeki sonraki `[YÜKSEK-N] / [ORTA-N] / [DÜŞÜK-N]` başlıkları Downloads’taki 507 satırlık dosyada. Transkript grep’inde yalnızca dipnot:

- ~498: `@touristlio_cursor_audit.md — [KRİTİK-1] numaralı görevi uygula.`
- ~499: `Her görevi tamamladıktan sonra dur ve onay bekle.`
- ~504–505: derleyen / 30 Ağustos 2026

Sıradaki ajan: tam dosyayı offset 150 ile oku; uydurma başlık kullanma.

## Genel
- Görevler bitince bu listedeki her maddeyi sırayla açıp kapat.
