# Touristlio — Hetzner VPS Kurulum Rehberi (Başlangıç Seviyesi)

Bu rehber, **sunucu bilgisi olmayan** biri için yazılmıştır. Her adımı sırayla yapın; bir adım bitmeden sonrakine geçmeyin.

**Ne yapacağız?** Hetzner’da küçük bir Linux sunucu kiralayıp Touristlio sitesini orada çalıştıracağız. Veritabanı **Supabase PostgreSQL** (`DATABASE_URL`); SQLite dosyası kullanılmaz. Render’daki eski barındırmayı site Hetzner’da düzgün çalışınca kapatacağız.

**Tahmini süre:** İlk kez yapıyorsanız 1–2 saat.  
**Tahmini maliyet:** Ayda yaklaşık €4–6 (sunucu tipine göre).

**Gerekenler:**

- Bilgisayarınız (Windows)
- E-posta adresi (Hetzner kaydı için)
- Kredi/banka kartı (Hetzner ödemesi)
- `touristlio.com` alan adına erişim (Cloudflare veya domain sağlayıcı paneli)
- Brevo (veya başka SMTP) hesabı — e-posta doğrulama için

---

## Sözlük (kısa)

| Terim | Anlamı |
|-------|--------|
| **VPS / Sunucu** | İnternette 7/24 açık kalan uzak bilgisayar |
| **IP adresi** | Sunucunun internetteki numarası (ör. `123.45.67.89`) |
| **SSH** | Windows’tan sunucuya uzaktan bağlanma yöntemi |
| **root** | Linux’ta en yetkili kullanıcı (admin) |
| **DNS** | `touristlio.com` yazınca hangi sunucuya gidileceğini söyleyen kayıt |
| **Nginx** | Ziyaretçileri Node uygulamanıza yönlendiren web kapısı |
| **SSL / HTTPS** | Adres çubuğundaki kilit; Let’s Encrypt ile ücretsiz |
| **PM2** | Uygulama çökerse otomatik yeniden başlatan program |

---

# BÖLÜM 1: Hetzner hesap ve sunucu

## 1.1 Hetzner’a kayıt olun

1. Tarayıcıda açın: **https://www.hetzner.com**
2. Sağ üstten **Sign up** / **Kayıt ol**.
3. E-posta, şifre ve gerekli bilgileri doldurun.
4. E-postanıza gelen doğrulama linkine tıklayın.
5. Ödeme yöntemi ekleyin (kredi kartı vb.) — sunucu kiralanmadan önce istenebilir.

> **Not:** Hetzner Almanya merkezli bir firmadır. Faturalar euro (€) olabilir.

## 1.2 Cloud Console’a girin

1. Giriş yaptıktan sonra üst menüden **Console** veya doğrudan: **https://console.hetzner.cloud**
2. İlk kez giriyorsanız **Create project** (proje oluştur) deyin.
3. Proje adı: örneğin `touristlio` — **Create project**.

## 1.3 Sunucu ekle (Add Server)

Sol menüden **Servers** → sağ üst **Add Server**.

Aşağıdaki ayarları **aynen** seçin:

### Location (Konum)

- **Falkenstein** veya **Nuremberg** (Nürnberg)
- İkisi de Almanya; Türkiye’ye gecikme açısından ikisi de uygundur. Fark etmez, birini seçin.

### Image (İşletim sistemi)

- **Ubuntu 24.04** (LTS — uzun süre desteklenir)

### Type (Sunucu gücü)

| Seçenek | Özellik | Fiyat (yaklaşık) | Öneri |
|---------|---------|------------------|-------|
| **CX22** | 2 vCPU, 4 GB RAM | ~€5.49/ay | Touristlio için rahat |
| **CPX11** | 2 vCPU, 2 GB RAM | daha ucuz | Bütçe için yeterli olabilir |

Başlangıç için **CX22** önerilir; trafik artarsa yükseltirsiniz.

### Networking

- Varsayılan **Public IPv4** açık kalsın (IPv4 adresi alacaksınız).

### SSH keys — İki yöntem

Sunucuya nasıl giriş yapacağınızı burada seçersiniz.

#### Yöntem A: Root şifresi (yeni başlayanlar için daha kolay)

