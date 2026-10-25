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

## 2. Kurallar

| # | Kural | Kim | Ayrıntı |
| --- | --- | --- | --- |
| H1 | **Yerel test dar tutulur.** Yalnızca değişen modülün birim testleri, gerekiyorsa yalnızca o modülün entegrasyon testleri, `lint` ve `typecheck`. Tam takım (`pnpm test`, `test:integration`, `test:isolation`, `build`) yerelde çalışmaz; CI çalıştırır. | Usta | Kartın "Yerel kontrol" bölümü komutu verir (§3). |
| H2 | **Bir Usta konuşması = bir adım ya da bir a/b çifti.** Sonraki adım yeni Usta konuşmasında başlar; yalnızca `ai-context.md` ve kart okunur. Aynı bilgisayarda aynı anda tek Usta çalışır. | Mimar | Uzun konuşmada her turda tüm geçmiş yeniden okunur. |
| H3 | **Bilgisayar uyumaz.** Usta çalışırken bilgisayar prize takılı ve uyku kapalı; mümkünse kablolu internet. | Kullanıcı | Windows: Ayarlar → Sistem → Güç ve pil → Ekran ve uyku → "Prize takılıyken uyku" = Hiçbir zaman. |
| H4 | **Müfettiş–Usta döngüsü doğrudan.** Müfettiş PR olaylarına abone olur ve yeni push ile uyanır; Usta bulguyu PR yorumundan okur ve yanıtı PR'a yazar. Mimar yalnızca ilk inceleme isteğini ve son kararı (ONAYLA / KARAR GEREKLİ) görür. | Müfettiş, Usta | `review-guide.md` §6 madde 7. |
| H5 | **Seyrek durum güncellemesi.** İlerleme kartı yalnızca adım sınırında güncellenir (plan, kod, yerel kontrol, PR, CI; en fazla ~6 kez). Kullanıcıya mesaj yalnızca PR açılınca, karar gerekince ve iş bitince. | Herkes | Her güncelleme bir tur daha demektir. |
| H6 | **Limit izlenir.** Bir adımda yine limite takılınca Mimar bunu kullanıcıya bildirir ve ölçüm tablosuna (§4) yazar. Tekrarlarsa plan yükseltmesi kullanıcıya seçenek olarak sunulur (karar ve maliyet kullanıcınındır). | Mimar | |

## 3. Yerel kontrol komutları (H1)

```bash
pnpm -s lint && pnpm -s typecheck
pnpm -s --filter @b2b/api exec vitest run src/modules/<modül> --reporter=dot
# Yalnızca adım DB'ye dokunuyorsa, yalnızca o modülün entegrasyon testleri:
pnpm -s --filter @b2b/api exec vitest run --config vitest.integration.config.mts src/modules/<modül> --reporter=dot
```

Kart yerelde ayrıca bir komut isterse (ör. `pnpm db:migrate && pnpm check-rls`) o da çalışır. Başka modülün testi kırılırsa bunu CI gösterir; Usta yerelde yalnızca o testi çalıştırarak düzeltir.

## 4. Ölçüm

Her 3–4 adımda bir Mimar §1'deki tabloyu yeniden doldurur: limit beklemesi, kopma, yerel test, kodlama, inceleme, birleştirme beklemesi. İlk ölçüm F1.10–F1.12 sonrası.
