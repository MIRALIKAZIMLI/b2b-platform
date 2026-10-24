# F1 — Çekirdek altyapı: faz spesifikasyonu

| Alan | Değer |
| --- | --- |
| Hazırlayan | Mimar |
| Tarih | 2026-10-24 |
| Dayanak | `docs/07-ai-development/implementation-plan.md` F1 · `docs/05-planning/backlog.md` F1 tablosu · `docs/05-planning/roadmap.md` M1 |
| Milestone | **M1 — Çekirdek** |

## 0. Başlamadan önce: ön koşullar (ŞU AN EKSİK)

Depoda (`miralikazimli/b2b-platform`, `main`) şu an yalnızca `docs/`, `AGENTS.md`, `CLAUDE.md`, `README.md` var. Kod iskeleti yok.

| Eksik | Neden önemli | Ne yapılacak |
| --- | --- | --- |
| **F0.3** — monorepo iskeleti, Docker Compose, CI | backlog.md: F1.1'in bağımlılığı **F0.3**. `package.json`, `apps/api`, `infra/docker-compose.dev.yml`, `.github/workflows/ci.yml` olmadan F1.1 yazılamaz ve test edilemez. | İlk kodlama adımı **F0.3**'tür. Görev kartı: `docs/tasks/F0.3a.md`, `F0.3b.md` (bu pakette). |
| **F0.5 çıktısı** — `docs/tasks/_template.md` | implementation-plan F0.5 "Çıktı" satırı. Dosya depoda yok. | Bu pakette hazır: `docs/tasks/_template.md`. Depoya eklenince F0.5 kapanır. |
| `.github/pull_request_template.md` | definition-of-done.md: DoD listesi PR şablonuna kopyalanır. | F0.3a kartının kapsamına alındı. |

F0.1, F0.2 (görüşme, atölye) ve F0.4 (AWS/Cloudflare) F1'i **engellemez**; paralel yürüyebilir. F0.4, F1 sonunda staging dağıtımı için gerekir (DoD §7 "staging duman testi").

## 1. Adımlar

"Tahmin" ve "Bağımlılık" backlog.md'den aynen alınmıştır. "Bölme önerisi" Mimar önerisidir; ilgili adıma gelince kesinleştirilir ve implementation-plan.md'ye eklenir.

