# Runbook

| Alan | Değer |
| --- | --- |
| Sürüm | 1.0 |
| Tarih | 2026-10-24 |
| İlgili belgeler | [observability.md](observability.md) (alarmlar) · [environments-cicd.md](environments-cicd.md) · [infrastructure.md](../03-architecture/infrastructure.md) |

Her senaryo aynı biçimdedir: **Belirti → İlk 5 dakika → Adımlar → Doğrulama → Sonrası.** Komutlar sunucuda `/opt/app` dizininde çalıştırılır. Komutların gerçek hali F6.7 adımında betik olarak (`/opt/app/scripts/`) yazılır ve bu belge o betik adlarıyla güncellenir.

📌 VARSAYIM: Aşağıdaki betik adları (`deploy.sh`, `rollback.sh`, `reindex.sh` vb.) hedeflenen adlardır; F6.7'de oluşturulur.

**Genel kurallar**

1. Önce durumu kaydet: olay başlangıç saati, alarm, ilk gözlem → `docs/incidents/<tarih>-<kısa-ad>.md`.
2. Veri silen veya geri yükleyen bir adımdan önce **mevcut durumun anlık görüntüsü alınır** (veritabanı manuel snapshot).
3. Production'da doğrudan SQL ile veri değiştirilmez; zorunluysa işlem içinde, önce `SELECT` ile etkilenen satır sayısı doğrulanarak ve audit notuyla yapılır.
4. Kullanıcıları etkileyen bir kesinti 15 dakikayı aşarsa pilot toptancı sahiplerine kısa bilgi verilir (WhatsApp/telefon).

## Senaryo dizini

| # | Senaryo | Alarm |
| --- | --- | --- |
| RB-01 | API veya web erişilemiyor / 5xx artışı | AL-01, AL-02, AL-03 |
| RB-02 | Veritabanı veya sunucu kaynak sorunu | AL-04, AL-05 |
| RB-03 | Hatalı dağıtımı geri alma | Duman testi başarısız, kullanıcı bildirimi |
| RB-04 | Uygulama sunucusunu sıfırdan yeniden kurma | Sunucu kaybı |
| RB-05 | Arama indeksini yeniden oluşturma | AL-16, arama sonuçları eksik |
| RB-06 | Kuyruk, outbox veya zamanlanmış iş takıldı | AL-06, AL-07, AL-08 |
| RB-07 | Gizli bilgi sızıntısı ve anahtar döndürme | AL-17, şüphe |
| RB-08 | Veritabanını geri yükleme (PITR) ve aylık geri yükleme provası | AL-15, veri bozulması |
| RB-09 | SMS hacmi anormal veya SMS sağlayıcısı çalışmıyor | AL-09, AL-10 |
| RB-10 | Aylık maliyet incelemesi ve bütçe alarmı | AL-14, takvim |
| RB-11 | Kiracı veri sızıntısı şüphesi / dizin kazıma şüphesi | AL-12, kullanıcı şikayeti |
| RB-12 | Kullanıcı giriş yapamıyor (OTP) / kimlik kötüye kullanımı | Destek talebi, AL-11 |
| RB-13 | Planlı bakım | Takvim |

---

## RB-01 — API veya web erişilemiyor / 5xx artışı

**Belirti:** Uptime alarmı; kullanıcılar uygulamanın açılmadığını bildiriyor; 5xx oranı yüksek.

**İlk 5 dakika**

1. Cloudflare durum sayfasını ve AWS Lightsail durumunu kontrol et (sağlayıcı kaynaklı mı?).
2. `curl -s https://api.<alan>/api/health` — yanıt var mı, hangi bağımlılık başarısız?
3. Sunucuya SSH: `docker compose ps` — hangi container durmuş veya yeniden başlıyor?

**Adımlar**

| Bulgu | Eylem |
| --- | --- |
| `api` veya `web` container durmuş / sürekli yeniden başlıyor | `docker compose logs --tail=200 api` → hata. Son dağıtımdan sonra başladıysa **RB-03**. Yapılandırma hatasıysa (eksik değişken) SSM'deki değeri düzelt, `./deploy.sh <mevcut-sha>`. |
| `/api/health` veritabanını başarısız gösteriyor | **RB-02** |
| `/api/health` Redis'i başarısız gösteriyor | `docker compose restart redis`; kuyruklar outbox'tan yeniden üretilir (RB-06 doğrulaması) |
| Container'lar sağlıklı ama dışarıdan erişim yok | Caddy logu; Cloudflare DNS ve origin sertifikası; sunucu güvenlik duvarında 443'ün Cloudflare IP'lerine açık olduğu |
| Sunucu yanıt vermiyor (SSH yok) | Lightsail konsolundan yeniden başlat; 10 dk içinde gelmezse **RB-04** |

