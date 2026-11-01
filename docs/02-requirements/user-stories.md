# User Story'ler

| Alan | Değer |
| --- | --- |
| Sürüm | 1.0 |
| Tarih | 2026-10-24 |
| İlgili belgeler | [prd.md](prd.md) · [glossary.md](glossary.md) · [state-machines.md](../03-architecture/state-machines.md) |

**Biçim:** Her story bir persona (P-xx, bkz. PRD bölüm 3), bir özellik (F-xx) ve bir MoSCoW önceliği taşır. Kabul kriterleri (AC) Given / When / Then biçimindedir ve her biri en az bir otomatik testle karşılanmalıdır.

**Sayısal değerler:** Süre, kota ve eşik değerleri `settings` tablosundan okunur. Burada yazan değerler platform varsayılanlarıdır (bkz. US-017).

## Epic listesi

| Epic | Konu | Story'ler |
| --- | --- | --- |
| EP-01 | Kimlik ve oturum | US-001 – US-004 |
| EP-02 | Kayıt ve işletme yönetimi | US-005 – US-011 |
| EP-03 | Kullanıcı ve rol | US-012 – US-014 |
| EP-04 | Platform yönetimi | US-015 – US-018 |
| EP-05 | Bağlantı ağı | US-019 – US-027 |
| EP-06 | Katalog | US-028 – US-033 |
| EP-07 | Fiyat | US-034 – US-037 |
| EP-08 | Stok | US-038 – US-039 |
| EP-09 | Sepet ve sipariş | US-040 – US-045, US-061 |
| EP-10 | Teslimat | US-046 – US-049 |
| EP-11 | Cari ve belge | US-050 – US-053 |
| EP-12 | Bildirim, abonelik, gözlem | US-054 – US-057 |
| EP-13 | Dil, bölge, istemci | US-058 – US-060 |

---

## EP-01 Kimlik ve oturum

### US-001 — Telefon ve SMS OTP ile giriş

**Persona:** tüm kullanıcılar · **Özellik:** F-01 · **Öncelik:** Must

Bir kullanıcı olarak telefon numaram ve SMS'le gelen kodla giriş yapmak istiyorum; böylece şifre hatırlamak zorunda kalmam.

- **AC1:** Given kayıtlı bir telefon numarası, When kullanıcı numarasını girip kod ister, Then 6 haneli ve 5 dakika geçerli bir kod SMS ile gönderilir.
- **AC2:** Given gönderilmiş geçerli bir kod, When kullanıcı kodu doğru girer, Then oturum açılır ve kullanıcı üyesi olduğu işletmenin dashboard'una yönlendirilir.
- **AC3:** Given aynı numara, When son 60 saniyede kod istenmişse veya son 1 saatte 5 kod istenmişse, Then yeni kod gönderilmez ve kalan süre gösterilir.
- **AC4:** Given gönderilmiş bir kod, When 5 kez yanlış kod girilir, Then numara 15 dakika kilitlenir ve olay audit loga yazılır.
- **AC5:** Given süresi dolmuş veya kullanılmış bir kod, When girilir, Then kod reddedilir.

- **AC6:** Given geliştirme veya staging ortamı (`SMS_PROVIDER=mock`), When kod istenir, Then SMS gönderilmez ve kod yalnızca geliştirici SMS kutusunda (`/api/v1/dev/sms-outbox`) görünür (NFR-95–NFR-98).

📌 VARSAYIM: Kilit süresi 15 dakikadır.

### US-002 — Admin rolleri için iki adımlı doğrulama

**Persona:** P-01, P-02, P-08 · **Özellik:** F-02 · **Öncelik:** Must

Bir platform veya işletme admini olarak hesabımı ikinci bir doğrulama adımıyla korumak istiyorum; böylece telefonum ele geçse bile hesabım korunur.

- **AC1:** Given platform rolü olan bir kullanıcı, When ilk kez giriş yapar, Then TOTP (doğrulama uygulaması) kurulumu zorunlu tutulur ve kurulmadan panel açılmaz.
- **AC2:** Given TOTP kurulu bir kullanıcı, When OTP ile girişten sonra TOTP kodu yanlış girilir, Then oturum açılmaz.
- **AC3:** Given işletme admini rolü, When 2FA kurulu değilse, Then her girişte kurulum önerilir; işletme ayarı "2FA zorunlu" ise kurulmadan devam edilemez.
- **AC4:** Given TOTP kurulumu, When tamamlanır, Then 10 adet tek kullanımlık kurtarma kodu bir kez gösterilir.

📌 VARSAYIM: 2FA yöntemi TOTP'dir (SMS maliyeti ve SIM kopyalama riski nedeniyle). Platform rolleri için zorunlu, işletme adminleri için önerilir.

### US-003 — Birden çok işletme arasında geçiş

**Persona:** tüm kullanıcılar · **Özellik:** F-03 · **Öncelik:** Should

Birden fazla işletmede üyeliği olan bir kullanıcı olarak işletmeler arasında geçiş yapmak istiyorum; böylece her biri için ayrı hesap açmam gerekmez.

- **AC1:** Given iki işletmede üyeliği olan bir kullanıcı, When giriş yapar, Then son kullandığı işletmenin paneli açılır ve üst menüde işletme seçici görünür.
- **AC2:** Given işletme seçici, When başka işletme seçilir, Then menü, veriler ve izinler yalnızca seçilen işletmeye göre yenilenir.
- **AC3:** Given A işletmesindeyken, When kullanıcı B işletmesine ait bir kaydın adresini doğrudan açar, Then 404 döner.

### US-004 — Oturum ve cihaz yönetimi

**Persona:** tüm kullanıcılar · **Özellik:** F-04 · **Öncelik:** Should

Bir kullanıcı olarak hangi cihazlarda oturumumun açık olduğunu görmek ve kapatmak istiyorum; böylece kaybolan bir telefondan erişimi kesebilirim.

- **AC1:** Given açık oturumlar, When kullanıcı "Cihazlarım" ekranını açar, Then her oturumun cihaz türü, son kullanım zamanı ve yaklaşık konumu (şehir) listelenir.
- **AC2:** Given bir oturum, When kullanıcı "Bu cihazdan çıkış yap" der, Then o oturumun yenileme anahtarı iptal edilir ve cihaz en geç 15 dakika içinde (erişim anahtarının ömrü) oturumu kaybeder.
- **AC3:** Given işletme admini, When bir kullanıcıyı işletmeden çıkarır, Then o kullanıcının o işletmeye ait tüm oturumları anında geçersiz olur.

---

## EP-02 Kayıt ve işletme yönetimi

### US-005 — Perakendeci self-servis kaydı

**Persona:** P-08 · **Özellik:** F-05 · **Öncelik:** Must

Bir dükkan sahibi olarak web veya mobil uygulamadan kendim kaydolmak istiyorum; böylece toptancılar beni bulabilsin.

- **AC1:** Given kayıtlı olmayan bir telefon numarası, When kullanıcı OTP'yi doğrular ve ad soyad, işletme ünvanı, faaliyet alanı, şehir/rayon girer ve veri paylaşım metnini onaylar, Then bir işletme kaydı, `buyer` yeteneği (`approved`), bir varsayılan şube ve kullanıcı için işletme admini üyeliği oluşur.
- **AC2:** Given yeni kaydolmuş bir perakendeci, When ana sayfasını açar, Then hiçbir toptancı ve ürün görünmez ve "Profilinizi tamamlayın" kartı profil doluluk yüzdesiyle gösterilir.
- **AC3:** Given kayıt formu, When zorunlu alanlardan biri boşsa, Then kayıt tamamlanmaz ve alan işaretlenir.
- **AC4:** Given zaten bir işletmede üyeliği olan bir telefon numarası, When yeni perakendeci kaydı başlatılır, Then kullanıcıya mevcut üyeliği gösterilir ve yeni bir işletme açmak isteyip istemediği sorulur.

### US-006 — VÖEN girişi, format ve tekillik kontrolü

**Persona:** P-08 · **Özellik:** F-05 · **Öncelik:** Must

Bir perakendeci olarak VÖEN'imi girmek istiyorum; böylece sipariş verebilirim.

- **AC1:** Given VÖEN alanı, When 10 haneli olmayan veya kontrol hanesi hatalı bir değer girilir, Then değer reddedilir ve "VÖEN geçersiz" mesajı gösterilir.
- **AC2:** Given geçerli formatta bir VÖEN, When kaydedilir, Then son haneye göre hukuki tip (1 = tüzel kişi, 2 = fərdi sahibkar) otomatik atanır ve hesap "doğrulama bekliyor" durumuna geçer.
- **AC3:** Given başka bir `buyer` işletmede kayıtlı bir VÖEN, When aynı VÖEN girilir, Then kayıt reddedilir ve "Bu VÖEN ile kayıtlı bir işletme var; yöneticisinden davet isteyin" mesajı gösterilir.
- **AC4:** Given VÖEN'i olmayan bir perakendeci, When sepeti onaya göndermeye çalışır, Then gönderim engellenir ve VÖEN giriş ekranına yönlendirilir.
- **AC5:** Given VÖEN'i girilmiş ama moderatörce doğrulanmamış bir perakendeci, When sipariş gönderir, Then sipariş gönderilebilir.

