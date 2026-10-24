# ADR-0021: Geliştirme ve staging'de mock SMS; production'da gerçek sağlayıcı zorunlu

| Alan | Değer |
| --- | --- |
| Durum | Kabul edildi |
| Tarih | 2026-10-24 |
| Karar veren | Platform sahibi |
| İlgili | D18 · NFR-92, NFR-95–NFR-98 · TM-02, TM-32 |

## Bağlam

Kullanıcı test aşamasında dış servis kullanmadan sahte SMS gönderici istedi; gerçek SMS sonradan eklenecek. Gerçek kullanıcıların girişi için gerçek SMS gerekir. Mock'un production'da açık kalması kodların görünmesine yol açar.

## Karar

1. `SmsSender` arayüzünün `mock` uygulaması SMS göndermez, kodu yalnızca `dev_sms_outbox` tablosuna yazar; kod loglanmaz.
2. `GET /api/v1/dev/sms-outbox` yalnızca development ve staging'de kayıtlıdır.
3. Production'da `SMS_PROVIDER=mock` ise uygulama başlamaz.
4. Gerçek sağlayıcı Y2 yayın aşamasından (gerçek kullanıcılar) önce devreye alınır.

## Alternatifler

| Seçenek | Artı | Eksi | Neden seçilmedi |
| --- | --- | --- | --- |
| Mock + production koruması (seçilen) | Geliştirme maliyeti 0; güvenli | Gerçek sağlayıcı entegrasyonu ayrı bir adım | — |
| Baştan gerçek sağlayıcı | Erken uçtan uca test | Maliyet ve sağlayıcı seçimi şimdi gerekir | Kullanıcı kararı |
| Sabit test kodu (ör. 000000) | Çok kolay | Production'a sızarsa felaket | Güvenlik |

## Sonuçlar

- **Olumlu:** Testler ve geliştirme dış servise bağımlı değil.
- **Olumsuz / bedel:** SMS teslim sorunları ancak gerçek sağlayıcıyla görülür; Y1 sonunda kısa bir gerçek SMS testi yapılır.
- **Takip:** Açılış kontrolü testi; implementation-plan'da gerçek sağlayıcı adımı.
