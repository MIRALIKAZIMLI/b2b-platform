# Backlog

| Alan | Değer |
| --- | --- |
| Sürüm | 1.0 |
| Tarih | 2026-10-24 |
| İlgili belgeler | [roadmap.md](roadmap.md) · [user-stories.md](../02-requirements/user-stories.md) · [implementation-plan.md](../07-ai-development/implementation-plan.md) |

Backlog, uygulama planındaki adımların tek listesidir. **ID**, görev kartının, git dalının ve pull request'in adıdır (ör. `feature/F2.12-connection-request`). Her adımın ayrıntılı tanımı (amaç, dosyalar, kabul kriterleri, test) [implementation-plan.md](../07-ai-development/implementation-plan.md) içindedir.

**Tahmin birimi:** Tek geliştirici + AI asistanı, odaklı çalışma süresi.

| Boy | Süre | Kural |
| --- | --- | --- |
| S | ≤ 0,5 gün | Tek pull request |
| M | ≤ 1 gün | Tek pull request |
| L | ≤ 2 gün | Tek pull request; daha büyükse uygulama sırasında `a`/`b` adımlarına bölünür |

📌 VARSAYIM: Tahminler AI destekli geliştirme için kaba değerlerdir ve inceleme, test ve belge güncelleme süresini içerir. İlk 10 adımın gerçek süreleri ölçülüp kalan tahminler buna göre düzeltilir. Takvim tarihi bilinçli olarak verilmez; sıra bağımlılığa göredir.

**Öncelik:** Story'nin MoSCoW önceliği. `Could` adımları ancak tüm `Must` adımları bitince yapılır.

## F0 — Hazırlık

| ID | Görev | İlgili story / belge | Tahmin | Bağımlılık |
| --- | --- | --- | --- | --- |
| F0.1 | Mali müşavir görüşmesi: e-qaimə dışa aktarma sütunları, VÖEN kontrol hanesi, ƏDV oranları | US-006, US-053 | S | — |
| F0.2 | Pilot toptancı atölyesi: örnek Excel dosyaları, iş akışı, KPI hedef değerleri, pilot süresi | KPI-01–07 | S | — |
| F0.3 | GitHub deposu, monorepo iskeleti, Docker Compose (yerel), CI (lint, tip, test), AGENTS.md | ADR-0001, ADR-0002 | L | — |
| F0.4 | AWS hesabı, Budgets alarmı, Lightsail staging, Cloudflare alan adı, R2 bucket'ları, SSM; gerçek fiyat doğrulaması | ADR-0012, NFR-90 | M | F0.3 |
| F0.5 | Claude Projesi kurulumu, görev kartı şablonu, ilk görev kartları (F1) | [07-ai-development](../07-ai-development/) | S | F0.3 |

## F1 — Çekirdek altyapı

| ID | Görev | İlgili story / belge | Tahmin | Bağımlılık |
| --- | --- | --- | --- | --- |
| F1.1 | `core`: veritabanı bağlantısı, `withTenantTx`, RLS altyapısı, migration aracı, izolasyon test yardımcısı | ADR-0003, ADR-0005, NFR-40 | L | F0.3 |
| F1.2 | `core`: hata modeli, istek kimliği, yapılandırılmış log, idempotens, outbox + worker dağıtıcı | ADR-0010, NFR-48 | L | F1.1 |
| F1.3 | `i18n`: diller, arayüz çevirileri, para birimleri, ülkeler, bölgeler; seed; `/api/v1/i18n/{lang}` | US-058, US-059 | M | F1.1 |
| F1.4 | `settings` + `billing` hak servisleri (çözümleme, önbellek, seed) | US-017, US-055 | M | F1.1 |
| F1.5 | `identity`: kullanıcı, OTP (mock `SmsSender`), oturum, yenileme anahtarı döndürme, cihazlar | US-001, US-004, ADR-0006, ADR-0021 | L | F1.2 |
| F1.6 | `identity`: TOTP, kurtarma kodları, `platform_staff` | US-002 | M | F1.5 |
| F1.7 | `businesses`: işletme, yetenek, profiller, kişisel veri, gizlilik tabloları | ADR-0004, K10 | M | F1.1 |
| F1.8 | `access`: izin seed'i, rol şablonları, roller, üyelikler, `TenantContext`, `PermissionGuard` | US-012, US-013, ADR-0004 | L | F1.5, F1.7 |
| F1.9 | `core`: audit log yazıcısı | US-057 | S | F1.2 |
| F1.10 | `files`: `FileStorage` (MinIO / R2), yükleme URL'si, tamamlama doğrulaması | SF-09, NFR-49 | M | F1.8 |
| F1.11 | `notifications`: `PushSender` (mock + Expo), cihaz anahtarları, şablonlar, outbox tüketicisi | US-054 | M | F1.2, F1.3 |
| F1.12 | OpenAPI'den istemci üretimi (`packages/api-client`) ve CI sözleşme kontrolü | ADR-0022 | S | F0.3 |
| F1.13 | Web iskeleti: giriş, dil seçici, işletme seçici, izinden oluşan menü | US-001, US-003, US-058 | L | F1.8, F1.12 |
| F1.14 | Mobil iskeleti: giriş, dil, menü, `app-config` minimum sürüm, push kaydı | US-001, US-060 | L | F1.8, F1.11, F1.12 |

