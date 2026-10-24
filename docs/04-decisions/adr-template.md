# ADR-NNNN: <Kısa karar başlığı>

| Alan | Değer |
| --- | --- |
| Durum | Önerildi / Kabul edildi / Reddedildi / Yerine geçti: ADR-XXXX |
| Tarih | YYYY-MM-DD |
| Karar veren | Platform sahibi |
| İlgili | Rapor karar no (D-xx), story (US-xxx), NFR (NFR-xx), diğer ADR'ler |

## Bağlam

Hangi problem veya kısıt bu kararı gerektiriyor? Hangi gereksinimler ve sayısal hedefler etkileniyor? (3–6 cümle)

## Karar

Ne yapılacak? Tek, net ve uygulanabilir ifadeler. Kodda hangi kurala dönüşür?

## Alternatifler

| Seçenek | Artı | Eksi | Neden seçilmedi |
| --- | --- | --- | --- |
| A (seçilen) | | | — |
| B | | | |
| C | | | |

## Sonuçlar

- **Olumlu:** …
- **Olumsuz / bedel:** …
- **Takip:** Hangi belge, test veya lint kuralı bu kararı uygular? Karar ne zaman yeniden değerlendirilmeli (tetikleyici)?

---

**Kurallar**

1. Dosya adı: `adr-NNNN-kisa-baslik-kebab-case.md`; numara artan, boşluk bırakılmaz.
2. Kabul edilmiş bir ADR **değiştirilmez**. Karar değişirse yeni ADR yazılır, eskisinin durumu `Yerine geçti: ADR-XXXX` yapılır.
3. AI asistanları bir ADR ile çelişen kod veya öneri üretmez; çelişki gerekiyorsa yeni bir ADR önerir.
4. Bir karar "önemli" ise ADR yazılır: geri alınması bir günden fazla iş gerektiren, veri modelini veya bir dış servisi değiştiren, ya da bir iş kuralını (K1–K11) etkileyen karar ([stakeholders.md](../01-discovery/stakeholders.md) §3).
