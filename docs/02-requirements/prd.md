# Ürün Gereksinim Belgesi (PRD)

| Alan | Değer |
| --- | --- |
| Sürüm | 1.0 |
| Tarih | 2026-10-24 |
| İlgili belgeler | [project-charter.md](../01-discovery/project-charter.md) · [user-stories.md](user-stories.md) · [non-functional-requirements.md](non-functional-requirements.md) · [glossary.md](glossary.md) |

## 1. Ürün tanımı

Toptancıların perakendeci müşterileriyle sipariş, fiyat, stok, teslimat ve cari ilişkisini tek yerde yönettiği, çok kiracılı bir B2B SaaS platformu. Perakendeci, bağlı olduğu tüm toptancılardan tek sepetle sipariş verir. Platform ödeme almaz.

## 2. Temel iş kuralları

Bu kurallar değişmezdir. Bir story veya tasarım bu kurallarla çelişirse kural geçerlidir; değişiklik yalnızca yeni bir ADR ile yapılır.

| # | Kural |
| --- | --- |
| K1 | Toptancı (seller yeteneği) hesabını yalnızca platform admini açar. Self-servis toptancı kaydı bir kayıt modu ayarıyla ileride açılabilir. |
| K2 | Perakendeci (buyer yeteneği) web veya mobil arayüzden kendisi kaydolur. Telefon SMS OTP ile doğrulanır. VÖEN, ilk sipariş gönderilmeden önce zorunludur. |
| K3 | Perakendeci, kendisine bağlantı isteği gelmeden hiçbir toptancıyı göremez. Perakendecide toptancı arama ekranı yoktur. |
| K4 | Toptancı tüm perakendecileri listeleyebilir ve istek gönderebilir. Varsayılan olarak yalnızca ünvan, faaliyet alanı ve şehir/rayon görünür. |
| K5 | Bağlantıyı iki taraf da iptal edebilir. Geçmiş sipariş, belge ve cari kayıtları korunur. |
| K6 | İptal veya red sonrası yeni bağlantı yalnızca toptancının yeni isteğiyle kurulur; bekleme süresi uygulanır. |
| K7 | Perakendecide birden fazla kullanıcı sepet hazırlayabilir; gönderimi şube admini onaylar (şube onay kuralına göre). |
| K8 | Perakendeci tek sepette tüm bağlı toptancıların ürünlerini toplar; gönderimde sepet toptancı başına ayrı siparişe, belgeye ve cari kaydına bölünür. |
| K9 | Platformda online ödeme ve e-qaimə yoktur; her ikisi de sonradan adaptörle eklenir. |
| K10 | İşletme tek bir kayıttır; toptancılık (`seller`) ve perakendecilik (`buyer`) birer yetenektir. Yetki kontrolleri işletme tipine değil yeteneğe göre yapılır. |
| K11 | Teslim, perakendecinin uygulamadan onayıyla kesinleşir. Onay belirli süre içinde gelmezse otomatik onaylanır. Teslim kodu (OTP) yoktur. |

## 3. Personalar

