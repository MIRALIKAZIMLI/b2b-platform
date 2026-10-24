# ADR-0013: Bağlantıyı yalnızca toptancı başlatır

| Alan | Değer |
| --- | --- |
| Durum | Kabul edildi |
| Tarih | 2026-10-24 |
| Karar veren | Platform sahibi |
| İlgili | K3–K6 · D8–D12 · US-019–US-026 |

## Bağlam

Perakendecinin toptancı seçmesi yerine toptancının perakendeciye ulaşması iş modelidir. Perakendeci, kendisine istek gelmeden hiçbir toptancıyı görmemelidir. İstek spamı ve taciz önlenmelidir.

## Karar

1. Perakendecide toptancı arama ekranı yoktur; yalnızca gelen istekler ve bağlı toptancılar görünür.
2. İstek → `pending` → kabul / red / engel / geri çekme / süre dolumu.
3. Bağlantı iki taraftan iptal edilebilir; iptal edilen bağlantı yeniden aktif edilmez; yeniden bağlantı yeni istek ve yeni `connections` satırıdır.
4. Sınırlar: tek bekleyen istek, bekleme süresi (red ve perakendeci iptali sonrası), günlük kota, engelleme.
5. QR/davet linki yoktur (D12).

## Alternatifler

| Seçenek | Artı | Eksi | Neden seçilmedi |
| --- | --- | --- | --- |
| Toptancı başlatır (seçilen) | Perakendeci spamdan korunur; toptancı ağını kontrol eder | Perakendeci yeni toptancı arayamaz | — |
| İki yönlü istek | Esnek | K3 ile çelişir; perakendeci tüm toptancıları görür | İş modeli |
| Açık pazar yeri | Keşif kolay | Toptancılar arası fiyat rekabeti istenmiyor | İş modeli |

## Sonuçlar

- **Olumlu:** Toptancıların müşteri ağı ve fiyatları gizli kalır.
- **Olumsuz / bedel:** Perakendeci bağlantısız kalabilir; bağlantısız hesap politikası (ADR-0009 ayarları) ve toptancıya yeni perakendeci bildirimi ile telafi edilir.
- **Takip:** Durum makinesi [state-machines.md](../03-architecture/state-machines.md) §1–2.
