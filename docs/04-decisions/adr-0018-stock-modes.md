# ADR-0018: Toptancı bazında stok modu

| Alan | Değer |
| --- | --- |
| Durum | Kabul edildi |
| Tarih | 2026-10-24 |
| Karar veren | Platform sahibi |
| İlgili | US-038, US-039 · D24 |

## Bağlam

Pilot toptancılar stoğu Excel'de tutuyor; bazıları stoğu hiç tutmuyor. Tüm toptancıları ayrıntılı stok takibine zorlamak benimsemeyi düşürür. Kozmetikte son kullanma tarihi ve lot önemlidir.

## Karar

1. Stok modu toptancı ayarıdır: `none`, `availability` (varsayılan), `quantity`; ileride `sync` (1C).
2. `quantity` modunda üç sayı: fiziksel (`on_hand`), rezerve (`reserved`), satılabilir (fark).
3. Stok yalnızca `stock_movements` kayıtlarıyla değişir; rezervasyon toptancı onayında, düşüm sevkte.
4. Lot ve son kullanma tarihi MVP'de hareket ve sipariş satırında isteğe bağlı alan; lot bazlı stok Faz 2.

## Alternatifler

| Seçenek | Artı | Eksi | Neden seçilmedi |
| --- | --- | --- | --- |
| Stok modları (seçilen) | Her toptancının olgunluğuna uyar | Üç davranışın testi | — |
| Herkes için miktarlı stok | Tek davranış | Benimseme düşük; yanlış stok verisi | Pilot gerçekliği |
| Stok yok | En basit | Stoksuz ürün sipariş edilir, iptal artar | KPI-04 |

## Sonuçlar

- **Olumlu:** Toptancı stok olgunluğu arttıkça mod yükseltilir.
- **Olumsuz / bedel:** Mod değişikliği sırasında (ör. `availability` → `quantity`) başlangıç sayımı gerekir.
- **Takip:** Rezervasyon eşzamanlılık testi (SF-05).
