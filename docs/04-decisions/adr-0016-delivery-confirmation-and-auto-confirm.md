# ADR-0016: Teslim onayı: kargocu + uygulama içi perakendeci onayı + otomatik onay

| Alan | Değer |
| --- | --- |
| Durum | Kabul edildi |
| Tarih | 2026-10-24 |
| Karar veren | Platform sahibi |
| İlgili | D23 · K11 · US-047, US-048 · TM-15, TM-16 |

## Bağlam

Kullanıcı teslim kodu (OTP) istemedi; teslim uygulama içinden onaylanmalı. Perakendeci teslim anında çevrimdışı olabilir veya onaylamayı unutabilir; onaysız sipariş cariye yazılmaz.

## Karar

1. Kargocu "teslim ettim" der; GPS ve zaman otomatik, fotoğraf isteğe bağlı (toptancı zorunlu yapabilir).
2. Sipariş `delivered_pending_confirmation` olur; perakendeci onaylar veya itiraz eder.
3. Varsayılan 48 saat içinde yanıt yoksa sistem otomatik onaylar (`auto_confirmed = true`).
4. Teslim konumu şubeden 300 m'den uzaksa "konum uyuşmazlığı" işaretlenir.
5. Borç kaydı teslim kesinleştiği işlemde yazılır.

## Alternatifler

| Seçenek | Artı | Eksi | Neden seçilmedi |
| --- | --- | --- | --- |
| Uygulama içi onay + otomatik onay (seçilen) | SMS maliyeti yok; hızlı; cari takılmaz | Otomatik onay perakendeci açısından risk; açık bilgilendirme gerekir | — |
| Teslim kodu (OTP) | Güçlü kanıt | Kullanıcı istemedi; SMS maliyeti | D23 |
| Yalnızca kargocu beyanı | En hızlı | Perakendeci itiraz hakkı yok | Güven |
| Ekrana imza | Alışkın yöntem | Kolay taklit edilir, okunaksız | Kanıt değeri düşük |

## Sonuçlar

- **Olumlu:** Teslim kanıtı ve itiraz hakkı dengeli.
- **Olumsuz / bedel:** Otomatik onay süresi yanlış ayarlanırsa anlaşmazlık doğabilir.
- **Takip:** SF-06 testleri; KPI-05 ölçümü.