**Doğrulama:** `/api/health` 200; web giriş sayfası açılıyor; Sentry'de yeni hata yok; 5xx oranı < %0,5.

**Sonrası:** Olay notu; kök neden; gerekiyorsa alarm veya test eklenir.

## RB-02 — Veritabanı veya sunucu kaynak sorunu

**Belirti:** AL-04 / AL-05; yavaş yanıtlar; bağlantı hataları.

**Adımlar**

1. Lightsail DB metrikleri: CPU, bağlantı sayısı, disk.
2. Uzun süren sorgular: `readonly` rolüyle `SELECT pid, now()-query_start AS dur, state, left(query,120) FROM pg_stat_activity WHERE state <> 'idle' ORDER BY dur DESC LIMIT 20;`
3. 5 dakikadan uzun ve uygulamaya ait olmayan bir sorgu varsa `SELECT pg_cancel_backend(<pid>);`
4. Bağlantı sayısı limite yakınsa: `api` ve `worker` bağlantı havuzu ayarlarını kontrol et (`DB_POOL_MAX`); sızıntı şüphesinde `docker compose restart api worker`.
5. Disk > %80: büyüyen tabloları bul (`pg_total_relation_size`); `outbox_events` (işlenmiş, 30 günden eski), `otp_challenges` (7 günden eski), `ops_metrics` (90 günden eski) temizlik işlerinin çalıştığını doğrula. Gerekirse veritabanı planını büyüt.
6. Sunucu belleği > %90: `docker stats` — Meilisearch mi, Node süreçleri mi? Geçici çözüm ilgili container'ı yeniden başlatmak; kalıcı çözüm bir üst plan ([infrastructure.md](../03-architecture/infrastructure.md) §6).

**Doğrulama:** Metrikler eşiğin altında; p95 yanıt süreleri NFR hedeflerinde.

## RB-03 — Hatalı dağıtımı geri alma

**Belirti:** Duman testi başarısız; dağıtımdan sonra hata artışı; kritik bir akış bozuk.

**Adımlar**