📌 VARSAYIM: Moderatör doğrulaması sipariş için ön koşul değildir; yalnızca "doğrulanmış" rozeti ve dizinde öncelik sağlar. Bu, pilotta perakendecinin ilk siparişini geciktirmemek içindir.

⚠️ AÇIK SORU: VÖEN kontrol hanesi algoritmasının resmi tanımı doğrulanmalıdır. Doğrulanana kadar format kontrolü yalnızca "10 rakam ve son hane 1 veya 2" olarak uygulanır.

### US-007 — Veri görünürlüğü ayarları

**Persona:** P-08 · **Özellik:** F-06 · **Öncelik:** Must

Bir perakendeci olarak bağlantı kurmadığım toptancıların hangi bilgilerimi göreceğini seçmek istiyorum; böylece kişisel bilgilerim istemsiz paylaşılmaz.

- **AC1:** Given yeni kayıt, When toptancı dizinde bu perakendeciyi görür, Then yalnızca ünvan, faaliyet alanı ve şehir/rayon görünür.
- **AC2:** Given gizlilik ayarları ekranı, When perakendeci logo, tam adres, işletme telefonu, VÖEN, yetkili adı, kişisel telefon veya e-posta alanından birini açar, Then o alan bağlantısız toptancılara da görünür olur.
- **AC3:** Given ünvan, faaliyet alanı ve şehir/rayon, When perakendeci bunları kapatmaya çalışır, Then bu seçenek sunulmaz (yalnızca "dizinde görünme" tamamen kapatılabilir).
- **AC4:** Given "dizinde görünme" kapalı, When toptancı dizinde filtreyle arar, Then perakendeci sonuçlarda görünmez; yalnızca tam telefon veya tam VÖEN eşleşmesiyle bulunur.
- **AC5:** Given aktif bağlantı, When bağlı toptancı perakendeci profilini açar, Then teslimat ve iletişim için gereken tüm alanlar görünür.
- **AC6:** Given herhangi bir toptancı, When perakendeci profilini veya API cevabını açar, Then perakendecinin diğer toptancılarla bağlantıları ve alım hacmi hiçbir durumda dönmez.

### US-008 — Toptancı başvuru formu

**Persona:** P-02 · **Özellik:** F-07 · **Öncelik:** Should

Bir toptancı olarak platforma katılmak için başvuru yapmak istiyorum; böylece admin benimle iletişime geçer.

- **AC1:** Given giriş ekranı, When ziyaretçi "Toptancı olmak istiyorum" formunu doldurur (ünvan, VÖEN, yetkili adı, telefon, şehir, kategori), Then başvuru `pending` durumunda kaydedilir ve platform admininin moderasyon kuyruğuna düşer.
- **AC2:** Given `onboarding_mode = manual`, When ziyaretçi kayıt ekranını açar, Then toptancı için kayıt seçeneği bulunmaz.
- **AC3:** Given aynı VÖEN ile açık bir başvuru, When ikinci başvuru gönderilir, Then reddedilir.

### US-009 — Admin eliyle toptancı açılışı

**Persona:** P-01 · **Özellik:** F-08 · **Öncelik:** Must

Bir platform admini olarak toptancı hesabı açmak istiyorum; böylece yalnızca doğrulanmış toptancılar perakendeci dizinine erişir.

- **AC1:** Given toptancı oluşturma ekranı, When admin ünvan, VÖEN, adres, yetkili telefonu, plan, hizmet bölgeleri, para birimi ve saat dilimini girer, Then işletme, `seller` yeteneği (`approved`) ve abonelik oluşur ve yetkili telefonuna aktivasyon SMS'i gider.
- **AC2:** Given aktivasyon linki, When yetkili linki açıp OTP ile giriş yapar, Then işletme admini üyeliği oluşur.
- **AC3:** Given aktivasyon linki, When 7 gün içinde kullanılmazsa, Then link geçersiz olur ve admin yeni link gönderebilir.
- **AC4:** Given aynı VÖEN ile `seller` yeteneği olan bir işletme, When admin ikinci toptancıyı açmaya çalışır, Then işlem reddedilir.

### US-010 — Şube yönetimi ve onay kuralı

**Persona:** P-08 · **Özellik:** F-09 · **Öncelik:** Must

Bir perakendeci admini olarak şubelerimi ve her şubenin sipariş onay kuralını tanımlamak istiyorum.

- **AC1:** Given şube ekranı, When admin ad, adres, harita konumu ve onay kuralı (`every_order` / `above_amount` / `none`) girer, Then şube oluşur.
- **AC2:** Given `above_amount` kuralı ve 500 AZN eşiği, When sepet toplamı 500 AZN'nin altındaysa, Then şube çalışanı sepeti doğrudan gönderebilir; eşiğin üstündeyse onaya düşer.
- **AC3:** Given yeni kayıt, When ilk şube oluşturulur, Then varsayılan onay kuralı `every_order` olur.
- **AC4:** Given açık siparişi olan bir şube, When silinmek istenir, Then silme reddedilir; şube yalnızca pasifleştirilebilir.

### US-011 — Depo yönetimi

**Persona:** P-02, P-05 · **Özellik:** F-09 · **Öncelik:** Must

Bir toptancı admini olarak depolarımı tanımlamak istiyorum; böylece stok depo bazında tutulur.

- **AC1:** Given depo ekranı, When admin depo adı ve adresini girer, Then depo oluşur; ilk depo varsayılan depo olur.
- **AC2:** Given planın depo limiti 1, When ikinci depo oluşturulmak istenir, Then işlem reddedilir ve plan yükseltme mesajı gösterilir.
- **AC3:** Given stok kaydı olan bir depo, When silinmek istenir, Then reddedilir; yalnızca pasifleştirilebilir.

---

## EP-03 Kullanıcı ve rol

### US-012 — Unvan kataloğu ve rol şablonları

**Persona:** P-01 · **Özellik:** F-10 · **Öncelik:** Must

Bir platform admini olarak unvanları ve varsayılan rol şablonlarını yönetmek istiyorum; böylece yeni bir unvan için kod değişikliği gerekmez.

- **AC1:** Given unvan ekranı, When admin 4 dilde ad, ait olduğu yetenek (`seller` / `buyer`) ve bir rol şablonu (izin listesi) girer, Then unvan işletmelerin kullanıcı davet ekranında seçilebilir olur.
- **AC2:** Given bir şablonun izinleri, When admin şablonu günceller, Then şablondan önceden kopyalanmış işletme rolleri değişmez ve o işletmelerin adminlerine "yeni şablon sürümü" bildirimi gider.
- **AC3:** Given kullanımda olan bir unvan, When silinmek istenir, Then reddedilir; yalnızca pasifleştirilebilir.

### US-013 — Kullanıcı daveti ve rol atama

**Persona:** P-02, P-08 · **Özellik:** F-10 · **Öncelik:** Must

Bir işletme admini olarak ekibimi davet etmek ve rollerini atamak istiyorum.

- **AC1:** Given ekip ekranı, When admin telefon numarası, unvan ve (gerekiyorsa) şube veya depo kapsamı girer, Then davet SMS'i gider; davet edilen kişi OTP ile girince üyelik aktif olur.
- **AC2:** Given planın kullanıcı limiti, When limit doluysa, Then yeni davet reddedilir.
- **AC3:** Given işletmenin tek admini, When kendi admin rolünü kaldırmaya veya kendini silmeye çalışır, Then işlem reddedilir.
- **AC4:** Given bir rol değişikliği, When kaydedilir, Then audit loga kim, kime, eski rol ve yeni rol yazılır ve değişiklik kullanıcının bir sonraki API isteğinde geçerli olur.
- **AC5:** Given bir kullanıcının izni olmayan bir ekran, When kullanıcı menüye bakar, Then ekran menüde görünmez; When doğrudan API çağrısı yapar, Then 403 döner.

### US-014 — İşletmeye özel rol

**Persona:** P-02, P-08 · **Özellik:** F-11 · **Öncelik:** Should

Bir işletme admini olarak bir rol şablonunu kopyalayıp izinlerini değiştirmek istiyorum.

