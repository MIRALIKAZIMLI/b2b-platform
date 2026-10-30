# ADR-0023: Yerelde ve CI'da disk tabanlı dosya deposu; R2 yalnızca staging ve production'da

| Alan | Değer |
| --- | --- |
| Durum | Kabul edildi |
| Tarih | 2026-10-30 |
| Karar veren | Platform sahibi (F1 faz spesifikasyonu S9 → C) |
| İlgili | NFR-49 · SF-09 · integrations §4 · ADR-0008, ADR-0012, ADR-0021 · F1.10 |

## Bağlam

Dosyalar staging ve production'da Cloudflare R2'de (S3 uyumlu) durur (ADR-0012). Yerelde ve CI'da R2 yerine MinIO planlanmıştı; 2026-10-24 itibarıyla MinIO'nun açık Docker imajı yok ve F0.3a'da compose'a eklenmedi (tech-stack §6). F1.10 (dosya yükleme) entegrasyon testleri için yerel bir depo gerekiyor. Testler internete ve gerçek anahtara bağımlı olmamalı.

## Karar

1. `FileStorage` arayüzünün (integrations §4) iki uygulaması vardır: `s3` (R2; `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`) ve `local` (diskteki bir klasör).
2. Sağlayıcı `STORAGE_PROVIDER` ortam değişkeniyle seçilir: `r2` veya `local`. Yerel geliştirme ve CI `local` kullanır; staging ve production `r2` kullanır.
3. Production'da `STORAGE_PROVIDER=local` ise süreç başlamaz (ADR-0021 ile aynı kalıp).
4. `local` uygulamasının imzalı yükleme/indirme URL'leri API'nin `/api/v1/dev/storage?token=…` ucuna gider; imza HMAC-SHA256 + bitiş zamanıdır (`Clock`), anahtar süreç açılışında rastgele üretilir. Bu uç yalnızca `/api/v1/dev/*` kayıtlı ortamlarda ve `STORAGE_PROVIDER=local` iken vardır (production'da yok).
5. R2'ye özgü imzalı URL davranışı `s3-file-storage` birim testleriyle (imza parametreleri, süre, bucket seçimi, `If-None-Match: *`) ve staging'de elle doğrulanır. Staging kabulünde: aynı yükleme URL'siyle ikinci PUT 412 döner; bucket CORS ayarı `If-None-Match` başlığına izin verir.
7. Yükleme URL'si tek yazımlıktır: `local` depoda nesne varsa üzerine yazılmaz (dev ucu 403), R2'de `If-None-Match: *` imzaya girer (Müfettiş PR #28 M1).
6. Yeni Docker imajı eklenmez; yerel depo yeni paket istemez (`@aws-sdk/*` zaten tech-stack listesinde, yalnızca R2 için).

## Alternatifler

| Seçenek | Artı | Eksi | Neden seçilmedi |
| --- | --- | --- | --- |
| Disk tabanlı yerel depo (seçilen) | Yeni program yok; testler hızlı ve internetsiz | S3 imzalı URL davranışı yerelde birebir denenmez | — |
| Başka S3 uyumlu yerel sunucu (SeaweedFS, Garage) | Canlıya en yakın davranış | Yeni imaj, bakım, ek tech-stack değişikliği | Bakım yükü |
| Testlerde gerçek R2 dev bucket'ı | Birebir gerçek | Testler internet ve anahtar ister; F0.4'e bağımlı | CI'da gizli anahtar ve ağ bağımlılığı |

## Sonuçlar

- **Olumlu:** Yerel kurulum değişmez; CI'da dosya testleri ek servis olmadan çalışır.
- **Olumsuz / bedel:** R2'ye özgü hatalar (CORS, imza, içerik türü başlığı) ancak staging'de görülür; staging kabul listesine "dosya yükleme uçtan uca" maddesi eklenir.
- **Takip:** `env.ts` açılış kontrolü + `F1.10-AC5` testi; `s3-file-storage` birim testleri. Staging'de R2 ile ciddi bir fark görülürse veya açık bir S3 uyumlu imaj ihtiyacı doğarsa yeniden değerlendirilir.
