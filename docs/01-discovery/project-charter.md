# Proje Tüzüğü (Project Charter)

| Alan | Değer |
| --- | --- |
| Proje | Azerbaycan B2B Toptan–Perakende Sipariş Platformu |
| Sürüm | 1.0 |
| Tarih | 2026-10-24 |
| Sahip | Platform kurucusu (tek kişi; ürün, mimari ve geliştirme sorumlusu) |
| Kaynak belge | `docs/product-report.md` (Sistem Analiz Raporu v4, onaylanmış) |

## 1. Problem

Azerbaycan'da toptancılar ile perakendeciler (pilot kategoride kozmetik dükkanları) arasındaki sipariş süreci bugün telefon, WhatsApp ve Excel ile yürüyor. Bu durum şu sorunları doğurur:

1. Siparişler dağınık kanallardan gelir; kayıt, takip ve hata kontrolü elle yapılır.
2. Her perakendeciye özel fiyatlar Excel'de tutulur; yanlış fiyat uygulanma riski yüksektir.
3. Stok bilgisi perakendeciye ulaşmaz; stokta olmayan ürün sipariş edilir ve iptal edilir.
4. Teslimat ve cari (borç/alacak) takibi teslim kanıtına dayanmaz; anlaşmazlık çıkar.
5. Toptancı, hizmet bölgesindeki potansiyel müşterileri sistematik olarak bulamaz.

## 2. Çözüm özeti

Çok kiracılı (multi-tenant) bir B2B SaaS platformu:

- Toptancıyı yalnızca platform admini açar; perakendeci kendisi kaydolur.
- Bağlantıyı her zaman toptancı başlatır; perakendeci yalnızca bağlı toptancıların ürünlerini görür.
- Perakendeci tek sepette birden fazla toptancıdan sipariş verir; sepet şube admini onayından geçer ve toptancı başına ayrı siparişlere bölünür.
- Toptancıya özel fiyat önceliği, stok modu, teslimat ve cari takibi.
- Platform sahibi (SaaS sağlayıcı) gelirini toptancı aboneliğinden elde eder; perakendecinin temel kullanımı ücretsizdir.

