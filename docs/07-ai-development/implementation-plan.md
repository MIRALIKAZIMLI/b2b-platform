# Uygulama Planı

| Alan | Değer |
| --- | --- |
| Sürüm | 1.0 |
| Tarih | 2026-10-24 |
| İlgili belgeler | [backlog.md](../05-planning/backlog.md) (aynı ID'ler, tahmin ve bağımlılık) · [roadmap.md](../05-planning/roadmap.md) · [coding-guidelines.md](coding-guidelines.md) · [definition-of-done.md](definition-of-done.md) |

## Nasıl kullanılır

1. Adımlar **yukarıdan aşağı** ve bağımlılık sırasıyla yapılır ([backlog.md](../05-planning/backlog.md) "Bağımlılık" sütunu). Bir adım, bağlı olduğu adımlar [definition-of-done.md](definition-of-done.md)'yi karşılamadan başlamaz.
2. Her adım **tek bir pull request**tir. Dal adı: `feature/<ID>-<kısa-ad>`.
3. Her adım tek başına doğrulanabilir: "Test" satırındaki komut veya senaryo çalışmalıdır.
4. Adım bir pull request'e sığmıyorsa Mimar oturumunda `<ID>a`, `<ID>b` diye bölünür ve bu belgeye eklenir.
5. "Dosyalar" listesi yol göstericidir; kapsam dışına çıkmak için onay gerekir.

**AI asistanına verilecek standart görev mesajı:**

```text
AGENTS.md ve docs/07-ai-development/implementation-plan.md içindeki <ID> adımını oku.
Adımın "Belgeler" satırındaki dosyaları oku.
Kod yazma. Önce plan çıkar: oluşturacağın/değiştireceğin dosyalar, migration, her kabul kriteri için test, emin olmadığın noktalar.
Onayımı bekle.
```

**Kısaltmalar:** `api/` = `apps/api/src/`, `web/` = `apps/web/src/`, `mob/` = `apps/mobile/`, `m/<ad>/` = `apps/api/src/modules/<ad>/`, `shared/` = `packages/shared/src/`.

---

## F0 — Hazırlık

### F0.1 — Mali müşavir görüşmesi

- **Amaç:** e-qaimə dışa aktarma sütunlarını, VÖEN kontrol hanesi algoritmasını, ƏDV oranlarını ve yuvarlama kuralını netleştirmek.
- **Belgeler:** US-006, US-053, [test-strategy.md](../05-planning/test-strategy.md) §3.1 (P11).
- **Çıktı:** `docs/reports/accounting-notes.md`; gerekiyorsa US-006 / US-053 ve `test-strategy` güncellemesi.
- **Kabul:** Dört konunun her biri için yazılı cevap veya "açık soru" kaydı.
- **Test:** — (belge adımı)

### F0.2 — Pilot toptancı atölyesi

- **Amaç:** Örnek Excel dosyalarını toplamak, iş akışını doğrulamak, KPI hedef değerlerini ve pilot süresini yazılı hale getirmek.
- **Belgeler:** [project-charter.md](../01-discovery/project-charter.md) §3, §9; [prd.md](../02-requirements/prd.md) §5.
- **Çıktı:** `docs/reports/pilot-workshop.md`; örnek dosyalar platform sahibinin özel deposunda (depoya kişisel veri girmez); charter KPI tablosu güncellemesi.
- **Kabul:** Her pilot toptancıdan en az bir ürün ve bir müşteri fiyat dosyası örneği; KPI hedefleri onaylı.
- **Test:** —

### F0.3 — Depo, monorepo iskeleti ve CI

- **Amaç:** Boş ama çalışan monorepo; yerel Docker ortamı; CI hattı.
- **Belgeler:** [tech-stack.md](tech-stack.md), [coding-guidelines.md](coding-guidelines.md) §1, [environments-cicd.md](../06-operations/environments-cicd.md) §2–3.
- **Dosyalar:** `package.json`, `pnpm-workspace.yaml`, `.nvmrc`, `packages/config/*`, `apps/api` (NestJS, `GET /api/health` iskeleti, `main.ts`, `worker.main.ts`), `apps/web` (Next.js boş sayfa), `apps/mobile` (Expo boş ekran), `packages/shared`, `infra/docker-compose.dev.yml` (PostgreSQL 16, Redis 7, Meilisearch, MinIO), `.env.example`, `.github/workflows/ci.yml`, `AGENTS.md`, `CLAUDE.md`, `CHANGELOG.md`, `.gitignore`.
- **Kabul:** `pnpm install && pnpm lint && pnpm typecheck && pnpm test` yerelde ve CI'da yeşil; `docker compose -f infra/docker-compose.dev.yml up -d` sonrası `/api/health` 200; web ve mobil (Expo Go) açılıyor; paket sürümleri sabit; tech-stack.md sürüm tablosu güncel.
- **Test:** CI yeşil; elle: üç uygulamanın açılması.

> **Bölündü (Mimar, 2026-10-24):** F0.3a — monorepo, `packages/config`, `packages/shared`, `apps/api` (health), Docker Compose, CI, PR şablonu. F0.3b — `apps/web` (Next.js boş sayfa), `apps/mobile` (Expo boş ekran). Kartlar: `docs/tasks/F0.3a.md`, `docs/tasks/F0.3b.md`.

### F0.4 — Bulut hesapları ve staging

- **Amaç:** AWS, Cloudflare ve R2'yi hazırlamak; gerçek fiyatları bütçeyle karşılaştırmak.
- **Belgeler:** [infrastructure.md](../03-architecture/infrastructure.md), [ADR-0012](../04-decisions/adr-0012-hosting-aws-lightsail-and-cloudflare.md), NFR-90–92.
- **Çıktı:** AWS hesabı (kök hesapta 2FA), Budgets 70/90 USD, staging Lightsail sunucusu, Cloudflare alan adı ve DNS, R2 bucket'ları (`staging-public`, `staging-private`, `prod-public`, `prod-private`), SSM parametre yolları; `docs/reports/cost-baseline.md` (seçilen planlar ve fiyatları); Lightsail DB PITR ve yedek süresi doğrulaması (RISK-12).
- **Kabul:** Toplam tahmini aylık maliyet ≤ 100 USD; PITR NFR-33'ü karşılıyor veya alternatif kararı ADR olarak yazıldı.
- **Test:** Staging sunucusuna SSH; R2'ye test dosyası yükleme/okuma.

### F0.5 — Claude Projesi ve görev kartı akışı

- **Amaç:** Mimar ortamını kurmak.
- **Belgeler:** [AGENTS.md](../../AGENTS.md), bu belge.
- **Çıktı:** claude.ai'de proje (talimat + bilgi tabanı: `docs/` dosyaları); `docs/tasks/_template.md`.
- **Kabul:** Yeni bir sohbette "F1.1 adımını özetle" sorusuna belgeye uygun cevap.
- **Test:** —

---

## F1 — Çekirdek altyapı

### F1.1 — Veritabanı, kiracı bağlamı ve RLS altyapısı

- **Amaç:** Tüm modüllerin kullanacağı güvenli veritabanı erişimi.
- **Belgeler:** [ADR-0003](../04-decisions/adr-0003-tenant-isolation-with-rls.md), [ADR-0005](../04-decisions/adr-0005-drizzle-orm.md), [data-model.md](../03-architecture/data-model.md) §1, §6.
- **Dosyalar:** `api/core/db/{client.ts, with-tenant-tx.ts, with-platform-tx.ts}`, `apps/api/drizzle.config.ts`, `apps/api/db/bootstrap/roles.sql` (`app_user`, `migrator`, `readonly`; F1.2a'da `drizzle/0000_roles.sql` yerinden migration klasörü dışına taşındı), `apps/api/test/{db.ts, isolation.ts}` (iki kiracı oluşturan yardımcı), `apps/api/src/core/db/check-rls.ts` + `cli.ts check-rls` komutu (T/P/U tablolarında RLS kontrolü; Mimar kararı, F1.1b), CI'ya `check-rls` adımı.
- **Kabul:** `withTenantTx` işlemi açar, `SET LOCAL app.business_id` ve `app.user_id` ayarlar; bağlam olmadan sorgu RLS'li tabloda 0 satır döner; `app_user` tablo sahibi değildir; örnek bir test tablosunda iki kiracı birbirini göremez; `check-rls` RLS'siz kiracı tablosunda başarısız olur.
- **Test:** `pnpm test:integration` (entegrasyon + izolasyon, gerçek PostgreSQL) · `pnpm test:isolation` (yalnızca `*.isolation.test.ts`).

> **Bölündü (Mimar, 2026-10-24):** F1.1a — bağlantı, roller, `withTenantTx`/`withPlatformTx`, test yardımcıları, AC1–AC5 (AC5: `withPlatformTx`). F1.1b — `apps/api/src/core/db/check-rls.ts` + `cli.ts check-rls` komutu + CI `check-rls` adımı, AC6. Kartlar: `docs/tasks/F1.1a.md`, `docs/tasks/F1.1b.md`.

### F1.2 — Hata modeli, log, idempotens, outbox

- **Amaç:** Ortak altyapı servisleri.
- **Belgeler:** [ADR-0010](../04-decisions/adr-0010-transactional-outbox.md), [coding-guidelines.md](coding-guidelines.md) §6–7, [observability.md](../06-operations/observability.md) §1, [openapi.yaml](../03-architecture/api/openapi.yaml) `Error`, `ErrorCode`.
- **Dosyalar:** `shared/errors.ts` (ErrorCode, OpenAPI ile aynı), `api/core/errors/{domain-error.ts, http-map.ts, exception.filter.ts}`, `api/core/logging/logger.module.ts` (redact listesi), `api/core/request-id.middleware.ts`, `api/core/idempotency/*` + tablo, `api/core/outbox/{outbox.schema.ts, outbox.writer.ts, outbox.dispatcher.ts}`, `api/core/clock.ts`, `api/core/money.ts`, `shared/env.ts`.
- **Kabul:** Hata yanıtı `Error` şemasında ve `requestId` içerir; logda telefon maskeli, `code`/`token` alanları redakte; aynı `Idempotency-Key` ile ikinci istek aynı yanıtı döner; outbox olayı yalnızca işlem commit olursa dağıtılır; geçersiz ortam değişkeniyle uygulama başlamaz.
- **Test:** Birim + entegrasyon (`core/**`).

> **Bölündü (Mimar, 2026-10-24):** F1.2a — hata modeli, `http-map`, istek kimliği, log (redakte), `Clock`, `money`, `env.ts`; `0000_roles.sql` → `db/bootstrap/roles.sql`. F1.2b — idempotens (`idempotency_keys`) + outbox + worker dağıtıcısı (F1.4a'dan sonra). Kartlar: `docs/tasks/F1.2a.md`, `docs/tasks/F1.2b.md`.

### F1.3 — Diller, çeviriler, para birimleri, bölgeler

- **Amaç:** Çok dilli ve bölgesel altyapı.
- **Belgeler:** US-058, US-059, [ADR-0007](../04-decisions/adr-0007-jsonb-content-translations.md), [data-model.md](../03-architecture/data-model.md) §4.3.
- **Dosyalar:** `m/i18n/*` (tablolar: `languages`, `ui_translations`, `currencies`, `countries`, `regions`), `GET /api/v1/i18n/{lang}` (ETag), `GET /api/v1/catalog/regions`, `apps/api/drizzle/seed/i18n.ts` (az, ru, tr aktif; en pasif; AZN; AZ pilot bölgeleri), `shared/localized-text.ts` (geri dönüş fonksiyonu), `shared/format.ts` (para, tarih).
- **Kabul:** US-058 AC1, AC3, AC4; US-059 AC1, AC2.
- **Test:** Birim (geri dönüş, biçim) + entegrasyon (uç noktalar).

### F1.4 — Ayarlar ve hak servisleri

- **Amaç:** Kodda sabit değer olmadan süre, kota ve limit okuma.
- **Belgeler:** [ADR-0009](../04-decisions/adr-0009-layered-settings-and-entitlements.md), US-017 (varsayılan değerler tablosu), US-055.
- **Dosyalar:** `shared/settings.ts` (anahtar, tip, varsayılan, sınır), `m/settings/*`, `m/billing/*` (`plans`, `plan_entitlements`, `subscriptions`, `entitlement_overrides`), seed (platform ayarları, bir "Pilot" planı).
- **Kabul:** Çözümleme işletme → plan → platform; sınır dışı değer `SETTING_OUT_OF_RANGE`; önbellek değişiklikte temizlenir; `EntitlementService.check` limit aşımında `ENTITLEMENT_LIMIT_REACHED`.
- **Test:** Birim (çözümleme tablosu) + entegrasyon.

> **Bölündü (Mimar, 2026-10-24):** F1.4a — `settings` (S) + `SettingsService`, Redis önbellek, S tablosu erişim kalıbı (`SECURITY DEFINER`). F1.4b — `plans`, `plan_entitlements`, `subscriptions`, `entitlement_overrides`, `EntitlementService`, plan katmanı (F1.7'den sonra; `businesses` FK'sı). Kartlar: `docs/tasks/F1.4a.md`, `docs/tasks/F1.4b.md`.

### F1.5 — Kimlik: OTP, oturum, yenileme anahtarı

- **Amaç:** Telefon ve OTP ile giriş; mock SMS.
- **Belgeler:** US-001, US-004, [ADR-0006](../04-decisions/adr-0006-phone-otp-and-jwt-sessions.md), [ADR-0021](../04-decisions/adr-0021-mock-sms-in-non-production.md), SF-01, NFR-44–45, NFR-95–98.
- **Dosyalar:** `m/identity/*` (`users`, `otp_challenges`, `user_sessions`), `api/core/ports/sms-sender.ts`, `api/infrastructure/sms/mock-sms-sender.ts` (+ `dev_sms_outbox`), açılış kontrolü (production + mock = başlamaz), `/api/v1/auth/*` uçları, `/api/v1/dev/sms-outbox` (yalnızca dev/staging modülü), `/api/v1/me` (temel).
- **Kabul:** US-001 AC1–AC6; US-004 AC1–AC3; yenileme anahtarının yeniden kullanımı aileyi iptal eder; SMS günlük üst sınırı (`sms.daily_cap`) ve `+994` kuralı.
- **Test:** Entegrasyon (tüm AC'ler) + açılış testi.

> **Bölündü (Mimar, 2026-10-24):** F1.5a — `users`, `otp_challenges`, mock SMS + `dev_sms_outbox`, `otp/request`, OTP doğrulama servisi, production açılış kontrolü. F1.5b — `user_sessions`, JWT, `otp/verify`, yenileme rotasyonu, çıkış, cihazlar, `/me` temel. Kartlar: `docs/tasks/F1.5a.md`, `docs/tasks/F1.5b.md`.

### F1.6 — TOTP ve platform ekibi

- **Amaç:** Admin rolleri için ikinci adım.
- **Belgeler:** US-002, TM-03.
- **Dosyalar:** `m/identity/totp/*` (`user_totp`, `platform_staff`), `/api/v1/auth/totp/*`, seed (ilk süper admin; telefon ortam değişkeninden).
- **Kabul:** US-002 AC1–AC4.
- **Test:** Entegrasyon.

### F1.7 — İşletme çekirdek tabloları

- **Amaç:** Tek işletme kaydı + yetenekler.
- **Belgeler:** [ADR-0004](../04-decisions/adr-0004-capability-based-authorization.md), K10, [data-model.md](../03-architecture/data-model.md) §4.4.
- **Dosyalar:** `m/businesses/*` (`businesses`, `business_capabilities`, `seller_profiles`, `buyer_profiles`, `person_data`, `business_privacy`, `branches`, `warehouses`, `activity_types`, `service_areas`) + RLS; `shared/voen.ts` (format doğrulama).
- **Kabul:** Tüm tablolar RLS'li (`check-rls` geçer); VÖEN doğrulayıcı 10 hane ve son hane 1/2 kuralını uygular; `seller` yeteneği yalnızca platform bağlamında `approved` yapılabilir.
- **Test:** Birim (VÖEN) + izolasyon.

### F1.8 — Erişim: izinler, roller, üyelikler, guard

- **Amaç:** Her uç noktanın yetki kontrolü.
- **Belgeler:** US-012, US-013, [ADR-0004](../04-decisions/adr-0004-capability-based-authorization.md), [design-doc.md](../03-architecture/design-doc.md) §4.3.
- **Dosyalar:** `shared/permissions.ts` (tüm izin kodları), `m/access/*` (`permissions`, `role_templates`, `role_template_permissions`, `job_titles`, `roles`, `role_permissions`, `memberships`, `membership_regions`, `invitations`), `api/core/tenant-context.ts` (`X-Business-Id` doğrulama), `m/access/permission.guard.ts`, `@RequirePermission`, `@Public`, özel lint kuralı (dekoratörsüz controller metodu), seed (unvanlar ve şablonlar: rapor rol tablolarındaki roller), `/api/v1/me` izinlerle.
- **Kabul:** Üyelik dışı `X-Business-Id` → 403; izinsiz uç nokta → 403 `PERMISSION_DENIED`; yanlış yetenek → 403 `CAPABILITY_REQUIRED`; son admin koruması (trigger) `LAST_ADMIN_PROTECTED`; izin önbelleği rol değişikliğinde temizlenir.
- **Test:** Entegrasyon + lint kuralı testi.

> **Bölündü (Mimar, 2026-10-24):** F1.8a — `permissions.ts`, izin/rol şablonu/rol/üyelik tabloları, seed, son admin trigger'ı. F1.8b — `TenantContext`, `PermissionGuard`, `@RequirePermission`/`@Public`, lint kuralı, izin önbelleği, `/me` izinlerle. Kartlar: `docs/tasks/F1.8a.md`, `docs/tasks/F1.8b.md`.

### F1.9 — Audit log yazıcısı

- **Amaç:** Değiştirilemez işlem kaydı.
- **Belgeler:** US-057 AC1, AC3, NFR-52.
- **Dosyalar:** `api/core/audit/*` (`audit_logs` tablosu, yalnızca `INSERT` izni), `AuditService.record(...)`, 🔒 alan maskeleme.
- **Kabul:** `app_user` ile `UPDATE`/`DELETE` başarısız; maskeli alanlar loglanmaz.
- **Test:** Entegrasyon.

### F1.10 — Dosya yükleme

- **Amaç:** R2'ye imzalı URL ile doğrudan yükleme.
- **Belgeler:** SF-09, NFR-49, [integrations.md](../03-architecture/integrations.md) §4.
- **Dosyalar:** `api/core/ports/file-storage.ts`, `api/infrastructure/storage/{s3-file-storage.ts, local-file-storage.ts}`, `m/files/*` (`files`), `/api/v1/files/upload-url`, `/api/v1/files/{id}/complete`.
- **Kabul:** Tür ve boyut sınırları; imza doğrulaması (PNG/JPEG/WebP/XLSX); `private` dosya yalnızca 5 dk'lık imzalı URL ile okunur.
- **Test:** Entegrasyon (MinIO).

### F1.11 — Push bildirim altyapısı

- **Amaç:** Outbox olaylarından push ve uygulama içi bildirim.
- **Belgeler:** US-054, [integrations.md](../03-architecture/integrations.md) §3.
- **Dosyalar:** `api/core/ports/push-sender.ts`, `api/infrastructure/push/{expo-push-sender.ts, mock-push-sender.ts}`, `m/notifications/*` (`push_tokens`, `notifications`, `notification_templates`, `notification_preferences`), `jobs/send-push.job.ts`, `/api/v1/push-tokens`, `/api/v1/notifications*`.
- **Kabul:** US-054 AC1–AC3 (olay tablosundaki olaylar ilgili modüller yazıldıkça bağlanır); kullanıcının dilinde şablon; `DeviceNotRegistered` anahtarı silinir.
- **Test:** Entegrasyon (mock).

### F1.12 — API istemci üretimi ve sözleşme kontrolü

- **Amaç:** Web ve mobil için üretilmiş tipler; CI'da sözleşme denetimi.
- **Belgeler:** [ADR-0022](../04-decisions/adr-0022-rest-api-versioning-and-contract-first.md).
- **Dosyalar:** `packages/api-client/{generate.ts, index.ts}`, `scripts/contract-check.ts`, CI `contract` işi.
- **Kabul:** `pnpm generate:api` `openapi.yaml`'dan tipleri üretir; uygulamanın ürettiği şema ile dosya farklıysa CI başarısız.
- **Test:** CI.

### F1.13 — Web iskeleti

- **Amaç:** Giriş, dil, işletme seçici, izinlerden menü.
- **Belgeler:** US-001, US-003, US-058, [product-report.md](../product-report.md) "Ekranlar ve rol bazlı görünüm".
- **Dosyalar:** `web/app/[locale]/(auth)/login/*`, `web/lib/{api.ts, session.ts, i18n.ts}`, `web/features/shell/*` (menü, işletme seçici, dil seçici), `web/app/[locale]/(admin)|(seller)|(buyer)/layout.tsx`.
- **Kabul:** Mock SMS koduyla giriş; işletme değiştirince menü değişir; izin olmayan menü öğesi görünmez; az/ru/tr geçişi.
- **Test:** Playwright E2E-01.

> **Bölündü (Mimar, 2026-10-24):** F1.13a — giriş, oturum (yenileme anahtarı httpOnly cookie, TM-21), dil altyapısı. F1.13b — kabuk: işletme seçici, izinden menü, rol düzenleri, E2E-01. Kartlar: `docs/tasks/F1.13a.md`, `docs/tasks/F1.13b.md`.

### F1.14 — Mobil iskeleti

- **Amaç:** Giriş, dil, menü, minimum sürüm, push kaydı.
- **Belgeler:** US-001, US-060.
- **Dosyalar:** `mob/app/(auth)/*`, `mob/src/lib/{api.ts, session.ts (secure-store), i18n.ts, push.ts}`, `mob/src/features/shell/*`, `GET /api/app-config` (backend, `m/app-config/*`).
- **Kabul:** Giriş; yenileme anahtarı güvenli depoda; minimum sürüm altında güncelleme ekranı; push anahtarı kaydedilir.
- **Test:** Maestro E2E-01 (Android).

> **Bölündü (Mimar, 2026-10-24):** F1.14a — giriş, güvenli depoda oturum (`expo-secure-store`), dil altyapısı. F1.14b — menü, `GET /api/app-config` ve minimum sürüm, push kaydı, Maestro E2E-01. Kartlar: `docs/tasks/F1.14a.md`, `docs/tasks/F1.14b.md`.

> **F1 uygulama sırası** (bağımlılıklara göre değişti): `docs/tasks/F1-faz-spesifikasyonu.md` §2. Ortak kurallar: aynı belge §6.

---

## F2 — Hesaplar ve bağlantı ağı

### F2.1 — Admin: toptancı açma

- **Amaç:** K1'in uygulanması.
- **Belgeler:** US-009, [ADR-0004](../04-decisions/adr-0004-capability-based-authorization.md).
- **Dosyalar:** `m/platform-admin/sellers.*`, `POST /api/v1/admin/sellers`, davet (`invitations`, 7 gün), `web/app/[locale]/(admin)/sellers/*`.
- **Kabul:** US-009 AC1–AC4.
- **Test:** Entegrasyon + Playwright E2E-02.

> **Bölündü (Mimar, 2026-10-31):** F2.1a — API: toptancı açma (tek platform işlemi), aktivasyon daveti ve yeniden gönderme, davet kabulü (`invitation_accept` SECURITY DEFINER), `GET /admin/plans` (yalnız okuma). F2.1b — admin toptancı ekranları, aktivasyon sayfası, platform menüsü, Playwright E2E-02. Kartlar: `docs/tasks/F2.1a.md`, `docs/tasks/F2.1b.md`. F2 sırası ve açık sorular: `docs/tasks/F2-faz-spesifikasyonu.md`.

### F2.2 — Toptancı başvuru formu

- **Belgeler:** US-008.
- **Dosyalar:** `seller_applications`, `POST /api/v1/seller-applications` (genel, hız sınırlı), `GET /api/v1/admin/seller-applications`, başvurudan toptancı açma, web başvuru sayfası.
- **Kabul:** US-008 AC1–AC3; `onboarding.seller_mode = manual` iken toptancı kayıt seçeneği yok.
- **Test:** Entegrasyon.

### F2.3 — Perakendeci self-servis kaydı

- **Belgeler:** US-005, SF-02, NFR-63.
- **Dosyalar:** `m/onboarding/buyer-registration.*` (c4 §1: `businesses` rol/abonelik çağıramaz; Mimar onayı F2.3a K1), `POST /api/v1/buyers/register`, veri paylaşım metni (3 dil, sürümlü), web + mobil kayıt ekranları.
- **Bölündü:** F2.3a (API, migration, seed) · F2.3b (web + mobil ekranlar, E2E-03).
- **Kabul:** US-005 AC1–AC4; onay sürümü ve zamanı kaydedilir; outbox `buyer.registered`.
- **Test:** Entegrasyon + E2E-03.

### F2.4 — VÖEN girişi

- **Belgeler:** US-006, F0.1 çıktısı.
- **Dosyalar:** `PATCH /api/v1/business` (VÖEN), web + mobil profil ekranı.
- **Kabul:** US-006 AC1–AC5.
- **Test:** Birim + entegrasyon.

### F2.5 — Şubeler ve onay kuralları

- **Belgeler:** US-010.
- **Dosyalar:** `/api/v1/branches*`, şube ekranları (web + mobil, konum seçimi).
- **Kabul:** US-010 AC1–AC4.
- **Test:** Entegrasyon.

### F2.6 — Depolar, satıcı profili, hizmet bölgeleri

- **Belgeler:** US-011.
- **Dosyalar:** `/api/v1/warehouses`, satıcı profil ve hizmet bölgesi ekranı (web).
- **Kabul:** US-011 AC1–AC3; `warehouses.max` hakkı.
- **Test:** Entegrasyon.

### F2.7 — Ekip yönetimi

- **Belgeler:** US-013.
- **Dosyalar:** `/api/v1/team/*`, web ekip ekranı, mobil davet kabulü.
- **Kabul:** US-013 AC1–AC5; temsilcinin bölge kapsamı (`membership_regions`).
- **Test:** Entegrasyon + izolasyon.

### F2.8 — İşletmeye özel rol

- **Belgeler:** US-014.
- **Dosyalar:** `POST /api/v1/team/roles`, web rol düzenleyici.
- **Kabul:** US-014 AC1–AC2.
- **Test:** Entegrasyon.

### F2.9 — Admin: unvan ve rol şablonları

- **Belgeler:** US-012.
- **Dosyalar:** `/api/v1/admin/catalog/job-titles`, `/api/v1/admin/catalog/role-templates`, admin ekranları, "yeni şablon sürümü" bildirimi.
- **Kabul:** US-012 AC1–AC3.
- **Test:** Entegrasyon.

### F2.10 — Gizlilik ayarları

- **Belgeler:** US-007, [ADR-0014](../04-decisions/adr-0014-buyer-privacy-defaults.md).
- **Dosyalar:** `/api/v1/business/privacy`, mobil + web gizlilik ekranı.
- **Kabul:** US-007 AC1–AC3 (dizin tarafı AC4–AC6 F2.11'de).
- **Test:** Entegrasyon.

### F2.11 — Perakendeci dizini

- **Belgeler:** US-019, US-020, US-007 AC4–AC6, [ADR-0011](../04-decisions/adr-0011-meilisearch-and-bullmq.md), TM-09, TM-10.
- **Dosyalar:** `m/directory/*`, Meilisearch `buyer_directory` indeksi (yalnızca açık alanlar), outbox tüketicisi, `GET /api/v1/directory/buyers`, hız sınırı, web + mobil (temsilci) dizin ekranı, `search:reindex` komutu.
- **Kabul:** US-019 AC1–AC6; US-020 AC1–AC2; yanıtta başka bağlantı bilgisi yok (şema testi).
- **Test:** Entegrasyon (Meilisearch container) + izolasyon.

### F2.12 — Bağlantı isteği

- **Belgeler:** US-021, [ADR-0013](../04-decisions/adr-0013-seller-initiated-connections.md), SF-03, [state-machines.md](../03-architecture/state-machines.md) §1, [test-strategy.md](../05-planning/test-strategy.md) §3.2.
- **Dosyalar:** `m/connections/*` (`connection_requests`, `connections`, `blocks`), `connection-policy.ts` (**önce test**), `POST /api/v1/connection-requests`, `GET .../outgoing`, web + mobil istek gönderme.
- **Kabul:** US-021 AC1–AC7; eşzamanlı istek; kota satıcı saat diliminde.
- **Test:** Birim (politika tablosu) + entegrasyon.

### F2.13 — İsteğe yanıt ve geri çekme

- **Belgeler:** US-022, US-023, SF-03.
- **Dosyalar:** `.../incoming`, `.../accept`, `.../reject`, `.../withdraw`, `/api/v1/blocks*`, perakendeci istek ekranları (mobil + web), push bağlantıları.
- **Kabul:** US-022 AC1–AC2; US-023 AC1–AC6.
- **Test:** Entegrasyon + E2E-04.

### F2.14 — Bağlantı koşulları

- **Belgeler:** US-024.
- **Dosyalar:** `PATCH /api/v1/connections/{id}/terms`, `GET /api/v1/connections`, web müşteri ekranı. (`price_list_id` F3.6'ya kadar null kalır.)
- **Kabul:** US-024 AC1–AC3.
- **Test:** Entegrasyon.

### F2.15 — Bağlantı iptali

- **Belgeler:** US-025, SF-07, [state-machines.md](../03-architecture/state-machines.md) §2.
- **Dosyalar:** `POST /api/v1/connections/{id}/cancel`, outbox `connection.cancelled`, iptal onay ekranları. Sepet/sipariş etkileri için kanca (`ConnectionCancelledHandler` arayüzü), uygulaması F4.5'te.
- **Kabul:** US-025 AC1, AC5, AC6; bekleme süresi (perakendeci iptali).
- **Test:** Entegrasyon + E2E-09 (kısmi).

### F2.16 — İstek süre dolumu

- **Belgeler:** US-026.
- **Dosyalar:** `m/connections/jobs/expire-requests.job.ts` (15 dk, Redis kilidi), `ops_metrics` son çalışma kaydı.
- **Kabul:** US-026 AC1–AC2; iki kopya aynı anda çalışınca tek etki.
- **Test:** Entegrasyon (`Clock` taklidi).

### F2.17 — Bağlantısız hesap politikası

- **Belgeler:** US-027, [state-machines.md](../03-architecture/state-machines.md) §9.
- **Dosyalar:** `m/directory/jobs/dormant-accounts.job.ts` (gece), bildirim şablonları, anonimleştirme servisi (`person_data`).
- **Kabul:** US-027 AC1–AC5.
- **Test:** Entegrasyon (zaman yolculuğu).

### F2.18 — Admin: moderasyon, askıya alma, arşivleme

- **Belgeler:** US-015, US-016 AC1–AC3, AC5.
- **Dosyalar:** `/api/v1/admin/buyers*`, `/api/v1/admin/businesses/{id}/status`, admin ekranları; platform bağlamının fiyat/sipariş/cari yazamadığını gösteren RLS politikaları.
- **Kabul:** US-015 AC1–AC2; US-016 AC1–AC3, AC5.
- **Test:** Entegrasyon.

### F2.19 — Admin: ayarlar ekranı

- **Belgeler:** US-017.
- **Dosyalar:** `/api/v1/admin/settings`, admin ayar ekranı (kapsam seçici).
- **Kabul:** US-017 AC1–AC3.
- **Test:** Entegrasyon.

---

## F3 — Katalog, fiyat ve stok

### F3.1 — Birim kataloğu

- **Belgeler:** US-028, [product-report.md](../product-report.md) "Birim ve ambalaj".
- **Dosyalar:** `m/catalog/units.*` (`units`, `unit_conversions`), seed (US-028 başlangıç listesi), admin ekranı.
- **Kabul:** US-028 AC1–AC4.
- **Test:** Entegrasyon.

### F3.2 — Kategori, marka, faaliyet alanı

- **Belgeler:** US-029.
- **Dosyalar:** `categories`, `brands`, `activity_types` yönetimi; marka talebi akışı; admin ekranları.
- **Kabul:** US-029 AC1–AC2; kategori derinliği ≤ 3.
- **Test:** Entegrasyon.

> **Bölündü (Mimar, 2026-11-16):** F3.2a — API + migration `0033` + seed (kategori, marka, faaliyet alanı; marka talebi). F3.2b — admin katalog ekranları. Kart: `docs/tasks/F3.2a.md`; faz spesifikasyonu `docs/tasks/F3-faz-spesifikasyonu.md`.

### F3.3 — Ürün, varyant, ambalaj

- **Belgeler:** US-030 AC1, AC2, AC4–AC6.
- **Dosyalar:** `m/catalog/products.*` (`products`, `product_variants`, `product_packaging`, `product_visibility`), `/api/v1/products*`, web ürün formu.
- **Kabul:** Belirtilen AC'ler; satış birimi kuralları (`min_order_qty`, `order_multiple`); SKU benzersizliği.
- **Test:** Birim (ambalaj dönüşümü) + entegrasyon + izolasyon.

> **Bölündü (Mimar, 2026-11-16):** F3.3a — API + migration `0034` (ürün, varyant, ambalaj, görünürlük; S3 satıcı kategorileri). F3.3b — web ürün listesi ve formu. Kart: `docs/tasks/F3.3a.md`.

### F3.4 — Ürün görselleri

- **Belgeler:** US-030 AC3.
- **Dosyalar:** `product_images`, `jobs/resize-image.job.ts` (sharp; 200/800/1600 px), web görsel yükleyici.
- **Kabul:** US-030 AC3; ürün başına ≤ 8 görsel.
- **Test:** Entegrasyon.

> **Bölündü (Usta, 2026-11-26):** F3.4a — API + migration `0035` + worker küçültme işi (`catalog` kuyruğu). F3.4b — web görsel yükleyici. Kart: `docs/tasks/F3.4a.md`.

### F3.5 — Excel içe aktarma

- **Belgeler:** US-031, SF-08.
- **Dosyalar:** `m/imports/*` (`import_jobs`; ürün türü bu adımda, `customer_prices` F3.7'de, `stock` F3.11'de eklenir), şablon üretici (exceljs), doğrulayıcı, uygulayıcı (500'lük partiler), `/api/v1/imports*`, web içe aktarma sihirbazı.
- **Kabul:** US-031 AC1–AC5; F0.2'deki gerçek örnek dosya (anonimleştirilmiş) şablona dönüştürülüp içe aktarılabiliyor.
- **Test:** Entegrasyon (5.000 satırlık sentetik dosya, süre ölçümü).

> **Bölündü (Mimar, 2026-11-26, S5 = B):** F3.5a — şablon, yükleme, doğrulama/önizleme, hata raporu, 24 saat silme, SKU harf duyarsızlığı (`0037`). F3.5c — uygulama, fiyat yazımı, sonuç raporu, AC5. F3.5b — web sihirbazı (F3.5c'den sonra). Kartlar: `docs/tasks/F3.5a.md`, `docs/tasks/F3.5c.md` (`0038`).

### F3.6 — Fiyat listeleri ve PriceResolver

- **Belgeler:** US-034, [ADR-0019](../04-decisions/adr-0019-price-resolution-order.md), [test-strategy.md](../05-planning/test-strategy.md) §3.1.
- **Dosyalar:** `m/pricing/*` (`price_lists`, `price_list_items`), `price-resolver.ts` + `price-resolver.cases.ts` (**önce test**: P1–P11), `/api/v1/price-lists*`, `/api/v1/prices/explain`, bağlantı koşullarına fiyat listesi seçimi, web fiyat ekranları.
- **Kabul:** US-034 AC1–AC6.
- **Test:** Birim (P1–P11) + entegrasyon.

> **Bölündü (Mimar, 2026-11-16):** F3.6a — tablolar (`0036`), `PriceResolver` çekirdeği + P1–P11, `/price-lists*`, `/prices/explain`, bağlantıya liste atama. F3.6b — web fiyat ekranları. F3.6a, F3.5a'dan önce (Excel şablonundaki fiyat varsayılan listeye yazılır). Kartlar: `docs/tasks/F3.6a.md`, `docs/tasks/F3.6b.md`.

### F3.7 — Müşteri fiyatı

- **Belgeler:** US-035.
- **Dosyalar:** `customer_prices` (branch_id null), `/api/v1/customer-prices`, `imports` modülüne `customer_prices` türü.
- **Kabul:** US-035 AC1–AC2.
- **Test:** Entegrasyon + P3.
- **Bölme (H7):** F3.7a = API, migration `0039`, Excel `customer_prices` türü (`docs/tasks/F3.7a.md`); F3.7b = web "Özel fiyatlar" sekmesi ve sihirbazda müşteri fiyatı türü.

### F3.8 — Şube fiyatı ve şube indirimi

- **Belgeler:** US-036, D3.
- **Dosyalar:** `customer_prices.branch_id`, `connections.branch_pricing_enabled`, `branch_discounts`, `/api/v1/branch-discounts`, web ekranları.
- **Kabul:** US-036 AC1–AC2; P4, P5, P8.
- **Test:** Birim + entegrasyon.

### F3.9 — Kademeli fiyat

- **Belgeler:** US-037.
- **Dosyalar:** `tier_prices`, `PUT /api/v1/tier-prices`.
- **Kabul:** US-037 AC1; P7.
- **Test:** Birim.
- **Durum:** Tek PR (`docs/tasks/F3.9.md`): migration `0041`, `GET/PUT /tier-prices`, `/prices/explain?qty=`, web ürün formunda kademe kartı (kullanıcı kararı S1 = A); kurallar S2 = A.

### F3.10 — Stok modları 0–1

- **Belgeler:** US-038, [ADR-0018](../04-decisions/adr-0018-stock-modes.md).
- **Dosyalar:** `seller_profiles.stock_mode` ayar ekranı, `PUT /api/v1/variants/{id}/availability`.
- **Kabul:** US-038 AC1–AC2.
- **Test:** Entegrasyon.

### F3.11 — Miktarlı stok ve hareketler

- **Belgeler:** US-039 AC1, AC6, AC7.
- **Dosyalar:** `m/inventory/*` (`stock`, `stock_movements`), `StockService` (receipt, adjustment), `/api/v1/stock*`, depo ekranı (web + mobil), `imports` modülüne `stock` türü.
- **Kabul:** Belirtilen AC'ler; hareket olmadan stok değişmez.
- **Test:** Entegrasyon.

### F3.12 — Ürün arama ve perakendeci ürün listesi

- **Belgeler:** US-032, [ADR-0011](../04-decisions/adr-0011-meilisearch-and-bullmq.md), NFR-11.
- **Dosyalar:** Meilisearch `products` indeksi (tüm dillerde ad, eş anlamlılar Kiril/Latin), outbox tüketicisi, `buyer_visible_products` fonksiyonu (aktif bağlantı kontrolü), `GET /api/v1/browse/products`, perakendeci ürün listesi ve filtreler (mobil + web).
- **Kabul:** US-032 AC1–AC4; bağlantısı olmayan satıcının ürünü hiçbir yolla dönmez (izolasyon testi).
- **Test:** Entegrasyon + izolasyon + E2E-05.

### F3.13 — Barkod tarama

- **Belgeler:** US-033.
- **Dosyalar:** `mob/src/features/browse/barcode-scanner.tsx` (expo-camera), `gtin` sorgu parametresi.
- **Kabul:** US-033 AC1.
- **Test:** Elle (fiziksel cihaz) + entegrasyon (`gtin` filtresi).

### F3.14 — Favoriler

- **Belgeler:** US-045 AC2.
- **Dosyalar:** `favorites`, `/api/v1/favorites/{productId}`, "Favorilerim" filtresi.
- **Kabul:** US-045 AC2.
- **Test:** Entegrasyon.

---

## F4 — Sepet ve sipariş

### F4.1 — Şube sepeti

- **Belgeler:** US-040.
- **Dosyalar:** `m/cart/*` (`carts`, `cart_items`), `GET /api/v1/cart`, `PUT /api/v1/cart/items`, sepet ekranı (mobil + web; toptancıya göre gruplu).
- **Kabul:** US-040 AC1–AC4.
- **Test:** Entegrasyon.

### F4.2 — Şube onayı

- **Belgeler:** US-041, [state-machines.md](../03-architecture/state-machines.md) §6.
- **Dosyalar:** `cart_approvals`, `POST /api/v1/cart/submit`, `/approve`, `/return`, onay ekranı, push.
- **Kabul:** US-041 AC1–AC4.
- **Test:** Entegrasyon.

### F4.3 — Bölünme ve sipariş oluşumu

- **Belgeler:** US-042, [ADR-0015](../04-decisions/adr-0015-shared-cart-split-per-seller.md), SF-04, [test-strategy.md](../05-planning/test-strategy.md) §3.4.
- **Dosyalar:** `m/orders/*` (`orders`, `order_items`, `order_status_history`, `seller_sequences`), `order-state-machine.ts` (**önce test**: geçiş tablosu), `CartService.submit` bölünme, VÖEN kontrolü.
- **Kabul:** US-042 AC1–AC5; NFR-12 (5 satıcı, 100 kalem) p95 < 1,5 sn.
- **Test:** Birim (durum makinesi) + entegrasyon + performans testi.

### F4.4 — Toptancı onayı ve stok rezervasyonu

- **Belgeler:** US-043, US-039 AC2–AC5, SF-05, [test-strategy.md](../05-planning/test-strategy.md) §3.3.
- **Dosyalar:** `order_item_changes`, `/api/v1/orders/{id}/approve|reject|prepare`, `StockService.reserve/release/ship`, toptancı sipariş onay ekranı.
- **Kabul:** US-043 AC1–AC5; US-039 AC2–AC5; eşzamanlı son stok testi.
- **Test:** Entegrasyon (paralel işlem).

### F4.5 — İptaller

- **Belgeler:** US-025 AC2–AC4, [state-machines.md](../03-architecture/state-machines.md) §3.
- **Dosyalar:** `/api/v1/orders/{id}/cancel`, `ConnectionCancelledHandler` uygulaması (sepet ve `submitted` siparişler).
- **Kabul:** US-025 AC2–AC4; iptalde stok `release`.
- **Test:** Entegrasyon + E2E-09.

### F4.6 — Sipariş listeleri ve detay

- **Belgeler:** US-043, US-048, [openapi.yaml](../03-architecture/api/openapi.yaml) `Order`.
- **Dosyalar:** `GET /api/v1/orders`, `GET /api/v1/orders/{id}`, toptancı ve perakendeci liste/detay ekranları (web + mobil).
- **Kabul:** Filtreler; perakendeci yalnızca kendi şubesini (kapsam `branch`) görür; durum geçmişi görünür.
- **Test:** Entegrasyon + izolasyon.

### F4.7 — Sipariş belgesi PDF

- **Belgeler:** US-044.
- **Dosyalar:** `m/documents/*` (`documents`), `jobs/render-order-document.job.ts` (pdfkit + Noto Sans), `POST /api/v1/orders/{id}/document`, `GET /api/v1/documents/{id}`.
- **Kabul:** US-044 AC1–AC3; az/ru/tr karakterleri doğru (ə, ş, ç, Kiril); NFR-16.
- **Test:** Entegrasyon (PDF metin çıkarımıyla doğrulama).

### F4.8 — Tekrar sipariş

- **Belgeler:** US-045 AC1.
- **Dosyalar:** `POST /api/v1/orders/{id}/reorder`.
- **Kabul:** US-045 AC1.
- **Test:** Entegrasyon.

---

## F5 — Teslimat ve cari

### F5.1 — Kargocu atama

- **Belgeler:** US-046, [integrations.md](../03-architecture/integrations.md) §6 (`DeliveryProvider`).
- **Dosyalar:** `m/delivery/*` (`deliveries`, `delivery_attempts`), `providers/{own-courier.ts, manual-carrier.ts}`, `POST /api/v1/orders/{id}/delivery`, `GET /api/v1/deliveries/mine`, `/depart`, kargocu mobil "Bugün" ekranı.
- **Kabul:** US-046 AC1–AC4.
- **Test:** Entegrasyon + izolasyon.

### F5.2 — "Teslim ettim"

- **Belgeler:** US-047, SF-06.
- **Dosyalar:** `delivery_proofs`, `/deliveries/{id}/delivered`, `/failed`, mesafe hesabı (haversine), mobil teslim ekranı (kamera, konum), çevrimdışı yeniden deneme kuyruğu (yalnızca bu uç).
- **Kabul:** US-047 AC1–AC4; `deliveredAt` 24 saatten eskiyse `DELIVERY_TIMESTAMP_TOO_OLD`.
- **Test:** Birim (mesafe) + entegrasyon.

### F5.6 — Cari: borç ve bakiyeler

- **Belgeler:** US-050, [ADR-0020](../04-decisions/adr-0020-append-only-ledger-per-pair.md).
- **Dosyalar:** `m/ledger/*` (`ledger_entries`), `LedgerService.post(entry, tx)` (yalnızca ekleme), `/api/v1/ledger/balances`, `/api/v1/ledger/entries`, cari ekranları (toptancı web, perakendeci mobil + web).
- **Kabul:** US-050 AC2–AC4; `order_delivered` için kısmi unique; AC1 F5.3'te teslim akışıyla doğrulanır.
- **Test:** Entegrasyon + izolasyon.

### F5.3 — Teslim onayı, itiraz, otomatik onay

- **Belgeler:** US-048 AC1–AC3, AC5, [ADR-0016](../04-decisions/adr-0016-delivery-confirmation-and-auto-confirm.md).
- **Dosyalar:** `disputes`, `/orders/{id}/confirm-delivery`, `/dispute`, `jobs/auto-confirm.job.ts`, perakendeci onay/itiraz ekranı, (Should) 24. saat hatırlatma push'u. Teslim kesinleşirken aynı işlemde `LedgerService.post` doğrudan çağrılır (`delivery → ledger` yönü; F5.6 önce yapılır).
- **Kabul:** Belirtilen AC'ler; US-050 AC1 (teslimde tek borç kaydı).
- **Test:** Entegrasyon (zaman yolculuğu) + E2E-07 (kısmi).

### F5.4 — İtiraz çözümü

- **Belgeler:** US-048 AC4, [state-machines.md](../03-architecture/state-machines.md) §5.
- **Dosyalar:** `/orders/{id}/resolve-dispute`, toptancı itiraz ekranı.
- **Kabul:** US-048 AC4.
- **Test:** Entegrasyon.

### F5.5 — Manuel dış kargo

- **Belgeler:** US-049.
- **Dosyalar:** `manual-carrier` akışı; depo ekranında firma ve takip no.
- **Kabul:** US-049 AC1–AC2.
- **Test:** Entegrasyon.

### F5.7 — Tahsilat ve kargocu nakdi

- **Belgeler:** US-051, [state-machines.md](../03-architecture/state-machines.md) §7.
- **Dosyalar:** `payments`, `courier_cash`, `/api/v1/payments*`, `/api/v1/courier-cash*`, tahsilat ekranları (muhasebe web, kargocu ve temsilci mobil).
- **Kabul:** US-051 AC1–AC4.
- **Test:** Entegrasyon + E2E-08.

### F5.8 — Ekstre PDF

- **Belgeler:** US-052.
- **Dosyalar:** `jobs/render-statement.job.ts`, `POST /api/v1/statements`.
- **Kabul:** US-052 AC1.
- **Test:** Entegrasyon.

### F5.9 — e-qaimə uyumlu dışa aktarma

- **Belgeler:** US-053, F0.1 çıktısı.
- **Dosyalar:** `jobs/export-einvoice.job.ts` (exceljs), `POST /api/v1/exports/einvoice`, `PUT /api/v1/orders/{id}/einvoice-number`.
- **Kabul:** US-053 AC1–AC2; `feature.export` hakkı.
- **Test:** Entegrasyon (dosya sütun doğrulaması).

---

## F6 — Dashboard ve yayın hazırlığı

### F6.1 — Rol bazlı dashboardlar

- **Belgeler:** US-056, [product-report.md](../product-report.md) "Dashboardlar", [observability.md](../06-operations/observability.md) §2.2.
- **Dosyalar:** `m/reporting/*` (salt-okunur sorgular, kart tanımları role göre), `GET /api/v1/dashboard`, web ve mobil dashboard ekranları.
- **Kabul:** US-056 AC1–AC4.
- **Test:** Entegrasyon (her rol için kart seti) + performans.

### F6.2 — Audit log ekranı

- **Belgeler:** US-057 AC2.
- **Dosyalar:** `GET /api/v1/audit-logs`, web ekranı (işletme admini + platform).
- **Kabul:** US-057 AC2.
- **Test:** İzolasyon.

### F6.3 — Planlar, abonelikler, salt-okunur mod

- **Belgeler:** US-055, [state-machines.md](../03-architecture/state-machines.md) §8.
- **Dosyalar:** `/api/v1/admin/plans`, `/api/v1/admin/subscriptions/{businessId}`, `jobs/subscription-status.job.ts` (gece), `SUBSCRIPTION_READ_ONLY` kontrolü (istek gönderme, sipariş onayı).
- **Kabul:** US-055 AC1–AC5.
- **Test:** Entegrasyon.

### F6.4 — Perakendeci birleştirme

- **Belgeler:** US-016 AC4.
- **Dosyalar:** `POST /api/v1/admin/buyers/merge`, birleştirme servisi (tek işlem; bağlantılar, siparişler, cari, kullanıcılar), admin ekranı.
- **Kabul:** US-016 AC4; çakışan aktif bağlantıda (aynı satıcıyla iki aktif bağlantı) işlem reddedilir ve listelenir.
- **Test:** Entegrasyon.

### F6.5 — Gerçek SMS sağlayıcısı

- **Belgeler:** NFR-98, [ADR-0021](../04-decisions/adr-0021-mock-sms-in-non-production.md), [integrations.md](../03-architecture/integrations.md) §2. **Ön koşul:** sağlayıcı seçildi (açık soru).
- **Dosyalar:** `api/infrastructure/sms/<sağlayıcı>-sms-sender.ts`, devre kesici, metrikler.
- **Kabul:** Production yapılandırmasında gerçek sağlayıcıyla OTP; 5 farklı operatör numarasına test; hata oranı alarmı (AL-10).
- **Test:** Sözleşme testi (sağlayıcı sandbox veya kayıtlı yanıtlar) + elle.

### F6.6 — Çevirilerin tamamlanması

- **Belgeler:** NFR-70, US-058.
- **Çıktı:** az, ru, tr eksik anahtar raporu boş; bildirim ve PDF şablonları 3 dilde.
- **Test:** CI'da eksik anahtar kontrolü (az, ru, tr).

### F6.7 — Production ortamı, gözlem ve alarmlar

- **Belgeler:** [infrastructure.md](../03-architecture/infrastructure.md), [observability.md](../06-operations/observability.md), [runbook.md](../06-operations/runbook.md), [environments-cicd.md](../06-operations/environments-cicd.md) §4–5.
- **Dosyalar:** `infra/{docker-compose.prod.yml, Caddyfile, bootstrap.sh, deploy.sh, rollback.sh}`, `.github/workflows/deploy.yml`, `api/cli.ts` (runbook komutları), `ops_metrics` + toplayıcı iş, `/api/internal/metrics`, log arşiv işi, Sentry, uptime izleyici, Lightsail alarmları.
- **Kabul:** `main` → staging otomatik; etiket → production manuel onay; AL-01–AL-17 tanımlı ve en az AL-01, AL-06, AL-09 bilinçli hata ile tetiklendi; runbook betik adları belgeyle aynı.
- **Test:** Dağıtım ve geri dönüş provası (RB-03).

### F6.8 — Güvenlik gözden geçirmesi

- **Belgeler:** [threat-model.md](../03-architecture/threat-model.md), NFR-40–53.
- **Çıktı:** `docs/reports/security-review-<tarih>.md`: TM-01–TM-32 önlemlerinin durumu, ASVS L1 kontrol listesi, bulgular ve düzeltme PR'ları.
- **Kabul:** Kritik ve yüksek bulgu kalmadı.
- **Test:** İzolasyon paketi tam; elle kontroller.

### F6.9 — Yük testi

- **Belgeler:** NFR-01–21, [test-strategy.md](../05-planning/test-strategy.md) §1.
- **Dosyalar:** `tests/load/*.js` (k6), `scripts/seed-demo.ts` (tasarım tavanı verisi).
- **Kabul:** NFR-10–16 staging'de karşılandı; rapor `docs/reports/load-test-<tarih>.md`.
- **Test:** k6.

### F6.10 — Geri yükleme provası

- **Belgeler:** RB-08, NFR-36.
- **Çıktı:** `docs/incidents/restore-drill-<tarih>.md` (süre ölçümü).
- **Kabul:** RTO ≤ 4 saat ölçüldü.

### F6.11 — Mobil test dağıtımı

- **Belgeler:** [environments-cicd.md](../06-operations/environments-cicd.md) §4.1, [integrations.md](../03-architecture/integrations.md) §5.
- **Dosyalar:** `mob/eas.json`, `.github/workflows/mobile.yml`, gizlilik metni ve hesap silme bağlantısı (mağaza gereği).
- **Kabul:** TestFlight ve Play iç testte kurulabilir sürüm; `app-config` minimum sürüm ayarlı.
- **Test:** Maestro E2E listesi (Android) + iOS'ta elle.

### F6.12 — (Could) Loglu kullanıcı taklidi

- **Belgeler:** US-018.
- **Dosyalar:** `impersonation_sessions`, `/api/v1/admin/impersonations`, salt-okunur guard, "Destek görünümü" şeridi.
- **Kabul:** US-018 AC1–AC3.

### F6.13 — (Could) Temsilcinin müşteri adına sipariş girmesi

- **Belgeler:** US-061 (açık soru çözülmeli), `feature.rep_orders_on_behalf`.
- **Dosyalar:** temsilci sepeti, `orders.created_by_seller_user_id`, itiraz penceresi.
- **Kabul:** US-061 AC1–AC2.

---

## F7 — Pilot

### F7.1 — Pilot veri aktarımı

- **Amaç:** Pilot toptancıların ürün, fiyat ve kullanıcılarını production'a yüklemek.
- **Kabul:** Her toptancı için içe aktarma raporunda hatalı satır < %2; örnek 20 ürünün fiyatı toptancı sahibiyle birlikte kontrol edildi.

### F7.2 — Eğitim

- **Çıktı:** Rol bazlı 3–5 dakikalık videolar (az, ru); yerinde eğitim.
- **Kabul:** Her rolden en az bir kişi tek başına temel akışını tamamladı.

### F7.3 — Y2 kapalı pilot

- **Kabul:** Toptancı ekipleri gerçek veriyle 1 hafta; kritik hata yok; [design-doc.md](../03-architecture/design-doc.md) §9 Y2 çıkış ölçütü.

### F7.4 — Y3 açık pilot

- **Kabul:** Perakendeciler kaydoluyor, bağlantılar kuruluyor; KPI'lar `ops_metrics` / dashboard'da haftalık izleniyor.

### F7.5 — Haftalık geri bildirim döngüsü

- **Kabul:** Her hafta: pilot toptancı görüşmesi notu, hata listesi, yayınlanan düzeltmeler (CHANGELOG); kapsam koruma kuralları ([roadmap.md](../05-planning/roadmap.md) §3).

### F7.6 — Pilot değerlendirmesi

- **Çıktı:** `docs/reports/pilot-review.md`: KPI sonuçları, karar ([project-charter.md](../01-discovery/project-charter.md) §8), Faz 2 öncelik listesi, yeni ADR'ler.
