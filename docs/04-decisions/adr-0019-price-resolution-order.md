# ADR-0019: Fiyat çözümleme sırası ve sipariş anında kopyalama

| Alan | Değer |
| --- | --- |
| Durum | Kabul edildi |
| Tarih | 2026-10-24 |
| Karar veren | Platform sahibi |
| İlgili | D2, D3 · US-034–US-037 |

## Bağlam

Her perakendeciye ayrı fiyat verilebilmeli; şube fiyatı nadiren, şube indirimi daha sık gerekir. Toptancı 500 müşteri için 500 liste tutmak istemez. Fiyatlar sonradan değişse de geçmiş siparişler bozulmamalı.

## Karar

1. Sıra: şube fiyatı (bağlantıda açıksa) → müşteri fiyatı → bağlantıya atanmış liste → varsayılan liste; ilk bulunan kullanılır.
2. Üzerine önce kademeli indirim, sonra şube indirimi uygulanır. MVP'de kampanya yok.
3. Fiyat satış birimi (ambalaj seviyesi) başınadır; `valid_from` ile geleceğe tarihli değişiklik.
4. `PriceResolver` saf fonksiyon çekirdeğine sahiptir ve fiyat kaynağını döndürür; sipariş satırına kopyalanır.

## Alternatifler

| Seçenek | Artı | Eksi | Neden seçilmedi |
| --- | --- | --- | --- |
| Öncelik sırası + kopya (seçilen) | Esnek ve açıklanabilir; geçmiş bozulmaz | Çözümleme mantığı en kritik test alanı | — |
| Müşteri başına tek liste | Basit | Toptancı yükü | Kullanılabilirlik |
| Siparişte canlı fiyat referansı | Daha az veri | Fiyat değişince geçmiş değişir | Muhasebe |

## Sonuçlar

- **Olumlu:** "Bu fiyat nereden geldi?" sorusu her zaman cevaplanır.
- **Olumsuz / bedel:** Fiyat kaynağı sayısı arttıkça önbellek ve test yükü artar.
- **Takip:** Fiyat çözümleme test tablosu (test-strategy); NFR-80 kapsam hedefi.
