# Test Stratejisi

| Alan | Değer |
| --- | --- |
| Sürüm | 1.0 |
| Tarih | 2026-10-24 |
| İlgili belgeler | [non-functional-requirements.md](../02-requirements/non-functional-requirements.md) §7 · [definition-of-done.md](../07-ai-development/definition-of-done.md) · [coding-guidelines.md](../07-ai-development/coding-guidelines.md) · [environments-cicd.md](../06-operations/environments-cicd.md) |

Kodun büyük kısmı AI ile yazılacağı için testler, "çalışıyor gibi görünen" kodu "doğru çalışan" koddan ayıran tek güvenilir araçtır. Strateji üç ilkeye dayanır:

1. **Kabul kriteri = test.** Her story'nin her AC'si en az bir otomatik testle karşılanır; test adı AC kimliğini taşır (`US-021 AC5: bekleme süresi aktifken istek reddedilir`).
2. **Önce test, sonra kod** — kritik alanlarda zorunlu: fiyat çözümleme, stok rezervasyonu, bağlantı kuralları, sepet bölünmesi, durum geçişleri, cari, kiracı izolasyonu.
3. **Testi geçirmek için test değiştirilmez.** Test yanlışsa ayrı bir commit'te ve gerekçesiyle düzeltilir.

## 1. Test seviyeleri

| Seviye | Araç | Kapsam | Nerede çalışır | Süre hedefi |
| --- | --- | --- | --- | --- |
| Birim (unit) | Vitest | Saf fonksiyonlar: `PriceResolver` çekirdeği, durum makineleri, VÖEN doğrulama, para/zaman yardımcıları, birim dönüşümü, `ConnectionPolicy` kuralları | Her commit, CI | < 30 sn |
| Entegrasyon (API) | Vitest + Supertest + gerçek PostgreSQL ve Redis (Docker / Testcontainers) | Uç nokta → servis → veritabanı; RLS dahil; mock adaptörler (SMS, push, dosya) | Her PR, CI | < 6 dk |
| Kiracı izolasyonu | Entegrasyon testleri içinde ayrı paket (`*.isolation.test.ts`) | Kiracıya bağlı her uç nokta: A işletmesi B'nin kaydını okuyamaz, değiştiremez, listede görmez | Her PR, CI | Entegrasyona dahil |
| Sözleşme | OpenAPI şema karşılaştırması + yanıt şeması doğrulaması | Uygulamanın ürettiği OpenAPI = `openapi.yaml`; her entegrasyon testi yanıtı şemaya göre doğrular | Her PR, CI | < 30 sn |
| Web uçtan uca | Playwright | Kritik akışlar (aşağıdaki E2E listesi), Chromium | `main`'e birleştirmede ve gece, staging'e karşı | < 10 dk |
| Mobil uçtan uca | Maestro | Giriş, ürün listesi → sepet → onaya gönder, teslim onayı, kargocu "teslim ettim" | Yayın öncesi, Android emülatörü | < 10 dk |
| Yük | k6 | NFR-05/07 tepe yükü ve NFR-10–16 süreleri | M6 öncesi ve büyük değişiklikte, staging | 1 saat senaryo |
| Güvenlik | Bağımlılık taraması, gizli bilgi taraması (CI); ASVS L1 kontrol listesi (elle); izolasyon paketi | Her PR (otomatik); M6 öncesi (elle) | — |
| Kabul (UAT) | Elle, senaryo kâğıtları | Pilot toptancı sahibiyle staging'de | Her milestone sonunda | — |

📌 VARSAYIM: Mobil uçtan uca testler için Maestro seçilmiştir (YAML tabanlı, Expo ile uyumlu, öğrenmesi kolay). Kurulumda sorun çıkarsa mobil E2E yayın öncesi elle kontrol listesine indirilir.

## 2. Kapsam hedefleri