Platformda online ödeme ve e-qaimə entegrasyonu **yoktur** (bkz. ADR'ler, `04-decisions/`).

## 3. Ölçülebilir hedefler (KPI)

### 3.1 Pilot hedefleri

Pilot: 2 toptancı (kozmetik ve saç bakım ürünleri) ve onların mevcut perakendeci müşterileri.

| # | KPI | Hedef | Ölçüm yöntemi |
| --- | --- | --- | --- |
| KPI-01 | Pilot toptancıların hedeflediği perakendecilerden bağlantıyı kabul edenlerin oranı | ≥ %60 | `connections` (aktif) / toptancının hedef listesi |
| KPI-02 | Pilot toptancıların toplam siparişlerinden platform üzerinden gelenlerin oranı (pilotun son 4 haftası) | ≥ %40 | Platform siparişleri / toptancının bildirdiği toplam sipariş |
| KPI-03 | Bağlantının kabulünden ilk siparişe kadar geçen medyan süre | ≤ 14 gün | `connections.started_at` → ilk `orders.submitted_at` |
| KPI-04 | Toptancının düzenleme veya kısmi onay yapmak zorunda kaldığı siparişlerin oranı | ≤ %15 | `order_status_history` |
| KPI-05 | Perakendecinin kendisi onayladığı teslimatların oranı (otomatik onaya düşmeyenler) | ≥ %70 | `delivery_proofs` |
| KPI-06 | Teslim itirazı oranı | ≤ %5 | `delivery_proofs` |
| KPI-07 | Pilot süresince kritik hata (veri kaybı, kiracılar arası veri sızıntısı, yanlış fiyat uygulanması) sayısı | 0 | Olay kaydı (runbook) |

📌 VARSAYIM: KPI hedef değerleri (%60, %40, 14 gün, %15, %70, %5) başlangıç önerisidir. Pilot toptancı sahipleriyle birlikte pilot başlamadan önce kesinleştirilecektir.

⚠️ AÇIK SORU: Pilotun süresi ne kadar olacak? KPI-02'nin "son 4 hafta" ölçümü en az 8 haftalık bir pilot varsayar.

### 3.2 İlk 12 ay hedefleri

| # | KPI | Hedef |
| --- | --- | --- |
| KPI-10 | Aktif (ödeme yapan) toptancı sayısı | 10 |
| KPI-11 | Kayıtlı ve en az bir aktif bağlantısı olan perakendeci sayısı | 200 |
| KPI-12 | Aylık altyapı maliyeti (sunucu, veritabanı, SMS, depolama, alan adı) | ≤ 100 USD |
| KPI-13 | Planlı bakım dışı erişilebilirlik (iş saatleri) | ≥ %99,5 |

📌 VARSAYIM: Erişilebilirlik hedefi iş saatleri için %99,5'tir (aylık yaklaşık 1 saat 15 dakika plansız kesinti). Gece planlı bakım bu hesaba dahil değildir. Ayrıntı: `02-requirements/non-functional-requirements.md`.

## 4. Kapsam (MVP)

| Alan | Kapsam |
| --- | --- |
| Kimlik | Telefon + SMS OTP ile giriş; admin rolleri için 2FA |
| İşletme | Tek işletme kaydı + yetenekler (seller/buyer); şubeler, depolar, profiller |
| Kullanıcı ve rol | Platform unvan kataloğu, rol şablonları, işletmeye özel roller, izin matrisi |
| Bağlantı ağı | Perakendeci dizini, istek, kabul/red/engel, iptal, yeniden istek, kota, bekleme süresi, süre dolumu |
| Görünürlük | Varsayılan: ünvan, faaliyet alanı, şehir/rayon; diğer alanlar perakendeci ayarıyla açılır |
| Katalog | Ürün, varyant, ambalaj hiyerarşisi (UN/ECE birim kodları), görseller, çeviriler, Excel ile içe aktarma, son kullanma tarihi işareti |
| Fiyat | Fiyat önceliği, fiyat listeleri, müşteri fiyatı, şube fiyatı (opsiyonel), şube indirimi, kademeli fiyat |
| Stok | Stok modları 0 (takipsiz), 1 (var/yok), 2 (miktarlı); rezervasyon; hareket kaydı |
| Sipariş | Şube bazında ortak sepet, şube onayı, toptancı başına bölünme, toptancı onayı/düzenleme/kısmi onay, sipariş belgesi (PDF) |
| Teslimat | Kendi kargocu, manuel dış kargo, "teslim ettim" (fotoğraf + GPS), perakendeci onayı/itirazı, otomatik onay |
| Cari | Teslimde borç kaydı, tahsilat girişi, kapıda tahsilat, ekstre, e-qaimə uyumlu dışa aktarma |
| Abonelik | Plan ve hak sistemi; ödeme takibi elle |
| Bildirim | Push bildirimi; yalnızca OTP için SMS |
| Dil | Arayüz ve içerik altyapısı 4 dil (az, ru, en, tr); pilotta az, ru, tr tam çevrilmiş |
| Platform admin | Toptancı ve perakendeci yönetimi, moderasyon, katalog, ayarlar, planlar, çeviriler, denetim |
| İstemciler | Web (Next.js): admin, toptancı, perakendeci; Mobil (Expo): toptancı rolleri ve perakendeci |

## 5. Kapsam dışı (MVP)

| Konu | Durum | İlgili karar |
| --- | --- | --- |
| Online ödeme | Sonraki faz; ödeme sağlayıcısı adaptörüyle | D1 |
| e-qaimə entegrasyonu | Sonraki faz; MVP'de yalnızca dışa aktarma | D5 |
| Dış kargo API entegrasyonu | Sonraki faz | D6 |
| WhatsApp ve SMS bildirim kanalları (OTP hariç) | Sonraki faz | D18 |
| 1C / ERP entegrasyonu | Faz 3 | — |
| Offline mobil kullanım | Faz 3 | — |
| Çift rollü işletme (aynı işletmenin hem toptancı hem perakendeci olması) | Veri modeli hazır, özellik kapalı | D20 |
| Toptancının ödemeli self-servis kaydı | Kayıt modu ayarı hazır, özellik kapalı | D14 |
| Perakendeci premium abonelik | Plan sistemi hazır, plan tanımlı değil | D4 |
| Lot bazlı stok ve FEFO | Faz 2 (MVP'de satır düzeyinde lot ve son kullanma tarihi) | D24 |
| Kur dönüşümü | Bir sipariş tek para biriminde | D17 |
| QR / davet linki | Kaldırıldı | D12 |
| İngilizce arayüzün pilotta tam çevrilmesi | Altyapı hazır, çeviri pilot sonrası | — |

## 6. Kısıtlar

| # | Kısıt |
| --- | --- |
| C-01 | **Ekip:** Tek kişi. Kod, Antigravity IDE (Claude Opus modeliyle) ve Claude (mimari ve inceleme) ile AI destekli yazılır. |
| C-02 | **AI aboneliği:** Claude Pro planı (kullanım limitleri Claude ve Claude Code arasında paylaşılır). |
| C-03 | **Altyapı bütçesi:** Aylık en fazla 100 USD (pilot ve ilk 12 ay). |
| C-04 | **Barındırma:** AWS, `eu-central-1` (Frankfurt). Hukuki görüş alınmış ve onaylanmıştır. |
| C-05 | **Teknoloji:** TypeScript (NestJS, Next.js, React Native/Expo), PostgreSQL, Redis, Meilisearch, Cloudflare R2 + CDN, GitHub + GitHub Actions. Ayrıntı: `07-ai-development/tech-stack.md`. |
| C-06 | **Destek:** Yalnızca iş saatlerinde. Gece planlı bakım yapılabilir. |
| C-07 | **Mobil dağıtım:** Önce TestFlight ve Google Play iç test; sonra mağazalarda yayın. |
| C-08 | **Pilot verisi:** Pilot toptancıların ürün, fiyat ve müşteri verileri Excel dosyalarındadır. |

## 7. Varsayımlar

| # | Varsayım |
| --- | --- |
| A-01 | 📌 VARSAYIM: 12. ayda ortalama günlük sipariş sayısı yaklaşık 60'tır (200 perakendeci × haftada 2 sipariş ÷ 7 gün). Kapasite hesaplarında 5 kat güvenlik payıyla **tepe 300 sipariş/gün** kullanılır. Sipariş başına ortalama 25 kalem. |
| A-02 | 📌 VARSAYIM: Pilot toptancı başına ürün sayısı 2.000'i, toplam ürün sayısı 12 ayda 20.000'i geçmez. |
| A-03 | 📌 VARSAYIM: Toptancı başına kullanıcı sayısı 15'i, toplam kullanıcı sayısı 12 ayda 800'ü geçmez. |
| A-04 | 📌 VARSAYIM: İş saatleri Bakü saatiyle (Asia/Baku, UTC+4) hafta içi 09:00–19:00, cumartesi 10:00–16:00'dır. Planlı bakım penceresi 02:00–05:00'tir. |
| A-05 | Pilot perakendecilerin büyük çoğunluğu akıllı telefon kullanır ve platformu öncelikle mobil uygulamadan kullanır. |
| A-06 | Pilot toptancıların Excel dosyaları, tek seferlik bir şablona dönüştürülerek içe aktarılabilir. |
| A-07 | Pilot sırasında toptancılar mevcut telefon/WhatsApp sipariş kanalını kapatmaz; platform paralel çalışır. |

## 8. Başarı ölçütü ve karar noktası

Pilot sonunda KPI-01, KPI-02 ve KPI-07 hedeflerine ulaşılırsa platform Faz 2'ye geçer ve yeni toptancılara satışa açılır. Ulaşılamazsa pilot geri bildirimleriyle MVP düzeltilir ve pilot uzatılır. Karar yetkisi platform sahibindedir (`stakeholders.md`).

## 9. Bu belgedeki açık sorular

1. ⚠️ AÇIK SORU: Pilotun süresi ne kadar olacak (öneri: en az 8 hafta)?
