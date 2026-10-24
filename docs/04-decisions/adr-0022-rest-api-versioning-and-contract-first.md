# ADR-0022: REST API, URL sürümleme ve sözleşme önce (OpenAPI)

| Alan | Değer |
| --- | --- |
| Durum | Kabul edildi |
| Tarih | 2026-10-24 |
| Karar veren | Platform sahibi |
| İlgili | NFR-85 · US-060 |

## Bağlam

Mobil kullanıcıların bir kısmı uygulamayı uzun süre güncellemez. Web ve mobil aynı API'yi kullanır. AI asistanlarının istemci ve sunucuyu tutarlı tutması gerekir.

## Karar

1. REST + JSON; sürüm URL'de (`/api/v1`).
2. Kırıcı değişiklik yalnızca yeni ana sürümde; aynı anda en fazla iki sürüm; kaldırma 6 ay önce duyurulur.
3. Alan ekleme kırıcı değildir; ad değiştirme, silme veya anlam değiştirme kırıcıdır.
4. `openapi.yaml` önce güncellenir; istemci kodu ondan üretilir; CI, uygulamanın ürettiği şema ile dosyayı karşılaştırır.
5. `GET /api/app-config` minimum mobil sürümü bildirir.

## Alternatifler

| Seçenek | Artı | Eksi | Neden seçilmedi |
| --- | --- | --- | --- |
| REST + URL sürümü + sözleşme önce (seçilen) | Basit, önbelleklenebilir, araç desteği geniş | Bazı ekranlar için birden fazla istek | — |
| GraphQL | Esnek sorgu | Yetki ve RLS ile karmaşık; önbellek zor | Basitlik |
| Başlıkla sürümleme | Temiz URL | Hata ayıklama ve önbellek zor | Basitlik |
| tRPC | Uçtan uca tip | Mobil eski sürümlerle sürümleme zor; OpenAPI yok | Sürümleme |

## Sonuçlar

- **Olumlu:** Eski mobil sürümler bozulmaz; istemci tipleri otomatik.
- **Olumsuz / bedel:** Sözleşme dosyasının disiplinle güncellenmesi gerekir.
- **Takip:** CI sözleşme karşılaştırma adımı (environments-cicd).
