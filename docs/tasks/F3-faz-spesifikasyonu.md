# F3 — Katalog, fiyat ve stok: faz spesifikasyonu

| Alan | Değer |
| --- | --- |
| Hazırlayan | Mimar |
| Tarih | 2026-11-16 |
| Dayanak | `docs/07-ai-development/implementation-plan.md` F3 (F3.1–F3.14) · `docs/05-planning/backlog.md` F3 tablosu · `docs/05-planning/roadmap.md` M3 |
| Milestone | **M3 — Katalog ve fiyat** |
| Önceki faz | F2 bitti (PR #35–#73, son migration `0031`). Açık kalanlar §5'te. |

M3 çıkış ölçütü (roadmap.md): toptancı Excel'den 2.000 ürünü içe aktarır; perakendeci yalnızca bağlı toptancıların ürünlerini kendi fiyatıyla 3 dilde görür ve arar; fiyat çözümleme test tablosu (P1–P11) yeşil. Kapsanan story'ler: US-028–US-039 ve US-045 AC2 (favoriler). US-039 AC2–AC5 (rezervasyon, sevk, iptal) F4.4'tedir.

Bu belge kod içermez. Her adımın görev kartı (`docs/tasks/<ID>.md`) adıma gelince yazılır.

## 0. Başlamadan önce: ön koşullar

| Eksik | Neden önemli | Ne yapılacak |
| --- | --- | --- |
| **`categories` tablosu yok ve başlangıç kategori listesi belgede yok** | `products.category_id` zorunlu. Kategori olmadan ürün açılamaz (F3.3), Excel içe aktarma kategori adını eşleyemez (F3.5). | **Çözüldü:** liste onaylandı ([taslak-kategori-listesi.md](F3-seed-listeleri.md)); depoda `docs/tasks/F3-seed-listeleri.md` olur, seed F3.2a'da. |
| **Marka başlangıç listesi yok** | Marka ürün formunda isteğe bağlı (`brand_id` null olabilir), bu yüzden engel değil. Pilot toptancıların markaları Excel içe aktarmada "marka talebi" olarak düşer. | F3.2'de boş başlar; admin onaylar. Engel değil. |
| **F0.2 çıktısı yok** (`docs/reports/pilot-workshop.md` ve örnek Excel dosyaları) | F3.5 kabul ölçütü: "F0.2'deki gerçek örnek dosya şablona dönüştürülüp içe aktarılabiliyor". | Karar S4. |
| **F0.1 çıktısı yok** (`docs/reports/accounting-notes.md`) | Yuvarlama kuralı ("yarım yukarı", test-strategy §3.1 VARSAYIM) ve ƏDV oranının düzeyi mali müşavirle teyit edilmedi. | F3.6 VARSAYIM'ı uygular; ƏDV için karar S2. Engel değil. |
| **Kiril/Latin eş anlamlı listesi yok** (US-032 AC3: "шампунь" / "şampun") | Arama indeksi bu listeyle kurulur. | Mimar pilot kategori (kozmetik, saç bakım) için 3 dilde taslak çıkarır; F3.12a kartında. Engel değil. |

## 1. Adımlar

"Tahmin" ve "Bağımlılık" backlog.md'den aynen alınmıştır. "Bölme" Mimar önerisidir (elle yazılmış diff ~2.000 satır sınırı, H7); adıma gelince kesinleşir ve implementation-plan.md'ye "Bölündü" notu eklenir.

| ID | Ne yapar (bir cümle) | Tahmin | Bağımlılık | Müfettiş | Bölme önerisi |
| --- | --- | --- | --- | --- | --- |
| F3.1 | Platform admini birim kataloğunu (`units`) ve dönüşüm oranlarını (`unit_conversions`) yönetir; 19 başlangıç birimi seed | S | F1.3 | Önerilir (ilk katalog G tabloları, platform yazması) | — |
| F3.2 | Kategori ağacı (en çok 3 seviye), marka, faaliyet alanı yönetimi; toptancının marka talebi | M | F1.3 | **Zorunlu** (F3.2a: kiracının G tablosuna "talep" yazması) | **F3.2a** (API + migration + seed) · **F3.2b** (admin ekranları) |
| F3.3 | Ürün, varyant, ambalaj seviyeleri, görünürlük kuralı; `draft` → `active` yayın | L | F3.1, F3.2, F2.6 | **Zorunlu** (F3.3a: dört yeni T tablosu, RLS, izolasyon) | **F3.3a** (API + migration) · **F3.3b** (web ürün listesi ve formu) |
| F3.4 | Ürün görselleri; worker 200/800/1600 px küçültür; ürün başına en çok 8 | M | F3.3, F1.10 | Önerilir (dışarıdan gelen dosyanın işlenmesi) | Gerekirse **F3.4a** (API + iş) · **F3.4b** (web yükleyici) |
| F3.5 | Excel ile ürün içe aktarma: şablon, arka planda doğrulama, önizleme, 500'lük partilerle uygulama, rapor | L | F3.3 | **Zorunlu** (F3.5a: worker'da kiracı bağlamı, dış dosya, toplu yazma) | **F3.5a** (`imports` modülü + API + worker) · **F3.5b** (web sihirbazı) |
| F3.6 | Fiyat listeleri ve `PriceResolver` (önce test: P1–P11); fiyat kaynağı açıklaması; bağlantıya liste atama | L | F3.3, F2.14 | **Zorunlu** (para, en kritik test alanı) | **F3.6a** (tablolar + `PriceResolver` + API) · **F3.6b** (web fiyat ekranları) |
| F3.7 | Müşteriye özel fiyat; Excel ile toplu yükleme (`customer_prices` türü) | M | F3.6, F3.5 | **Zorunlu** (para; satıcı tablosunda `buyer_id`) | Gerekirse **F3.7a** (API + içe aktarma türü) · **F3.7b** (web ekranı) |
| F3.8 | Şube fiyatı (bağlantıda açılır) ve şube indirimi (tümü / marka / kategori) | M | F3.7, F2.5 | **Zorunlu** (para; toptancı perakendecinin şubelerini okur) | Gerekirse **F3.8a** (API) · **F3.8b** (web ekranları) |
| F3.9 | Kademeli fiyat (ör. 10 koli ve üstü −%3) | S | F3.6 | Önerilir (para; P7, P8) | — |
| F3.10 | Stok modu ayarı (`none` / `availability`) ve varyantta var/yok işareti | S | F3.3 | Önerilir | — |
| F3.11 | Miktarlı stok: `stock`, yalnızca ekleme yapılan `stock_movements`, mal girişi ve sayım düzeltmesi; Excel `stock` türü | M | F3.10 | **Zorunlu** (F3.11a: silinmez kayıt, eşzamanlılık, depo kapsamı) | **F3.11a** (API + migration + içe aktarma türü) · **F3.11b** (depo ekranı web + mobil) |
| F3.12 | Ürün arama indeksi; perakendecinin ürün listesi ve filtreleri (web + mobil) | L | F3.6, F3.11 | **Zorunlu** (F3.12a: başka kiracının ürününü okuma, fiyat sızıntısı) | **F3.12a** (indeks + tüketici + `buyer_visible_products` + `GET /browse/products`) · **F3.12b** (web liste + E2E-05) · **F3.12c** (mobil liste) |
| F3.13 | Mobilde kamerayla barkod arama (`gtin`) | S | F3.12 | Gerekmez (ekran; `gtin` filtresi F3.12a'da incelenir) | — |
| F3.14 | Favoriler ve "Favorilerim" filtresi | S | F3.12 | Önerilir (yeni T tablosu: `buyer_id`) | — |

"Müfettiş Zorunlu" dayanağı: `review-guide.md` §4 riskli yollar (migration, RLS, yetki, para, stok), `definition-of-done.md` §5. "Önerilir" Mimar önerisidir. Model: Zorunlu ve yüksek riskli kartlar Opus; ekran kartları ve belge işleri Sonnet (H10).

Toplam: 14 adım, bölmelerle yaklaşık 22–25 PR.

## 2. Önerilen sıra

Hedef: en kısa yoldan M3 akışına (E2E-05: toptancı Excel içe aktarır, perakendeci ürünleri kendi fiyatıyla görür) ulaşmak. Düşük riskli adımlarda plan incelemesi yok (2026-10-30 kullanıcı kararı).

| # | Kart | Risk | Plan incelemesi | Bağımlılık |
| --- | --- | --- | --- | --- |
| 1 | F3.1 birim kataloğu | normal | gerekmez | — |
| 2 | F3.2a kategori, marka, faaliyet alanı API; marka talebi | yüksek | gerekli | S1, S3 kararı |
| 3 | F3.2b admin katalog ekranları | normal | gerekmez | F3.2a |
| 4 | F3.3a ürün, varyant, ambalaj API | yüksek | gerekli | F3.1, F3.2a |
| 5 | F3.3b web ürün listesi ve formu | normal | gerekmez | F3.3a |
| 6 | F3.4 ürün görselleri | normal | gerekmez | F3.3a |
| 7 | F3.6a fiyat listeleri + `PriceResolver` | yüksek | gerekli | F3.3a; S2 kararı |
| 8 | F3.6b web fiyat ekranları | normal | gerekmez | F3.6a |
| 9 | F3.5a Excel içe aktarma (`imports`) | yüksek | gerekli | F3.3a, F3.6a; S4 |
| 10 | F3.5b web içe aktarma sihirbazı | normal | gerekmez | F3.5a |
| 11 | F3.7 müşteri fiyatı (a/b gerekirse) | yüksek | gerekli | F3.6a, F3.5a |
| 12 | F3.9 kademeli fiyat | normal | gerekmez | F3.6a |
| 13 | F3.10 stok modları 0–1 | normal | gerekmez | F3.3a |
| 14 | F3.11a miktarlı stok API | yüksek | gerekli | F3.10; S5 kararı |
| 15 | F3.11b depo ekranı (web + mobil) | normal | gerekmez | F3.11a |
| 16 | F3.8 şube fiyatı ve şube indirimi (a/b gerekirse) | yüksek | gerekli | F3.7 |
| 17 | F3.12a arama indeksi + `GET /browse/products` | yüksek | gerekli | F3.6a, F3.11a |
| 18 | F3.12b web ürün listesi + E2E-05 | normal | gerekmez | F3.12a |
| 19 | F3.12c mobil ürün listesi | normal | gerekmez | F3.12a |
| 20 | F3.13 barkod tarama | normal | gerekmez | F3.12c |
| 21 | F3.14 favoriler | normal | gerekmez | F3.12a |

Sıranın gerekçesi:

1. **F3.6a, F3.5'ten öne alındı.** Excel şablonunda "fiyat" sütunu var (US-031 AC1); fiyatın yazılacağı fiyat listesi tabloları F3.6'da geliyor. backlog.md bağımlılıklarıyla çelişmez (F3.5 → F3.3; F3.6 → F3.3, F2.14). Şablondaki "stok" sütunu için bkz. V3.
2. **F3.8 arkaya alındı.** Öncelik "Should"; M3 akışını engellemez. F3.12a'dan önce biterse `PriceResolver` tüm kaynaklarla (P4, P5, P8) bir kerede bağlanır.
3. F3.13 ve F3.14 küçük ve bağımsızdır; F3.12'den sonra herhangi bir sırada yapılabilir.
4. **F2.16b önerisi** (yükleme artıkları temizliği, §5) F3.4 ile F3.5a arasına konabilir; F3.5a zaten "24 saat onaylanmayan önizleme silinir" (SF-08) için aynı zamanlanmış iş altyapısını kullanır.

## 3. Riskli noktalar

Numaralar F2 spesifikasyonundan devam eder (R15–R25 orada).

| # | Risk | Adım | Önlem |
| --- | --- | --- | --- |
| R26 | **Perakendeci başka kiracının ürününü okur.** `products` satıcının T tablosudur; perakendeci yalnızca aktif bağlantılı satıcının `active` ürününü görmelidir. Fazın en büyük sızıntı riski. | F3.12a, F3.13, F3.14 | Yalnızca `buyer_visible_products` fonksiyonu (`SECURITY DEFINER`: sahibinin yetkisiyle çalışan veritabanı fonksiyonu; T3 kuralları) üzerinden; aktif bağlantı + ürün `active` + görünürlük kuralı aynı fonksiyonda. Dönen alan listesi sabit (şema testi). İzolasyon testi: bağlantısı olmayan satıcının ürünü hiçbir filtre, `gtin` veya favori yoluyla dönmez. |
| R27 | **Arama indeksi ortak.** Meilisearch tek `products` indeksinde tüm satıcıların ürününü tutar; indeks veritabanından geride kalabilir (bağlantı iptali, ürün arşivi). | F3.12a | Satıcı filtresi sunucuda, bağlantılardan üretilir; istemciden gelen `sellerId` yalnızca bu kümeyi daraltır. İndeksten dönen kimlikler veritabanında yeniden doğrulanır. Fiyat indekse yazılmaz. `search:reindex` komutu ürünleri de kapsar. |
| R28 | **Fiyat yanlış hesaplanır.** `PriceResolver` siparişe kopyalanacak fiyatın tek kaynağıdır (ADR-0019). | F3.6a, F3.7, F3.8, F3.9 | Önce test (P1–P11 tablosu, `price-resolver.cases.ts`); saf fonksiyon çekirdeği; para `numeric` + `decimal.js`; yuvarlama "yarım yukarı" sabit beklenen değerlerle; kademe sınırı tam eşitlikte (P7). |
| R29 | **Geleceğe tarihli fiyat ve saat dilimi.** Yeni fiyat toptancının saat diliminde 00:00'da geçerli olur (US-034 AC6). | F3.6a | `Clock` + `FixedClock`; Asia/Baku 23:59 / 00:01 sınır testi (F2.12a kota testiyle aynı kalıp). |
| R30 | **Bir perakendeci başkasının fiyatını görür.** `customer_prices`, `branch_discounts` satıcının tablosudur ama `buyer_id` taşır. | F3.7, F3.8, F3.12a | Perakendeci bu tabloları doğrudan okumaz; yalnızca kendi `buyer_id` + `branch_id` ile çözülmüş fiyatı alır. İzolasyon testi: A perakendecisi B'nin özel fiyatını hiçbir yolla alamaz. Fiyat yalnızca aktif bağlantıya yazılır (US-035 AC1). |
| R31 | **Toptancı perakendecinin şubelerini okur** (şube fiyatı ve indirimi için). `branches` perakendecinin T tablosudur. | F3.8 | Yalnızca aktif bağlantıda, yalnızca şube adı ve bölgesi; D fonksiyonu (F2 ortak kural 4). `feature.branch_pricing` plan hakkı `EntitlementService` ile kontrol edilir. |
| R32 | **Excel dosyası dışarıdan gelir.** Bozuk veya aşırı büyük dosya worker'ı kilitleyebilir; worker'da istek yok, kiracı bağlamı işten kurulmalı. | F3.5a | Boyut ve satır sınırı ayardan (`files.xlsx_max_mb`, satır sınırı yeni ayar); hücre formülleri değer olarak okunur, çalıştırılmaz; her parti `withTenantTx(job.seller_id)`; SKU ile güncelleme tekrar çalıştırılabilir (SF-08); hata raporunda başka kiracının verisi olmaz. |
| R33 | **5.000 satır 2 dakikada** (US-031 AC5). | F3.5a | 500'lük partiler, toplu ekleme; sentetik 5.000 satır dosyayla süre ölçümü (entegrasyon). İndeks güncellemesi outbox ile, uygulama süresine dahil değil. |
| R34 | **Görsel işleme.** `sharp` dışarıdan gelen görseli açar; çok büyük piksel boyutu belleği tüketebilir. | F3.4 | Piksel sınırı; dosya imzası denetimi F1.10'daki gibi; iş başarısız olursa görsel "hazır değil" kalır, ürün yine kaydedilir. Yerelde ve CI'da disk deposu (ADR-0023) aynı arayüzle çalışır. |
| R35 | **Stok yalnızca hareketle değişir** (ADR-0018). `stock_movements` güncellenmez, silinmez. | F3.11a | Tabloda `UPDATE`/`DELETE` izni yok + bekçi testi; `stock` yalnızca `StockService` içinde, hareketle aynı işlemde değişir; `reserved ≤ on_hand` kısıtı; satır kilidi (`FOR UPDATE`) ile eşzamanlı iki mal girişi testi. Rezervasyon F4.4'te. |
| R36 | **Depo kapsamı.** `inventory.manage` izni `warehouse` kapsamı taşır; depo sorumlusu yalnızca kendi deposunda işlem yapmalı. | F3.11a | Kapsam denetimi servis katmanında + test (başka depoya mal girişi `403`). |
| R37 | **Kiracı G tablosuna yazar.** Marka talebi (`brands.status = requested`) platformun genel tablosuna toptancıdan satır ekler. | F3.2a | Yalnızca `SECURITY DEFINER` talep fonksiyonu; durum her zaman `requested`; talep edilen marka onaylanana kadar yalnızca talep eden toptancıya görünür (V5); hız sınırı ayardan. |
| R38 | **Kullanılan katalog kaydı silinemez** (US-028 AC3); kategori derinliği ≤ 3. | F3.1, F3.2a | Silme ucu yok, yalnızca pasifleştirme; derinlik veritabanı kısıtı + tetikleyici; pasif kayıt yeni üründe seçilemez, eski üründe görünmeye devam eder. |
| R39 | **Platform admini fiyat ve stok yazamaz** (US-016 AC5, F2 R25). | F3.3a, F3.6a, F3.11a | Yeni T tablolarına platform yazma politikası verilmez; `check-rls` yasak listesine eklenir. |
| R40 | **Perakendeci silme/arşivleme işlevleri yeni tabloları bilmiyor.** `business_purge_rows` (0030) `buyer_id` taşıyan yeni tablolarda (`customer_prices`, `branch_discounts`, `favorites`) FK'ya takılırsa gece işi o partide durur. | F3.7, F3.8, F3.14 | Her tablo geldiği PR'da silme listesine eklenir; test: özel fiyatı ve favorisi olan arşivli perakendeci temizlenebiliyor. Bkz. §5. |
| R41 | **PR boyutu.** Katalog ve fiyat ekranları büyüktür (çok dilli form, ambalaj seviyeleri). | F3.3b, F3.6b, F3.12b | a/b/c bölmeleri §1'de; Usta planında satır tahmini verir. |

## 4. Açık sorular

### 4.1 Platform sahibinin kararı gerekenler

| # | Soru | Seçenekler | Mimar önerisi | Ne zaman |
| --- | --- | --- | --- | --- |
| S1 | **Başlangıç kategori listesi** (belgede yok; ürün için zorunlu) | **A)** Mimar pilot kategori (kozmetik, saç bakım) için en çok 3 seviyeli taslağı 4 dilde çıkarır, platform sahibi onaylar. Artı: hızlı, F2'deki bölge listesiyle aynı yol. Eksi: pilot toptancıların gerçek sınıflamasıyla tam örtüşmeyebilir, sonra düzeltilir. **B)** Platform sahibi listeyi pilot toptancılardan alıp verir. Artı: gerçek veriye dayanır. Eksi: F3.2 liste gelene kadar bekler. | **Karar (platform sahibi, 2026-11-16): A.** Liste onaylandı (2026-11-16): [taslak-kategori-listesi.md](F3-seed-listeleri.md) | F3.2a öncesi |
| S2 | **ƏDV (KDV) oranı nerede tutulur?** productreport "ƏDV oranı ürün kategorisine göre ayarlanabilir" diyor; data-model `price_lists.vat_rate` ile liste düzeyinde tek oran varsayıyor (📌 VARSAYIM). **Belgeler farklı.** | **A)** Liste düzeyinde tek oran (data-model). Artı: basit, sözleşme hazır, pilot için yeterli (kozmetikte tek oran). Eksi: aynı listede farklı oranlı ürün olursa ayrı liste gerekir. **B)** Ürün (veya kategori) bazında oran. Artı: karışık ürün gamına uyar. Eksi: yeni kolon, daha büyük `PriceResolver`, sözleşme ve test değişir; mali müşavir görüşü (F0.1) yok. | **Karar (platform sahibi, 2026-11-16): A.** İhtiyaç çıkarsa `products.vat_rate` sonradan eklenir; productreport cümlesi F3.6a PR'ında data-model ile eşitlenir | F3.6a |
| S3 | **Toptancının "kategorileri"** (US-023 AC1: perakendeci isteği açınca toptancının kategorilerini görür; veri modelinde alan yok, F2.13a'da boş bırakıldı) | **A)** Otomatik: toptancının `active` ürünlerinin üst kategorileri. Artı: toptancı ek iş yapmaz, her zaman güncel. Eksi: ürünü olmayan yeni toptancıda boş görünür. **B)** Toptancı profilinde elle seçer. Artı: ilk günden dolu. Eksi: yeni tablo ve ekran; ürünlerle tutarsız kalabilir. | **Karar (platform sahibi, 2026-11-16): A** | F3.3a (alan F3.3a'da dolar) |
| S4 | **Gerçek örnek Excel dosyası** (F3.5 kabul ölçütü; F0.2 çıktısı yok) | **A)** Platform sahibi pilot toptancıdan bir ürün dosyası alır, müşteri adlarını silip proje dosyalarına yükler; Mimar şablona eşler. Artı: gerçek sütun adları ve hatalar görülür. Eksi: dosya gelene kadar F3.5b kabulü açık kalır. **B)** Kabul ölçütü pilot öncesine (F7) ertelenir; F3.5 sentetik dosyayla kabul edilir. Artı: F3 beklemez. Eksi: gerçek dosyadaki sürprizler geç görülür. | **Karar (platform sahibi, 2026-11-16): B.** F3.5 yapay 5.000 satırlık dosyayla kabul edilir; gerçek dosya gelince ayrıca denenir (dosya depoya girmez, yalnızca proje dosyalarına) | F3.5a |
| S5 | **Miktarlı stoğa geçiş** (ADR-0018: "mod değişikliğinde başlangıç sayımı gerekir"; nasıl olacağı belgede yok). Toptancı `quantity` moduna geçtiği anda tüm ürünlerin stoğu 0'dır. | **A)** Geçiş hemen olur; stoğu girilmemiş ürün perakendecide "Stokta yok" görünür; ekranda açık uyarı ve "Excel ile stok yükle" bağlantısı. Artı: basit, kural tek. Eksi: toptancı sayımı girmeden geçerse ürünleri sipariş edilemez olur. **B)** Geçiş iki adımlı: toptancı önce stok girer (Excel veya elle), sonra "miktarlı stoğu etkinleştir" der; o ana kadar eski mod geçerli. Artı: ürünler bir an bile kapanmaz. Eksi: ek durum ve ekran. | **Karar (platform sahibi, 2026-11-16): B** (iki adımlı; durumun veri modelindeki yeri F3.11a planında, data-model önce) | F3.11a |

