# ADR-0002: TypeScript tam yığın: NestJS, Next.js, Expo

| Alan | Değer |
| --- | --- |
| Durum | Kabul edildi |
| Tarih | 2026-10-24 |
| Karar veren | Platform sahibi |
| İlgili | D25 · NFR-84 · ADR-0001 |

## Bağlam

Backend, web ve mobil istemci gereklidir. Kod büyük ölçüde AI asistanlarıyla yazılacak; istemci ile sunucu arasındaki tip uyumsuzlukları en sık hata kaynağıdır. Ekip tek kişidir ve birden fazla dil bilgi yükünü artırır.

## Karar

1. Backend: NestJS (TypeScript, `strict`).
2. Web: Next.js (React, App Router).
3. Mobil: Expo (React Native).
4. Paylaşılan tipler ve API istemcisi OpenAPI'den üretilir (`packages/api-client`); ortak sabitler ve doğrulama şemaları `packages/shared` içindedir.

## Alternatifler

| Seçenek | Artı | Eksi | Neden seçilmedi |
| --- | --- | --- | --- |
| TypeScript tam yığın (seçilen) | Tek dil; tip paylaşımı; AI araçları bu ekosistemde güçlü; Expo ile kolay TestFlight/Play dağıtımı | JVM/.NET kadar yüksek ham performans yok | — |
| Spring Boot + React + Flutter | Kurumsal olgunluk, güçlü işlem yönetimi | Üç dil; ayrıntılı kod; tek kişi için yavaş | Bilgi yükü |
| .NET + React + Flutter | Performans, olgun ORM | Üç dil | Bilgi yükü |
| Django/FastAPI + React | Hızlı başlangıç | Dinamik tipler büyük projede AI hatalarını gizler; ikinci dil | Tip güvenliği |

## Sonuçlar

- **Olumlu:** Bir alanın tipi değiştiğinde web ve mobildeki uyumsuzluk derleme anında yakalanır.
- **Olumsuz / bedel:** Node.js'in CPU yoğun işlerde (PDF, Excel) zayıflığı; bu işler worker'a alınır.
- **Takip:** [tech-stack.md](../07-ai-development/tech-stack.md) kesin sürümleri tutar.
