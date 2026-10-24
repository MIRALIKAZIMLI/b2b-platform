# Gözlem: Loglar, Metrikler, Alarmlar

| Alan | Değer |
| --- | --- |
| Sürüm | 1.0 |
| Tarih | 2026-10-24 |
| İlgili belgeler | [non-functional-requirements.md](../02-requirements/non-functional-requirements.md) · [runbook.md](runbook.md) · [integrations.md](../03-architecture/integrations.md) |

Bütçe (100 USD/ay) ve tek kişilik operasyon nedeniyle gözlem yığını **küçük ve ücretsiz katmanlı** tutulur. Ayrı bir Prometheus/Grafana/ELK kurulmaz.

| İhtiyaç | Araç | Maliyet |
| --- | --- | --- |
| Hata takibi ve istek performansı | Sentry (ücretsiz plan), `ErrorReporter` adaptörü | 0 |
| Erişilebilirlik (uptime) | Harici uptime izleyici (ücretsiz plan), 1 dk aralık | 0 |
| Sunucu CPU, bellek, disk, ağ | Lightsail yerleşik metrikleri ve metrik alarmları | Dahil |
| Veritabanı CPU, bağlantı, disk | Lightsail veritabanı metrikleri ve alarmları | Dahil |
| Uygulama metrikleri (iş ve kuyruk) | `GET /api/internal/metrics` (yalnızca iç ağ) + worker'ın 5 dakikada bir yazdığı `ops_metrics` tablosu + platform admin "Sistem" ekranı | 0 |
| Loglar | JSON loglar → Docker log sürücüsü (dönüşümlü dosya) + yalnızca `warn` ve üstü Sentry'ye | 0 |
| Bildirim kanalı | E-posta + platform admininin mobil uygulamasına push | 0 |

📌 VARSAYIM: Sentry ve harici uptime izleyicinin ücretsiz planları pilot hacmine yeter. Aşılırsa Sentry örnekleme oranı düşürülür (`tracesSampleRate`). `ops_metrics` tablosu ve `/api/internal/metrics` uç noktası veri modeline ve backlog F6.7 adımına eklenir.

## 1. Loglar

### 1.1 Biçim

Tüm süreçler tek satır JSON log yazar (pino). Zorunlu alanlar:

| Alan | Açıklama |
| --- | --- |
| `time` | ISO 8601 UTC |
| `level` | `debug` / `info` / `warn` / `error` / `fatal` |
| `service` | `api` / `worker` / `web` |
| `env` | `APP_ENV` |
| `requestId` | Her HTTP isteğinde; yanıtta `X-Request-Id` başlığıyla döner; hata yanıtında `requestId` alanı |
| `userId`, `businessId` | Kimliği doğrulanmış isteklerde |
| `route`, `method`, `status`, `durationMs` | HTTP erişim logu |
| `job`, `queue`, `attempt` | Worker işleri |
| `event` | Kısa makine okunur ad (ör. `connection.request_created`) |
| `err` | Hata nesnesi (mesaj + yığın); yalnızca sunucu logunda |

### 1.2 Ne loglanmaz (NFR-66)

OTP kodu, JWT, yenileme anahtarı, TOTP sırrı, API anahtarları, istek gövdesinin tamamı, `person_data` alanları. Telefon numaraları maskelenir: `+99450***4567`. Bu kurallar logger'daki `redact` listesiyle zorlanır ve testlenir.

### 1.3 Saklama

Docker log dosyaları sunucuda 7 gün döner (dosya başına 50 MB, en fazla 10 dosya). Sentry'deki olaylar plan süresince. 30 günlük saklama hedefi (NFR-67) için günlük log arşivi gece sıkıştırılıp R2 `private` bucket'ına `logs/<tarih>.jsonl.gz` olarak yüklenir ve 30 günden eskiler silinir.

## 2. Metrikler

### 2.1 Teknik metrikler

| Metrik | Kaynak | Hedef / eşik |
| --- | --- | --- |
| API p95 / p99 yanıt süresi (rota grubuna göre) | Sentry performans + erişim logu | NFR-10–16 |
| HTTP 5xx oranı | Erişim logu → `ops_metrics` | < %0,5 / saat |
| HTTP 429 oranı | Erişim logu | Bilgi amaçlı (kazıma tespiti) |
| Sunucu CPU / bellek / disk | Lightsail | CPU < %70 ort., bellek < %85, disk < %80 |
| Veritabanı CPU / bağlantı / disk | Lightsail DB | CPU < %70, bağlantı < %80 limit, disk < %80 |
| Kuyruk uzunluğu ve en eski iş yaşı | BullMQ | En eski bekleyen iş < 5 dk |
| Başarısız iş sayısı | BullMQ `failed` | 0 hedef |
| İşlenmemiş outbox olayı sayısı ve en eskisinin yaşı | `outbox_events` | En eski < 2 dk |
| "Ölü" outbox olayı (10 başarısız deneme) | `outbox_events` | 0 |
| Zamanlanmış işin son başarılı çalışması | `ops_metrics` | ≤ 15 dk önce (NFR-21) |
| Meilisearch indeks belge sayısı ↔ veritabanı | Gece kontrol işi | Fark < %0,5 |

