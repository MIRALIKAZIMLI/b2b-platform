# AGENTS.md

Bu dosya, bu depoda çalışan AI kodlama asistanları (Antigravity, Claude Code) içindir. Kısa tutulur; ayrıntılar `docs/` altındadır. **Tek doğru kaynak `docs/` klasörüdür.** Bir belge ile bu dosya çelişirse belge geçerlidir; çelişkiyi bildir.

## Proje

Azerbaycan'dan başlayan, çok kiracılı bir B2B SaaS sipariş ve cari takip platformu. Toptancıları (`seller`) yalnızca platform admini açar; perakendeciler (`buyer`) kendileri kaydolur. Bağlantıyı her zaman toptancı başlatır. Perakendeci, bağlı toptancıların ürünlerini kendi fiyatıyla görür, şube sepetinde toplar, şube admini onaylar; sepet toptancı başına siparişe bölünür. Teslim, kargocu + perakendeci onayıyla kesinleşir; borç cariye yazılır. Online ödeme ve e-qaimə yok.

Özet: `docs/README.md` · İş kuralları K1–K11: `docs/02-requirements/prd.md` §2

## Teknoloji

TypeScript her yerde. NestJS (Fastify) API + worker · Drizzle ORM · PostgreSQL 16 (RLS) · Redis 7 + BullMQ · Meilisearch · Next.js (web) · Expo / React Native (mobil) · Cloudflare R2 · Zod · Vitest · Playwright · pnpm monorepo.
Kapalı paket listesi: `docs/07-ai-development/tech-stack.md`. **Listede olmayan paketi ekleme; sor.**

## Klasör yapısı

```
apps/api/src/{main.ts, worker.main.ts, cli.ts, core/, infrastructure/, modules/<modül>/}
apps/web/src/{app/[locale]/(auth|admin|seller|buyer)/, features/, lib/}
apps/mobile/{app/(auth|seller|buyer)/, src/features/}
packages/{shared, api-client (üretilir, elle düzenleme), ui, config}
infra/  scripts/  docs/
```

Ayrıntı: `docs/07-ai-development/coding-guidelines.md` §1

## Komutlar

```bash
pnpm install
docker compose -f infra/docker-compose.dev.yml up -d   # PostgreSQL, Redis, Meilisearch, MinIO
pnpm db:bootstrap    # roller (app_user, migrator, readonly); yalnızca local, bir kez
pnpm db:migrate && pnpm db:seed
pnpm check-rls        # tablo RLS sınıfı ve politikası denetimi (CI'da da çalışır)
pnpm dev               # api + worker + web
pnpm --filter mobile start
pnpm lint && pnpm typecheck && pnpm test
pnpm test:integration # gerçek PostgreSQL (yerelde Docker / Testcontainers)
pnpm test:isolation    # kiracı izolasyonu
pnpm generate:api      # openapi.yaml → packages/api-client
```

Yerelde SMS gönderilmez: OTP kodu `GET /api/v1/dev/sms-outbox` adresinde.

## Uyulması zorunlu kurallar

1. **Kiracı izolasyonu:** Veritabanına yalnızca `withTenantTx` / `withPlatformTx` üzerinden eriş. Kiracıya bağlı her yeni tablo aynı migration'da RLS ile gelir. Kiracıya bağlı her uç nokta için izolasyon testi yaz.
2. **Yetki:** Her controller metodu tam bir erişim işareti taşır: `@RequirePermission('<kod>')`, `@Public()`, `@Authenticated()` (yalnızca giriş; işletme bağlamı yok, ör. `/me`, oturumlar) veya `@RequirePlatformRole(...)` (platform uçları). İşaretsiz uç varsayılan olarak reddedilir (lint `b2b/require-endpoint-access` + bekçi testi). Yetkiyi işletme tipine göre değil, yetenek (`seller`/`buyer`) ve izne göre kontrol et.
3. **Sözleşme önce:** API değişikliği önce `docs/03-architecture/api/openapi.yaml`'da. `/api/v1`'de kırıcı değişiklik yok.
4. **Veri modeli önce:** Yeni tablo/kolon önce `docs/03-architecture/data-model.md`'de.
5. **Durumlar:** Durum değişiklikleri yalnızca `*StateMachine` ile; geçişler `docs/03-architecture/state-machines.md` ile aynı.
6. **Sabit değer yok:** Süre, kota, eşik → `SettingsService`; plan limiti → `EntitlementService`.
7. **Para ve zaman:** Para `numeric` + `decimal.js`, asla `number`. Zaman UTC; saat `Clock` servisinden.
8. **Metin:** Arayüzde sabit metin yok; çeviri anahtarı (az, ru, tr).
9. **Terimler:** Yalnızca `docs/02-requirements/glossary.md` kod adları (`seller`, `buyer`, `branch`, `connection`…).
10. **Testler:** Her kabul kriteri (AC) bir test; test adı AC kimliğiyle başlar. Kritik alanlarda (fiyat, stok, bağlantı, sepet bölünmesi, durum geçişleri, cari) önce test. Testi geçirmek için testi değiştirme.
11. **Gizli bilgi:** `.env`, anahtar, gerçek müşteri verisi asla depoya, loga veya sohbete girmez. OTP, JWT ve kişisel veri loglanmaz.

