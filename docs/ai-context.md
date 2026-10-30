# AI bağlam özeti

Usta ve Müfettiş göreve başlarken önce bu dosyayı ve görev kartını okur. Müfettiş ayrıca [review-guide.md](07-ai-development/review-guide.md) dosyasını okur. Bu dosya bir **özettir**; ayrıntı ve kesin metin bağlantı verilen belgededir. Çelişkide belge geçerlidir. Her PR bu dosyayı gerekiyorsa günceller (bitmiş adımlar, yeni ortak kural, yeni varsayılan karar).

Son güncelleme: 2026-10-30 (F1.12 birleşti; F1.11 PR açık).

## 1. Mimari özeti

- Modüler monolit, TypeScript her yerde ([ADR-0001](04-decisions/adr-0001-modular-monolith.md), [ADR-0002](04-decisions/adr-0002-typescript-full-stack.md)). NestJS (Fastify) API + aynı koddan worker; Drizzle ORM ([ADR-0005](04-decisions/adr-0005-drizzle-orm.md)); PostgreSQL 16 + RLS ([ADR-0003](04-decisions/adr-0003-tenant-isolation-with-rls.md)); Redis + BullMQ, Meilisearch ([ADR-0011](04-decisions/adr-0011-meilisearch-and-bullmq.md)).
- Modüller arası içe aktarma yalnızca hedef modülün `index.ts` dosyasından; bağımlılık yönü [c4-component.md](03-architecture/c4-component.md) §1. Controller → servis → kendi repository'si ([coding-guidelines](07-ai-development/coding-guidelines.md) §3).
- Ertelenebilir yan etkiler transactional outbox ile ([ADR-0010](04-decisions/adr-0010-transactional-outbox.md)); dış servisler adaptör arkasında ([ADR-0008](04-decisions/adr-0008-adapters-for-external-services.md)); yerelde SMS mock ([ADR-0021](04-decisions/adr-0021-mock-sms-in-non-production.md)).
- Yetki yetenek (`seller`/`buyer`) + izinle, işletme tipiyle değil ([ADR-0004](04-decisions/adr-0004-capability-based-authorization.md)). Süre/kota → `SettingsService`, plan limiti → `EntitlementService` ([ADR-0009](04-decisions/adr-0009-layered-settings-and-entitlements.md)).
- Sözleşme önce: `docs/03-architecture/api/openapi.yaml` ([ADR-0022](04-decisions/adr-0022-rest-api-versioning-and-contract-first.md)).

## 2. Klasör yapısı (şu anki durum)

```
apps/api/drizzle/                 0000_settings … 0010_access (+ 0011_notifications, F1.11)
apps/api/db/bootstrap/roles.sql   app_user, migrator, readonly (şifresiz; pnpm db:bootstrap)
apps/api/src/core/                audit, bootstrap, config, db, errors, health, idempotency,
                                  logging, outbox, clock.ts, id-generator.ts, money.ts
apps/api/src/core/ports/          sms-sender, push-sender (dış servis portları)
apps/api/src/infrastructure/      push (expo, mock), queue, redis, sms (mock → dev_sms_outbox)
apps/api/src/modules/             access, billing, businesses, dev (yalnız local/test/staging), i18n, identity, notifications, settings
packages/api-client/              openapi.yaml → src/schema.d.ts (üretilir, elle düzenlenmez), createApiClient
packages/shared/src/              env, errors, entitlements, permissions, settings, uuidv7, voen, format…
apps/web, apps/mobile             boş kabuk (F0.3b)
```

Hedef yapı: [coding-guidelines](07-ai-development/coding-guidelines.md) §1.

## 3. Ortak kurallar (kısa)

Tam liste: [F1 faz spesifikasyonu](tasks/F1-faz-spesifikasyonu.md) §6, [data-model.md](03-architecture/data-model.md) §1.1 ve §6.

**DB erişimi** (`apps/api/src/core/db/`):

