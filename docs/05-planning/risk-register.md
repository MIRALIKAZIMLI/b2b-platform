# Risk Kaydı

| Alan | Değer |
| --- | --- |
| Sürüm | 1.0 |
| Tarih | 2026-10-24 |
| İlgili belgeler | [threat-model.md](../03-architecture/threat-model.md) (güvenlik tehditleri ayrıntısı) · [roadmap.md](roadmap.md) |

**Ölçek:** Olasılık ve Etki: Düşük (1) / Orta (2) / Yüksek (3). **Skor** = Olasılık × Etki. Skoru 6 ve üstü olan riskler her fazın başında gözden geçirilir.

**Sorumlu:** Tek karar verici olduğu için tüm risklerin sorumlusu platform sahibidir (PS). Önlemin bir kısmı pilot toptancı sahibine (PT) bağlıysa belirtilmiştir.

## 1. Kayıt

| # | Risk | Olasılık | Etki | Skor | Önlem | Sorumlu | Erken uyarı işareti |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RISK-01 | AI'ın ürettiği kodda kiracı izolasyonu veya yetki hatası | Yüksek | Yüksek | 9 | RLS (ADR-0003); her uç nokta için izolasyon testi; Müfettiş kontrol listesi; CI lint (yetki dekoratörü) | PS | İzolasyon testinin atlanması; RLS'siz tablo uyarısı |
| RISK-02 | Tek kişiye bağımlılık: hastalık, tükenme, bilgi kaybı | Orta | Yüksek | 6 | Tüm kararlar ve çalıştırma adımları belgede; runbook; otomatik testler; haftalık en fazla 5 iş günü planı | PS | Belgesiz birleştirilen PR'lar; ertelenen testler |
| RISK-03 | Ağ başlamaz: perakendeciler kaydolur ama istek gelmez veya sipariş vermez | Yüksek | Yüksek | 9 | Pilot toptancının mevcut müşterileriyle başlamak; temsilcinin sahada yardımı; yeni kayıt bildirimi; bağlantısız hesap politikası; KPI-01/03 haftalık izleme | PS + PT | KPI-01 ilk 2 haftada %20 altı |
| RISK-04 | Pilot toptancı ekibinin uygulamayı benimsememesi (telefon/WhatsApp alışkanlığı) | Yüksek | Yüksek | 9 | Mobil öncelikli tasarım; 5 ekran kuralı (NFR-75); yerinde eğitim; toptancı sahibinin desteği; haftalık geri bildirim | PS + PT | KPI-02 %20 altı |
| RISK-05 | Kullanım limitleri (Claude Pro) geliştirmeyi yavaşlatır | Yüksek | Orta | 6 | Usta işi Antigravity ile; Claude yalnızca Mimar/Müfettiş; küçük görevler; limit takvimine göre gün planı | PS | Haftada 2'den fazla limit takılması |
| RISK-06 | 100 USD aylık bütçenin aşılması | Orta | Orta | 4 | Sabit fiyatlı Lightsail; NAT/ALB yok; staging kapalı; AWS Budgets 70/90 USD alarmı; SMS günlük üst sınırı | PS | Budgets 70 USD uyarısı |
| RISK-07 | SMS pompalama (toll fraud) ile beklenmeyen SMS faturası | Orta | Yüksek | 6 | Bkz. TM-02: hız sınırı, `+994` kuralı, `sms.daily_cap`, bot koruması, alarm | PS | Günlük SMS > 300 |
| RISK-08 | Gerçek SMS sağlayıcısının Azerbaycan'a teslim oranının düşük olması | Orta | Yüksek | 6 | Sağlayıcıyı Y1 bitmeden gerçek numaralarla test etmek; `SmsSender` adaptörüyle ikinci sağlayıcıya hızlı geçiş | PS | Teslim edilmeyen OTP şikayeti |
| RISK-09 | Pilot Excel verilerinin dağınık olması (birim, koli içi adet, mükerrer SKU) | Yüksek | Orta | 6 | F0.2'de örnek dosyaları erken almak; içe aktarma önizlemesi ve hata raporu; ilk aktarımı platform sahibinin toptancıyla birlikte yapması | PS + PT | Önizlemede satırların > %10'u hatalı |
| RISK-10 | Fiyat çözümleme hatası nedeniyle yanlış fiyatla sipariş | Orta | Yüksek | 6 | `PriceResolver` test tablosu; fiyat kaynağının ekranda gösterilmesi; toptancı onay adımı; fiyatın siparişe kopyalanması | PS | Toptancının fiyat düzeltme talebi |
| RISK-11 | Tek uygulama sunucusunun iş saatlerinde çökmesi | Düşük | Yüksek | 3 | Yönetilen veritabanı ayrı; sunucu Docker imajlarından ≤ 30 dk'da yeniden kurulur (RB-04); uptime alarmı | PS | Uptime alarmı |
| RISK-12 | Lightsail yönetilen veritabanının PITR / yedek özelliklerinin NFR-33/35'i karşılamaması | Orta | Orta | 4 | F0.4'te doğrulama; karşılamıyorsa RDS'e geçiş (bütçe etkisi yeniden hesaplanır) | PS | F0.4 doğrulama sonucu |
| RISK-13 | Mobil mağaza incelemesinde ret (özellikle App Store) | Orta | Orta | 4 | Önce TestFlight; gizlilik metni ve hesap silme özelliği hazır; mağaza yayını Y4'e kadar zorunlu değil | PS | TestFlight dış test incelemesinde ret |
| RISK-14 | Perakendeci kişisel verisinin yanlış paylaşılması | Düşük | Yüksek | 3 | Varsayılan kapalı (ADR-0014); dizin yanıt şeması testi; loglarda maskeleme | PS | Şema testinde yeni alan |
| RISK-15 | e-qaimə dışa aktarma formatının muhasebecinin ihtiyacını karşılamaması | Orta | Düşük | 2 | F0.1 mali müşavir görüşmesi; .xlsx sütunları ayarlanabilir | PS | Muhasebecinin dosyayı elle düzeltmesi |
| RISK-16 | Kapsam genişlemesi (pilot toptancıların özel istekleri) | Yüksek | Orta | 6 | Kapsam koruma kuralları ([roadmap.md](roadmap.md) §3); "iki toptancı için değer" kuralı ([stakeholders.md](../01-discovery/stakeholders.md) §3) | PS | Bir fazda 3'ten fazla yeni istek |
| RISK-17 | Var olmayan veya güvensiz npm paketlerinin (AI önerisi) projeye girmesi | Orta | Yüksek | 6 | Yeni paket yalnızca [tech-stack.md](../07-ai-development/tech-stack.md) listesinden veya insan onayıyla; bağımlılık taraması | PS | PR'da `package.json` değişikliği |
| RISK-18 | Gizli bilgilerin (API anahtarı) depoya veya AI sohbetine sızması | Orta | Yüksek | 6 | `.env` git dışı; CI gizli bilgi taraması; SSM; anahtar döndürme (RB-07) | PS | Tarama uyarısı |
| RISK-19 | Otomatik teslim onayının perakendeciyle anlaşmazlığa yol açması | Orta | Orta | 4 | 48 saat süresi ve kuralın kabul ekranında yazılı olması; hatırlatma push'u (24. saatte); KPI-05 izleme | PS + PT | KPI-05 %50 altı |

