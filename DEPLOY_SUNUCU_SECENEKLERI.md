# Touristlio — Sunucu Seçenekleri (Türkiye Ödeme Sorunları)

Bu rehber, **Türk kartıyla Render veya Hetzner ödemesi yapamayan** Touristlio sahipleri içindir. Tüm barındırma seçeneklerini karşılaştırır, **bugün hangi yolu seçmeniz gerektiğini** söyler ve Oracle Cloud ücretsiz kurulumu için adım adım komutlar verir.

**Proje:** Touristlio — Node.js 22, Express, SQLite (`better-sqlite3`)  
**Sorun:** Render Free’de site çalışıyor ama **veritabanı kalıcı değil** — redeploy veya yeniden başlatmada kullanıcılar ve içerik sıfırlanıyor.

**İlgili rehberler:**

| Dosya | Ne için? |
|-------|----------|
| [DEPLOY.md](./DEPLOY.md) | Render kurulumu |
| [DEPLOY_HETZNER.md](./DEPLOY_HETZNER.md) | Hetzner VPS (kart çalışırsa) |
| [DEPLOY_TURK_VPS.md](./DEPLOY_TURK_VPS.md) | **Natro / Turhost** — TL ile Türk VPS (önerilen) |
| Bu dosya | Tüm seçenekler + Türkiye ödeme çözümleri |

---

## Hızlı karar — bugün ne yapmalısınız?

