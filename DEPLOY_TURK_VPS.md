# Touristlio — Türk VPS Kurulum Rehberi (Natro, Başlangıç Seviyesi)

Bu rehber, **sunucu bilgisi olmayan** biri için yazılmıştır. **Natro** üzerinden TL ile VPS kiralayıp Touristlio’yu kurmanızı adım adım anlatır.

**Alternatif sağlayıcı:** [Turhost](https://www.turhost.com) — panel farklıdır ama **Bölüm 3’ten sonraki Linux komutları aynıdır**.

**Ne yapacağız?** Türkiye’den TL ile ödenebilen bir Ubuntu sunucu kiralayıp Touristlio’yu orada çalıştıracağız. Site Natro’da düzgün çalışınca Cloudflare DNS’i yeni IP’ye yönlendiririz; Render’ı hemen kapatmayın.

**Tahmini süre:** İlk kez 1–2 saat  
**Tahmini maliyet:** Ayda yaklaşık **150–350 TL** (2 GB RAM VPS, pakete göre)

**Gerekenler:**

- Windows bilgisayar
- E-posta + **Türk banka/kredi kartı** (TL ödeme)
- `touristlio.com` DNS erişimi (Cloudflare)
- Brevo SMTP — e-posta doğrulama ([EPOSTA_DOGRULAMA.md](./EPOSTA_DOGRULAMA.md))

**Aynı komutlar:** [DEPLOY_HETZNER.md](./DEPLOY_HETZNER.md) ile aynı yığın (Node 22, PM2, Nginx, Certbot). Repodaki `deploy/hetzner/` dosyaları Natro’da da kullanılır.

---

## Sözlük (kısa)

| Terim | Anlamı |
|-------|--------|
| **VPS / Cloud Sunucu** | 7/24 açık uzak Linux bilgisayar |
| **IP adresi** | Sunucunun internet numarası (ör. `185.xxx.xxx.xxx`) |
| **SSH** | Windows’tan sunucuya uzaktan bağlanma |
| **root** | Linux yönetici kullanıcısı |
| **Natro panel** | VPS’i yönettiğiniz web arayüzü |
| **DNS / A kaydı** | `touristlio.com` → sunucu IP’si |
| **Nginx** | Ziyaretçiyi Node uygulamasına yönlendirir |
| **PM2** | Uygulama çökerse otomatik yeniden başlatır |
| **Certbot** | Ücretsiz HTTPS (Let’s Encrypt) |

---

# BÖLÜM 1: Natro hesap ve VPS (bugün buradan başlayın)

## 1.1 Natro’ya kayıt olun

1. Tarayıcıda açın: **https://www.natro.com**
2. Sağ üst **Üye Ol** / **Kayıt Ol**.
3. Ad, e-posta, telefon, şifre doldurun.
4. E-postanızdaki doğrulama linkine tıklayın.
5. **Müşteri paneli**ne giriş yapın: genelde **https://www.natro.com/musteri/** veya panel linki e-postada yazar.

## 1.2 Cloud Sunucu (VPS) siparişi

1. Panelde **Sunucu** / **Cloud Sunucu** / **VPS** menüsüne girin.
2. **Yeni sipariş** veya **Cloud Sunucu Oluştur** deyin.
3. Aşağıdaki ayarları seçin:

### İşletim sistemi

- **Ubuntu 22.04 LTS** veya **Ubuntu 24.04 LTS** (ikisi de uygundur; 24.04 önerilir)

### Sunucu paketi

| Özellik | Öneri |
|---------|--------|
| RAM | **En az 2 GB** (Touristlio için yeterli) |
| CPU | 1–2 vCPU |
| Disk | 20 GB+ SSD |
| Trafik | Paketteki varsayılan (Touristlio düşük trafik) |

Natro’da paket adları zamanla değişebilir; **2 GB RAM’li en küçük cloud paket** yeterlidir. Trafik artarsa panelden yükseltirsiniz.

### Konum

- **Türkiye / İstanbul** varsa seçin (gecikme düşük). Yoksa varsayılan bölge yeterli.

### Ek seçenekler

- **Yedekleme:** İsteğe bağlı (ücretli); Bölüm 8’de manuel SQLite yedeği anlatılıyor.
- **IPv4:** Mutlaka **public IPv4** olsun (IP adresi alacaksınız).

## 1.3 Ödeme (TL, kart)

1. Sepete ekleyip **Ödeme** adımına geçin.
2. **Kredi / banka kartı** ile **TL** ödeyin.
3. Sipariş onaylandıktan sonra sunucu **5–30 dakika** içinde «Aktif» olur.

> **Neden Natro?** Türk kartlarıyla TL ödeme genelde sorunsuzdur; Render/Hetzner reddedilen kartlar için pratik alternatiftir.

## 1.4 IP adresi ve root şifresi

Sunucu hazır olunca Natro panelinde:

1. **Sunucularım** / **Cloud Sunucu Listesi** → yeni sunucunuza tıklayın.
2. **IP Adresi** (Public IPv4) satırını kopyalayın → not defterine yapıştırın (`SUNUCU_IP`).
3. **Root şifresi** genelde:
   - Sipariş sonrası e-posta ile gelir, **veya**
   - Panelde **Sunucu Yönetimi** → **Şifre Sıfırla** / **Root Password** ile yeni şifre üretilir.

Şifreyi güvenli bir yere kaydedin.

## 1.5 Güvenlik duvarı (Natro panel)

Natro’da **Firewall / Güvenlik Grubu** varsa şu portları **açık** yapın:

| Port | Amaç |
|------|------|
| **22** | SSH (bağlantınız) |
| **80** | HTTP (SSL doğrulama) |
| **443** | HTTPS (site) |

Panelde «Tüm IP’lere izin ver» veya `0.0.0.0/0` — SSH için dikkatli olun; güçlü root şifresi kullanın.

**Bölüm 1 bitti.** Elinizde **SUNUCU_IP** ve **root şifresi** olmalı.

---

# BÖLÜM 2: Windows’tan sunucuya bağlanma (SSH)

## 2.1 PowerShell’i açın

1. Windows tuşu → **PowerShell** yazın → açın.

## 2.2 Bağlanın

`SUNUCU_IP` yerine Natro’dan kopyaladığınız IP’yi yazın:

```powershell
ssh root@SUNUCU_IP
```

Örnek:

```powershell
ssh root@185.123.45.67
```

## 2.3 İlk bağlantı

```
Are you sure you want to continue connecting (yes/no)?
```

**`yes`** yazın, Enter.

## 2.4 Şifre

```
root@185.xxx.xxx.xxx's password:
```

Natro root şifresini yapıştırın (ekranda görünmez — normal). Enter.

Başarılı olunca:

```
root@sunucu:~#
```

Artık komutlar **sunucuda** çalışır.

## 2.5 Bağlantı koparsa

Tekrar: `ssh root@SUNUCU_IP`

**Bölüm 2 bitti.**

---

# BÖLÜM 3: Sunucu hazırlığı

Aşağıdaki komutların **hepsini SSH oturumunda** sırayla çalıştırın. [DEPLOY_HETZNER.md](./DEPLOY_HETZNER.md) Bölüm 3 ile **aynıdır**.

## 3.1 Sistemi güncelle

```bash
apt update && apt upgrade -y
```

## 3.2 Temel araçlar

```bash
apt install -y curl git build-essential ufw
```

## 3.3 Node.js 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node -v
npm -v
```

`v22.x.x` görmelisiniz.

## 3.4 PM2

```bash
npm install -g pm2
```

## 3.5 Nginx

```bash
apt install -y nginx
systemctl enable nginx
systemctl start nginx
```

## 3.6 Certbot

```bash
apt install -y certbot python3-certbot-nginx
```

## 3.7 Güvenlik duvarı (UFW)

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
ufw status
```

## 3.8 Kalıcı veri klasörleri

```bash
mkdir -p /var/lib/touristlio/data
mkdir -p /var/lib/touristlio/backups
mkdir -p /var/log/touristlio
chmod 755 /var/lib/touristlio
```

**Bölüm 3 bitti.**

---

# BÖLÜM 4: Touristlio kurulumu

## 4.1 GitHub’dan klon

```bash
cd ~
git clone https://github.com/yyasinssari57-create/Touristlio.git
cd Touristlio
```

## 4.2 `.env` dosyası

```bash
cp deploy/hetzner/.env.hetzner.example .env
nano .env
```

**Ctrl+O** → Enter (kaydet), **Ctrl+X** (çık).

Önemli değerler:

| Değişken | Değer |
|----------|--------|
| `DATABASE_PATH` | `/var/lib/touristlio/data/touristlio.db` |
| `SITE_URL` | `https://touristlio.com` |
| `SMTP_*` | Brevo — [EPOSTA_DOGRULAMA.md](./EPOSTA_DOGRULAMA.md) |
| `JWT_SECRET` | `npm run generate:jwt-secret` ile üretin |

JWT:

```bash
npm run generate:jwt-secret
```

## 4.3 Bağımlılıklar ve seed

```bash
npm ci
npm run seed
npm run verify:smtp
```

## 4.4 PM2 ile başlat

```bash
pm2 start deploy/hetzner/ecosystem.config.js
pm2 status
curl -s http://127.0.0.1:3000/api/health
```

## 4.5 Sunucu reboot sonrası otomatik açılış

```bash
pm2 startup
```

Çıkan **sudo env PATH=...** satırını kopyalayıp çalıştırın, sonra:

```bash
pm2 save
```

**Bölüm 4 bitti.**

---

# BÖLÜM 5: Nginx + SSL (HTTPS)

## 5.1 Nginx yapılandırması

```bash
cd ~/Touristlio
cp deploy/hetzner/nginx-touristlio.conf /etc/nginx/sites-available/touristlio
ln -sf /etc/nginx/sites-available/touristlio /etc/nginx/sites-enabled/touristlio
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
```

## 5.2 Certbot (DNS ayarlı olmalı — Bölüm 6)

Cloudflare’de A kaydı **gri bulut (DNS only)** iken:

```bash
certbot --nginx -d touristlio.com -d www.touristlio.com
```

Sorularda **HTTP → HTTPS yönlendirme: 2 (Redirect)** seçin.

Test:

```bash
certbot renew --dry-run
```

**Bölüm 5 bitti.**

---

# BÖLÜM 6: Cloudflare DNS

Render’a giden eski **CNAME** kaydını silmeyin veya silmeden önce Natro’yu test edin (`http://SUNUCU_IP`).

## 6.1 A kayıtları

**https://dash.cloudflare.com** → `touristlio.com` → **DNS**:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| **A** | `@` | `SUNUCU_IP` (Natro) | **DNS only** (gri ☁️) |
| **A** | `www` | Aynı IP | **DNS only** |

TTL: Auto. Kaydedin.

## 6.2 Yayılma

5–30 dakika (bazen 48 saat). Windows’ta kontrol:

```powershell
nslookup touristlio.com
```

Natro IP’niz görünmeli.

## 6.3 SSL sonrası (isteğe bağlı)

Site HTTPS ile çalışınca Cloudflare’de turuncu proxy açılabilir; **SSL/TLS → Full (strict)**.

**Render’ı test bitene kadar kapatmayın.**

**Bölüm 6 bitti.**

---

# BÖLÜM 7: Render’dan geçiş

1. `https://touristlio.com/api/health` → `ok: true`
2. Kayıt, giriş, admin, **e-posta doğrulama** test
3. Hepsi tamam → Render servisini **Suspend** veya **Delete**

Render `.env` ile Natro `.env` içinde **JWT_SECRET aynı** kalmalı (değişirse herkes yeniden giriş yapar).

---

# BÖLÜM 8: Yedekleme ve güncelleme

Günlük SQLite yedeği — [DEPLOY_HETZNER.md](./DEPLOY_HETZNER.md) Bölüm 8 ile aynı (`/var/lib/touristlio/backups/`).

Kod güncelleme:

```bash
cd ~/Touristlio
git pull
npm ci
pm2 restart touristlio
curl -s https://touristlio.com/api/health
```

---

# Turhost alternatifi (kısa)

1. **https://www.turhost.com** → **Sanal Sunucu (VPS)** → Ubuntu 22/24, 2 GB RAM.
2. TL ödeme, panelden **IP + root şifresi**.
3. **Bölüm 2’den itibaren** komutlar aynı; sadece panel menü isimleri farklı (Firewall, Sunucu listesi vb.).

---

# Sorun giderme

| Belirti | Çözüm |
|---------|--------|
| `ssh: connect refused` | Natro firewall’da 22 açık mı? IP doğru mu? |
| Site açılmıyor | `pm2 status`, `pm2 logs touristlio` |
| 502 Bad Gateway | Node çökmüş — loglara bakın |
| E-posta gitmiyor | `npm run verify:smtp`, [EPOSTA_DOGRULAMA.md](./EPOSTA_DOGRULAMA.md) |
| SSL hatası | DNS gri bulut, domain IP’ye gelmiş mi? |

---

## Hızlı referans

| Ne | Yol |
|----|-----|
| Proje | `/root/Touristlio` |
| Veritabanı | `/var/lib/touristlio/data/touristlio.db` |
| PM2 config | `deploy/hetzner/ecosystem.config.js` |

---

**Tebrikler!** Touristlio Natro VPS’inizde çalışıyor olmalı. Sorun olursa `pm2 logs touristlio` çıktısını kaydedin.
