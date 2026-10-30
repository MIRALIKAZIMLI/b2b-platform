# B2B Toptan–Perakende Platformu — Sistem Dokümantasyonu

| Alan | Değer |
| --- | --- |
| Sürüm | 1.0 |
| Tarih | 2026-10-24 |
| Sahip | Platform sahibi |
| Durum | Kodlamaya hazır (açık sorular aşağıda) |

Bu klasör, projenin **tek doğru kaynağıdır** (single source of truth). İnsan geliştirici ve AI kodlama asistanları (Antigravity, Claude Code) aynı belgelerden çalışır. Kök dizindeki [AGENTS.md](../AGENTS.md), AI asistanları için kısa bir giriş ve bu klasöre yönlendirmedir.

## Proje özeti

Azerbaycan'dan başlayan, çok kiracılı bir B2B SaaS sipariş ve cari takip platformu:

- Toptancıyı yalnızca platform admini açar; perakendeci kendisi kaydolur.
- Bağlantıyı her zaman toptancı başlatır; perakendeci yalnızca bağlı toptancıların ürünlerini kendi fiyatıyla görür.
- Perakendeci şube sepetinde birden fazla toptancıdan ürün toplar; şube admini onaylar; sepet toptancı başına siparişe bölünür.
- Toptancı siparişi onaylar (kısmi onay dahil), stok rezerve edilir, kargocu teslim eder, perakendeci uygulamadan onaylar (48 saat sonra otomatik onay), borç cariye yazılır.
- Online ödeme ve e-qaimə yoktur; ikisi de adaptörle sonradan eklenir.
- Pilot: 2 toptancı (kozmetik ve saç bakımı) ve onların kozmetik dükkanı müşterileri. 12 ay hedefi: 10 toptancı, 200 perakendeci; altyapı bütçesi ≤ 100 USD/ay.

Teknik yaklaşım: TypeScript modüler monolit (NestJS + Next.js + Expo), PostgreSQL RLS ile kiracı izolasyonu, Redis/BullMQ, Meilisearch, Cloudflare R2, AWS Lightsail (Frankfurt).

## Belge dizini

### 01 — Keşif

| Belge | İçerik |
| --- | --- |
| [project-charter.md](01-discovery/project-charter.md) | Problem, KPI'lar, kapsam ve kapsam dışı, kısıtlar, varsayımlar |
| [stakeholders.md](01-discovery/stakeholders.md) | Paydaşlar, iletişim planı, karar alma kuralı |

### 02 — Gereksinimler

| Belge | İçerik |
| --- | --- |
| [prd.md](02-requirements/prd.md) | İş kuralları K1–K11, personalar, özellikler (MoSCoW), MVP kapsamı |
| [user-stories.md](02-requirements/user-stories.md) | US-001–US-061, Given/When/Then kabul kriterleri, ayar varsayılanları |
| [non-functional-requirements.md](02-requirements/non-functional-requirements.md) | NFR-01–NFR-98: kapasite, performans, erişilebilirlik, güvenlik, kişisel veri, maliyet, mock SMS |
| [glossary.md](02-requirements/glossary.md) | Türkçe terim ↔ kod adı sözlüğü |

### 03 — Mimari

| Belge | İçerik |
| --- | --- |
| [design-doc.md](03-architecture/design-doc.md) | Hedefler, önerilen çözüm, alternatifler, bileşenler, riskler, yayın planı (Y0–Y4) |
| [c4-context.md](03-architecture/c4-context.md) | C4 seviye 1 |
| [c4-container.md](03-architecture/c4-container.md) | C4 seviye 2 |
| [c4-component.md](03-architecture/c4-component.md) | API modülleri, tablo sahipliği, bağımlılık kuralları, izin kataloğu |
| [data-model.md](03-architecture/data-model.md) | ERD, tüm tablolar, RLS sınıfları, kişisel veri alanları |
| [sequence-flows.md](03-architecture/sequence-flows.md) | SF-01–SF-09 kritik akışlar ve hata senaryoları |
| [state-machines.md](03-architecture/state-machines.md) | Durum diyagramları ve geçiş kuralları |
| [api/openapi.yaml](03-architecture/api/openapi.yaml) | OpenAPI 3.1 sözleşmesi |
| [integrations.md](03-architecture/integrations.md) | Dış servisler ve adaptör arayüzleri |
| [infrastructure.md](03-architecture/infrastructure.md) | Hosting, dağıtım diyagramı, ağ, yedekleme, büyüme yolu |
| [threat-model.md](03-architecture/threat-model.md) | STRIDE tablosu TM-01–TM-32 |