| ID | Ne yapar (bir cümle) | Tahmin | Bağımlılık | Müfettiş | Bölme önerisi |
| --- | --- | --- | --- | --- | --- |
| F1.1 | Veritabanı bağlantısı, `withTenantTx` / `withPlatformTx`, DB rolleri, izolasyon test yardımcısı, `check-rls` | L | F0.3 | **Zorunlu** (kiracı bağlamı) | **F1.1a** (bağlantı + roller + tx yardımcıları + testler) · **F1.1b** (`check-rls` betiği + CI adımı) — kartlar hazır |
| F1.2 | Hata modeli, istek kimliği, log (redakte), idempotens, outbox + dağıtıcı, `Clock`, `money`, `env.ts` | L | F1.1 | Önerilir (log redaksiyonu, idempotens) | F1.2a (hata + log + request-id + Clock + money + env) · F1.2b (idempotens + outbox + worker dağıtıcı) |
| F1.3 | Diller, çeviriler, para birimleri, ülkeler, bölgeler + seed + uç noktalar | M | F1.1 | Gerekmez | — |
| F1.4 | `SettingsService` + `EntitlementService` (çözümleme, önbellek, seed) | M | F1.1 | Önerilir (plan limitleri) | **F1.4a** (`settings` + `SettingsService`, S erişim kalıbı) · **F1.4b** (planlar, abonelik, `EntitlementService`) — `subscriptions` → `businesses` FK'sı yüzünden F1.7'den sonra |
| F1.5 | Kimlik: OTP (mock SMS), oturum, yenileme anahtarı döndürme | L | F1.2 | **Zorunlu** (kimlik) | F1.5a (OTP + mock SMS + `dev_sms_outbox` + açılış kontrolü) · F1.5b (oturum, yenileme anahtarı, cihazlar, `/me` temel) |
| F1.6 | TOTP, kurtarma kodları, `platform_staff` | M | F1.5 | **Zorunlu** (kimlik) | — |
| F1.7 | İşletme çekirdek tabloları + RLS + VÖEN doğrulayıcı | M | F1.1 | **Zorunlu** (RLS'li ilk gerçek tablolar) | — |
| F1.8 | İzinler, roller, üyelikler, `TenantContext`, `PermissionGuard`, lint kuralı | L | F1.5, F1.7 | **Zorunlu** (yetki) | F1.8a (tablolar + seed + son admin trigger) · F1.8b (`TenantContext`, guard, dekoratörler, lint kuralı, `/me` izinlerle) |
| F1.9 | Audit log yazıcısı (yalnızca ekleme) | S | F1.2 | Önerilir | — |
| F1.10 | Dosya yükleme (R2/MinIO, imzalı URL) | M | F1.8 | Önerilir (özel dosya erişimi) | — |
| F1.11 | Push bildirim altyapısı (mock + Expo) | M | F1.2, F1.3 | Gerekmez | — |
| F1.12 | `packages/api-client` üretimi + CI sözleşme kontrolü | S | F1.8b | Gerekmez | — (uygulama şeması controller'lar yazıldıktan sonra anlamlı) |
| F1.13 | Web iskeleti: giriş, dil, işletme seçici, izinden menü | L | F1.8, F1.12 | F1.13a için **Zorunlu** (web cookie oturumu) | **F1.13a** (giriş + oturum cookie'si + dil) · **F1.13b** (kabuk, menü, seçiciler, E2E-01) |
| F1.14 | Mobil iskeleti: giriş, dil, menü, minimum sürüm, push kaydı | L | F1.8, F1.11, F1.12 | F1.14a için **Zorunlu** (oturum) | **F1.14a** (giriş + güvenli depo + dil) · **F1.14b** (menü, app-config, push, Maestro) |

"Müfettiş Zorunlu" dayanağı: `coding-guidelines.md` §10.4 ve `definition-of-done.md` §5 — kimlik, yetki, kiracı bağlamı, fiyat, stok, cari kodu değişirse Müfettiş incelemesi şart. "Önerilir" Mimar önerisidir, belgede zorunlu değildir.

## 2. Önerilen sıra ve kartlar (güncel — 2026-10-24)

Tek geliştirici için düz liste. **Risk yüksek** = RLS, kimlik/yetki, para/sipariş. **Plan incelemesi gerekli** ise Usta kodu yazmadan planı Mimar'a getirir; karar `/mnt/project-files/f1-plan/reviews/<ID>-plan-karari.md`.

| # | Kart | Risk | Plan incelemesi | Bağımlılık |
| --- | --- | --- | --- | --- |
| — | F0.3a → F0.3b, F1.1a → F1.1b | — | — | bitti |
| 1 | [F1.2a](F1.2a.md) hata, log, request-id, Clock, money, env | yüksek | gerekli | F1.1b |
| 2 | [F1.4a](F1.4a.md) `settings` + `SettingsService` | yüksek | gerekli | F1.2a |
| 3 | [F1.2b](F1.2b.md) idempotens + outbox | yüksek | gerekli | F1.2a, F1.4a |
| 4 | [F1.3](F1.3.md) dil, çeviri, para birimi, ülke, bölge (ilk G) | yüksek | gerekli | F1.2a, F1.4a |
| 5 | [F1.7](F1.7.md) işletme tabloları + VÖEN | yüksek | gerekli | F1.3 |
| 6 | [F1.4b](F1.4b.md) plan, abonelik, `EntitlementService` | yüksek | gerekli | F1.4a, F1.7 |
| 7 | [F1.9](F1.9.md) audit log yazıcısı | normal | gerekmez | F1.2a, F1.4a |
| 8 | [F1.5a](F1.5a.md) kullanıcılar, OTP, mock SMS | yüksek | gerekli | F1.2b, F1.3, F1.4a, F1.9 |
| 9 | [F1.5b](F1.5b.md) oturum, JWT, yenileme | yüksek | gerekli | F1.5a |
| 10 | [F1.6](F1.6.md) TOTP, platform ekibi | yüksek | gerekli | F1.5b |
| 11 | [F1.8a](F1.8a.md) izinler, roller, üyelikler | yüksek | gerekli | F1.5b, F1.6, F1.7 |
| 12 | [F1.8b](F1.8b.md) `TenantContext`, `PermissionGuard`, `/me` | yüksek | gerekli | F1.8a |
| 13 | [F1.12](F1.12.md) api-client + sözleşme kontrolü | normal | gerekmez | F1.8b |
| 14 | [F1.11](F1.11.md) push + uygulama içi bildirim | yüksek | gerekli | F1.2b, F1.3, F1.8b |
| 15 | [F1.10](F1.10.md) dosya yükleme (**S9 kararı önce**) | yüksek | gerekli | F1.8b, F1.4a |
| 16 | [F1.13a](F1.13a.md) web giriş, oturum, dil | yüksek | gerekli | F1.8b, F1.12 |
| 17 | [F1.13b](F1.13b.md) web kabuğu, menü, E2E-01 | normal | gerekmez | F1.13a |
| 18 | [F1.14a](F1.14a.md) mobil giriş, güvenli depo, dil | yüksek | gerekli | F1.8b, F1.12 |
| 19 | [F1.14b](F1.14b.md) mobil kabuk, app-config, push, Maestro | normal | gerekmez | F1.14a, F1.11 |

Sıra değişikliğinin gerekçesi: `settings` (F1.4a) idempotens/outbox ayarlarından önce gerekir; `subscriptions` → `businesses` FK'sı F1.4b'yi F1.7'nin arkasına iter; F1.5a kilit kaydını audit'e yazdığı için F1.9 öne alındı; F1.12'nin "uygulamanın ürettiği şema" kontrolü ancak controller'lar ve dekoratörler (F1.8b) varken anlamlı.

M1 çıkış ölçütü (roadmap.md): mock SMS ile web ve mobilde giriş; izinden oluşan menü; izolasyon test paketi yeşil; outbox → push uçtan uca; 3 dilde çeviri.

## 3. Riskli noktalar

| # | Risk | Adım | Önlem |
| --- | --- | --- | --- |
| R1 | **Testler süper kullanıcıyla çalışır, RLS sessizce atlanır.** Testcontainers ve CI'daki varsayılan `postgres` kullanıcısı süper kullanıcıdır; süper kullanıcı RLS'e takılmaz. Testler yeşil görünür ama hiçbir şeyi kanıtlamaz. | F1.1 | İzolasyon testleri `app_user` rolüyle bağlanır; test, bağlanılan rolün süper kullanıcı olmadığını ve tablo sahibi olmadığını ayrıca doğrular. |
| R2 | Tablo sahibi RLS'i atlar. | F1.1, F1.7+ | `app_user` hiçbir tablonun sahibi değil (ADR-0003 §3); her T/P/U tablosunda `FORCE ROW LEVEL SECURITY` (coding-guidelines §4.2). |
| R3 | Bağlam yokken politika hata verir veya yanlış davranır. `current_setting('app.business_id')` ayarsızsa hata, boşsa `''::uuid` dönüşüm hatası verir. | F1.1 | Politikalarda `nullif(current_setting('app.business_id', true), '')::uuid` kalıbı → bağlam yoksa 0 satır (F1.1 kabulü). |
| R4 | `SET LOCAL` metin birleştirmeyle yazılırsa SQL enjeksiyonu. | F1.1 | `select set_config('app.business_id', $1, true)` parametreli çağrı. |
| R5 | Havuzdaki bağlantıda ayar sızar. | F1.1 | Yalnızca `SET LOCAL` / `set_config(..., true)` (işlem bitince silinir); işlem dışı sorgu yolu yok. |
| R6 | DB rol şifreleri migration dosyasına yazılır → gizli bilgi depoda. | F1.1 | Açık soru S2. Migration şifre içermez. |
| R7 | `env.ts` (F1.2) F1.1'den sonra geliyor ama F1.1 `DATABASE_URL` okur. | F1.1 / F1.2 | Açık soru S4. |
| R8 | OTP, JWT, telefon loglanır. | F1.2, F1.5 | Redakte listesi F1.2'de; F1.5 testinde log içeriği kontrolü. |
| R9 | `/api/v1/me` iki kez yazılır (F1.5 temel, F1.8 izinlerle). | F1.5, F1.8 | F1.8 kartında "`/me` genişletilir, kırıcı değişiklik yok" maddesi. |
| R10 | `X-Business-Id` başlığına güvenilir. | F1.8 | Üyelik doğrulaması zorunlu; izolasyon testleri. |
| R11 | Mobil E2E (Maestro, Android) ve Expo push için hesap/cihaz gerekir. | F1.14 | F1.14'ten önce: Android emülatör veya telefon + Expo hesabı hazır. |

## 4. Açık sorular (belgede yok — karar platform sahibinin)

| # | Soru | Seçenekler | Mimar önerisi | Ne zaman gerekli |
| --- | --- | --- | --- | --- |
| S1 | `check-rls` bir tablonun T/P/U sınıfında olduğunu nereden bilecek? | **A)** Migration'da `COMMENT ON TABLE x IS 'rls:T'`; betik yorumları okur. Artı: tablo ile birlikte yaşar. Eksi: yorum unutulursa tablo "sınıfsız" kalır (betik bunu da hata saymalı). **B)** `scripts/rls-classes.ts` içinde elle liste. Artı: tek yerde görülür. Eksi: liste ile veritabanı ayrışabilir. **C)** Sütun adına bakmak (`business_id`, `seller_id`, `buyer_id`, `user_id` varsa RLS zorunlu). Artı: sıfır bakım. Eksi: G/S sınıfında bu sütunu taşıyan tablolar (ör. `audit_logs`) yanlış alarm verir. | **A + kural:** sınıf yorumu olmayan her tablo da hata. | F1.1b |
| S2 | `app_user`, `migrator`, `readonly` rollerinin şifreleri nasıl verilir? | **A)** `0000_roles.sql` rolleri şifresiz (`LOGIN` yok) oluşturur; şifre ortam değişkeninden ayrı bir kurulum betiğiyle atanır. **B)** Yerelde Docker'ın `docker-entrypoint-initdb.d` betiği, staging/production'da elle bir kerelik komut. **C)** Migration içinde `current_setting` ile ortamdan okumak. Eksi: karmaşık, hataya açık. | **A** (yerel/CI için `.env.example`'da örnek değer, gerçek değer asla depoda değil). | F1.1a |
| S3 | İzolasyon kabul testi için "örnek test tablosu" nerede tanımlanır? | **A)** Yalnızca test kurulumunda oluşturulan geçici tablo (`test_tenant_items`), gerçek migration'a girmez. **B)** Gerçek migration'a eklenen kalıcı tablo. Eksi: data-model.md'de olmayan tablo (AGENTS kural 4). | **A** | F1.1a |
| S4 | F1.1 veritabanı adresini nereden okur? (`shared/env.ts` F1.2'de) | **A)** F1.1'de `shared/env.ts`'nin yalnızca DB değişkenlerini içeren ilk hâli; F1.2 genişletir. **B)** F1.1'de `process.env` doğrudan okunur, F1.2'de taşınır. Eksi: geçici kod. | **A** | F1.1a |
| S5 | UUIDv7 nasıl üretilecek? (data-model §1: "uygulama üretir"; tech-stack'te paket yok; PostgreSQL 16'da yerleşik `uuidv7()` yok) | **A)** `packages/shared` içinde küçük kendi fonksiyonumuz (Node `crypto` ile). **B)** `uuid` paketini tech-stack'e eklemek (onay gerekir). | Karar senin; ikisi de makul. B daha az risk (test edilmiş paket), A sıfır bağımlılık. | F1.2a / F1.5 (ilk gerçek tablo) |
| S6 | RLS politikaları Drizzle şemasında (`pgPolicy`) mı, elle SQL migration'da mı yazılır? ADR-0005 §3: "ham SQL RLS politikalarında kullanılır". | **A)** Elle SQL migration (ADR-0005'e birebir uygun). **B)** Drizzle'ın politika desteği. | **A** (ADR ile aynı; B için ADR güncellemesi gerekir). | F1.1a (test tablosu), F1.7 |
| S7 | F0.3 tek PR'a sığar mı? (api + web + mobil + Docker + CI) | Tek PR veya F0.3a/F0.3b | **Böl:** F0.3a (monorepo + api + Docker + CI + PR şablonu), F0.3b (web + mobil boş uygulamalar). | Şimdi |
| S8 | Vitest, NestJS'in ihtiyaç duyduğu dekoratör metadata'sını üretmez. | **A)** Her bağımlılıkta `@Inject()` açık yazılır (yeni paket yok). **B)** `unplugin-swc` + `@swc/core` (tech-stack'e ekleme, onay). | Karar senin; F1.2a planında Usta ile birlikte bakılır. | F1.2a |
| S9 | MinIO Docker imajı artık hiçbir açık depoda yok (F0.3a'da tespit, 2026-10-24). Yerelde ve CI'da R2 yerine ne kullanılacak? (tech-stack §6, F1.10 "Entegrasyon (MinIO)") | **A)** S3 uyumlu başka yerel sunucu (ör. SeaweedFS, Garage): tech-stack değişikliği + ADR. **B)** Yerelde gerçek R2 dev bucket'ı: F0.4'e bağımlı, testler internet ister. **C)** `local-file-storage.ts` (F1.10 dosya listesinde zaten var) ile disk; S3 imzalı URL davranışı yalnızca staging'de test edilir. | F1.10'dan önce ADR ile karar. F0.3a'da compose'dan çıkarıldı. | F1.10 öncesi |