| Durum | Öneri |
|-------|-------|
| Kartınız yurtdışı SaaS’larda (Render, Hetzner) reddediliyor | **1. Oracle Cloud Always Free** dene → olmazsa **2. Türk VPS** |
| Oracle hesabı açıldı, VM oluştu | [Bölüm 4](#bölüm-4-oracle-cloud--touristlio-kurulumu-kopyala-yapıştır) komutlarını uygula |
| Oracle da kart doğrulamasında takıldı | **[DEPLOY_TURK_VPS.md](./DEPLOY_TURK_VPS.md)** — Natro ile TL ödemeli VPS (önerilen) |
| Geçici olarak Render Free’de kalacaksanız | [Bölüm 8](#bölüm-8-geçici-çözüm-render-free--manuel-sqlite-yedek) yedekleme bölümünü okuyun |

### Bugün seçilecek yol: **Oracle Cloud Always Free**

**Neden?**

- **€0/ay** — süresiz Always Free katmanı (kart doğrulaması için küçük provizyon, sonra iade)
- Türk banka kartları Oracle doğrulamasında **çoğu zaman** Render/Hetzner’a göre daha az sorun çıkarır
- Tam Linux VPS — SQLite kalıcı diskte kalır (`/var/lib/touristlio/`)
- Touristlio boyutu için **ARM VM** (4 OCPU / 24 GB RAM payı) fazlasıyla yeterli
- Hetzner rehberindeki aynı yığın: Ubuntu, Node 22, PM2, Nginx, Certbot

**Oracle da reddederse:** Aynı gün **Türk VPS** (Natro vb.) ile devam edin — kurulum komutları Oracle ile **birebir aynıdır**, sadece sunucu paneli farklıdır.

### İlk 3 adım (bugün)

1. **https://www.oracle.com/cloud/free/** adresinden Oracle hesabı açın; kart doğrulamasını tamamlayın (Always Free).
2. **Ubuntu 24.04 ARM** sanal makine oluşturun; **Public IP**’yi not edin; güvenlik listesinde **22, 80, 443** portlarını açın.
3. Windows PowerShell’den `ssh ubuntu@SUNUCU_IP` ile bağlanın; [Bölüm 4.3](#43-sunucu-hazırlığı-tek-sefer) komut bloklarını sırayla çalıştırın.

---

## Sözlük (kısa)

| Terim | Anlamı |
|-------|--------|
| **VPS** | 7/24 açık uzak Linux bilgisayar |
| **SQLite** | Touristlio’nun tek dosyalık veritabanı (`touristlio.db`) |
| **Kalıcı disk** | Redeploy’da silinmeyen depolama |
| **Ephemeral** | Geçici — Render Free’de veri burada, silinir |
| **DNS** | `touristlio.com` → hangi sunucu IP’si |
| **Cloudflare** | DNS yönetimi; turuncu bulut = proxy, gri = sadece DNS |
| **PM2** | Node uygulamasını arka planda ve otomatik başlatır |
| **Nginx** | 443/80 → Node 3000 yönlendirmesi |
| **Certbot** | Ücretsiz Let’s Encrypt SSL |

---

# Seçenek karşılaştırması

## 1. Render Free (mevcut durum)

| | |
|--|--|
| **Maliyet** | $0 |
| **Kart** | Gerekmez |
| **Kalıcı SQLite** | **Hayır** |
| **Uygunluk** | Demo / test — **production değil** |

### Artıları

- GitHub bağlantısı ile otomatik deploy
- HTTPS ve `*.onrender.com` alt alan adı hazır
- Kurulum kolay (`render.yaml`, [DEPLOY.md](./DEPLOY.md))
- Site şu an çalışıyor

### Eksileri

- **Disk mount yok** — `data/touristlio.db` redeploy, ölçeklendirme veya servis yeniden başlatmada **silinir**
- `STORAGE_PERSISTENT` ayarlanamaz; admin panelinde geçici depolama uyarısı görünür
- Kayıtlı kullanıcılar, Tiola yorumları, moderasyon geçmişi **kaybolur**
- `uploads/` klasörü de geçici (fotoğraflar redeploy’da gidebilir)
- Ücretsiz planda soğuk başlangıç (ilk istek yavaş olabilir)

### Veri kaybı ne zaman olur?

- Manuel **Redeploy**
- Render altyapı güncellemesi / taşıma
- Servis **Suspend** sonrası yeniden başlatma
- Blueprint veya `render.yaml` değişikliği sonrası deploy

`SEED_ON_START=true` sadece **boş** veritabanında yerleri ve admin’i doldurur; **mevcut kullanıcıları geri getirmez**.

---

## 2. Render Starter (+ disk)

| | |
|--|--|
| **Maliyet** | ~**$7/ay** (Starter) + 1 GB disk |
| **Kart** | Uluslararası kredi/banka kartı |
| **Kalıcı SQLite** | **Evet** (`/opt/render/project/src/data`) |
| **Durumunuz** | **Kart reddedildi — şu an kullanılamıyor** |

### Artıları

- Mevcut `render.yaml` ve [DEPLOY.md](./DEPLOY.md) ile uyumlu
- Yönetilen platform — Nginx/SSL Render’da
- Disk mount ile SQLite kalıcı (`STORAGE_PERSISTENT=true`)

### Eksileri

- **Türk kartları sık reddediliyor** (sizin durum)
- Aylık döviz maliyeti
- Tam root erişimi yok (Shell sınırlı)
- `uploads/` hâlâ ephemeral (ikinci disk veya S3 gerekir)

**Sonuç:** Kart çalışsaydı iyi seçenek; sizin için **şu an kapalı**.

---

## 3. Hetzner Cloud

| | |
|--|--|
| **Maliyet** | ~**€4–6/ay** (CPX11 / CX22) |
| **Kart** | Euro faturalı; bazı TR kartları kabul edilir |
| **Kalıcı SQLite** | **Evet** (sunucu diski) |
| **Durumunuz** | **Ödeme kaydı başarısız — şu an kullanılamıyor** |

### Artıları

- Tam rehber repoda: [DEPLOY_HETZNER.md](./DEPLOY_HETZNER.md)
- `deploy/hetzner/` yapılandırma dosyaları hazır
- Performans/fiyat dengesi çok iyi
- Almanya lokasyonu — Türkiye gecikmesi düşük

### Eksileri

- **Ödeme yöntemi kaydedilemedi** (sizin durum)
- Aylık euro ödeme
- Sunucu yönetimi sizde (SSH, güncelleme, yedek)

**Sonuç:** Kart sorunu çözülürse en iyi ücretli yabancı VPS; şimdilik **yedek plan**.

---

## 4. Oracle Cloud Always Free ⭐ ÖNERİLEN

| | |
|--|--|
| **Maliyet** | **€0/ay** (Always Free kaynaklar) |
| **Kart** | Doğrulama için gerekli; **abonelik ücreti yok** |
| **Kalıcı SQLite** | **Evet** (boot volume / ek block volume) |
| **Donanım** | ARM `VM.Standard.A1.Flex` — Touristlio için bol |

### Artıları

- **Süresiz ücretsiz** (Always Free tier kapsamında)
- 4 OCPU + 24 GB RAM’e kadar ARM payı (tek VM’de 1–2 OCPU ayırmak yeterli)
- 200 GB block storage (Always Free)
- Tam root (SSH) — Hetzner ile aynı kurulum
- Türk kartlarıyla doğrulama **çoğu kullanıcıda çalışıyor** (garanti değil, ama Render/Hetzner’dan daha iyi şans)

### Eksileri

- Kayıt ve panel **karmaşık** (Hetzner’dan zor)
- Hesap onayı bazen 24–48 saat sürebilir
- “Out of capacity” hatası — bölge seçiminde deneme gerekebilir (Frankfurt, Amsterdam vb.)
- ARM mimarisi — Touristlio Node 22 + `better-sqlite3` için **uyumlu** (prebuilt binary var)
- Destek yok; her şey sizin sorumluluğunuzda

### Always Free limitleri (Touristlio için yeterli)

| Kaynak | Limit |
|--------|-------|
| ARM Ampere A1 | Toplam 4 OCPU, 24 GB RAM |
| Block Volume | 200 GB |
| Outbound data | 10 TB/ay (pratikte sınır değil) |
| Public IP | 2 adet (IPv4) |

**Sonuç:** Ödeme sorununuz varsa **birinci tercih**.

---

## 5. Türk VPS (Natro, Turhost, Güzelhosting)

| | |
|--|--|
| **Maliyet** | ~**150–400 ₺/ay** (pakete göre) |
| **Kart** | **TL — yerel banka kartı** |
| **Kalıcı SQLite** | **Evet** |
| **Kurulum** | Oracle/Hetzner ile **aynı komutlar** |

### Artıları

- **Türk Lirası fatura**, havale/EFT, yerel kart
- Türkçe destek, WhatsApp/telefon
- Oracle veya yabancı kart sorunu **tamamen bypass**
- Ubuntu VPS seçince Touristlio rehberi birebir uygulanır

### Eksileri

- Aylık ücret (ücretsiz değil)
- Paket kalitesi firmaya göre değişir
- Bazı ucuz paketlerde RAM/CPU sınırlı olabilir
- Yedekleme ve güvenlik çoğunlukla sizde

### Nasıl seçilir? (kısa kontrol listesi)

| Kriter | Minimum öneri (Touristlio) |
|--------|---------------------------|
| İşletim sistemi | **Ubuntu 22.04 veya 24.04** |
| RAM | **2 GB** (4 GB rahat) |
| CPU | 2 vCPU |
| Disk | **20 GB+** SSD |
| Trafik | Sınırsız veya 1 TB+ |
| Root erişimi | **SSH root veya sudo** şart |

**Firmalar (örnek):**

| Firma | Not |
|-------|-----|
| [Natro](https://www.natro.com) | Ucuz VPS, TL ödeme |
| [Turhost](https://www.turhost.com) | Yerli, destek iyi |
| [Güzelhosting](https://www.guzelhosting.com) | VPS + domain paketleri |

**İpucu:** “Linux VPS”, “root erişim”, “Ubuntu” kelimelerini arayın. Windows VPS **almayın**.

**Sonuç:** Oracle kart doğrulaması da başarısız olursa **en pratik kalıcı çözüm**.

---

## 6. Cloudflare

| | |
|--|--|
| **Ne yapar?** | DNS, CDN, DDoS koruması, SSL (edge) |
| **Ne yapmaz?** | Node.js uygulaması **çalıştırmaz** |

### Touristlio için rolü

- `touristlio.com` DNS kayıtlarını yönetmek (A kaydı → VPS IP)
- İsteğe bağlı turuncu bulut (proxy) — site VPS’te HTTPS kurulduktan **sonra**
- **Uygulama sunucusu değil** — Touristlio’yu barındırmaz

### Cloudflare Workers olur mu?

- Workers **serverless JavaScript** ortamıdır
- Touristlio: Express + SQLite + dosya yükleme + uzun cron işleri
- Workers’a taşımak = **tam yeniden yazım** (SQLite yerine D1/KV, Express yerine Worker router)
- **Önerilmez** — mevcut proje için mantıklı değil

**Sonuç:** DNS için kullanın; hosting yerine geçmez.

---

## 7. Ev PC + Cloudflare Tunnel

| | |
|--|--|
| **Maliyet** | $0 (elektrik hariç) |
| **Kalıcı SQLite** | Evet (PC diskinde) |
| **Gereksinim** | PC **7/24 açık**, stabil internet |

### Artıları

- Kart veya VPS gerekmez
- Cloudflare Tunnel ile HTTPS ve domain mümkün
- Geliştirme ortamına yakın

### Eksileri

- Elektrik kesintisi = site kapalı
- Dinamik IP / modem yeniden başlatma
- Güvenlik riski (ev ağına açık port)
- Upload bant genişliği ev internetine bağlı
- Production için **profesyonel görünmez**

**Sonuç:** Acil demo veya kişisel test; Touristlio canlı sitesi için **önerilmez**.

---

# Maliyet ve kalıcılık özeti

| Seçenek | Aylık | Kalıcı SQLite | TR kart | Production |
|---------|-------|---------------|---------|------------|
| Render Free | $0 | ❌ | ✅ (ödeme yok) | ❌ |
| Render Starter | ~$7 | ✅ | ❌ (sizde) | ✅ |
| Hetzner | ~€5 | ✅ | ❌ (sizde) | ✅ |
| **Oracle Free** | **€0** | **✅** | **⚠️ doğrulama** | **✅** |
| Türk VPS | ~200₺ | ✅ | ✅ | ✅ |
| Cloudflare | $0 (DNS) | — | — | DNS only |
| Ev PC + Tunnel | $0 | ✅ | ✅ | ❌ |

---

# BÖLÜM 4: Oracle Cloud — Touristlio kurulumu (kopyala-yapıştır)

Bu bölüm [DEPLOY_HETZNER.md](./DEPLOY_HETZNER.md) ile aynı mantıkta yazılmıştır; Oracle’a özel adımlar işaretlenmiştir.

**Tahmini süre:** İlk kez 2–3 saat (Oracle hesap onayı dahil).  
**Maliyet:** €0 (Always Free).

---

## 4.1 Oracle hesabı ve VM oluşturma

### 4.1.1 Kayıt

1. **https://www.oracle.com/cloud/free/** → **Start for free**
2. Ülke: **Turkey**, e-posta ve bilgileri doldurun
3. **Home Region** seçin — değiştirilemez; öneri: **Germany Central (Frankfurt)** veya **Netherlands Northwest (Amsterdam)**
4. Kart bilgisi girin — **Always Free** için küçük doğrulama ücreti alınıp iade edilir (bankanıza göre 1–5 TL provizyon görülebilir)
5. E-posta onayı + hesap aktifleşmesi (bazen 30 dk – 48 saat)

> **Kart reddedilirse:** Farklı kart deneyin veya doğrudan [Bölüm 5](#5-türk-vps--kısa-kurulum) Türk VPS’e geçin.

### 4.1.2 Compute Instance oluştur

1. Oracle Console → **☰** → **Compute** → **Instances** → **Create instance**
2. Ayarlar:

| Alan | Değer |
|------|-------|
| Name | `touristlio` |
| Image | **Canonical Ubuntu 24.04** (veya 22.04) |
| Shape | **Ampere** → **VM.Standard.A1.Flex** |
| OCPU | **2** (1 de yeter; 2 rahat) |
| Memory (GB) | **12** (veya 6 — Touristlio için fazlasıyla yeterli) |
| Boot volume | 50 GB (varsayılan yeterli) |

3. **Networking:** “Assign a public IPv4 address” → **işaretli**
4. **SSH keys:**
   - **Generate a key pair for me** → private key indirin (`.key` dosyası) — **kaybetmeyin**
   - veya mevcut public key yapıştırın (Hetzner rehberindeki `id_ed25519.pub` gibi)

5. **Create** — birkaç dakika sonra **Running** olmalı

> **“Out of host capacity” hatası:** Başka **Home Region** ile yeni hesap açılamaz; aynı bölgede farklı **Availability Domain** veya daha az OCPU (1/6) deneyin; gece saatleri bazen boşalır.

### 4.1.3 Güvenlik listesi (firewall) — ÖNEMLİ

Oracle varsayılan olarak sadece SSH açar. HTTP/HTTPS için:

1. Instance detay → **Primary VNIC** → **Subnet** linkine tıklayın
2. **Default Security List** → **Add Ingress Rules**

| Source CIDR | Protocol | Dest Port | Açıklama |
|-------------|----------|-----------|----------|
| `0.0.0.0/0` | TCP | 22 | SSH |
| `0.0.0.0/0` | TCP | 80 | HTTP |
| `0.0.0.0/0` | TCP | 443 | HTTPS |

3. **Add Ingress Rules** ile kaydedin

### 4.1.4 Public IP’yi not edin

Instance sayfasında **Public IP address** — örnek: `132.145.xxx.xxx`

---

## 4.2 Windows’tan SSH bağlantısı

Oracle’dan indirdiğiniz `.key` dosyasını örneğin `C:\Users\SIZIN_ADINIZ\.ssh\oracle-touristlio.key` konumuna koyun.

PowerShell:

```powershell
# İlk kez — izinleri düzelt (sadece bir kez)
icacls "$env:USERPROFILE\.ssh\oracle-touristlio.key" /inheritance:r /grant:r "$env:USERNAME:(R)"

# Bağlan — SUNUCU_IP ve key yolunu değiştirin
ssh -i "$env:USERPROFILE\.ssh\oracle-touristlio.key" ubuntu@SUNUCU_IP
```

> Ubuntu imajında varsayılan kullanıcı **`ubuntu`** (Hetzner’da `root`). `sudo` yetkisi vardır.

İlk bağlantıda `yes` yazın. Başarılı oturum: `ubuntu@touristlio:~$`

---

## 4.3 Sunucu hazırlığı (tek sefer)

Aşağıdaki komutların **hepsini SSH oturumunda** çalıştırın.

### Sistemi güncelle

```bash
sudo apt update && sudo apt upgrade -y
```

### Temel araçlar

```bash
sudo apt install -y curl git build-essential ufw
```

### Node.js 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # v22.x.x
npm -v
```

### PM2

```bash
sudo npm install -g pm2
```

### Nginx + Certbot

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

### Güvenlik duvarı

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
sudo ufw status
```

### Kalıcı veri klasörleri (SQLite)

```bash
sudo mkdir -p /var/lib/touristlio/data
sudo mkdir -p /var/lib/touristlio/backups
sudo mkdir -p /var/log/touristlio
sudo chmod 755 /var/lib/touristlio
sudo chown -R ubuntu:ubuntu /var/lib/touristlio /var/log/touristlio
```

---

## 4.4 Touristlio kurulumu

### Repoyu klonla

```bash
cd ~
git clone https://github.com/yyasinssari57-create/Touristlio.git
cd Touristlio
```

### Ortam dosyası

```bash
cp deploy/hetzner/.env.hetzner.example .env
nano .env
```

**Kritik değerler:**

| Değişken | Değer |
|----------|-------|
| `DATABASE_PATH` | `/var/lib/touristlio/data/touristlio.db` |
| `STORAGE_PERSISTENT` | `true` |
| `TRUST_PROXY` | `true` |
| `SITE_URL` | `https://touristlio.com` |
| `CORS_ORIGIN` | `https://touristlio.com` |
| `JWT_SECRET` | `npm run generate:jwt-secret` çıktısı (32+ karakter) |
| `ADMIN_PASSWORD` | Güçlü şifre |
| `SMTP_*` | Brevo bilgileri |

JWT üretmek:

```bash
npm run generate:jwt-secret
```

### Bağımlılıklar ve seed

```bash
npm ci
npm run seed
npm run verify:smtp
```

### PM2 ile başlat

```bash
pm2 start deploy/hetzner/ecosystem.config.js
pm2 status
curl -s http://127.0.0.1:3000/api/health
```

`{"ok":true,...}` dönmeli.

### Sunucu reboot sonrası otomatik başlat

```bash
pm2 startup
# Çıkan sudo komutunu kopyalayıp çalıştırın
pm2 save
```

---

## 4.5 Nginx + SSL

### Site yapılandırması

```bash
cd ~/Touristlio
sudo cp deploy/hetzner/nginx-touristlio.conf /etc/nginx/sites-available/touristlio
sudo ln -sf /etc/nginx/sites-available/touristlio /etc/nginx/sites-enabled/touristlio
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

### DNS (Cloudflare)

Render CNAME kaydını silin; yerine:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `@` | `SUNUCU_IP` | DNS only (gri) |
| A | `www` | `SUNUCU_IP` | DNS only (gri) |

5–30 dakika bekleyin; sonra:

```bash
sudo certbot --nginx -d touristlio.com -d www.touristlio.com
```

HTTP → HTTPS yönlendirme: **2 (Redirect)** seçin.

Test: **https://touristlio.com/api/health**

---

## 4.6 Render’dan geçiş

1. Oracle’da site tam çalışınca DNS’i yeni IP’ye çevirin
2. Admin, kayıt, e-posta doğrulama test edin
3. Render Dashboard → servis → **Suspend** veya **Delete**
4. Render Shell’den son yedek aldıysanız `.db` dosyasını Oracle’a kopyalayın:

```bash
# Oracle sunucuda — yedek dosyası ~/touristlio-backup.db ise
sudo cp ~/touristlio-backup.db /var/lib/touristlio/data/touristlio.db
sudo chown ubuntu:ubuntu /var/lib/touristlio/data/touristlio.db
pm2 restart touristlio
```

---

## 4.7 Yedekleme (cron)

```bash
sudo nano /usr/local/bin/touristlio-backup.sh
```

İçerik:

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

```bash
sudo chmod +x /usr/local/bin/touristlio-backup.sh
sudo /usr/local/bin/touristlio-backup.sh
crontab -e
```

Ekleyin:

```
0 3 * * * /usr/local/bin/touristlio-backup.sh >> /var/log/touristlio/backup.log 2>&1
```

---

## 4.8 Kod güncelleme

```bash
cd ~/Touristlio
git pull
npm ci
pm2 restart touristlio
curl -s https://touristlio.com/api/health
```

---

# 5. Türk VPS — kısa kurulum

Oracle olmazsa Natro/Turhost/Güzelhosting’den **Ubuntu 24.04 VPS** alın. Panelden root şifresi veya SSH key gelir.

**Fark:** SSH kullanıcısı `root` olabilir (Hetzner gibi). Bağlantı:

```powershell
ssh root@SUNUCU_IP
```

Sonrasında **[4.3](#43-sunucu-hazırlığı-tek-sefer) – [4.8](#48-kod-güncelleme)** bölümlerinin tamamı aynıdır. `ubuntu` yerine `root` kullanıyorsanız `sudo` öneklerini kaldırabilir veya olduğu gibi bırakabilirsiniz.

---

# BÖLÜM 8: Geçici çözüm — Render Free + manuel SQLite yedek

Oracle veya VPS hazır olana kadar Render Free’de kalıyorsanız, **veri kaybını tamamen önlemez** ama **yedekten kurtarma şansı** verir.

### Ne yapar / ne yapmaz?

| | |
|--|--|
| ✅ | Periyodik `.db` kopyası oluşturur |
| ✅ | Redeploy sonrası yedeği geri yükleyebilirsiniz |
| ❌ | Otomatik kalıcılık sağlamaz |
| ❌ | Render Free’de cron yok — **manuel veya dış tetikleyici** gerekir |

### Render Shell’de manuel yedek

Render Dashboard → servis → **Shell**:

```bash
npm run backup:db
ls -la backups/
```

Çıktı: `backups/touristlio-YYYY-MM-DD_HH-mm-ss.db`

**İndirme:** Shell çıktısındaki dosyayı Render arayüzünden doğrudan indiremeyebilirsiniz. Seçenekler:

1. **Base64 ile kopyala** (küçük DB için):

```bash
base64 -w0 backups/touristlio-*.db | head -c 50000
```

Çıktıyı yerel dosyaya yapıştırıp decode edin (küçük DB’ler için pratik).

2. **Harici depolama:** Gelecekte S3/Drive upload script eklenebilir; şimdilik önemli değişiklikten **önce** Shell’de `npm run backup:db` çalıştırıp dosya boyutunu not edin.

### Redeploy öncesi rutin

1. Render Shell → `npm run backup:db`
2. Mümkünse `.db` dosyasını bilgisayarınıza kaydedin
3. **Manual Deploy** yapın
4. Shell → `npm run seed` (boş DB ise)
5. Yedeği geri yüklemek için (Shell’de, dosyayı `backups/` altına koyduktan sonra):

```bash
cp backups/touristlio-EN-SON.db data/touristlio.db
# Servis otomatik yeniden başlamaz — Dashboard'dan Manual Deploy veya Restart
```

### Ortam değişkeni ipucu

Render Free’de `DATABASE_PATH` boş bırakılırsa uygulama `data/touristlio.db` dener; disk kalıcı olmadığı için [server/db.js](./server/db.js) uyarı loglar yazar.

---

# Sorun giderme (Oracle / VPS)

| Belirti | Çözüm |
|---------|-------|
| SSH bağlanamıyorum | Security List’te 22 açık mı; doğru IP ve `.key` |
| Site açılmıyor | `pm2 status`, `pm2 logs touristlio` |
| 502 Bad Gateway | Node çökmüş — `pm2 restart touristlio` |
| Certbot başarısız | Cloudflare’de gri bulut; DNS yayılımını bekleyin |
| `better-sqlite3` hata | `node -v` → 22.x olmalı |
| Veri yine kayboldu | `DATABASE_PATH=/var/lib/touristlio/data/touristlio.db` ve `STORAGE_PERSISTENT=true` kontrol |
| Oracle capacity hatası | OCPU 1, RAM 6 GB dene; farklı saat tekrar dene |

---

# Hızlı referans — önemli yollar

| Ne | Yol |
|----|-----|
| Proje (Oracle) | `/home/ubuntu/Touristlio` |
| Veritabanı | `/var/lib/touristlio/data/touristlio.db` |
| Yedekler | `/var/lib/touristlio/backups/` |
| Ortam dosyası | `~/Touristlio/.env` |
| Nginx | `/etc/nginx/sites-available/touristlio` |
| PM2 | `pm2 status`, `pm2 logs touristlio` |

---

# Sonuç

| Sizin durum | Öneri |
|-------------|-------|
| Render Free, veri sıfırlanıyor | Production için **yetersiz** |
| Render Starter / Hetzner kart reddi | **Oracle Always Free** → olmazsa **Türk VPS** |
| DNS | Cloudflare **A kaydı** → VPS IP (uygulama sunucusu değil) |
| Geçici | Render Shell `npm run backup:db` — tam çözüm değil |

**Bugün:** Oracle hesabı aç → Ubuntu ARM VM → Bölüm 4.3 komutları. Kart yine reddedilirse aynı komutlarla Türk VPS.

Detaylı Hetzner adımları (ek görsel anlatım): [DEPLOY_HETZNER.md](./DEPLOY_HETZNER.md)  
Render özel notlar: [DEPLOY.md](./DEPLOY.md)