- `withTenantTx({ businessId, userId })` — kiracı işlemi; `app.business_id`, `app.user_id` ayarlanır.
- `withPlatformTx({ userId })` — yalnızca `platform-admin`; `app.is_platform = 'true'`, `business_id` boş.
- `withUserTx({ userId })` — yalnızca `app.user_id` (U tabloları, ör. kendi oturumları; F1.5b).
- `withSystemTx(fn)` — bağlamsız sistem okuması (ayar, worker); T/P/U tablolarında 0 satır görür, S tablolarına yalnızca `SECURITY DEFINER` fonksiyonla erişir.
- Doğrudan `db` nesnesi modüllerden içe aktarılmaz. Bağlam `set_config(..., true)` ile parametreli verilir.

**RLS sınıfları ve `rls:X` yorumu:**

- Her yeni tablo aynı migration'da `COMMENT ON TABLE <tablo> IS 'rls:<sınıf>'` taşır (T, P, G, U, S, D; birden çoksa `rls:T,D`). Yorumsuz tablo `pnpm check-rls`'te hata.
- T/P/U: `ENABLE` + `FORCE ROW LEVEL SECURITY`; politika kalıbı `nullif(current_setting('app.business_id', true), '')::uuid` (U'da `app.user_id`). T tablolarında ayrıca platform politikası (US-016 AC5 listesindeki tablolara asla).
- G: herkes okur (`FOR SELECT USING (true)`), her yazma politikası `app.is_platform` koşulu taşır.
- S: `app_user`'ın doğrudan `SELECT` izni yok; erişim `migrator` sahipli `SECURITY DEFINER` fonksiyonla.

**Migration kuralları:**

- Önce `data-model.md`, sonra kod. Politikalar elle SQL ile ([ADR-0005](04-decisions/adr-0005-drizzle-orm.md) §3).
- Elle eklenen SQL (fonksiyon, GRANT, COMMENT) üretilen dosyanın sonunda; dosya başında "Elle eklenen bölüm aşağıda" yorumu (F1.4a K3).
- `ALTER DEFAULT PRIVILEGES` yok; her migration `app_user` ve `readonly` yetkisini tablo tablo açıkça verir.
- Geriye uyumlu (genişlet → taşı → daralt). Şifre hiçbir dosyada yok.

**`SECURITY DEFINER` fonksiyon:** `SET search_path = pg_catalog, public, pg_temp` (pg_temp **en sonda**), `REVOKE ALL … FROM PUBLIC`, `GRANT EXECUTE … TO app_user`; testte `proconfig` kontrolü (F1.4a, F1.2b K9, F1.4b D2).

**Kişisel veri (PII) maskeleme:**

- Asla loglanmaz: OTP, anahtar, JWT, şifreli alan, `person_data`, istek gövdesinin tamamı ([coding-guidelines](07-ai-development/coding-guidelines.md) §7.3). Logger redakte listesi `core/logging/logger.module.ts`.
- Telefon logda `maskPhone` ile: `+99450***4567` (`core/logging/mask-phone.ts`).
- Audit kaydında 🔒 alanlar `core/audit/audit-mask.ts` `MASKED_AUDIT_FIELDS` ile `***` olur; anahtar adı biçimden bağımsız (snake/camelCase). data-model §5'e 🔒 alan eklenirse bu liste de güncellenir.

**i18n:** Arayüz metinleri çeviri anahtarı (az, ru, tr). Çok dilli içerik `jsonb` ([ADR-0007](04-decisions/adr-0007-jsonb-content-translations.md)); UI çevirileri `ui_translations` (G). Hata mesajı `errors.<KOD>` anahtarından: `Accept-Language`'deki ilk aktif dil → varsayılan dil → kodun kendisi (`modules/i18n/i18n.service.ts`).

**Hata kodları:** İş kuralı ihlali `DomainError(code, details?)`; `code` yalnızca `packages/shared/src/errors.ts` `ErrorCode` listesinden. Kod → HTTP eşlemesinin tek kaynağı `core/errors/http-map.ts`. Yeni kod: `ErrorCode` + `openapi.yaml` + `http-map.ts` + çeviri anahtarı birlikte. Başka kiracının kaydı her zaman `404`.

**Çalışma hızı:** yerel test dar, bir Usta konuşması = bir adım/a-b çifti, Müfettiş PR olayıyla doğrudan ([speed-and-tokens.md](07-ai-development/speed-and-tokens.md)).

**Diğer:** Para `numeric` + `decimal.js` (`core/money.ts`); saat `Clock`; kimlik `IdGenerator` (UUIDv7, `packages/shared/src/uuidv7.ts`). Testler `app_user` rolüyle bağlanır (süper kullanıcı RLS'i atlar, R1).

## 4. Bitmiş adımlar

| Adım | Ne geldi |
| --- | --- |
| F0.3a, F0.3b | monorepo, api iskeleti, docker compose, CI; boş web ve mobil |
| F1.1a, F1.1b | DB bağlantısı, roller, `withTenantTx`/`withPlatformTx`; `check-rls` + CI |
| F1.2a | hata modeli, istek kimliği, log, `Clock`, para, `env.ts` |
| F1.2b | idempotens (`Idempotency-Key`) ve outbox + dağıtıcı |
| F1.3 | diller, çeviriler, para birimleri, ülkeler, bölgeler (ilk G tabloları) |
| F1.4a, F1.4b | `SettingsService` (+ `withSystemTx`); planlar, abonelikler, `EntitlementService` |
| F1.7 | işletme çekirdek tabloları, VÖEN |
| F1.9 | audit log yazıcısı (migration 0006), ayar değişikliği audit'i |
| F1.5a | kullanıcılar, OTP (`POST /auth/otp/request`, `verifyChallenge`), mock SMS ve `/dev/sms-outbox`, `0007_identity.sql`, backend kapsam eşiği (`test:coverage:backend`) |
| F1.5b | oturum, JWT (HS256), yenileme anahtarı, `/auth/*`, `/me`, `0008_user_sessions.sql`, numara başına OTP sayacı |
| F1.6 | TOTP (`/auth/totp/setup`, `/auth/totp/verify`), kurtarma kodları, `platform_staff`, ilk süper admin seed (`SUPER_ADMIN_PHONE`), `0009_totp_platform_staff.sql` |
| F1.8a | izin kataloğu (`packages/shared/src/permissions.ts` = c4 §5), rol şablonları ve unvanlar (seed), `roles`, `role_permissions`, `memberships`, `membership_regions`, `invitations`, son admin tetikleyicisi, `list_my_memberships()`, rol değişikliği audit + outbox, `0010_access.sql` |
| F1.8b | global AccessGuard, TenantContext, `@RequirePermission`/`@Public`/`@Authenticated`/`@RequirePlatformRole`, lint kuralı, izin önbelleği + `access` kuyruğu tüketicisi, `/me` üyelik ve izinler |
| F1.12 | `packages/api-client` (`pnpm generate:api`, `createApiClient`), `pnpm contract:check` + CI `contract` işi |
| **F1.11** | **sürüyor**: `push_tokens`, `notifications`, `notification_preferences` (U), `notification_templates` (G), `push_token_register()`, `PushSender` (expo/mock), `notifications` kuyruğu, `/push-tokens`, `/notifications*`, `0011_notifications.sql` |

Sıra ve bağımlılıklar: [F1 faz spesifikasyonu](tasks/F1-faz-spesifikasyonu.md) §2. Kayıt: `CHANGELOG.md`.

## 5. Alınmış varsayılan kararlar

Kaynak: ilgili kartın "Kararlar" bölümü ve faz spesifikasyonu §4.

- **UUIDv7** kendi fonksiyonumuz, yeni paket yok (S5 → A). G tablolarında `gen_random_uuid()` istisnası var (`regions`, `activity_types`).
- **RLS politikaları** elle SQL (S6 → A); izolasyon test tablosu yalnızca test kurulumunda (S3 → A).
- **Rol şifreleri** dosyada yok; `pnpm db:bootstrap` ortamdan okur (S2 → A, faz spes. §6.8).
- **İdempotens:** eşzamanlı aynı anahtar → `409 IDEMPOTENCY_CONFLICT` (`in_progress`); yalnızca 2xx saklanır; kimliksiz uçta başlık yok sayılır (F1.2b K1–K5). Açık risk R12, R13.
- **Outbox:** `INSERT … RETURNING` yok; yük yalnızca kimlik/kod/sayı (F1.2b K6–K7).
- **Ayarlar:** okuma `withTenantTx` veya `withSystemTx`; yazma yalnızca `withPlatformTx`. Redis yoksa DB'den okunur, uyarı loglanır (F1.4a K1–K2).
- **Abonelik:** yazma yalnızca platform; aboneliksiz işletmede sayısal hak reddedilir (`ENTITLEMENT_LIMIT_REACHED`), `feature.*` kapalı; sınırsız = `null`; seed `pilot` ve `buyer_free` (F1.4b). Atama F2.1/F2.3'te (R14).
- **FK'sız sütunlar** (`settings.updated_by` vb.) `users` FK'sını F1.5a'da aldı (migration'da elle, şemada değil; bekçi testi `identity.fk.int.test.ts`); `logo_file_id` F1.10, `default_price_list_id` F3 (faz spes. §6.10).
- **Kimlik (F1.5a/b):** OTP kodu `HMAC-SHA256(OTP_HASH_KEY, 'otp:'+challengeId+':'+kod)`; hız sınırı, kilit ve numara başına yanlış sayacı (`otp.fail_window_minutes`) Redis'te, Redis yoksa `503 SMS_UNAVAILABLE`. Erişim anahtarı JWT HS256 (`typ=access`, `sub`, `sid`; izin/üyelik yok), ömür `auth.access_token_minutes`; guard veritabanına bakmaz (kapatılan oturum en geç 15 dk). Yenileme anahtarı opak, SHA-256 özeti saklanır, her yenilemede aynı ailede yeni satır; kapalı anahtar tekrar gelirse aile iptal + `401 REFRESH_TOKEN_REUSED` + audit. Kayıtsız numara → `nextStep: register` + `pendingToken` (`typ=pending`, `purpose=register`; erişim anahtarı değildir, F2.3 kullanır). Korumalı uç: `@UseGuards(AccessTokenGuard)` + `@CurrentSession()` (global guard ve `@Public()` F1.8). `users.phone_e164/status/last_login_at` yalnızca platform veya SECURITY DEFINER fonksiyonu değiştirir.
- **TOTP (F1.6):** platform rolünde (`platform_staff_role()`, S tablo) OTP sonrası oturum açılmaz: `nextStep: totp_setup | totp` + `pendingToken` (`purpose=totp`, yalnızca `/auth/totp/*`). Sır AES-256-GCM (`TOTP_ENCRYPTION_KEY`, her şifrelemede yeni nonce, AAD = user_id); kurtarma kodu aynı `code` alanında (`XXXXX-XXXXX`), HMAC özeti, tek kullanımlık; aynı TOTP adımı tekrar kabul edilmez; kullanıcı başına yanlış sayacı → `423 OTP_LOCKED`. Etkin TOTP kullanıcı tarafından kapatılamaz (tetikleyici). Testlerde sır/anahtar sabit yazılmaz, `randomBytes` ile üretilir (PR #19 dersi; `.gitleaksignore` yalnızca parmak izi düzeyinde).
- **Erişim kapısı (F1.8b):** Global `AccessGuard` (APP_GUARD, `modules/access`). Her controller metodu tam bir işaret taşır (`core/auth/access-decorators.ts`): `@Public()`, `@Authenticated()` (yalnız JWT), `@RequirePermission(kod)` (X-Business-Id → aktif üyelik → işletme `suspended`/`archived` değil → admin 2FA ayarı → yetenek → izin), `@RequirePlatformRole(...)`. İşaretsiz uç varsayılan 403; lint `b2b/require-endpoint-access` + `endpoint-access.test.ts` tüm uçları tarar (yeni açık uç bu listeye bilinçli eklenir). Bağlam `@CurrentTenant()` → `withTenantTx(tenant, …)`. Eksik/geçersiz `X-Business-Id` → `422 VALIDATION_FAILED`; üye değil → `403 PERMISSION_DENIED`. Üyelik ve işletme durumu her istekte DB'den; yalnız rol izinleri Redis'te (`access:perm:<membershipId>`, rol kimliğiyle doğrulanır). `AccessTokenGuard` kalktı; `/me` access modülünde (`twoFactorRecommended`, üyelikler, `activeBusiness`). Yeni ayarlar: `access.permission_cache_seconds`, `security.require_admin_2fa`. Platform rolleri `@b2b/shared` `PLATFORM_ROLES`.
- **Erişim (F1.8a):** `role_permissions` / `membership_regions` RLS'i üst satır üzerinden (`EXISTS`). Rol, şube, depo bileşik FK ile aynı işletmeye bağlı (FK denetimi RLS dışı; tek kolonlu FK başka kiracının kimliğini kabul ederdi). Son admin: tetikleyici + `pg_advisory_xact_lock`, SQLSTATE `AC001` → `mapLastAdminError` → `LAST_ADMIN_PROTECTED`. Kullanıcının tüm üyelikleri yalnız `list_my_memberships()` ile (T kuralına app_user için ek politika yok; migrator'a `TO migrator` SELECT politikası). Kapsam/yetenek uyumu servis kuralı (`assertPermissionsValid`). Rol değişikliği → audit `membership.role_changed` + outbox (`access` kuyruğu; tüketici F1.8b). Şablon eşlemesindeki 7 fark: daha dar seçenek, "kullanıcı onayı bekliyor" (c4 §5).
- **Hata kodu (F1.6):** `CONNECTION_DAILY_QUOTA_EXCEEDED` → `429` + `retryAfter`.
- **openapi değişikliği (F1.5b):** `AuthResult` artık `TokenPair`'ı zorunlu içermez; `nextStep = register` iken `accessToken` yok, `pendingToken` var.
- **Sözleşme kontrolü (F1.12):** `pnpm contract:check` iki şey denetler: üretilmiş `packages/api-client` güncel mi; uygulamanın uçları `openapi.yaml`'da var mı (yol + metot + yanıt kodu, gövde değil). Uygulama şeması Nest `preview` kipinde (bağlantısız) `@nestjs/swagger` ile `apps/api/dist/cli.js openapi:export`. Uygulamada olup sözleşmede olmayan uç veya başarı kodu → hata; sözleşmede olup yazılmamış uç → uyarı (`CONTRACT_VERBOSE=1` listeler). Yeni uç: önce `openapi.yaml`, sonra `pnpm generate:api`, üretilen dosya PR'a girer. `@HttpCode` sözleşmedeki başarı koduyla aynı olmalı.
- **Bildirim (F1.11):** Outbox olayı → `notifications` kuyruğu → `NotificationDispatcher` (worker): alıcı adına `withUserTx` ile satır yazar, tercih kapalıysa push yok. Yeni olay: `event-registry.ts` (kuyruk `notifications`) + `notification-types.ts` (tür, alıcı, konu kimliği) + 3 dilde şablon seed'i. Tüketici idempotent: `notifications.source_event_id` + benzersiz `(user_id, source_event_id)`, tekrar gelen olay atlanır (ADR-0010 §4). Satırda metin yok; `payload = { id, params }`, metin okunurken alıcının dilinde şablondan (yoksa `az`). Push içeriği yalnızca başlık, metin, `data: { type, id }`; Redis işinde yalnızca kimlik. Geçici hata → `push.retry_delays_minutes`, `DeviceNotRegistered` → token silinir (bilet + `push.receipt_check_minutes` sonra makbuz). Token ekleme/taşıma yalnızca `push_token_register()` (kullanıcı `app.user_id`'den). Uçlar `@Authenticated()`. Worker ortamı `PUSH_PROVIDER` (`expo`/`mock`, production'da mock → worker açılmaz), `EXPO_ACCESS_TOKEN` isteğe bağlı. `expo-server-sdk` 7.2.0 (ESM; Node 24 `require(esm)`). `QueueModule` global (`QUEUE_MAP`).
- **Dosya deposu (S9 → C, ADR-0023):** MinIO yok; yerelde ve CI'da `STORAGE_PROVIDER=local` (disk), staging/production'da R2. Production'da `local` → süreç başlamaz.
- **Vitest + NestJS (S8):** kodda bağımlılıklar `@Inject()` ile açık yazılıyor (yeni paket yok); `unplugin-swc` eklenmedi.