## 5. F1 için gereken belge güncellemeleri

1. `docs/07-ai-development/implementation-plan.md` — F0.3 ve F1.1'in altına bölme satırları (kartlardaki "Plana eklenecek metin" bölümü).
2. `docs/tasks/` klasörü — `_template.md`, `F0.3a.md`, `F0.3b.md`, `F1.1a.md`, `F1.1b.md`.
3. S1–S7 kararları verilince: S1, S2, S3 için `data-model.md` §6 (Migration kuralları) altına madde; S5 seçeneği B ise `tech-stack.md` §2'ye satır.
4. **Rol değişikliği (2026-10-24, platform sahibi):** Usta artık Antigravity Agent paneli değil, Antigravity içindeki **Claude Code eklentisi** (Pro). Müfettiş aynı eklentide ayrı yeni sohbet. Bu, `docs/05-planning/risk-register.md` RISK-05 önleminiyle çelişiyor. RISK-05 satırının "Önlem" hücresi şu metinle değiştirilmeli:

   `Usta ve Müfettiş Claude Code (Pro) ile; Usta ve Müfettiş ayrı sohbetler; küçük görev kartları (a/b bölme); plan modunda başlama; limit takvimine göre gün planı; limit sık dolarsa Usta işi için Antigravity Agent paneli yedek seçenek`

