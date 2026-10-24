# ADR-0009: Katmanlı ayarlar ve plan hakları

| Alan | Değer |
| --- | --- |
| Durum | Kabul edildi |
| Tarih | 2026-10-24 |
| Karar veren | Platform sahibi |
| İlgili | D4, D9, D10, D11, D14 · US-017, US-055 |

## Bağlam

Bekleme süresi, istek kotası, otomatik onay süresi, bağlantısız hesap süreleri ve plan limitleri platform admininden değiştirilebilmeli; bazı değerler plana veya tek bir toptancıya özel olmalıdır. Planlar ileride perakendeci premium'u da kapsayabilir.

## Karar

1. `settings (scope, scope_id, key, value)`: çözümleme sırası işletme → plan → platform.
2. Planlar `plans` + `plan_entitlements`; işletmeye özel istisna `entitlement_overrides`.
3. Kod yalnızca `SettingsService.get(key, businessId)` ve `EntitlementService.check(key, businessId)` çağırır; plan adına göre dallanma yasaktır.
4. Her ayarın kodda bir varsayılanı, tipi ve alt/üst sınırı vardır (ör. bekleme süresi ≥ 7 gün).

## Alternatifler

| Seçenek | Artı | Eksi | Neden seçilmedi |
| --- | --- | --- | --- |
| Katmanlı ayar + hak tablosu (seçilen) | Yeni plan veya özel limit kod değişikliği gerektirmez | Ayar anahtarlarının kayıt altında tutulması gerekir | — |
| Ortam değişkenleri | Basit | Toptancı bazında değer yok; yeniden dağıtım gerekir | D9, D10 |
| Kodda plan kontrolü (`if plan == 'pro'`) | Hızlı | Her plan değişikliği kod değişikliği | Sürdürülemez |

## Sonuçlar

- **Olumlu:** Admin; kota, süre ve limitleri anında değiştirebilir.
- **Olumsuz / bedel:** Çok sayıda ayar test kombinasyonunu artırır; yalnızca gerçekten değişmesi beklenen değerler ayar yapılır.
- **Takip:** Ayar anahtarı kayıt dosyası `packages/shared/src/settings.ts`; değişiklikler audit'li.