### 2.2 İş metrikleri (KPI ve kötüye kullanım)

| Metrik | KPI / risk |
| --- | --- |
| Günlük gönderilen OTP SMS sayısı ve tahmini maliyet | RISK-07, TM-02 |
| Günlük bağlantı isteği, kabul ve red sayısı; toptancı bazında engellenme oranı | KPI-01, TM-11 |
| Kayıtlı, bağlantılı ve bağlantısız perakendeci sayısı (aşamalara göre) | KPI-11, RISK-03 |
| Günlük sipariş sayısı, toplam tutar (para birimine göre) | KPI-02 |
| Bağlantı → ilk sipariş medyan süresi | KPI-03 |
| Düzenlenen / kısmi onaylanan sipariş oranı | KPI-04 |
| Perakendeci onayı / otomatik onay / itiraz oranı | KPI-05, KPI-06 |
| Kullanıcı başına dizin araması (dakika) | TM-09 |

İş metrikleri platform admin dashboard'unda görünür ([user-stories.md](../02-requirements/user-stories.md) US-056).

## 3. Alarmlar

| # | Alarm | Koşul | Önem | Kanal | Runbook |
| --- | --- | --- | --- | --- | --- |
| AL-01 | API erişilemiyor | Uptime: `/api/health` 2 ardışık kontrolde başarısız | Kritik | E-posta + push | RB-01 |
| AL-02 | Web erişilemiyor | Uptime: ana sayfa 2 ardışık kontrolde başarısız | Kritik | E-posta + push | RB-01 |
| AL-03 | 5xx artışı | Son 10 dk'da 5xx > %2 veya > 20 istek | Yüksek | E-posta + push | RB-01 |
| AL-04 | Veritabanı | CPU > %85 (10 dk) veya disk > %80 veya bağlantı hatası | Yüksek | E-posta | RB-02 |
| AL-05 | Sunucu kaynağı | Bellek > %90 (10 dk) veya disk > %85 | Yüksek | E-posta | RB-02 |
| AL-06 | Kuyruk takıldı | En eski bekleyen iş > 10 dk veya `failed` > 10 / saat | Yüksek | E-posta | RB-06 |
| AL-07 | Outbox | En eski işlenmemiş olay > 5 dk veya herhangi bir "ölü" olay | Yüksek | E-posta | RB-06 |
| AL-08 | Zamanlanmış iş | Süre dolumu / otomatik onay işi 30 dk'dır çalışmadı | Yüksek | E-posta | RB-06 |
| AL-09 | SMS hacmi | Günlük SMS > 300 (uyarı); `sms.daily_cap` doldu (kritik) | Yüksek / Kritik | E-posta + push | RB-09 |
| AL-10 | SMS sağlayıcı hatası | Son 15 dk'da gönderimlerin > %20'si başarısız | Yüksek | E-posta + push | RB-09 |
| AL-11 | Kimlik kötüye kullanımı | Bir IP'den saatte > 100 OTP isteği veya > 50 kilit | Orta | E-posta | RB-12 |
| AL-12 | Dizin kazıma şüphesi | Bir toptancının günlük dizin araması > 500 | Orta | E-posta | RB-11 |
| AL-13 | Yüksek engellenme oranı | Bir toptancının engellenme oranı > `connection.block_rate_alert_pct` | Orta | E-posta | — (moderasyon) |
| AL-14 | Bütçe | AWS Budgets 70 USD (uyarı), 90 USD (kritik) | Orta / Yüksek | E-posta | RB-10 |
| AL-15 | Yedek | Günlük otomatik yedek başarısız | Yüksek | E-posta | RB-08 |
| AL-16 | Arama indeksi sapması | Gece kontrolünde fark > %0,5 | Düşük | E-posta | RB-05 |
| AL-17 | Gizli bilgi taraması | CI'da bulgu | Kritik | GitHub bildirimi | RB-07 |

**Önem tanımı ve tepki süresi** (tek kişilik operasyon; iş saatleri: [project-charter.md](../01-discovery/project-charter.md) A-04):

| Önem | İş saatlerinde ilk tepki | İş saatleri dışında |
| --- | --- | --- |
| Kritik | ≤ 15 dk | En iyi çaba; en geç sonraki iş günü başlangıcı |
| Yüksek | ≤ 1 saat | Sonraki iş günü başlangıcı |
| Orta / Düşük | Aynı iş günü | Sonraki iş günü |

**Alarm yorgunluğu kuralı:** Bir alarm bir ayda 3 kez "yanlış alarm" olarak kapatılırsa eşiği gözden geçirilir. Her alarmın bir runbook adımı olmalıdır; adımı olmayan alarm eklenmez.