- **SSH key** eklemeden devam edin.
- Sunucu oluşunca Hetzner size **root şifresini** e-posta ile gönderir (veya panelde gösterir).
- Bu rehberin **Bölüm 2**’si bu yönteme göre yazılmıştır.

#### Yöntem B: SSH anahtarı (daha güvenli, biraz daha teknik)

1. Windows PowerShell’de:
   ```powershell
   ssh-keygen -t ed25519 -C "touristlio-hetzner"
   ```
2. Enter’a basarak varsayılan konumu kabul edin (`C:\Users\SIZIN_ADINIZ\.ssh\id_ed25519`).
3. İsterseniz parola sorar; boş bırakabilirsiniz.
4. Anahtarı görüntüleyin:
   ```powershell
   Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
   ```
5. Çıkan **tek satırlık** metni kopyalayın.
6. Hetzner Add Server ekranında **Add SSH key** → yapıştır → kaydedin.
7. Sunucu oluşunca şifre yerine bu anahtarla giriş yaparsınız.

### Sunucu adı

- **Name:** `touristlio`

### Diğer ayarlar

- **Volumes**, **Firewalls**, **Backups** — ilk kurulumda boş bırakabilirsiniz (Backups ücretli ek hizmettir; Bölüm 8’de kendi yedeklememizi anlatıyoruz).

## 1.4 Oluştur ve satın al

1. Sağ alttan **Create & Buy** (Oluştur ve satın al).
2. Birkaç saniye–1 dakika bekleyin; sunucu durumu **Running** olunca hazırdır.

## 1.5 IPv4 adresini kopyalayın

1. **Servers** listesinde `touristlio` sunucusuna tıklayın.
2. **Public IPv4** satırındaki adresi kopyalayın (örnek: `95.217.xxx.xxx`).
3. Bu adresi bir yere not edin — **Windows’tan bağlanırken** ve **Cloudflare DNS**’te kullanacaksınız.

**Bölüm 1 bitti.** Elinizde çalışan bir Ubuntu sunucusu ve bir IP adresi olmalı.

---

# BÖLÜM 2: Windows’tan sunucuya bağlanma (SSH)

## 2.1 PowerShell’i açın

1. Windows tuşuna basın, **PowerShell** yazın.
2. **Windows PowerShell**’i açın (Yönetici olması şart değil).

## 2.2 Sunucuya bağlanın

Aşağıdaki komutta `SUNUCU_IP` yerine Bölüm 1’de kopyaladığınız IPv4’ü yazın:

```powershell
ssh root@SUNUCU_IP
```

Örnek:

```powershell
ssh root@95.217.123.45
```

## 2.3 İlk bağlantı uyarısı

İlk seferde şuna benzer bir soru gelir:

```
Are you sure you want to continue connecting (yes/no/[fingerprint])?
```

**`yes`** yazıp Enter’a basın. Bu normaldir; sunucunun kimliğini bilgisayarınıza kaydediyorsunuz.

## 2.4 Şifre ile giriş (Yöntem A kullandıysanız)

```
root@95.217.xxx.xxx's password:
```

- Hetzner’ın verdiği **root şifresini** yapıştırın.
- Yapıştırırken ekranda **hiçbir karakter görünmez** — bu normaldir.
- Enter’a basın.

Başarılı olunca satır şöyle görünür:

```
root@touristlio:~#
```

Artık komutları **sunucuda** çalıştırıyorsunuz.

## 2.5 SSH anahtarı ile giriş (Yöntem B)

Şifre sormadan bağlanmanız gerekir. Sorarsa anahtarınız yanlış eklenmiş olabilir; Hetzner panelinden SSH key’i kontrol edin.

## 2.6 Bağlantı koparsa

Tekrar PowerShell’de `ssh root@SUNUCU_IP` yazmanız yeterli.

## 2.7 Güvenlik ipucu (isteğe bağlı, sonra yapılabilir)

İlk kurulumdan sonra root şifresini değiştirmek iyi fikirdir:

```bash
passwd
```

Yeni şifreyi iki kez girin.

**Bölüm 2 bitti.** Sunucuya SSH ile bağlanabiliyor olmalısınız.

---

# BÖLÜM 3: Sunucu hazırlığı

Aşağıdaki komutların **hepsini sunucuda** (SSH oturumunda) çalıştırın. Her blok bitince bir sonrakine geçin.