| Kod | Persona | İşletme | Kanal | Temel ihtiyaç | En büyük endişe |
| --- | --- | --- | --- | --- | --- |
| P-01 | Platform admini | Platform | Web | Toptancı açmak, perakendecileri denetlemek, ayarları yönetmek | Kiracılar arası veri sızıntısı; kötüye kullanım (spam istek, sahte hesap) |
| P-02 | Toptancı sahibi / işletme admini | Toptancı | Web + mobil | Ciroyu, alacağı ve ekibi tek yerden görmek; müşteriye özel fiyatı doğru uygulamak | Yanlış fiyat; tahsil edilemeyen borç |
| P-03 | Satış müdürü | Toptancı | Web | Yeni perakendeci bulmak, bağlantı kurmak, siparişleri onaylamak | Ekibin bölgesindeki müşterileri kaçırması |
| P-04 | Satış temsilcisi | Toptancı | Mobil | Sahada perakendeciyi bulup istek göndermek; müşterisinin borcunu görmek | Uygulamanın yavaş veya karmaşık olması |
| P-05 | Depo sorumlusu | Toptancı | Web + mobil | Hazırlanacak siparişleri görmek, stoğu güncellemek | Stok sayısının gerçeği yansıtmaması |
| P-06 | Kargocu | Toptancı | Mobil | Günlük teslimat listesi, teslim etme, kapıda tahsilat | Teslim ettiği malın inkâr edilmesi |
| P-07 | Muhasebe | Toptancı | Web | Cari, tahsilat, ekstre, dışa aktarma | Kayıtların muhasebe programıyla uyuşmaması |
| P-08 | Perakendeci sahibi / işletme admini | Perakendeci | Mobil (ana) + web | Bağlı toptancılardan kolay sipariş; borcunu görmek; kimin bilgisini gördüğünü kontrol etmek | İstemediği toptancıların rahatsız etmesi; yanlış fiyat |
| P-09 | Şube admini | Perakendeci | Mobil | Şube sepetini onaylamak, teslimatı onaylamak | Onaysız sipariş gitmesi |
| P-10 | Satın alma sorumlusu / şube çalışanı | Perakendeci | Mobil | Eksik ürünleri sepete eklemek | — |

## 4. Özellik listesi ve MoSCoW önceliklendirmesi

**MoSCoW:** Must = MVP'de olmazsa olmaz · Should = MVP'de olmalı, zaman sıkışırsa ilk ertelenecek · Could = MVP sonrası, kolaysa MVP · Won't = bu sürümde yapılmayacak.

| # | Özellik | Öncelik | Story'ler |
| --- | --- | --- | --- |
| F-01 | Telefon + SMS OTP ile giriş | Must | US-001 |
| F-02 | Admin rolleri için 2FA | Must | US-002 |
| F-03 | Birden çok işletme arası geçiş | Should | US-003 |
| F-04 | Oturum ve cihaz yönetimi | Should | US-004 |
| F-05 | Perakendeci self-servis kaydı ve VÖEN | Must | US-005, US-006 |
| F-06 | Perakendeci veri görünürlüğü ayarları | Must | US-007 |
| F-07 | Toptancı başvuru formu | Should | US-008 |
| F-08 | Admin eliyle toptancı açılışı | Must | US-009 |
| F-09 | Şube ve depo yönetimi | Must | US-010, US-011 |
| F-10 | Unvan kataloğu, rol şablonları, kullanıcı ve rol yönetimi | Must | US-012, US-013 |
| F-11 | İşletmeye özel rol | Should | US-014 |
| F-12 | Perakendeci moderasyonu (VÖEN doğrulama) | Must | US-015 |
| F-13 | Perakendeci askıya alma, arşivleme | Must | US-016 |
| F-14 | Perakendeci kayıtlarını birleştirme | Should | US-016 |
| F-15 | Sistem ayarları (süre, kota, politika) | Must | US-017 |
| F-16 | Loglu kullanıcı taklidi (destek) | Could | US-018 |
| F-17 | Perakendeci dizini ve arama | Must | US-019, US-020 |
| F-18 | Bağlantı isteği, geri çekme, yanıt, engelleme | Must | US-021, US-022, US-023 |
| F-19 | Bağlantı koşulları | Must | US-024 |
| F-20 | Bağlantı iptali ve süre dolumu | Must | US-025, US-026 |
| F-21 | Bağlantısız hesap politikası | Should | US-027 |
| F-22 | Birim, kategori, marka, faaliyet alanı kataloğu | Must | US-028, US-029 |
| F-23 | Ürün, varyant, ambalaj, görsel, çeviri | Must | US-030 |
| F-24 | Excel ile ürün içe aktarma | Must | US-031 |
| F-25 | Perakendeci ürün listesi ve filtreler | Must | US-032 |
| F-26 | Kamerayla barkod arama | Should | US-033 |
| F-27 | Fiyat listeleri, fiyat önceliği, müşteri fiyatı | Must | US-034, US-035 |
| F-28 | Şube fiyatı ve şube indirimi | Should | US-036 |
| F-29 | Kademeli fiyat | Should | US-037 |
| F-30 | Kampanyalar | Won't (Faz 2) | — |
| F-31 | Stok modları 0–1 | Must | US-038 |
| F-32 | Miktarlı stok, rezervasyon, hareketler | Must | US-039 |
| F-33 | Lot bazlı stok ve FEFO | Won't (Faz 2) | — |
| F-34 | Ortak sepet, şube onayı, bölünme | Must | US-040, US-041, US-042 |
| F-35 | Toptancı sipariş onayı, düzenleme, kısmi onay | Must | US-043 |
| F-36 | Sipariş belgesi (PDF) | Must | US-044 |
| F-37 | Tekrar sipariş ve favoriler | Could | US-045 |
| F-38 | Kargocu atama ve teslim etme | Must | US-046, US-047 |
| F-39 | Perakendeci teslim onayı, itiraz, otomatik onay | Must | US-048 |
| F-40 | Manuel dış kargo | Should | US-049 |
| F-41 | Cari: borç kaydı, tahsilat | Must | US-050, US-051 |
| F-42 | Ekstre (PDF) | Should | US-052 |
| F-43 | e-qaimə uyumlu dışa aktarma | Should | US-053 |
| F-44 | Push bildirimleri | Must | US-054 |
| F-45 | Plan ve hak sistemi | Must | US-055 |
| F-46 | Rol bazlı temel dashboardlar | Must | US-056 |
| F-47 | Audit log | Must | US-057 |
| F-48 | Dil ve çeviri yönetimi | Must | US-058 |
| F-49 | Para birimi ve saat dilimi | Must | US-059 |
| F-50 | Mobil minimum sürüm kontrolü | Must | US-060 |
| F-51 | Satış temsilcisinin müşteri adına sipariş girmesi | Could | US-061 |
| F-52 | Online ödeme, e-qaimə entegrasyonu, dış kargo API, 1C, offline, WhatsApp/SMS bildirim kanalı, çift rol, perakendeci premium | Won't | — |

