# Tasarım Belgesi (Design Doc)

| Alan | Değer |
| --- | --- |
| Sürüm | 1.0 |
| Tarih | 2026-10-24 |
| Durum | Onaylandı (MVP için) |
| İlgili belgeler | [prd.md](../02-requirements/prd.md) · [non-functional-requirements.md](../02-requirements/non-functional-requirements.md) · [c4-container.md](c4-container.md) · [data-model.md](data-model.md) · [04-decisions/](../04-decisions/) |

## 1. Bağlam

Toptancı–perakendeci siparişleri bugün telefon, WhatsApp ve Excel ile yürüyor ([project-charter.md](../01-discovery/project-charter.md)). Platform; bağlantı ağı, fiyat, stok, sipariş, teslimat ve cari süreçlerini tek bir çok kiracılı sistemde toplar. Sistemi tek bir geliştirici, AI kodlama asistanlarıyla yazacak ve işletecek. Aylık altyapı bütçesi 100 USD'dir. Bu iki kısıt (tek kişi, düşük bütçe), aşağıdaki tüm kararların ana belirleyicisidir.

## 2. Hedefler

1. PRD'deki Must story'leri, NFR hedefleriyle karşılamak.
2. Kiracılar arası veri sızıntısını yapısal olarak imkânsız hale getirmek (uygulama kontrolü + veritabanı RLS).
3. Tek kişinin anlayıp bakımını yapabileceği kadar az hareketli parça.
4. Gelecek özellikler için (ödeme, e-qaimə, dış kargo, 1C, WhatsApp, çift rol, yeni ülke) yeniden yazım gerektirmeyen "dikiş yerleri": ayarlar, haklar, adaptörler, olaylar.
5. AI asistanlarının hata yapma alanını daraltan katı yapı: tek dil (TypeScript), sözleşme önce (OpenAPI), modül sınırları, testler.

## 3. Hedef olmayanlar

- Mikroservis mimarisi, Kubernetes, çok bölgeli dağıtım.
- MVP'de online ödeme, e-qaimə, dış kargo API, 1C, offline mobil, WhatsApp bildirimi.
- Tasarım tavanının (NFR-01–NFR-07, ×5) ötesinde ölçek.
- İş saatleri dışında yüksek erişilebilirlik.
- Gerçek zamanlı (WebSocket) güncellemeler; MVP'de push bildirimi + ekran yenileme yeterli.

## 4. Önerilen çözüm

### 4.1 Genel yapı

**Modüler monolit:** tek bir NestJS API süreci ve aynı kod tabanından çalışan bir arka plan iş süreci (worker). Tek PostgreSQL veritabanı, satır düzeyinde kiracı izolasyonu (RLS). Redis; önbellek, hız sınırı ve iş kuyruğu (BullMQ) için kullanılır. Meilisearch ürün ve perakendeci araması için kullanılır. Dosyalar Cloudflare R2'de tutulur.

İstemciler:

- **Web (Next.js):** platform admin paneli, toptancı paneli, perakendeci web sürümü. Tek uygulama, role göre yönlendirme.
- **Mobil (Expo / React Native):** tek uygulama; toptancı rolleri (yönetici, temsilci, depo, kargocu) ve perakendeci rolleri.

API sözleşmesi [api/openapi.yaml](api/openapi.yaml) dosyasıdır. Web ve mobil istemci tipleri bu dosyadan üretilir (`packages/api-client`).

### 4.2 Temel tasarım ilkeleri