📌 VARSAYIM: RISK-19 önlemindeki 24. saatteki hatırlatma bildirimi US-048'e eklenmesi önerilen bir iyileştirmedir; MVP'de `Should` olarak ele alınır.

## 2. Isı haritası

| | Etki: Düşük | Etki: Orta | Etki: Yüksek |
| --- | --- | --- | --- |
| **Olasılık: Yüksek** | — | RISK-05, RISK-09, RISK-16 | **RISK-01, RISK-03, RISK-04** |
| **Olasılık: Orta** | RISK-15 | RISK-06, RISK-12, RISK-13, RISK-19 | RISK-02, RISK-07, RISK-08, RISK-10, RISK-17, RISK-18 |
| **Olasılık: Düşük** | — | — | RISK-11, RISK-14 |

**En yüksek üç risk (skor 9):** İkisi (RISK-03, RISK-04) teknik değil, benimseme riskidir. Bu yüzden pilot planı (F7) ve KPI izlemesi, kod kadar önemlidir.

## 3. Gözden geçirme

- Her fazın başında: skor ≥ 6 riskler ve erken uyarı işaretleri.
- Pilot sırasında: haftalık (F7.5 toplantısı).
- Yeni risk eklendiğinde ID sırayla verilir; kapanan risk silinmez, durumu "kapandı" olarak not edilir.