### 4.2 Mimar varsayımları (itiraz yoksa böyle uygulanır)

| # | Konu | Varsayım | Adım |
| --- | --- | --- | --- |
| V1 | "Daha önce aldıklarım" filtresi (US-032 AC2) sipariş tablolarına dayanır; siparişler F4'te gelir. | F3.12'de parametre sözleşmede durur ama ekranda gösterilmez; F4.6'da bağlanır. implementation-plan.md F3.12 ve F4.6'ya not. | F3.12 |
| V2 | productreport'taki "kampanyalı" ve "satış birimi" filtreleri US-032'de yok. | Kapsam dışı (ADR-0019: MVP'de kampanya yok). | F3.12 |
| V3 | Ürün şablonundaki "fiyat" ve "stok" sütunları (US-031 AC1). | "fiyat" varsayılan fiyat listesine yazılır (F3.6a önce biter). "stok" sütunu şablonda durur; F3.11a'ya kadar yok sayılır ve önizlemede "stok sütunu henüz uygulanmıyor" notu çıkar. F3.11a'dan sonra: `quantity` modunda varsayılan depoya sayım düzeltmesi, `availability` modunda 0 = yok, 0'dan büyük = var, `none` modunda yok sayılır. | F3.5a, F3.11a |
| V4 | Marka adı: US-029 AC1 "4 dilde ad" diyor, data-model `brands.name text` (tek ad). | Marka özel addır, tek metin (data-model geçerli); kategori ve faaliyet alanı 4 dilde. | F3.2a |
| V5 | Onay bekleyen marka. | Talep eden toptancı ürününü o markayla `draft` kaydedebilir; marka onaylanmadan ürün yayınlanamaz; reddedilirse ürünün markası boşalır ve toptancıya bildirim gider. | F3.2a, F3.3a |
| V6 | Birden çok depoda stok: perakendeciye hangi sayı gösterilir? | Aktif depoların satılabilir stok toplamı; "Son X" eşiği `seller_profiles.low_stock_display_threshold` (varsayılan 5). Siparişin hangi depodan düşeceği F4.4 konusu. | F3.11a, F3.12a |
| V7 | Fiyatı olmayan ürün yayınlanabilir mi? | Evet; perakendecide "fiyat yok" görünür, sepete eklenemez (US-034 AC4). | F3.3a, F3.12a |
| V8 | Görünürlük kuralındaki bölge (`product_visibility.region_id`) hangi bölgeyle karşılaştırılır? | Perakendeci işletmesinin bölgesi (`businesses.region_id`). | F3.3a, F3.12a |
| V9 | "Yeni eklenenler" filtresi kaç gün? | Yeni ayar `catalog.new_product_days`, varsayılan 30 (US-017 tablosuna eklenir). | F3.12a |
| V10 | Perakendeci yanıtındaki fiyat kaynağı (`ResolvedPrice.source`). | Sözleşmedeki gibi kalır; perakendeci yalnızca kendi fiyatının kaynağını görür, başka liste adı veya başka müşterinin fiyatı dönmez. | F3.12a |
| V11 | Ürün sayısı plan sınırı. | Yok (hak kaydında `products.max` anahtarı yok); eklenmez. | F3.3a |

Kullanıcı kararı bekleyen eski notlar (değişmedi): az/ru/tr çevirilerinin onayı (F3'ün her ekranı yeni taslak anahtar ekler), F1.8a şablon eşlemesindeki 7 fark.

## 5. F2'den taşınan notlar ve kapsam dışı

| Not | Adım |
| --- | --- |
| **`business_has_history` ve `business_purge_rows`** (migration 0030, F2.17/F2.18): "geçmiş" listesi tek yerdedir; F3'te `buyer_id` taşıyan her yeni tablo (`customer_prices`, `branch_discounts`, `favorites`) silme listesine aynı PR'da eklenir (R40). F3'te "geçmiş" tanımına yeni tablo girmez: sipariş, belge ve cari F4–F5'te eklenecek. Müfettiş 24 notu: tek hatalı satır gece işinin partisini durdurur, bu yüzden test zorunlu. | F3.7, F3.8, F3.14 |
| **`archive.point_1` metni** (F2.18b admin "Perakendeciler" penceresi): "geçmiş" bugün bağlantı, istek ve engel demek. Metin F3'te değişmez; sipariş ve cari geldiğinde (F4–F5) güncellenecek. F3'te yalnızca şu kontrol edilir: arşivlenen perakendecinin özel fiyatları ve favorileri temizleniyor mu. | F3.7, F3.14; metin F4–F5 |
| **Satıcı kategorisi** (F2.13a K3: US-023 AC1 "kategoriler" alanı boş dönüyor) | S3 kararı; F3.3a'da toptancı özetine eklenir |
| **F2.16b önerisi** (S9): `<işletme>/upload/` geçici dosya artıkları, `pending` dosyalar ve silinen işletmelerin depo kalıntısı (F2.17 K8). F3.4 ve F3.5 yükleme sayısını artırır. | Ayrı küçük kart; öneri: F3.4'ten sonra, F3.5a'dan önce. implementation-plan.md'ye eklenmesi gerekir. |
| `seller_profiles.default_price_list_id` FK'sı (ai-context: "F3") ve `connections.price_list_id` FK'sı; bağlantı koşullarında fiyat listesi seçimi (F2.14'te `null` bırakıldı) | F3.6a |
| `seller_profiles.stock_mode` ayar ekranı (F2.6'da "stok modu F3") | F3.10 |
| `ConnectionCancelledHandler` kancası (F2.15): bağlantı iptal olunca ürünler perakendecide kaybolur (E2E-09). F3'te ek iş gerekmez: görünürlük aktif bağlantıya bakar (R26). Sepet temizliği F4.1. | F3.12a (test) |
| F2.5 S1 kuralının depoya uygulanması (admin olmayan yönetici yalnız kendi deposu) henüz karar bekliyor; depo ekranı F3.11b'de gelir. | F3.11 kartında sorulur |
| `features/team` başka feature'lardan içe aktarıyor (ai-context notu) | İlk web ekran kartında (F3.2b) ortak yere taşınabilir; ayrı iş değil |
| `ai-context.md` 15 KB sınırını aşıyor (≈50 KB, H12) | F3.1'den önce ayrı belge PR'ı (Sonnet) |
| Müfettiş küçük notları (#53–#73) | İlgili ekranlara dokunan kartlarda; F3'e özel olan yok |
| Mobil ekranlar Expo Go'da denenmedi (F2 mobil ekranları) | Kullanıcı; F3.12c ve F3.13 gerçek cihaz ister |

Kapsam dışı (F3'te yok): rezervasyon, sevk düşümü, iptalde geri bırakma (US-039 AC2–AC5 → F4.4, F4.5); sepette kademe fiyatının gösterimi (US-037 AC1'in sepet kısmı → F4.1; F3.9 yalnızca tanım ve `PriceResolver`); tekrar sipariş (US-045 AC1 → F4.8); kampanya; lot bazlı stok (Faz 2); `sync` stok modu (1C, Faz 3); "daha önce aldıklarım" filtresi (V1).

## 6. Ortak kurallar (F3 ekleri)

F1 ve F2 faz spesifikasyonlarının §6'sı geçerlidir. F3'te eklenenler:

1. **Fiyat yalnızca `PriceResolver`'dan gelir.** Hiçbir uç fiyatı kendisi hesaplamaz; istemciden gelen fiyat veya toplam yok sayılır.
2. **Fiyat satış birimi başınadır** (`packaging_id`); miktar ve stok temel birimde tutulur (`numeric(14,3)`), dönüşüm `base_qty` ile.
3. **Para metin olarak taşınır** (sözleşmede `Decimal` / `Money`); `number` yok. Birim fiyat 4, satır toplamı 2 hane.
4. **Perakendeci satıcı tablolarını doğrudan okumaz**: yalnızca `buyer_visible_products` ve `PriceResolver` üzerinden. Dönen alan listesi şema testiyle sabittir.
5. **Çok dilli içerik** `jsonb` (ADR-0007): admin 4 dilde girer (az, ru, tr, en); gösterimde sıra kullanıcı dili → işletme dili → az (US-030 AC4), tek ortak yardımcı.
6. **Katalog G tabloları** silinmez, pasifleştirilir; yazma yalnızca platform admin uçlarından.
7. **Yeni süre, sınır ve eşikler ayara** (`import.max_rows`, `catalog.new_product_days`, görsel ve dosya sınırları): US-017 tablosu ve `packages/shared/src/settings.ts` aynı PR'da.
8. **Worker işleri** (içe aktarma, görsel küçültme, indeksleme) kiracı bağlamını iş verisindeki işletmeden kurar; iş verisinde kişisel veri ve fiyat taşınmaz, yalnızca kimlikler.
9. **Yeni `buyer_id` taşıyan tablo** → `business_purge_rows` aynı PR'da güncellenir (R40).

## 7. ADR ve belge uyumu

ADR'lerle çelişen bir F3 adımı bulunmadı. Uyum notları:

| Konu | Durum |
| --- | --- |
| ADR-0019 (fiyat sırası) ↔ US-034 AC2–AC3 ↔ test-strategy P1–P11 | Aynı. |
| ADR-0018 (stok modları) ↔ US-038, US-039 | Aynı; mod geçişinin nasıl yapılacağı ADR'de "bedel" olarak geçiyor, kural yok → S5. |
| ADR-0011 (Meilisearch + BullMQ), ADR-0010 (outbox) | F3.12a aynı kalıbı kullanır (F2.11a dizin tüketicisi örnek). |
| ADR-0007 (4 dilde içerik) ↔ `brands.name text` | Çelişki değil, belge farkı → V4. |
| ADR-0023 (yerel disk deposu) | F3.4 ve F3.5 depoya yalnızca depo arayüzünden erişir. |
| productreport "ƏDV kategoriye göre" ↔ data-model `price_lists.vat_rate` | **Belge farkı** → S2. |
| US-031 AC1 (şablonda fiyat ve stok) ↔ adım sırası | Sıra değişikliği (§2) ve V3 ile çözülür. |
| US-032 AC2 "daha önce aldıklarım" ↔ F3.12 | F3'te karşılanamaz → V1. |

## 8. F3 için gereken belge güncellemeleri

1. `implementation-plan.md` F3 adımlarına "Bölündü" notları; F3.5/F3.6 sıra notu; F2.16b satırı; F3.12 ve F4.6'ya V1 notu.
2. `openapi.yaml` (sözleşme önce, kırıcı değişiklik yok): `/admin/catalog/{kind}` gövdeleri bugün boş nesne, tür başına şema yazılmalı (F3.1, F3.2a); birim dönüşümü ve marka talebi onay/red uçları; fiyat listesi güncelleme/arşiv, şube indirimi bitirme, kademe okuma, müşteri fiyatı silme, stok hareketi listesi uçları ilgili kartlarda eklenir.
3. `data-model.md`: S2, S3, S5 kararlarının sonucu; `product_images` boyut bilgisi; V9 ayarı.
4. `user-stories.md` US-017 ayar tablosu: yeni anahtarlar (§6 madde 7).
5. `docs/tasks/F3-seed-listeleri.md`: onaylı kategori listesi (S1) ve eş anlamlı listesi.
6. Bu belgenin kopyası `docs/tasks/F3-faz-spesifikasyonu.md` olarak depoya (belge PR'ı, Müfettiş gerekmez).
