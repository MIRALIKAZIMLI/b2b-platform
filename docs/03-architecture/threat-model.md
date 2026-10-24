# Tehdit Modeli (STRIDE)

| Alan | Değer |
| --- | --- |
| Sürüm | 1.0 |
| Tarih | 2026-10-24 |
| İlgili belgeler | [non-functional-requirements.md](../02-requirements/non-functional-requirements.md) §4–5 · [data-model.md](data-model.md) §1.1 · [c4-container.md](c4-container.md) |

**STRIDE:** S = kimlik sahteciliği (Spoofing), T = kurcalama (Tampering), R = inkâr (Repudiation), I = bilgi ifşası (Information disclosure), D = hizmet engelleme (Denial of service), E = yetki yükseltme (Elevation of privilege).

**Ölçek:** Olasılık ve Etki = Düşük / Orta / Yüksek. Önlemlerin her biri ya bir NFR'ye, bir test türüne ya da bir runbook adımına bağlanır.

## 1. Varlıklar ve güven sınırları

| Varlık | Neden değerli |
| --- | --- |
| Kiracı verisi (fiyatlar, müşteri listesi, siparişler, cari) | Rakip toptancı için çok değerli; sızıntı işi bitirir |
| Perakendeci dizini | Bölgedeki tüm dükkanların listesi; kazınırsa rakibe veya spamcıya gider |
| Kişisel veri (telefon, ad) | Mevzuat ve güven |
| Hesaplar (özellikle platform ve işletme adminleri) | Tam yetki |
| SMS bütçesi | OTP kötüye kullanımı doğrudan para kaybıdır |
| Kod ve dağıtım hattı | Ele geçirilirse tüm sistem |

Güven sınırları: (1) İnternet ↔ Cloudflare, (2) Cloudflare ↔ uygulama sunucusu, (3) API ↔ veritabanı (RLS), (4) kiracı ↔ kiracı (uygulama içinde mantıksal sınır), (5) GitHub ↔ sunucu (dağıtım).

## 2. STRIDE tablosu

