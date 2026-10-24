# Kodlama Kuralları

| Alan | Değer |
| --- | --- |
| Sürüm | 1.0 |
| Tarih | 2026-10-24 |
| İlgili belgeler | [tech-stack.md](tech-stack.md) · [c4-component.md](../03-architecture/c4-component.md) · [data-model.md](../03-architecture/data-model.md) · [definition-of-done.md](definition-of-done.md) |

Bu kurallar insan ve AI geliştiriciler için aynıdır. **"ZORUNLU"** ile işaretli kurallar CI'da otomatik kontrol edilir; ihlal eden pull request birleştirilemez.

## 1. Depo ve klasör yapısı

```
b2b-platform/
├─ AGENTS.md                      # AI asistanı kuralları (kısa)
├─ CLAUDE.md                      # "@AGENTS.md" — Claude Code için yönlendirme
├─ CHANGELOG.md
├─ docs/                          # Bu dokümantasyon (tek doğru kaynak)
├─ apps/
│  ├─ api/                        # NestJS: HTTP API + worker (iki giriş noktası)
│  │  ├─ src/
│  │  │  ├─ main.ts               # api giriş noktası
│  │  │  ├─ worker.main.ts        # worker giriş noktası (HTTP yok)
│  │  │  ├─ cli.ts                # yönetim komutları (runbook)
│  │  │  ├─ core/                 # db, tenant-context, errors, idempotency, outbox, audit, clock, money
│  │  │  ├─ infrastructure/       # adaptör uygulamaları: sms/, push/, storage/, error-reporter/
│  │  │  └─ modules/
│  │  │     └─ <modül>/           # identity, businesses, access, connections, catalog, pricing, ...
│  │  │        ├─ index.ts        # YALNIZCA dışa açık servis arayüzü ve DTO'lar
│  │  │        ├─ <modül>.module.ts
│  │  │        ├─ <modül>.controller.ts
│  │  │        ├─ <modül>.service.ts
│  │  │        ├─ <modül>.repository.ts
│  │  │        ├─ <modül>.schema.ts       # Drizzle tablo tanımları
│  │  │        ├─ <modül>.dto.ts          # Zod şemaları
│  │  │        ├─ <modül>.errors.ts
│  │  │        ├─ <modül>.events.ts       # outbox olay tipleri
│  │  │        ├─ jobs/                   # worker işleri
│  │  │        └─ __tests__/              # *.test.ts, *.isolation.test.ts
│  │  ├─ drizzle/                 # migration dosyaları + RLS SQL
│  │  └─ test/                    # fabrikalar, test yardımcıları
│  ├─ web/                        # Next.js
│  │  └─ src/
│  │     ├─ app/[locale]/(auth)|(admin)|(seller)|(buyer)/...
│  │     ├─ features/<özellik>/   # ekran bileşenleri, hook'lar, sorgular
│  │     └─ lib/                  # api istemcisi, i18n, oturum
│  └─ mobile/                     # Expo
│     ├─ app/(auth)|(seller)|(buyer)/...   # expo-router
│     └─ src/features/<özellik>/
├─ packages/
│  ├─ shared/                     # hata kodları, izin kodları, ayar anahtarları, Zod şemaları, env
│  ├─ api-client/                 # openapi.yaml'dan üretilir — ELLE DÜZENLENMEZ
│  ├─ ui/                         # web bileşenleri
│  └─ config/                     # eslint, tsconfig, prettier
├─ infra/                         # docker-compose.*.yml, Caddyfile, bootstrap.sh, deploy.sh
└─ scripts/                       # seed-demo, staging-stop vb.
```

## 2. İsimlendirme

| Öğe | Kural | Örnek |
| --- | --- | --- |
| Dosya ve klasör | kebab-case | `connection-policy.ts` |
| Sınıf, tip, arayüz | PascalCase | `ConnectionPolicy`, `SmsSender` |
| Fonksiyon, değişken | camelCase | `canRequest`, `buyerId` |
| Sabit | UPPER_SNAKE_CASE | `MAX_IMAGES_PER_PRODUCT` |
| Veritabanı tablo ve kolon | snake_case, tablo çoğul | `connection_requests.expires_at` |
| API yolu | kebab-case, çoğul isim | `/api/v1/connection-requests/{id}/accept` |
| API JSON alanı | camelCase | `expiresAt` |
| Hata kodu | UPPER_SNAKE_CASE, `ErrorCode` listesinden | `CONNECTION_COOLDOWN_ACTIVE` |
| İzin kodu | `<modül>.<eylem>` | `orders.approve` |
| Ayar anahtarı | `<alan>.<ad>` | `connection.daily_request_quota` |
| Olay adı | `<varlık>.<geçmiş zaman>` | `order.approved` |
| Çeviri anahtarı | `<alan>.<ekran>.<öğe>` | `orders.detail.approveButton` |
| Domain terimleri | **Yalnızca** [glossary.md](../02-requirements/glossary.md) kod adları | `seller`, `buyer` (asla `vendor`, `customer`, `retailer`) |

