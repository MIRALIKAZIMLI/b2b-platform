# F2 — Hesaplar ve bağlantı ağı: faz spesifikasyonu

| Alan | Değer |
| --- | --- |
| Hazırlayan | Mimar |
| Tarih | 2026-10-31 |
| Dayanak | `docs/07-ai-development/implementation-plan.md` F2 · `docs/05-planning/backlog.md` F2 tablosu · `docs/05-planning/roadmap.md` M2 |
| Milestone | **M2 — Bağlantı ağı** |
| Önceki faz | F1 bitti (PR #26–#34); M1'den açık kalan: gerçek cihazda push (F6), mobil E2E elle liste |

M2 çıkış ölçütü (roadmap.md): admin toptancı açar; perakendeci kaydolur; temsilci telefonla bulup istek gönderir; perakendeci kabul eder; kota, bekleme süresi, engel ve süre dolumu testleri yeşil. Kapsanan story'ler: US-005–US-011, US-013–US-017, US-019–US-027 (US-016 AC4 birleştirme ve US-018 taklit F2'de yok, bkz. §5).

## 0. Başlamadan önce: ön koşullar

| Eksik | Neden önemli | Ne yapılacak |
| --- | --- | --- |
| **`regions` tablosu boş** (F1.3 seed bölge eklemedi: pilot bölge listesi belgede yok) | `businesses.region_id` not null. Bölge olmadan ne toptancı (F2.1) ne perakendeci (F2.3) açılır; hizmet bölgesi ve dizin filtresi (F2.6, F2.11) de bölgeye dayanır. | Platform sahibi listeyi verir (S4). Gelene kadar testler kendi bölgelerini test kurulumunda ekler; gerçek kullanım beklenir. |
| **`activity_types` boş** (F1.7: liste platform sahibinden gelecek) | `buyer_profiles.activity_type_id` not null → perakendeci kaydı (F2.3) çalışmaz. | Platform sahibi listeyi verir (S5); F2.3'ten önce gerekli. |
| **Veri paylaşım metni** (NFR-63, 3 dil, sürümlü) | F2.3 kayıt formu bu metnin onayını kaydeder. | Platform sahibi metni verir veya AI taslağını onaylar (S6); F2.3'ten önce. |
| **F0.1 çıktısı yok** (`docs/reports/accounting-notes.md` yok) | VÖEN kontrol hanesi algoritması belli değil. | F2.4 US-006 VARSAYIM'ı uygular: "10 rakam, son hane 1 veya 2" (F1.7'de `shared/voen.ts` böyle). Engel değil. |

## 1. Adımlar

"Tahmin" ve "Bağımlılık" backlog.md'den aynen alınmıştır. "Bölme" Mimar önerisidir; adıma gelince kesinleşir ve implementation-plan.md'ye "Bölündü" notu eklenir.