> **İpucu:** Uzun çıktılar normaldir. `Do you want to continue? [Y/n]` gibi sorularda **Y** + Enter yeterli.

## 3.1 Sistemi güncelle

```bash
apt update && apt upgrade -y
```

Bu komut paket listesini yeniler ve güvenlik güncellemelerini kurar. 2–5 dakika sürebilir.

## 3.2 Temel araçlar

```bash
apt install -y curl git build-essential ufw
```

| Paket | Ne işe yarar |
|-------|----------------|
| curl | İndirme aracı |
| git | GitHub’dan kod çekmek |
| build-essential | Bazı Node modüllerinin derlenmesi |
| ufw | Basit güvenlik duvarı |

## 3.3 Node.js 22 kur (NodeSource)

Touristlio **Node 22** ile test edilmiştir (repoda `.node-version`: `22.16.0`).

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
```

Kurulumu doğrulayın:

```bash
node -v
npm -v
```

`node -v` çıktısı `v22.x.x` olmalı.

## 3.4 PM2 kur (uygulama yöneticisi)

```bash
npm install -g pm2
```

PM2, Touristlio’yu arka planda çalıştırır; sunucu yeniden başlasa bile otomatik ayağa kalkar.

## 3.5 Nginx kur (web kapısı)

```bash
apt install -y nginx
systemctl enable nginx
systemctl start nginx
```

Tarayıcıda `http://SUNUCU_IP` açarsanız “Welcome to nginx!” sayfası görürsünüz (henüz Touristlio yok, normal).

## 3.6 Certbot kur (ücretsiz SSL)

```bash
apt install -y certbot python3-certbot-nginx
```

Let’s Encrypt sertifikası almak için kullanılır (Bölüm 5).

## 3.7 Güvenlik duvarı (UFW)

Sadece gerekli portları açıyoruz:

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
ufw status
```

| Port | Amaç |
|------|------|
| 22 | SSH (sizin bağlantınız) |
| 80 | HTTP (SSL doğrulama + yönlendirme) |
| 443 | HTTPS (güvenli site) |

## 3.8 Kalıcı veri klasörleri

Veritabanı ve yedekler proje dışında tutulur:

```bash
mkdir -p /var/lib/touristlio/data
mkdir -p /var/lib/touristlio/backups
mkdir -p /var/log/touristlio
chmod 755 /var/lib/touristlio
```

## 3.9 PM2 log klasörü izinleri

```bash
chown -R root:root /var/log/touristlio
```

**Bölüm 3 bitti.** Sunucuda Node, Git, Nginx, Certbot, PM2 ve güvenlik duvarı hazır.

---

# BÖLÜM 4: Touristlio kurulumu

## 4.1 Projeyi GitHub’dan indir

Ev dizinine (`/root`) gidin ve repoyu klonlayın:

```bash
cd ~
git clone https://github.com/yyasinssari57-create/Touristlio.git
cd Touristlio
```

> **Not:** Klasör adı büyük **T** ile `Touristlio` olur. Sonraki komutlarda bu yolu kullanın: `/root/Touristlio`

## 4.2 Ortam dosyasını oluştur

```bash
cp deploy/hetzner/.env.hetzner.example .env
nano .env
```

`nano` içinde ok tuşlarıyla gezin, değerleri düzenleyin. **Ctrl+O** → Enter (kaydet), **Ctrl+X** (çık).

### `.env` değişkenleri — Türkçe açıklama

| Değişken | Ne yazmalısınız? | Açıklama |
|----------|------------------|----------|
| `PORT` | `3000` | Uygulamanın dinlediği port; Nginx buraya yönlendirir. Değiştirmeyin. |
| `NODE_ENV` | `production` | Canlı mod. |
| `LOG_LEVEL` | `info` | Log ayrıntısı. |
| `DATABASE_PATH` | `/var/lib/touristlio/data/touristlio.db` | SQLite dosyasının **kalıcı** yolu. Sunucu güncellense bile veri burada kalır. |
| `TRUST_PROXY` | `true` | Nginx arkasında çalıştığımız için zorunlu. |
| `STORAGE_PERSISTENT` | `true` | VPS’te disk kalıcıdır; admin panelinde “geçici depolama” uyarısı çıkmaz. |
| `JWT_SECRET` | 32+ karakter rastgele | Oturum token’ları. **Boş bırakmayın.** Üretmek için (başka terminalde veya önce): `npm run generate:jwt-secret` |
| `ADMIN_EMAIL` | `admin@touristlio.com` | `/admin` giriş e-postası. |
| `ADMIN_PASSWORD` | güçlü şifre | Admin şifresi — kimseyle paylaşmayın. |
| `ADMIN_NAME` | `Admin` | Görünen ad. |
| `SITE_URL` | `https://touristlio.com` | Sitede tarayıcıda gördüğünüz adres (**https**, sondaki `/` yok). |
| `CORS_ORIGIN` | `https://touristlio.com` | Genelde `SITE_URL` ile aynı. |
| `COOKIE_SECURE` | `true` | HTTPS çerezleri. |
| `COOKIE_SAMESITE` | `lax` | Varsayılan güvenlik. |
| `REQUIRE_EMAIL_VERIFICATION` | `true` | Kayıtta e-posta doğrulama — SMTP gerekir. |
| `SEED_ON_START` | `true` | Veritabanı boşsa yerler ve admin otomatik dolar. |
| `SITEMAP_ON_START` | `true` | Başlangıçta sitemap üretir. |
| `LIVE_DATA_CRON` | `true` | Canlı veri güncelleme görevi. |
| `SMTP_HOST` | `smtp-relay.brevo.com` | Brevo SMTP sunucusu. |
| `SMTP_PORT` | `587` | SMTP portu. |
| `SMTP_USER` | Brevo giriş e-postanız | Brevo hesap e-postası. |
| `SMTP_PASS` | Brevo **SMTP anahtarı** | API anahtarı değil! Brevo → SMTP & API → SMTP key. |
| `SMTP_FROM` | doğrulanmış gönderen | Brevo’da “Gönderenler”den onaylı olmalı. |