## 3. Katman ve modül kuralları

1. **ZORUNLU:** Modüller arası içe aktarma yalnızca hedef modülün `index.ts` dosyasından (`eslint-plugin-boundaries`).
2. **ZORUNLU:** Bağımlılık yönü [c4-component.md](../03-architecture/c4-component.md) §1'deki diyagrama uyar; döngü yasak.
3. Controller iş kuralı içermez: girdiyi doğrular, servisi çağırır, yanıtı döndürür.
4. Servis iş kurallarını uygular; veritabanına yalnızca kendi repository'si üzerinden erişir.
5. Repository yalnızca kendi modülünün tablolarına sorgu yazar.
6. **ZORUNLU:** Her controller metodu ya `@RequirePermission('<kod>')` ya da `@Public()` dekoratörü taşır (özel lint kuralı).
7. **ZORUNLU:** Veritabanı erişimi yalnızca `withTenantTx(ctx, fn)` (kiracı bağlamı) veya `withPlatformTx(ctx, fn)` (yalnızca `platform-admin`) üzerinden. Doğrudan `db` nesnesi modüllerden içe aktarılamaz. `withSystemTx` yalnızca bağlamsız sistem okumaları (ayar, worker) içindir; kiracı verisi göremez.
8. Aynı işlemde olması gereken yan etkiler (ör. teslim onayı + cari kaydı), işlem nesnesi (`tx`) parametre olarak geçirilerek doğrudan servis çağrısıyla yapılır. Ertelenebilir yan etkiler outbox olayıdır (ADR-0010).
9. Durum değişiklikleri yalnızca ilgili `*StateMachine` sınıfı üzerinden; durum alanına doğrudan yazmak yasaktır.
10. Saat için `Clock` servisi kullanılır (`new Date()` yerine) — testlerde zaman kontrol edilebilir.
11. Kod hiçbir yerde işletme tipine bakmaz; yetenek ve izin sorar (ADR-0004).
12. Kod hiçbir yerde plan adına bakmaz; `EntitlementService` kullanır (ADR-0009). Sabit süre, kota veya eşik yazılmaz; `SettingsService` kullanılır.

## 4. Veritabanı ve migration

1. Tablolar [data-model.md](../03-architecture/data-model.md) ile birebir aynıdır. Yeni tablo veya kolon önce data-model.md'de, sonra kodda.
2. **ZORUNLU:** Kiracıya bağlı (T, P, U) her yeni tablo aynı migration'da `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY` ve politikalarıyla gelir (CI kontrolü).
3. Migration'lar geriye uyumludur (genişlet → taşı → daralt).
4. Para: `numeric`; kodda `decimal.js`. **ZORUNLU:** Para alanında `number` tipi kullanılmaz (lint: `Money` tipi).
5. Zaman: `timestamptz`; kodda UTC `Date`; gösterim istemcide.
6. Yalnızca eklenen tablolar (`ledger_entries`, `stock_movements`, `order_status_history`, `audit_logs`) için repository'de `update`/`delete` metodu yazılmaz.
7. Uzun listeler imleç sayfalamasıyla; `OFFSET` kullanılmaz.

## 5. API

1. Sözleşme önce: önce `openapi.yaml`, sonra kod (ADR-0022). **ZORUNLU:** CI sözleşme kontrolü.
2. Tüm girdiler Zod şemasıyla doğrulanır; bilinmeyen alanlar reddedilir (`strict()`).
3. İstemciden fiyat, toplam, durum veya kiracı kimliği (gövdede) kabul edilmez; bunlar sunucuda belirlenir.
4. Başka kiracıya ait veya bulunmayan kaynak her zaman `404` döner (varlık sızdırılmaz).
5. Durum değiştiren ve oluşturan POST uçları `Idempotency-Key` başlığını destekler.
6. Liste yanıtları `{ items, nextCursor }`.

## 6. Hata yönetimi

1. İş kuralı ihlalleri `DomainError(code, details?)` fırlatır; `code` her zaman `packages/shared` içindeki `ErrorCode` listesindendir. Yeni kod eklenirse `openapi.yaml` `ErrorCode` listesi de güncellenir.
2. Global hata filtresi `DomainError`'ı HTTP durumuna eşler (tablo `core/errors/http-map.ts`) ve `Error` şemasında döner; mesaj `Accept-Language` dilinde çeviri anahtarından gelir. Kod → HTTP durum eşlemesinin tek kaynağı `core/errors/http-map.ts`'tir; belgelerde geçen her `<durum> <KOD>` ifadesi bu tabloyla aynı olmalıdır (test ile denetlenir).
3. Beklenmeyen hatalar `500 INTERNAL_ERROR` + `requestId` döner; ayrıntı yalnızca logda ve Sentry'de.
4. Hata yutulmaz (`catch {}` yasak). Yeniden deneme yalnızca adaptörlerde ve worker işlerinde, [integrations.md](../03-architecture/integrations.md) §8'e göre.

