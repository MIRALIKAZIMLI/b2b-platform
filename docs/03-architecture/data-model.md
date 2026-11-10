# Veri Modeli

| Alan | Değer |
| --- | --- |
| Sürüm | 1.0 |
| Tarih | 2026-10-24 |
| Veritabanı | PostgreSQL 16 |
| İlgili belgeler | [c4-component.md](c4-component.md) (tablo sahipliği) · [state-machines.md](state-machines.md) (durum alanları) · [glossary.md](../02-requirements/glossary.md) |

## 1. Genel kurallar

| Konu | Kural |
| --- | --- |
| Birincil anahtar | `id uuid` (UUIDv7, uygulama üretir; zamana göre sıralanabilir). İstisnalar belirtilmiştir. |
| Zaman | `timestamptz`, UTC. Her tabloda `created_at timestamptz not null default now()`; değişebilen tablolarda `updated_at`. |
| Para | Birim fiyat `numeric(14,4)`; tutarlar `numeric(14,2)`; her para alanının yanında `currency_code char(3)` veya kaydın para birimine bağlı. |
| Miktar | `numeric(14,3)` (kg gibi ondalıklı birimler için). |
| Çok dilli içerik | `jsonb`: `{"az": "...", "ru": "...", "tr": "...", "en": "..."}`. Eksik anahtar geri dönüşü uygulamada (ADR-0007). |
| Durum alanları | `text` + `CHECK (status IN (...))`. PostgreSQL enum tipi kullanılmaz (migration'da değer eklemek zahmetli). |
| Silme | İş kayıtları silinmez: `status = 'archived'` veya `archived_at`. Fiziksel silme yalnızca kişisel veri temizliğinde ve geçmişi olmayan kayıtlarda. |
| Kişisel veri | 🔒 ile işaretli alanlar. Loglanmaz (maskelenir), dışa aktarmalarda yalnızca yetkiliye, silme talebinde temizlenir. |
| Adlandırma | Tablolar çoğul `snake_case`; yabancı anahtar `<tekil>_id`; satıcı işletme `seller_id`, alıcı işletme `buyer_id` (her ikisi de `businesses.id`). |

### 1.1 Kiracı izolasyonu (RLS) sınıfları

Her istek işleminin başında uygulama `SET LOCAL app.business_id = '<uuid>'` çalıştırır. Platform yönetici uç noktaları ayrıca `SET LOCAL app.is_platform = 'true'` çalıştırır (ADR-0003).

| Sınıf | Kural | Örnek tablolar |
| --- | --- | --- |
| **T** (tek kiracı) | `business_id = current_setting('app.business_id')::uuid` (satıcı tablolarında sütun adı `seller_id`, alıcı tablolarında `buyer_id`) | `products`, `price_lists`, `stock`, `carts`, `branches` |
| **P** (çift kiracı) | `seller_id = app.business_id OR buyer_id = app.business_id` | `connections`, `orders`, `order_items`, `deliveries`, `ledger_entries`, `payments` |
| **G** (genel katalog) | Herkes okur; yalnızca `app.is_platform = true` yazar | `units`, `categories`, `brands` (aktif), `activity_types`, `languages`, `currencies`, `regions`, `permissions`, `job_titles`, `role_templates`, `plans` |
| **U** (kullanıcıya bağlı) | `user_id = app.user_id` | `user_sessions`, `push_tokens`, `notifications`, `notification_preferences` |
| **S** (sistem) | RLS dışında; yalnızca belirli servisler erişir; uygulama rolünün doğrudan okuma izni yok, yalnızca güvenli fonksiyonlar | `otp_challenges`, `idempotency_keys`, `outbox_events`, `audit_logs` (yalnızca ekleme), `settings`, `dev_sms_outbox` |
| **D** (dizin) | Perakendeci dizini sorguları yalnızca `directory` modülünün `SECURITY DEFINER` fonksiyonu ve Meilisearch indeksi üzerinden; görünürlük ayarları fonksiyon içinde uygulanır | `businesses`, `buyer_profiles`, `business_privacy`, `person_data` (yetkili adı F2.11a; kişisel iletişim yalnız açıksa F2.11b), `files` (yalnız logo, F2.11b), `seller_profiles` (yalnız tanıtım metni; perakendecinin gördüğü toptancı özeti, `connections` modülü, F2.13a) (başka kiracının okuması) |

**Ek RLS kuralları:**

- `withSystemTx` yalnızca bağlamsız sistem okumaları (ayar, worker) içindir; kiracı verisi göremez: `app.business_id`, `app.user_id` ve `app.is_platform` boştur, T/P/U tablolarında 0 satır döner. S tablolarına yalnızca `SECURITY DEFINER` fonksiyonlarla erişir (F1.4a).
- Platform bağlamı (`app.is_platform = true`) `orders`, `order_items`, `ledger_entries`, `payments`, `price_lists`, `price_list_items`, `customer_prices` tablolarında **yazma** iznine sahip değildir (US-016 AC5).
- T tablolarında kiracı politikasının yanında ayrı bir platform politikası bulunur: `current_setting('app.is_platform', true) = 'true'` iken USING ve WITH CHECK (c4-component §7; `withPlatformTx` `app.business_id`'yi boş bıraktığı için kiracı politikası platforma 0 satır gösterir). İlk uygulama F1.7 (`businesses` grubu). US-016 AC5 listesindeki tablolara bu politika **asla** eklenmez.
- Alıcı, satıcının ürün ve fiyat tablolarını yalnızca **aktif bağlantı** varsa okuyabilir: bu sorgular `catalog` modülünün `buyer_visible_products(buyer_id)` fonksiyonu üzerinden yapılır ve fonksiyon aktif bağlantıyı kontrol eder.

## 2. ERD — Kimlik, işletme, erişim, bağlantı

```mermaid
erDiagram
    users ||--o{ memberships : "üyesidir"
    users ||--o{ user_sessions : "oturum"
    users ||--o| platform_staff : "platform rolü"
    businesses ||--o{ business_capabilities : "yetenek"
    businesses ||--o| seller_profiles : "satıcı profili"
    businesses ||--o| buyer_profiles : "alıcı profili"
    businesses ||--o| person_data : "kişisel veri"
    businesses ||--o| business_privacy : "görünürlük"
    businesses ||--o{ branches : "şube"
    businesses ||--o{ warehouses : "depo"
    businesses ||--o{ memberships : "üye"
    businesses ||--o{ roles : "rol"
    roles ||--o{ role_permissions : "izin"
    permissions ||--o{ role_permissions : ""
    role_templates ||--o{ roles : "kopyalanır"
    job_titles }o--|| role_templates : "varsayılan"
    memberships }o--|| roles : ""
    businesses ||--o{ subscriptions : "abonelik"
    plans ||--o{ subscriptions : ""
    plans ||--o{ plan_entitlements : "hak"
    businesses ||--o{ connection_requests : "seller_id / buyer_id"
    businesses ||--o{ connections : "seller_id / buyer_id"
    connection_requests ||--o| connections : "kabulde oluşur"
    businesses ||--o{ blocks : "buyer_id / seller_id"
```

## 3. ERD — Katalog, fiyat, stok, sipariş, teslimat, cari

```mermaid
erDiagram
    products ||--o{ product_variants : "varyant"
    product_variants ||--o{ product_packaging : "ambalaj seviyesi"
    products ||--o{ product_images : "görsel"
    categories ||--o{ products : ""
    brands ||--o{ products : ""
    units ||--o{ product_packaging : "unit_code"
    price_lists ||--o{ price_list_items : ""
    product_packaging ||--o{ price_list_items : "satış birimi fiyatı"
    product_packaging ||--o{ customer_prices : ""
    connections }o--o| price_lists : "atanmış liste"
    warehouses ||--o{ stock : ""
    product_variants ||--o{ stock : ""
    stock ||--o{ stock_movements : ""
    branches ||--|| carts : "şube sepeti"
    carts ||--o{ cart_items : ""
    carts ||--o{ orders : "bölünme"
    orders ||--o{ order_items : ""
    order_items ||--o{ order_item_changes : ""
    orders ||--o{ order_status_history : ""
    orders ||--o| deliveries : ""
    deliveries ||--o{ delivery_proofs : ""
    deliveries ||--o{ disputes : ""
    orders ||--o{ ledger_entries : "borç"
    payments ||--o{ ledger_entries : "alacak"
    orders ||--o{ documents : "belge"
```

## 4. Tablolar

Sütun listesinde `id`, `created_at`, `updated_at` her tabloda vardır ve tekrar yazılmamıştır (istisnalar belirtilmiştir).

### 4.1 `core`

#### `outbox_events` (S)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| id | bigserial | PK | `id` uuid değil; sıra önemli |
| type | text | not null | ör. `order.submitted`, `connection.request_created` |
| aggregate_type | text | not null | `order`, `connection`, … |
| aggregate_id | uuid | not null | |
| business_ids | uuid[] | not null | Olayla ilgili kiracılar |
| payload | jsonb | not null | Kişisel veri içermez; kimlikler taşır |
| processed_at | timestamptz | null | |
| attempts | int | not null default 0 | |
| last_error | text | null | |

İndeks: `(processed_at) WHERE processed_at IS NULL`.

#### `ops_metrics` (S)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| id | bigserial | PK | |
| measured_at | timestamptz | not null | 5 dakikada bir (worker) |
| key | text | not null | ör. `http.5xx_rate`, `queue.oldest_age_s`, `sms.sent_today` |
| value | numeric(18,4) | not null | |
| labels | jsonb | null | ör. `{"queue": "notifications"}` |

İndeks: `(key, measured_at DESC)`. 90 günden eski kayıtlar gece silinir. Kaynak: [observability.md](../06-operations/observability.md) §2.

#### `idempotency_keys` (S)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| key | text | PK (key, user_id) | İstemcinin `Idempotency-Key` başlığı |
| user_id | uuid | not null | |
| endpoint | text | not null | |
| request_hash | text | not null | Yöntem + yol + sorgu dizesi + `X-Business-Id` + kanonik JSON gövdenin SHA-256 özeti; aynı anahtar farklı istekle gelirse `IDEMPOTENCY_CONFLICT` (F1.2b) |
| status_code | int | null | null = istek işleniyor (kilit); yalnızca 2xx yanıt saklanır |
| response_body | jsonb | null | null = istek işleniyor |
| locked_until | timestamptz | null | İşlenen isteğin kilidi (`idempotency.lock_seconds`); geçince kayıt sahipsiz sayılır, yeni istek işlenir |
| expires_at | timestamptz | not null | `idempotency.ttl_hours` (varsayılan 24 saat); süresi dolan anahtar yeni istek sayılır |

#### `audit_logs` (S, yalnızca ekleme)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| id | bigserial | PK | |
| occurred_at | timestamptz | not null | |
| actor_user_id | uuid | null | Sistem işlerinde null |
| actor_type | text | `user` / `system` / `platform` | |
| impersonation_session_id | uuid | null | |
| business_id | uuid | null | İşlemin ait olduğu kiracı |
| action | text | not null | ör. `role.updated`, `connection.cancelled` |
| target_type | text | not null | |
| target_id | text | not null | |
| before | jsonb | null | 🔒 alanlar maskelenir |
| after | jsonb | null | 🔒 alanlar maskelenir |
| ip | inet | null | |
| request_id | text | null | |

İndeks: `(business_id, occurred_at DESC)`, `(target_type, target_id)`. Saklama 2 yıl (NFR-52); uygulama rolünün `UPDATE`/`DELETE` izni yoktur.

### 4.2 `identity`

#### `users` (U — kendisi; diğerleri üyelik üzerinden)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| phone_e164 | text | unique, not null | 🔒 ör. `+994501234567` |
| full_name | text | not null | 🔒 |
| preferred_language | char(2) | FK `languages.code` | |
| timezone | text | null | IANA; null ise işletme saat dilimi |
| status | text | `active` / `locked` / `deleted` | |
| last_login_at | timestamptz | null | |
| last_business_id | uuid | null, FK `businesses.id` (migration'da elle, F2.7a) | Son kullanılan işletme (US-003 AC1, S8); kullanıcı `PATCH /me` ile yazar, aktif üyelik yoksa `/me` null döner |

**RLS (F1.5a):** `SELECT` ve `UPDATE` yalnızca kendi satırı (`id = app.user_id`); `phone_e164`, `status` ve `last_login_at` yalnızca platform bağlamında değişir (tetikleyici `users_guard_platform_columns`, ihlal 42501); platform bağlamı (`app.is_platform = 'true'`) tüm işlemler. Üyelik üzerinden görme: `users_member_select` (F2.7a) — bağlamdaki işletmede (`app.business_id`) aktif üyeliği olan kullanıcıların satırı okunur; yazma yok. Davet edilen kişinin satırı `user_ensure_for_invitation()` ile (F2.7a). Önceki adımlarda FK'sız bırakılan `settings.updated_by`, `businesses.verified_by`, `business_capabilities.approved_by`, `entitlement_overrides.created_by` sütunlarına `users(id)` FK'sı F1.5a migration'ında eklenir (`audit_logs.actor_user_id` FK'sız kalır: yalnızca ekleme yapılan kayıt).

#### `otp_challenges` (S)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| phone_e164 | text | not null | 🔒 |
| purpose | text | `login` / `register` / `invitation` | |
| code_hash | text | not null | Kod düz metin saklanmaz |
| expires_at | timestamptz | not null | +5 dk |
| attempts | smallint | not null default 0 | 5'te kilit |
| consumed_at | timestamptz | null | |
| request_ip | inet | null | |

İndeks: `(phone_e164, created_at DESC)`. 7 günden eski kayıtlar gece silinir.

`code_hash` = `HMAC-SHA256(OTP_HASH_KEY, 'otp:' + challengeId + ':' + kod)` (hex); karşılaştırma sabit zamanlı (F1.5a). Uygulama tabloya yalnızca `SECURITY DEFINER` fonksiyonlarla erişir: `otp_challenge_create`, `otp_challenge_lock` (doğrulama için satırı kilitler), `otp_challenge_fail`, `otp_challenge_close`; mock SMS kutusu için `dev_sms_outbox_insert`, `dev_sms_outbox_list`.

**Numara kilidi ve hız sınırları tabloda değil, Redis'tedir (F1.5a):** kilit süreli bir anahtardır (`otp.lock_minutes`); numara ve IP sayaçları kayan penceredir. Anahtarlarda telefon düz yazılmaz, `OTP_HASH_KEY` ile HMAC'li hâli kullanılır. Redis'e ulaşılamazsa kod gönderilmez ve doğrulama yapılmaz (`503 SMS_UNAVAILABLE`).

#### `user_sessions` (U)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| user_id | uuid | FK users | |
| refresh_token_hash | text | unique | Döndürülür; eskisi kullanılırsa tüm aile iptal |
| family_id | uuid | not null | Döndürme ailesi |
| device_type | text | `web` / `ios` / `android` | |
| device_name | text | null | |
| ip_city | text | null | |
| last_used_at | timestamptz | | |
| expires_at | timestamptz | | +30 gün |
| revoked_at | timestamptz | null | |
| impersonation_session_id | uuid | null | |

**F1.5b:** Yenileme anahtarı 32 rastgele bayt (base64url); `refresh_token_hash` = SHA-256 (hex). Her yenilemede aynı `family_id` ile yeni satır açılır, eski satır `revoked_at` ile kapanır; iptal edilmiş satırın anahtarı tekrar gelirse aynı ailedeki tüm satırlar iptal edilir (`401 REFRESH_TOKEN_REUSED`, audit `session.refresh_reused`). Oturum listesinde aile başına geçerli satır görünür; oturumu kapatmak ailesini iptal eder. `device_type` istekte yoksa `web`; `ip_city` kaynağı belgede yok, şimdilik null.

**RLS (F1.5b):** `SELECT`, `INSERT`, `UPDATE` yalnızca kendi satırları (`user_id = app.user_id`); platform bağlamı tüm işlemler; silme yok. Kullanıcı bağlamı dışından erişim (doğrulama, yenileme) yalnızca `SECURITY DEFINER` fonksiyonlarla: `identity_user_by_phone`, `user_session_rotate`, `identity_record_login` (`users.last_login_at`). Bu fonksiyonlar kullanıcı bağlamı olmadan çalıştığı için `users` (SELECT, UPDATE) ve `user_sessions` (ALL) tablolarında yalnızca `migrator` rolüne açık politikalar vardır (`TO migrator`; `app_user` bu rolü üstlenemez). Koruma tetikleyicileri: `users_guard_platform_columns` fonksiyon sahibi `migrator` olarak çalışan yazmaya izin verir, `app_user` bu alanları yine yazamaz; `user_sessions_guard_columns` ile `app_user` platform dışında oturumu yalnızca kapatabilir (anahtar özeti, aile, süre, cihaz değişmez; kapatılmış oturum açılmaz).

#### `user_totp` (U)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| user_id | uuid | PK, FK users | `id` yok |
| secret_encrypted | bytea | not null | Uygulama anahtarıyla şifreli |
| recovery_codes_hash | jsonb | not null | 10 kod |
| enabled_at | timestamptz | null | |
| last_used_step | bigint | null | Son kabul edilen TOTP adımı (30 sn); aynı kod tekrar kullanılamaz (F1.6) |

**F1.6:** `secret_encrypted` = AES-256-GCM (`TOTP_ENCRYPTION_KEY`), biçim `nonce (12 bayt) ‖ etiket (16) ‖ şifreli metin`; her şifrelemede yeni rastgele nonce, ek doğrulama verisi (AAD) `user_id`. `recovery_codes_hash` = `[{ "hash": HMAC-SHA256(OTP_HASH_KEY, 'recovery:' + user_id + ':' + kod), "usedAt": null | zaman }]`; kurulum onaylanınca 10 kod üretilir ve yalnızca o yanıtta bir kez gösterilir; her kod bir kez kullanılır. Onaysız kurulumda (`enabled_at` null) liste boştur ve yeni kurulum sırrı ezer. RLS: kullanıcı yalnızca kendi satırını okur, ekler, günceller (`user_id = app.user_id`); platform bağlamı her şey; silme yok.

#### `platform_staff` (S)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| user_id | uuid | PK, FK users | |
| role | text | `super_admin` / `operations` / `support` / `content` | |
| is_active | boolean | default true | |

**F1.6:** S sınıfı: `app_user`'ın tablo izni yok; giriş akışı rolü `platform_staff_role(user_id)` SECURITY DEFINER fonksiyonuyla okur (aktif satır yoksa null). Yazma şimdilik yalnızca seed (`SUPER_ADMIN_PHONE` → `super_admin`); platform admin paneli F2.

#### `dev_sms_outbox` (S — yalnızca dev/staging)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| phone_e164 | text | | 🔒 |
| body | text | | |

Production'da tablo boş kalır; production'da mock sağlayıcıyla uygulama başlamaz (NFR-97).

### 4.3 `settings`, `i18n`, `files`

#### `settings` (S)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| id | uuid | PK, `default gen_random_uuid()` | Satırı yalnızca `settings_put` fonksiyonu yazar; kimlik veritabanında üretilir |
| scope | text | `platform` / `plan` / `business` (CHECK) | |
| scope_id | uuid | null (platform için); plan ve işletme için not null (CHECK) | |
| key | text | not null | ör. `connection.cooldown_after_reject_days` |
| value | jsonb | not null | |
| updated_by | uuid | FK users (F1.5a'da eklenir) | `settings_put` fonksiyonu `app.user_id`'den yazar |
| created_at, updated_at | timestamptz | not null default now() | |

Benzersiz: `(scope, coalesce(scope_id, '00000000-0000-0000-0000-000000000000'), key)`. Anahtar listesi: [user-stories.md](../02-requirements/user-stories.md) US-017.

Erişim (S sınıfı, F1.4a): `app_user`'ın tabloda hiçbir izni yoktur. `migrator` sahipli `SECURITY DEFINER` fonksiyonlar:

- `settings_get(p_key text, p_business_id uuid)` → `(scope, value)` satırları: platform satırı ve (`p_business_id` verildiyse) işletme satırı ile işletmenin güncel aboneliğinin (`subscriptions.status IN ('active','grace','read_only')`) planına ait `scope = 'plan'` satırı (F1.4b). İşletme ve plan satırları yalnızca `p_business_id = app.business_id` iken veya platform bağlamında döner.
- `settings_put(p_scope text, p_scope_id uuid, p_key text, p_value jsonb) RETURNS jsonb`: yalnızca platform bağlamında (`app.is_platform = 'true'`); `updated_by` = `app.user_id`. Aynı kapsamdaki önceki değeri döner (yoksa `NULL`); `SettingsService.set` bunu aynı işlemde audit'e eski değer olarak yazar (US-017 AC2, F1.9). Değer doğrulaması uygulamada (`SettingsService`).

SECURITY DEFINER fonksiyonlarda search_path her zaman `pg_catalog, public, pg_temp` ile (pg_temp en sonda) sabitlenir.

#### `languages` (G) — `code char(2) PK`, `name text`, `is_active bool`, `is_default bool`, `sort_order int`, `direction text (ltr/rtl)`

Tek varsayılan dil: `is_default` üzerinde kısmi benzersiz indeks (`WHERE is_default`). `direction` CHECK `ltr`/`rtl`.

#### `ui_translations` (G) — `key text`, `lang char(2)`, `value text`; PK `(key, lang)`

`lang` FK `languages(code)`. Anahtar adı coding-guidelines §2 (`<alan>.<ekran>.<öğe>`); hata mesajları `errors.<ErrorCode>` (F1.3).

#### `currencies` (G) — `code char(3) PK`, `symbol text`, `decimals smallint`, `is_active bool`

`decimals` CHECK `0–4`.

#### `countries` (G) — `code char(2) PK`, `name jsonb`, `default_currency char(3)`, `default_timezone text`, `phone_prefix text`

`default_currency` FK `currencies(code)`. `default_timezone` IANA adı (ör. `Asia/Baku`).

#### `regions` (G)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| id | uuid | PK, `default gen_random_uuid()` | Geçici istisna (UUIDv7 kuralı, `settings.id` gibi; açık soru S5). Satırları admin ekranı veya SQL ile girer. |
| country_code | char(2) | FK countries | |
| parent_id | uuid | null, FK regions | Şehir → rayon |
| type | text | `city` / `district` | |
| name | jsonb | not null | |

G tablolarının hepsinde `created_at`, `updated_at` (§1). RLS: `SELECT USING (true)`; `INSERT` (WITH CHECK), `UPDATE` (USING ve WITH CHECK), `DELETE` (USING) politikaları yalnızca `current_setting('app.is_platform', true) = 'true'` iken. `app_user`: SELECT, INSERT, UPDATE, DELETE (yazma RLS ile sınırlanır); `readonly`: SELECT (F1.3).

#### `files` (T: `owner_business_id`)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| id | uuid | PK (UUIDv7, uygulamada) | Anahtardaki `<fileId>` |
| owner_business_id | uuid | null, FK businesses | Platform dosyalarında null |
| purpose | text | `product_image` / `logo` / `delivery_photo` / `dispute_photo` / `import` (CHECK) | Bucket ve izin buna göre (F1.10) |
| bucket | text | `public` / `private` (CHECK) | |
| object_key | text | not null, unique | `<businessId>/<purpose>/<fileId>.<ext>` (platform: `platform/...`) |
| content_type | text | not null | İstekte bildirilen; `ready` olunca imzayla doğrulanmış tür |
| size_bytes | int | not null, > 0 | İstekte bildirilen; `ready` olunca depodaki gerçek boyut |
| status | text | `pending` / `ready` / `rejected` (CHECK) | |
| created_by | uuid | not null, FK users | |
| created_at, updated_at | timestamptz | not null default now() | |

Benzersiz: `(owner_business_id, id)` (bileşik FK hedefi). RLS (F1.10): `files_tenant` — `owner_business_id = app.business_id` (FOR ALL); `files_platform` — `app.is_platform = 'true'` (FOR ALL). Platform dosyası (`owner_business_id` null) yalnızca platform bağlamında görünür ve yazılır. `app_user`: SELECT, INSERT, UPDATE (DELETE yok; reddedilen dosyanın satırı `rejected` olarak kalır); `readonly`: SELECT.

`businesses.logo_file_id` FK'sı bileşiktir: `(id, logo_file_id) → files(owner_business_id, id)`; işletme yalnızca kendi dosyasını logo yapabilir (FK denetimi RLS dışıdır, F1.8a kuralı).

### 4.4 `businesses`

#### `businesses` (T kendisi; D başkaları için)

RLS: `rls:T,D`; kiracı politikası `id = app.business_id`, platform politikası (§1.1). Başka kiracının dizin okuması (D) F2 dizin adımındaki `SECURITY DEFINER` fonksiyonuyla gelir. `buyer_profiles` ve `business_privacy` da `rls:T,D`; bu bölümdeki diğer T tabloları `rls:T`. Kimlikler (`id`) uygulamada UUIDv7 (`IdGenerator`, F1 faz spesifikasyonu S5 = A).

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| legal_name | text | not null | Ünvan |
| voen | char(10) | unique (null hariç) | Format: 10 rakam, son hane 1/2 |
| legal_type | text | `legal_entity` / `individual_entrepreneur`, null | VÖEN'den türetilir |
| country_code | char(2) | FK, default `AZ` | |
| region_id | uuid | FK regions, not null | Şehir/rayon |
| address_line | text | null | Gizlilik ayarına bağlı |
| geo_lat, geo_lng | numeric(9,6) | null | |
| business_phone | text | null | Gizlilik ayarına bağlı |
| logo_file_id | uuid | FK files | |
| default_language | char(2) | FK | |
| currency_code | char(3) | FK | |
| timezone | text | not null | IANA, ör. `Asia/Baku` |
| status | text | `active` / `suspended` / `dormant` / `archived` | |
| verified_at | timestamptz | null | Moderatör doğrulaması |
| verified_by | uuid | null | |
| created_via | text | `admin` / `self_signup` | |
| data_consent_version | text | null | NFR-63 |
| data_consent_at | timestamptz | null | |
| profile_completeness | smallint | 0–100 | |

İndeks: `(region_id) WHERE status = 'active'`. `voen` biçimi veritabanında da `CHECK (voen ~ '^[0-9]{9}[12]$')`.

Alan koruması (F1.7): `status`, `verified_at`, `verified_by`, `created_via` yalnızca platform bağlamında değişir. `BEFORE INSERT OR UPDATE` tetikleyicisi `businesses_guard_platform_columns` (SECURITY DEFINER değil; `SET search_path = pg_catalog, public, pg_temp`, `REVOKE ALL FROM PUBLIC`): kiracı bağlamında INSERT yalnızca `status = active`, `created_via = self_signup` ve doğrulama alanları boşken; UPDATE bu dört alanı değiştiremez. İhlal `42501`. F2.4 (migration 0016, R20): aynı tetikleyici her bağlamda `legal_type`'ı VÖEN'in son hanesinden türetir (1 = `legal_entity`, 2 = `individual_entrepreneur`, VÖEN yoksa null) ve UPDATE'te `voen` değişip aynı ifadede `verified_at`/`verified_by` değiştirilmezse doğrulama rozetini sıfırlar (`verified_at = verified_by = null`); kiracı bu alanları yine yazamaz, platform aynı ifadede VÖEN + doğrulama yazarsa korunur. Not: `dormant` geçişleri (state-machines §9) geldikleri adımda platform bağlamı veya ayrı bir fonksiyon gerektirir.

#### `business_capabilities` (T)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| business_id | uuid | PK parçası | `id` yok |
| capability | text | PK parçası; `seller` / `buyer` | |
| status | text | `pending` / `approved` / `suspended` | |
| approved_by | uuid | null | |
| approved_at | timestamptz | null | |

Kural: `seller` yeteneği yalnızca platform bağlamında `approved` yapılabilir (K1). RLS ile uygulanır (F1.7): kiracı kendi satırlarını okur ve yalnızca INSERT yapabilir — `buyer` + `approved` (perakendeci kaydı) veya `seller` + `pending`, `approved_by`/`approved_at` boş. Kiracıya UPDATE/DELETE politikası yoktur (0 satır); `approved` ↔ `suspended` geçişleri (`buyer` dahil) yalnızca platform politikasıyla. İhlal `42501`. MVP'de bir işletmenin yalnızca bir yeteneği olur; ikinci yetenek ekleme uç noktası özellik bayrağıyla kapalıdır (D20).

#### `seller_profiles` (T)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| business_id | uuid | PK | |
| description | jsonb | null | Tanıtım metni |
| stock_mode | text | `none` / `availability` / `quantity` | default `availability` |
| min_order_amount | numeric(14,2) | null | Para birimi: işletme |
| require_delivery_photo | boolean | default false | |
| low_stock_display_threshold | numeric(14,3) | default 5 | US-039 AC6 |
| default_price_list_id | uuid | FK price_lists | |
| default_warehouse_id | uuid | FK warehouses | Bileşik FK `(business_id, default_warehouse_id)` → `warehouses(business_id, id)`: yalnızca kendi deposu (FK kontrolü RLS'e bakmaz) |

#### `service_areas` (T) — `seller_id uuid`, `region_id uuid`; PK `(seller_id, region_id)`

#### `buyer_profiles` (T)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| business_id | uuid | PK | |
| activity_type_id | uuid | FK activity_types, not null | |
| listed_in_directory | boolean | default true | US-007 AC4 |
| dormant_stage | text | `none` / `reminded_7` / `reminded_30` / `warned` / `deactivated` | US-027 |
| dormant_stage_at | timestamptz | null | |

#### `business_privacy` (T)

| Alan | Tip | Varsayılan |
| --- | --- | --- |
| business_id | uuid PK | |
| show_logo | boolean | false |
| show_address | boolean | false |
| show_business_phone | boolean | false |
| show_voen | boolean | false |
| show_contact_name | boolean | false |
| show_personal_contact | boolean | false |

#### `person_data` (T, D)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| business_id | uuid | unique, FK | Bir işletmeye bir kayıt |
| contact_name | text | | 🔒 |
| personal_phone | text | null | 🔒 |
| email | text | null | 🔒 |

İndeks (F2.11a): `person_data_personal_phone_idx (personal_phone) WHERE personal_phone IS NOT NULL`; `businesses_business_phone_digits_idx (regexp_replace(business_phone, '[^0-9]', '', 'g')) WHERE business_phone IS NOT NULL` (tam telefon eşleşmesi).

**Dizin D okuması (F2.11a, `0020_directory.sql`).** `businesses`, `buyer_profiles`, `business_privacy` ve `person_data` (yalnız yetkili adı) başka kiracı için yalnız migrator sahipli `SECURITY DEFINER` fonksiyonlarla okunur (`search_path = pg_catalog, public, pg_temp`, PUBLIC EXECUTE yok, yalnız `app_user`). Fonksiyonlar için yalnız migrator'a açık okuma politikaları: `buyer_profiles_definer_select`, `business_privacy_definer_select`, `person_data_definer_select`, `business_capabilities_definer_select`, `memberships_definer_select`, `roles_definer_select` (`businesses`, `users` için 0013 / 0008'de var). Çağıran kontrolü `directory_assert_caller` (SECURITY DEFINER değil, PUBLIC EXECUTE yok); ihlal `42501`.

- `directory_buyer_documents(p_ids uuid[])` (en fazla 1000): `buyer` yeteneği `approved` ve işletmesi `active` olanların belgesi. Ünvan, faaliyet alanı, bölge, şehir (bölge rayonsa üstü), doğrulanmış her zaman; logo kimliği, adres, işletme telefonu, VÖEN, yetkili adı yalnız `business_privacy` açıksa, değilse `null`; `listed_in_directory`. Kişisel telefon, e-posta, bağlantı ve alım verisi hiç dönmez (US-007 AC6). Çağıran: onaylı ve aktif `seller` bağlamı, platform veya bağlamsız sistem işlemi (worker).
- `directory_buyer_page(p_after uuid, p_limit int)` (1–1000): dizinde görünmesi gereken kimlikler, `id` sırasıyla. Yalnız platform / bağlamsız sistem işlemi (yeniden indeksleme).
- `directory_buyer_exact_match(p_phone text, p_voen text)`: yalnız biri; tam E.164 telefon veya 10 haneli VÖEN. Biçimsiz/kısmi değer boş döner (US-020 AC2). "Dizinde görünme" kapalı olsa da bulur; `active` + `buyer approved` şartı. Telefon (kullanıcı kararı 2026-11-09): işletme telefonu (yalnız rakamlar karşılaştırılır), kişisel telefon veya işletme admini aktif üyenin giriş telefonu. Yalnız kimlik döner, en fazla 20. Çağıran yalnız onaylı ve aktif `seller` bağlamı.

- `directory_buyer_cards(p_ids uuid[])` (F2.11b, `0021_directory_cards.sql`; en fazla 20): arama ucunun kartı. Kimlikler yalnız indeks sonucundan veya `directory_buyer_exact_match`'ten gelir, istemciden gelmez (Müfettiş 15 L1). `directory_buyer_documents` alanları + bölge ve faaliyet adları (`LocalizedText`) + kişisel telefon ve e-posta (yalnız `show_personal_contact` açıksa, US-007 AC2) + logo nesnesi (`bucket`, `object_key`; yalnız `show_logo` açık ve dosya `ready`). Çağıran yalnız onaylı ve aktif `seller` bağlamı. Bunun için `files` sınıfı `rls:T,D` olur ve yalnız migrator'a açık `files_definer_select` politikası eklenir. Uç alanları her istekte buradan taze okur; indeks bayatsa (gizlenmiş, askıya alınmış, filtreden çıkmış) kayıt dönmez. Kişisel iletişim indekse hiç yazılmaz.

İndeks `buyer_directory` (Meilisearch) yalnız `active` + `buyer approved` + dizinde görünen perakendecileri ve yalnız açık alanları tutar; aranabilir yalnız `legalName`, filtre `regionId`, `cityId`, `activityTypeId`, `verified`. Outbox `buyer.registered`, `buyer.privacy_changed`, `buyer.profile_changed` (yükte yalnız `businessId`) belgeyi D fonksiyonundan yeniden okur; gece tam yeniden indeksleme (`directory.reindex_hour_utc`) ve `pnpm search:reindex` yeni indeksi doldurup takas eder (Redis kilidi). Kilit tutulurken her artımlı yenileme kimliği önce `directory:reindex:dirty` kümesine ekler; takastan hemen sonra küme boşaltılıp bu kimlikler yeni indekste yeniden işlenir (Müfettiş 15 M1).

#### `branches` (T)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| business_id | uuid | FK | |
| name | text | not null | |
| region_id | uuid | FK | |
| address_line | text | null | Kayıtta açılan varsayılan şubede boş (F2.3a); sepet onayı / sipariş gönderiminde zorunlu (F4) |
| geo_lat, geo_lng | numeric(9,6) | null | Konum uyuşmazlığı hesabı |
| approval_rule | text | `every_order` / `above_amount` / `none` | default `every_order` |
| approval_threshold | numeric(14,2) | null | `above_amount` için zorunlu |
| status | text | `active` / `inactive` | |

Benzersiz `(business_id, id)`: memberships / invitations bileşik FK hedefi (F1.8a).

#### `warehouses` (T) — `business_id`, `name`, `address_line`, `is_default bool`, `status (active/inactive)`; benzersiz `(business_id, id)` (bileşik FK hedefi); işletme başına tek `is_default` (kısmi benzersiz indeks)

#### `seller_applications` (G — yalnızca platform okur)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| legal_name | text | | |
| voen | char(10) | | Açık başvurularda unique |
| contact_name | text | | 🔒 |
| phone_e164 | text | | 🔒 |
| region_id | uuid | FK | |
| category_note | text | null, ≤ 500 | |
| status | text | `pending` / `approved` / `rejected` | default `pending`; geçişler [state-machines.md](state-machines.md) §12 |
| reviewed_by | uuid | null, FK `users` | Onaylayan / reddeden platform kullanıcısı |
| business_id | uuid | null, FK `businesses` | Onayda oluşan işletme |

**Kurallar (F2.2):** `id` UUIDv7 (uygulama), `created_at`, `updated_at`. VÖEN tekilliği kısmi benzersiz indeksle: `voen WHERE status = 'pending'` (US-008 AC3). Tutarlılık `CHECK`'i: `pending` iken `reviewed_by` ve `business_id` boş; `approved` iken ikisi dolu; `rejected` iken `reviewed_by` dolu, `business_id` boş. **RLS:** G sınıfının istisnası: okuma ve güncelleme yalnızca `app.is_platform = 'true'` (kişisel veri; herkes okumaz). Kimliksiz başvuru yalnızca `seller_application_submit(...)` `SECURITY DEFINER` fonksiyonuyla eklenir (`withSystemTx`); fonksiyon yalnızca `pending` satır yazar, migrator'a özel (`TO migrator`) ekleme politikası yalnızca bu fonksiyonun içinde etkilidir. Silme yok.

#### Perakendeci kaydı (F2.3a, SF-02)

Kayıt tek kiracı işlemidir: `withTenantTx({ businessId: yeni, userId: yeni })` (R15). İşletme, yetenek, profiller, kişisel veri, gizlilik, şube, rol ve üyelik mevcut kiracı politikalarıyla yazılır (F1.7 tetikleyicisi ve `business_capabilities_tenant_insert` yalnızca `self_signup` + `active` / `buyer` + `approved` kabul eder). Kiracının yazamadığı satırlar migrator sahipli `SECURITY DEFINER` fonksiyonlarla (`0015_buyer_signup.sql`); kimlikler parametreden değil bağlamdan alınır:

| Fonksiyon | Yazdığı | Koşul |
| --- | --- | --- |
| `user_create_self_signup(phone, full_name, preferred_language, now)` | `users` (`id = app.user_id`) | Kiracı ve kullanıcı bağlamı dolu; telefon kayıtlıysa `users_phone_e164_uq` 23505 (eşzamanlı ikinci kayıt bu satırda bekler) |
| `subscription_start_self_signup(id, plan_id, start, end, now)` | `subscriptions` (`business_id = app.business_id`, `active`) | İşletme `self_signup` + `active`, `buyer` yeteneği `approved`, hiç aboneliği yok; plan aktif, `buyer`, fiyatı 0. Aksi 42501 |
| `idempotency_lookup_by_phone(phone, key, endpoint, hash, now)` | — (okur) | Kimliksiz kayıt idempotensi, kapsam telefon (R13): `new` / `registered` / `conflict` / `replay` |
| `idempotency_store(key, endpoint, hash, status, body, expires_at)` | `idempotency_keys` (`user_id = app.user_id`) | Yanıt kayıt işleminin içinde yazılır (R12 çözümü) |

Yalnız bu fonksiyonların içinde etkili politikalar: `users_definer_insert`, `subscriptions_definer_insert` (`TO migrator`). Plan ayardan seçilir (`onboarding.buyer_plan_code`); para birimi ve saat dilimi bölgenin ülkesinden (`countries.default_currency/default_timezone`). `profile_completeness` VARSAYIM (K10): 10 alan × %10, kayıtta 40.

#### `activity_types` (G) — `name jsonb`, `is_active bool`, `sort_order int`. `id` `default gen_random_uuid()` (G tablosu istisnası, `regions` gibi; S5). Seed F2.3a'da: onaylı liste [F2-seed-listeleri.md](../tasks/F2-seed-listeleri.md) §2 (`seedBusinesses`, ada göre tekrar çalışır). Liste `GET /api/v1/catalog/activity-types` ile (yalnız aktifler).

### 4.5 `access`

#### `permissions` (G)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| code | text | PK | ör. `orders.approve` |
| capability | text | `seller` / `buyer` / `any` | |
| module | text | | |
| description | jsonb | | |

İzin kodları kodda sabittir ve migration ile eklenir; admin yalnızca şablonlara atar.

#### `role_templates` (G) — `code text unique`, `name jsonb`, `capability`, `is_business_admin boolean default false` (kopyalanan rolün admin bayrağı, F1.8a), `version int`

#### `role_template_permissions` (G) — `template_id`, `permission_code`, `default_scope`; PK `(template_id, permission_code)`

#### `job_titles` (G) — `code text unique` (seed eşleşme anahtarı, F1.8a), `name jsonb`, `capability`, `role_template_id`, `is_active`

**F2.9 (US-012, admin kataloğu; yeni kolon yok):** şablon ve unvanı platform admini açar (`/api/v1/admin/catalog/*`, platform bağlamı). `code` adminin girdiği, sonradan değişmeyen anahtardır; `capability` değişmez. Admin ekranından açılan şablon hiçbir zaman `is_business_admin` değildir; admin şablonunun izinleri değişmez. Yeni şablon aynı işlemde yeteneğin var olan işletmelerine rol olarak kopyalanır (F2.7c kuralı). `role_templates.version` yalnız izin listesi değişince 1 artar; işletme kopyaları (`roles.source_template_version`) değişmez, şablondan rolü olan arşivlenmemiş işletmelerin aktif adminlerine "yeni şablon sürümü" bildirimi gider (outbox `role_template.version_published`). Bir üyelik (`removed` dahil) veya davet unvanı gösteriyorsa unvan silinemez (`409 JOB_TITLE_IN_USE`), yalnız `is_active = false` olur; pasif unvan davet listesinde görünmez.

#### `roles` (T)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| business_id | uuid | FK | |
| name | jsonb | | |
| capability | text | | İşletmenin yeteneğiyle eşleşmeli |
| is_business_admin | boolean | default false | |
| source_template_id | uuid | null | |
| source_template_version | int | null | Yeni sürüm bildirimi için |
| is_custom | boolean | not null default false | F2.8 (US-014): şablondan kopyalanıp izinleri değiştirilmiş işletmeye özel rol; yalnız bu roller düzenlenir. Özel rol hiçbir zaman işletme admini değildir |
| permissions_version | int | not null default 1 | F2.8 (R22): rolün izinleri her değiştiğinde 1 artar; izin önbelleği rol kimliği + bu sürümle doğrulanır |

F2.8: `roles_business_template_copy_uq` kısmi tekil indeksi `(business_id, source_template_id) WHERE source_template_id IS NOT NULL AND NOT is_custom` aynı şablonun ikinci kopyasını veritabanında engeller (Müfettiş 12 notu); özel roller bu kısıta girmez.

#### `role_permissions` (T) — `role_id`, `permission_code`, `scope (all/branch/warehouse/assigned)`; PK `(role_id, permission_code)`

`business_id` kolonu yoktur; RLS politikası `roles` satırının görünür olmasını ister (`EXISTS`). F2.7c: işletme açılışında (F2.1a, F2.3a) yeteneğin tüm `role_templates` satırları rol olarak kopyalanır (admin dahil; aynı `source_template_id` ikinci kez açılmaz). Var olan işletmeler `business_roles_backfill(p_business_id uuid default null)` (0018; SECURITY DEFINER değil, yalnız `app.is_platform`, aksi 42501; PUBLIC EXECUTE yok) ile tamamlanır. Kapsamın iznin kapsam seçeneklerinden biri olması ve iznin rolün yeteneğine uyması servis kuralıdır (`permissions.ts`, F1.8a Mimar K3).

#### `memberships` (T)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| user_id | uuid | FK | |
| business_id | uuid | FK | |
| role_id | uuid | FK roles | |
| job_title_id | uuid | FK | |
| branch_id | uuid | null | Kapsam `branch` ise |
| warehouse_id | uuid | null | Kapsam `warehouse` ise |
| status | text | `active` / `removed` | |
| joined_at | timestamptz | | |

Benzersiz: `(user_id, business_id)`. Kural: her işletmede en az bir `active` ve `is_business_admin` rollü üyelik (trigger ile).

F1.8a uygulaması: `memberships` UPDATE/DELETE ve `roles` UPDATE (`is_business_admin` true→false) tetikleyicileri son admini korur; ihlal `LAST_ADMIN_PROTECTED` (SQLSTATE `AC001`). Eşzamanlı kaldırma işletme başına `pg_advisory_xact_lock` ile sıraya girer. `role_id`, `branch_id`, `warehouse_id` bileşik FK ile aynı işletmeye bağlıdır (`(business_id, x_id)`; FK denetimi RLS dışıdır). Kullanıcının tüm işletmelerdeki aktif üyelikleri `list_my_memberships()` SECURITY DEFINER fonksiyonuyla okunur (yalnız `app.user_id` satırları); `app_user` için T kuralına ek politika yoktur.

#### `membership_regions` (T) — `membership_id`, `region_id`; satış temsilcisinin `assigned` kapsamı (US-019 AC3). `business_id` yok; RLS `memberships` üzerinden (`EXISTS`).

#### `invitations` (T)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| business_id | uuid | | |
| phone_e164 | text | | 🔒 |
| role_id | uuid | | |
| job_title_id | uuid | | |
| branch_id, warehouse_id | uuid | null | |
| token_hash | text | unique | SHA-256 (hex); ham token 32 bayt base64url, yalnızca SMS bağlantısında |
| expires_at | timestamptz | | Toptancı aktivasyonu: ayar `invitation.seller_activation_days` (varsayılan 7 gün); yeniden gönderimde açık davetler `expires_at = now` ile kapanır |
| accepted_at | timestamptz | null | |
| created_by | uuid | | |

**Kabul (F2.1a):** `invitation_accept(p_token_hash, p_membership_id, p_now)` (migrator sahipli `SECURITY DEFINER`, `0013_invitation_accept.sql`). Kullanıcı `app.user_id`'den alınır. Davet `FOR UPDATE` kilitlenir; kabul edilmemiş, süresi dolmamış, kullanıcı aktif ve telefonu davetteki telefonla aynı, işletme `active` ve kullanıcının o işletmede üyeliği yoksa aktif üyelik eklenir ve `accepted_at` yazılır; aksi hâlde hiçbir şey yazılmaz (uç `404`). Fonksiyon için yalnız migrator'a açık politikalar: `invitations_definer_select`, `invitations_definer_update`, `businesses_definer_select`, `memberships_definer_insert` (`user_id = app.user_id`).

**Ekip daveti (F2.7a, `0017_team.sql`):** Kiracı (`team.manage`) daveti kendi işleminde yazar. Davet edilen telefonun kullanıcı satırı `user_ensure_for_invitation(p_id, p_phone, p_full_name, p_now)` ile (migrator sahipli `SECURITY DEFINER`; `app.business_id` + `app.user_id` bağlamı ve çağıranın o işletmede `team.manage` izinli aktif üyeliği yoksa 42501; telefon kayıtlıysa var olan kimlik, ad değişmez; yalnız kimlik döner; politika `users_definer_insert_invited`). Kabul fonksiyonu genişledi: kullanıcının o işletmede `removed` üyeliği varsa aynı satır davetteki rol/unvan/şube/depo ile `active` olur (VARSAYIM K5; politika `memberships_definer_update`, `user_id = app.user_id`). Aynı telefona açık davet yenisiyle kapanır (`expires_at = now`, VARSAYIM K3); geri çekme de aynı. `users.max` kullanımı = aktif üyelik + açık davet (VARSAYIM K2). Üyelik çıkarılınca `membership_regions` satırları silinir.

### 4.6 `billing`

#### `plans` (G)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| id | uuid | PK | UUIDv7, uygulama üretir (`IdGenerator`) |
| code | text | unique, not null | Yalnızca seed ve admin ekranında kullanılır; kod plan adına göre dallanmaz (ADR-0009 §3) |
| name | jsonb | not null | Çok dilli |
| capability | text | `seller` / `buyer` (CHECK) | |
| price | numeric(14,2) | not null, ≥ 0 (CHECK) | Kodda `Money`, asla `number` |
| currency_code | char(3) | FK currencies, not null | |
| period | text | `month` / `year` (CHECK) | |
| is_active | boolean | not null default true | |

Seed (F1.4b): `pilot` (seller, 0.00 AZN, aylık, bütün sayısal haklar sınırsız, bütün `feature.*` açık) ve `buyer_free` (buyer, 0.00 AZN, aylık, bütün sayısal haklar sınırsız, bütün `feature.*` kapalı). Gerçek fiyatlar F6.3 admin ekranından girilir.

#### `plan_entitlements` (G) — `plan_id` (FK plans), `key text`, `value jsonb not null`; PK `(plan_id, key)`; `id` yok

Anahtarlar ve tipleri (kayıt: `packages/shared/src/entitlements.ts`; yazımda Zod ile doğrulanır, bilinmeyen anahtar veya yanlış tip → `VALIDATION_FAILED`):

| Anahtar | Tip |
| --- | --- |
| `users.max`, `buyers.active.max`, `warehouses.max`, `connection_requests.daily` | tamsayı ≥ 0 veya `null` (= sınırsız) |
| `feature.courier_app`, `feature.export`, `feature.branch_pricing` | boolean |

#### `subscriptions` (T)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| id | uuid | PK | UUIDv7, uygulama üretir (`IdGenerator`) |
| business_id | uuid | FK businesses, not null | |
| plan_id | uuid | FK plans, not null | |
| status | text | `active` / `grace` / `read_only` / `cancelled` (CHECK) | Geçişler: state-machines §8 |
| current_period_start | date | not null | |
| current_period_end | date | not null, ≥ start (CHECK) | |
| grace_until | date | null | +7 gün |
| payment_note | text | null | Manuel ödeme notu |

Benzersiz: `(business_id) WHERE status IN ('active','grace','read_only')`. Bu üç durumdaki satır işletmenin **güncel aboneliğidir**; hak kontrolü ve ayarların plan katmanı bu satırın planını kullanır.

#### `entitlement_overrides` (T) — `business_id` (FK businesses), `key text`, `value jsonb not null`, `reason text null`, `created_by uuid null` (FK users F1.5a'da); PK `(business_id, key)`; `id` yok

Değer tipi `plan_entitlements` ile aynıdır ve aynı kayıtla doğrulanır.

**RLS (F1.4b, Mimar düzeltmesi D1):** `subscriptions` ve `entitlement_overrides` için kiracı politikası yalnızca `FOR SELECT` (kiracı kendi aboneliğini ve istisnasını okur, yazamaz); yazma yalnızca platform politikasıyla (`app.is_platform = 'true'`, USING ve WITH CHECK). `plans` ve `plan_entitlements` G kalıbı (F1.3).

**Hak kontrolü (`EntitlementService`, F1.4b):** değer sırası `entitlement_overrides` → güncel aboneliğin planı (`plan_entitlements`). Güncel aboneliği olmayan işletmede veya planda anahtar yoksa sayısal hak reddedilir (`ENTITLEMENT_LIMIT_REACHED`), `feature.*` kapalı sayılır. `null` = sınırsız.

### 4.7 `connections`

#### `connection_requests` (P)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| seller_id | uuid | FK businesses | |
| buyer_id | uuid | FK businesses | |
| sent_by_user_id | uuid | | |
| message | text | null, ≤ 500 karakter | |
| proposed_payment_term_days | int | null | |
| status | text | `pending` / `accepted` / `rejected` / `expired` / `withdrawn` | |
| expires_at | timestamptz | not null | |
| responded_at | timestamptz | null | |
| responded_by_user_id | uuid | null | |
| seller_local_date | date | not null | Kota hesabı için, satıcının saat diliminde |

Benzersiz: `(seller_id, buyer_id) WHERE status = 'pending'`. İndeks: `(seller_id, seller_local_date)` (kota), `(buyer_id, status)`, `(expires_at) WHERE status = 'pending'`.

#### `connections` (P)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| seller_id | uuid | | |
| buyer_id | uuid | | |
| request_id | uuid | FK connection_requests | |
| status | text | `active` / `cancelled` | |
| price_list_id | uuid | null | null = satıcının varsayılan listesi |
| branch_pricing_enabled | boolean | default false | D3 |
| credit_limit | numeric(14,2) | null | MVP'de uyarı amaçlı |
| payment_term_days | int | default 0 | |
| sales_rep_membership_id | uuid | null | |
| started_at | timestamptz | | |
| ended_at | timestamptz | null | |
| ended_by_side | text | `seller` / `buyer`, null | |
| end_reason | text | null | |
| ended_by_user_id | uuid | null | |

Benzersiz: `(seller_id, buyer_id) WHERE status = 'active'`. İndeks: `(buyer_id) WHERE status = 'active'`.

#### `blocks` (T: `buyer_id`; satıcı yalnızca var/yok bilgisini fonksiyonla alır)

`buyer_id uuid`, `seller_id uuid`, `created_by_user_id uuid`; PK `(buyer_id, seller_id)`.

**RLS ve fonksiyonlar (F2.12a):** `connection_requests` ve `connections` P: okuma ve güncelleme `seller_id` veya `buyer_id` = `app.business_id`; istek yalnız satıcı (`seller_id` = bağlam), bağlantı yalnız alıcı (`buyer_id` = bağlam, kabul F2.13) ekler; silme yok; platform yalnız okur. `app_user`'ın UPDATE izni kolon düzeyindedir: taraf ve kimlik kolonları (`id`, `seller_id`, `buyer_id`, `request_id`, `sent_by_user_id`, `seller_local_date`, `started_at`, `created_at`) değiştirilemez (Müfettiş 16 M1). `blocks` T (alıcı). `migrator` sahipli `SECURITY DEFINER`, yalnız onaylı ve aktif satıcı bağlamında: `connection_buyer_targets(p_ids uuid[])` (≤20; onaylı `buyer`, aktif, çağıran olmayan işletmelerin ünvanı, bölgesi/şehri ve çağıranı engelleyip engellemediği), `connection_request_recipients(p_request_id uuid)` (çağıranın `pending` isteğindeki alıcının aktif işletme adminleri). Kota günü satıcının saat dilimindeki `seller_local_date`; aynı satıcının eşzamanlı istekleri `pg_advisory_xact_lock` ile sıralanır.

**Yanıt, geri çekme, engel (F2.13a, `0023_connection_responses.sql`):** `connections.request_id` benzersiz. Tetikleyiciler (DEFINER değil, ikinci savunma): `connection_requests_guard` — yeni istek yalnız `pending` ve yanıt alanları boş; geçiş yalnız `pending →`; `accepted`/`rejected` yalnız alıcı bağlamında ve `responded_at`/`responded_by_user_id` dolu; `withdrawn` yalnız satıcı bağlamında, yanıt alanları boş; `expired` yalnız bağlamsız sistem işinde (F2.16); durum değişmeden yanıt alanı yazılamaz. `connections_guard` — bağlantıyı yalnız alıcı bağlamı ekler, yalnız `active` ve yalnız aynı çiftin `accepted` isteğinden; `cancelled` bir daha `active` olmaz. Engel aktif bağlantıyı kapatırsa `ended_by_side = buyer`, `end_reason = blocked`. Kabulde `payment_term_days` = isteğin önerilen vadesi, yoksa 0. `migrator` sahipli `SECURITY DEFINER`, yalnız onaylı ve aktif `buyer` bağlamında (`connection_assert_buyer_caller`): `connection_seller_summaries(p_ids uuid[])` (≤50; yalnız çağıranla isteği, bağlantısı veya engeli olan satıcıların ünvanı, `seller_profiles.description` ve `ready` logo nesnesi; satıcının gizlilik ayarı yoktur) ve `connection_seller_recipients(p_request_id uuid)` (çağıranın yanıtladığı isteği gönderen, hâlâ aktif üyeyse, + satıcının aktif işletme adminleri). Bunun için `seller_profiles` sınıfı `rls:T,D` ve yalnız migrator'a açık `seller_profiles_definer_select` politikası.

### 4.8 `catalog`

#### `units` (G) — `code text PK` (UN/ECE), `kind (count/weight/volume/length/area/package)`, `name jsonb`, `abbreviation jsonb`, `allows_decimal bool`, `is_active bool`

#### `unit_conversions` (G) — `from_code`, `to_code`, `factor numeric(18,6)`; PK `(from_code, to_code)`

#### `categories` (G) — `parent_id`, `name jsonb`, `depth smallint CHECK (depth BETWEEN 1 AND 3)`, `sort_order`, `is_active`

#### `brands` (G) — `name text unique`, `status (active/requested/rejected)`, `requested_by_business_id uuid null`

#### `products` (T: `seller_id`)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| seller_id | uuid | | |
| sku | text | not null | |
| name | jsonb | not null, en az bir dil | |
| description | jsonb | null | |
| category_id | uuid | FK | |
| brand_id | uuid | FK, null | |
| base_unit_code | text | FK units | |
| has_expiry | boolean | default false | |
| shelf_life_months | smallint | `has_expiry` ise zorunlu | |
| status | text | `draft` / `active` / `archived` | |

Benzersiz: `(seller_id, sku)`.

#### `product_variants` (T)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| product_id | uuid | FK | |
| seller_id | uuid | | |
| sku | text | | |
| attributes | jsonb | | ör. `{"volume_ml": 400}` |
| gtin | text | null | Tüketici birimi barkodu |
| is_available | boolean | default true | Stok modu `availability` |
| status | text | `active` / `archived` | |

Benzersiz: `(seller_id, sku)`. İndeks: `(seller_id, gtin)`.

#### `product_packaging` (T)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| variant_id | uuid | FK | |
| seller_id | uuid | | |
| level | text | `unit` / `inner` / `case` / `pallet` | |
| unit_code | text | FK units | ör. `H87`, `XCT` |
| base_qty | numeric(14,3) | > 0 | İçerdiği temel birim sayısı |
| gtin | text | null | |
| weight_g | int | null | |
| dimensions_mm | jsonb | null | `{l, w, h}` |
| is_sales_unit | boolean | | En az biri true |
| min_order_qty | numeric(14,3) | default 1 | Satış biriminde |
| order_multiple | numeric(14,3) | default 1 | |

Benzersiz: `(variant_id, level)`.

#### `product_images` (T) — `product_id`, `seller_id`, `file_id`, `sort_order`; ürün başına en fazla 8

#### `product_visibility` (T) — `product_id`, `seller_id`, `price_list_id uuid null`, `region_id uuid null`. Kayıt yoksa ürün tüm bağlı perakendecilere görünür.

#### `import_jobs` (T) — sahibi `imports` modülü

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| seller_id | uuid | | |
| type | text | `products` / `customer_prices` / `stock` | |
| file_id | uuid | | |
| status | text | `uploaded` / `validating` / `preview_ready` / `applying` / `done` / `failed` | |
| stats | jsonb | | `{insert, update, error}` |
| error_report_file_id | uuid | null | |
| created_by | uuid | | |

### 4.9 `pricing`

#### `price_lists` (T)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| seller_id | uuid | | |
| name | text | | |
| currency_code | char(3) | | |
| vat_included | boolean | | |
| vat_rate | numeric(5,2) | | 📌 VARSAYIM: Liste düzeyinde tek ƏDV oranı; ürün bazında farklı oran gerekirse `products.vat_rate` eklenir |
| is_default | boolean | | Satıcı başına tek |
| status | text | `active` / `archived` | |

#### `price_list_items` (T)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| price_list_id | uuid | | |
| seller_id | uuid | | |
| packaging_id | uuid | FK | Fiyat satış birimi başınadır |
| unit_price | numeric(14,4) | ≥ 0 | |
| valid_from | timestamptz | not null | Geleceğe tarihli değişiklik |

PK: `(price_list_id, packaging_id, valid_from)`. Geçerli fiyat: `valid_from ≤ now()` olan en büyük `valid_from`.

#### `customer_prices` (T: `seller_id`)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| seller_id | uuid | | |
| buyer_id | uuid | | |
| branch_id | uuid | null | null = müşteri fiyatı; dolu = şube fiyatı (yalnızca `connections.branch_pricing_enabled`) |
| packaging_id | uuid | | |
| unit_price | numeric(14,4) | | |
| valid_from | timestamptz | | |

Benzersiz: `(seller_id, buyer_id, coalesce(branch_id, …), packaging_id, valid_from)`.

#### `branch_discounts` (T)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| seller_id | uuid | | |
| buyer_id | uuid | | |
| branch_id | uuid | | |
| target | text | `all` / `brand` / `category` | |
| brand_id, category_id | uuid | null | |
| percent | numeric(5,2) | 0 < x ≤ 100 | |
| valid_from, valid_to | timestamptz | valid_to null | |

#### `tier_prices` (T) — `seller_id`, `packaging_id`, `min_qty numeric(14,3)`, `discount_percent numeric(5,2)`; benzersiz `(packaging_id, min_qty)`

### 4.10 `inventory`

#### `stock` (T)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| seller_id | uuid | | |
| warehouse_id | uuid | PK parçası | `id` yok |
| variant_id | uuid | PK parçası | |
| on_hand | numeric(14,3) | ≥ 0 | Temel birimde |
| reserved | numeric(14,3) | ≥ 0, ≤ on_hand | |
| low_threshold | numeric(14,3) | null | Depo uyarısı |

#### `stock_movements` (T, yalnızca ekleme)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| seller_id | uuid | | |
| warehouse_id | uuid | | |
| variant_id | uuid | | |
| type | text | `receipt` / `reserve` / `release` / `ship` / `return` / `adjustment` | |
| on_hand_delta | numeric(14,3) | | |
| reserved_delta | numeric(14,3) | | |
| order_id | uuid | null | |
| lot_no | text | null | D24 |
| expiry_date | date | null | |
| note | text | null | |
| created_by | uuid | null | |

İndeks: `(warehouse_id, variant_id, created_at)`.

### 4.11 `cart`

#### `carts` (T: `buyer_id`)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| buyer_id | uuid | | |
| branch_id | uuid | unique | Şube başına tek sepet |
| status | text | `open` / `pending_approval` | |
| submitted_by_user_id | uuid | null | |
| submitted_at | timestamptz | null | |
| return_note | text | null | |

#### `cart_items` (T)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| cart_id | uuid | | |
| buyer_id | uuid | | |
| seller_id | uuid | | |
| packaging_id | uuid | | |
| qty | numeric(14,3) | > 0 | Satış biriminde |
| added_by_user_id | uuid | | |

Benzersiz: `(cart_id, packaging_id)`.

#### `cart_approvals` (T) — `cart_id`, `buyer_id`, `action (submitted/approved/returned)`, `user_id`, `note`, `order_ids uuid[]`

### 4.12 `orders`

#### `seller_sequences` (T) — `seller_id`, `kind ('order')`, `year smallint`, `next_value int`; PK `(seller_id, kind, year)`

#### `orders` (P)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| number | text | unique `(seller_id, number)` | ör. `2026-000123` |
| seller_id | uuid | | |
| buyer_id | uuid | | |
| branch_id | uuid | | |
| connection_id | uuid | | |
| cart_id | uuid | null | |
| currency_code | char(3) | | |
| language_code | char(2) | | Belge dili |
| status | text | bkz. [state-machines.md](state-machines.md) §3 | |
| vat_included | boolean | | |
| subtotal | numeric(14,2) | | |
| discount_total | numeric(14,2) | | |
| vat_total | numeric(14,2) | | |
| total | numeric(14,2) | | |
| payment_term_days | int | | Bağlantıdan kopya |
| delivery_snapshot | jsonb | | 🔒 Şube adresi, konum, iletişim adı ve telefonu |
| submitted_by_user_id | uuid | | |
| branch_approved_by_user_id | uuid | null | |
| created_by_seller_user_id | uuid | null | US-061 |
| seller_decided_by_user_id | uuid | null | |
| submitted_at | timestamptz | | |
| approved_at | timestamptz | null | |
| shipped_at | timestamptz | null | |
| delivered_at | timestamptz | null | Kesinleşme anı |
| auto_confirmed | boolean | default false | KPI-05 |
| cancelled_at | timestamptz | null | |
| reject_reason | text | null | |
| einvoice_number | text | null | US-053 AC2 |

İndeks: `(seller_id, status, submitted_at DESC)`, `(buyer_id, status, submitted_at DESC)`, `(branch_id, submitted_at DESC)`.

#### `order_items` (P)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| order_id | uuid | | |
| seller_id, buyer_id | uuid | | RLS için |
| variant_id | uuid | | |
| packaging_id | uuid | | |
| name_snapshot | jsonb | | Tüm dillerde ad |
| unit_code | text | | |
| base_qty_per_unit | numeric(14,3) | | |
| qty_ordered | numeric(14,3) | | |
| qty_approved | numeric(14,3) | null | Toptancı onayında |
| unit_price | numeric(14,4) | | |
| price_source | text | `branch_price` / `customer_price` / `price_list` / `default_list` | |
| tier_discount_pct | numeric(5,2) | default 0 | |
| branch_discount_pct | numeric(5,2) | default 0 | |
| line_total | numeric(14,2) | | |
| vat_rate | numeric(5,2) | | |
| lot_no | text | null | |
| expiry_date | date | null | |

#### `order_item_changes` (P) — `order_item_id`, `order_id`, `seller_id`, `buyer_id`, `old_qty`, `new_qty`, `reason`, `user_id`

#### `order_status_history` (P, yalnızca ekleme) — `order_id`, `seller_id`, `buyer_id`, `from_status`, `to_status`, `actor_user_id null`, `actor_type (user/system)`, `note`

#### `favorites` (T: `buyer_id`) — `buyer_id`, `user_id`, `product_id`; PK `(user_id, product_id)`

### 4.13 `delivery`

#### `deliveries` (P)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| order_id | uuid | unique | |
| seller_id, buyer_id | uuid | | |
| provider | text | `own_courier` / `manual_carrier` | |
| courier_membership_id | uuid | null | |
| carrier_name | text | null | |
| tracking_no | text | null | |
| status | text | bkz. [state-machines.md](state-machines.md) §4 | |
| assigned_at | timestamptz | | |
| departed_at | timestamptz | null | |
| delivered_at | timestamptz | null | "Teslim ettim" anı |
| auto_confirm_at | timestamptz | null | +48 saat |
| confirmed_at | timestamptz | null | |
| location_mismatch | boolean | default false | |

İndeks: `(auto_confirm_at) WHERE status = 'delivered_pending'`, `(courier_membership_id, status)`.

#### `delivery_attempts` (P) — `delivery_id`, `seller_id`, `buyer_id`, `reason`, `geo_lat`, `geo_lng`

#### `delivery_proofs` (P)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| delivery_id | uuid | | |
| seller_id, buyer_id | uuid | | |
| kind | text | `courier_delivered` / `buyer_confirmed` / `auto_confirmed` / `buyer_disputed` | |
| file_id | uuid | null | Fotoğraf |
| geo_lat, geo_lng | numeric(9,6) | null | |
| distance_m | int | null | Şubeye uzaklık |
| user_id | uuid | null | |

#### `disputes` (P)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| delivery_id, order_id | uuid | | |
| seller_id, buyer_id | uuid | | |
| type | text | `missing` / `damaged` / `not_received` | |
| description | text | | |
| file_id | uuid | null | |
| status | text | `open` / `accepted` / `rejected` | |
| resolution_note | text | null | |
| resolved_by | uuid | null | |
| resolved_at | timestamptz | null | |

### 4.14 `ledger`

#### `ledger_entries` (P, yalnızca ekleme)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| seller_id, buyer_id | uuid | | |
| currency_code | char(3) | | |
| type | text | `order_delivered` / `payment` / `adjustment` / `reversal` / `opening_balance` | |
| debit | numeric(14,2) | ≥ 0 | |
| credit | numeric(14,2) | ≥ 0 | |
| order_id | uuid | null | |
| payment_id | uuid | null | |
| reverses_entry_id | uuid | null | |
| due_date | date | null | Teslim + vade |
| posted_at | timestamptz | | |
| created_by | uuid | null | |

Kısıt: `(debit > 0) <> (credit > 0)` (tam olarak biri). Benzersiz: `(order_id) WHERE type = 'order_delivered'`. İndeks: `(seller_id, buyer_id, currency_code, posted_at)`. Bakiye saklanmaz; sorguyla hesaplanır.

#### `payments` (P)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| seller_id, buyer_id | uuid | | |
| currency_code | char(3) | | |
| amount | numeric(14,2) | > 0 | |
| method | text | `cash` / `bank_transfer` / `card` | |
| received_at | timestamptz | | |
| status | text | `pending_review` / `posted` / `rejected` | |
| entered_by_user_id | uuid | | |
| reviewed_by_user_id | uuid | null | |
| delivery_id | uuid | null | Kapıda tahsilat |
| provider | text | default `manual` | İleride ödeme sağlayıcısı (D1) |
| note | text | null | |

#### `courier_cash` (T: `seller_id`) — `seller_id`, `courier_membership_id`, `payment_id unique`, `amount`, `currency_code`, `status (held/handed_over)`, `handed_over_at`, `confirmed_by`

### 4.15 `documents`

#### `documents` (P)

| Alan | Tip | Kısıt | Not |
| --- | --- | --- | --- |
| seller_id, buyer_id | uuid | | |
| type | text | `order_document` / `statement` | |
| order_id | uuid | null | |
| period_from, period_to | date | null | Ekstre |
| language_code | char(2) | | |
| file_id | uuid | null | |
| status | text | `pending` / `ready` / `failed` | |

### 4.16 `notifications`

| Tablo | Sınıf | Alanlar |
| --- | --- | --- |
| `push_tokens` | U | `id`, `user_id`, `token text unique`, `platform (ios/android)`, `last_seen_at`, `created_at`, `updated_at` |
| `notifications` | U | `id`, `user_id`, `business_id` (boş olabilir; işletmesiz bildirim), `type`, `payload jsonb`, `read_at`, `source_event_id bigint` (boş olabilir; bildirimi doğuran outbox olayı), `created_at`; dizin `(user_id, id)`; benzersiz `(user_id, source_event_id)` |
| `notification_templates` | G | `type`, `lang`, `title`, `body`, `created_at`, `updated_at`; PK `(type, lang)` |
| `notification_preferences` | U | `user_id`, `type`, `push_enabled bool`, `created_at`, `updated_at`; PK `(user_id, type)` |

**Kurallar (F1.11):**

- `notifications.payload` = `{ id, params }`: yalnızca kimlik, sayı veya kod (outbox yükü kuralı, ADR-0010 §3). Başlık ve metin satırda saklanmaz; okunurken alıcının dilindeki şablondan üretilir (yoksa `az`, US-058 AC3). Şablonda `{ad}` yer tutucusu `params.ad` ile doldurulur.
- Tercih satırı yoksa push açıktır (`push_enabled = true` varsayılan).
- **İdempotens (ADR-0010 §4):** outbox olayından gelen bildirim `source_event_id` taşır; aynı olay aynı alıcı için ikinci kez işlenirse satır eklenmez (`ON CONFLICT DO NOTHING`) ve push gönderilmez.
- **RLS:** `push_tokens` app_user için `SELECT`, `DELETE` (kendi satırı); ekleme ve başka kullanıcıdan taşıma yalnızca `push_token_register(id, token, platform, now)` SECURITY DEFINER fonksiyonuyla (kullanıcı `app.user_id`'den alınır, parametreden değil). `notifications` için `SELECT`, `INSERT`, yalnızca `read_at` kolonunda `UPDATE`. `notification_preferences` için `SELECT`, `INSERT`, `UPDATE`. Silme yok (token hariç).
- Worker alıcı adına `withUserTx({ userId: alıcı })` ile yazar; dil `users.preferred_language` (kendi satırı).

### 4.17 `platform-admin`

#### `impersonation_sessions` (S) — `staff_user_id`, `target_user_id`, `target_business_id`, `reason text not null`, `started_at`, `ends_at (+30 dk)`, `ended_at`

## 5. Kişisel veri alanları özeti

| Tablo | Alanlar |
| --- | --- |
| `users` | `phone_e164`, `full_name` |
| `otp_challenges` | `phone_e164` |
| `person_data` | `contact_name`, `personal_phone`, `email` |
| `invitations` | `phone_e164` |
| `seller_applications` | `contact_name`, `phone_e164` |
| `orders` | `delivery_snapshot` (iletişim adı ve telefonu) |
| `dev_sms_outbox` | `phone_e164` |

Silme / anonimleştirme talebinde (NFR-64): `users.full_name` → `Silinmiş kullanıcı`, `phone_e164` → `+000<id kısaltması>`; `person_data` silinir; `orders.delivery_snapshot` içindeki iletişim alanları silinir, adres korunur.

## 6. Migration kuralları

1. Migration'lar Drizzle Kit ile üretilir ve `apps/api/drizzle/` altında sürüm kontrolündedir.
2. Her migration geri alınabilir olmalıdır (veri kaybettiren geri alma yasak; kolon silme iki adımda: önce kullanımdan kaldır, sonraki sürümde sil).
3. Her yeni kiracı tablosu, aynı migration içinde RLS politikasıyla gelir. CI, RLS'si olmayan T/P sınıfı tabloyu reddeder (bkz. [test-strategy.md](../05-planning/test-strategy.md)).
4. Başlangıç verileri (birimler, diller, para birimleri, AZ bölgeleri, izinler, rol şablonları, platform ayarları) `seed` betikleriyle yüklenir ve idempotendir.
5. Veritabanı rolleri (`app_user`, `migrator`, `readonly`) migration dışında `pnpm db:bootstrap` ile süper kullanıcıyla oluşturulur; şifreler depoda tutulmaz, ortam değişkenlerinden atanır. `ALTER DEFAULT PRIVILEGES` kullanılmaz; her migration tablo izinlerini `GRANT` ile verir. RLS politikaları elle SQL ile yazılır (ADR-0005) ve bağlamı `nullif(current_setting('app.business_id', true), '')::uuid` kalıbıyla okur. Yalnızca testte kullanılan tablolar migration'a girmez.
6. Her tablo, oluşturulduğu migration'da RLS sınıfını tablo yorumu olarak taşır: `COMMENT ON TABLE <tablo> IS 'rls:<sınıf>'` (sınıf: T, P, G, U, S, D; birden fazlaysa virgülle, örn. `rls:T,D`). `pnpm check-rls` (apps/api/src/core/db/check-rls.ts) bu yorumu okur; yorumsuz tablo, RLS'i/`FORCE`'u/politikası eksik T, P, U tablosu ve `app_user`'ın SELECT izni olan S tablosu CI'ı kırar. G tablosunun her yazma politikası `app.is_platform` koşulu taşır; tek istisna yalnızca `migrator` rolüne verilmiş (`TO migrator`) politikalardır, çünkü bunlar yalnızca `SECURITY DEFINER` fonksiyonların içinde etkilidir ve fonksiyonlar `security-definer.int.test.ts` ile ayrıca denetlenir (F2.2).

✅ ÇÖZÜLDÜ (2026-10-31): Pilot `regions` ve `activity_types` listeleri platform sahibince onaylandı: [docs/tasks/F2-seed-listeleri.md](../tasks/F2-seed-listeleri.md). Tam ülke listesi sonra, aynı onay yoluyla eklenir.
