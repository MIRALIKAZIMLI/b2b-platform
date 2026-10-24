# ADR-0011: Arama için Meilisearch, kuyruk için Redis + BullMQ

| Alan | Değer |
| --- | --- |
| Durum | Kabul edildi |
| Tarih | 2026-10-24 |
| Karar veren | Platform sahibi |
| İlgili | D25 · US-019, US-032 · NFR-11 |

## Bağlam

Ürün araması 3 dilde, Latin/Kiril yazımlarıyla ve yazım hatası toleranslı çalışmalı; perakendeci dizini filtreli ve hızlı olmalı. Arka plan işleri (bildirim, Excel, PDF, zamanlanmış işler) için kuyruk gerekir. Kullanıcı Redis ve Meilisearch kullanmaya karar verdi.

## Karar

1. Meilisearch: `products` ve `buyer_directory` indeksleri; veritabanından outbox ile beslenir; gece tam yeniden indeksleme.
2. Arama sonuçları her zaman kiracı ve görünürlük filtresiyle sorgulanır; sonuç kimlikleri veritabanından yetki kontrolüyle tekrar okunur.
3. Redis: BullMQ kuyrukları, hız sınırı sayaçları, kısa ömürlü önbellek. Redis'te kalıcı veri tutulmaz.
4. Zamanlanmış işler BullMQ tekrarlayan işleriyle ve Redis kilidiyle çalışır.

## Alternatifler

| Seçenek | Artı | Eksi | Neden seçilmedi |
| --- | --- | --- | --- |
| Meilisearch + BullMQ (seçilen) | Çok dilli arama ve eş anlamlı sözlük kolay; NestJS ile olgun kuyruk | İki ek servis; indeks senkronu | — |
| PostgreSQL FTS + pg_trgm | Ek servis yok | Çok dilli ve Kiril/Latin eş anlamlıda zayıf; ayar zahmetli | Arama kalitesi |
| pg-boss (PostgreSQL kuyruğu) | Redis gerekmez | Redis zaten hız sınırı için var | Gereksiz çeşitlilik |
| AWS SQS | Yönetilen | Ek AWS bağımlılığı ve gecikme | Basitlik |

## Sonuçlar

- **Olumlu:** Arama p95 < 400 ms (NFR-11) hedefi Meilisearch ile rahat karşılanır.
- **Olumsuz / bedel:** İndeks veritabanından sapabilir; gece tam yeniden indeksleme ile telafi edilir.
- **Takip:** İndeks senkron testi; runbook RB-05.
