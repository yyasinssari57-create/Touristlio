# Touristlio — Canlıya Alma (Render)

Bu rehber, GitHub’daki repoyu Render’da yayına almak içindir.

> **Render kart kabul etmiyor veya VPS tercih ediyorsanız:** adım adım Hetzner kurulumu için **[DEPLOY_HETZNER.md](./DEPLOY_HETZNER.md)** dosyasına bakın (`deploy/hetzner/` yapılandırma dosyaları dahil). Render rehberi silinmedi — iki seçenek yan yana durur.

## Ne oldu?

Uygulama geliştirmesi büyük ölçüde tamamlandı; `render.yaml`, production env şablonu ve güvenlik kontrolleri repoda hazır. **Render’a deploy adımı henüz çalıştırılmadı** — canlı sunucu, ortam değişkenleri ve ilk `seed` sizin Render hesabınızda yapılacak.

## Ön koşullar

- **`package-lock.json` repoda olmalı** — Render build komutu `npm ci` kullanır; lock dosyası yoksa veya `package.json` ile uyumsuzsa build düşer (`Run npm help ci for more info`). Lock dosyasını `.gitignore`’a eklemeyin; her `package.json` bağımlılık değişikliğinden sonra yerelde `npm install` çalıştırıp lock’u commit + push edin.
- GitHub repo: https://github.com/yyasinssari57-create/Touristlio
- [Render](https://render.com) hesabı (kalıcı SQLite için **Starter** plan + disk gerekir; ücretsiz web servisinde disk **kalıcı değildir**)
- SMTP (Brevo önerilir) — `REQUIRE_EMAIL_VERIFICATION=true` iken zorunlu
- Alan adı (isteğe bağlı): `touristlio.com`

---

## Adım adım Render deploy

### 1. Blueprint ile servis oluştur

1. [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**
2. GitHub hesabını bağla → `yyasinssari57-create/Touristlio` reposunu seç
3. `render.yaml` otomatik okunur → **Apply**

Blueprint şunları oluşturur:

| Ayar | Değer |
|------|--------|
| Build | `npm ci` |
| Start | `npm run start:prod` |
| Node.js | **22.16.0** (`.node-version` + `NODE_VERSION` env) |
| Health check | `GET /api/health` |
| Disk | 1 GB → `/opt/render/project/src/data` (SQLite) |
| Plan | `starter` (disk için gerekli) |

### 2. Ortam değişkenlerini doldur

Deploy başlamadan veya ilk deploy sonrası **Environment** sekmesinde aşağıdakileri girin.

**Zorunlu (elle):**

| Değişken | Örnek | Açıklama |
|----------|-------|----------|
| `SITE_URL` | `https://www.touristlio.com` (veya geçici `https://touristlio.onrender.com`) | CSRF, e-posta ve sitemap. **Tarayıcıdaki canlı origin ile aynı** (sonda `/` yok). Canonical host **www**. |
| `CORS_ORIGIN` | `https://www.touristlio.com` | Tarayıcı CORS; kod apex eşini otomatik kabul eder. |
| `ADMIN_EMAIL` | `admin@touristlio.com` | İlk admin hesabı |
| `ADMIN_PASSWORD` | güçlü şifre | Seed/ensure-admin ile kullanılır |
| `SMTP_HOST` | `smtp-relay.brevo.com` | E-posta doğrulama / şifre sıfırlama |
| `SMTP_USER` | Brevo giriş e-postası | |
| `SMTP_PASS` | Brevo SMTP anahtarı | API anahtarı değil |
| `SMTP_FROM` | doğrulanmış gönderen | Brevo’da “Gönderenler”den onaylı olmalı |

**Blueprint’te otomatik / varsayılan:**

| Değişken | Değer |
|----------|--------|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | Render otomatik üretir |
| `TRUST_PROXY` | `true` |
| `REQUIRE_EMAIL_VERIFICATION` | `true` |
| `SITEMAP_ON_START` | `true` |
| `LIVE_DATA_CRON` | `true` |
| `SMTP_PORT` | `587` |
| `ADMIN_NAME` | `Admin` |
| `LOG_LEVEL` | `info` |

Tam liste ve isteğe bağlı değişkenler: `.env.production.example`

### 3. İlk deploy’u bekle

- Build: `npm ci` — `better-sqlite3` için **Node 22.16.0** kullanılır (prebuilt binary; kaynak derleme gerekmez)
- Start: `npm run start:prod` → `JWT_SECRET` yoksa veya zayıfsa **sunucu başlamaz** (kasıtlı güvenlik)

**Render build notu (`better-sqlite3`):** Eski servislerde Node **20.3.x** gibi sürümler `gyp ERR!` ile build’i düşürebilir — prebuilt binary yok, kaynak derleme başarısız olur. Repoda `.node-version`, `package.json` `engines` ve `render.yaml` içindeki `NODE_VERSION=22.16.0` + `npm_config_build_from_source=false` bunu önler (`better-sqlite3@11.10.0` lock’ta). `file-type@16` ve diğer bağımlılıklar native modül içermez; tek native paket `better-sqlite3`. Blueprint güncellemesinden sonra **Manual Deploy** yapın. Dashboard’da eski `NODE_VERSION` tanımlıysa silin veya `22.16.0` yapın.

Sağlık kontrolü: `https://<servis-adı>.onrender.com/api/health` → `{"ok":true,...}`

### 4. Veritabanını doldur (ilk kurulum — zorunlu)

Render → servis → **Shell**:

```bash
npm run seed
```

Bu komut `server/data/places.json` → SQLite (`data/touristlio.db`) yükler ve admin kullanıcıyı oluşturur.

İsteğe bağlı:

```bash
npm run live-data:refresh
npm run sitemap
npm run admin:ensure
```

### 5. SMTP testi

Shell’de (env yüklü):

```bash
npm run verify:smtp
```

### 6. Özel alan adı (touristlio.com)

1. Render → **Settings** → **Custom Domains** → hem `www.touristlio.com` hem `touristlio.com` ekle
2. DNS’te Render’ın verdiği CNAME/A kaydını ayarla (apex + www)
3. **Environment**’ta `SITE_URL` ve `CORS_ORIGIN` = `https://www.touristlio.com`
4. **Cloudflare** → SSL/TLS **Full** (Flexible değil — Flexible + uygulama 301 döngü yapar). Always Use HTTPS açık.
   - Uygulama apex’i (`touristlio.com`) **301** ile `https://www.touristlio.com` + aynı path’e alır.
   - Cloudflare’da **www → apex** (Redirect www to root) **kapalı** olmalı. Tersi yönde kural varsa `ERR_TOO_MANY_REDIRECTS`.
   - Cloudflare da apex→www yapıyorsa sorun olmaz (aynı yön); yine de tek katman yeter. Acil kapatma: `DISABLE_WWW_REDIRECT=true`
5. İsteğe bağlı: `CORS_ORIGIN=https://www.touristlio.com,https://touristlio.com`
6. **Manual Deploy** → redeploy

### 7. Admin girişi

- URL: `https://<domain>/admin`
- E-posta / şifre: `ADMIN_EMAIL` / `ADMIN_PASSWORD`

---

## SQLite ve dosya kalıcılığı

| Yol | Kalıcı mı? | Not |
|-----|------------|-----|
| `data/touristlio.db` | **Evet** (Starter + disk mount) | `render.yaml` → `/opt/render/project/src/data` |
| `uploads/` (Tiola foto, admin medya) | **Hayır** | Ephemeral disk; redeploy’da silinebilir |
| `backups/` | **Hayır** | `npm run backup:db` çıktısı; harici depolamaya kopyalayın |
| `public/sitemap.xml` | Kısmen | `SITEMAP_ON_START=true` ile yeniden üretilir |

**Ücretsiz plan uyarısı:** Disk mount yoksa her redeploy’da veritabanı sıfırlanır. Production için Starter + disk kullanın veya VPS/PostgreSQL planlayın.

**Yedekleme:** Render Shell’de periyodik `npm run backup:db` çalıştırıp `backups/*.db` dosyasını S3/Drive’a indirin.

---

## Sık sorunlar

| Belirti | Olası neden | Çözüm |
|---------|-------------|--------|
| Build `npm ci` → `Run npm help ci` / usage hatası | `package-lock.json` repoda yok veya `package.json` ile uyumsuz | Lock dosyasını commit + push edin; yerelde `npm install` ile senkronlayın; `npm ci` build komutunu koruyun |
| Build `npm ci` → `gyp ERR!` / `better-sqlite3` | Eski Node (ör. 20.3.0), prebuild yok | Repoyu çekin; `NODE_VERSION` / `.node-version` = `22.16.0`; Manual Deploy |
| Sunucu hemen kapanıyor | `JWT_SECRET` eksik/zayıf | Environment’ta 32+ karakter secret; Blueprint `generateValue` kullanıyorsa redeploy |
| Giriş/kayıt 403 CSRF | `SITE_URL` yanlış | Tarayıcıdaki URL ile `SITE_URL` origin’i eşleştir |
| Boş sayfa / `ERR_TOO_MANY_REDIRECTS` | Cloudflare www→apex **ve** Express apex→www | Cloudflare’da yalnızca apex→www (veya CF yönlendirmesini kapatıp uygulamaya bırakın); SSL **Full**; `DISABLE_WWW_REDIRECT=true` ile uygulama 301’ini kapatın |
| Admin/API 500, `www` ile açılıyor | `CORS_ORIGIN` eski apex | `SITE_URL`/`CORS_ORIGIN` = `https://www.touristlio.com`; kod apex+www’yi otomatik kabul eder |
| E-posta gitmiyor | SMTP eksik/yanlış | Brevo SMTP anahtarı + doğrulanmış `SMTP_FROM`; `verify:smtp` |
| Boş site / yer yok | Seed çalışmadı | Shell: `npm run seed` |
| Kayıtlı kullanıcı admin’de yok / “sıfırlanmış” gibi | **Ücretsiz plan** — SQLite kalıcı değil; redeploy veya servis yeniden başlatınca `data/touristlio.db` silinir. `SEED_ON_START` sadece yerleri/admin’i doldurur, kullanıcı silmez. | Starter plan + disk (`STORAGE_PERSISTENT=true`) veya VPS/PostgreSQL; admin Özet’te uyarı görünür |
| Yüklenen foto kayboldu | `uploads/` ephemeral | İleride ikinci disk veya S3; şimdilik redeploy sonrası kayıp normal |

---

## VPS alternatifi (Hetzner)

Tam rehber: **[DEPLOY_HETZNER.md](./DEPLOY_HETZNER.md)** — CX22/CPX11, Nginx, Certbot, Cloudflare DNS, PM2, SQLite yedekleme ve Render maliyet karşılaştırması.

Kısa özet:

```bash
git clone https://github.com/yyasinssari57-create/Touristlio.git
cd Touristlio
cp deploy/hetzner/.env.hetzner.example .env
# .env düzenle — DATABASE_PATH=/var/lib/touristlio/data/touristlio.db
npm ci
npm run seed
pm2 start deploy/hetzner/ecosystem.config.js
```

Kalıcı veritabanı: `/var/lib/touristlio/data/touristlio.db` (bkz. `deploy/hetzner/.env.hetzner.example`).

---

## Henüz yapılmayan (deploy sonrası geliştirme)

- JWT tam invalidation (oturum iptali / token blacklist)
- Admin panelinde rol izinleri düzenleme UI’si (API var, UI kısmi)
- Otomatik test paketi
- `uploads/` için kalıcı depolama / CDN
- PostgreSQL geçişi (uzun vadeli)