1. Önceki sağlıklı SHA'yı bul: `cat /opt/app/releases.log | tail -5`.
2. `./rollback.sh <önceki-sha>` → `docker compose up -d` önceki imajlarla.
3. Migration geri alınmaz (migration'lar geriye uyumludur — [environments-cicd.md](environments-cicd.md) §4 kural 2). Yeni migration eski kodla uyumsuzsa: bu bir süreç hatasıdır; önce RB-08 kararını değerlendir, uygulamadan önce anlık görüntü al.
4. Mobil OTA güncellemesi sorunluysa: Expo Updates'te önceki güncellemeyi yeniden yayınla.

**Hedef süre:** ≤ 10 dk (NFR-88).

**Doğrulama:** `/api/health` 200; sorunlu akış staging'deki gibi çalışıyor.

**Sonrası:** Hatalı SHA için `fix/` dalı; hatayı yakalayacak testi ekle.

## RB-04 — Uygulama sunucusunu sıfırdan yeniden kurma

**Belirti:** Sunucu kayboldu veya kurtarılamıyor. Veritabanı ayrıdır ve etkilenmez.

**Adımlar** (hedef ≤ 30 dk)

1. Lightsail'de aynı planla yeni sunucu oluştur (`eu-central-1`); statik IP'yi yeni sunucuya bağla (DNS değişmez).
2. Güvenlik duvarı: 443 yalnızca Cloudflare IP'leri, 22 yalnızca yönetici IP'si.
3. Kurulum betiği: `curl` ile değil, depodaki `infra/bootstrap.sh` dosyasını sunucuya kopyalayıp çalıştır (Docker, Docker Compose, `deploy` kullanıcısı, SSH anahtarları).
4. `/opt/app` içine `docker-compose.prod.yml`, `Caddyfile`, betikleri kopyala (depodaki `infra/` klasöründen).
5. Veritabanı erişim listesine yeni sunucuyu ekle.
6. `./deploy.sh <son-sağlıklı-sha>` (SSM'den gizli bilgileri okur).
7. Meilisearch boş açılır → **RB-05**.

**Doğrulama:** RB-01 doğrulaması + arama çalışıyor + zamanlanmış işler çalışıyor (`ops_metrics` son çalışma zamanı).

## RB-05 — Arama indeksini yeniden oluşturma

**Belirti:** AL-16; perakendeci ürün bulamıyor; dizinde eksik kayıt; sunucu yeniden kuruldu.

**Adımlar**

1. `docker compose exec worker node dist/cli.js search:reindex --index=products` (ve `--index=buyer_directory`).
2. İş, yeni bir geçici indekse yazar ve bitince indeksleri yer değiştirir (arama kesintisiz).

**Hedef süre:** ≤ 15 dk (100.000 varyant).

**Doğrulama:** Gece kontrolündeki belge sayısı farkı < %0,5; örnek arama ("şampun" / "шампунь").

## RB-06 — Kuyruk, outbox veya zamanlanmış iş takıldı

**Belirti:** Bildirimler gelmiyor; otomatik onay çalışmıyor; AL-06 / AL-07 / AL-08.

**Adımlar**

1. `docker compose ps worker` — çalışıyor mu? Değilse `docker compose logs --tail=200 worker`.
2. Redis erişilebilir mi? (`docker compose exec redis redis-cli ping`)
3. Outbox: `SELECT count(*), min(created_at) FROM outbox_events WHERE processed_at IS NULL;`
4. "Ölü" olaylar (`attempts >= 10`): `last_error` incelenir. Hata düzeltildikten sonra: `docker compose exec worker node dist/cli.js outbox:retry --dead`.
5. BullMQ `failed` işleri: `node dist/cli.js queue:failed --queue=<ad>` ile listele; neden düzeldiyse `queue:retry`.
6. Zamanlanmış iş kilidi takıldıysa (worker çöktü, kilit kaldı): kilidin TTL'i 20 dk'dır; beklenemiyorsa `node dist/cli.js scheduler:unlock --job=<ad>`.
7. Kaçırılan otomatik onaylar ve süre dolumları: iş tekrar çalıştığında geriye dönük işler (koşul `auto_confirm_at < now()`), ayrıca bir şey gerekmez.

**Doğrulama:** İşlenmemiş outbox olayı yaşı < 2 dk; `failed` kuyruğu boş; `ops_metrics` son çalışma ≤ 15 dk.

## RB-07 — Gizli bilgi sızıntısı ve anahtar döndürme

**Belirti:** CI gizli bilgi taraması bulgusu; bir anahtarın sohbete, loga veya depoya yazıldığı fark edildi.

**Adımlar** (sızan anahtar türüne göre; hepsinde önce **iptal**, sonra temizlik)

| Anahtar | Eylem |
| --- | --- |
| R2 erişim anahtarı | Cloudflare'de anahtarı iptal et, yenisini oluştur, SSM'yi güncelle, `./deploy.sh <mevcut-sha>` |
| SMS / Expo / Sentry anahtarı | Sağlayıcı panelinde iptal + yeni anahtar → SSM → yeniden dağıt |
| `JWT_SIGNING_KEY` | Yeni anahtarı `JWT_KEY_ID` ile ekle (iki anahtar dönemi); dağıt; 15 dk sonra eski anahtarı kaldır. Kötüye kullanım şüphesi varsa tüm oturumları iptal et: `node dist/cli.js sessions:revoke-all` |
| Veritabanı parolası | Lightsail'de parolayı değiştir → SSM → yeniden dağıt |
| `MEILI_MASTER_KEY` | Yeni anahtar → SSM → Meilisearch ve uygulamayı yeniden başlat → RB-05 |
| GitHub / AWS hesap kimlik bilgisi | Hemen değiştir; oturumları kapat; 2FA doğrula; son 7 günün erişim loglarını incele |

Depoya giren gizli bilgi için: anahtar iptal edildikten sonra git geçmişinden temizlenir. **Silmek iptalin yerine geçmez.**

**Sonrası:** Olay notu; sızıntının nasıl olduğu ve tekrarını önleyen kural ([coding-guidelines.md](../07-ai-development/coding-guidelines.md)).

## RB-08 — Veritabanını geri yükleme (PITR) ve aylık prova

**Ne zaman:** Veri bozulması veya yanlışlıkla silme; ayda bir prova (NFR-36).

**Gerçek olayda adımlar**

1. Uygulamayı bakım moduna al: `settings` → `system.maintenance = true` (mobil `app-config` bakım ekranı gösterir; web bakım sayfası).
2. Mevcut veritabanının manuel anlık görüntüsünü al.
3. Lightsail'de olaydan hemen önceki zamana **yeni bir veritabanı** olarak geri yükle (mevcut veritabanının üzerine yazma).
4. Yeni veritabanında kontrol sorgularıyla verinin doğru olduğunu doğrula (sipariş, cari sayıları ve son kayıt zamanları).
5. `DATABASE_URL` değerlerini SSM'de yeni veritabanına çevir → `./deploy.sh <mevcut-sha>`.
6. Geri yükleme noktası ile olay anı arasındaki kayıtlar kaybolur: etkilenen işletmeleri `audit_logs` ve eski veritabanından belirle, onlara bilgi ver.
7. RB-05 (arama indeksi), sonra bakım modunu kapat.

**Hedef:** RPO ≤ 5 dk, RTO ≤ 4 saat (NFR-33, NFR-34).

**Aylık prova:** Adım 3'ü staging için yap (production yedeğinden değil, staging yedeğinden); süreyi ölç; sonucu `docs/incidents/restore-drill-<tarih>.md` dosyasına yaz.

## RB-09 — SMS hacmi anormal veya SMS sağlayıcısı çalışmıyor

**Belirti:** AL-09 (hacim) veya AL-10 (hata oranı); kullanıcılar kod alamıyor.

**Anormal hacim (pompalama şüphesi)**

1. `ops_metrics` ve loglarda OTP isteklerinin IP ve numara öneki dağılımına bak.
2. `sms.daily_cap` geçici olarak düşür (ör. 200).
3. Saldırgan IP'lerini Cloudflare'de engelle; gerekirse kayıt ve OTP uçlarında Cloudflare bot koruması zorluk seviyesini artır.
4. `sms.allowed_country_codes` yalnızca `+994` olduğunu doğrula.
5. Sağlayıcı panelinde gerçekleşen maliyeti kontrol et.

**Sağlayıcı arızası**

1. Sağlayıcı durum sayfası.
2. Hata devam ediyorsa ve ikinci sağlayıcı yapılandırılmışsa `SMS_PROVIDER` değiştir → yeniden dağıt.
3. Mevcut oturumlar etkilenmez (yenileme anahtarı 30 gün); yalnızca yeni girişler etkilenir. Pilot toptancılara bilgi ver.

**Doğrulama:** Test numarasına OTP ulaşıyor; hata oranı < %5.

## RB-10 — Aylık maliyet incelemesi ve bütçe alarmı

**Ne zaman:** Her ayın ilk iş günü; AL-14 alarmında hemen.

1. AWS Cost Explorer: servis bazında bu ay ve geçen ay.
2. Cloudflare R2 kullanımı (depolama, işlem sayısı).
3. SMS sağlayıcı faturası.
4. [non-functional-requirements.md](../02-requirements/non-functional-requirements.md) §8 bütçe tablosuyla karşılaştır.
5. Sapma > %20 olan kalem için neden ve eylem: staging açık mı kaldı? Beklenmeyen veri çıkışı? SMS hacmi?
6. Sonucu `docs/reports/cost-<yyyy-mm>.md` dosyasına yaz.

## RB-11 — Kiracı veri sızıntısı şüphesi / dizin kazıma şüphesi

**Belirti:** Kullanıcı başka bir işletmenin verisini gördüğünü bildiriyor; AL-12.

**Veri sızıntısı şüphesi (en yüksek öncelik)**

1. Bildirimi ayrıntılı kaydet: kim, hangi ekran, hangi veri, saat, ekran görüntüsü.
2. İlgili uç noktayı ve `requestId`'yi loglardan bul.
3. Sızıntı doğrulanırsa: ilgili uç noktayı özellik bayrağı veya hızlı düzeltmeyle hemen kapat (gerekirse RB-03 ile geri al).
4. Etkilenen kayıtları ve işletmeleri `audit_logs` ve erişim loglarından belirle.
5. Kök nedeni bul; izolasyon testi ekle; düzelt; Müfettiş incelemesi.
6. Etkilenen işletmelere bilgi ver; hukuk danışmanının belirttiği bildirim yükümlülüklerini uygula.

**Kazıma şüphesi**

1. İlgili toptancı kullanıcısının arama desenine bak (sayfa sayısı, aralıklar).
2. Kullanıcının dizin hız sınırını `settings` ile düşür veya hesabı geçici askıya al.
3. Toptancı sahibiyle görüş; tekrarında `seller` yeteneğini askıya al.

## RB-12 — Kullanıcı giriş yapamıyor (OTP) / kimlik kötüye kullanımı

| Kontrol | Eylem |
| --- | --- |
| Numara kilitli mi? (`otp_challenges` son 15 dk'da 5 yanlış) | Kullanıcıya 15 dk sonra denemesini söyle; kötüye kullanım yoksa kilidi `node dist/cli.js otp:unlock --phone=<E.164>` ile kaldır |
| SMS ulaşmıyor | Sağlayıcı teslim raporu; operatöre özel sorun → RB-09 |
| Kullanıcı `locked`/`deleted` | Platform admini durumu inceler |
| Telefon numarası değişti | MVP'de numara değişikliği platform admini tarafından kimlik doğrulamasıyla yapılır (işletme admininin teyidiyle) |
| Bir IP'den çok sayıda deneme (AL-11) | Cloudflare'de IP engeli; RB-09 hacim adımları |

## RB-13 — Planlı bakım

1. Bakım penceresi: Asia/Baku 02:00–05:00 (NFR-32).
2. En az 24 saat önce: platform admin "duyuru" ayarıyla uygulama içi bildirim.
3. Başlangıçta `system.maintenance = true` (yalnızca kesinti gerektiren işlerde).
4. İş bitince duman testi (RB-01 doğrulaması), bakım modunu kapat.
5. Bakım notu `docs/incidents/maintenance-<tarih>.md`.
