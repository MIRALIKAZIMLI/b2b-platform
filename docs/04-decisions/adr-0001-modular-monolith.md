# ADR-0001: Modüler monolit mimari

| Alan | Değer |
| --- | --- |
| Durum | Kabul edildi |
| Tarih | 2026-10-24 |
| Karar veren | Platform sahibi |
| İlgili | D25 · NFR-01–07, NFR-83 · ADR-0002, ADR-0010 |

## Bağlam

Sistem tek bir geliştirici tarafından, AI asistanlarıyla yazılacak ve işletilecek. Aylık altyapı bütçesi 100 USD. 12. ay ölçeği 10 toptancı, 200 perakendeci ve tepe 300 sipariş/gündür (tasarım tavanı ×5). Sipariş, stok ve cari aynı işlemde tutarlı olmalıdır (ör. teslim onayı + borç kaydı).

## Karar

1. Tek kod tabanında modüler bir NestJS uygulaması yazılır; `api` (HTTP) ve `worker` (arka plan işleri) aynı modülleri kullanan iki giriş noktasıdır.
2. Modül sınırları [c4-component.md](../03-architecture/c4-component.md) §3'teki kurallarla ve CI'daki bağımlılık lint kuralıyla zorlanır.
3. Tek PostgreSQL veritabanı kullanılır; modüller arası tutarlılık veritabanı işlemiyle sağlanır.

## Alternatifler

| Seçenek | Artı | Eksi | Neden seçilmedi |
| --- | --- | --- | --- |
| Modüler monolit (seçilen) | Tek dağıtım, tek işlem, kolay hata ayıklama, düşük maliyet | Tek süreç ölçeklenir; modül disiplini bozulabilir | — |
| Mikroservisler | Bağımsız ölçek ve dağıtım | Dağıtık işlem, servis keşfi, gözlem ve çok sayıda dağıtım; tek kişi için sürdürülemez | Ekip ve ölçek gerektirmiyor |
| Serverless (Lambda) | Boşta düşük maliyet | Soğuk başlatma; uzun işler (Excel, PDF); RLS için bağlantı yönetimi zor | Uzun işler ve RLS ile uyumsuz |

## Sonuçlar

- **Olumlu:** Tek kişinin anlayabileceği sistem; sipariş–stok–cari tutarlılığı tek işlemde; düşük maliyet.
- **Olumsuz / bedel:** Bir modüldeki bellek sızıntısı tüm API'yi etkiler; sınırlar disiplinle korunmalı.
- **Takip:** Bağımlılık lint kuralı (coding-guidelines). Yeniden değerlendirme: tasarım tavanı aşılırsa veya ayrı ekip gerektiren bir modül çıkarsa.