| Alan | Satır kapsamı | Not |
| --- | --- | --- |
| Domain servisleri (`pricing`, `inventory`, `connections`, `cart`, `orders`, `delivery`, `ledger`) | ≥ %85 | NFR-80; CI eşik altında başarısız |
| Tüm backend | ≥ %70 | NFR-81 |
| Kiracıya bağlı uç noktalar | %100'ü için ≥ 1 izolasyon testi | NFR-82; CI kontrolü: OpenAPI'deki her `X-Business-Id` isteyen işlem için izolasyon test kaydı olmalı |
| Web ve mobil bileşenleri | Hedef yok | Mantık bileşende değil hook/servis katmanında tutulur ve orada test edilir |

Kapsam yüzdesi tek başına kalite ölçütü değildir; Müfettiş incelemesinde "AC'ler testlerle karşılanmış mı?" sorusu kapsamdan önce gelir.

## 3. Kritik alanlar için zorunlu test tabloları

### 3.1 Fiyat çözümleme (`PriceResolver`)

Tablo tabanlı testler (`pricing/price-resolver.cases.ts`). En az şu durumlar:

| # | Durum | Beklenen kaynak |
| --- | --- | --- |
| P1 | Yalnızca varsayılan liste | `default_list` |
| P2 | Bağlantıya atanmış liste + varsayılan | `price_list` |
| P3 | Müşteri fiyatı + atanmış liste | `customer_price` |
| P4 | Şube fiyatı var ama bağlantıda `branch_pricing_enabled = false` | `customer_price` veya liste |
| P5 | Şube fiyatı var ve açık | `branch_price` |
| P6 | Geleceğe tarihli fiyat (henüz geçerli değil) | Önceki fiyat |
| P7 | Kademeli indirim eşiği tam sınırda (= min_qty) | İndirim uygulanır |
| P8 | Kademeli + şube indirimi birlikte | Önce kademe, sonra şube indirimi |
| P9 | Hiçbir listede fiyat yok | `none`, sepete eklenemez |
| P10 | Farklı para birimli liste | `CURRENCY_MISMATCH` |
| P11 | Yuvarlama: birim fiyat 4 hane, satır toplamı 2 hane (bankacı değil, yarım yukarı) | Sabit beklenen değerler |

📌 VARSAYIM: Yuvarlama kuralı "yarım yukarı" (half-up), satır toplamında 2 haneye. Mali müşavirle F0.1'de teyit edilir.

### 3.2 Bağlantı kuralları (`ConnectionPolicy`)

US-021 AC1–AC7, US-022, US-023, US-025, US-026 için her AC ayrı test; ayrıca: eşzamanlı iki istek (yalnızca biri), kota gün sınırı satıcının saat diliminde (Asia/Baku 23:59 / 00:01), bekleme süresi ayarının işletme → plan → platform sırasıyla çözümlenmesi.

### 3.3 Stok ve sipariş

- Eşzamanlı onay: iki işlem aynı anda son stoğu onaylar → biri `STOCK_INSUFFICIENT` (gerçek PostgreSQL ile, paralel işlem).
- Her geçiş için stok hareketi ve sayılar: onay (reserve), iptal (release), sevk (ship).
- Durum makinesi: tablodaki her izinli geçiş başarılı, tablodaki **her izinsiz** geçiş `INVALID_STATE_TRANSITION` (geçiş tablosundan otomatik üretilen test).

### 3.4 Sepet bölünmesi

3 satıcı (biri bağlantısız, biri minimum tutar altında) → 1 sipariş oluşur, 2 grup sepette kalır; ortasında yapay hata → hiçbir sipariş oluşmaz.

### 3.5 Teslim ve cari

Otomatik onay işi: süresi dolan sipariş `delivered`, borç kaydı tek; iş iki kez çalıştırılınca tek kayıt; itiraz akışında düzeltilmiş tutar.

### 3.6 Güvenlik

- Mock SMS: `NODE_ENV=production` + `SMS_PROVIDER=mock` → uygulama başlamaz (açılış testi).
- `/api/v1/dev/*` production yapılandırmasında `404`.
- Yenileme anahtarının ikinci kullanımı → aile iptal.
- OTP hız sınırları ve kilit.
- Dizin yanıtı: gizlilik ayarı kapalı alanlar `null`; diğer bağlantı bilgisi hiçbir koşulda yok (şema testi).

## 4. Test verisi