## Çalışma şekli

1. Görev = `docs/07-ai-development/implementation-plan.md` içindeki bir adım (`F2.12` gibi). Önce adımı ve "Belgeler" satırındaki dosyaları oku.
2. **Kod yazmadan önce plan sun:** dosyalar, migration, AC başına testler, emin olmadığın noktalar. Onay bekle.
3. Yalnızca adımın kapsamında çalış. Kapsam dışı bir şey gerekiyorsa sor.
4. Belgede olmayan bir karar gerekiyorsa **uydurma, sor.** ADR'lerle (`docs/04-decisions/`) çelişme.
5. Bitirmeden önce yerel kontrolleri "Token ve süre kuralları" madde 5'e göre çalıştır, sonucu göster; `docs/07-ai-development/definition-of-done.md` maddelerini işaretle; AC → test eşleşmesini listele.

## Token ve süre kuralları

1. **Önce iki dosya:** göreve `docs/ai-context.md` ve görev kartıyla (`docs/tasks/<ID>.md`) başla.
2. **Az oku:** yalnızca kartın "Okunacak dosyalar" listesini ve işin gerçekten gerektirdiği dosyaları aç. Tüm `docs/` klasörünü tarama; bir belgeden yalnızca kartın andığı bölümü oku.
3. **Bağlamı güncel tut:** her PR, gerekiyorsa `docs/ai-context.md`'yi günceller (bitmiş adım, yeni ortak kural, yeni varsayılan karar).
4. **a/b adımları:** aynı adımın `a` ve `b` kartları (ör. F1.13a → F1.13b) aynı Usta konuşmasında yapılır; bağlam yeniden okunmaz. Bir Usta konuşması en fazla bir adım ya da bir a/b çiftidir; sonraki adım yeni Usta konuşmasında başlar. Aynı bilgisayarda aynı anda tek Usta çalışır.
5. **Yerel kontrol:** yalnızca değişen alanın testleri + `pnpm lint` + `pnpm typecheck`, sessiz modda (yalnızca hatalar görünsün). Örnek:
   ```bash
   pnpm -s lint && pnpm -s typecheck
   pnpm -s --filter @b2b/api exec vitest run src/modules/<modül> --reporter=dot
   ```
   Adım DB'ye dokunuyorsa yalnızca o modülün entegrasyon testleri: `pnpm -s --filter @b2b/api exec vitest run --config vitest.integration.config.mts src/modules/<modül> --reporter=dot`. Tam takım (`pnpm test`, `test:integration`, `test:isolation`, `build`) yerelde çalışmaz, CI'da çalışır. Kartın "Doğrulama komutu" bölümü CI'ın çalıştırdığı tam listedir; yerelde yalnızca yukarıdaki kontroller çalışır. Kart yerelde ayrıca bir komutu açıkça isterse (ör. `pnpm db:migrate && pnpm check-rls`) o da çalışır.
