# <ID> — <kısa başlık>

| Alan | Değer |
| --- | --- |
| Adım | `<ID>` (`docs/07-ai-development/implementation-plan.md`) |
| Risk | yüksek / normal — yüksek: RLS, kimlik/yetki, para/sipariş |
| Plan incelemesi | gerekli / gerekmez — gerekliyse Usta planı Mimar'a getirir, onaysız kod yazmaz |
| Dal | `feature/<ID>-<kısa-ad>` |
| PR başlığı | `<ID> <kısa açıklama>` |
| Bağımlılık | <bitmiş olması gereken adımlar> |
| Müfettiş | Zorunlu / Önerilir / Gerekmez — <gerekçe> |
| Tahmin | S / M / L |

## Amaç

<Bir-iki cümle: bu adım bitince ne çalışıyor olacak.>

## Okunacak dosyalar (3–6)

`AGENTS.md`, `docs/ai-context.md` ve bu kart her zaman okunur. Aşağıdakiler dışında yalnızca işin gerçekten gerektirdiği dosyayı aç; "Okunacak belgeler" listesi başvuru içindir, belgenin yalnızca anılan bölümünü oku.

- <en önemli 3–6 dosya: belge bölümü veya kaynak kod yolu>

## Okunacak belgeler

- `AGENTS.md`
- <implementation-plan.md "Belgeler" satırındaki dosyalar, bölüm numarasıyla>

## Yapılacaklar (dosyalar)

<implementation-plan.md "Dosyalar" satırı; kısaltmalar açık yazılmış hâliyle.>

## Kapsam dışı (dokunma)

- <bu adımda yazılmayacak şeyler; hangi adıma ait olduğu>

## Kabul kriterleri ve testler

Her satır en az bir test. Test adı AC kimliğiyle başlar.

| AC | Kriter | Beklenen test (ad + tür) |
| --- | --- | --- |
| <ID>-AC1 | ... | `<ID>-AC1 ...` (birim / entegrasyon / izolasyon) |

## Kararlar (bu kart için verilmiş)

- <Mimar oturumunda verilen ve belgeye işlenen kararlar; yoksa "—">

## Emin olunmayan noktalar

- <Usta plan aşamasında bunlar için soru sormalı; uydurmamalı>

## Doğrulama komutu

```bash
<implementation-plan.md "Test" satırı>
```

## Bitti tanımı

`docs/07-ai-development/definition-of-done.md` maddelerinin tamamı + PR açıklamasında AC → test listesi + `CHANGELOG.md` satırı.
