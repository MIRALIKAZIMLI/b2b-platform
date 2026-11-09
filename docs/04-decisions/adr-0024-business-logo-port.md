# ADR-0024: İşletme logosu için `BusinessLogoPort` (files → businesses)

| Alan | Değer |
| --- | --- |
| Durum | Kabul edildi |
| Tarih | 2026-11-08 |
| Karar veren | Mimar (F2.10b; kullanıcı F2.10'a logo düzenlemesini ekledi) |
| İlgili | US-007 AC2 · US-030 · F2.10b · [c4-component.md](../03-architecture/c4-component.md) §3 kural 3 ve 9 · ADR-0001 |

## Bağlam

`PATCH /api/v1/business` (`businesses` modülü) logoyu `logoFileId` ile değiştirir; yanıt `logoUrl` taşır. Bunun için dosyanın aynı işletmenin, amacı `logo` olan ve `ready` durumdaki dosyası olduğu doğrulanmalı ve okuma adresi üretilmelidir. Bu bilgi `files` modülündedir. Ancak bağımlılık yönü `files → access → businesses` olduğundan `businesses → files` çağrısı döngü yaratır (c4 §3 kural 3). Olay (outbox) burada işe yaramaz: doğrulama yazmadan önce, yanıt aynı istekte gerekir. `businesses.logo_file_id` bileşik FK'sı (0012) yalnız sahipliği güvenceye alır; amaç ve durum denetlenmez.

## Karar

1. `businesses` modülü `BusinessLogoPort` arayüzünü ve `BUSINESS_LOGO_PORT` belirtecini tanımlar (`businesses/business-logo.port.ts`): `isUsableLogo(ctx, fileId)` ve `readUrl(ctx, fileId)`.
2. `files` modülü arayüzü uygular (`files/business-logo.adapter.ts`) ve global `BusinessLogoPortModule` ile sağlar. `BusinessesModule`, `FilesModule`'ü içe aktarmaz.
3. Kod bağımlılığı `files → businesses` yönündedir (`files`, `businesses/index.ts`'den yalnız arayüzü alır). c4 diyagramına kesikli kenar ve §3 port tablosuna satır eklenir.
4. Doğrulama kiracı bağlamında (RLS) yapılır: başka işletmenin dosyası görünmez → geçersiz. Geçersiz logo `422 VALIDATION_FAILED`, `details.logoFileId = [invalid_logo]`.

## Alternatifler

| Seçenek | Artı | Eksi | Neden seçilmedi |
| --- | --- | --- | --- |
| Port (seçilen) | Sözleşme değişmez; döngü yok; `businesses` dosya iç yapısını bilmez | Global modül; bir port daha | — |
| Logo ayrı uç (`PUT /business/logo`, `files` içinde) | Port yok | `GET /business` `logoUrl` yine `files` ister; sözleşme değişir | Sorunu çözmüyor |
| Logoyu F2.10b'den çıkarmak | En küçük PR | US-007 AC2 "logo açılabilir" anlamsız kalır; kullanıcı kararıyla çelişir | Kapsam kararı |

## Sonuçlar

- **Olumlu:** Bağımlılık yönü korunur; logo kuralları dosya modülünde tek yerde.
- **Olumsuz / bedel:** `BusinessesModule`'ü kullanan her uygulama (api) `BusinessLogoPortModule`'ü de kaydetmelidir; aksi DI hatası açılışta görünür.
- **Takip:** `onboarding/__tests__/business-profile-person.int.test.ts` sahiplik, amaç ve durum denetimlerini sınar. Ürün görselleri (`catalog`) aynı ihtiyacı doğrudan `catalog → files` yönüyle karşılar; bu ADR yalnız `businesses` içindir.