- **AC1:** Given rol ekranı, When admin bir şablonu kopyalar ve izin açıp kapatır, Then yeni rol yalnızca o işletmede kullanılabilir.
- **AC2:** Given `seller` yeteneğine ait bir izin, When `buyer` işletmesinin rolüne eklenmek istenir, Then seçenek sunulmaz.

---

## EP-04 Platform yönetimi

### US-015 — Perakendeci moderasyonu

**Persona:** P-01 · **Özellik:** F-12 · **Öncelik:** Must

Bir platform admini olarak VÖEN'i girilmiş perakendecileri doğrulamak istiyorum; böylece sahte hesapları ayıklarım.

- **AC1:** Given moderasyon kuyruğu, When admin bir kaydı açar, Then ünvan, VÖEN, hukuki tip ve e-taxes.gov.az sorgusuna giden bir bağlantı görünür.
- **AC2:** Given inceleme, When admin "Doğrula" der, Then işletme `verified_at` alır ve dizinde "doğrulanmış" rozetiyle üstte listelenir; When "Reddet" der, Then perakendeciye nedeniyle birlikte bildirim gider ve VÖEN alanı temizlenir.

### US-016 — Perakendeci askıya alma, arşivleme, birleştirme

**Persona:** P-01 · **Özellik:** F-13, F-14 · **Öncelik:** Must (birleştirme: Should)

Bir platform admini olarak sorunlu perakendeci hesaplarını sınırlı şekilde yönetmek istiyorum.

- **AC1:** Given bir perakendeci, When admin askıya alır, Then işletmenin kullanıcıları giriş yapamaz, dizinde görünmez ve açık siparişleri değişmeden kalır.
- **AC2:** Given sipariş veya cari geçmişi olan bir perakendeci, When admin "sil" der, Then işletme arşivlenir; kişisel veriler (`person_data`) anonimleştirilir; sipariş, belge ve cari kayıtları korunur.
- **AC3:** Given geçmişi olmayan bir perakendeci, When admin "sil" der, Then kayıt ve kişisel veriler silinir.
- **AC4:** Given iki mükerrer perakendeci, When admin birleştirme yapar, Then bağlantılar, siparişler ve cari kayıtları hedef işletmeye taşınır, kaynak işletme arşivlenir ve işlem audit loga yazılır.
- **AC5:** Given platform admini, When perakendecinin fiyatını, siparişini veya cari kaydını değiştirmeye çalışır, Then işlem reddedilir.

### US-017 — Sistem ayarları

**Persona:** P-01 · **Özellik:** F-15 · **Öncelik:** Must

Bir platform admini olarak süreleri, kotaları ve politikaları kod değiştirmeden yönetmek istiyorum.

- **AC1:** Given ayarlar ekranı, When admin bir ayarı değiştirir, Then değer platform, plan veya işletme kapsamında kaydedilir ve en özel kapsam geçerli olur (işletme → plan → platform).
- **AC2:** Given ayar değişikliği, When kaydedilir, Then audit loga eski ve yeni değer yazılır.
- **AC3:** Given bekleme süresi ayarı, When 7 günden küçük bir değer girilir, Then reddedilir.

Varsayılan değerler (alt ve üst sınır dahil; ADR-0009 §4, kayıt `packages/shared/src/settings.ts`). Sınır dışı veya yanlış tipte değer `SETTING_OUT_OF_RANGE` ile reddedilir.

