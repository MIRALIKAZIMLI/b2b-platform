# ADR-0008: Dış servisler adaptör arayüzlerinin arkasında

| Alan | Değer |
| --- | --- |
| Durum | Kabul edildi |
| Tarih | 2026-10-24 |
| Karar veren | Platform sahibi |
| İlgili | D1, D5, D6, D18 · NFR-95–NFR-98 · [integrations.md](../03-architecture/integrations.md) |

## Bağlam

MVP'de SMS, push ve dosya deposu gereklidir. Ödeme, e-qaimə, dış kargo, 1C ve WhatsApp ileride eklenecektir. Sağlayıcılar değişebilir. Testler ve yerel geliştirme dış servise bağımlı olmamalıdır.

## Karar

1. Her dış servis için bir arayüz tanımlanır: `SmsSender`, `PushSender`, `FileStorage`, `DeliveryProvider`, `ErrorReporter`; ileride `PaymentProvider`, `EInvoiceProvider`, `ErpConnector`, `NotificationChannel`.
2. Her arayüzün bir mock uygulaması vardır; testler her zaman mock kullanır.
3. Sağlayıcı ortam değişkeniyle seçilir; uygulama kodu somut sağlayıcıyı içe aktarmaz.
4. Uygulamalar `apps/api/src/infrastructure/<servis>/` altındadır.

## Alternatifler

| Seçenek | Artı | Eksi | Neden seçilmedi |
| --- | --- | --- | --- |
| Adaptör arayüzleri (seçilen) | Sağlayıcı değişimi ve yeni entegrasyon kod değişikliği gerektirmez; test edilebilir | Küçük bir soyutlama katmanı | — |
| Doğrudan SDK çağrısı | En az kod | Sağlayıcıya kilitlenme; testlerde gerçek servis | Gelecek gereksinimleri |
| Genel entegrasyon platformu (iPaaS) | Görsel akışlar | Maliyet; ek bağımlılık | Bütçe |

## Sonuçlar

- **Olumlu:** Gelecek fazlardaki her entegrasyon, yalnızca yeni bir adaptör ve olay dinleyicisidir.
- **Olumsuz / bedel:** Arayüzler ilk sağlayıcının biçimine fazla benzerse genelleme bozulur.
- **Takip:** Arayüzler `core`/ilgili modülde; lint: modüller `infrastructure/` içinden doğrudan içe aktaramaz.
