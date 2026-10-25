# Müfettiş inceleme kılavuzu

| Alan | Değer |
| --- | --- |
| Sürüm | 1.0 |
| Tarih | 2026-10-25 |
| Kimin için | Müfettiş (PR'ı inceler), Usta (bulgulara yanıt verir, birleştirir), Mimar (iletir) |
| İlgili belgeler | [AGENTS.md](../../AGENTS.md) · [ai-context.md](../ai-context.md) · [definition-of-done.md](definition-of-done.md) · [coding-guidelines.md](coding-guidelines.md) |

Bu kılavuzun amacı, güvenlik ve doğruluk düzeyini düşürmeden PR'ların daha az turda kapanmasıdır. Kural çelişkisinde `AGENTS.md` ve ilgili belge geçerlidir.

## 1. Her incelemede okunacaklar

Yalnızca şunlar okunur:

1. `docs/ai-context.md` ve bu kılavuz.
2. Görev kartından yalnızca "Kabul kriterleri", "Kararlar", "Emin olunmayan noktalar" ve "Müfettiş" satırı.
3. PR açıklaması. Usta'nın raporu, plandan sapmalar ve AC → test tablosu buradadır. Usta'nın konuşması ayrıca okunmaz.
4. PR diff'i (`gh pr diff <n>`) ve değişen dosyaların gerekli bölümleri.

Başka bir modül, ADR veya belge yalnızca diff'in etkisini anlamak için gerekiyorsa açılır, o zaman da yalnızca ilgili bölümü okunur. Tüm repo veya önceki konuşmaların tamamı yeniden okunmaz.

## 2. Aşamalar

### Aşama 1: Otomatik kontroller

- CI durumuna bakılır. 9 kontrol vardır: CI'ın 8 işi ve GitGuardian. Kırmızı iş varsa yalnızca hatalı bölüm okunur, logun tamamı okunmaz.
  - Kullanıcının bilgisayarında: `gh pr checks <n>`, `gh run view <run-id> --log-failed | tail -n 80`.
  - Bulut oturumunda GraphQL kapalıdır, bu yüzden `gh pr checks` çalışmaz. Durum için: `gh api repos/miralikazimli/b2b-platform/commits/<sha>/check-runs --jq '.check_runs[]|[.name,.conclusion]|@tsv'`. Log için GitHub MCP `get_job_logs` aracı yalnızca hatalı iş için ve son satırlarla kullanılır.
- CI'ın çalıştırdığı testler yerelde yeniden çalıştırılmaz. Yerelde yalnızca bir şüpheyi doğrulamak için hedefli tek test çalıştırılır.
- CI kırmızı olsa bile kod incelemesi aynı turda yapılır. Böylece bütün bulgular tek raporda gider.
- CI bitmeden ONAYLA verilmez. CI'ı beklemek için kısa aralıklarla sorgu yapılmaz; PR olayları izlenir.

### Aşama 2: Kod incelemesi (1. tur)

Öncelik sırası:

1. Kiracı izolasyonu ve kiracılar arası veri sızıntısı
2. RLS, kimlik doğrulama ve yetki (`@RequirePermission`/`@Public`, guard, rol, GRANT)
3. Gizli bilgi ve kişisel veri (log, audit, test dosyası)
4. Migration ve veri bütünlüğü (geri uyum, veri kaybı, eksik kısıt)
5. Para, abonelik, hak (`EntitlementService`) mantığı
6. API sözleşmesi (`openapi.yaml`, `/api/v1` kırıcı değişiklik, hata kodları)
7. İş mantığı, durum geçişleri, hata yönetimi, AC'lerin testle karşılanması

§5'teki bilinen tuzaklar listesi her turda kontrol edilir.

### Aşama 3: Hedefli yeniden inceleme (2. tur ve sonrası)

- **Zorunlu adımlar:** Kartında `Müfettiş: Zorunlu` yazan adımlarda (güvenlik, kimlik/yetki, RLS, migration) her turda PR'ın §4 riskli yollardaki **tüm** dosyaları yeniden incelenir, dokunulmamış olsalar bile. Sebep: bir migration düzeltmesi, dokunulmamış başka bir migration'daki politika veya tetikleyiciyle etkileşebilir (ör. `CREATE OR REPLACE` önceki tanımın yerine geçer). Aşağıdaki hedefli kurallar bu adımlarda yalnızca riskli yollar dışındaki dosyalar için geçerlidir.
- Bakılacak fark: `git diff <son incelenen SHA>..<yeni SHA>`. Son incelenen SHA önceki raporun başlığındadır.
- Her açık bulgunun durumu yazılır: ✅ çözüldü, ❌ açık, ↩ itiraz kabul edildi, ⚠ regresyon.
- Yeni diff'in tamamı tam derinlikte incelenir. Değişmemiş kod yeniden incelenmez.
- **Kapsam genişletme:** Yeni diff §4'teki riskli yollardan birine dokunuyorsa o dosyanın tamamı ve doğrudan çağıranları da incelenir. Yeni diff PR'ın büyük kısmını yeniden yazıyorsa, ya da geçmiş yeniden yazıldığı için önceki SHA bulunamıyorsa, 1. tur gibi tam inceleme yapılır.
- Çözülmüş bir bulgu yeniden raporlanmaz. Yeniden ortaya çıktığına dair kanıt varsa ⚠ regresyon olarak, kanıtıyla yazılır.

## 3. Bulgu biçimi ve karar

### Önem

| Önem | Ne zaman | Birleştirmeyi engeller mi |
| --- | --- | --- |
| BLOCKER | Güvenlik açığı, kiracı sızıntısı, veri kaybı, gizli bilgi, kırıcı API değişikliği, CI kırmızı | Evet |
| HIGH | Yanlış iş mantığı, AC karşılanmıyor, zorunlu test eksik (izolasyon, bekçi testi), `AGENTS.md` zorunlu kural ihlali | Evet |
| MEDIUM | Belge veya kart kodla uyuşmuyor, küçük doğruluk riski, eksik kenar durum testi | Evet (aynı turda düzeltilir) |
| LOW | Stil, isim, kapsam dışı iyileştirme önerisi | Hayır; "Öneriler" bölümüne yazılır |

### Her bulgu

| Alan | İçerik |
| --- | --- |
| No | `B1`, `H1`, `M1`, `L1`; PR boyunca aynı kalır |
| Önem | BLOCKER / HIGH / MEDIUM / LOW |
| Yer | `dosya:satır` |
| Sorun | Somut hata veya risk, tek cümle |
| Kanıt | Kod alıntısı, sorgu, test veya yeniden üretme adımı |
| Etki | Kullanıcıya veya sisteme gerçek etkisi |
| Düzeltme | Önerilen çözüm |
| Güven | Doğrulandı / Muhtemel |

Kanıtlanmamış şüphe "Muhtemel" diye yazılır. "Muhtemel" bir bulgu tek başına HIGH veya BLOCKER olamaz; önce kanıt aranır, bulunamazsa "Açık riskler" bölümüne yazılır. Güvenlik alanındaki (§2 Aşama 2, madde 1–4) ciddi bir "Muhtemel" şüphe ayrıca Mimar'a soru olarak iletilir; sessizce kalmaz.

### Karar

- **ONAYLA:** açık BLOCKER, HIGH veya MEDIUM yok ve CI tamamen yeşil. Karar o anki head SHA için verilir ve başlıkta yazılır.
- **DÜZELT:** en az bir BLOCKER, HIGH veya MEDIUM bulgu var ya da CI kırmızı. CI sonucu kararı değiştirmeyecekse (zaten DÜZELT), rapor CI bitmeden yayınlanır; Usta hemen başlayabilir.
- **KARAR GEREKLİ:** §6'daki tur sınırı aşıldı veya Usta'yla görüş ayrılığı kanıtla çözülemedi. ONAYLA sayılmaz.

### Rapor (PR'a tek yorum, turda bir kez)

```markdown
## Müfettiş — <ID> — tur <n> — <kısa SHA>

**Karar: ONAYLA | DÜZELT | KARAR GEREKLİ** · CI: <x>/9 (<kırmızı iş varsa adı>)

### 1. Engelleyici bulgular (BLOCKER, HIGH)
| No | Önem | Yer | Sorun | Kanıt | Etki | Düzeltme | Güven |

### 2. Diğer önemli bulgular (MEDIUM)
| … aynı sütunlar … |

### 3. Testler
CI sonucu bir satır; kırmızıysa hatalı adım ve ilgili 1–5 log satırı.

### 4. Açık riskler ve sonraki adımlara notlar
Birleştirmeyi engellemez. Mimar karta veya ai-context.md'ye taşır; sonraki raporlarda tekrar yazılmaz.

### 5. Birleştirmeye engel
`yok` veya bulgu numaraları.
```

2. ve sonraki turlarda rapor, 1. bölümden önce bir durum tablosu taşır: `| No | Durum | Not |`. Yalnızca yeni diff'te bulunan yeni bulgular eklenir.

Raporun dışında yazılacaklar:

- Mimar'ın sorduğu her odak noktası için tek satır sonuç ("K3: tek işlem + `FOR UPDATE`, eşzamanlılık testi var").
- "Öneriler (LOW)" bölümü varsa en fazla 3 madde.

Kullanıcıya ve Mimar'a giden mesaj raporun özetidir: karar, CI, engel listesi. Rapor tekrar anlatılmaz, aynı tur için ikinci rapor yazılmaz.

## 4. Riskli yollar

Bu yollara dokunan diff her turda genişletilmiş kapsamla incelenir (§2 Aşama 3). `Müfettiş: Zorunlu` adımlarında bu yollardaki tüm PR dosyaları her turda yeniden incelenir.

- `apps/api/drizzle/**`, `apps/api/db/**` (migration, rol, GRANT, POLICY, `SECURITY DEFINER`, tetikleyici)
- `apps/api/src/core/db/**` (`withTenantTx`, `withPlatformTx`, `withUserTx`, `withSystemTx`, check-rls)
- Kimlik ve yetki: `modules/identity/**`, guard'lar, `@RequirePermission`/`@Public`, JWT, oturum
- Log ve audit: `core/logging/**`, `core/audit/**` (kişisel veri maskeleme)
- Para, abonelik, hak: `core/money.ts`, `modules/billing/**`; sonraki fazlarda fiyat, stok, sepet bölünmesi, cari
- Sözleşme: `docs/03-architecture/api/openapi.yaml`, `packages/shared/src/errors.ts`, `core/errors/http-map.ts`
- CI ve gizli bilgi: `.github/workflows/**`, `.gitleaksignore`, `.env*` örnekleri

Otomatik testlerin geçmesi bu yollardaki incelemeyi gereksiz kılmaz.

## 5. Bilinen tuzaklar (geçmiş bulgulardan)

Usta PR açmadan önce bu listeyi kendi diff'ine uygular. Müfettiş her turda kontrol eder. Yeni bir tekrar eden bulgu çıkarsa Mimar bu listeye ekler.

| # | Kontrol | Kaynak |
| --- | --- | --- |
| T1 | Kökteki her betik `@b2b/shared`'i önce derler. Temiz klonu taklit et: `packages/shared/dist` sil, sonra `pnpm -s lint && pnpm -s typecheck`. | PR #3, #7 |
| T2 | Test dosyasında sabit anahtar, token veya parola yok; çalışma anında üretilir (`randomBytes(32).toString('hex')`). Şüphede yerelde: `docker run --rm -v "${PWD}:/repo" -w /repo ghcr.io/gitleaks/gitleaks:v8.30.1 git --redact --exit-code 1 .` | PR #19 |
| T3 | `SECURITY DEFINER` fonksiyonda `SET search_path = pg_catalog, public, pg_temp` (`pg_temp` en sonda), `REVOKE ALL … FROM PUBLIC`, `GRANT EXECUTE … TO app_user`, proconfig testi. | PR #9 |
| T4 | Koruma tetikleyicisi veya rol istisnası kapalı varsayılanlıdır: izin verilen rol adıyla yazılır (`current_user = 'migrator'`), "app_user değilse serbest" biçiminde yazılmaz. | PR #19 |
| T5 | Kullanıcı kendi satırında yalnızca izinli kolonları değiştirebilir; platformun koyduğu alanlar (durum, telefon, kilit) tetikleyiciyle korunur ve testlenir. | PR #17 |
| T6 | Elle yazılan her SQL (FK, GRANT, POLICY, `TO <rol>` politikası) için bekçi testi vardır. | PR #17, #19 |
| T7 | İzin kontrolünde kolon düzeyi izinler de sayılır (`has_any_column_privilege`). | PR #4 |
| T8 | Hata nesnesi ham loglanmaz (`message`, `params`, `detail` yok); kişisel veri, anahtar adı hangi biçimde yazılırsa yazılsın (snake/camelCase) maskelenir. | PR #7, #15 |
| T9 | Kartın "Kararlar" ve "Emin olunmayan noktalar" bölümleri ile `data-model.md` kodla aynıdır. | PR #4, #17, #18 |

## 6. Müfettiş ile Usta döngüsü

1. Müfettiş bulguları tek raporla PR'a yazar (§3).
2. Usta bütün bulguları tek seferde ele alır ve PR'a tek yorum yazar:

   ```markdown
   ## Bulgu yanıtı — tur <n>
   | No | Durum | Commit | Not / kanıt |
   | B1 | düzeltildi | abc1234 | … |
   | M1 | itiraz | — | <belge bölümü, test veya çıktı> |
   ```

3. Müfettiş yalnızca şunlara bakar: düzeltme sorunu çözüyor mu, yeni diff bir regresyon getiriyor mu (§2 Aşama 3).
4. **İtiraz:** Müfettiş yeni bir tam inceleme başlatmaz, yalnızca Usta'nın gösterdiği kanıtı doğrular. Ya bulguyu kapatır (↩) ya da karşı kanıtla korur. İkinci kez anlaşılamazsa karar belgeye göre Mimar'dadır; belgede yoksa kullanıcıya sorulur.
5. **Tur sınırı:** Aynı bulgu için en fazla iki düzeltme turu yapılır. Üçüncü turda hâlâ açıksa karar KARAR GEREKLİ olur. Müfettiş sorunu ve kanıtı Mimar'a yazar, Mimar kullanıcıdan karar ister. Kritik bir sorun çözülmeden inceleme başarılı sayılmaz.
7. **Doğrudan döngü:** Müfettiş incelediği PR'ın olaylarına abone olur; yeni push ve CI sonucu onu uyandırır, Mimar'ın aktarmasını beklemez. Usta bulguyu PR yorumundan okur, yanıtı PR'a yazar. Mimar yalnızca ilk inceleme isteğini ve son kararı (ONAYLA / KARAR GEREKLİ) alır ([speed-and-tokens.md](speed-and-tokens.md) H4).
8. **Yeni mimari sorun:** Adımın kapsamını aşan bir sorun BLOCKER değilse bu PR'da çözülmez; "Açık riskler" bölümüne yazılır, Mimar ayrı kart açar. BLOCKER ise DÜZELT kararıyla raporlanır ve kapsam sorusu Mimar'a iletilir.

## 7. Birleştirme kapısı (Usta)

Usta yalnızca aşağıdakilerin hepsi doğruysa birleştirir:

1. Müfettiş'in son yorumu **ONAYLA** ve başlıktaki SHA, PR'ın şu anki head SHA'sı (`gh pr view <n> --json headRefOid`). ONAYLA'dan sonra yeni push gelmişse onay geçersizdir ve yeniden inceleme gerekir.
2. `gh pr checks <n>`: 9/9 yeşil.
3. Çakışma yok (`gh pr view <n> --json mergeable` → `MERGEABLE`).
4. Komut: `gh pr merge <n> --squash`. `--merge` veya `--rebase` kullanılmaz.

Biri eksikse birleştirme yapılmaz, Mimar'a yazılır.

## 8. Hızlı yol

Diff yalnızca belge veya yapılandırmaysa, §4'teki riskli yollara dokunmuyorsa ve 30 satırı geçmiyorsa inceleme tek turdur. Rapor yalnızca karar, CI ve varsa bulgu tablosundan oluşur. Riskli bir yola dokunan küçük bir değişiklik (ör. `.gitleaksignore`) hızlı yoldan geçmez; normal kurallar uygulanır.

## 9. Bağlam

- Müfettiş her faz için, ya da bir konuşmada yaklaşık 8 PR incelendikten sonra, yeni konuşmada başlar. Önceki konuşmadan yalnızca `ai-context.md` ve açık PR'ların son raporu taşınır.
- Açık riskler ve sonraki adımlara notlar PR yorumunda bir kez yazılır; Mimar bunları karta veya `ai-context.md`'ye taşır.
- Büyük log ve test çıktıları aktarılmaz; yalnızca hatalı bölüm alıntılanır.
