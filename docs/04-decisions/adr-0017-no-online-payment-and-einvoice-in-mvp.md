# ADR-0017: MVP'de online ödeme ve e-qaimə entegrasyonu yok

| Alan | Değer |
| --- | --- |
| Durum | Kabul edildi |
| Tarih | 2026-10-24 |
| Karar veren | Platform sahibi |
| İlgili | D1, D5 · K9 · US-050–US-053 |

## Bağlam

Platform SaaS sağlayıcıdır; para tahsil etmek lisans, güvenlik ve sorumluluk yükü getirir. e-qaimə entegrasyonu elektronik imza ve resmi erişim kanalı gerektirir ve MVP'de zordur.

## Karar

1. Cari ve tahsilat takibi yapılır; ödeme elle girilir (`payments.provider = manual`).
2. Sipariş belgesi vergi faturası değildir ve bunu belgede açıkça yazar.
3. e-qaimə uyumlu .xlsx dışa aktarma ve e-qaimə numarasının elle girilmesi sağlanır.
4. `PaymentProvider` ve `EInvoiceProvider` arayüzleri tanımlıdır; veri modeli (`payments.provider`, `orders.einvoice_number`, VÖEN) hazırdır.

## Alternatifler

| Seçenek | Artı | Eksi | Neden seçilmedi |
| --- | --- | --- | --- |
| Ertele + hazırlık (seçilen) | MVP hızlı; yasal risk yok; gelecek açık | Muhasebe çift giriş yapar | — |
| MVP'de online ödeme | Tahsilat kolaylaşır | Lisans, PCI, iade, sorumluluk | Kapsam |
| MVP'de e-qaimə | Çift giriş biter | İmza, resmi kanal, mevzuat değişikliği | Zorluk |

## Sonuçlar

- **Olumlu:** MVP kapsamı küçük kalır.
- **Olumsuz / bedel:** Toptancı muhasebesi platform dışında fatura keser.
- **Takip:** Faz 3 değerlendirmesi; mevzuat değişikliğinde yeniden açılır.
