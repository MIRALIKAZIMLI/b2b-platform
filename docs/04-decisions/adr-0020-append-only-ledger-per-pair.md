# ADR-0020: Cari: satıcı–alıcı çifti başına yalnızca eklenen kayıtlar

| Alan | Değer |
| --- | --- |
| Durum | Kabul edildi |
| Tarih | 2026-10-24 |
| Karar veren | Platform sahibi |
| İlgili | D1 · K5, K9 · US-050, US-051 · TM-17 |

## Bağlam

Borç teslimde oluşur, tahsilat elle girilir. Bağlantı iptal edilse de borç devam etmelidir. Kayıtların değiştirilmesi anlaşmazlıklarda kanıtı yok eder. Bir ödeme birden fazla siparişi kapatabilir.

## Karar

1. `ledger_entries` satıcı–alıcı çiftine ve para birimine bağlıdır, bağlantıya değil.
2. Kayıtlar yalnızca eklenir; düzeltme `reversal` veya `adjustment` kaydıyla yapılır.
3. Bakiye saklanmaz, sorguyla hesaplanır.
4. Siparişte "ödendi" durumu yoktur; vade ve yaşlandırma raporu FIFO varsayımıyla hesaplanır.

## Alternatifler

| Seçenek | Artı | Eksi | Neden seçilmedi |
| --- | --- | --- | --- |
| Çift başına eklenen kayıt (seçilen) | Kanıt korunur; iptalden etkilenmez | Sipariş bazında ödeme durumu yok | — |
| Sipariş başına ödeme durumu | Kullanıcı için tanıdık | Kısmi ve toplu ödemelerde dağıtım karmaşık | MVP kapsamı |
| Saklanan bakiye alanı | Hızlı okuma | Tutarsızlık riski | Doğruluk |

## Sonuçlar

- **Olumlu:** İptal ve yeniden bağlantıda cari kesintisiz.
- **Olumsuz / bedel:** Bakiye sorgusu hareket sayısıyla büyür; gerekirse aylık özet tablosu eklenir.
- **Takip:** Cari testleri; NFR-68 saklama süresi.