## 7. Loglama

1. Logger enjekte edilir (`PinoLogger`); `console.log` yasak (lint).
2. Biçim ve zorunlu alanlar: [observability.md](../06-operations/observability.md) §1.
3. **Asla loglanmaz:** OTP kodu, anahtarlar, JWT, şifreli alanlar, `person_data`, istek gövdesinin tamamı. Telefon numarası maskelenir.
4. Seviyeler: `info` iş olayları (sipariş onaylandı), `warn` beklenen ama dikkat isteyen durum (hız sınırı, yeniden deneme), `error` beklenmeyen hata.

## 8. Test yazma kuralları

1. Her AC için en az bir test; test adı AC kimliğiyle başlar: `it('US-021 AC5: bekleme süresi aktifken reddedilir', …)`.
2. Kritik alanlarda **önce test** ([test-strategy.md](../05-planning/test-strategy.md) §3).
3. **ZORUNLU:** Kiracıya bağlı her uç nokta için `*.isolation.test.ts` içinde en az bir test: B işletmesinin kullanıcısı A'nın kaydını okuyamaz/listeleyemez/değiştiremez.
4. Entegrasyon testleri gerçek PostgreSQL ve Redis kullanır; dış servisler mock adaptörlerle.
5. Testler birbirinden bağımsızdır; her test kendi verisini fabrikayla üretir.
6. Testi geçirmek için test gevşetilmez; test yanlışsa ayrı commit ve gerekçe.
7. Zaman, `Clock` taklidiyle kontrol edilir; testlerde `sleep` kullanılmaz.

## 9. Web ve mobil

1. API çağrıları yalnızca `packages/api-client` üzerinden; elle yazılmış `fetch` URL'si yok.
2. Sunucu verisi React Query'de; bileşen içinde sunucu verisinin kopyası tutulmaz.
3. **ZORUNLU:** Arayüzde sabit metin yok; tüm metinler çeviri anahtarı (lint: JSX içinde düz metin uyarısı).
4. Tutar ve tarih gösterimi `packages/shared` biçimlendiricileriyle (dil + para birimi + saat dilimi).
5. Menü ve düğmeler `me.activeBusiness.permissions` listesinden üretilir; izin kontrolü arayüzde yalnızca görünürlük içindir, güvenlik backend'dedir.
6. Web'de erişim anahtarı yalnızca bellekte; `localStorage` kullanılmaz. Mobilde yenileme anahtarı `expo-secure-store`'da.
7. `dangerouslySetInnerHTML` yasak (lint).
8. `403 CONNECTION_NOT_ACTIVE` alındığında ilgili satıcının önbelleklenmiş ürün ve fiyatları temizlenir.

## 10. Güvenlik ve gizli bilgi

1. `.env` dosyası asla commit edilmez; yeni değişken `.env.example` ve `packages/shared/src/env.ts` şemasına eklenir.
2. Gizli bilgi, gerçek müşteri verisi veya production log parçası AI sohbetine yapıştırılmaz. Hata ayıklamada maskelenmiş örnek kullanılır.
3. Yeni npm paketi yalnızca [tech-stack.md](tech-stack.md) listesinden veya platform sahibinin onayıyla.
4. Kimlik, yetki, kiracı bağlamı, fiyat çözümleme ve cari koduna yapılan her değişiklik Müfettiş incelemesinden geçer.

## 11. AI asistanlarına özel kurallar

1. Göreve başlamadan önce `AGENTS.md`, görev kartı ([implementation-plan.md](implementation-plan.md) adımı) ve kartın listelediği belgeleri oku.
2. Önce plan sun: değişecek dosyalar, migration, testler, emin olunmayan noktalar. Onay gelmeden kod yazma.
3. Yalnızca görevin kapsamındaki dosyaları değiştir. Kapsam dışı bir değişiklik gerekiyorsa sor.
4. Belgelerde olmayan bir karar gerekiyorsa uydurma; dur ve sor. Bir ADR ile çelişen bir şey önerme.
5. Var olmayan bir paket, fonksiyon veya API seçeneği uydurma; emin değilsen belirt.
6. Bitti demeden önce `pnpm lint`, `pnpm typecheck`, `pnpm test` çalıştır ve sonuçları göster.
7. Değişikliğin sonunda: hangi AC'lerin hangi testlerle karşılandığını listele; [definition-of-done.md](definition-of-done.md) maddelerini işaretle.