| Kaynak | Kullanım |
| --- | --- |
| `seed` (idempotent) | Diller, birimler, para birimleri, AZ pilot bölgeleri, izinler, rol şablonları, platform ayarları, bir platform admini |
| Test fabrikaları (`test/factories`) | Her testte izole işletme, kullanıcı, ürün, bağlantı; testler birbirinin verisine güvenmez |
| Demo veri betiği (`scripts/seed-demo.ts`) | Staging'de 2 toptancı, 20 perakendeci, 500 ürün, 100 sipariş; UAT ve yük testi için |
| Gerçek pilot verisi | Yalnızca production'da; staging'e kopyalanmaz (kişisel veri) |

## 5. Uçtan uca kritik akışlar (E2E listesi)

| # | Akış | Web | Mobil |
| --- | --- | --- | --- |
| E2E-01 | Giriş (mock SMS kutusundan kod okunur) | ✔ | ✔ |
| E2E-02 | Admin toptancı açar → toptancı admini aktivasyonla girer | ✔ | — |
| E2E-03 | Perakendeci kaydolur → VÖEN girer | ✔ | ✔ |
| E2E-04 | Temsilci perakendeciyi telefonla bulur → istek → perakendeci kabul eder | ✔ | ✔ |
| E2E-05 | Toptancı Excel içe aktarır → perakendeci ürünleri kendi fiyatıyla görür | ✔ | — |
| E2E-06 | İki toptancıdan tek sepet → şube onayı → iki sipariş | ✔ | ✔ |
| E2E-07 | Toptancı kısmi onay → kargocu atanır → "teslim ettim" → perakendeci onaylar → cari borç | ✔ | ✔ |
| E2E-08 | Tahsilat girilir → bakiye sıfırlanır → ekstre PDF | ✔ | — |
| E2E-09 | Bağlantı iptali → ürünler kaybolur → sepet temizlenir | ✔ | ✔ |

## 6. Kabul testi süreci

1. Her milestone (M1–M6) sonunda staging'e demo verisiyle dağıtım yapılır.
2. Milestone'un kapsadığı story'ler için senaryo kâğıdı (AC'lerden üretilir; az/ru) hazırlanır.
3. Platform sahibi senaryoları kendisi yürütür; M3'ten itibaren pilot toptancı sahibi de katılır.
4. Bulgular "hata" (AC karşılanmıyor) ve "istek" (yeni ihtiyaç) olarak ayrılır. Hatalar milestone kapanmadan düzeltilir; istekler backlog'a gider (roadmap §3).
5. Milestone, tüm senaryolar geçince ve kritik hata kalmayınca kapanır.

## 7. Yayın öncesi kontrol listesi (her production dağıtımı)

- [ ] CI yeşil: lint, tip, birim, entegrasyon, izolasyon, sözleşme, kapsam eşikleri, bağımlılık ve gizli bilgi taraması
- [ ] Staging'de E2E (web) yeşil
- [ ] Migration'lar staging'de uygulandı ve geri alma adımı denendi
- [ ] OpenAPI değişikliği kırıcı değil (veya `/api/v2` ile)
- [ ] Mobil için: minimum sürüm değişikliği gerekiyorsa `app-config` güncellendi
- [ ] CHANGELOG güncel
- [ ] Production yapılandırması: `SMS_PROVIDER` ≠ `mock`; dev uçları kapalı
- [ ] Dağıtım iş saatleri dışında veya düşük trafik saatinde (önerilen: Asia/Baku 20:00 sonrası)
- [ ] Geri dönüş adımı (RB-03) hazır

### Ek: M6 (ilk production yayını) öncesi

- [ ] Yük testi NFR-10–16 hedeflerini karşıladı (rapor `docs/reports/load-test-<tarih>.md`)
- [ ] ASVS L1 kontrol listesi ve [threat-model.md](../03-architecture/threat-model.md) önlemleri tek tek işaretlendi
- [ ] Yedekten geri yükleme provası yapıldı (RB-08)
- [ ] Alarmlar test edildi (bilinçli hata ile)
- [ ] Gerçek SMS sağlayıcısıyla en az 5 farklı Azerbaycan operatörü numarasına test OTP'si
- [ ] az, ru, tr çeviri eksik anahtar raporu boş
