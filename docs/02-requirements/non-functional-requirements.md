# Fonksiyonel Olmayan Gereksinimler (NFR)

| Alan | Değer |
| --- | --- |
| Sürüm | 1.0 |
| Tarih | 2026-10-24 |
| İlgili belgeler | [project-charter.md](../01-discovery/project-charter.md) · [infrastructure.md](../03-architecture/infrastructure.md) · [threat-model.md](../03-architecture/threat-model.md) · [observability.md](../06-operations/observability.md) |

Her gereksinimin bir kimliği (NFR-xx), ölçülebilir bir hedefi ve bir doğrulama yöntemi vardır. Hedefler [project-charter.md](../01-discovery/project-charter.md) bölüm 7'deki ölçek varsayımlarına dayanır.

## 1. Kapasite ve ölçek (tasarım hedefi)

| # | Boyut | 12. ay hedefi | Tasarım tavanı (×5) |
| --- | --- | --- | --- |
| NFR-01 | Toptancı (seller) | 10 | 50 |
| NFR-02 | Perakendeci (buyer) | 200 | 1.000 |
| NFR-03 | Kullanıcı | 800 | 4.000 |
| NFR-04 | Aktif ürün varyantı (toplam) | 20.000 | 100.000 |
| NFR-05 | Sipariş / gün (tepe) | 300 | 1.500 |
| NFR-06 | Sipariş satırı / sipariş (ortalama) | 25 | 25 |
| NFR-07 | Eşzamanlı aktif kullanıcı (tepe) | 100 | 500 |

📌 VARSAYIM: NFR-04, NFR-05 ve NFR-07 değerleri charter varsayımları A-01–A-03'ten türetilmiştir. Mimari, tasarım tavanına kadar yatay ölçekleme gerektirmeden (tek uygulama sunucusu büyütülerek) çalışmalıdır.