6. **Kısa mesaj:** plan ve raporlar kısa; çıktının tamamını değil, yalnızca hataları ve özet satırını yapıştır. İlerleme kartı yalnızca adım sınırında güncellenir (en fazla ~6 kez); kullanıcıya mesaj yalnızca PR açılınca, karar gerekince ve iş bitince.
7. **Müfettiş yeniden incelemesi:** ikinci ve sonraki turlarda önceki bulguların durumunu yazar ve yalnızca son incelenen SHA'dan bu yana gelen diff'i tam derinlikte inceler. Bu diff riskli bir yola (migration, RLS, kimlik/yetki, log/audit, para, sözleşme, CI) dokunuyorsa o dosyaların tamamına ve doğrudan çağıranlarına da bakar. İstisna: kartında `Müfettiş: Zorunlu` yazan adımlarda (güvenlik, kimlik/yetki, RLS, migration) her turda PR'ın riskli yollardaki **tüm** dosyaları yeniden incelenir. Ayrıntı: `docs/07-ai-development/review-guide.md` §2–§4.
8. **Bulgu döngüsü:** Usta PR açmadan önce `review-guide.md` §5'teki bilinen tuzakları kendi diff'inde kontrol eder. Müfettiş raporuna PR'da tek yorumla yanıt verir: her bulgu için "düzeltildi" ya da "itiraz + kanıt". Aynı bulgu için en fazla iki düzeltme turu yapılır, sonra karar Mimar'a gider (§6). Usta birleştirmeden önce §7'deki birleştirme kapısını uygular.
9. **Doğrudan döngü ve limit:** Müfettiş PR olaylarıyla uyanır, Usta bulguyu PR yorumundan okur; Mimar yalnızca ilk inceleme isteğini ve son kararı görür (`review-guide.md` §6 madde 7). Kullanıcı Usta çalışırken bilgisayarın uyumasını kapatır. Ayrıntı ve ölçüm: `docs/07-ai-development/speed-and-tokens.md`.
10. **PR boyutu:** elle yazılmış diff ~2.000 satırı geçecekse (üretilmiş dosyalar hariç) planda a/b bölmeyi öner (`speed-and-tokens.md` H7).
11. **Yerel kapı ve CI sırası:** Usta her push'tan önce lint + typecheck + değişen modül testini çalıştırır ve PR açıklamasının "Yerel kapı" bölümüne yazar (yalnız belge PR'ında "yalnız belge"). Müfettiş CI bitmeden ve yerel kapı çıktısı olmadan incelemeye başlamaz; mekanik kırmızıda (lint, typecheck, unit, secrets) tek satır yazar (H8, H9).
12. **Model ve araç kullanımı:** Model kartın "Model" satırına göre seçilir (Opus riskli adımlar, Sonnet belge ve düşük riskli işler; H10). Araç çağrıları az ve topludur: dosya bir kez, bölümüyle okunur; çıktılar sessiz modda (H11). `ai-context.md` ≤ 15 KB, kart ≤ 8 KB (H12). Usta çalışırken yan konuşma açılmaz (H13).

## Yapma

- Listede olmayan paket ekleme; Prisma, TypeORM, GraphQL, Redux, axios, moment, class-validator kullanma.
- `console.log`, `dangerouslySetInnerHTML`, `new Date()` (domain kodunda), `catch {}` kullanma.
- `packages/api-client` dosyalarını elle düzenleme.
- `ledger_entries`, `stock_movements`, `order_status_history`, `audit_logs` kayıtlarını güncelleme veya silme.
- İstemciden gelen fiyat, toplam, durum veya kiracı kimliğine güvenme.
- Production yapılandırmasında `SMS_PROVIDER=mock` bırakma; `/api/v1/dev/*` uçlarını production'da açma.

## Hangi durumda hangi belge

| Durum | Belge |
| --- | --- |
| Mimari özeti, ortak kurallar, bitmiş adımlar | `docs/ai-context.md` |
| Görevin ne olduğu, dosyalar, kabul | `docs/07-ai-development/implementation-plan.md` |
| Story ve AC metni | `docs/02-requirements/user-stories.md` |
| Sayısal hedefler (performans, güvenlik) | `docs/02-requirements/non-functional-requirements.md` |
| Modül sorumlulukları ve bağımlılık yönü | `docs/03-architecture/c4-component.md` |
| Tablolar, kolonlar, RLS sınıfı | `docs/03-architecture/data-model.md` |
| Uç nokta, şema, hata kodu | `docs/03-architecture/api/openapi.yaml` |
| Akış ve hata senaryoları | `docs/03-architecture/sequence-flows.md` |
| Durum geçişleri | `docs/03-architecture/state-machines.md` |
| Dış servis / adaptör | `docs/03-architecture/integrations.md` |
| Neden böyle karar verildi | `docs/04-decisions/` |
| Test türü ve zorunlu test tabloları | `docs/05-planning/test-strategy.md` |
| Kod stili, katmanlar, hata, log | `docs/07-ai-development/coding-guidelines.md` |
| CI/CD, ortam değişkenleri | `docs/06-operations/environments-cicd.md` |
| "Bitti" mi? | `docs/07-ai-development/definition-of-done.md` |
| PR incelemesi, bulgu biçimi, birleştirme kapısı | `docs/07-ai-development/review-guide.md` |
| Web ve mobil ekran tasarımı (UI/UX kuralları, zorunlu) | `docs/07-ai-development/ui-guidelines.md` |
| Hız, token, yerel test sınırı | `docs/07-ai-development/speed-and-tokens.md` |