| # | Bileşen | Tehdit | STRIDE | Olasılık | Etki | Önlem |
| --- | --- | --- | --- | --- | --- | --- |
| TM-01 | OTP girişi | Kod tahmini (brute force) | S | Orta | Yüksek | 6 hane, 5 dk ömür, 5 yanlışta 15 dk kilit, IP sınırı (NFR-45); kod hash'li saklanır |
| TM-02 | OTP girişi | **SMS pompalama (toll fraud):** saldırgan çok sayıda numaraya OTP isteterek SMS faturası çıkarır | D | Yüksek | Yüksek | Numara ve IP hız sınırı; yalnızca `+994` (ayar); günlük SMS üst sınırı (`sms.daily_cap`, varsayılan 500) aşılınca gönderim durur + alarm; Cloudflare bot koruması kayıt/OTP uçlarında |
| TM-03 | OTP girişi | SIM kopyalama ile admin hesabı ele geçirme | S | Düşük | Yüksek | Platform rolleri için TOTP zorunlu (US-002); işletme adminine önerilir |
| TM-04 | Oturum | Çalınan yenileme anahtarının kullanılması | S | Orta | Yüksek | Döndürülen tek kullanımlık anahtar; yeniden kullanımda tüm aile iptal (SF-01); web'de httpOnly + Secure + SameSite=Strict cookie; mobilde güvenli depo |
| TM-05 | API kiracı sınırı | IDOR: başka kiracının kaydına kimlikle erişim | I | **Yüksek** | **Yüksek** | Uygulama filtresi + PostgreSQL RLS (ADR-0003); her uç nokta için izolasyon testi (NFR-82); başka kiracının kaydı `404` döner (varlık sızdırılmaz) |
| TM-06 | API kiracı sınırı | `X-Business-Id` başlığını üyelik dışı bir işletmeyle göndermek | E | Orta | Yüksek | `TenantContext` başlığı üyelikle doğrular; aksi halde `403`; RLS değeri yalnızca doğrulanmış bağlamdan atanır |
| TM-07 | Yetki | Menüde gizli işlemi doğrudan API ile çağırmak | E | Orta | Yüksek | Her uç noktada `@RequirePermission` zorunlu; CI'da dekoratörsüz controller metodu bulan lint kuralı (bkz. [coding-guidelines.md](../07-ai-development/coding-guidelines.md)) |
| TM-08 | Yetki | `buyer` işletmesinin `seller` uç noktasını çağırması (veya tersi) | E | Orta | Orta | Yetenek kontrolü (`CAPABILITY_REQUIRED`); izinler yeteneğe bağlı (ADR-0004) |
| TM-09 | Perakendeci dizini | Toptancının dizini kazıması ve dışarı aktarması | I | Yüksek | Orta | Sayfa başı 20, dakikada 60 arama (NFR-47); dışa aktarma yok; varsayılan yalnızca 3 alan (D7); kısmi telefon/VÖEN araması yok (US-020 AC2); anormal arama hacminde alarm |
| TM-10 | Perakendeci dizini | Rakip toptancının, bir perakendecinin hangi toptancılarla çalıştığını öğrenmesi | I | Orta | Yüksek | Bağlantı ve alım verisi hiçbir dizin/profil yanıtında yok (US-007 AC6); yanıt şeması testi |
| TM-11 | Bağlantı isteği | Spam istekle perakendeci tacizi | D | Orta | Orta | Tek bekleyen istek, bekleme süresi (alt sınır 7 gün), günlük kota, engelleme, engellenme oranı alarmı (D9, D10) |
| TM-12 | Sahte perakendeci | Rakibin sahte perakendeci hesabıyla fiyat görmek için istek beklemesi | S | Orta | Orta | VÖEN tekilliği ve moderasyon rozeti; toptancı isteği kendisi başlatır (K3, K4) ve doğrulanmamış hesapları dizinde ayırt eder |
| TM-13 | Sipariş | İstemcinin fiyatı veya toplamı manipüle etmesi | T | Orta | Yüksek | Fiyat ve toplam her zaman sunucuda hesaplanır; istemciden gelen fiyat alanı yok sayılır (OpenAPI'de yok) |
| TM-14 | Sipariş | Toptancının onaysız tutarı artırması | T | Düşük | Orta | Miktar artırma yasak (US-043 AC4); `order_item_changes` kaydı |
| TM-15 | Teslim | Kargocunun teslim etmeden "teslim ettim" demesi | R | Orta | Orta | GPS + zaman + isteğe bağlı fotoğraf; konum uyuşmazlığı işareti; perakendecinin 48 saatlik itiraz hakkı (K11) |
| TM-16 | Teslim | Perakendecinin teslim aldığı malı inkâr etmesi | R | Orta | Orta | Teslim kanıtı (`delivery_proofs`); itiraz kaydı; otomatik onay kuralı kabul ekranında açıkça yazılı |
| TM-17 | Cari | Kayıtların sonradan değiştirilmesi | T, R | Düşük | Yüksek | Yalnızca ekleme; ters kayıtla düzeltme; uygulama rolünün `UPDATE/DELETE` izni yok; audit log |
| TM-18 | Dosya yükleme | Zararlı dosya (görsel kılığında betik) | T | Orta | Orta | İçerik türü imzayla doğrulanır; boyut sınırı; `public` bucket'ta yalnızca görsel; dosyalar API alanından değil ayrı alan adından (`files.<alan>`) sunulur |
| TM-19 | Dosya yükleme | Teslim fotoğrafı veya belgenin herkese açık olması | I | Orta | Orta | `private` bucket; 5 dk'lık imzalı URL; URL'de kişisel veri yok |
| TM-20 | Web | XSS ile oturum çalma | I, E | Orta | Yüksek | React'in varsayılan kaçışı; `dangerouslySetInnerHTML` lint ile yasak; sıkı Content-Security-Policy; erişim anahtarı yalnızca bellekte |
| TM-21 | Web | CSRF (cookie ile yenileme) | T | Düşük | Orta | SameSite=Strict; yenileme uç noktası ayrıca `X-Requested-With` başlığı ister; diğer uçlar Bearer anahtarı kullanır (cookie değil) |
| TM-22 | Platform admin | Destek kullanıcısının yetkisini kötüye kullanması | E, R | Düşük | Yüksek | Taklit yalnızca salt-okunur, 30 dk, gerekçeli, audit'li (US-018); platform rolleri fiyat/sipariş/cari yazamaz (RLS) |
| TM-23 | Audit log | İz silme | R | Düşük | Orta | Uygulama rolünün audit tablosunda yalnızca `INSERT` izni |
| TM-24 | Worker / kuyruk | Kuyruğa sahte iş eklenmesi | T | Düşük | Orta | Redis dışarıya kapalı; parola korumalı; işler outbox'taki kayıtlardan üretilir ve kimlikle tekrar doğrulanır |
| TM-25 | Veritabanı | Doğrudan internet erişimi | I | Düşük | Yüksek | Herkese açık değil; yalnızca uygulama sunucusundan; TLS |
| TM-26 | Gizli bilgiler | Anahtarların depoya veya AI sohbetine girmesi | I | **Yüksek** | Yüksek | `.env` git dışında; CI'da gizli bilgi taraması; SSM Parameter Store; [coding-guidelines.md](../07-ai-development/coding-guidelines.md) AI kuralları; sızıntıda runbook RB-07 |
| TM-27 | Tedarik zinciri | Kötü niyetli veya var olmayan npm paketi (AI önerisi) | T, E | Orta | Yüksek | Yeni paket insan onayı; kilit dosyası; bağımlılık taraması (NFR-51); yalnızca tech-stack listesindeki paketler |
| TM-28 | Dağıtım hattı | GitHub hesabı veya Actions ele geçirilmesi | E | Düşük | Çok yüksek | GitHub 2FA; `main` korumalı; production dağıtımı manuel onaylı ortam; dağıtım SSH anahtarı yalnızca dağıtım komutuna sınırlı |
| TM-29 | AI ile yazılan kod | Kiracı filtresi, yetki dekoratörü veya doğrulama unutulması | T, I, E | **Yüksek** | Yüksek | RLS (son savunma hattı); izolasyon testleri; Müfettiş kontrol listesi ([definition-of-done.md](../07-ai-development/definition-of-done.md)); CI lint kuralları |
| TM-30 | Genel | Uygulama katmanı DoS | D | Orta | Orta | Cloudflare; hız sınırları (NFR-47); ağır işler (Excel, PDF) kuyrukta; istek gövdesi sınırı 1 MB (dosyalar R2'ye doğrudan) |
| TM-31 | Mobil | Cihazdaki önbellekte iptal edilmiş bağlantının fiyatlarının kalması | I | Orta | Düşük | `403 CONNECTION_NOT_ACTIVE` alındığında önbellek temizlenir; çıkışta tüm yerel veri silinir |
| TM-32 | Mock SMS | Production'da mock sağlayıcının açık kalması ve kodların görünmesi | I, S | Düşük | Çok yüksek | Production'da `SMS_PROVIDER=mock` ise uygulama başlamaz; `/api/v1/dev/*` uçları production'da kayıtlı değil (NFR-97) |

## 3. En yüksek riskler ve sahiplik

| Sıra | Tehdit | Neden en yüksek | Doğrulama |
| --- | --- | --- | --- |
| 1 | TM-05, TM-29 (kiracı sızıntısı, AI hataları) | Olasılık ve etki birlikte yüksek | Her PR'da izolasyon test paketi; aylık RLS denetim betiği |
| 2 | TM-02 (SMS pompalama) | Doğrudan para kaybı; bütçe 100 USD | Günlük SMS üst sınırı testi; alarm |
| 3 | TM-26 (gizli bilgi sızıntısı) | AI ile çalışmada sık yapılan hata | CI gizli bilgi taraması; anahtar döndürme runbook'u |
| 4 | TM-09 (dizin kazıma) | İş modelinin temeli olan veri | Hız sınırı testi; arama hacmi alarmı |

Tüm tehditlerin sahibi platform sahibidir (tek kişi). Tehdit modeli her yeni dış entegrasyonda ve her fazın başında gözden geçirilir.