| ID | Ne yapar (bir cümle) | Tahmin | Bağımlılık | Müfettiş | Bölme önerisi |
| --- | --- | --- | --- | --- | --- |
| F2.1 | Platform admini toptancı işletmesini, yeteneğini, aboneliğini açar; yetkiliye 7 günlük aktivasyon daveti gider | M | F1.8, F1.4 | **Zorunlu** (F2.1a: platform bağlamı, davet kabulü, `SECURITY DEFINER`) | **F2.1a** (API + migration) · **F2.1b** (admin ekranları + aktivasyon sayfası + E2E-02) — kartlar hazır |
| F2.2 | Herkese açık toptancı başvuru formu; admin listesi; başvurudan toptancı açma | S | F2.1 | Önerilir (kimliksiz uç, hız sınırı) | — |
| F2.3 | Perakendeci kendi kaydolur: işletme, `buyer` yeteneği, varsayılan şube, admin üyeliği, `buyer_free` aboneliği | M | F1.8 | **Zorunlu** (kimliksiz kayıt, `pendingToken`, R12/R13) | **F2.3a** (API) · **F2.3b** (web + mobil kayıt ekranları, E2E-03 web) |
| F2.4 | VÖEN girişi, format ve tekillik; VÖEN değişince doğrulama rozeti sıfırlanır | S | F2.3 | **Zorunlu** (koruma tetikleyicisi değişir) | — |
| F2.5 | Şubeler ve onay kuralı (`every_order` / `above_amount` / `none`) | S | F2.3 | Önerilir (eşik tutarı `numeric`) | — |
| F2.6 | Depolar (`warehouses.max`), satıcı profili, hizmet bölgeleri | S | F2.1 | Önerilir (hak kontrolü) | — |
| F2.7 | Ekip: davet, rol atama, şube/depo/bölge kapsamı, son admin | M | F1.8 | **Zorunlu** (yetki, davet) | Gerekirse **F2.7a** (API) · **F2.7b** (web ekip ekranı + mobil davet kabulü) |
| F2.8 | Şablondan işletmeye özel rol; izin değişince izin önbelleği temizlenir | S | F2.7 | Önerilir (izin önbelleği) | — |
| F2.9 | Admin: unvan kataloğu ve rol şablonları; "yeni şablon sürümü" bildirimi | M | F2.7 | Önerilir (G tablosu yazma) | — |
| F2.10 | Perakendeci gizlilik ayarları (dizinde görünme, açık alanlar) | S | F2.3 | Önerilir (kişisel veri) | — |
| F2.11 | Perakendeci dizini: Meilisearch indeksi, filtreler, tam telefon/VÖEN eşleşmesi, hız sınırı | L | F2.10, F2.6 | **Zorunlu** (D fonksiyonu, kişisel veri sızıntısı, TM-09/TM-10) | **F2.11a** (D fonksiyonu + indeks + outbox tüketicisi + `search:reindex`) · **F2.11b** (`GET /directory/buyers`, hız sınırı, web + mobil ekran) |
| F2.12 | Bağlantı isteği ve `ConnectionPolicy` (önce test); kota satıcı saat diliminde | L | F2.11, F1.4 | **Zorunlu** (ilk P tabloları, politika, eşzamanlılık) | **F2.12a** (tablolar + RLS + `ConnectionPolicy` + API) · **F2.12b** (web + mobil istek gönderme) |
| F2.13 | Perakendecinin yanıtı (kabul/red/engel), geri çekme, engel listesi | M | F2.12 | **Zorunlu** (`blocks` RLS, bağlantı oluşturma, D okuma) | Gerekirse **F2.13a** (API) · **F2.13b** (ekranlar + push bağlantıları + E2E-04) |
| F2.14 | Bağlantı koşulları (kredi limiti, vade, temsilci); `price_list_id` F3.6'ya kadar null | S | F2.13 | Önerilir (para `numeric`) | — |
| F2.15 | Bağlantı iptali, outbox `connection.cancelled`, `ConnectionCancelledHandler` kancası | M | F2.13 | **Zorunlu** (durum makinesi, iptal kuralları) | — |
| F2.16 | Zamanlanmış iş: 15 dakikada bir süresi dolan istekleri `expired` yapar (Redis kilidi) | S | F2.12 | Önerilir (tek etki, kilit) | — |
| F2.17 | Bağlantısız hesap politikası (7/30/90/120/180. gün), anonimleştirme | M | F2.16, F1.11 | **Zorunlu** (kişisel veri silme, platform bağlamı) | — |
| F2.18 | Admin: VÖEN moderasyonu, askıya alma, arşivleme; platformun fiyat/sipariş/cari yazamaması | M | F2.4 | **Zorunlu** (platform yazma, RLS) | — |
| F2.19 | Admin: ayarlar ekranı (kapsam seçici) | S | F1.4 | Önerilir (ayar sınırları, audit) | — |

"Müfettiş Zorunlu" dayanağı: `coding-guidelines.md` §10.4, `definition-of-done.md` §5, `review-guide.md` §4 riskli yollar. "Önerilir" Mimar önerisidir.

## 2. Önerilen sıra

Hedef: en kısa yoldan M2'nin uçtan uca akışına (E2E-04) ulaşmak, sonra kalan adımlar. **Plan incelemesi gerekli** ise Usta kodu yazmadan planı Mimar'a getirir. Düşük riskli adımlarda plan incelemesi yok (2026-10-30 kullanıcı kararı).