**Doğrulama:** Yayın öncesi yük testi tasarım tavanındaki sipariş hacminin 1 saatlik tepe yükünü (1.500 siparişin %20'si = 300 sipariş/saat) staging ortamında simüle eder (bkz. [test-strategy.md](../05-planning/test-strategy.md)).

## 2. Performans

Ölçüm: sunucu tarafında, Cloudflare'den geçen isteklerin API yanıt süresi (ağ gecikmesi hariç), 7 günlük pencerede.

| # | İşlem | Hedef |
| --- | --- | --- |
| NFR-10 | Okuma API'leri (liste, detay) | p95 < 300 ms, p99 < 800 ms |
| NFR-11 | Ürün arama (Meilisearch + fiyat hesabı) | p95 < 400 ms |
| NFR-12 | Sepet gönderimi ve bölünme (en fazla 5 toptancı, 100 kalem) | p95 < 1.500 ms |
| NFR-13 | Sipariş onayı (stok rezervasyonu dahil) | p95 < 800 ms |
| NFR-14 | Diğer yazma API'leri | p95 < 500 ms |
| NFR-15 | Dashboard (tüm kartlar) | p95 < 1.500 ms |
| NFR-16 | PDF belge üretimi (100 satıra kadar) | p95 < 3 s |
| NFR-17 | Excel içe aktarma (5.000 satır, önizleme) | < 60 s; uygulama < 2 dk |
| NFR-18 | Web: Largest Contentful Paint (4G, orta segment telefon) | < 2,5 s |
| NFR-19 | Mobil: soğuk açılış → ilk ekran (orta segment Android) | < 3 s |
| NFR-20 | Push bildiriminin olaydan sonra gönderilmesi | p95 < 60 s |
| NFR-21 | Zamanlanmış işlerin gecikmesi (süre dolumu, otomatik onay) | ≤ 15 dk |

📌 VARSAYIM: "Orta segment telefon" referansı 2023 yılı veya sonrasına ait, 4 GB RAM'li bir Android cihazdır.

## 3. Erişilebilirlik ve süreklilik

| # | Gereksinim | Hedef |
| --- | --- | --- |
| NFR-30 | Erişilebilirlik (iş saatleri, planlı bakım hariç) | ≥ %99,5 / ay |
| NFR-31 | Erişilebilirlik (iş saatleri dışı) | En iyi çaba; hedef yok |
| NFR-32 | Planlı bakım penceresi | Asia/Baku 02:00–05:00; en az 24 saat önce uygulama içi duyuru |
| NFR-33 | Kurtarma noktası hedefi (RPO) | ≤ 5 dakika (yönetilen PostgreSQL'in zamana göre geri yükleme özelliğiyle) |
| NFR-34 | Kurtarma süresi hedefi (RTO) | ≤ 4 saat (iş saatlerinde) |
| NFR-35 | Yedek saklama | Günlük otomatik yedek 7 gün; haftalık manuel anlık görüntü 4 hafta |
| NFR-36 | Geri yükleme testi | Ayda 1 kez staging ortamına geri yükleme; sonuç runbook'a yazılır |
| NFR-37 | Dosya (R2) dayanıklılığı | Cloudflare R2'nin sağladığı düzey; ürün görselleri için ek yedek yok, belgeler (PDF) yeniden üretilebilir |

📌 VARSAYIM: İş saatleri charter A-04'teki gibidir. Tek kişilik operasyon nedeniyle gece kesintilerine sabah ilk iş saatinde müdahale edilir; bu durum RTO'yu iş saatleri dışında 8 saate kadar uzatabilir.

## 4. Güvenlik

| # | Gereksinim | Hedef / kural |
| --- | --- | --- |
| NFR-40 | Kiracı izolasyonu | Her kiracıya bağlı tabloda PostgreSQL RLS aktif; her uç nokta için en az bir "başka kiracının verisine erişemez" testi; ihlal sayısı = 0 |
| NFR-41 | Yetki kontrolü | Her API isteğinde backend'de: oturum → üyelik → yetenek → izin → kapsam → kaynak sahipliği |
| NFR-42 | Taşıma şifrelemesi | Yalnızca HTTPS, TLS 1.2+; HSTS |
| NFR-43 | Depolama şifrelemesi | Veritabanı, yedekler ve R2 sağlayıcı tarafında şifreli |
| NFR-44 | Kimlik | Erişim anahtarı (JWT) ömrü 15 dk; yenileme anahtarı 30 gün, tek kullanımlık ve döndürülen; çıkışta iptal |
| NFR-45 | OTP | 6 hane, 5 dk geçerli, numara başına 1/dk ve 5/saat, 5 yanlışta 15 dk kilit, IP başına 20/saat |
| NFR-46 | 2FA | Platform rolleri için TOTP zorunlu |
| NFR-47 | Hız sınırı | Kimliği doğrulanmış kullanıcı başına genel 300 istek/dk; dizin araması 60/dk; kimliksiz uçlar IP başına 60/dk |
| NFR-48 | Girdi doğrulama | Her API girdisi şema ile doğrulanır (OpenAPI ile aynı şema); doğrulanmayan alan reddedilir |
| NFR-49 | Dosya yükleme | Görsel: JPEG/PNG/WebP, ≤ 5 MB; Excel: .xlsx, ≤ 10 MB; içerik türü dosya imzasıyla doğrulanır; R2'ye süreli imzalı URL ile doğrudan yükleme |
| NFR-50 | Gizli bilgi | Kodda ve depoda gizli bilgi yok; ortam değişkenleri AWS tarafında şifreli parametre deposundan; CI'da gizli bilgi taraması |
| NFR-51 | Bağımlılık güvenliği | Her pull request'te bağımlılık taraması; yüksek/kritik açık varken birleştirme engellenir |
| NFR-52 | Audit log | Bkz. US-057; saklama süresi 2 yıl |
| NFR-53 | Güvenlik standardı | OWASP ASVS 4.0 Seviye 1 kontrolleri yayın öncesi kontrol listesinde |

## 5. Kişisel veri ve mevzuat

Hukuki görüş alınmış ve barındırma kararı (AWS Frankfurt) onaylanmıştır. Uygulanan ilkeler:

| # | Gereksinim | Kural |
| --- | --- | --- |
| NFR-60 | Veri minimizasyonu | Kişisel veri alanları yalnızca `person_data` ve `users` tablolarında; diğer tablolar bunlara kimlikle bağlanır |
| NFR-61 | Kişisel veri işaretleme | Veri modelinde her kişisel veri alanı 🔒 ile işaretli (bkz. [data-model.md](../03-architecture/data-model.md)) |
| NFR-62 | Varsayılan gizlilik | Bağlantısız toptancılara yalnızca ünvan, faaliyet alanı, şehir/rayon açık (K4, US-007) |
| NFR-63 | Açık onay | Kayıtta veri paylaşım metninin onayı ve onay sürümü + zamanı saklanır |
| NFR-64 | Silme talebi | Perakendeci veya kullanıcının silme talebi 30 gün içinde uygulanır; ticari kayıtlar (sipariş, cari) yasal saklama için anonimleştirilerek korunur |
| NFR-65 | Erişim talebi | Kullanıcının kendi kişisel verilerinin dışa aktarımı 30 gün içinde sağlanır (MVP'de admin eliyle) |
| NFR-66 | Loglar | Uygulama loglarında telefon numarası maskelenir (+99450***1234); OTP kodu, anahtar ve şifre asla loglanmaz |
| NFR-67 | Log saklama | Uygulama logları 30 gün |
| NFR-68 | Ticari kayıt saklama | Sipariş, belge ve cari kayıtları en az 5 yıl |

📌 VARSAYIM: NFR-64'teki 30 günlük süre ve NFR-68'deki 5 yıllık saklama süresi, hukuki görüşte belirtilen sürelerle karşılaştırılıp gerekirse güncellenmelidir.

## 6. Kullanılabilirlik ve uyumluluk

| # | Gereksinim | Hedef |
| --- | --- | --- |
| NFR-70 | Diller | Pilotta az, ru, tr arayüz anahtarlarının %100'ü çevrilmiş; en altyapıda hazır |
| NFR-71 | Mobil platformlar | iOS 16+, Android 10+ (API 29+) |
| NFR-72 | Tarayıcılar | Chrome, Edge, Safari, Firefox'un son 2 ana sürümü |
| NFR-73 | Ekran genişliği | Web: 360 px ve üstü duyarlı; admin paneli 1280 px için optimize |
| NFR-74 | Erişilebilirlik (a11y) | WCAG 2.1 AA: renk kontrastı, klavye ile gezinme (web), ekran okuyucu etiketleri |
| NFR-75 | Temel akış adımları | Perakendecinin ürün bulmaktan sepeti onaya göndermesine kadar en fazla 5 ekran |

📌 VARSAYIM: NFR-71 sürüm alt sınırları, Expo SDK'nın desteklediği sürümlerle F0.3 adımında doğrulanmalıdır.

## 7. Bakım ve geliştirilebilirlik

| # | Gereksinim | Hedef |
| --- | --- | --- |
| NFR-80 | Test kapsamı (domain servisleri: fiyat, stok, bağlantı, sipariş, cari) | Satır kapsamı ≥ %85 |
| NFR-81 | Test kapsamı (tüm backend) | ≥ %70 |
| NFR-82 | Kiracı izolasyonu testleri | Kiracıya bağlı her uç nokta için ≥ 1 |
| NFR-83 | CI süresi (pull request) | < 10 dk |
| NFR-84 | Tip güvenliği | TypeScript `strict`; `any` kullanımı lint ile yasak (gerekçeli istisna hariç) |
| NFR-85 | API sürümleme | Kırıcı değişiklik yalnızca yeni ana sürümde (`/api/v2`); aynı anda en fazla 2 sürüm; eski sürümün kaldırılması en az 6 ay önce duyurulur |
| NFR-86 | Belgeler | Her pull request, etkilediği spesifikasyonu, OpenAPI'yi ve CHANGELOG'u günceller (bkz. [definition-of-done.md](../07-ai-development/definition-of-done.md)) |
| NFR-87 | Dağıtım süresi | `main` dalına birleştirmeden production'a ≤ 15 dk (manuel onay adımı dahil değil) |
| NFR-88 | Geri alma | Önceki sürüme dönüş ≤ 10 dk |

## 8. Maliyet

| # | Gereksinim | Hedef |
| --- | --- | --- |
| NFR-90 | Aylık toplam altyapı maliyeti | ≤ 100 USD |
| NFR-91 | Bütçe alarmı | AWS Budgets: 70 USD'de uyarı, 90 USD'de ikinci uyarı |
| NFR-92 | SMS | Yalnızca OTP. Geliştirme ve staging ortamlarında **sahte (mock) SMS gönderici** kullanılır; dış servise istek gitmez (bkz. bölüm 9). Gerçek SMS sağlayıcısı devreye alındığında aylık SMS harcaması ayrı izlenir. |

📌 VARSAYIM: Bütçe dağılımı aşağıdaki gibi planlanmıştır. Gerçek fiyatlar F0.4 adımında AWS fiyat hesaplayıcısı ve SMS sağlayıcı teklifiyle doğrulanmalıdır.

| Kalem | Ayrılan bütçe (USD/ay) |
| --- | --- |
| Uygulama sunucusu (production) | 25 |
| Yönetilen PostgreSQL (production) | 30 |
| Staging (kullanılmadığında kapalı) | 10 |
| SMS (OTP) — mock döneminde 0, gerçek sağlayıcıyla | 15 |
| Cloudflare R2, alan adı, e-posta, izleme | 10 |
| Yedek / beklenmeyen | 10 |
| **Toplam** | **100** |

**Bütçe dışı kalemler:** Apple Developer Program ve Google Play geliştirici hesabı ücretleri bu 100 USD'lik aylık altyapı bütçesine dahil değildir.

## 9. SMS gönderimi: mock ve gerçek sağlayıcı

| # | Gereksinim | Kural |
| --- | --- | --- |
| NFR-95 | SMS adaptörü | OTP gönderimi tek bir `SmsSender` arayüzünün arkasındadır. Uygulama kodu hangi sağlayıcının kullanıldığını bilmez; sağlayıcı ortam ayarıyla (`SMS_PROVIDER=mock` / gerçek sağlayıcı adı) seçilir. |
| NFR-96 | Mock gönderici | `mock` sağlayıcısı SMS göndermez ve kodu loglara yazmaz. Kodu yalnızca veritabanındaki `dev_sms_outbox` tablosuna kaydeder; bu kutu yalnızca geliştirme ve staging ortamlarında açık olan `GET /api/v1/dev/sms-outbox` uç noktasıyla görüntülenir. |
| NFR-97 | Production koruması | Production ortamında `SMS_PROVIDER=mock` ayarıyla uygulama **başlamaz** (açılışta kontrol). Böylece gerçek kullanıcıların kodlarının bir ekranda görünmesi riski ortadan kalkar. |
| NFR-98 | Gerçek sağlayıcıya geçiş | Gerçek SMS sağlayıcısı, gerçek perakendecilerin uygulamaya kaydolmasından önce (uygulama planında pilot kullanıcı kaydı adımından önce) devreye alınır. Geçiş yalnızca yeni bir adaptör ve ortam ayarıdır; uygulama kodu değişmez. |

⚠️ AÇIK SORU: Gerçek SMS sağlayıcısı hangisi olacak ve Azerbaycan numaralarına SMS başına maliyet nedir? 15 USD/ay bütçe, aylık kaç OTP gönderilebileceğini belirler. OTP hacmi, oturum süresi uzun tutularak (yenileme anahtarı 30 gün) düşük tutulur.
