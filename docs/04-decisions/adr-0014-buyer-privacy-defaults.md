# ADR-0014: Perakendeci görünürlüğü: varsayılan kapalı, ünvan + faaliyet alanı + şehir/rayon açık

| Alan | Değer |
| --- | --- |
| Durum | Kabul edildi |
| Tarih | 2026-10-24 |
| Karar veren | Platform sahibi |
| İlgili | D7 · K4 · US-007 · NFR-60–NFR-63 · TM-09, TM-10 |

## Bağlam

Toptancılar müşteri bulmak için perakendeci dizinini kullanır. Perakendecinin kişisel ve iletişim bilgileri istemsiz paylaşılmamalı; dizin rakiplerce kazınabilir. Bölge bilgisi olmadan toptancı kendi dağıtım bölgesindeki dükkanları bulamaz.

## Karar

1. Bağlantısız toptancılara varsayılan olarak yalnızca ünvan, faaliyet alanı ve şehir/rayon görünür; bu üçü kapatılamaz (yalnızca "dizinde görünme" tamamen kapatılabilir).
2. Logo, tam adres, işletme telefonu, VÖEN, yetkili adı ve kişisel iletişim varsayılan kapalıdır; perakendeci tek tek açabilir.
3. Tam telefon veya tam VÖEN ile arama, alan kapalı olsa bile kaydı bulur; sonuçta yalnızca açık alanlar döner. Kısmi arama yoktur.
4. Aktif bağlantıda bağlı toptancı teslimat ve iletişim bilgilerini görür.
5. Perakendecinin diğer bağlantıları ve alım hacmi hiçbir koşulda görünmez.

## Alternatifler

| Seçenek | Artı | Eksi | Neden seçilmedi |
| --- | --- | --- | --- |
| Varsayılan kapalı + 3 alan açık (seçilen) | Gizlilik ile müşteri bulma dengesi | Toptancı ilk temasta daha az bilgi görür | — |
| Tümü açık, perakendeci kapatır | Toptancı için en çok bilgi | Kişisel veri varsayılan açık; kazıma riski | Mevzuat ve güven |
| Yalnızca ünvan + faaliyet alanı | En gizli | Bölge yok; dizin işe yaramaz | Kullanılabilirlik |

## Sonuçlar

- **Olumlu:** Kişisel veri varsayılan korunur; dizin yine işlevseldir.
- **Olumsuz / bedel:** Bazı perakendeciler ayarlarını hiç açmaz; bu kabul edilmiştir.
- **Takip:** Dizin yanıt şeması testi; `buyer_directory` indeksine yalnızca açık alanlar yazılır.