## F2 — Hesaplar ve bağlantı ağı

| ID | Görev | İlgili story / belge | Tahmin | Bağımlılık |
| --- | --- | --- | --- | --- |
| F2.1 | Admin: toptancı açma ve aktivasyon daveti | US-009 | M | F1.8, F1.4 |
| F2.2 | Toptancı başvuru formu ve admin başvuru listesi | US-008 | S | F2.1 |
| F2.3 | Perakendeci self-servis kaydı | US-005 | M | F1.8 |
| F2.4 | VÖEN girişi, format ve tekillik kontrolü | US-006 | S | F2.3 |
| F2.5 | Şubeler ve onay kuralları | US-010 | S | F2.3 |
| F2.6 | Depolar, satıcı profili, hizmet bölgeleri | US-011 | S | F2.1 |
| F2.7 | Ekip: davet, rol atama, kapsam, son admin koruması | US-013 | M | F1.8 |
| F2.8 | İşletmeye özel rol (şablondan kopya) | US-014 | S | F2.7 |
| F2.9 | Admin: unvan kataloğu ve rol şablonları ekranı | US-012 | M | F2.7 |
| F2.10 | Perakendeci gizlilik ayarları | US-007 | S | F2.3 |
| F2.11 | Perakendeci dizini: Meilisearch indeksi, filtreler, tam eşleşme, hız sınırı | US-019, US-020, ADR-0011, ADR-0014 | L | F2.10, F2.6 |
| F2.12 | Bağlantı isteği ve `ConnectionPolicy` | US-021 | L | F2.11, F1.4 |
| F2.13 | İsteğe yanıt: kabul, red, engel; geri çekme | US-022, US-023 | M | F2.12 |
| F2.14 | Bağlantı koşulları | US-024 | S | F2.13 |
| F2.15 | Bağlantı iptali (sepet/sipariş yan etkileri F4.5'te tamamlanır) | US-025 | M | F2.13 |
| F2.16 | Zamanlanmış iş: istek süre dolumu | US-026 | S | F2.12 |
| F2.17 | Bağlantısız hesap politikası | US-027 | M | F2.16, F1.11 |
| F2.18 | Admin: VÖEN moderasyonu, askıya alma, arşivleme | US-015, US-016 | M | F2.4 |
| F2.19 | Admin: ayarlar ekranı | US-017 | S | F1.4 |

## F3 — Katalog, fiyat ve stok

| ID | Görev | İlgili story / belge | Tahmin | Bağımlılık |
| --- | --- | --- | --- | --- |
| F3.1 | Birim kataloğu, dönüşümler, admin ekranı | US-028 | S | F1.3 |
| F3.2 | Kategori, marka, faaliyet alanı; marka talebi | US-029 | M | F1.3 |
| F3.3 | Ürün, varyant, ambalaj hiyerarşisi (CRUD, web) | US-030 | L | F3.1, F3.2, F2.6 |
| F3.4 | Ürün görselleri ve küçültme (worker) | US-030 | M | F3.3, F1.10 |
| F3.5 | Excel ile ürün içe aktarma — `imports` modülü (önizleme, uygulama, rapor) | US-031 | L | F3.3 |
| F3.6 | Fiyat listeleri ve `PriceResolver` çekirdeği | US-034, ADR-0019 | L | F3.3, F2.14 |
| F3.7 | Müşteri fiyatı ve toplu yükleme | US-035 | M | F3.6, F3.5 |
| F3.8 | Şube fiyatı ve şube indirimi | US-036 | M | F3.7, F2.5 |
| F3.9 | Kademeli fiyat | US-037 | S | F3.6 |
| F3.10 | Stok modları 0–1 | US-038, ADR-0018 | S | F3.3 |
| F3.11 | Miktarlı stok ve hareketler (rezervasyon F4.4'te) | US-039 | M | F3.10 |
| F3.12 | Ürün arama indeksi, perakendeci ürün listesi ve filtreler (web + mobil) | US-032 | L | F3.6, F3.11 |
| F3.13 | Kamerayla barkod arama (mobil) | US-033 | S | F3.12 |
| F3.14 | Favoriler | US-045 | S | F3.12 |

## F4 — Sepet ve sipariş

| ID | Görev | İlgili story / belge | Tahmin | Bağımlılık |
| --- | --- | --- | --- | --- |
| F4.1 | Şube sepeti (web + mobil) | US-040 | M | F3.12 |
| F4.2 | Şube onayı | US-041 | M | F4.1 |
| F4.3 | Sepetin bölünmesi ve sipariş oluşumu | US-042, ADR-0015 | L | F4.2 |
| F4.4 | Toptancı sipariş onayı, kısmi onay, red; stok rezervasyonu | US-043, US-039 | L | F4.3, F3.11 |
| F4.5 | Sipariş iptali; bağlantı iptalinin sipariş ve sepet etkileri | US-025 AC2–4 | S | F4.4, F2.15 |
| F4.6 | Sipariş listeleri ve detay ekranları (toptancı + perakendeci, web + mobil) | US-043, US-048 | M | F4.4 |
| F4.7 | Sipariş belgesi (PDF, 3 dil) | US-044 | M | F4.4 |
| F4.8 | Tekrar sipariş | US-045 | S | F4.3 |

## F5 — Teslimat ve cari

| ID | Görev | İlgili story / belge | Tahmin | Bağımlılık |
| --- | --- | --- | --- | --- |
| F5.1 | `DeliveryProvider`, kargocu atama, kargocu mobil listesi | US-046 | M | F4.4 |
| F5.2 | "Teslim ettim": fotoğraf, GPS, konum uyuşmazlığı | US-047 | M | F5.1, F1.10 |
| F5.3 | Perakendeci onayı / itirazı; otomatik onay işi; teslimde cari borç kaydı | US-048, US-050 AC1, ADR-0016 | M | F5.2, F5.6 |
| F5.4 | İtiraz çözümü | US-048 AC4 | S | F5.3 |
| F5.5 | Manuel dış kargo | US-049 | S | F5.1 |
| F5.6 | Cari: `LedgerService`, bakiyeler, hareketler (web + mobil) — F5.3'ten önce yapılır | US-050, ADR-0020 | M | F4.4 |
| F5.7 | Tahsilat, kapıda tahsilat, kargocu nakdi, temsilci tahsilatı onayı | US-051 | M | F5.6 |
| F5.8 | Ekstre PDF | US-052 | S | F5.6, F4.7 |
| F5.9 | e-qaimə uyumlu .xlsx dışa aktarma ve e-qaimə numarası | US-053 | S | F5.6, F0.1 |

## F6 — Dashboard ve yayın hazırlığı

| ID | Görev | İlgili story / belge | Tahmin | Bağımlılık |
| --- | --- | --- | --- | --- |
| F6.1 | Rol bazlı dashboardlar | US-056 | L | F5.7 |
| F6.2 | Audit log ekranı | US-057 | S | F1.9 |
| F6.3 | Admin: planlar, abonelikler, istisnalar; `read_only` mod | US-055 | M | F1.4, F4.4 |
| F6.4 | Admin: perakendeci birleştirme | US-016 AC4 | M | F5.6 |
| F6.5 | Gerçek SMS sağlayıcısı adaptörü | NFR-98, ADR-0021 | S | F1.5; sağlayıcı seçimi |
| F6.6 | Çevirilerin tamamlanması (az, ru, tr %100) | NFR-70 | S | F6.1 |
| F6.7 | Production ortamı, gözlem ve alarmlar | [observability.md](../06-operations/observability.md) | M | F0.4 |
| F6.8 | Güvenlik gözden geçirmesi (ASVS L1, tehdit modeli kontrolleri) | NFR-53, [threat-model.md](../03-architecture/threat-model.md) | M | F6.1 |
| F6.9 | Staging yük testi | NFR-01–21 | M | F6.7 |
| F6.10 | Yedek geri yükleme testi ve runbook provası | NFR-36 | S | F6.7 |
| F6.11 | Mobil TestFlight ve Play iç test yayını | C-07 | S | F6.8 |
| F6.12 | (Could) Loglu kullanıcı taklidi | US-018 | S | F6.2 |
| F6.13 | (Could) Satış temsilcisinin müşteri adına sipariş girmesi | US-061 | M | F4.3 |

## F7 — Pilot

| ID | Görev | İlgili story / belge | Tahmin | Bağımlılık |
| --- | --- | --- | --- | --- |
| F7.1 | Pilot toptancı verilerinin aktarımı (Excel → içe aktarma) | US-031, US-035 | M | F6.9, F6.10, F6.11 |
| F7.2 | Toptancı ekiplerinin eğitimi (az, ru kısa videolar) | [stakeholders.md](../01-discovery/stakeholders.md) §2 | S | F7.1 |
| F7.3 | Y2 kapalı pilot: toptancı ekipleri gerçek veriyle 1 hafta | [design-doc.md](../03-architecture/design-doc.md) §9 | — | F7.2, F6.5 |
| F7.4 | Y3 açık pilot: perakendeci kaydı ve bağlantılar | KPI-01 | — | F7.3 |
| F7.5 | Haftalık geri bildirim ve düzeltme döngüsü | — | — | F7.4 |
| F7.6 | Pilot değerlendirmesi ve Faz 2 önceliklendirmesi | [project-charter.md](../01-discovery/project-charter.md) §8 | S | F7.5 |

## Sonraki fazlar (önceliklendirilmemiş)

| Faz | Kapsam |
| --- | --- |
| Faz 2 | Kredi limiti blokajı, yaşlandırma ve mutabakat, kampanyalar, iade süreci, lot bazlı stok ve FEFO, çok depoda rezervasyon depo seçimi, WhatsApp ve SMS bildirim kanalları, ilk dış kargo API adaptörü, temsilci ziyaret modu ve rota |
| Faz 3 | 1C entegrasyonu ve stok modu `sync`, e-qaimə entegrasyonu, online ödeme, ödemeli toptancı self-servis kaydı, çift rollü işletmeler, perakendeci premium, offline mobil, açık API, yeni ülkeler |

## Toplam

| Faz | Adım sayısı | S | M | L | Süresiz (pilot) |
| --- | --- | --- | --- | --- | --- |
| F0 | 5 | 3 | 1 | 1 | 0 |
| F1 | 14 | 2 | 6 | 6 | 0 |
| F2 | 19 | 9 | 8 | 2 | 0 |
| F3 | 14 | 5 | 5 | 4 | 0 |
| F4 | 8 | 2 | 4 | 2 | 0 |
| F5 | 9 | 4 | 5 | 0 | 0 |
| F6 | 13 | 6 | 6 | 1 | 0 |
| F7 | 6 | 2 | 1 | 0 | 3 |
| **Toplam** | **88** | **33** | **36** | **16** | **3** |
