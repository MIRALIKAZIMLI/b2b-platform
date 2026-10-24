# ADR-0007: İçerik çevirileri JSONB alanlarda, arayüz metinleri ayrı tabloda

| Alan | Değer |
| --- | --- |
| Durum | Kabul edildi |
| Tarih | 2026-10-24 |
| Karar veren | Platform sahibi |
| İlgili | D17 · US-058 · NFR-70 |

## Bağlam

Ürün, kategori, birim ve faaliyet alanı adları 4 dilde (az, ru, tr, en) tutulmalı; pilotta az, ru, tr tam olmalı. Yeni bir dil kod değişikliği gerektirmemeli. Ürün listeleri sık okunur.

## Karar

1. İçerik alanları `jsonb` olarak tutulur: `{"az": …, "ru": …, "tr": …, "en": …}`.
2. Okumada geri dönüş sırası: istek dili → işletme varsayılan dili → `az` → dolu ilk dil.
3. Arayüz metinleri `ui_translations (key, lang, value)` tablosunda; istemcilere önbelleklenmiş JSON olarak verilir.
4. Diller `languages` tablosundan; yeni dil = yeni satır + çeviriler.

## Alternatifler

| Seçenek | Artı | Eksi | Neden seçilmedi |
| --- | --- | --- | --- |
| JSONB (seçilen) | Tek sorgu; join yok; eksik dil geri dönüşü basit | Dil bazında indeks ve kısıt daha zor | — |
| Ayrı çeviri tabloları | Normalize; dil bazında kısıt | Her okumada join; daha çok kod | Performans ve basitlik |
| Dosya tabanlı çeviri (i18n JSON depoda) | Geliştirici dostu | Admin panelinden düzenlenemez | US-058 AC2 |

## Sonuçlar

- **Olumlu:** Arama indeksine tüm dillerdeki adlar tek alandan aktarılır.
- **Olumsuz / bedel:** JSONB şeması uygulama düzeyinde doğrulanmalı.
- **Takip:** Paylaşılan `LocalizedText` Zod şeması.
