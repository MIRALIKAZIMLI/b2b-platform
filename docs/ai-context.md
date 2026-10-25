# AI bağlam özeti

Usta ve Müfettiş göreve başlarken önce bu dosyayı ve görev kartını okur. Bu dosya bir **özettir**; ayrıntı ve kesin metin bağlantı verilen belgededir. Çelişkide belge geçerlidir. Her PR bu dosyayı gerekiyorsa günceller (bitmiş adımlar, yeni ortak kural, yeni varsayılan karar).

Son güncelleme: 2026-10-25 (F1.9 birleşti; F1.5a PR #17 açık).

## 1. Mimari özeti

- Modüler monolit, TypeScript her yerde ([ADR-0001](04-decisions/adr-0001-modular-monolith.md), [ADR-0002](04-decisions/adr-0002-typescript-full-stack.md)). NestJS (Fastify) API + aynı koddan worker; Drizzle ORM ([ADR-0005](04-decisions/adr-0005-drizzle-orm.md)); PostgreSQL 16 + RLS ([ADR-0003](04-decisions/adr-0003-tenant-isolation-with-rls.md)); Redis + BullMQ, Meilisearch ([ADR-0011](04-decisions/adr-0011-meilisearch-and-bullmq.md)).
- Modüller arası içe aktarma yalnızca hedef modülün `index.ts` dosyasından; bağımlılık yönü [c4-component.md](03-architecture/c4-component.md) §1. Controller → servis → kendi repository'si ([coding-guidelines](07-ai-development/coding-guidelines.md) §3).
- Ertelenebilir yan etkiler transactional outbox ile ([ADR-0010](04-decisions/adr-0010-transactional-outbox.md)); dış servisler adaptör arkasında ([ADR-0008](04-decisions/adr-0008-adapters-for-external-services.md)); yerelde SMS mock ([ADR-0021](04-decisions/adr-0021-mock-sms-in-non-production.md)).
- Yetki yetenek (`seller`/`buyer`) + izinle, işletme tipiyle değil ([ADR-0004](04-decisions/adr-0004-capability-based-authorization.md)). Süre/kota → `SettingsService`, plan limiti → `EntitlementService` ([ADR-0009](04-decisions/adr-0009-layered-settings-and-entitlements.md)).
- Sözleşme önce: `docs/03-architecture/api/openapi.yaml` ([ADR-0022](04-decisions/adr-0022-rest-api-versioning-and-contract-first.md)).

## 2. Klasör yapısı (şu anki durum)

```
apps/api/drizzle/                 0000_settings … 0006_audit_logs (+ 0007_identity, F1.5a)
apps/api/db/bootstrap/roles.sql   app_user, migrator, readonly (şifresiz; pnpm db:bootstrap)
apps/api/src/core/                audit, bootstrap, config, db, errors, health, idempotency,
                                  logging, outbox, clock.ts, id-generator.ts, money.ts
apps/api/src/infrastructure/      queue, redis
apps/api/src/modules/             billing, businesses, i18n, settings (+ identity, F1.5a)
packages/shared/src/              env, errors, entitlements, settings, uuidv7, voen, format…
apps/web, apps/mobile             boş kabuk (F0.3b)
```

Hedef yapı: [coding-guidelines](07-ai-development/coding-guidelines.md) §1.

## 3. Ortak kurallar (kısa)

Tam liste: [F1 faz spesifikasyonu](tasks/F1-faz-spesifikasyonu.md) §6, [data-model.md](03-architecture/data-model.md) §1.1 ve §6.

**DB erişimi** (`apps/api/src/core/db/`):

- `withTenantTx({ businessId, userId })` — kiracı işlemi; `app.business_id`, `app.user_id` ayarlanır.
- `withPlatformTx({ userId })` — yalnızca `platform-admin`; `app.is_platform = 'true'`, `business_id` boş.
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
| **F1.5a** | **sürüyor** (PR #17): kullanıcılar, OTP, mock SMS, `0007_identity.sql` |

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
- **FK'sız sütunlar** (`settings.updated_by` vb.) `users` FK'sını F1.5a'da alır; `logo_file_id` F1.10, `default_price_list_id` F3 (faz spes. §6.10).
- **MinIO yok** (S9): F1.10'dan önce ADR ile karar verilecek.
- **Vitest + NestJS (S8):** kodda bağımlılıklar `@Inject()` ile açık yazılıyor (yeni paket yok); `unplugin-swc` eklenmedi.