| İlke | Uygulama |
| --- | --- |
| Kiracı izolasyonu iki katmanlı | (1) Her sorgu `business_id` filtresiyle yazılır. (2) PostgreSQL RLS, aynı filtreyi veritabanı düzeyinde zorlar; uygulama hatası sızıntıya dönüşmez. ADR-0003. |
| Yetki yeteneğe göre | Her istek: oturum → üyelik → yetenek (`seller`/`buyer`, `approved`) → izin → kapsam → kaynak sahipliği. ADR-0004. |
| Ayarlar ve haklar kodda sabit değil | `settings` (platform → plan → işletme) ve `plan_entitlements` + `entitlement_overrides`. ADR-0009. |
| Dış servisler adaptör arkasında | `SmsSender`, `PushSender`, `FileStorage`, `DeliveryProvider`, ileride `PaymentProvider`, `EInvoiceProvider`, `ErpConnector`. ADR-0008. |
| Değişmez kayıtlar | `ledger_entries`, `stock_movements`, `order_status_history`, `audit_logs` yalnızca eklenir; düzeltme ters kayıtla yapılır. |
| Anlık kopya | Sipariş satırına ürün adı, birim, fiyat, indirim ve fiyat kaynağı kopyalanır. |
| Para ve zaman | Para `numeric`, asla `float`; zaman `timestamptz` (UTC), gösterim kullanıcı → işletme → ülke saat diliminde. |
| Olay çıkışı (outbox) | Durum değişiklikleri aynı veritabanı işleminde `outbox_events` tablosuna yazılır; worker bunları bildirim, arama indeksi ve gelecekteki entegrasyonlara dağıtır. ADR-0010. |
| İdempotens | Tüm "oluştur" uçları `Idempotency-Key` başlığını kabul eder; mobil yeniden denemeler çift kayıt üretmez (offline'a hazırlık). |

### 4.3 İstek yaşam döngüsü (API)

1. Cloudflare (TLS, CDN, temel WAF) → AWS üzerindeki API.
2. NestJS ara katmanları: istek kimliği, hız sınırı (Redis), JWT doğrulama.
3. `TenantContext`: istek başlığındaki `X-Business-Id`, kullanıcının o işletmedeki üyeliğiyle doğrulanır.
4. `PermissionGuard`: uç noktanın gerektirdiği izin ve yetenek kontrol edilir.
5. Servis katmanı, `TenantContext` ile açılan bir veritabanı işlemi içinde çalışır; işlemin başında `SET LOCAL app.business_id = …` çalıştırılır ve RLS bu değeri kullanır.
6. Yanıt, OpenAPI şemasıyla doğrulanmış DTO'dur; hata yanıtları standart biçimdedir (bkz. [openapi.yaml](api/openapi.yaml) `Error` şeması).

## 5. Değerlendirilen alternatifler

| Konu | Seçilen | Alternatifler | Takas | ADR |
| --- | --- | --- | --- | --- |
| Mimari stil | Modüler monolit | Mikroservis; serverless (Lambda) | Mikroservis: bağımsız ölçek, ama tek kişi için dağıtım, gözlem ve veri tutarlılığı yükü çok yüksek. Serverless: boşta maliyet düşük, ama soğuk başlatma, uzun işler (Excel, PDF) ve RLS bağlantı yönetimi karmaşık. | ADR-0001 |
| Dil ve framework | TypeScript: NestJS + Next.js + Expo | Spring Boot, .NET, Django/FastAPI, Laravel | Tek dil, istemci–sunucu tip paylaşımı ve AI araçlarının ekosistemdeki gücü. Bedeli: yüksek trafikte JVM/.NET kadar verimli değil (bu ölçekte önemsiz). | ADR-0002 |
| Kiracı izolasyonu | Ortak şema + `business_id` + RLS | Kiracı başına şema; kiracı başına veritabanı | Kiracı başına şema/veritabanı daha güçlü izolasyon sağlar, ama bağlantılar ve siparişler **iki kiracıya** aittir (satıcı + alıcı); çapraz sorgular ve migration yönetimi zorlaşır. RLS bu modelde tek doğru çözüm. | ADR-0003 |
| ORM / sorgu katmanı | Drizzle ORM | Prisma, TypeORM, Kysely | Prisma: güçlü araçlar, ama RLS için işlem başına `SET LOCAL` ve ham SQL kullanımı zahmetli. Drizzle: SQL'e yakın, işlem kontrolü kolay, tipler güçlü. Bedeli: Prisma kadar olgun migration araçları yok. | ADR-0005 |
| Kimlik | Telefon + OTP; JWT erişim anahtarı (15 dk) + döndürülen yenileme anahtarı | Yalnızca sunucu oturumu (cookie); harici kimlik sağlayıcı (Cognito, Auth0) | Harici sağlayıcı: hazır, ama Azerbaycan SMS'i, maliyet ve çok işletmeli üyelik modeli için özelleştirme gerekir. Yalnızca cookie: web için ideal, mobil için zayıf. Web'de yenileme anahtarı httpOnly cookie'de, mobilde güvenli depoda tutulur. | ADR-0006 |
| İçerik çevirisi | JSONB alanlar (`name: {az, ru, tr, en}`) | Ayrı çeviri tabloları (`product_translations`) | Ayrı tablo: daha normal, ama her okumada join ve daha fazla kod. JSONB: tek sorguda okunur, eksik dil geri dönüşü (fallback) kolay. Arayüz metinleri ayrı `ui_translations` tablosunda. | ADR-0007 |
| Arama | Meilisearch | PostgreSQL tam metin arama (pg_trgm) | PostgreSQL: ek servis yok. Meilisearch: çok dilli, yazım hatası toleranslı, eş anlamlı sözlük (Kiril/Latin) kolay. Bedeli: ek bir servis ve senkronizasyon (outbox ile). Kullanıcı kararı. | ADR-0011 |
| İş kuyruğu | Redis + BullMQ | PostgreSQL tabanlı kuyruk (pg-boss); AWS SQS | pg-boss: Redis gerektirmez. Redis zaten önbellek ve hız sınırı için var; BullMQ NestJS ile olgun entegrasyona sahip. SQS: yönetilen ama ek AWS bağımlılığı. | ADR-0011 |
| Mobil | Expo (React Native) | Flutter; yerel (Swift/Kotlin) | Flutter iyi, ama ikinci dil (Dart). Yerel: iki kod tabanı. Expo: TypeScript, OTA güncelleme, TestFlight / Play iç test dağıtımı kolay. | ADR-0002 |
| Barındırma (pilot) | AWS Lightsail sunucusu (Docker Compose) + yönetilen PostgreSQL | EC2 + RDS; ECS Fargate; Hetzner VPS | ECS/Fargate: yönetilen ama sabit maliyet ve karmaşıklık yüksek. EC2 + RDS: esnek ama fiyatlandırma değişken. Lightsail: sabit aylık fiyat, bütçe tahmini kolay. Hetzner: ucuz, ama kullanıcı kararı AWS. | ADR-0012 |
| Dosya depolama | Cloudflare R2 + CDN | AWS S3 + CloudFront | R2: dışarı veri çıkış ücreti yok, CDN aynı sağlayıcıda. Kullanıcı kararı. | ADR-0012 |
| Bildirim | Push (Expo Push Service → APNs/FCM); OTP için SMS | WhatsApp Business API; yalnızca SMS | WhatsApp ve SMS mesaj başına ücretli; push ücretsiz. WhatsApp ileride adaptörle. | ADR-0008 |

## 6. Bileşenler

Ayrıntı: [c4-container.md](c4-container.md) ve [c4-component.md](c4-component.md).

| Bileşen | Teknoloji | Sorumluluk |
| --- | --- | --- |
| `apps/api` | NestJS | HTTP API, iş kuralları, yetki, RLS bağlamı |
| `worker` (`apps/api/src/worker.main.ts`) | NestJS (aynı kod tabanı, ayrı giriş noktası ve container) | BullMQ işleri: bildirim, arama indeksi, Excel içe aktarma, PDF, zamanlanmış işler |
| `apps/web` | Next.js | Admin, toptancı ve perakendeci web arayüzü |
| `apps/mobile` | Expo | Toptancı ve perakendeci mobil uygulaması |
| `packages/api-client` | OpenAPI'den üretilmiş TypeScript istemci | Web ve mobilin API erişimi |
| `packages/shared` | TypeScript | Ortak sabitler, hata kodları, para/zaman yardımcıları, Zod şemaları |
| `packages/ui` | React | Web bileşenleri (mobil kendi bileşenlerini kullanır) |
| PostgreSQL | Yönetilen PostgreSQL 16 | Tüm kalıcı veri |
| Redis | Redis 7 (Docker) | Önbellek, hız sınırı, BullMQ |
| Meilisearch | Meilisearch 1.x (Docker) | Ürün ve perakendeci dizini araması |
| Cloudflare | DNS, CDN, R2 | TLS sonlandırma, statik içerik, dosyalar |

## 7. Entegrasyonlar

Ayrıntı: [integrations.md](integrations.md).

| Servis | Amaç | MVP |
| --- | --- | --- |
| SMS sağlayıcısı | OTP | Mock (dev/staging); gerçek sağlayıcı pilot kullanıcı kaydından önce |
| Expo Push Service | Push bildirimi | Evet |
| Cloudflare R2 | Dosya | Evet |
| Harita / adres | Şube konumu seçimi | 📌 VARSAYIM: Cihazın GPS'i ve elle konum seçimi; ücretli harita API'si yok |
| e-qaimə, ödeme, kargo API, 1C, WhatsApp | — | Hayır; adaptör arayüzleri tanımlı |

## 8. Riskler

Ayrıntı: [risk-register.md](../05-planning/risk-register.md).

| Risk | Etki | Önlem |
| --- | --- | --- |
| AI'ın ürettiği kodda kiracı izolasyonu hatası | Çok yüksek | RLS + izolasyon testleri + Müfettiş kontrol listesi |
| Tek kişi: hastalık, tükenme, bilgi kaybı | Yüksek | Belgeler tek kaynak; otomatik testler; runbook |
| 100 USD bütçenin aşılması | Orta | Sabit fiyatlı Lightsail, bütçe alarmı, staging'i kapatma |
| Tek sunucunun çökmesi | Orta | Yönetilen veritabanı ayrı; sunucu Docker imajından ≤ 30 dk'da yeniden kurulur (runbook) |
| Meilisearch indeksinin veritabanından sapması | Düşük | Outbox ile senkron; gece tam yeniden indeksleme |
| Mobil eski sürümlerin bozulması | Orta | API sürümleme, `app-config` minimum sürüm |

## 9. Yayın (rollout) planı

Yayın aşamaları `Y0`–`Y4` olarak adlandırılır (Cloudflare R2 ile karışmaması için).

| Aşama | Ortam | Kullanıcılar | SMS | Çıkış ölçütü |
| --- | --- | --- | --- | --- |
| Y0 — Geliştirme | Yerel | Geliştirici | Mock | MVP senaryosu yerelde çalışır |
| Y1 — Staging | AWS staging | Geliştirici + pilot toptancı sahibi (demo verisi) | Mock | Uçtan uca senaryo staging'de hatasız; yük testi geçer |
| Y2 — Kapalı pilot | AWS production | 2 pilot toptancının ekipleri; gerçek veri; mobil TestFlight / Play iç test | **Gerçek sağlayıcı** | Toptancı ekipleri kendi verileriyle 1 hafta sorunsuz çalışır |
| Y3 — Açık pilot | AWS production | Pilot toptancıların perakendecileri | Gerçek | Pilot KPI'ları (charter bölüm 3.1) |
| Y4 — Genel yayın | AWS production | Yeni toptancılar; mobil mağazalarda | Gerçek | Pilot karar noktası (charter bölüm 8) |

Yeni özellikler özellik bayrağıyla kapalı yayınlanır, önce pilot toptancılarda açılır.
