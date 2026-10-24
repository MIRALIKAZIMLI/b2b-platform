# ADR-0010: İşlemsel outbox ile olay yayımı

| Alan | Değer |
| --- | --- |
| Durum | Kabul edildi |
| Tarih | 2026-10-24 |
| Karar veren | Platform sahibi |
| İlgili | ADR-0001, ADR-0011 · US-054 · NFR-20 |

## Bağlam

Durum değişiklikleri bildirim, arama indeksi, PDF üretimi ve ileride entegrasyonları tetikler. Bunlar API isteğini yavaşlatmamalı ve veritabanı işlemi geri alınırsa tetiklenmemelidir.

## Karar

1. Durumu değiştiren servis, aynı veritabanı işleminde `outbox_events` tablosuna bir olay yazar.
2. Worker, işlenmemiş olayları sırayla okur ve ilgili BullMQ kuyruklarına dağıtır; işlenince `processed_at` yazılır.
3. Olay yükü kişisel veri içermez; kimlik taşır.
4. Tüketiciler idempotendir (aynı olay iki kez işlenebilir).

## Alternatifler

| Seçenek | Artı | Eksi | Neden seçilmedi |
| --- | --- | --- | --- |
| Outbox (seçilen) | İşlemle tutarlı; olay kaybolmaz | Küçük gecikme (≤ birkaç saniye); ek tablo | — |
| İşlem içinde doğrudan kuyruğa ekleme | Basit | İşlem geri alınırsa olay yine gider; Redis hatasında istek başarısız | Tutarlılık |
| Veritabanı tetikleyici + LISTEN/NOTIFY | Gerçek zamanlı | Bağlantı koptuğunda olay kaybı | Güvenilirlik |

## Sonuçlar

- **Olumlu:** Gelecekteki entegrasyonlar yeni bir tüketici olarak eklenir.
- **Olumsuz / bedel:** Outbox tablosunun temizlenmesi (30 gün) gerekir.
- **Takip:** Ölü olay alarmı (observability); runbook RB-06.
