# Hız ve token kuralları

Bu belge, F1 boyunca ölçülen zaman ve token kayıplarından çıkan kuralları toplar. Kurallar `AGENTS.md` "Token ve süre kuralları" ile birlikte uygulanır; çelişki olursa bu belge değil `AGENTS.md` güncellenir ve çelişki bildirilir.

## 1. Neden (ölçüm, 2026-10-25)

F1.8a + F1.8b toplam 5 saat sürdü (10:36 → 15:36). Dağılım:

| Kalem | Süre | Kanıt |
| --- | --- | --- |
| Kullanım limiti beklemesi | 3 sa 16 dk | Usta F1.8a: 10:49 limit → 14:05 tekrar çevrimiçi |
| Bilgisayar bağlantısı koptu | 12 dk | 14:38 `worker_lost` → 14:50 |
| Yerelde tam entegrasyon takımı | ~16 dk | "entegrasyon 386/386"; token kuralı 5'e aykırı |
| Birleştirme beklemesi ve yanlış anlaşılma | ~16 dk | #23 ONAYLA 14:36 → birleşme 14:53; ikinci Usta açılıp durduruldu |
| Kodlama + plan | ~55 dk | |
| Müfettiş incelemeleri | ~13 dk | #23 tek tur 3,5 dk; #24 iki tur 9,6 dk |

Önceki adımlarda da aynı desen görüldü: F1.5a'da bilgisayar 1 sa 26 dk çevrimdışı kaldı, Usta yerelde tüm takımı çalıştırdı (513 ve 547 test).

PR #21 sonrası inceleme hızlandı (iki tur 12–20 dk → 9,6 dk). Darboğaz artık Usta tarafı, kullanım limiti ve bağlantı. Token fazla harcandığında limit dolar ve iş saatlerce durur; bu yüzden token tasarrufu doğrudan süre tasarrufudur. Konuşma başına token ölçülemedi (toplam 278M, cache %98).

## 1b. Ölçüm (2026-10-31, proje kullanım raporu)

46 konuşma, toplam **783M token**; %98'i önbellekten yeniden okuma, model çıktısı yalnızca 2,6M (her yazılan token'a ~296 okunan). Tamamı Opus.

| Rol | Pay | Not |
| --- | --- | --- |
| Usta | %69 (~543M) | En pahalı: F1.5a konuşması 147M (tek konuşmada 4 iş) |
| Müfettiş | %19 (~149M) | Bunun 95M'si 18 PR'lık ilk Müfettiş konuşması |
| Plan ve kart | %8 (~63M) | 9 saat açık kalan F1 plan konuşması 43M |
| Mimar (proje sohbeti) | %0,5 (3,9M) | Aktarım ucuz |