### 04 — Kararlar

| ADR | Karar |
| --- | --- |
| [Şablon](04-decisions/adr-template.md) | ADR yazım kuralları |
| [0001](04-decisions/adr-0001-modular-monolith.md) | Modüler monolit |
| [0002](04-decisions/adr-0002-typescript-full-stack.md) | TypeScript tam yığın |
| [0003](04-decisions/adr-0003-tenant-isolation-with-rls.md) | RLS ile kiracı izolasyonu |
| [0004](04-decisions/adr-0004-capability-based-authorization.md) | Yetenek tabanlı yetki |
| [0005](04-decisions/adr-0005-drizzle-orm.md) | Drizzle ORM |
| [0006](04-decisions/adr-0006-phone-otp-and-jwt-sessions.md) | OTP + JWT oturumları |
| [0007](04-decisions/adr-0007-jsonb-content-translations.md) | JSONB içerik çevirileri |
| [0008](04-decisions/adr-0008-adapters-for-external-services.md) | Dış servis adaptörleri |
| [0009](04-decisions/adr-0009-layered-settings-and-entitlements.md) | Katmanlı ayarlar ve haklar |
| [0010](04-decisions/adr-0010-transactional-outbox.md) | İşlemsel outbox |
| [0011](04-decisions/adr-0011-meilisearch-and-bullmq.md) | Meilisearch ve BullMQ |
| [0012](04-decisions/adr-0012-hosting-aws-lightsail-and-cloudflare.md) | AWS Lightsail + Cloudflare |
| [0013](04-decisions/adr-0013-seller-initiated-connections.md) | Bağlantıyı toptancı başlatır |
| [0014](04-decisions/adr-0014-buyer-privacy-defaults.md) | Perakendeci gizlilik varsayılanları |
| [0015](04-decisions/adr-0015-shared-cart-split-per-seller.md) | Ortak sepet ve bölünme |
| [0016](04-decisions/adr-0016-delivery-confirmation-and-auto-confirm.md) | Teslim onayı ve otomatik onay |
| [0017](04-decisions/adr-0017-no-online-payment-and-einvoice-in-mvp.md) | MVP'de ödeme ve e-qaimə yok |
| [0018](04-decisions/adr-0018-stock-modes.md) | Stok modları |
| [0019](04-decisions/adr-0019-price-resolution-order.md) | Fiyat çözümleme sırası |
| [0020](04-decisions/adr-0020-append-only-ledger-per-pair.md) | Yalnızca eklenen cari |
| [0021](04-decisions/adr-0021-mock-sms-in-non-production.md) | Mock SMS |
| [0022](04-decisions/adr-0022-rest-api-versioning-and-contract-first.md) | REST, sürümleme, sözleşme önce |
| [0023](04-decisions/adr-0023-local-disk-file-storage.md) | Yerelde disk dosya deposu |

### 05 — Planlama

| Belge | İçerik |
| --- | --- |
| [roadmap.md](05-planning/roadmap.md) | Fazlar, milestone'lar M0–M7, kapsam koruma |
| [backlog.md](05-planning/backlog.md) | F0.1–F7.6 adımları, tahmin, bağımlılık |
| [risk-register.md](05-planning/risk-register.md) | RISK-01–RISK-19 |
| [test-strategy.md](05-planning/test-strategy.md) | Test seviyeleri, kapsam, zorunlu test tabloları, yayın öncesi kontrol |

### 06 — Operasyon

| Belge | İçerik |
| --- | --- |
| [environments-cicd.md](06-operations/environments-cicd.md) | Ortamlar, dallar, CI/CD, gizli bilgiler, ortam değişkenleri |
| [observability.md](06-operations/observability.md) | Loglar, metrikler, alarmlar AL-01–AL-17 |
| [runbook.md](06-operations/runbook.md) | RB-01–RB-13 |

### 07 — AI destekli geliştirme

| Belge | İçerik |
| --- | --- |
| [tech-stack.md](07-ai-development/tech-stack.md) | Kapalı teknoloji listesi, kullanılmayacaklar |
| [coding-guidelines.md](07-ai-development/coding-guidelines.md) | Klasör yapısı, isimlendirme, katmanlar, hata, log, test kuralları |
| [implementation-plan.md](07-ai-development/implementation-plan.md) | Kodlamanın adım adım sırası |
| [definition-of-done.md](07-ai-development/definition-of-done.md) | "Bitti" kontrol listesi |

### Ek kaynak