## 5. MVP kapsamı

MVP = tüm **Must** özellikler + mümkün olan **Should** özellikler. MVP'nin tamamlandığı kabul edilmeden önce şu uçtan uca senaryo, pilot toptancı verisiyle hatasız çalışmalıdır:

1. Admin, toptancıyı açar; toptancı admini kullanıcılarını ekler.
2. Toptancı ürünlerini ve fiyatlarını Excel'den içe aktarır.
3. Perakendeci mobil uygulamadan kaydolur ve VÖEN'ini girer.
4. Toptancının satış temsilcisi perakendeciyi telefon numarasıyla bulur ve istek gönderir.
5. Perakendeci isteği kabul eder; toptancı fiyat listesini ve vadeyi atar.
6. Perakendeci iki toptancıdan ürünü tek sepete ekler; şube admini onaylar; iki ayrı sipariş oluşur.
7. Toptancı siparişi kısmen onaylar; depo hazırlar; kargocu teslim eder (fotoğraf + GPS).
8. Perakendeci teslimi onaylar; borç cariye yazılır; muhasebe tahsilatı girer; cari sıfırlanır.
9. Tüm ekranlar az, ru ve tr dillerinde çalışır.

⚠️ AÇIK SORU: Satış temsilcisinin müşteri adına sipariş girmesi (US-061) MVP'de gerekli mi? Raporun rol tablosunda var, ama yol haritasında Faz 2'de. Bu belgede **Could** olarak işaretlendi.

## 6. Başarı ölçütleri

KPI'lar [project-charter.md](../01-discovery/project-charter.md) bölüm 3'te tanımlıdır. Her KPI'ın veri kaynağı ürün içinde ölçülebilir olmalıdır; bu yüzden ilgili zaman damgaları (`submitted_at`, `confirmed_at`, `auto_confirmed` vb.) veri modelinde zorunludur.
