# Bitti Tanımı (Definition of Done)

| Alan | Değer |
| --- | --- |
| Sürüm | 1.0 |
| Tarih | 2026-10-24 |
| İlgili belgeler | [coding-guidelines.md](coding-guidelines.md) · [test-strategy.md](../05-planning/test-strategy.md) · [implementation-plan.md](implementation-plan.md) |

Bir uygulama planı adımı (pull request), aşağıdaki maddelerin **tamamı** işaretlenmeden "bitti" sayılmaz ve birleştirilmez. Bu liste pull request şablonuna (`.github/pull_request_template.md`) kopyalanır. **(CI)** ile işaretli maddeler otomatik kontrol edilir.

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
- [ ] Domain terimleri [glossary.md](../02-requirements/glossary.md) ile aynı.
- [ ] Yeni paket yok veya [tech-stack.md](tech-stack.md)'ye eklendi ve onaylandı.

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
- [ ] [data-model.md](../03-architecture/data-model.md) güncel (yeni tablo/kolon önce belgede).
- [ ] **(CI)** `openapi.yaml` ile uygulama şeması aynı; `/api/v1`'de kırıcı değişiklik yok.
- [ ] Yeni hata kodu `ErrorCode` listesinde (shared + OpenAPI) ve 3 dilde çevirisi var.
- [ ] Yeni ayar anahtarı `shared/settings.ts` ve US-017 tablosunda.

## 5. Güvenlik ve gizlilik

- [ ] **(CI)** Gizli bilgi taraması temiz; bağımlılık taramasında yüksek/kritik açık yok.
- [ ] Kişisel veri loglanmıyor; yeni 🔒 alan data-model.md'de işaretli.
- [ ] Kimlik, yetki, kiracı bağlamı, fiyat, stok veya cari kodu değiştiyse Müfettiş incelemesi yapıldı ve kritik/önemli bulgu kalmadı.

## 6. Belgeler

- [ ] `CHANGELOG.md` güncel (tek satır, adım ID'siyle).
- [ ] Davranışı değiştiren her karar belgede: ilgili story/spesifikasyon güncellendi; önemli bir kararsa yeni ADR yazıldı.
- [ ] Yeni çeviri anahtarları az, ru, tr için girildi (en isteğe bağlı).
- [ ] Yeni operasyon adımı (komut, alarm) varsa runbook / observability güncel.

## 7. Birleştirme

- [ ] **(CI)** Tüm kontroller yeşil.
- [ ] Squash merge; commit mesajı `<tür>(<ID>): <açıklama>`.
- [ ] Birleştirmeden sonra staging dağıtımı ve duman testi başarılı.
- [ ] Değişen belgeler Claude Projesi bilgi tabanına yeniden yüklendi.

## Milestone için ek ölçütler

Bir milestone (M0–M7), [roadmap.md](../05-planning/roadmap.md) §2'deki çıkış ölçütleri ve [test-strategy.md](../05-planning/test-strategy.md) §6'daki kabul testi süreci tamamlanınca kapanır. Production yayını için ayrıca [test-strategy.md](../05-planning/test-strategy.md) §7 yayın öncesi kontrol listesi uygulanır.