JWT secret üretmek için (henüz yapmadıysanız):

```bash
npm run generate:jwt-secret
```

Çıkan değeri kopyalayıp `.env` içindeki `JWT_SECRET=` satırına yapıştırın.

## 4.3 Bağımlılıkları kur

```bash
npm ci
```

`npm ci`, `package-lock.json` ile birebir aynı sürümleri kurar (Render ile aynı mantık). 1–3 dakika sürebilir.

Hata alırsanız: `node -v` 22 mi kontrol edin.

## 4.4 İlk veritabanı doldurma (isteğe bağlı ama önerilir)

Otomatik seed açık olsa da ilk kurulumda elle çalıştırmak net sonuç verir:

```bash
npm run seed
```

Bu komut yerleri SQLite’a yükler ve admin kullanıcıyı oluşturur.

## 4.5 SMTP testi

```bash
npm run verify:smtp
```

“OK” veya başarılı mesaj görmelisiniz. Hata varsa Brevo SMTP anahtarı ve gönderen doğrulamasını kontrol edin.

## 4.6 PM2 ile başlat

```bash
pm2 start deploy/hetzner/ecosystem.config.js
pm2 status
```

`touristlio` satırında **online** yazmalı.

Loglara bakmak için:

```bash
pm2 logs touristlio --lines 50
```

Çıkmak: **Ctrl+C**

Yerel sağlık kontrolü (sunucuda):

```bash
curl -s http://127.0.0.1:3000/api/health
```

`{"ok":true,...}` benzeri JSON dönmeli.

## 4.7 Sunucu yeniden başlayınca otomatik açılsın

```bash
pm2 startup
```

Komut **size bir satır daha verecek** — o satırı kopyalayıp yapıştırıp Enter’a basın. Örnek:

```bash
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u root --hp /root
```

Ardından mevcut PM2 listesini kaydedin:

```bash
pm2 save
```

**Bölüm 4 bitti.** Touristlio sunucuda 3000 portunda çalışıyor olmalı (henüz domain/SSL yok).

---

# BÖLÜM 5: Nginx + SSL (HTTPS)

## 5.1 DNS henüz Hetzner’a gitmiyorsa

Certbot, alan adının **bu sunucuya** işaret ettiğini doğrular. İki seçenek:

1. **Önce Bölüm 6**’yı yapın (Cloudflare’de A kayıtları, gri bulut), 5–10 dakika bekleyin, sonra certbot.
2. Veya geçici olarak sadece IP ile Nginx test edin (SSL olmadan) — canlı site için 1. yol önerilir.

Bu rehberde sıra: **önce DNS (Bölüm 6), sonra certbot** da mümkündür. Aşağıdaki Nginx adımını DNS’ten önce de yapabilirsiniz; certbot için domain sunucuya gelmiş olmalı.

## 5.2 Nginx site yapılandırması

Sunucuda, proje klasöründeyken:

```bash
cd ~/Touristlio
cp deploy/hetzner/nginx-touristlio.conf /etc/nginx/sites-available/touristlio
ln -sf /etc/nginx/sites-available/touristlio /etc/nginx/sites-enabled/touristlio
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
```

`nginx -t` sonunda **syntax is ok** ve **test is successful** görmelisiniz.

Tarayıcıda `http://touristlio.com` (DNS ayarlıysa) veya geçici `http://SUNUCU_IP` — Nginx üzerinden site açılmaya başlar (SSL henüz yoksa “Not secure” normal).

## 5.3 Ücretsiz SSL sertifikası (Certbot)

**Cloudflare’de DNS kayıtları gri bulut (DNS only)** iken çalıştırın — turuncu proxy ilk kurulumda Let’s Encrypt doğrulamasını zorlaştırabilir.

```bash
certbot --nginx -d touristlio.com -d www.touristlio.com
```

Sorular:

| Soru | Cevap |
|------|-------|
| E-posta | Sizin e-postanız (sertifika uyarıları için) |
| Terms | **A** (kabul) |
| Share e-mail | İsteğe bağlı **Y** veya **N** |
| HTTP → HTTPS yönlendirme | **2** (Redirect — önerilen) |

Başarılı olunca:

```
Congratulations! ...
```

Tarayıcıda **https://touristlio.com** açın — kilit simgesi görünmeli.

## 5.4 Sertifika yenileme

Certbot otomatik zamanlar. Test:

```bash
certbot renew --dry-run
```

**Bölüm 5 bitti.** Site HTTPS ile çalışıyor olmalı.

---

# BÖLÜM 6: Cloudflare DNS ayarları

`touristlio.com` Cloudflare üzerindeyse bu bölümü uygulayın. Başka sağlayıcıdaysa mantık aynı: **A kaydı → Hetzner IPv4**.

## 6.1 Render CNAME kaydını kaldırın

1. **https://dash.cloudflare.com** → `touristlio.com` domain’i.
2. **DNS** → **Records**.
3. Eski **Render** barındırmasına giden kayıtları bulun (genelde `CNAME` → `*.onrender.com` veya Render’ın verdiği hedef).
4. **Delete** ile silin veya düzenleyin.

> Render’ı henüz kapatmayın (Bölüm 7). DNS değişince kısa süre karışıklık olabilir; önce Hetzner’ın çalıştığını doğrulayın.

## 6.2 A kayıtları ekleyin

**Add record:**

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| **A** | `@` | `SUNUCU_IP` (Hetzner IPv4) | **DNS only** (gri bulut) |
| **A** | `www` | Aynı `SUNUCU_IP` | **DNS only** (gri bulut) |

- **TTL:** Auto
- **Proxy status:** İlk SSL kurulumu için **DNS only** (gri bulut ☁️).
- Kaydedin.

## 6.3 Yayılma süresi

DNS değişikliği 5 dakika – 48 saat sürebilir; çoğu zaman 15–30 dakika.

Kontrol (Windows PowerShell):

```powershell
nslookup touristlio.com
```

Çıktıda Hetzner IP’niz görünmeli.

## 6.4 SSL tamamlandıktan sonra Cloudflare proxy (isteğe bağlı)

Site Hetzner’da HTTPS ile düzgün çalışınca:

1. Cloudflare → DNS kayıtlarında turuncu bulutu açabilirsiniz (**Proxied**).
2. **SSL/TLS** → Overview → **Full (strict)** önerilir (origin’de geçerli Let’s Encrypt sertifikası varken).
3. **Always Use HTTPS** açık olsun.
4. Apex ↔ www çift yönlendirme yapmayın (sonsuz yönlendirme hatası olur). Tek yön yeterli.

