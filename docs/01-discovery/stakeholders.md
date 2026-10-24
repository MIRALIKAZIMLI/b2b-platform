# Paydaşlar

| Alan | Değer |
| --- | --- |
| Sürüm | 1.0 |
| Tarih | 2026-10-24 |

Projede tek bir karar verici vardır: platform sahibi. Diğer paydaşlar ya pilot katılımcısıdır ya da sistemin kullanıcısıdır. Tek karar verici olması kararları hızlandırır, ama her kararın `04-decisions/` altında yazılı olmasını zorunlu kılar; aksi halde gerekçe yalnızca bir kişinin hafızasında kalır.

## 1. Paydaş tablosu

| Rol | İlişki | Beklenti | Karar yetkisi |
| --- | --- | --- | --- |
| Platform sahibi (SaaS sağlayıcı) | Proje sahibi; ürün, mimari, geliştirme, operasyon ve destek sorumlusu | Pilotun KPI'lara ulaşması; aylık altyapı maliyetinin 100 USD altında kalması; sistemin tek kişiyle sürdürülebilir olması | **Tam yetki:** kapsam, öncelik, mimari, yayın, fiyatlandırma, pilot sonu kararı |
| Pilot toptancı A — sahibi | Pilot müşteri; ana muhatap | Siparişlerin tek yerde toplanması; müşteriye özel fiyatların doğru uygulanması; teslim ve tahsilat takibi; ekibinin uygulamayı kolay benimsemesi | **Danışma:** iş akışı geri bildirimi, KPI hedeflerinin belirlenmesi, kendi verilerinin doğruluğu. Ürün kararlarında yetkisi yoktur. |
| Pilot toptancı B — sahibi | Pilot müşteri; ana muhatap | Toptancı A ile aynı | Toptancı A ile aynı |
| Pilot toptancı çalışanları (satış temsilcisi, depo, kargocu, muhasebe) | Son kullanıcı | Kendi işlerini telefondan hızlı yapabilmek; ek iş yükü olmaması | **Yok.** Geri bildirimleri toptancı sahibi üzerinden alınır. |
| Pilot perakendeciler (kozmetik dükkanları) | Son kullanıcı; ücretsiz | Kolay sipariş; doğru fiyat; teslimat ve borç bilgisinin şeffaf olması; kişisel bilgilerinin istemsiz paylaşılmaması | **Yok.** Kendi görünürlük ayarları ve bağlantı kararları (kabul/red/engel/iptal) üzerinde yetkili. |
| AI kodlama asistanları (Claude, Antigravity IDE + Claude Opus) | Geliştirme aracı | Net, tutarlı ve tek kaynaktan gelen talimat (`AGENTS.md`, `docs/`) | **Yok.** Belgelerde olmayan bir karar veremez; platform sahibine sorar. |
| Hukuk danışmanı | Dış danışman | — | **Danışma:** kişisel veri ve barındırma konusunda görüş verdi (onaylandı). |

📌 VARSAYIM: Hukuk danışmanının görüşü tamamlanmıştır ve sürekli bir paydaş değildir. Mevzuat değişikliği veya yeni ülke girişinde yeniden danışılır.

⚠️ AÇIK SORU: Pilot toptancıların ticari adları ve sahiplerinin iletişim bilgileri bu belgeye eklenecek mi? Kişisel veri içerdiği için öneri: depoda değil, platform sahibinin özel notlarında tutulsun.

## 2. İletişim planı

| Paydaş | Kanal | Sıklık | İçerik |
| --- | --- | --- | --- |
| Pilot toptancı sahipleri | Yüz yüze veya görüntülü görüşme | Pilot öncesi 1 kez (kapsam ve KPI); pilot boyunca haftada 1 (30 dk) | Geri bildirim, hata listesi, sonraki hafta değişiklikleri |
| Pilot toptancı çalışanları | Yerinde eğitim + kısa video kılavuzlar (az, ru) | Pilot başında 1 kez; yeni özellikte gerektiğinde | Rol bazlı kullanım |
| Pilot perakendeciler | Uygulama içi bildirim; toptancı temsilcisi aracılığıyla yerinde yardım | Kayıt anında; değişiklikte | Kayıt, bağlantı kabulü, ilk sipariş |
| AI asistanları | `AGENTS.md`, `docs/`, görev kartları | Her görevde | Kurallar, spesifikasyonlar, kabul kriterleri |

## 3. Karar alma kuralı

1. Ürün ve mimari kararlarını platform sahibi verir.
2. Önemli her karar bir ADR olarak yazılır (`04-decisions/`). "Önemli": geri alınması bir günden fazla iş gerektiren, veri modelini veya bir dış servisi değiştiren ya da bir iş kuralını (K1–K11) etkileyen karar.
3. Pilot toptancıların geri bildirimi ürün kararına girdi olur, ama tek başına karar değildir. Bir toptancıya özel bir istek, ancak en az iki toptancı için değer taşıyorsa genel ürüne eklenir; aksi halde toptancı ayarı olarak değerlendirilir veya reddedilir.
