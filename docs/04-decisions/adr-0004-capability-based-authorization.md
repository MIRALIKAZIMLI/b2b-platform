# ADR-0004: Yetenek tabanlı yetkilendirme ve izin × kapsam modeli

| Alan | Değer |
| --- | --- |
| Durum | Kabul edildi |
| Tarih | 2026-10-24 |
| Karar veren | Platform sahibi |
| İlgili | D13, D20 · K10 · US-012–US-014 · TM-07, TM-08 |

## Bağlam

İşletmeler toptancı veya perakendeci olabilir; ileride ikisi birden (D20). Rol ve unvanlar platform admininde dinamik yönetilmeli (D13). İşletme içindeki kullanıcıların yetkileri modül, eylem ve veri kapsamına göre değişir (ör. temsilci yalnızca kendi bölgesi).

## Karar

1. Yetki kontrolü sırası: oturum → üyelik → yetenek (`seller`/`buyer`, `approved`) → izin → kapsam → kaynak sahipliği.
2. İzinler kodda sabit kodlarla tanımlanır (`orders.approve`), her izin bir yeteneğe bağlıdır; migration ile eklenir.
3. Platform, unvan kataloğunu ve rol şablonlarını yönetir; işletmeler şablonu kopyalayıp özelleştirir; şablon güncellemesi kopyaları değiştirmez.
4. Kapsamlar: `all`, `branch`, `warehouse`, `assigned`.
5. Kod asla "işletme toptancı mı" diye sormaz; yalnızca yetenek ve izin sorar.

## Alternatifler

| Seçenek | Artı | Eksi | Neden seçilmedi |
| --- | --- | --- | --- |
| Yetenek + izin × kapsam (seçilen) | Çift rol kod değişikliği olmadan açılır; dinamik roller | Model ve testler daha ayrıntılı | — |
| İşletme tipi alanı + sabit roller | Çok basit | Çift rol ve özel roller için yeniden yazım | D13, D20 ile çelişir |
| Harici politika motoru (OPA, Casbin) | Güçlü ifade | Ek bileşen ve öğrenme yükü | Bu ölçekte gereksiz |

## Sonuçlar

- **Olumlu:** Yeni unvan veya rol için kod değişmez; çift rol ileride bir yetenek kaydıyla açılır.
- **Olumsuz / bedel:** İzin listesinin bakımı; her uç noktaya doğru izin atanmalı.
- **Takip:** `@RequirePermission` dekoratörü zorunlu (lint); izin matrisi testi.