| # | Kart | Risk | Plan incelemesi | Bağımlılık |
| --- | --- | --- | --- | --- |
| 1 | [F2.1a](F2.1a.md) toptancı açma API, davet kabulü | yüksek | gerekli | F1.8b, F1.4b; S1–S3 kararı |
| 2 | [F2.1b](F2.1b.md) admin toptancı ekranları, aktivasyon sayfası, E2E-02 | normal | gerekmez | F2.1a |
| 3 | F2.3a perakendeci kayıt API | yüksek | gerekli | F1.8b; S5, S6 |
| 4 | F2.3b kayıt ekranları (web + mobil), E2E-03 | normal | gerekmez | F2.3a |
| 5 | F2.4 VÖEN girişi | yüksek | gerekli | F2.3a |
| 6 | F2.6 depolar, satıcı profili, hizmet bölgeleri | normal | gerekmez | F2.1a |
| 7 | F2.7 ekip yönetimi (a/b gerekirse) | yüksek | gerekli | F2.1a (davet kabul ucu) |
| 8 | F2.10 gizlilik ayarları | normal | gerekmez | F2.3a |
| 9 | F2.11a dizin: D fonksiyonu, indeks, tüketici | yüksek | gerekli | F2.10, F2.6 |
| 10 | F2.11b dizin ucu ve ekranları | yüksek | gerekli | F2.11a |
| 11 | F2.12a bağlantı isteği API + `ConnectionPolicy` | yüksek | gerekli | F2.11b |
| 12 | F2.12b istek gönderme ekranları | normal | gerekmez | F2.12a |
| 13 | F2.13 yanıt, geri çekme, engel (+ E2E-04) | yüksek | gerekli | F2.12a |
| 14 | F2.16 istek süre dolumu | normal | gerekmez | F2.12a |
| 15 | F2.14 bağlantı koşulları | normal | gerekmez | F2.13 |
| 16 | F2.15 bağlantı iptali | yüksek | gerekli | F2.13 |
| 17 | F2.5 şubeler ve onay kuralları | normal | gerekmez | F2.3a |
| 18 | F2.2 toptancı başvuru formu | normal | gerekmez | F2.1b |
| 19 | F2.8 işletmeye özel rol | normal | gerekmez | F2.7 |
| 20 | F2.9 unvan ve rol şablonları | normal | gerekmez | F2.7 |
| 21 | F2.18 moderasyon, askıya alma, arşivleme | yüksek | gerekli | F2.4 |
| 22 | F2.17 bağlantısız hesap politikası | yüksek | gerekli | F2.16, F1.11 |
| 23 | F2.19 admin ayarlar ekranı | normal | gerekmez | F1.4 |

Sıranın gerekçesi: F2.7 ekip daveti, F2.1a'nın yazdığı davet kabul ucunu (`POST /team/invitations/accept`) yeniden kullanır; dizin (F2.11) hizmet bölgelerine (F2.6) ve gizliliğe (F2.10) dayanır; F2.5, F2.2, F2.8, F2.9, F2.19 M2 akışını engellemez, arkaya alındı. F2.19 küçük ve bağımsızdır; gerekirse öne çekilebilir.

## 3. Riskli noktalar