H1–H7 sonrası Usta adım başına ~%22 ucuzladı (~35M → ~28M), ama 1.000 elle yazılmış satır başına maliyet değişmedi (~16,7M). Müfettiş turlarının yaklaşık yarısı mekanik (CI `typecheck`/`lint` kırmızı) veya kod değişikliği gerektirmeyen bulgu yüzünden açıldı (PR #29, #31, #33, #37). `docs/ai-context.md` 13,7 KB'tan 26,7 KB'a büyüdü. Ayrıntı: proje dosyası `retrospektif/2026-10-31.md`.

## 2. Kurallar

| # | Kural | Kim | Ayrıntı |
| --- | --- | --- | --- |
| H1 | **Yerel test dar tutulur.** Yalnızca değişen modülün birim testleri, gerekiyorsa yalnızca o modülün entegrasyon testleri, `lint` ve `typecheck`. Tam takım (`pnpm test`, `test:integration`, `test:isolation`, `build`) yerelde çalışmaz; CI çalıştırır. | Usta | Kartın "Yerel kontrol" bölümü komutu verir (§3). |
| H2 | **Bir Usta konuşması = bir adım ya da bir a/b çifti.** Sonraki adım yeni Usta konuşmasında başlar; yalnızca `ai-context.md` ve kart okunur. Aynı bilgisayarda aynı anda tek Usta çalışır. | Mimar | Uzun konuşmada her turda tüm geçmiş yeniden okunur. |
| H3 | **Bilgisayar uyumaz.** Usta çalışırken bilgisayar prize takılı ve uyku kapalı; mümkünse kablolu internet. | Kullanıcı | Windows: Ayarlar → Sistem → Güç ve pil → Ekran ve uyku → "Prize takılıyken uyku" = Hiçbir zaman. |
| H4 | **Müfettiş–Usta döngüsü doğrudan.** Müfettiş PR olaylarına abone olur ve yeni push ile uyanır; Usta bulguyu PR yorumundan okur ve yanıtı PR'a yazar. Mimar yalnızca ilk inceleme isteğini ve son kararı (ONAYLA / KARAR GEREKLİ) görür. | Müfettiş, Usta | `review-guide.md` §6 madde 7. |
| H5 | **Seyrek durum güncellemesi.** İlerleme kartı yalnızca adım sınırında güncellenir (plan, kod, yerel kontrol, PR, CI; en fazla ~6 kez). Kullanıcıya mesaj yalnızca PR açılınca, karar gerekince ve iş bitince. | Herkes | Her güncelleme bir tur daha demektir. |
| H6 | **Limit izlenir.** Bir adımda yine limite takılınca Mimar bunu kullanıcıya bildirir ve ölçüm tablosuna (§4) yazar. Tekrarlarsa plan yükseltmesi kullanıcıya seçenek olarak sunulur (karar ve maliyet kullanıcınındır). | Mimar | |
| H7 | **PR elle yazılmış ~2.000 satırı geçmez.** Üretilmiş dosyalar (`schema.d.ts`, `drizzle/meta/*.json`, `pnpm-lock.yaml`) sayılmaz. Usta plan aşamasında bu sınırın aşılacağını görürse adımı `<ID>a`/`<ID>b` diye bölmeyi önerir; karar Mimar'ın. | Usta, Mimar | F1.10–F1.12 PR'ları ~6.600 satırdı; üretilmiş dosyalar çıkınca elle yazılan 640–2.760 satır kaldı. Küçük PR, Müfettiş'in ilk turunu ucuzlatır. |
| H8 | **Müfettiş CI bitince başlar.** `lint`/`typecheck`/`unit`/`secrets`/`deps-audit`/`build`/GitGuardian kırmızıysa kod incelemesi yapılmaz, tek satır yazılır, tur sayılmaz. `integration` (izolasyon dahil)/`e2e`/`contract` kırmızısı bulgularla aynı turda raporlanır. | Müfettiş | `review-guide.md` §2 Aşama 1. Mekanik bir hata iki tam inceleme okumasına dönüşmez. |
| H9 | **Yerel kapı zorunlu ve görünür.** Her push'tan önce `pnpm -s lint && pnpm -s typecheck` ve değişen modülün testleri (§3) çalışır. PR açıklamasının "Yerel kapı" bölümüne komut ve özet satırı yazılır; yoksa Müfettiş incelemeye başlamaz. Diff yalnızca `docs/`, `*.md` veya şablon dosyalarıysa "Yerel kapı: yalnız belge" yazmak yeter. Temiz klon tuzağı (T1) için `packages/shared/dist` silinip denenir. | Usta | Yerel kapı ~20–60 sn; bir Müfettiş turu milyonlarca token. |
| H10 | **Model işe göre seçilir.** Kartın "Model" satırı karar verir. **Opus:** Risk yüksek veya `Müfettiş: Zorunlu` adımlar (RLS, migration, kimlik/yetki, fiyat, stok, sepet bölünmesi, cari) ve bunların incelemesi. **Sonnet:** belge PR'ları, rapor ve retrospektif, düşük riskli ekran adımları, çeviri, hızlı yol incelemeleri (`review-guide.md` §8), uygulamayı çalıştırma ve ortam işleri. | Mimar, kullanıcı | Konuşmayı açan, modeli kartın satırına göre seçer. |
| H11 | **Az ve toplu araç çağrısı.** Her araç çağrısı (dosya okuma, komut, test) tüm konuşmayı yeniden okutur. Usta: bir dosyayı bir kez ve yalnızca gereken bölümüyle okur; ilgili birkaç dosyayı tek komutla okur; bir dosyadaki değişiklikleri tek düzenlemede toplar; test ve komut çıktısını sessiz modda alır (`-s`, `--reporter=dot`, `| tail -n 30`); aynı testi değişiklik yapmadan tekrar çalıştırmaz. | Usta, Müfettiş | 1.000 satır başına maliyeti düşürmenin ana yolu. |
| H12 | **Sabit yük sınırı.** `docs/ai-context.md` ≤ 15 KB, görev kartı ≤ 8 KB. Aşılırsa Mimar bir sonraki belge PR'ında sıkıştırır: bitmiş adımların ayrıntısı ilgili belgeye (data-model, integrations, ADR) taşınır, ai-context'te bir satır ve bağlantı kalır. | Mimar | Her yeni konuşma bu dosyaları baştan okur. |
| H13 | **Konuşma hijyeni.** Usta çalışırken yan konuşma (rapor, ortam, deneme) açılmaz; yan işler Usta bitince yapılır. Birleşen PR'ın Usta konuşması kapatılır ve bir daha yazılmaz; Müfettiş konuşması incelediği ikinci PR birleşince kapatılır (`review-guide.md` §9). Faz planı tek uzun konuşma değil, kısa konuşmalarla yapılır. | Kullanıcı, Mimar | Aynı anda 4–5 konuşma havuzu katlayarak boşaltır. |

## 3. Yerel kontrol komutları (H1)

```bash
pnpm -s lint && pnpm -s typecheck
pnpm -s --filter @b2b/api exec vitest run src/modules/<modül> --reporter=dot
# Yalnızca adım DB'ye dokunuyorsa, yalnızca o modülün entegrasyon testleri:
pnpm -s --filter @b2b/api exec vitest run --config vitest.integration.config.mts src/modules/<modül> --reporter=dot
```

Kart yerelde ayrıca bir komut isterse (ör. `pnpm db:migrate && pnpm check-rls`) o da çalışır. Başka modülün testi kırılırsa bunu CI gösterir; Usta yerelde yalnızca o testi çalıştırarak düzeltir.

## 4. Ölçüm

Her adım birleşince Mimar proje kullanım raporundan (kullanıcı paylaşır) aşağıdaki tabloya bir satır ekler. Her 3–4 adımda bir §1 tablosu (limit beklemesi, kopma, yerel test, kodlama, inceleme) ve H kurallarının etkisi değerlendirilir.

| Adım | Model | Usta token | Elle yazılan satır | 1.000 satır başına | Müfettiş token | Tur (mekanik) |
| --- | --- | --- | --- | --- | --- | --- |
| F2.1a | Opus | 45,2M | 2.703 | 16,7M | 8,6M | 3 (2) |

**Hedefler:** Usta ≤ 12M / 1.000 satır · Müfettiş ≤ 3M / PR · mekanik tur 0 · aynı anda en fazla 3 konuşma (Usta + Müfettiş + Mimar).
