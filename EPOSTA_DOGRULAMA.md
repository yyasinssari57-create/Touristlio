# Touristlio — E-posta Doğrulama (Kullanıcı Rehberi)

Kayıt olduktan sonra **«Touristlio — E-posta doğrulama»** konulu bir e-posta gelmesi gerekir. Bağlantıya tıklayınca hesabınız etkinleşir ve Tiola yazabilirsiniz.

Bu rehber, **e-posta gelmedi** veya **doğrulama çalışmadı** durumunda ne yapılacağını açıklar.

---

## 1. İlk kontroller (siz)

1. **Gereksiz / spam klasörüne** bakın (Gmail: «Promotions», Outlook: «Gereksiz e-posta», Yandex: «Spam»).
2. E-posta adresini **doğru yazdığınızdan** emin olun (kayıt formundaki adres).
3. **5–10 dakika** bekleyin; bazen gecikme olur.
4. Touristlio’da **Profil → Ayarlar → «Doğrulama e-postasını yeniden gönder»** (veya giriş ekranındaki ilgili bağlantı) ile tekrar deneyin.
5. Farklı bir e-posta sağlayıcısı (ör. Gmail) ile denemek sorunu ayırt etmeye yardımcı olabilir.

---

## 2. Teknik akış (sistem nasıl çalışır?)

| Adım | Ne olur? |
|------|----------|
| Kayıt | Sunucu hesabı oluşturur, doğrulama token’ı üretir |
| E-posta | **Brevo SMTP** (`smtp-relay.brevo.com`) üzerinden gönderilir |
| Bağlantı | `https://touristlio.com/verify-email?token=...` (24 saat geçerli) |
| Doğrulama | Bağlantı açılınca `email_verified = 1` olur, giriş serbest |

E-posta **sunucuda** `server/lib/mailer.js` ile gönderilir. SMTP ayarları `.env` / Render ortam değişkenlerinden okunur.

---

## 3. E-posta neden gelmeyebilir?

### A) SMTP yapılandırılmamış (Render / sunucu)

**Belirti:** Kayıt olur ama mail hiç gelmez; sunucu loglarında «Email skipped (SMTP not configured)».

**Gerekli ortam değişkenleri:**

| Değişken | Örnek | Not |
|----------|--------|-----|
| `SMTP_HOST` | `smtp-relay.brevo.com` | Brevo SMTP sunucusu |
| `SMTP_PORT` | `587` | TLS |
| `SMTP_USER` | Brevo hesap e-postanız | |
| `SMTP_PASS` | Brevo **SMTP anahtarı** | API anahtarı değil! |
| `SMTP_FROM` | `noreply@touristlio.com` | Brevo’da **doğrulanmış gönderen** olmalı |
| `SITE_URL` | `https://touristlio.com` | Doğrulama linkindeki domain |
| `REQUIRE_EMAIL_VERIFICATION` | `true` | Açıkken doğrulama zorunlu |

**Render’da:** Dashboard → Touristlio servisi → **Environment** → değişkenleri ekleyin → **Save** → redeploy.

**Test (sunucuda veya yerelde):**

```bash
npm run verify:smtp
```

«SMTP bağlantısı başarılı» görmelisiniz.

### B) Brevo gönderen (FROM) doğrulanmamış

Brevo panelinde **Senders & IP** → gönderen e-postayı ekleyin ve doğrulama mailindeki linki onaylayın. `SMTP_FROM` ile **aynı adres** olmalı.

### C) Yanlış SMTP anahtarı

Brevo → **SMTP & API** → **Generate a new SMTP key** → `SMTP_PASS` olarak yapıştırın (eski API key değil).

### D) Spam / filtre

Brevo üzerinden gönderim «Delivered» görünüyorsa sorun alıcı tarafındadır — spam klasörü, kurumsal filtre veya `@touristlio.com` itibar skoru.

### E) `SITE_URL` yanlış

Doğrulama linki yanlış domain’e giderse mail gelse bile sayfa açılmaz. Production’da `https://touristlio.com` (sonda `/` yok).

### F) Kayıt sırasında SMTP hatası

Kayıt **başarılı** sayılır ama mail gönderilemezse API yanıtında `emailVerificationSent: false` döner. Yönetici sunucu loglarında «Verification email failed» aramalıdır.

---

## 4. Yönetici / moderatör kontrol listesi

1. Kullanıcıdan spam klasörü + yeniden gönder denemesini isteyin.
2. Admin panel → **Kullanıcılar** → profil → **E-posta doğrulanmadı** rozeti.
3. Render/sunucu log: `Verification email sent` / `failed` / `skipped`.
4. `npm run verify:smtp` ile Brevo bağlantısını doğrulayın.
5. Brevo → **Transactional** → **Logs**: gönderim durumu (sent, bounced, blocked).

**Not:** Admin panelinden e-postayı manuel «doğrulanmış» yapma özelliği yoktur; kullanıcı bağlantıya tıklamalı veya SMTP düzeltilip yeniden gönderilmelidir.

---

## 5. Render özel notlar

- **Free plan:** SMTP env değişkenleri tanımlı olmalı; aksi halde mail atılmaz.
- Env değiştirdikten sonra **Manual Deploy** veya otomatik redeploy gerekir.
- Render Shell’de: `npm run verify:smtp` çalıştırılabilir (repo ve `.env` erişimi varsa).

---

## 6. Özet — en sık nedenler

| Sıra | Neden | Çözüm |
|------|--------|--------|
| 1 | Spam klasörü | Kullanıcı kontrol eder |
| 2 | SMTP env eksik (Render) | `SMTP_*` + redeploy |
| 3 | Brevo FROM doğrulanmamış | Brevo gönderen onayı |
| 4 | Yanlış SMTP key | Yeni SMTP key, `SMTP_PASS` güncelle |
| 5 | Gecikme | 10 dk bekle + yeniden gönder |

---

**İlgili dosyalar:** `server/lib/mailer.js`, `server/modules/auth/auth.service.js`, `server/scripts/verify-smtp.js`, `.env.production.example`
