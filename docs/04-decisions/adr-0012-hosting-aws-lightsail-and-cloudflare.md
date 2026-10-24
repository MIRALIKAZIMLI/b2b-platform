# ADR-0012: Barındırma: AWS Lightsail (Frankfurt) + Cloudflare R2/CDN

| Alan | Değer |
| --- | --- |
| Durum | Kabul edildi |
| Tarih | 2026-10-24 |
| Karar veren | Platform sahibi |
| İlgili | D21 · NFR-30–NFR-37, NFR-90 · [infrastructure.md](../03-architecture/infrastructure.md) |

## Bağlam

Kullanıcı AWS'de yurt dışı barındırmaya karar verdi; hukuki görüş onaylı. Aylık bütçe 100 USD. Dosyalar ve görseller için Cloudflare R2 + CDN seçildi. Tek kişi işletecek.

## Karar

1. Bölge `eu-central-1` (Frankfurt).
2. Pilot: tek Lightsail sunucusu (Docker Compose: caddy, api, worker, web, redis, meilisearch) + Lightsail yönetilen PostgreSQL.
3. Dosyalar Cloudflare R2 (`public` ve `private` bucket); DNS, TLS, CDN ve WAF Cloudflare'de.
4. Gizli bilgiler AWS SSM Parameter Store; imajlar GHCR'de.

## Alternatifler

| Seçenek | Artı | Eksi | Neden seçilmedi |
| --- | --- | --- | --- |
| Lightsail + yönetilen DB (seçilen) | Sabit fiyat; NAT/ALB gerekmez; basit | Otomatik ölçek yok; gelişmiş ağ özellikleri sınırlı | — |
| EC2 + RDS | Esnek; olgun | Değişken fiyat; ağ yapılandırması karmaşık | Bütçe tahmini |
| ECS Fargate + RDS + ALB | Yönetilen container | ALB ve NAT sabit ücretleri bütçeyi zorlar | Bütçe |
| Hetzner VPS | Çok ucuz | Kullanıcı kararı AWS | Kullanıcı kararı |

## Sonuçlar

- **Olumlu:** Bütçe öngörülebilir; aynı Docker imajları ileride ECS/RDS'e taşınabilir.
- **Olumsuz / bedel:** Tek sunucu tek hata noktası; RTO ≤ 4 saat kabul edildi (NFR-34).
- **Takip:** F0.4'te fiyat ve PITR doğrulaması; büyüme tetikleyicileri infrastructure §6.