**Bölüm 6 bitti.** Domain Hetzner sunucusuna yönleniyor olmalı.

---

# BÖLÜM 7: Render’dan Hetzner’a geçiş

## 7.1 Render’ı hemen kapatmayın

1. Hetzner kurulumunu bitirin.
2. `https://touristlio.com/api/health` → `ok: true`
3. Ana sayfa, giriş, admin paneli test edin.
4. E-posta doğrulama (kayıt) test edin.

Hepsi çalışıyorsa geçişe devam.

## 7.2 Render ortam değişkenlerini not alın

Render Dashboard → servis → **Environment**:

- `JWT_SECRET`, SMTP, admin şifresi vb. Hetzner `.env` ile **uyumlu** olmalı (JWT değişirse tüm kullanıcılar yeniden giriş yapar).

## 7.3 Render servisini durdur

1. [Render Dashboard](https://dashboard.render.com)
2. Touristlio web servisi
3. **Settings** → en altta **Delete Web Service** veya **Suspend** (askıya al)

Silmeden önce Render diskinden SQLite yedeği almak istiyorsanız Shell’de:

```bash
npm run backup:db
```

Dosyayı indirip Hetzner’a taşıyabilirsiniz (ileri seviye; boş kurulumda gerekmez).

## 7.4 Hetzner’da son kontrol listesi

- [ ] `https://touristlio.com` açılıyor
- [ ] `/admin` girişi çalışıyor
- [ ] Kayıt / e-posta doğrulama çalışıyor
- [ ] `pm2 status` → online
- [ ] Cloudflare DNS doğru IP

**Bölüm 7 bitti.** Artık canlı site Hetzner’da.

---

# BÖLÜM 7B: Maliyet karşılaştırması (Render vs Hetzner)

Touristlio SQLite kullanır; **kalıcı disk** olmadan her redeploy’da veritabanı sıfırlanır. Production için Render’da en az **Starter** plan + disk gerekir.

| Kalem | Render (Starter + disk) | Hetzner VPS |
|-------|-------------------------|-------------|
| Web servis / sunucu | ~**$7/ay** (Starter) | **CX22** ~**€5,49/ay** veya **CPX11** ~**€4,15/ay** |
| Kalıcı SQLite disk | 1 GB disk dahil / ek ücret yok (Starter ile) | Sunucu diskinin tamamı kalıcı (`/var/lib/touristlio/`) |
| SSL (HTTPS) | Render otomatik | Let’s Encrypt + Certbot (ücretsiz) |
| Özel domain | Ücretsiz | Ücretsiz (DNS sizde) |
| Uyku / soğuk başlangıç | Starter’da yok | Yok — 7/24 açık VPS |
| Shell / tam kontrol | Render Shell (sınırlı) | Tam root SSH |
| Yedekleme | Manuel Shell + harici indirme | Cron + `scp` (Bölüm 8) |
| Ödeme | Kart (bazı kartlar reddedilebilir) | Kart / PayPal (Hetzner genelde daha esnek) |

**Özet:** Hetzner, Touristlio boyutu için genelde **ayda ~€4–6** ile Render Starter’a **eşit veya biraz ucuz** kalır; asıl fark **tam sunucu kontrolü**, **kart kabulü** ve **diskin sizin yönetiminizde olmasıdır**. Ücretsiz Render planı production için uygun değildir (SQLite kalıcı değil).

> Fiyatlar 2025–2026 civarı Hetzner Cloud ve Render public fiyatlarına göre yaklaşıktır; kurulum öncesi [hetzner.com/cloud](https://www.hetzner.com/cloud) ve [render.com/pricing](https://render.com/pricing) sayfalarından doğrulayın.

---

# BÖLÜM 8: Yedekleme ve güncelleme

## 8.1 SQLite yedekleme (cron)

Uygulamanın `npm run backup:db` komutu varsayılan `data/touristlio.db` yolunu kullanır. Hetzner’de veritabanı **`DATABASE_PATH`** altındadır; doğrudan kopyalayın.

Günlük yedek script:

```bash
nano /usr/local/bin/touristlio-backup.sh
```

İçeriği:

```bash
#!/bin/bash
set -euo pipefail
SRC="/var/lib/touristlio/data/touristlio.db"
DEST_DIR="/var/lib/touristlio/backups"
STAMP="$(date +%Y-%m-%d_%H-%M-%S)"
mkdir -p "$DEST_DIR"
if [ -f "$SRC" ]; then
  cp "$SRC" "$DEST_DIR/touristlio-${STAMP}.db"
  find "$DEST_DIR" -name 'touristlio-*.db' -mtime +14 -delete
  echo "Yedek: $DEST_DIR/touristlio-${STAMP}.db"
else
  echo "Veritabanı yok: $SRC" >&2
  exit 1
fi
```

Kaydedin, çalıştırılabilir yapın:

```bash
chmod +x /usr/local/bin/touristlio-backup.sh
/usr/local/bin/touristlio-backup.sh
```

Cron (her gece 03:00):

```bash
crontab -e
```

Dosyanın sonuna ekleyin:

```
0 3 * * * /usr/local/bin/touristlio-backup.sh >> /var/log/touristlio/backup.log 2>&1
```

Kaydedip çıkın (`nano`: Ctrl+O, Enter, Ctrl+X).

Yedekleri bilgisayarınıza indirmek (Windows PowerShell):

```powershell
scp root@SUNUCU_IP:/var/lib/touristlio/backups/touristlio-*.db C:\Users\SIZIN_ADINIZ\Downloads\
```

## 8.2 Kod güncelleme (git pull)

Yeni sürüm yayınlandığında sunucuda:

```bash
cd ~/Touristlio
git pull
npm ci
pm2 restart touristlio
pm2 logs touristlio --lines 30
```

Sağlık kontrolü:

```bash
curl -s https://touristlio.com/api/health
```

## 8.3 PM2 yararlı komutlar

| Komut | Açıklama |
|-------|----------|
| `pm2 status` | Çalışıyor mu? |
| `pm2 logs touristlio` | Canlı log |
| `pm2 restart touristlio` | Yeniden başlat |
| `pm2 stop touristlio` | Durdur |
| `pm2 monit` | CPU/RAM izleme |

## 8.4 `.env` değiştirdikten sonra

```bash
pm2 restart touristlio
```

## 8.5 Sorun giderme (kısa)

| Belirti | Olası neden | Çözüm |
|---------|-------------|-------|
| Site açılmıyor | PM2 kapalı | `pm2 status`, `pm2 start deploy/hetzner/ecosystem.config.js` |
| 502 Bad Gateway | Node çökmüş | `pm2 logs touristlio` |
| 403 giriş/kayıt | `SITE_URL` yanlış | `.env` → `https://touristlio.com`, `pm2 restart` |
| E-posta gitmiyor | SMTP | `npm run verify:smtp`, Brevo gönderen doğrulama |
| SSL hatası | DNS / certbot | Cloudflare gri bulut, `certbot --nginx` tekrar |
| Veri kayboldu | Yanlış DB yolu | `DATABASE_PATH` kontrol, yedekten geri yükle |

---

## Hızlı referans — önemli yollar

| Ne | Yol |
|----|-----|
| Proje | `/root/Touristlio` |
| Ortam dosyası | `/root/Touristlio/.env` |
| Veritabanı | `/var/lib/touristlio/data/touristlio.db` |
| Yedekler | `/var/lib/touristlio/backups/` |
| Nginx config | `/etc/nginx/sites-available/touristlio` |
| PM2 log | `/var/log/touristlio/` |

---

## İlgili dosyalar (repoda)

| Dosya | Açıklama |
|-------|----------|
| `deploy/hetzner/.env.hetzner.example` | Hetzner `.env` şablonu |
| `deploy/hetzner/ecosystem.config.js` | PM2 yapılandırması |
| `deploy/hetzner/nginx-touristlio.conf` | Nginx reverse proxy |
| `deploy/hetzner/touristlio.service` | systemd alternatifi (PM2 yerine) |
| `DEPLOY.md` | Render kurulum rehberi |
| `.env.production.example` | Genel production şablonu |

---

**Tebrikler!** Touristlio artık kendi Hetzner sunucunuzda çalışıyor. Sorun olursa `pm2 logs touristlio` çıktısını kaydedin — hata ayıklamada ilk bakılacak yer orasıdır.
