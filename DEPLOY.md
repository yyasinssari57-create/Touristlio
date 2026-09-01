# Touristlio — Canlıya Alma (Render)

Bu rehber, GitHub’daki repoyu Render’da yayına almak içindir.

> **Render kart kabul etmiyor veya VPS tercih ediyorsanız:** adım adım Hetzner kurulumu için **[DEPLOY_HETZNER.md](./DEPLOY_HETZNER.md)** dosyasına bakın (`deploy/hetzner/` yapılandırma dosyaları dahil). Render rehberi silinmedi — iki seçenek yan yana durur.

## Ne oldu?

Uygulama geliştirmesi büyük ölçüde tamamlandı; `render.yaml`, production env şablonu ve güvenlik kontrolleri repoda hazır. **Render’a deploy adımı henüz çalıştırılmadı** — canlı sunucu, ortam değişkenleri ve ilk `seed` sizin Render hesabınızda yapılacak.

## Ön koşullar

- **`package-lock.json` repoda olmalı** — Render build komutu `npm ci` kullanır; lock dosyası yoksa veya `package.json` ile uyumsuzsa build düşer (`Run npm help ci for more info`). Lock dosyasını `.gitignore`’a eklemeyin; her `package.json` bağımlılık değişikliğinden sonra yerelde `npm install` çalıştırıp lock’u commit + push edin.
- GitHub repo: https://github.com/yyasinssari57-create/Touristlio
- [Render](https://render.com) hesabı (veritabanı **Supabase PostgreSQL**; Render Free disk kalıcı değildir)
- **`DATABASE_URL`** — Supabase connection string (Render Environment’a yapıştırın)
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
| Disk | 1 GB → uploads (veritabanı Supabase’de) |
| Plan | `starter` |

### 2. Ortam değişkenlerini doldur

Deploy başlamadan veya ilk deploy sonrası **Environment** sekmesinde aşağıdakileri girin.

**Zorunlu (elle):**

| Değişken | Örnek | Açıklama |
|----------|-------|----------|
| `SITE_URL` | `https://www.touristlio.com` (veya geçici `https://touristlio.onrender.com`) | CSRF, e-posta ve sitemap. **Tarayıcıdaki canlı origin ile aynı** (sonda `/` yok). Canonical host **www**. |
| `DATABASE_URL` | `postgresql://postgres:ŞİFRE@db.PROJECT.supabase.co:5432/postgres` | **Zorunlu.** Supabase Database şifresi. Render diski geçici olduğu için SQLite kullanılmaz. `@` → `%40`. |
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

- Build: `npm ci` — native `better-sqlite3` yok; `pg` (JavaScript) kullanılır
- Start: `npm run start:prod` → `JWT_SECRET` yoksa veya zayıfsa **sunucu başlamaz** (kasıtlı güvenlik). `DATABASE_URL` yoksa veya şifre yer tutucusu ise **sunucu başlamaz**.

`better-sqlite3` kaldırıldı; Node 22.16.0 hâlâ önerilir. Blueprint güncellemesinden sonra **Manual Deploy** yapın.

Sağlık kontrolü: `https://<servis-adı>.onrender.com/api/health` → `{"ok":true,...}`

### 4. Veritabanını doldur (ilk kurulum — zorunlu)

Render → servis → **Shell**:

```bash
npm run seed
```

Bu komut `server/data/places.json` içeriğini **Supabase PostgreSQL** tablosuna yükler ve admin kullanıcıyı oluşturur. `DATABASE_URL` Render Environment’ta tanımlı olmalıdır.

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

## PostgreSQL (Supabase) ve dosya kalıcılığı

| Yol | Kalıcı mı? | Not |
|-----|------------|-----|
| PostgreSQL (`DATABASE_URL`) | **Evet** (Supabase) | Render diski kullanılmaz; şifreyi Dashboard’a yapıştırın |
| `uploads/` (Tiola foto, admin medya) | Disk varsa evet | `render.yaml` 1 GB mount; yine de S3 önerilir |
| `backups/` | **Hayır** | `npm run backup:db` → `.sql`; harici depolamaya kopyalayın |
| `public/sitemap.xml` | Kısmen | `SITEMAP_ON_START=true` ile yeniden üretilir |

**Render Free uyarısı:** Disk yoksa yüklenen fotoğraflar kaybolur. Kullanıcı/yer verisi artık SQLite dosyasında değil, Supabase’dedir — `DATABASE_URL` doğruysa redeploy veri silmez.

**Yedekleme:** Render Shell’de `npm run backup:db` → `backups/*.sql`. Tercihen Supabase Dashboard → Database → Backups.

---

## Sık sorunlar

| Belirti | Olası neden | Çözüm |
|---------|-------------|--------|
| Build `npm ci` → `Run npm help ci` / usage hatası | `package-lock.json` repoda yok veya `package.json` ile uyumsuz | Lock dosyasını commit + push edin; yerelde `npm install` ile senkronlayın; `npm ci` build komutunu koruyun |
| Sunucu hemen kapanıyor | `DATABASE_URL` veya `JWT_SECRET` eksik | Supabase şifresini `DATABASE_URL`’e yapıştırın (yer tutucu bırakmayın); JWT 32+ karakter |
| Giriş/kayıt 403 CSRF | `SITE_URL` yanlış | Tarayıcıdaki URL ile `SITE_URL` origin’i eşleştir |
| Boş sayfa / `ERR_TOO_MANY_REDIRECTS` | Cloudflare www→apex **ve** Express apex→www | Cloudflare’da yalnızca apex→www (veya CF yönlendirmesini kapatıp uygulamaya bırakın); SSL **Full**; `DISABLE_WWW_REDIRECT=true` ile uygulama 301’ini kapatın |
| Admin/API 500, `www` ile açılıyor | `CORS_ORIGIN` eski apex | `SITE_URL`/`CORS_ORIGIN` = `https://www.touristlio.com`; kod apex+www’yi otomatik kabul eder |
| E-posta gitmiyor | SMTP eksik/yanlış | Brevo SMTP anahtarı + doğrulanmış `SMTP_FROM`; `verify:smtp` |
| Boş site / yer yok | Seed çalışmadı | Shell: `npm run seed` (`DATABASE_URL` gerekli) |
| Kayıtlı kullanıcı admin’de yok / “sıfırlanmış” gibi | Yanlış veya eski `DATABASE_URL` | Supabase projesini kontrol edin; `SEED_ON_START` kullanıcı silmez |
| Yüklenen foto kayboldu | `uploads/` ephemeral | İleride ikinci disk veya S3; şimdilik redeploy sonrası kayıp normal |

---

## VPS alternatifi (Hetzner)

Tam rehber: **[DEPLOY_HETZNER.md](./DEPLOY_HETZNER.md)** — CX22/CPX11, Nginx, Certbot, Cloudflare DNS, PM2. Veritabanı artık **Supabase `DATABASE_URL`**.

Kısa özet:

```bash
git clone https://github.com/yyasinssari57-create/Touristlio.git
cd Touristlio
cp deploy/hetzner/.env.hetzner.example .env
# .env düzenle — DATABASE_URL=postgresql://postgres:ŞİFRE@db.PROJECT.supabase.co:5432/postgres
npm ci
npm run seed
pm2 start deploy/hetzner/ecosystem.config.js
```

Kalıcı veritabanı: Supabase `DATABASE_URL` (SQLite `touristlio.db` kullanılmaz).

---

## Henüz yapılmayan (deploy sonrası geliştirme)

- JWT tam invalidation (oturum iptali / token blacklist)
- Admin panelinde rol izinleri düzenleme UI’si (API var, UI kısmi)
- Otomatik test paketi
- `uploads/` için kalıcı depolama / CDN
- PostgreSQL geçişi (uzun vadeli)