| # | Risk | Adım | Önlem |
| --- | --- | --- | --- |
| R15 | **Modüller arası tek işlem.** Toptancı açılışı (işletme + yetenek + abonelik + rol + davet) ve perakendeci kaydı (işletme + yetenek + şube + üyelik + abonelik) birden çok modülün tablosuna yazar; bugünkü servisler her biri kendi işlemini açıyor. Yarıda kalırsa yarım işletme kalır. | F2.1a, F2.3a | Tek `withPlatformTx` (F2.1a) / tek kayıt işlemi (F2.3a) içinde; modüller `index.ts` üzerinden işlem nesnesi (`tx`) alan fonksiyon açar. Yapay hata testi: hiçbir satır kalmaz. |
| R16 | **Davet bağlantısının ele geçirilmesi.** SMS'teki bağlantı başkasına iletilirse başkası işletme admini olabilir. | F2.1a, F2.7 | Bağlantı + OTP girişi; oturumdaki kullanıcının telefonu davetteki telefonla aynı olmalı. Token yalnızca özet (SHA-256) saklanır, loglanmaz; geçersiz/süresi dolmuş/kullanılmış/başka telefon → hepsi aynı `404`. |
| R17 | **Davet kabulünde kiracı bağlamı yok.** Kabul eden kullanıcı henüz üye değil; `invitations` T tablosu bağlamsız 0 satır döner. Platform bağlamı yalnızca `platform-admin` uçlarında açılabilir (c4 §7). | F2.1a | `migrator` sahipli `SECURITY DEFINER` kabul fonksiyonu (T3 kuralları + `FOR UPDATE` + proconfig testi). |
| R12 | İdempotens yanıtı handler işleminden ayrı yazılıyor (F1.2b). | F2.1a, F2.3a | F2.1a'da kabul edilir: aynı VÖEN ikinci kez açılamaz (`409`), ikinci kayıt oluşmaz. F2.3a'da (VÖEN'siz kayıt) yanıt kaydı handler işlemine alınır. |
| R13 | Kimliksiz `POST /buyers/register` için idempotens kapsamı belirsiz. | F2.3a | F2.3a planında karar: kapsam `pendingToken`'daki telefon. |
| R18 | **İlk P tabloları** (`connection_requests`, `connections`): iki taraflı politika (`seller_id` veya `buyer_id` = bağlam). `check-rls`'in P kuralı henüz sınanmadı. | F2.12a | P kalıbı + `check-rls` P kuralı + iki yönlü izolasyon testi aynı PR'da. |
| R19 | **D okuma (başka kiracının sınırlı verisi):** `businesses`, `buyer_profiles`, `business_privacy` `rls:T,D`; D kısmı henüz yok. Dizin, tam telefon/VÖEN araması, isteği açan perakendecinin gördüğü toptancı özeti başka kiracının satırını okur. | F2.11a, F2.13 | Yalnızca `SECURITY DEFINER` fonksiyonlarla, yalnızca açık alanlar (US-007), kapalı alan `null`; başka bağlantı bilgisi hiçbir koşulda yok (şema testi, test-strategy §3.6). |
| R20 | **VÖEN değişince doğrulama rozeti.** `businesses_guard_platform_columns` kiracının `verified_at`'i değiştirmesini engelliyor; VÖEN değişince rozet sıfırlanmalı. | F2.4 | Tetikleyici, `voen` değiştiğinde `verified_at/verified_by`'ı kendisi `null` yapar (kiracı bu alanı yine yazamaz); bekçi testi. |
| R21 | **`dormant` geçişleri** kiracı bağlamında yasak (F1.7 tetikleyicisi); oysa "kullanıcı giriş yapınca `active`" (US-027 AC3). | F2.17 | Giriş akışında ayrı `SECURITY DEFINER` fonksiyon veya platform bağlamlı iş; planda karar. |
| R22 | **Rol izni değişince izin önbelleği** (`access:perm:<membershipId>`) eski kalır. | F2.8, F2.9 | Rol izin değişikliği outbox → `access` kuyruğu → önbellek silme (F1.8b tüketicisi yeniden kullanılır); test. |
| R23 | Kota günü satıcının saat diliminde (Asia/Baku 23:59 / 00:01) ve eşzamanlı iki istek. | F2.12a | test-strategy §3.2 tablosu; `FixedClock`; gerçek PostgreSQL ile paralel işlem testi. |
| R24 | Anonimleştirmede kişisel veri kalıntısı (log, audit, Meilisearch indeksi). | F2.17, F2.18 | Anonimleştirme servisi indeksten de siler; audit'te 🔒 alan zaten maskeli; test. |
| R25 | Platform admini fiyat/sipariş/cari yazamaz (US-016 AC5) ama bu tablolar F3–F5'te gelir. | F2.18 | F2.18 kuralı belgeye ve `check-rls`'e (platform politikası yasak listesi) yazar; tablolar geldikçe aynı test kapsar. |

## 4. Açık sorular (belgede yok — karar platform sahibinin)

| # | Soru | Seçenekler | Mimar önerisi | Ne zaman |
| --- | --- | --- | --- | --- |
| S1 | Hangi platform rolleri toptancı açabilir ve admin "Toptancılar" ekranını görür? (`platform_staff.role`: `super_admin`, `operations`, `support`, `content`; ekran ↔ rol eşlemesi belgede yok) | **A)** `super_admin` + `operations`. Artı: günlük işi operasyon ekibi yapar. Eksi: yetkili kişi sayısı artar. **B)** Yalnızca `super_admin`. Artı: en sıkı. Eksi: her açılışı tek kişi yapar. | **Karar (platform sahibi, 2026-10-31): A** | F2.1a |
| S2 | Aktivasyon (ve ekip daveti) SMS'i gönderilsin mi? productreport D18 "SMS ilk günden yalnızca OTP için" diyor; US-009 AC1 ve US-013 AC1 ise "davet/aktivasyon SMS'i gider" diyor — **belgeler çelişiyor**. | **A)** Davet SMS'i istisna: yalnızca bağlantı içeren kısa SMS; D18 notu "OTP ve davet" olarak güncellenir. Artı: story'lerle aynı, yetkili bağlantıyı hemen alır. Eksi: SMS maliyeti (az sayıda). **B)** SMS yok: yetkili uygulamaya OTP ile girer, telefonuna ait bekleyen davet otomatik bulunur; bağlantıyı admin elle iletir. Artı: D18'e birebir uyar. Eksi: US-009 AC1/AC3 ve US-013 AC1 yeniden yazılır. | **Karar (platform sahibi, 2026-10-31): A** — D18 güncellendi | F2.1a |
| S3 | Toptancı yetkilisinin kullanıcı kaydı ne zaman açılır? | **A)** Admin toptancıyı açarken (`ownerName` + telefon); yetkili normal OTP girişiyle girer, bağlantı daveti kabul eder. Artı: mevcut giriş akışı aynen çalışır. Eksi: telefon yanlış yazılırsa kullanılmayan bir kullanıcı satırı kalır. **B)** Yetkili bağlantıyı açıp OTP'yi doğrulayınca (`pendingToken` ile). Artı: kayıt yalnızca telefon sahibi doğrulayınca. Eksi: kimlik akışına yeni dal (daha büyük, riskli değişiklik). | **Karar (platform sahibi, 2026-10-31): A** | F2.1a |
| S4 | Pilot bölge listesi (`regions`: şehir/rayon) | **A)** Platform sahibi listeyi verir. **B)** Mimar resmi idari bölünmeden (şehirler + rayonlar) 3 dilde taslak çıkarır, platform sahibi onaylar. | **Karar (platform sahibi, 2026-10-31): B** — taslak hazırlanıyor; onaysız seed'e girmez | F2.1a öncesi gerçek kullanım; test için engel değil |
| S5 | Faaliyet türü listesi (`activity_types`) | **A)** Platform sahibi verir. **B)** Mimar 3 dilde taslak (bakkal, market, kafe, restoran, eczane vb.) çıkarır, platform sahibi onaylar. | **Karar (platform sahibi, 2026-10-31): B** — taslak hazırlanıyor | F2.3a öncesi (zorunlu) |
| S6 | Veri paylaşım metni (NFR-63, 3 dil, sürümlü) | **A)** Platform sahibi (hukukçu) yazar. **B)** AI taslak, platform sahibi onaylar; sürüm `v1`. | **B**, yayın öncesi hukukçu kontrolü | F2.3a |
| S7 | Aynı VÖEN perakendeci olarak kayıtlıysa admin toptancı açabilir mi? (`businesses.voen` tüm işletmelerde benzersiz; D20: MVP'de işletme başına tek yetenek) | **A)** Reddedilir (`409 VOEN_ALREADY_REGISTERED`). Artı: belgeyle ve veritabanı kısıtıyla aynı. Eksi: hem toptancı hem perakendeci olan şirket ikinci hesabı VÖEN'siz açmalı. **B)** O işletmeye `seller` yeteneği eklenir. Eksi: D20 ile çelişir (özellik bayrağı kapalı). | **Karar (platform sahibi, 2026-10-31): A** | F2.1a |
| S8 | "Son kullanılan işletme" (US-003 AC1) F1.13b/F1.14b'de saklanmadı. Nerede yapılsın? | **A)** F2.7 (ekip daveti ile çok işletmeli kullanıcı ilk kez çoğalır): `users` tablosuna `last_business_id` (data-model önce). **B)** Ayrı küçük adım. | **A** (Mimar karar verebilir; kısa) | F2.7 |
| S9 | Gizli depoda `<işletme>/upload/` geçici dosya artıkları ve `pending` dosya temizliği (F1.10 "ayrı küçük adım") | **A)** F2.16 ile aynı zamanlanmış iş altyapısında yeni küçük adım **F2.16b**. **B)** F6'ya bırak. | **A** | F2.16 sonrası |