| Anahtar | Varsayılan | Tip | Alt sınır | Üst sınır |
| --- | --- | --- | --- | --- |
| `connection.request_ttl_days` | 14 | tamsayı | 1 | 90 |
| `connection.cooldown_after_reject_days` | 30 | tamsayı | 7 | 365 |
| `connection.cooldown_after_buyer_cancel_days` | 30 | tamsayı | 7 | 365 |
| `connection.daily_request_quota` | 20 | tamsayı | 1 | 1000 |
| `connection.block_rate_alert_pct` | 10 | tamsayı | 1 | 100 |
| `delivery.auto_confirm_hours` | 48 | tamsayı | 1 | 720 |
| `delivery.location_mismatch_meters` | 300 | tamsayı | 10 | 10000 |
| `dormant.reminder_days` | 7, 30 | tamsayı listesi (artan, 1–5 eleman) | 1 | 3650 |
| `dormant.warning_day` | 90 | tamsayı | 1 | 3650 |
| `dormant.deactivate_day` | 120 | tamsayı | 1 | 3650 |
| `dormant.delete_day` | 180 | tamsayı | 1 | 3650 |
| `invitation.seller_activation_days` | 7 | tamsayı (gün; toptancı aktivasyon davetinin geçerliliği, US-009 AC3) | 1 | 30 |
| `invitation.team_days` | 7 | tamsayı (gün; ekip davetinin geçerliliği, US-013 AC1, F2.7) | 1 | 30 |
| `onboarding.seller_mode` | `manual` | seçenek: `manual` | — | — |
| `seller_application.ip_max_per_hour` | 5 (IP başına saatte toptancı başvurusu; kimliksiz form, US-008, F2.2) | tamsayı | 1 | 100 |
| `buyer_registration.ip_max_per_hour` | 10 (IP başına saatte perakendeci kayıt isteği; kimliksiz uç, US-005, F2.3a) | tamsayı | 1 | 100 |
| `onboarding.buyer_plan_code` | `buyer_free` (kendi kaydolan perakendeciye atanan plan, R14, F2.3a) | seçenek: `buyer_free` | — | — |
| `legal.data_sharing_version` | `v1` (kayıtta onaylanan veri paylaşım metni sürümü, NFR-63, F2.3a) | seçenek: `v1` | — | — |
| `sms.daily_cap` | 500 | tamsayı | 0 | 100000 |
| `sms.allowed_country_codes` | `["+994"]` | ülke kodu listesi (`+` ve 1–4 rakam, 1–20 eleman) | — | — |
| `otp.code_ttl_minutes` | 5 (NFR-45) | tamsayı | 1 | 30 |
| `otp.resend_interval_seconds` | 60 (aynı numaraya iki kod arası, NFR-45) | tamsayı | 10 | 600 |
| `otp.max_per_hour` | 5 (numara başına saatte kod, NFR-45) | tamsayı | 1 | 50 |
| `otp.max_attempts` | 5 (kod başına yanlış deneme; aşılınca kilit, NFR-45) | tamsayı | 1 | 20 |
| `otp.lock_minutes` | 15 (US-001 AC4) | tamsayı | 1 | 1440 |
| `otp.ip_max_per_hour` | 20 (IP başına saatte kod isteği, NFR-45) | tamsayı | 1 | 1000 |
| `otp.fail_window_minutes` | 60 (numara başına yanlış kod sayacının penceresi; pencerede `otp.max_attempts` yanlış → kilit, F1.5b) | tamsayı | 5 | 1440 |
| `auth.access_token_minutes` | 15 (erişim anahtarı ömrü, NFR-44) | tamsayı | 5 | 60 |
| `auth.refresh_token_days` | 30 (yenileme anahtarı ömrü, NFR-44) | tamsayı | 1 | 90 |
| `access.permission_cache_seconds` | 60 (üyelik başına izin önbelleği ömrü; rol değişikliğinde silinir, F1.8b) | tamsayı | 1 | 3600 |
| `security.require_admin_2fa` | `false` (işletme ayarı: `true` ise işletme admini TOTP kurmadan işletme bağlamlı uçları kullanamaz, US-002 AC3, F1.8b) | evet/hayır | — | — |
| `mobile.min_version.ios`, `mobile.min_version.android` | `0.0.0` (ilk yayında ilk yayın sürümü yazılır, US-060) | sürüm metni (`X.Y.Z`) | — | — |
| `mobile.recommended_version.ios`, `mobile.recommended_version.android` | `0.0.0` (bu sürümün altındaki uygulamaya kapatılabilir güncelleme önerisi, US-060 AC2, F1.14b) | sürüm metni (`X.Y.Z`) | — | — |
| `mobile.store_url.ios`, `mobile.store_url.android` | boş (mağaza veya test dağıtım bağlantısı; boşken "Güncelle" düğmesi gösterilmez, adres F6'da yazılır, US-060 AC1, F1.14b) | boş veya `https://` adresi | — | — |
| `system.maintenance` | `false` (RB-08, RB-13) | evet/hayır | — | — |
| `idempotency.ttl_hours` | 24 | tamsayı | 1 | 168 |
| `idempotency.lock_seconds` | 60 | tamsayı | 5 | 600 |
| `outbox.max_attempts` | 10 ([integrations.md](../03-architecture/integrations.md) §8) | tamsayı | 1 | 100 |
| `outbox.poll_interval_ms` | 1000 | tamsayı | 100 | 60000 |
| `outbox.batch_size` | 100 | tamsayı | 1 | 1000 |
| `push.retry_delays_minutes` | 1, 5, 15 (geçici push hatasında yeniden deneme beklemeleri; eleman sayısı = deneme sayısı, US-054 AC3, F1.11) | tamsayı listesi (artan, 1–5 eleman) | 1 | 1440 |
| `push.receipt_check_minutes` | 15 (gönderimden sonra makbuz kontrolü, integrations §3, F1.11) | tamsayı | 1 | 1440 |
| `push.batch_size` | 100 (Expo isteği başına mesaj; Expo üst sınırı 100, F1.11) | tamsayı | 1 | 100 |
| `files.upload_url_ttl_minutes` | 10 (imzalı yükleme URL'sinin ömrü, SF-09, F1.10) | tamsayı | 1 | 60 |
| `files.download_url_ttl_minutes` | 5 (`private` dosya için imzalı okuma URL'sinin ömrü, SF-09, F1.10) | tamsayı | 1 | 60 |
| `files.image_max_mb` | 5 (JPEG/PNG/WebP üst sınırı, NFR-49, F1.10) | tamsayı | 1 | 20 |
| `files.xlsx_max_mb` | 10 (.xlsx üst sınırı, NFR-49, F1.10) | tamsayı | 1 | 50 |
| `settings.cache_ttl_seconds` | 60 | tamsayı | 1 | 3600 |
| `i18n.cache_ttl_seconds` | 60 (çeviri ve dil önbelleğinin süreç içi ömrü, F1.3) | tamsayı | 1 | 300 |
| `feature.*` | Özellik bayrakları; bkz. [environments-cicd.md](../06-operations/environments-cicd.md) §6 | evet/hayır | — | — |

Çapraz kural (aynı kapsamdaki geçerli değerlerle): `dormant.reminder_days` elemanlarının hepsi < `dormant.warning_day` < `dormant.deactivate_day` < `dormant.delete_day`. İhlal `SETTING_OUT_OF_RANGE`.

### US-018 — Loglu kullanıcı taklidi

**Persona:** P-01 · **Özellik:** F-16 · **Öncelik:** Could

Bir platform destek kullanıcısı olarak bir kullanıcının ekranını onun gözünden görmek istiyorum; böylece sorununu çözebilirim.

- **AC1:** Given destek rolü, When gerekçe yazarak taklit başlatılır, Then 30 dakikalık salt-okunur bir oturum açılır ve ekranın üstünde "Destek görünümü" şeridi görünür.
- **AC2:** Given taklit oturumu, When herhangi bir yazma işlemi denenir, Then 403 döner.
- **AC3:** Given taklit, When başlar ve biter, Then audit loga destek kullanıcısı, hedef kullanıcı, gerekçe ve süre yazılır.

---

## EP-05 Bağlantı ağı

### US-019 — Perakendeci dizini ve arama

**Persona:** P-03, P-04 · **Özellik:** F-17 · **Öncelik:** Must

Bir toptancı satış ekibi üyesi olarak bölgemdeki perakendecileri bulmak istiyorum.

- **AC1:** Given dizin ekranı, When kullanıcı şehir/rayon, faaliyet alanı, doğrulanmış hesap ve bağlantı geçmişi (hiç bağlanmamış / reddetmiş / iptal etmiş / bekleme süresi dolmuş) filtrelerini uygular, Then sonuçlar sayfa başı en fazla 20 kayıt olarak listelenir.
- **AC2:** Given varsayılan arama, When filtre verilmez, Then yalnızca toptancının hizmet bölgelerindeki perakendeciler listelenir.
- **AC3:** Given satış temsilcisi rolü, When dizin açılır, Then yalnızca temsilcinin atandığı bölgeler listelenir.
- **AC4:** Given dizin, When kullanıcı dışa aktarma arar, Then dizin için dışa aktarma seçeneği bulunmaz.
- **AC5:** Given bir kullanıcı, When 1 dakikada 60'tan fazla dizin araması yapar, Then istekler 429 ile reddedilir.
- **AC6:** Given askıya alınmış veya pasif perakendeciler, When arama yapılır, Then sonuçlarda görünmezler.

### US-020 — Tam telefon veya VÖEN ile bulma

**Persona:** P-04 · **Özellik:** F-17 · **Öncelik:** Must

Bir satış temsilcisi olarak sahada yeni kaydolan bir perakendeciyi telefon numarası veya VÖEN ile anında bulmak istiyorum.

- **AC1:** Given +994 ile başlayan tam bir telefon numarası veya 10 haneli VÖEN, When arama yapılır, Then eşleşen perakendeci (dizinde görünme kapalı olsa bile) yalnızca açık alanlarıyla döner.
- **AC2:** Given kısmi bir numara veya VÖEN, When arama yapılır, Then bu alanlarda eşleşme yapılmaz.

### US-021 — Bağlantı isteği gönderme

**Persona:** P-03, P-04 · **Özellik:** F-18 · **Öncelik:** Must

Bir toptancı satış ekibi üyesi olarak bir perakendeciye bağlantı isteği göndermek istiyorum.

- **AC1:** Given istek gönderilebilir bir perakendeci, When kullanıcı isteğe bağlı bir mesaj ve önerilen vade ile isteği gönderir, Then `pending` durumunda bir istek oluşur, `expires_at` = şimdi + 14 gün olur, perakendecinin adminlerine push bildirimi gider ve istek günlük kotadan düşer.
- **AC2:** Given aynı çift için `pending` bir istek, When ikinci istek gönderilir, Then reddedilir (`CONNECTION_REQUEST_ALREADY_PENDING`).
- **AC3:** Given aynı çift için aktif bir bağlantı, When istek gönderilir, Then reddedilir (`CONNECTION_ALREADY_ACTIVE`).
- **AC4:** Given perakendecinin bu toptancıyı engellemiş olması, When istek gönderilir, Then reddedilir (`CONNECTION_BLOCKED`) ve arayüzde "Bu işletme istek kabul etmiyor" yazar.
- **AC5:** Given son 30 gün içinde reddedilmiş bir istek veya perakendecinin iptal ettiği bir bağlantı, When istek gönderilir, Then reddedilir (`CONNECTION_COOLDOWN_ACTIVE`) ve bekleme süresinin bitiş tarihi gösterilir.
- **AC6:** Given toptancının bugünkü istek sayısı kotaya ulaşmışsa, When istek gönderilir, Then reddedilir (`429 CONNECTION_DAILY_QUOTA_EXCEEDED`, `retryAfter` = toptancının gece yarısına kalan saniye; `Retry-After` başlığı). Gün, toptancının saat dilimine göre hesaplanır.
- **AC7:** Given toptancının bir iptalinden sonra, When aynı perakendeciye yeni istek gönderilir, Then bekleme süresi uygulanmaz.

📌 VARSAYIM: Toptancının kendi iptalinden sonra bekleme süresi yoktur; bekleme süresi yalnızca perakendecinin reddi ve perakendecinin iptalinden sonra uygulanır (rapor, bağlantı kuralları tablosu).

### US-022 — Bekleyen isteği geri çekme

**Persona:** P-03, P-04 · **Özellik:** F-18 · **Öncelik:** Should

- **AC1:** Given `pending` bir istek, When isteği gönderen toptancı geri çeker, Then istek `withdrawn` olur ve perakendecinin bekleyen istekler listesinden kalkar.
- **AC2:** Given geri çekilmiş istek, When toptancı yeni istek gönderir, Then bekleme süresi uygulanmaz, ama günlük kota yeniden düşer.

### US-023 — Perakendecinin isteğe yanıtı

**Persona:** P-08 · **Özellik:** F-18 · **Öncelik:** Must

Bir perakendeci admini olarak gelen istekleri kabul etmek, reddetmek veya göndereni engellemek istiyorum.

- **AC1:** Given `pending` bir istek, When perakendeci isteği açar, Then yalnızca toptancının profil özeti (ünvan, logo, kategoriler, tanıtım metni, mesaj, önerilen koşullar) görünür; ürün ve fiyat görünmez.
- **AC2:** Given istek, When perakendeci "Kabul" der, Then `active` bir bağlantı oluşur, istek `accepted` olur ve kabul ekranında "Bu toptancı teslimat ve iletişim bilgilerinizi görecek" uyarısı onaylanmış olur.
- **AC3:** Given istek, When "Reddet" denir, Then istek `rejected` olur ve toptancının profil özeti perakendecinin ekranlarından kalkar.
- **AC4:** Given istek veya aktif bağlantı, When "Engelle" denir, Then `blocks` kaydı oluşur; varsa bekleyen istek `rejected`, aktif bağlantı `cancelled` olur.
- **AC5:** Given engellenmiş bir toptancı, When perakendeci "Engellenenler" ekranından engeli kaldırır, Then toptancı yeniden istek gönderebilir (bekleme süresi kurallarına bağlı olarak).
- **AC6:** Given satın alma sorumlusu rolü, When istek ekranını açar, Then istekleri görür ama kabul/red/engel düğmeleri görünmez.

### US-024 — Bağlantı koşulları

**Persona:** P-02, P-03 · **Özellik:** F-19 · **Öncelik:** Must

Bir toptancı admini veya satış müdürü olarak aktif bağlantıya fiyat listesi, kredi limiti, vade ve sorumlu temsilci atamak istiyorum.

- **AC1:** Given yeni kabul edilmiş bir bağlantı, When koşul atanmamışsa, Then toptancının varsayılan fiyat listesi geçerli olur ve bağlantı "koşul atanmadı" uyarısıyla listelenir.
- **AC2:** Given koşul ekranı, When fiyat listesi, kredi limiti (AZN), ödeme vadesi (gün) ve temsilci kaydedilir, Then perakendecinin gördüğü fiyatlar bir sonraki ürün listesi isteğinde güncellenir.
- **AC3:** Given daha önce iptal edilmiş ve yeniden kurulmuş bir bağlantı, When koşul ekranı açılır, Then önceki dönemin koşulları öneri olarak doldurulur.

📌 VARSAYIM: MVP'de kredi limiti yalnızca bilgi amaçlıdır; sepet ekranında uyarı gösterir ama siparişi engellemez. Engelleme Faz 2'dedir (rapor: "kredi limiti blokajı" Faz 2).

### US-025 — Bağlantı iptali

**Persona:** P-02, P-08 · **Özellik:** F-20 · **Öncelik:** Must

- **AC1:** Given aktif bağlantı, When yetkili bir kullanıcı neden seçip ikinci onayı verir, Then bağlantı `cancelled` olur; `ended_by_side`, `end_reason` ve `ended_at` kaydedilir.
- **AC2:** Given iptal, When perakendeci ürün listesini açar, Then o toptancının ürünleri görünmez; sepetteki o toptancıya ait kalemler kaldırılır ve kullanıcıya bildirim gösterilir.
- **AC3:** Given iptal anında `submitted` (toptancı onayı bekleyen) siparişler, When iptal gerçekleşir, Then bu siparişler `cancelled` olur.
- **AC4:** Given iptal anında `approved` veya sonraki durumdaki siparişler, When iptal gerçekleşir, Then bu siparişlerin teslimat ve cari süreci normal devam eder.
- **AC5:** Given iptal edilmiş bağlantı, When iki taraf cari ekranını açar, Then cari kayıtlar salt-okunur görünür ve tahsilat girilmeye devam edebilir.
- **AC6:** Given iptal edilmiş bağlantı, When perakendeci arayüze bakar, Then "yeniden bağlan" seçeneği yoktur.

### US-026 — İstek süre dolumu

**Persona:** sistem · **Özellik:** F-20 · **Öncelik:** Must

- **AC1:** Given `expires_at` geçmiş `pending` bir istek, When zamanlanmış iş çalışır (her 15 dakikada), Then istek `expired` olur ve toptancıya bildirim gider.
- **AC2:** Given `expired` istek, When toptancı yeni istek gönderir, Then bekleme süresi uygulanmaz.

### US-027 — Bağlantısız hesap politikası

**Persona:** sistem, P-01 · **Özellik:** F-21 · **Öncelik:** Should

- **AC1:** Given hiç bağlantı kurmamış bir perakendeci, When kayıttan sonra 7. ve 30. gün dolar, Then profil tamamlama hatırlatması (push) gider ve hizmet bölgesi eşleşen toptancılara "yeni perakendeci" bildirimi gider.
- **AC2:** Given 90. gün, When dolar, Then "Hesabınız 30 gün sonra pasifleşecek" bildirimi gider.
- **AC3:** Given 120. gün, When dolar, Then hesap `dormant` olur ve dizinden çıkar; kullanıcı giriş yaparsa hesap anında `active` olur ve sayaç sıfırlanır.
- **AC4:** Given 180. gün ve son bildirimin gönderilmiş olması, When dolar, Then kişisel veriler silinir veya anonimleştirilir ve işletme arşivlenir.
- **AC5:** Given en az bir bağlantı, sipariş veya cari kaydı olan bir hesap, When süreler dolar, Then bu politika uygulanmaz.

---

## EP-06 Katalog

### US-028 — Birim kataloğu

**Persona:** P-01 · **Özellik:** F-22 · **Öncelik:** Must

- **AC1:** Given birim ekranı, When admin UN/ECE Rec 20 kodu, tür (sayı, ağırlık, hacim, uzunluk, alan, ambalaj), 4 dilde ad, kısaltma ve ondalık izni girer, Then birim toptancıların ürün formunda seçilebilir olur.
- **AC2:** Given aynı türdeki iki birim, When admin dönüşüm oranı girer (1 KGM = 1000 GRM), Then oran kaydedilir.
- **AC3:** Given kullanımda olan bir birim, When silinmek istenir, Then reddedilir; yalnızca pasifleştirilir.
- **AC4:** Given toptancı kullanıcısı, When yeni birim oluşturmaya çalışır, Then seçenek yoktur.

Başlangıç verisi: H87, C62, GRM, KGM, TNE, MLT, LTR, MTQ, CMT, MTR, MTK, XPK, XBX, XCT, XBO, XCA, XBG, XSA, XPX.

### US-029 — Kategori, marka ve faaliyet alanı

**Persona:** P-01 · **Özellik:** F-22 · **Öncelik:** Must

- **AC1:** Given katalog ekranı, When admin 4 dilde ad ve (kategori için) üst kategori girer, Then kayıt oluşur.
- **AC2:** Given toptancı, When ürün formunda olmayan bir marka gerekir, Then "marka talebi" gönderebilir; talep admin onayına düşer.

📌 VARSAYIM: Kategori ağacı en fazla 3 seviyedir.

### US-030 — Ürün oluşturma

**Persona:** P-02, P-05 · **Özellik:** F-23 · **Öncelik:** Must

- **AC1:** Given ürün formu, When kullanıcı en az bir dilde ad, kategori, marka, temel birim ve en az bir varyant girer, Then ürün `draft` durumunda oluşur.
- **AC2:** Given bir varyant, When ambalaj seviyeleri (ör. adet → koli 24 → palet 60 koli), her seviyenin GTIN'i ve satış birimi, minimum sipariş ve sipariş katı girilir, Then perakendeci yalnızca satış biriminde ve katlarında sipariş verebilir.
- **AC3:** Given ürün görseli, When JPEG/PNG/WebP formatında ve en fazla 5 MB yüklenir, Then görsel R2'ye kaydedilir ve 3 boyutta (thumb 200 px, orta 800 px, büyük 1600 px) sunulur.
- **AC4:** Given eksik dil çevirisi, When perakendeci başka bir dilde bakar, Then ürünün dolu olan ilk dili gösterilir (öncelik: kullanıcı dili → işletme dili → az).
- **AC5:** Given "son kullanma tarihli ürün" işareti, When açılır, Then raf ömrü (ay) alanı zorunlu olur.
- **AC6:** Given `draft` ürün, When "Yayınla" denir, Then ürün `active` olur ve bağlı perakendecilere görünür.

📌 VARSAYIM: Ürün başına en fazla 8 görsel.

### US-031 — Excel ile ürün içe aktarma

**Persona:** P-02 · **Özellik:** F-24 · **Öncelik:** Must

Bir toptancı admini olarak mevcut Excel listemi içe aktarmak istiyorum; böylece ürünleri tek tek girmem gerekmez.

- **AC1:** Given içe aktarma ekranı, When kullanıcı şablonu indirir, Then sütunlar (SKU, barkod, ad_az, ad_ru, ad_tr, kategori, marka, birim, koli içi adet, fiyat, stok) ve açıklama sayfası içeren bir .xlsx gelir.
- **AC2:** Given doldurulmuş şablon (en fazla 5.000 satır), When yüklenir, Then işlem arka planda çalışır ve önizleme gösterilir: eklenecek, güncellenecek, hatalı satır sayısı ve her hatalı satırın nedeni.
- **AC3:** Given önizleme, When kullanıcı onaylar, Then yalnızca hatasız satırlar uygulanır ve sonuç raporu indirilebilir.
- **AC4:** Given aynı SKU'lu mevcut ürün, When içe aktarılır, Then ürün güncellenir (yeni ürün oluşturulmaz).
- **AC5:** Given 5.000 satırlık dosya, When onaylanır, Then işlem 2 dakika içinde tamamlanır.

### US-032 — Perakendeci ürün listesi ve filtreler

**Persona:** P-08, P-10 · **Özellik:** F-25 · **Öncelik:** Must

- **AC1:** Given aktif bağlantıları olan bir perakendeci, When ürün listesini açar, Then yalnızca aktif bağlantılı toptancıların `active` ürünleri, perakendeciye uygulanacak fiyatla listelenir.
- **AC2:** Given liste, When toptancı, kategori, marka, fiyat aralığı, stokta olanlar, yeni eklenenler, daha önce aldıklarım, favorilerim filtreleri uygulanır, Then sonuçlar filtreye göre daralır.
- **AC3:** Given arama kutusu, When kullanıcı az, ru veya tr dilinde ya da Latin/Kiril harfle yazar ("шампунь" / "şampun"), Then aynı ürün bulunur.
- **AC4:** Given ürün görünürlük kuralı "yalnızca belirli fiyat listesi", When kural dışındaki bir perakendeci listeye bakar, Then ürün görünmez.

### US-033 — Kamerayla barkod arama

**Persona:** P-08, P-10, P-05 · **Özellik:** F-26 · **Öncelik:** Should

- **AC1:** Given mobil ürün ekranı, When kullanıcı barkod tarar, Then GTIN'i eşleşen ürünler (bağlı toptancılarda) listelenir; eşleşme yoksa "Ürün bulunamadı" gösterilir.

---

## EP-07 Fiyat

### US-034 — Fiyat listeleri ve fiyat önceliği

**Persona:** P-02, P-03 · **Özellik:** F-27 · **Öncelik:** Must

- **AC1:** Given fiyat listesi ekranı, When kullanıcı ad, para birimi, KDV dahil/hariç ve geçerlilik başlangıcı girer, Then liste oluşur; toptancının ilk listesi varsayılan liste olur.
- **AC2:** Given bir varyant ve bir perakendeci, When fiyat hesaplanır, Then sırasıyla şube fiyatı (açıksa), müşteri fiyatı, bağlantıya atanmış liste fiyatı, varsayılan liste fiyatı aranır ve ilk bulunan kullanılır.
- **AC3:** Given hesaplanan fiyat, When üzerine şube indirimi ve kademeli fiyat varsa, Then önce kademeli fiyat, sonra şube indirimi uygulanır.
- **AC4:** Given hiçbir listede fiyatı olmayan bir varyant, When perakendeci listeye bakar, Then varyant "fiyat yok" olarak görünür ve sepete eklenemez.
- **AC5:** Given fiyat düzenleme ekranı, When fiyata bakılır, Then fiyatın kaynağı (hangi kural) gösterilir.
- **AC6:** Given geleceğe tarihli bir fiyat değişikliği, When geçerlilik tarihi gelir, Then yeni fiyat o tarihte, toptancının saat diliminde 00:00'da geçerli olur.

### US-035 — Müşteriye özel fiyat

**Persona:** P-02, P-03 · **Özellik:** F-27 · **Öncelik:** Must

- **AC1:** Given aktif bağlantılı bir perakendeci, When kullanıcı bir varyant için müşteriye özel fiyat girer, Then bu perakendecide liste fiyatının yerine geçer.
- **AC2:** Given müşteriye özel fiyatlar, When Excel ile toplu yüklenir, Then US-031 ile aynı önizleme ve fark raporu uygulanır.

### US-036 — Şube fiyatı ve şube indirimi

**Persona:** P-02 · **Özellik:** F-28 · **Öncelik:** Should

- **AC1:** Given bir perakendeci, When toptancı "şube fiyatı"nı açar, Then o perakendecinin şubeleri için varyant bazında fiyat girilebilir.
- **AC2:** Given bir şube, When toptancı yüzde indirim kuralı girer (tüm ürünler, bir marka veya bir kategori için), Then indirim o şubenin siparişlerinde sipariş satırında "şube indirimi" olarak ayrı gösterilir.

### US-037 — Kademeli fiyat

**Persona:** P-02 · **Özellik:** F-29 · **Öncelik:** Should

- **AC1:** Given bir varyant, When kademe (ör. 10 koli ve üstü −%3) tanımlanır, Then sepette miktar kademeye ulaştığında fiyat otomatik güncellenir ve kullanıcıya gösterilir.

---

## EP-08 Stok

### US-038 — Stok modu ve var/yok takibi

**Persona:** P-02, P-05 · **Özellik:** F-31 · **Öncelik:** Must

- **AC1:** Given toptancı ayarları, When stok modu `none` seçilir, Then tüm aktif ürünler sipariş edilebilir.
- **AC2:** Given `availability` modu, When kullanıcı bir varyantı "stokta yok" olarak işaretler, Then perakendeci ekranında "Stokta yok" etiketi görünür ve varyant sepete eklenemez.

### US-039 — Miktarlı stok, rezervasyon ve hareketler

**Persona:** P-05 · **Özellik:** F-32 · **Öncelik:** Must

- **AC1:** Given `quantity` modu, When depo kullanıcısı mal girişi yapar, Then `stock.on_hand` artar ve bir `stock_movements` kaydı (`receipt`) oluşur.
- **AC2:** Given toptancı siparişi onaylar, When onay kaydedilir, Then her satır için `stock.reserved` artar; satılabilir stok (`on_hand − reserved`) yetersizse onay reddedilir ve kullanıcı miktarı düşürmeye yönlendirilir.
- **AC3:** Given sipariş sevk edilir, When durum `shipped` olur, Then `on_hand` ve `reserved` aynı miktarda azalır.
- **AC4:** Given sevk öncesi iptal, When sipariş iptal olur, Then `reserved` geri bırakılır.
- **AC5:** Given iki kullanıcı aynı anda son stoğu onaylar, When işlemler aynı anda gelir, Then yalnızca biri başarılı olur.
- **AC6:** Given perakendeci ürün listesi, When stok miktarı ≤ 5 satış birimi ise, Then "Son X koli" gösterilir; aksi halde yalnızca "Stokta" gösterilir.
- **AC7:** Given stok satırı, When `on_hand` doğrudan değiştirilmek istenir, Then yalnızca bir sayım düzeltmesi hareketiyle değiştirilebilir.

📌 VARSAYIM: "Son X" eşiği 5 satış birimidir ve toptancı ayarıyla değiştirilebilir.

---

## EP-09 Sepet ve sipariş

### US-040 — Ortak sepet

**Persona:** P-08, P-10 · **Özellik:** F-34 · **Öncelik:** Must

- **AC1:** Given bir şube, When şubenin kullanıcıları ürün ekler, Then tüm kullanıcılar aynı şube sepetini görür; her kalemde ekleyen kişi gösterilir.
- **AC2:** Given sepet, When açılır, Then kalemler toptancıya göre gruplanır; her grupta ara toplam, minimum sipariş tutarı uyarısı ve (tanımlıysa) kredi limiti uyarısı görünür.
- **AC3:** Given satış birimi ve sipariş katı, When kullanıcı izin verilmeyen bir miktar girer, Then miktar en yakın geçerli kata yuvarlanır ve kullanıcıya gösterilir.
- **AC4:** Given sepet, When ürün fiyatı değişir, Then sepet her açılışta güncel fiyatla yeniden hesaplanır ve değişen kalemler işaretlenir.

### US-041 — Şube onayı

**Persona:** P-09 · **Özellik:** F-34 · **Öncelik:** Must

- **AC1:** Given onay gerektiren sepet, When kullanıcı "Onaya gönder" der, Then sepet `pending_approval` olur, düzenlemeye kapanır ve şube adminlerine push bildirimi gider.
- **AC2:** Given onay bekleyen sepet, When şube admini miktarları düzeltip "Onayla ve gönder" der, Then sepet K8'e göre bölünür (US-042).
- **AC3:** Given onay bekleyen sepet, When şube admini "Geri gönder" der ve not yazar, Then sepet `open` olur ve gönderen kullanıcıya bildirim gider.
- **AC4:** Given onay kuralı `none` veya tutar eşiğin altında, When kullanıcı gönderir, Then onay adımı atlanır.

### US-042 — Sepetin toptancı başına bölünmesi

**Persona:** sistem · **Özellik:** F-34 · **Öncelik:** Must

- **AC1:** Given 3 toptancıdan kalem içeren onaylı bir sepet, When gönderilir, Then 3 ayrı sipariş oluşur; her birinin kendi numarası, `seller_id`, `buyer_id`, `branch_id`, para birimi ve durum geçmişi olur.
- **AC2:** Given sipariş oluşumu, When kalemler kopyalanır, Then her satıra ürün adı (sipariş dilinde), birim, birim fiyat, uygulanan indirimler ve fiyat kaynağı o anki haliyle yazılır.
- **AC3:** Given gönderim anında bağlantısı aktif olmayan bir toptancının kalemi, When gönderilir, Then o grup sipariş oluşturmaz ve kullanıcıya bildirilir; diğer gruplar normal oluşur.
- **AC4:** Given minimum sipariş tutarının altındaki bir grup, When gönderilir, Then o grup gönderilmez ve sepette kalır.
- **AC5:** Given bölünme işlemi, When herhangi bir adımda hata olursa, Then hiçbir sipariş oluşmaz (tek veritabanı işlemi) ve sepet değişmeden kalır.

### US-043 — Toptancı sipariş onayı, düzenleme, kısmi onay, red

**Persona:** P-02, P-03 · **Özellik:** F-35 · **Öncelik:** Must

- **AC1:** Given `submitted` sipariş, When toptancı onaylar, Then sipariş `approved` olur, stok rezerve edilir (stok moduna göre) ve perakendeciye bildirim gider.
- **AC2:** Given sipariş, When toptancı bir satırın miktarını düşürür veya satırı çıkarır, Then değişiklik satır bazında "önceki / yeni" olarak kaydedilir, sipariş `approved` olur ve perakendeciye değişiklik özeti bildirilir.
- **AC3:** Given sipariş, When toptancı neden seçerek reddeder, Then sipariş `rejected` olur ve perakendeciye bildirilir.
- **AC4:** Given sipariş, When toptancı satır miktarını artırmaya veya yeni satır eklemeye çalışır, Then işlem reddedilir.
- **AC5:** Given `approved` sipariş, When depo "Hazırlanıyor" der, Then durum `preparing` olur.

📌 VARSAYIM: Toptancı satır miktarını artıramaz ve fiyatı değiştiremez; yalnızca azaltabilir veya satır çıkarabilir. Bu, perakendecinin onaylamadığı bir tutara bağlanmasını önler.

### US-044 — Sipariş belgesi

**Persona:** P-02, P-07, P-08 · **Özellik:** F-36 · **Öncelik:** Must

- **AC1:** Given `approved` veya sonraki durumda bir sipariş, When "Belge" istenir, Then belge kullanıcının dilinde (az, ru, tr) PDF olarak üretilir: sipariş numarası, tarih, satıcı ve alıcı ünvanı ve VÖEN'i, teslimat adresi, satırlar (ad, birim, miktar, birim fiyat, indirim, tutar), KDV bilgisi, toplam.
- **AC2:** Given satırda lot numarası ve son kullanma tarihi girilmişse, When belge üretilir, Then bu bilgiler satırda görünür.
- **AC3:** Given belge, When üretilir, Then üzerinde "Bu belge vergi faturası değildir" ibaresi bulunur.

### US-045 — Tekrar sipariş ve favoriler

**Persona:** P-08, P-10 · **Özellik:** F-37 · **Öncelik:** Could

- **AC1:** Given geçmiş bir sipariş, When "Tekrar sipariş" denir, Then hâlâ sipariş edilebilir kalemler güncel fiyatla sepete eklenir; eklenemeyenler listelenir.
- **AC2:** Given bir ürün, When favorilere eklenir, Then "Favorilerim" filtresinde görünür.

### US-061 — Satış temsilcisinin müşteri adına sipariş girmesi

**Persona:** P-04 · **Özellik:** F-51 · **Öncelik:** Could

- **AC1:** Given temsilcinin atandığı aktif bağlantı, When temsilci perakendeci adına sepet oluşturup gönderir, Then sipariş `submitted` olur, `created_by_seller_user_id` kaydedilir ve perakendeciye "Temsilciniz sizin adınıza sipariş oluşturdu" bildirimi gider.
- **AC2:** Given temsilcinin oluşturduğu sipariş, When perakendeci 24 saat içinde itiraz ederse, Then sipariş toptancı onayından önce iptal edilir.

⚠️ AÇIK SORU: Bu story MVP'ye dahil mi? Dahilse şube onayının bu siparişlerde atlanıp atlanmayacağı da netleşmelidir.

---

## EP-10 Teslimat

### US-046 — Kargocu atama ve günlük liste

**Persona:** P-05, P-06 · **Özellik:** F-38 · **Öncelik:** Must

- **AC1:** Given `preparing` sipariş, When depo kullanıcısı bir kargocu atar, Then bir `delivery` kaydı (`provider = own_courier`) oluşur ve sipariş `ready_to_ship` olur.
- **AC2:** Given kargocu, When "Yola çıktım" der, Then sipariş `shipped` olur, stok düşülür (US-039 AC3) ve perakendeciye bildirim gider.
- **AC3:** Given kargocu uygulaması, When "Bugün" ekranı açılır, Then kargocuya atanmış ve teslim edilmemiş teslimatlar adres, telefon ve tahsil edilecek tutarla listelenir.
- **AC4:** Given kargocu rolü, When başka bir kargocunun teslimatını açmaya çalışır, Then 404 döner.

### US-047 — "Teslim ettim"

**Persona:** P-06 · **Özellik:** F-38 · **Öncelik:** Must

- **AC1:** Given `shipped` teslimat, When kargocu "Teslim ettim" der, Then GPS konumu ve zaman otomatik kaydedilir, sipariş `delivered_pending_confirmation` olur, `auto_confirm_at` = şimdi + 48 saat olur ve perakendecinin şube adminlerine bildirim gider.
- **AC2:** Given toptancı ayarı "teslim fotoğrafı zorunlu", When fotoğraf eklenmeden teslim edilmek istenir, Then işlem reddedilir.
- **AC3:** Given teslim konumu şube konumundan 300 metreden uzak, When teslim kaydedilir, Then kayıt "konum uyuşmazlığı" olarak işaretlenir ve toptancının teslimat ekranında görünür.
- **AC4:** Given kargocu "Teslim edilemedi" der, When neden seçer, Then sipariş `shipped` durumunda kalır, teslimat denemesi kaydedilir ve toptancıya bildirim gider.

### US-048 — Perakendeci teslim onayı, itiraz, otomatik onay

**Persona:** P-09, P-08 · **Özellik:** F-39 · **Öncelik:** Must

- **AC1:** Given `delivered_pending_confirmation` sipariş, When perakendeci "Onayla" der, Then sipariş `delivered` olur ve cariye borç kaydı yazılır (US-050).
- **AC2:** Given aynı sipariş, When perakendeci "İtiraz et" der ve tür (eksik, hasarlı, teslim almadım), açıklama ve isteğe bağlı fotoğraf girer, Then sipariş `disputed` olur ve toptancıya bildirim gider.
- **AC3:** Given `auto_confirm_at` geçmiş ve yanıtsız sipariş, When zamanlanmış iş çalışır (her 15 dakikada), Then sipariş `delivered` olur, `auto_confirmed = true` kaydedilir ve borç yazılır.
- **AC4:** Given `disputed` sipariş, When toptancı itirazı çözer (kabul: satır miktarlarını düzeltir / ret: teslim kanıtıyla), Then sipariş `delivered` olur ve borç, düzeltilmiş tutar üzerinden yazılır.
- **AC5:** Given kabul ekranı ve bildirim metni, When perakendeci okur, Then "48 saat içinde yanıt vermezseniz teslimat onaylanmış sayılır" bilgisi yer alır.

### US-049 — Manuel dış kargo

**Persona:** P-05 · **Özellik:** F-40 · **Öncelik:** Should

- **AC1:** Given `preparing` sipariş, When depo kullanıcısı firma adı ve takip numarası girer, Then `delivery` (`provider = manual_carrier`) oluşur ve sipariş `shipped` olur.
- **AC2:** Given manuel kargo, When toptancı "Teslim edildi" der, Then US-048 akışı aynı şekilde başlar.

---

## EP-11 Cari ve belge

### US-050 — Borç kaydı ve cari görüntüleme

**Persona:** P-07, P-08 · **Özellik:** F-41 · **Öncelik:** Must

- **AC1:** Given sipariş `delivered` olur, When işlem tamamlanır, Then satıcı–alıcı çifti için siparişin para biriminde bir `ledger_entries` borç kaydı (`order_delivered`) oluşur.
- **AC2:** Given cari ekranı, When toptancı bir perakendecinin carisini açar, Then açılış bakiyesi, hareketler (tarih, tür, belge, borç, alacak, bakiye) ve güncel bakiye para birimine göre ayrı gösterilir.
- **AC3:** Given perakendeci, When "Borcum" ekranını açar, Then her toptancı için bakiye ve vadesi yaklaşan tutarlar (vade: teslim tarihi + bağlantı vadesi) görünür; iptal edilmiş bağlantılar dahildir.
- **AC4:** Given bir cari kaydı, When oluştuktan sonra değiştirilmek istenir, Then değiştirilemez; düzeltme yalnızca ters kayıtla yapılır.

### US-051 — Tahsilat girişi

**Persona:** P-07, P-04, P-06 · **Özellik:** F-41 · **Öncelik:** Must

- **AC1:** Given cari ekranı, When muhasebe kullanıcısı tutar, yöntem (nakit, havale, kart) ve tarih girer, Then alacak kaydı (`payment`) oluşur ve bakiye düşer.
- **AC2:** Given kargocu, When teslimatta kapıda tahsilat girer, Then alacak kaydı oluşur ve tutar "kargocuda bekleyen nakit" olarak kargocunun üzerine yazılır.
- **AC3:** Given muhasebe, When kargocudan nakdi teslim aldığını onaylar, Then "kargocuda bekleyen nakit" kapanır.
- **AC4:** Given satış temsilcisi, When kendi müşterisi için tahsilat girer, Then tahsilat `pending_review` olarak kaydedilir ve muhasebe onayıyla kesinleşir.

📌 VARSAYIM: Temsilci tahsilatı muhasebe onayı gerektirir; kargocunun kapıda tahsilatı ise teslimatla bağlantılı olduğu için doğrudan kaydedilir.

### US-052 — Ekstre

**Persona:** P-07, P-08 · **Özellik:** F-42 · **Öncelik:** Should

- **AC1:** Given cari ekranı, When tarih aralığı seçilip "Ekstre" istenir, Then kullanıcının dilinde PDF ekstre üretilir.

### US-053 — e-qaimə uyumlu dışa aktarma

**Persona:** P-07 · **Özellik:** F-43 · **Öncelik:** Should

- **AC1:** Given teslim edilmiş siparişler, When muhasebe tarih aralığı seçip dışa aktarır, Then her satırda satıcı VÖEN'i, alıcı VÖEN'i, belge numarası, tarih, ürün adı, birim kodu (UN/ECE), miktar, birim fiyat, KDV oranı ve tutar bulunan bir .xlsx dosyası üretilir.
- **AC2:** Given dışa aktarılan siparişler, When muhasebe e-qaimə numarasını sipariş belgesine elle girer, Then sipariş "faturalandı" olarak işaretlenir.

⚠️ AÇIK SORU: e-qaimə XML şemasıyla birebir uyumlu bir dışa aktarma gerekiyor mu, yoksa muhasebecinin kullandığı programa göre .xlsx yeterli mi? Bu story .xlsx varsayar.

---

## EP-12 Bildirim, abonelik, gözlem

### US-054 — Push bildirimleri

**Persona:** tüm kullanıcılar · **Özellik:** F-44 · **Öncelik:** Must

- **AC1:** Given aşağıdaki olaylar, When gerçekleşir, Then ilgili rollerdeki kullanıcılara kendi dillerinde push bildirimi gider ve uygulama içi bildirim listesine yazılır.
- **AC2:** Given bildirim ayarları, When kullanıcı bir olay türünü kapatır, Then o tür push bildirimi gitmez (uygulama içi listede kalır).
- **AC3:** Given push gönderimi başarısız olur, When hata geçici ise, Then 3 kez yeniden denenir (1, 5, 15 dakika).

| Olay | Alıcı |
| --- | --- |
| Yeni bağlantı isteği | Perakendeci adminleri |
| İstek kabul / red / süre doldu | İsteği gönderen + toptancı adminleri |
| Bağlantı iptal edildi | Karşı tarafın adminleri |
| Sepet onaya gönderildi / geri gönderildi | Şube adminleri / gönderen kullanıcı |
| Yeni sipariş | Toptancının sipariş onay izni olanlar |
| Sipariş onaylandı / düzenlendi / reddedildi | Siparişi gönderen + şube adminleri |
| Sipariş yola çıktı / teslim edildi (onay bekliyor) | Şube adminleri |
| Teslim itirazı | Toptancı adminleri + depo |
| Yeni teslimat atandı | Kargocu |

### US-055 — Plan ve hak sistemi

**Persona:** P-01 · **Özellik:** F-45 · **Öncelik:** Must

- **AC1:** Given plan ekranı, When admin plan adı, fiyatı, para birimi, dönemi, yetenek türü ve haklarını (`users.max`, `buyers.active.max`, `warehouses.max`, `connection_requests.daily`, `feature.courier_app`, `feature.export`) girer, Then plan oluşur.
- **AC2:** Given bir işletmenin aboneliği, When bir işlem bir hakkın limitini aşacaksa, Then işlem `ENTITLEMENT_LIMIT_REACHED` ile reddedilir.
- **AC3:** Given işletmeye özel istisna, When admin tanımlar, Then plan değerinin yerine geçer.
- **AC4:** Given aboneliği süresi geçmiş bir toptancı, When 7 günlük tolerans süresi biter, Then işletme salt-okunur moda geçer: yeni istek gönderemez, yeni sipariş onaylayamaz; mevcut teslimat ve cari işlemleri devam eder.
- **AC5:** Given abonelik ödemesi, When admin manuel olarak "ödendi" işaretler, Then abonelik bitişi bir dönem uzar.

📌 VARSAYIM: Tolerans süresi 7 gündür ve salt-okunur mod, perakendecilerin devam eden siparişlerini etkilemeyecek şekilde tanımlanmıştır.

### US-056 — Rol bazlı dashboardlar

**Persona:** tüm personalar · **Özellik:** F-46 · **Öncelik:** Must

- **AC1:** Given giriş, When kullanıcı panele girer, Then rolüne göre tanımlı dashboard kartları görünür (rapor, "Dashboardlar" bölümü).
- **AC2:** Given bir kart, When tıklanır, Then ilgili liste kartın filtresiyle açılır.
- **AC3:** Given tarih aralığı seçici (bugün, bu hafta, bu ay, özel), When değiştirilir, Then kartlar işletmenin saat dilimine göre yeniden hesaplanır.
- **AC4:** Given dashboard, When açılır, Then tüm kartlar p95 < 1,5 saniyede yüklenir.

### US-057 — Audit log

**Persona:** P-01, P-02, P-08 · **Özellik:** F-47 · **Öncelik:** Must

- **AC1:** Given rol, fiyat, bağlantı, ayar, sipariş durumu, cari ve taklit işlemleri, When gerçekleşir, Then audit loga zaman, kullanıcı, işletme, işlem türü, hedef kayıt, eski değer ve yeni değer yazılır.
- **AC2:** Given işletme admini, When audit log ekranını açar, Then yalnızca kendi işletmesinin kayıtlarını görür.
- **AC3:** Given audit log kaydı, When değiştirilmek veya silinmek istenir, Then uygulama katmanında böyle bir işlem yoktur.

---

## EP-13 Dil, bölge, istemci

### US-058 — Dil seçimi ve çeviri yönetimi

**Persona:** tüm kullanıcılar, P-01 · **Özellik:** F-48 · **Öncelik:** Must

- **AC1:** Given dil seçici, When kullanıcı az, ru veya tr seçer, Then tüm arayüz, bildirimler ve PDF belgeler o dilde gösterilir; seçim profilde saklanır.
- **AC2:** Given çeviri yönetimi ekranı, When admin bir anahtarın çevirisini günceller, Then değişiklik en geç 5 dakika içinde istemcilere yansır.
- **AC3:** Given çevirisi eksik bir anahtar, When gösterilir, Then varsayılan dilde (az) gösterilir ve eksik anahtar raporuna eklenir.
- **AC4:** Given `en` dili, When pilot sürümünde dil seçiciye bakılır, Then `en` yalnızca `is_active = true` yapıldığında görünür.

### US-059 — Para birimi ve saat dilimi

**Persona:** tüm kullanıcılar · **Özellik:** F-49 · **Öncelik:** Must

- **AC1:** Given bir tutar, When gösterilir, Then para biriminin sembolü ve ondalık hanesiyle kullanıcının diline uygun biçimlenir (ör. ru `1 234,50 ₼`; her dil CLDR kuralıyla, `Intl.NumberFormat`).
- **AC2:** Given bir zaman, When gösterilir, Then kullanıcının saat diliminde (yoksa işletmenin, yoksa ülkenin) gösterilir.
- **AC3:** Given bir sipariş, When oluşur, Then tek para biriminde olur; farklı para birimli fiyat listelerinden kalemler aynı siparişte birleşmez.

### US-060 — Mobil minimum sürüm kontrolü

**Persona:** tüm mobil kullanıcılar · **Özellik:** F-50 · **Öncelik:** Must

- **AC1:** Given mobil uygulama açılışı, When `GET /api/app-config` minimum sürümden düşük bir sürüm bildirir, Then uygulama "Lütfen güncelleyin" ekranını gösterir ve mağaza (veya test dağıtım) bağlantısını açar.
- **AC2:** Given önerilen sürüm daha yeni ama minimum sürüm karşılanıyorsa, When uygulama açılır, Then kapatılabilir bir güncelleme önerisi gösterilir.
