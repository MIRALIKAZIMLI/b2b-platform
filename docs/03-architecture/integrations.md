# Dış Entegrasyonlar

| Alan | Değer |
| --- | --- |
| Sürüm | 1.0 |
| Tarih | 2026-10-24 |
| İlgili belgeler | [design-doc.md](design-doc.md) · [c4-context.md](c4-context.md) · [ADR-0008](../04-decisions/adr-0008-adapters-for-external-services.md) |

Her dış servis bir adaptör arayüzünün arkasındadır (ADR-0008). Uygulama kodu yalnızca arayüzü bilir; sağlayıcı ortam değişkeniyle seçilir. Her adaptörün bir **mock** uygulaması vardır ve testler ile yerel geliştirme her zaman mock kullanır.

## 1. Özet

| Servis | Amaç | MVP | Adaptör arayüzü | Kimlik doğrulama |
| --- | --- | --- | --- | --- |
| SMS sağlayıcısı | OTP | Mock (dev/staging); gerçek sağlayıcı Y2 yayın aşamasından önce | `SmsSender` | API anahtarı (sağlayıcıya göre) |
| Expo Push Service | Push bildirimi (APNs/FCM) | Evet | `PushSender` | Expo erişim anahtarı (isteğe bağlı "enhanced security") |
| Cloudflare R2 | Dosya deposu | Evet | `FileStorage` | S3 uyumlu erişim anahtarı (bucket'a özel) |
| Cloudflare DNS / CDN | Alan adı, TLS, önbellek | Evet | — (altyapı) | Cloudflare API anahtarı (yalnızca CI) |
| Expo EAS Build / Submit | Mobil derleme ve TestFlight / Play iç test gönderimi | Evet | — (CI) | Expo hesabı; App Store Connect API anahtarı; Google Play servis hesabı |
| Hata izleme (Sentry) | Hata ve performans izleme | Evet | `ErrorReporter` | DSN |
| Ödeme sağlayıcısı | Online ödeme | Hayır | `PaymentProvider` | — |
| e-qaimə | Elektronik fatura | Hayır | `EInvoiceProvider` | — |
| Kargo firması API | Etiket, durum | Hayır | `DeliveryProvider` (MVP'de `own_courier`, `manual_carrier`) | — |
| 1C / ERP | Ürün, stok, fiyat senkronu | Hayır | `ErpConnector` | — |
| WhatsApp Business API | Bildirim | Hayır | `NotificationChannel` | — |

📌 VARSAYIM: Hata izleme için Sentry'nin ücretsiz planı kullanılır. Bütçe veya kota yetmezse yalnızca yapılandırılmış loglar (bkz. [observability.md](../06-operations/observability.md)) ile devam edilir.

## 2. SMS (`SmsSender`)

```ts
interface SmsSender {
  send(input: { to: string /* E.164 */; body: string; purpose: 'otp' }): Promise<{ providerMessageId: string }>;
}
```

| Konu | Kural |
| --- | --- |
| Sağlayıcı seçimi | `SMS_PROVIDER=mock` (dev, staging, test) veya gerçek sağlayıcı adı (production) |
| Mock davranışı | SMS göndermez; `dev_sms_outbox` tablosuna yazar; `GET /api/v1/dev/sms-outbox` ile görüntülenir (NFR-96) |
| Production koruması | `APP_ENV=production` ve `SMS_PROVIDER=mock` ise uygulama açılışta hata verir ve başlamaz (NFR-97) |
| Mesaj içeriği | Kullanıcının dilinde, şablondan: `<kod> — B2B giriş kodunuz. 5 dakika geçerlidir. Kimseyle paylaşmayın.` |
| Gönderim yeri | Worker'da değil, **API isteği içinde** (kullanıcı kodu hemen bekler); zaman aşımı 5 sn |
| Yeniden deneme | Geçici hatada 2 kez (1 sn, 3 sn); sonra `503 SMS_UNAVAILABLE` |
| Hız sınırı | NFR-45 (numara 1/dk, 5/saat; IP 20/saat). Ek olarak ülke kodu `+994` dışındaki numaralara gönderim varsayılan kapalı (`sms.allowed_country_codes` ayarı) |
| İzleme | Günlük gönderim sayısı ve maliyeti metriği; günlük 300 SMS üstünde alarm (bkz. [observability.md](../06-operations/observability.md)) |

⚠️ AÇIK SORU: Gerçek SMS sağlayıcısı henüz seçilmedi. Seçimde değerlendirilecekler: Azerbaycan operatörlerine teslim oranı, SMS başına fiyat, gönderici adı (alfanümerik başlık) kaydı süresi, API'nin teslim raporu (webhook) desteği.

## 3. Push (`PushSender`)

```ts
interface PushSender {
  send(messages: Array<{ token: string; title: string; body: string; data: Record<string, string> }>): Promise<PushResult[]>;
}
```

| Konu | Kural |
| --- | --- |
| Sağlayıcı | Expo Push Service; mobil uygulama Expo push anahtarı (`ExponentPushToken[...]`) üretir ve `POST /api/v1/push-tokens` ile kaydeder |
| Gönderim yeri | Worker (`notifications` kuyruğu), outbox olayından |
| Toplu gönderim | Expo API'sine istek başına en fazla 100 mesaj (📌 VARSAYIM: Expo belgelerindeki sınır; F1.7 adımında doğrulanır) |
| Makbuz kontrolü | Gönderimden 15 dk sonra makbuz (receipt) sorgulanır; `DeviceNotRegistered` hatası alan anahtar silinir |
| Yeniden deneme | Geçici hatada 3 kez (1, 5, 15 dk) (US-054 AC3) |
| İçerik | Kişisel veri içermez; yalnızca başlık, kısa metin ve `data: { type, id }`; uygulama detayı API'den çeker |
| Mock | Testlerde ve yerelde mesajı belleğe/loga yazar |

## 4. Dosya deposu (`FileStorage`)

```ts
interface FileStorage {
  createUploadUrl(input: { bucket: 'public' | 'private'; key: string; contentType: string; maxBytes: number; ttlSeconds: number }): Promise<{ url: string; headers: Record<string, string> }>;
  createDownloadUrl(input: { key: string; ttlSeconds: number }): Promise<string>;
  head(key: string): Promise<{ size: number; contentType: string } | null>;
  readRange(key: string, bytes: number): Promise<Buffer>;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
}
```

| Konu | Kural |
| --- | --- |
| Uygulama | Cloudflare R2, S3 uyumlu API |
| Bucket'lar | `<env>-public` (ürün görselleri, logolar; CDN ile herkese açık okunur) ve `<env>-private` (teslim ve itiraz fotoğrafları, belgeler, içe aktarma dosyaları) |
| Anahtar yapısı | `<businessId>/<purpose>/<fileId>.<ext>` |
| Yükleme URL'si ömrü | 10 dk; indirme URL'si (private) 5 dk |
| Doğrulama | `complete` adımında `head` + ilk 16 bayt imza kontrolü (NFR-49) |
| Mock | Yerelde MinIO (Docker) veya yerel dosya sistemi uygulaması |

## 5. Mobil derleme ve dağıtım

| Konu | Kural |
| --- | --- |
| Derleme | Expo EAS Build; GitHub Actions'tan tetiklenir (etiket `mobile-v*`) |
| Dağıtım | EAS Submit → TestFlight ve Google Play iç test kanalı; mağaza yayını Y4 aşamasında (bkz. [design-doc.md](design-doc.md) §9) |
| OTA güncelleme | Expo Updates yalnızca JavaScript değişikliklerinde; yerel modül değişikliğinde yeni derleme ve `app-config` minimum sürüm güncellemesi |

📌 VARSAYIM: EAS Build'in ücretsiz planındaki aylık derleme sayısı pilot için yeterlidir. Yetmezse derleme, geliştirici bilgisayarında yerel `eas build --local` ile yapılır.

## 6. Gelecek adaptörler (MVP'de uygulanmaz, arayüz tanımlanır)

| Arayüz | Asgari sözleşme | Tetikleyen olaylar |
| --- | --- | --- |
| `PaymentProvider` | `createPaymentIntent(order|balance)`, `handleWebhook(payload, signature)` → `payments` (`provider ≠ manual`) | `ledger.balance_due` |
| `EInvoiceProvider` | `issue(orderId)`, `getStatus(externalId)`, `cancel(externalId)`; sonuç `orders.einvoice_number` | `order.delivered` |
| `DeliveryProvider` | `createShipment(order)`, `getStatus(trackingNo)`, `handleWebhook` | `order.ready_to_ship` |
| `ErpConnector` | `pullProducts`, `pullStock`, `pullPrices`, `pushOrder`; kimlik eşleme `external_refs` tablosunda (Faz 3'te eklenir) | `order.approved`, zamanlanmış |
| `NotificationChannel` | `send(userId, template, params)`; push, WhatsApp, SMS kanalları aynı arayüz | Tüm bildirim olayları |

## 7. Webhook'lar (gelen)

MVP'de gelen webhook **yoktur**. İleride eklenecek her webhook için kurallar:

1. `/api/webhooks/<provider>` altında, sürümsüz.
2. İmza doğrulaması zorunlu; imzasız istek `401`.
3. İşlenmeden önce `webhook_events` tablosuna ham olarak yazılır (idempotens: sağlayıcının olay kimliği unique).
4. İşleme worker'da yapılır; webhook uç noktası yalnızca `202` döner.

## 8. Genel hata ve yeniden deneme stratejisi

| Durum | Strateji |
| --- | --- |
| Senkron çağrı (SMS) | Zaman aşımı 5 sn; en fazla 2 yeniden deneme; sonra kullanıcıya açık hata |
| Asenkron iş (push, indeks, PDF, içe aktarma) | BullMQ: en fazla 5 deneme, üstel bekleme (5 sn × 2ⁿ), son başarısızlıkta `failed` kuyruğu + alarm |
| Outbox olayı | `attempts` sayacı; 10 başarısız denemeden sonra olay "ölü" işaretlenir ve alarm verilir; elle yeniden kuyruğa alınabilir (runbook) |
| Devre kesici | Bir sağlayıcı 5 dk içinde %50'den fazla hata verirse 2 dk boyunca çağrılar hızlı başarısız olur (SMS için kullanıcıya "birkaç dakika sonra deneyin") |