Kullanıcı kararı bekleyen F1 notları (değişmedi): az/ru/tr çevirileri onayı (her adımın yeni anahtarları taslak), F1.8a şablon eşlemesindeki 7 fark (F2.7/F2.9'da görünür olur).

## 5. F1'den taşınan notlar ve kapsam dışı

| Not | Adım |
| --- | --- |
| R14: toptancıya plan aboneliği aynı işlemde (admin planı seçer; seed `pilot`) | F2.1a |
| R14: perakendeciye `buyer_free` aboneliği aynı işlemde | F2.3a |
| R12 / R13 idempotens | F2.1a (kabul), F2.3a (çözüm) |
| `rls:T,D` D fonksiyonu (`businesses`, `buyer_profiles`, `business_privacy`) | F2.11a (dizin, tam eşleşme), F2.13 (toptancı özeti) |
| VÖEN değişince doğrulama rozeti sıfırlanır (R20) | F2.4 |
| `dormant` geçişleri platform bağlamı / fonksiyon (R21) | F2.17 |
| Rol izni değişince izin önbelleği temizliği (R22) | F2.8 (F2.9 şablon değişikliği kopyalara dokunmaz) |
| Platform menüsü yalnız dashboard → "Toptancılar" ilk platform ekranı; ekran ↔ platform rolü eşlemesi `@b2b/shared` `menu.ts`'de (S1) | F2.1b; sonraki admin ekranları F2.9, F2.18, F2.19 |
| "Son kullanılan işletme" (S8) | F2.7 |
| `shell.*` ve yeni ekran çevirileri taslak | her ekran adımı; toplu onay platform sahibinde |
| F1.10 testindeki çift yorum satırı | F2.6 (satıcı profil logosu dosya modülüne dokunur) |
| `<işletme>/upload/` artık temizliği (S9) | F2.16b önerisi |
| Materialized view `check-rls` kuralı | F2'de matview yok; ilk matview adımında (F5 raporlar) |
| Gerçek cihazda push (EAS) | F6 |

Kapsam dışı (F2'de yok): US-016 AC4 mükerrer perakendeci birleştirme (Should; implementation-plan F2.18 yalnızca AC1–AC3, AC5) — hangi adımda yapılacağı açık; US-018 kullanıcı taklidi (Could); self-servis toptancı kaydı (`onboarding.seller_mode` yalnızca `manual`).

## 6. Ortak kurallar (F2 ekleri)

F1 faz spesifikasyonu §6'nın tamamı geçerlidir. F2'de eklenenler:

1. **Platform bağlamı yalnızca `platform-admin` modülünde** (c4 §7): `withPlatformTx` başka modülün controller'ından açılmaz. Diğer modüller platform-admin'e `tx` alan fonksiyon verir.
2. **Davet token'ı:** 32 bayt rastgele, URL-güvenli; saklanan yalnızca SHA-256 özeti (`invitations.token_hash`). Token log, audit, outbox yükü ve hata mesajına girmez. Kabul uç noktası her başarısız durumda aynı `404` döner.
3. **Yeni süreler ayara:** `invitation.*` gibi her süre US-017 tablosuna ve `packages/shared/src/settings.ts`'e aynı PR'da girer (data-model'deki "7 gün" ayar varsayılanı olur).
4. **D fonksiyonları:** başka kiracının satırını okuyan her fonksiyon yalnızca açık alanları döner, `SECURITY DEFINER` T3 kurallarına uyar ve şema testi taşır (dönen alan listesi sabit).
5. **P tabloları:** politika `seller_id = bağlam OR buyer_id = bağlam`; her P tablosu iki yönlü izolasyon testi taşır (A satıcısı B'nin, C alıcısı D'nin satırını görmez).
6. **Kimliksiz uçlar** (`/seller-applications`, `/buyers/register`): hız sınırı Redis'te, ayarlardan; `endpoint-access.test.ts` listesine bilinçli eklenir.

## 7. F2 için gereken belge güncellemeleri

1. `implementation-plan.md` F2.1 altına "Bölündü" notu (bu PR'da).
2. S2 = A (karar verildi): `docs/productreport.md` D18 satırı bu PR'da güncellendi.
3. S1 kararı → `docs/03-architecture/c4-component.md` §5 altına "Platform rolleri ve admin ekranları" tablosu (F2.1a PR'ında).
4. S4/S5/S6 listeleri gelince ilgili seed + `data-model.md` §6 AÇIK SORU kaydı kapanır.