## 6. Ortak kurallar (her kart için geçerli)

Kartlar bu bölüme "§6" diye atıf yapar. Bir kart bu kurallardan sapacaksa planda gerekçe yazılır.

1. **Sınıf yorumu:** Her yeni tablo aynı migration'da `COMMENT ON TABLE <tablo> IS 'rls:<sınıf>'` taşır (T, P, G, U, S, D; `check-rls` regex'i `^rls:[TPGUSD](,[TPGUSD])*$`). Yorumsuz tablo `check-rls`'te hata.
2. **Açık GRANT:** `ALTER DEFAULT PRIVILEGES` yok. Her migration, `app_user` ve `readonly` için gereken yetkiyi tablo tablo açıkça verir; dizi (sequence) varsa `USAGE` da.
3. **T / P:** `ENABLE` + `FORCE ROW LEVEL SECURITY`; politika `<kolon> = nullif(current_setting('app.business_id', true), '')::uuid`; bağlam yoksa 0 satır. Erişim yalnızca `withTenantTx`.
4. **U:** aynı kalıp, `user_id = nullif(current_setting('app.user_id', true), '')::uuid`.
5. **G:** RLS açık; `SELECT USING (true)`; yazma politikaları yalnızca `current_setting('app.is_platform', true) = 'true'` iken (F1.3'te kurulur, `check-rls` G kuralı F1.3'te eklenir).
6. **S:** `app_user`'ın tabloya doğrudan `SELECT` yetkisi yok (yalnızca kartta yazıyorsa `INSERT`). Okuma/yazma `migrator` sahipli `SECURITY DEFINER` fonksiyonlarla: `SET search_path = pg_catalog, public, pg_temp` (pg_temp her zaman en sonda; yazılmazsa örtük olarak en başta aranır), `REVOKE ALL ... FROM PUBLIC`, `GRANT EXECUTE ... TO app_user` (F1.4a'da kurulur).
7. **Materialized view:** İlk materialized view hangi adımda gelirse, aynı PR'da `check-rls`'e kural eklenir (`relkind = 'm'`). Materialized view RLS desteklemez → ya `app_user`'a hiç yetki verilmez, ya erişim `SECURITY DEFINER` fonksiyonla ve işletme filtresiyle yapılır.
8. **Roller dosyası:** `0000_roles.sql` migration klasöründen çıkarılıp `apps/api/db/bootstrap/roles.sql`'e taşınır (F1.2a'nın ilk işi; ilk `drizzle-kit generate` F1.4a'da). Şifre hiçbir dosyada yok; `pnpm db:bootstrap` ortamdan okur.
9. **Bağlantı havuzu:** `pool.on('error')` dinleyicisi (F1.2a); boşta kopan bağlantı süreci düşürmez, loglanır.
10. **FK'sız bırakılan sütunlar** (bağımlılık döngüsü yüzünden) ve FK'nın ekleneceği adım:

| Sütun | FK hedefi | Eklendiği adım |
| --- | --- | --- |
| `settings.updated_by` | `users` | F1.5a |
| `businesses.verified_by` | `users` | F1.5a |
| `business_capabilities.approved_by` | `users` | F1.5a |
| `entitlement_overrides.created_by` | `users` | F1.5a |
| `businesses.logo_file_id` | `files` | F1.10 |
| `businesses.default_price_list_id` | `price_lists` | F3 |

11. **Sabit değer yok:** Kartın getirdiği her süre, sınır ve eşik önce `user-stories.md` US-017 tablosuna, aynı PR'da `packages/shared/src/settings.ts`'e eklenir.
12. **Testler:** İzolasyon testleri `app_user` ile bağlanır ve kurulumda `current_user = 'app_user'` olduğunu doğrular; test adı AC kimliğiyle başlar.

