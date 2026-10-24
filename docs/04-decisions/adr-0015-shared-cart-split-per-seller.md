# ADR-0015: Şube bazında ortak sepet, şube onayı ve toptancı başına bölünme

| Alan | Değer |
| --- | --- |
| Durum | Kabul edildi |
| Tarih | 2026-10-24 |
| Karar veren | Platform sahibi |
| İlgili | D15, D16 · K7, K8 · US-040–US-042 |

## Bağlam

Perakendecide birden fazla kişi eksik ürünleri toplar; gönderimi şube sorumlusu onaylamalıdır. Bir sepette birden fazla toptancının ürünü olabilir, ama her toptancının siparişi, belgesi ve carisi ayrıdır.

## Karar

1. Her şubenin tek bir sepeti vardır; şubenin tüm kullanıcıları aynı sepeti görür.
2. Şube onay kuralı: `every_order` (varsayılan), `above_amount`, `none`.
3. Onaylanan sepet tek veritabanı işleminde toptancı başına siparişlere bölünür; hata olursa hiçbir sipariş oluşmaz.
4. Gönderilemeyen gruplar (bağlantı aktif değil, minimum tutar altında) sepette kalır ve kullanıcıya bildirilir.
5. Sipariş satırları ad, birim, fiyat, indirim ve fiyat kaynağını o anki haliyle kopyalar.

## Alternatifler

| Seçenek | Artı | Eksi | Neden seçilmedi |
| --- | --- | --- | --- |
| Ortak sepet + bölünme (seçilen) | Kullanıcı için tek akış; muhasebe ayrımı korunur | Bölünme mantığı karmaşık ve dikkatli test ister | — |
| Toptancı başına ayrı sepet | Basit | Kullanıcı birden fazla sepet yönetir | D16 |
| Kullanıcı başına sepet | Bağımsız çalışma | Şube onayı ve birleştirme zorlaşır | K7 |

## Sonuçlar

- **Olumlu:** Perakendeci tek yerde sipariş hazırlar; toptancılar yalnızca kendi siparişini görür.
- **Olumsuz / bedel:** Şube onayı küçük dükkanı yavaşlatabilir; `none` kuralı ile çözülür.
- **Takip:** SF-04 testleri; NFR-12 performans hedefi.
