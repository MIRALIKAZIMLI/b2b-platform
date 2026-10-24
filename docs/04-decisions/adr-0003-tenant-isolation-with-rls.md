# ADR-0003: Kiracı izolasyonu: ortak şema + business_id + PostgreSQL RLS

| Alan | Değer |
| --- | --- |
| Durum | Kabul edildi |
| Tarih | 2026-10-24 |
| Karar veren | Platform sahibi |
| İlgili | K3, K4 · NFR-40, NFR-82 · TM-05, TM-29 |

## Bağlam

Bir toptancının başka toptancının fiyat, müşteri veya bağlantı verisini görmesi işi bitirir. Kod AI ile yazılacağı için bir sorguda kiracı filtresinin unutulması olasıdır. Siparişler, bağlantılar ve cari kayıtları iki kiracıya (satıcı ve alıcı) aynı anda aittir.

## Karar

1. Tüm kiracılar aynı şemadadır. Kiracıya bağlı her tablo `business_id` veya (`seller_id`, `buyer_id`) taşır.
2. Her istek işleminin başında `SET LOCAL app.business_id` (ve `app.user_id`) çalıştırılır; RLS politikaları bu değeri kullanır.
3. Uygulama rolü (`app_user`) RLS'e tabidir ve tablo sahibi değildir (RLS atlanamaz).
4. RLS sınıfları (T, P, G, U, S, D) [data-model.md](../03-architecture/data-model.md) §1.1'de tanımlıdır; her yeni tablo aynı migration'da politikasıyla gelir.
5. Uygulama sorguları da filtreyi açıkça yazar; RLS son savunma hattıdır.

## Alternatifler

| Seçenek | Artı | Eksi | Neden seçilmedi |
| --- | --- | --- | --- |
| Ortak şema + RLS (seçilen) | Çift kiracılı kayıtları doğal destekler; tek migration; düşük maliyet | RLS hatası tüm kiracıları etkiler; her sorguda ayar gerekir | — |
| Kiracı başına şema | Güçlü izolasyon | Sipariş ve bağlantı iki şemaya ait; çapraz sorgu ve 50+ şemada migration zahmetli | Çift kiracılı model |
| Kiracı başına veritabanı | En güçlü izolasyon | Maliyet ve operasyon; çapraz sorgu imkânsız | Bütçe ve model |
| Yalnızca uygulama filtresi | Basit | Tek unutulan filtre = sızıntı | AI hata riski |

## Sonuçlar

- **Olumlu:** Unutulan bir filtre veri sızıntısına dönüşmez; izolasyon veritabanı tarafından garanti edilir.
- **Olumsuz / bedel:** Her işlemde `SET LOCAL` zorunlu; bağlantı havuzu işlem modunda kullanılmalı; RLS politikalarının test edilmesi gerekir.
- **Takip:** İzolasyon test paketi (test-strategy); CI'da RLS'siz T/P tabloyu reddeden kontrol; aylık RLS denetim betiği.
