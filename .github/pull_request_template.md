<!-- Başlık: <ID> <kısa açıklama> (ör. F2.12 bağlantı isteği uç noktası). Dal: feature/<ID>-… -->

## Özet

- Adım: `<ID>` — [implementation-plan.md](../docs/07-ai-development/implementation-plan.md) / `docs/tasks/<ID>.md`
- Ne değişti:

## AC → test

| AC         | Test (dosya › test adı)                 | Sonuç |
| ---------- | --------------------------------------- | ----- |
| `<ID>-AC1` | `…/__tests__/….test.ts` › `<ID>-AC1: …` | ✅    |

## Yerel kapı

<!-- Zorunlu (speed-and-tokens.md H9). Son push'tan önce çalıştırıldı; yalnızca hatalar ve özet satırı. Bu bölüm boşsa Müfettiş incelemeye başlamaz. Yalnız belge/şablon PR'ında "Yerel kapı: yalnız belge" yazmak yeter. -->

```text
pnpm -s lint && pnpm -s typecheck
pnpm -s --filter @b2b/api exec vitest run src/modules/<modül> --reporter=dot
```

## Müfettiş için

- Riskli yollar (review-guide §4): <!-- dokunulan dosyalar veya "yok" -->
- Plandan sapmalar: <!-- yoksa "Yok" -->
- Bilinen tuzaklar (review-guide §5) kontrol edildi: <!-- T1–T9; uygulanmayanı belirt -->

## Elle test

<!-- Bir satır: ne denendi, sonuç. -->

## Kapsam dışı değişiklikler

<!-- Varsa dosya ve gerekçe; yoksa "Yok". -->

---

# Bitti tanımı

<!-- Kaynak: docs/07-ai-development/definition-of-done.md — bu liste oradan birebir kopyalanır. Uygulanmayan maddeyi "(uygulanmaz)" diye işaretle. -->

## 1. Kapsam

- [ ] Pull request yalnızca bir adımı kapsar; başlık `<ID> <kısa açıklama>`, dal `feature/<ID>-…`.
- [ ] Adımın tüm kabul kriterleri karşılandı; karşılanmayan varsa adım bölündü ve kalan kısım yeni ID ile plana eklendi.
- [ ] Kapsam dışı dosya değişikliği yok (varsa gerekçesi açıklamada).

## 2. Kod kalitesi

- [ ] **(CI)** Lint, tip kontrolü ve biçim temiz.
- [ ] **(CI)** Modül sınırı kuralları ihlal edilmedi.
- [ ] **(CI)** Her yeni controller metodunda `@RequirePermission` veya `@Public`.
- [ ] Sabit süre, kota, eşik veya plan adı kodda yok (`SettingsService`, `EntitlementService` kullanıldı).
- [ ] Para için `number` yok; zaman UTC; arayüzde sabit metin yok.
- [ ] Domain terimleri [glossary.md](../docs/02-requirements/glossary.md) ile aynı.
- [ ] Yeni paket yok veya [tech-stack.md](../docs/07-ai-development/tech-stack.md)'ye eklendi ve onaylandı.

## 3. Test

- [ ] Her kabul kriteri en az bir testle karşılandı; test adları AC kimliğini taşıyor. AC → test eşleşme listesi PR açıklamasında.
- [ ] Kritik alanlarda testler koddan önce yazıldı (commit sırası görünür).
- [ ] **(CI)** Tüm testler yeşil; kapsam eşikleri (domain ≥ %85, backend ≥ %70) sağlandı.
- [ ] **(CI)** Kiracıya bağlı her yeni uç nokta için izolasyon testi var.
- [ ] Hiçbir test, geçmesi için gevşetilmedi veya atlanmadı (`.skip`, `.only` yok).
- [ ] Elle test senaryosu (web ve/veya mobil) yürütüldü; sonuç PR açıklamasında bir satır.

## 4. Veri ve API

- [ ] **(CI)** Yeni kiracı tablosunda RLS etkin ve politikaları var.
- [ ] Migration geriye uyumlu; staging'de uygulandı.
- [ ] [data-model.md](../docs/03-architecture/data-model.md) güncel (yeni tablo/kolon önce belgede).
- [ ] **(CI)** `openapi.yaml` ile uygulama şeması aynı; `/api/v1`'de kırıcı değişiklik yok.
- [ ] Yeni hata kodu `ErrorCode` listesinde (shared + OpenAPI) ve 3 dilde çevirisi var.
- [ ] Yeni ayar anahtarı `shared/settings.ts` ve US-017 tablosunda.

## 5. Güvenlik ve gizlilik

- [ ] **(CI)** Gizli bilgi taraması temiz; bağımlılık taramasında yüksek/kritik açık yok.
- [ ] Kişisel veri loglanmıyor; yeni 🔒 alan data-model.md'de işaretli.
- [ ] Kimlik, yetki, kiracı bağlamı, fiyat, stok veya cari kodu değiştiyse Müfettiş incelemesi yapıldı ve BLOCKER/HIGH/MEDIUM bulgu kalmadı ([review-guide.md](../docs/07-ai-development/review-guide.md) §3).

## 6. Belgeler

- [ ] `CHANGELOG.md` güncel (tek satır, adım ID'siyle).
- [ ] Davranışı değiştiren her karar belgede: ilgili story/spesifikasyon güncellendi; önemli bir kararsa yeni ADR yazıldı.
- [ ] Yeni çeviri anahtarları az, ru, tr için girildi (en isteğe bağlı).
- [ ] Yeni operasyon adımı (komut, alarm) varsa runbook / observability güncel.

## 7. Birleştirme

- [ ] **(CI)** Tüm kontroller yeşil.
- [ ] Müfettiş'in son ONAYLA'sı PR'ın şu anki head SHA'sı için verildi (review-guide §7).
- [ ] Squash merge; commit mesajı `<tür>(<ID>): <açıklama>`.
- [ ] Birleştirmeden sonra staging dağıtımı ve duman testi başarılı.
- [ ] Değişen belgeler Claude Projesi bilgi tabanına yeniden yüklendi.
