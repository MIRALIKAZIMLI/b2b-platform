# ADR-0005: Sorgu katmanı: Drizzle ORM

| Alan | Değer |
| --- | --- |
| Durum | Kabul edildi |
| Tarih | 2026-10-24 |
| Karar veren | Platform sahibi |
| İlgili | ADR-0003 · NFR-40 |

## Bağlam

RLS için her işlemde `SET LOCAL` çalıştırılmalı ve işlem nesnesi modüller arasında geçirilmelidir. Sorguların okunabilir ve SQL'e yakın olması AI'ın ürettiği kodun incelenmesini kolaylaştırır.

## Karar

1. Drizzle ORM ve Drizzle Kit (migration) kullanılır.
2. Tüm veritabanı erişimi `core` modülündeki `withTenantTx(ctx, fn)` yardımcısından geçer; bu yardımcı işlemi açar ve RLS değişkenlerini ayarlar.
3. Ham SQL yalnızca RLS politikaları, `SECURITY DEFINER` fonksiyonları ve rapor sorgularında kullanılır.

## Alternatifler

| Seçenek | Artı | Eksi | Neden seçilmedi |
| --- | --- | --- | --- |
| Drizzle (seçilen) | SQL'e yakın; işlem kontrolü kolay; güçlü tipler; hafif | Prisma kadar olgun araç ve topluluk yok | — |
| Prisma | Olgun araçlar, kolay şema | İşlem başına `SET LOCAL` ve RLS için ek katman; ağır istemci | RLS ergonomisi |
| TypeORM | NestJS ile yaygın | Tip güvenliği zayıf; dekoratör ağırlığı | Tip güvenliği |
| Kysely | Saf sorgu kurucu, çok iyi tipler | Migration ve şema tanımı ayrı araç ister | Drizzle ikisini birlikte veriyor |

## Sonuçlar

- **Olumlu:** RLS bağlamı tek bir yerde ve test edilebilir.
- **Olumsuz / bedel:** Bazı gelişmiş migration senaryoları elle SQL gerektirir.
- **Takip:** Yeniden değerlendirme: Drizzle'da kritik bir eksik veya bakım sorunu çıkarsa.
