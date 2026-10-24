# ADR-0006: Kimlik: telefon + SMS OTP, JWT erişim anahtarı ve döndürülen yenileme anahtarı

| Alan | Değer |
| --- | --- |
| Durum | Kabul edildi |
| Tarih | 2026-10-24 |
| Karar veren | Platform sahibi |
| İlgili | K2 · US-001–US-004 · NFR-44–NFR-46 · TM-01–TM-04 |

## Bağlam

Kullanıcıların çoğu (dükkan sahipleri, kargocular) telefonla çalışır ve şifre hatırlamak istemez. Aynı kişi birden fazla işletmede üye olabilir. Web ve mobil istemci vardır. SMS maliyeti bütçeyi etkiler.

## Karar

1. Giriş telefon + 6 haneli SMS OTP ile yapılır; şifre yoktur.
2. Erişim anahtarı JWT, 15 dk; yenileme anahtarı opak, 30 gün, tek kullanımlık ve her kullanımda döndürülür; yeniden kullanım tüm aileyi iptal eder.
3. Web'de yenileme anahtarı httpOnly + Secure + SameSite=Strict cookie'de; mobilde cihazın güvenli deposunda.
4. Platform rolleri için TOTP zorunlu.
5. İşletme bağlamı JWT'de değil, her istekte `X-Business-Id` başlığıyla ve üyelik doğrulamasıyla belirlenir (işletmeler arası geçişte yeni anahtar gerekmez).

## Alternatifler

| Seçenek | Artı | Eksi | Neden seçilmedi |
| --- | --- | --- | --- |
| OTP + JWT/yenileme (seçilen) | Şifresiz; web ve mobil uyumlu; durumsuz API | OTP SMS maliyeti; anahtar yönetimi kodu | — |
| Harici sağlayıcı (Cognito, Auth0) | Hazır güvenlik özellikleri | Azerbaycan SMS ve çok işletmeli üyelik için özelleştirme; maliyet | Uyum ve maliyet |
| Yalnızca sunucu oturumu (cookie) | Web için en basit | Mobilde zayıf; her istekte oturum sorgusu | Mobil öncelikli kullanım |
| E-posta + şifre | SMS maliyeti yok | Hedef kullanıcılar e-postayı az kullanır | Kullanılabilirlik |

## Sonuçlar

- **Olumlu:** Uzun ömürlü yenileme anahtarı OTP (SMS) sayısını düşük tutar.
- **Olumsuz / bedel:** Anahtar döndürme ve iptal mantığı dikkatle test edilmeli.
- **Takip:** Kimlik modülü testleri; TM-02 SMS üst sınırı.