| Belge | İçerik |
| --- | --- |
| `product-report.md` | Sistem Analiz Raporu v4 (onaylanmış). Ekran listeleri, dashboard içerikleri, birim ve ambalaj ayrıntıları bu rapordadır. **Kurulum adımı:** raporu doküman menüsünden Markdown olarak dışa aktarıp `docs/product-report.md` adıyla bu klasöre ekleyin; diğer belgeler bu adla bağlantı verir. |

## Kimlik şemaları

| Önek | Anlam | Tanımlandığı yer |
| --- | --- | --- |
| K1–K11 | İş kuralları | prd.md §2 |
| D1–D25 | Analiz raporundaki karar numaraları | product-report.md |
| P-01–P-10 | Personalar | prd.md §3 |
| F-01–F-52 | Özellikler | prd.md §4 |
| US-001–US-061 | User story'ler | user-stories.md |
| NFR-01–NFR-98 | Fonksiyonel olmayan gereksinimler | non-functional-requirements.md |
| KPI-01–KPI-13 | Başarı ölçütleri | project-charter.md §3 |
| SF-01–SF-09 | Sequence akışları | sequence-flows.md |
| TM-01–TM-32 | Tehditler | threat-model.md |
| ADR-0001–ADR-0022 | Mimari kararlar | 04-decisions/ |
| F0.1–F7.6 | Uygulama adımları | backlog.md, implementation-plan.md |
| M0–M7 | Milestone'lar | roadmap.md |
| Y0–Y4 | Yayın aşamaları | design-doc.md §9 |
| RISK-01–RISK-19 | Riskler | risk-register.md |
| AL-01–AL-17 | Alarmlar | observability.md |
| RB-01–RB-13 | Runbook senaryoları | runbook.md |

Numaralar gruplar halinde verilmiştir (ör. NFR-10'lar performans, NFR-40'lar güvenlik); aradaki boşluklar bilinçlidir ve yeni gereksinimler ilgili grubun boş numarasını alır.

## Belgeleri güncelleme kuralı

1. Davranışı değiştiren her değişiklik önce belgede yapılır, sonra kodda.
2. Kabul edilmiş ADR değiştirilmez; yeni ADR yazılır.
3. Pull request, etkilediği belgeleri aynı PR'da günceller ([definition-of-done.md](07-ai-development/definition-of-done.md) §6).
4. Değişen belgeler Claude Projesi bilgi tabanına yeniden yüklenir.
5. Sürüm numarası değişen belgenin başlık tablosunda artırılır.

## Tüm açık sorular

| # | Soru | Belge | Geçici varsayım |
| --- | --- | --- | --- |
| AS-01 | Pilot ne kadar sürecek? | [project-charter.md](01-discovery/project-charter.md) §3.1 | En az 8 hafta |
| AS-02 | Pilot toptancıların adları ve iletişim bilgileri belgelere girecek mi? | [stakeholders.md](01-discovery/stakeholders.md) §1 | Hayır; platform sahibinin özel notlarında |
| AS-03 | Satış temsilcisinin müşteri adına sipariş girmesi (US-061) MVP'de mi? Öyleyse şube onayı atlanacak mı? | [prd.md](02-requirements/prd.md) §5, [user-stories.md](02-requirements/user-stories.md) US-061 | Could (MVP sonrası) |
| AS-04 | VÖEN kontrol hanesi algoritmasının resmi tanımı | [user-stories.md](02-requirements/user-stories.md) US-006 | Yalnızca "10 rakam, son hane 1 veya 2"; F0.1'de netleşir |
| AS-05 | e-qaimə dışa aktarımı için .xlsx yeterli mi, yoksa resmi XML şemasıyla uyum mu gerekli? | [user-stories.md](02-requirements/user-stories.md) US-053 | .xlsx; F0.1'de netleşir |
| AS-06 | Gerçek SMS sağlayıcısı hangisi ve SMS başına maliyet ne? | [non-functional-requirements.md](02-requirements/non-functional-requirements.md) §9, [integrations.md](03-architecture/integrations.md) §2 | Mock (dev/staging); gerçek sağlayıcı F6.5'ten önce seçilir |
| AS-07 | Azerbaycan şehir/rayon listesinin kaynağı nedir? | [data-model.md](03-architecture/data-model.md) §6 | Admin pilot bölgelerini elle girer |
| AS-08 | Toptancı itirazı reddederse platform hakemliği olacak mı? | [state-machines.md](03-architecture/state-machines.md) §5 | MVP'de yok |
