# Azerbaycan B2B Toptan-Perakende Platformu — Sistem Analiz Raporu

Oct 23, 2026 · @Mirali

## Yönetici özeti

Platform, Azerbaycan'dan başlayan **çok kiracılı (multi-tenant) bir B2B SaaS sipariş ve cari takip sistemidir**. Siz yazılım sağlayıcısısınız; ürün satmıyor, para tahsil etmiyorsunuz. Toptancıyı yalnızca platform açar. Perakendeci kendisi kaydolur. **Bağlantıyı her zaman toptancı başlatır** ve perakendeci yalnızca bağlı olduğu toptancıların ürünlerini görür. Pilot uygulama, kozmetik ve saç bakım ürünleri satan 2 toptancı ve onların kozmetik dükkanı müşterileriyle yapılacaktır.

Bu sürüm (v4, onaylanmış) tüm kararları kesinleştirir. Önceki turda önerilen ve onaylanan üç önemli değişiklik şunlardır:

1. **Giriş kodu (OTP) için SMS ilk günden gerekli.** Push bildirimi, henüz giriş yapmamış bir telefona gönderilemez. Bu yüzden "önce yalnızca push" kararı, giriş ekranında uygulanamaz. SMS yalnızca OTP ve davet/aktivasyon bağlantısı için kullanılır, diğer bildirimler push ile gider (D18).
2. **Dizinde ad ve faaliyet alanına şehir/rayon da eklenmeli.** Yalnızca ad ve faaliyet alanı görünürse, toptancı hizmet verdiği bölgedeki dükkanları bulamaz ve dizin işe yaramaz. Tam adres kapalı kalır (D7).
3. **Uygulama içi teslim onayı, perakendeci o anda çevrimdışıysa çalışmaz.** Bu yüzden "teslim edildi, onay bekliyor" ara durumu ve süre dolunca otomatik onay kuralı ekledim (D23).

Kozmetik pilotu ayrıca bir ihtiyaç doğuruyor: **son kullanma tarihi ve parti (lot) takibi**. Stok bölümüne bunu ekledim.

### Temel iş kuralları (v4)

| # | Kural | Sonuç |
| --- | --- | --- |
| K1 | Toptancı hesabını **yalnızca platform admini** açar. İleride ödemeli self-servis kayıt bir ayarla açılır. | Şimdilik toptancı için başvuru formu var, kayıt ekranı yok. |
| K2 | Perakendeci web veya mobil arayüzden **kendisi kaydolur**. | Telefon SMS kodu (OTP) ile doğrulanır. VÖEN sipariş öncesi zorunludur. |
| K3 | Perakendeci, bağlantı isteği gelmeden **hiçbir toptancıyı göremez**. | Perakendecide toptancı arama ekranı yoktur. |
| K4 | Toptancı **tüm perakendecileri listeleyebilir** ve istek gönderir. | Varsayılan olarak yalnızca ünvan, faaliyet alanı ve şehir/rayon görünür. Diğer alanları perakendeci açabilir. |
| K5 | Bağlantıyı **iki taraf da** iptal edebilir. | Geçmiş siparişler, belgeler ve cari kayıtlar korunur. |
| K6 | İptalden sonra yeni bağlantı **yalnızca toptancının yeni isteğiyle** kurulur. | Bekleme süresi ve kotayı platform admini yönetir. |
| K7 | Perakendecide birden fazla kullanıcı sepet hazırlayabilir. **Gönderimi şube admini onaylar.** | Onay kuralı şube bazında ayarlanır. |
| K8 | Perakendeci **tek sepette** tüm bağlı toptancıların ürünlerini toplar. | Gönderimde sepet, toptancı başına ayrı sipariş, belge ve cari kaydına bölünür. |
| K9 | Platformda **online ödeme ve e-qaimə yoktur**. | Cari ve muhasebe takibi yapılır. İkisi de sonradan adaptörle eklenir. |
| K10 | İşletme tek bir kayıttır. **Toptancılık ve perakendecilik birer yetenektir.** | Yetki kontrolleri işletme tipine değil, yeteneğe göre yapılır. Çift rol ileride kod değişikliği olmadan açılır (D20). |
| K11 | Teslim, **perakendecinin uygulamadan onayıyla** kesinleşir. | Kod (OTP) yoktur. Onay gelmezse süre sonunda otomatik onaylanır (D23). |

### Açık konular

1. **Yurt dışında barındırma:** Kararınız (D21) teknik olarak sorun değil. Ancak Azerbaycan vatandaşlarının kişisel verilerinin yurt dışında tutulmasının mevzuata uygunluğunu geliştirme başlamadan önce bir hukukçuya doğrulatın. Gerekirse kişisel veriler sonradan yerel bir sunucuya taşınabilecek şekilde ayrı tutulmalıdır.
2. **Pilot başarı ölçütleri:** Pilotun "başarılı" sayılması için ölçütleri baştan yazın (bkz. "Yol haritası", F7).

## Karar kayıtları

Bu tablo projenin karar hafızasıdır. Bir karar değişirse eski satır silinmez; yeni bir satır eklenir ve eskisinin yanına "yerine geçti" yazılır. AI ile geliştirmede, AI'ın eski bir kararı "düzeltmeye" çalışmasını engelleyen şey bu tablodur.

**Durum:** ✅ kesin · ⚠️ önerim kararınızdan farklı, onayınızı bekliyor · 🔄 yerine geçti

| # | Konu | Nihai karar | Durum |
| --- | --- | --- | --- |
| D1 | Ödeme | Platformda online ödeme yok; cari ve muhasebe takibi var. Ödeme sonradan adaptörle eklenir. | ✅ |
| D2 | Perakendeciye özel fiyat | Her perakendeciye ayrı fiyat; dinamik fiyat önceliği | ✅ |
| D3 | Şube fiyatı ve indirimi | Şube fiyatı varsayılan kapalı, toptancı açabilir. Toptancı **şubeye özel indirim** de tanımlayabilir. | ✅ |
| D4 | Gelir modeli | Toptancıya aylık abonelik; perakendecinin temel kullanımı her zaman ücretsiz; ileride isteğe bağlı perakendeci premium | ✅ |
| D5 | e-qaimə | Şimdi yok. Veri modeli ve belge yapısı e-qaiməye hazır; entegrasyon adaptörle eklenir. MVP'de dışa aktarma. | ✅ |
| D6 | Teslimat | Kendi kargocu + manuel dış kargo; API kargo entegrasyonu sonra | ✅ |
| D7 | Perakendeci görünürlüğü | Varsayılan kapalı; yalnızca ünvan, faaliyet alanı **ve şehir/rayon** açık. Perakendeci ayarlardan diğer alanları açabilir. | ✅ |
| D8 | Engelleme | Perakendeci toptancıyı engelleyebilir | ✅ |
| D9 | Bekleme süresi | Platform → plan → toptancı katmanlı ayar; alt sınır 7 gün | ✅ |
| D10 | Günlük istek kotası | Plana bağlı; admin toptancı bazında değiştirebilir | ✅ |
| D11 | Bağlantısız hesaplar | Teşvik → uyarı → pasifleştirme → silme; süreler admin ayarı | ✅ |
| D12 | QR / davet | Kaldırıldı; toptancı yeni perakendeciyi telefon veya VÖEN ile bulur | ✅ |
| D13 | Unvanlar ve roller | Platform kataloğu ve şablonları; işletme şablonu kopyalayıp özelleştirir | ✅ |
| D14 | Toptancı self-servis kayıt | Şimdi başvuru formu; ileride ödeme + doğrulama + admin onayı (kayıt modu ayarı) | ✅ |
| D15 | Sipariş onayı | Şube admini onaylar; kural şube bazında ayarlanır | ✅ |
| D16 | Ortak sepet | Tek sepet; toptancı başına ayrı sipariş, belge ve cari | ✅ |
| D17 | Para birimi ve saat dilimi | Dinamik; varsayılan AZN ve Asia/Baku | ✅ |
| D18 | Bildirim | Push varsayılan; WhatsApp ve SMS bildirimleri sonradan. **SMS ilk günden yalnızca OTP ve davet/aktivasyon bağlantısı için** (toptancı aktivasyonu US-009, ekip daveti US-013; platform sahibi kararı 2026-10-31, F2 S2). | ✅ |
| D19 | Kod deposu | GitHub + GitHub Actions | ✅ |
| D20 | Çift rollü işletmeler | Tek işletme kaydı; yetenekler (`business_capabilities`) kendi onay durumlarıyla; role özel profil tabloları; siparişte satıcı ve alıcı tarafları; yetkiler yeteneğe göre. Özellik ileride açılır. | ✅ |
| D21 | Barındırma | Yurt dışında, AWS üzerinde. Bölge ve servis seçimi "Teknik mimari" bölümünde. Hukuki uygunluk doğrulanacak. | ✅ (hukuki teyit bekliyor) |
| D22 | Pilot | 2 toptancı (kozmetik, saç bakımı); müşterileri kozmetik dükkanları | ✅ |
| D23 | Teslim onayı | Kod yok. Kargocu "teslim ettim" der (fotoğraf + GPS); perakendeci uygulamadan onaylar veya itiraz eder; süre dolunca otomatik onaylanır. | ✅ |
| D24 | Son kullanma tarihi ve lot | Kozmetik için gerekli; MVP'de ürün düzeyinde, Faz 2'de lot bazlı stok | ✅ (öneri) |
| D25 | Teknik mimari | TypeScript (NestJS, Next.js, React Native), PostgreSQL, Redis, Meilisearch, Cloudflare R2 | ✅ |

## Aktörler ve hesap yapısı

Sistemde üç işletme seviyesi vardır ve her biri farklı bir yolla oluşur. Temel kural: **kullanıcı ≠ işletme**. Aynı kişi (aynı telefon numarası) birden fazla işletmede farklı rollerle çalışabilir.

| Seviye | Kim | Nasıl oluşur | Ne yapar |
| --- | --- | --- | --- |
| Platform (Süper Admin) | Siz ve ekibiniz (SaaS sağlayıcı) | Sistem kurulumunda | Toptancıları açar ve askıya alır. Perakendecileri **listeler, askıya alır, siler ve sınırlı yönetir** (profil düzeltme, birleştirme, kilit açma); siparişlerine ve fiyatlarına dokunmaz. Abonelik ve planları, ortak kategori/marka/birim kataloğunu, unvan ve rol şablonlarını, çevirileri, sistem ayarlarını (süreler, kotalar), moderasyonu ve destek işlerini yönetir. |
| Toptancı işletme | Distribütör / toptan satıcı | **Yalnızca platform admini** açar (ileride: ödemeli self-servis kayıt) | Ürün, fiyat, stok yönetir; perakendecileri listeler ve istek gönderir; sipariş, sevkiyat ve cariyi yönetir. |
| Perakendeci işletme | Market, mağaza, butik, eczane vb. | **Kendi kaydı** (web/mobil) | Gelen istekleri kabul eder, reddeder veya engeller; bağlı toptancılardan sipariş verir; carisini takip eder. |
| İşletme kullanıcısı | Platform kataloğundaki unvanlardan biri | İşletme admini davet eder | İşletmesindeki rolünün izinleriyle çalışır. |

**Sınırlı yönetim ilkesi:** Platform admini müşteri verisinin sahibi değildir. Bir perakendecinin fiyatını veya siparişini değiştiremez. Destek için kullanıcının hesabına geçebilir (taklit / impersonate). Bu işlem süreli olur, gerekçe ister ve audit loga yazılır. Silme işlemi, cari veya sipariş geçmişi olan bir işletmede **silme yerine arşivleme** olarak çalışır, çünkü karşı tarafın muhasebe kaydı bozulmamalıdır.

### Dinamik unvan ve rol kataloğu

Kararınız (D13) doğrultusunda unvanlar kodda sabit değildir. Platform admin panelinde yönetilir:

- **Unvan kataloğu:** ad (4 dil), hangi işletme tipine ait olduğu (toptancı, perakendeci veya ikisi), aktif/pasif. Örnekler: Satış Müdürü, Satış Temsilcisi, Muhasebe, Depo Sorumlusu, Kargocu, Satın Alma, Şube Müdürü.
- **Rol şablonu:** her unvana bağlı varsayılan izin paketi.
- **İşletme rolü:** işletme admini bir şablonu kopyalar, izinlerini kendine göre değiştirir ve kullanıcıya atar. Platform şablonu güncellese bile işletmenin kopyası değişmez; işletmeye "yeni şablon sürümü var" bildirimi gider.
- Yeni bir unvan eklemek kod değişikliği gerektirmez.

### Diğer roller ve yapılar

- **Satış temsilcisi (saha temsilcisi):** Toptancı adına kendi bölgesindeki perakendecileri arar, bağlantı isteği gönderir ve müşteri adına sipariş girer. QR kaldırıldığı için sahada şöyle çalışır: perakendeci kendi telefonundan kaydolur, temsilci onu telefon numarası veya VÖEN ile bulur ve istek gönderir, perakendeci de aynı dakika içinde kabul eder.
- **Şube / mağaza:** Perakendecinin birden fazla şubesi olabilir. Teslimat adresi, sipariş onayı ve (açılırsa) fiyat şube bazında tutulur. Her şubenin kendi **şube admini** olabilir (K7).
- **Depo:** Toptancının birden fazla deposu olabilir; stok depo bazında tutulur.
- **Platform destek ve moderatör:** Sahte veya mükerrer kayıtları ve şikayetleri inceleyen, sınırlı yetkili platform kullanıcıları.

## Kayıt ve doğrulama (OTP ve VÖEN)

Önerim: **telefon doğrulaması kayıtta zorunlu olsun. VÖEN kayıtta istensin, ama ilk sipariş gönderilmeden önce zorunlu olsun.** Böylece kayıt kolay kalır, ama vergi numarası olmayan hiçbir işletme ticari işlem yapamaz.

### OTP nedir?

OTP (One-Time Password), telefona SMS veya WhatsApp ile gelen tek kullanımlık koddur (ör. 6 haneli, 3–5 dakika geçerli). Şunu kanıtlar: "bu telefon numarası gerçekten bu kişinin elinde". Şifre ezberleme zorunluluğunu da kaldırır.

- Aynı numaraya dakikada 1, saatte 5 kod sınırı olmalı. SMS kodu başına ücret ödendiği için bu sınır kötüye kullanımı ve masrafı önler.
- Yanlış kodda 5 denemeden sonra geçici kilit uygulanmalı.
- Platform ve toptancı adminleri için ikinci doğrulama adımı (2FA) zorunlu olmalı.

### VÖEN nedir?

VÖEN (Vergi Ödəyicisinin Eyniləşdirmə Nömrəsi), Dövlət Vergi Xidmətinin şirketlere, fərdi sahibkarlara ve bireylere verdiği 10 haneli vergi kimlik numarasıdır. ƏDV (KDV) için ayrı bir numara yoktur; VÖEN kullanılır ([kaynak](https://lookuptax.com/docs/how-to-verify/tin-azerbaijan)). Sistem açısından önemi şudur:

- **Format kontrolü (ücretsiz, anında):** İlk iki hane bölgeyi, 3–8. haneler seri numarasını gösterir. 9. hane kontrol hanesidir. 10. hane tipi belirtir: 1 şirket, 2 fərdi sahibkar ([kaynak](https://taxdo.com/resources/faq/post/azerbaijan-tin-voen-compliance-guide-saas.md)). Kontrol hanesi sayesinde yanlış girilen numara anında yakalanır. İşletme tipi (MMC veya fərdi sahibkar) son haneden otomatik belirlenir.
- **Gerçeklik kontrolü:** e-taxes.gov.az üzerindeki ücretsiz VÖEN sorgusu, işletmenin adını ve bağlı olduğu vergi idaresini gösterir. MVP'de bu kontrol moderatör tarafından elle yapılır ve hesaba "doğrulanmış" rozeti verilir. Otomatik kontrol, resmi bir API erişimi doğrulanırsa sonradan eklenir.
- **Tekillik:** Aynı VÖEN ile ikinci bir perakendeci hesabı açılamaz. Bu, mükerrer ve sahte hesaplara karşı ana savunmadır.
- **Şube durumu:** Şubeler genellikle ana şirketin VÖEN'i altında faaliyet gösterir. Bu yüzden şubeler ayrı işletme olarak değil, aynı işletmenin altında açılmalıdır.
- **Fatura bağlantısı:** Elektronik qaimə-fakturada hem satıcının hem alıcının VÖEN'i bulunmak zorundadır. VÖEN olmadan ileride e-qaimə entegrasyonu mümkün olmaz.

### VÖEN zorunlu olsun mu?

| Seçenek | Artı | Eksi |
| --- | --- | --- |
| Kayıtta zorunlu | En temiz veri; sahte hesap az | Bazı işletmeler kayıtta vazgeçer |
| Hiç zorunlu değil | En kolay kayıt | Mükerrer ve sahte hesaplar, faturasız ticaret riski, toptancının güveni düşer |
| **Kayıtta istenir, sipariş öncesi zorunlu (öneri)** | Kayıt kolay; ticari işlem güvenli | Bir ek adım gerekir |

Toptancı için VÖEN her zaman zorunludur ve admin hesap açarken girer.

### Perakendecinin kayıtta girdiği bilgiler

| Alan | Zorunluluk | Not |
| --- | --- | --- |
| Telefon (OTP ile) | Kayıtta zorunlu | Giriş kimliği |
| Ad soyad (yetkili kişi) | Kayıtta zorunlu | Kişisel veri; varsayılan gizli |
| İşletme ünvanı | Kayıtta zorunlu |  |
| Faaliyet türü | Kayıtta zorunlu | Liste platform tarafından yönetilir |
| Şehir / rayon | Kayıtta zorunlu | Toptancı aramasının temel filtresi |
| VÖEN | Sipariş öncesi zorunlu | Format kontrolü ve tekillik |
| Hukuki tip | Otomatik | VÖEN'in son hanesinden |
| Şube adı ve teslimat adresi | Sipariş öncesi zorunlu | Harita konumu önerilir |
| E-posta | İsteğe bağlı | Fatura ve ekstre için |
| Logo, çalışma saatleri | İsteğe bağlı | Profil doluluk oranına katkı sağlar |
| Veri paylaşım onayı | Kayıtta zorunlu | Hangi alanların toptancılara görüneceğini perakendeci seçer |

## Ana iş akışları

### 1. Toptancı açılışı

Toptancı açılışı bir **kayıt modu ayarı** ile yönetilir. Kod değişmeden şimdiki manuel akıştan ileride ödemeli self-servis akışa geçilir.

| Mod | Akış | Ne zaman |
| --- | --- | --- |
| `manual` (şimdi) | Başvuru formu → admin inceler → admin hesabı açar → aktivasyon SMS'i | MVP |
| `self_signup_paid` (ileride) | Plan seçimi → ödeme → VÖEN kontrolü → **admin onayı** → hesap aktif | Ödeme entegrasyonundan sonra |
| `self_signup_trial` (opsiyon) | Kayıt → 14 gün kısıtlı deneme (istek gönderemez) → ödeme + onay | Pazarlama ihtiyacına göre |

Self-servis modda da admin onayı kalmalı. Toptancı tüm perakendeci dizinine eriştiği için doğrulanmamış bir toptancı, rakip veya spamcı olabilir. İlk adımlar:

1. Admin toptancıyı oluşturur: ünvan, VÖEN, adres, iletişim, abonelik planı, hizmet bölgeleri, para birimi, saat dilimi.
2. İşletme sahibine aktivasyon linki gider. İlk giriş yapan kişi **İşletme Admini** olur.
3. İşletme admini kullanıcılarını ekler ve unvan kataloğundan roller atar.

### 2. Perakendeci kaydı

1. Perakendeci web veya mobil uygulamadan kaydolur: telefon ve OTP, temel bilgiler, veri paylaşım tercihleri.
2. Hesap açılır, ama hiçbir toptancı ve ürün görünmez (K3). Ekranda "Profilinizi tamamlayın, toptancılar sizi bulsun" yönlendirmesi ve doluluk oranı gösterilir.
3. Perakendeci VÖEN'ini ve şube/teslimat adresini girer. Sipariş verebilmek için bu iki bilgi zorunludur.
4. Moderatör VÖEN'i doğrular ve hesap "doğrulanmış" rozeti alır. Toptancı listesinde doğrulanmış hesaplar üstte gösterilir.

### 3. Bağlantı kurma (her zaman toptancı başlatır)

1. Toptancı (yetkili kullanıcı veya satış temsilcisi) "Perakendeci bul" ekranında arar: şehir, rayon, faaliyet türü, ünvan, telefon veya VÖEN.
2. Bağlantı isteği gönderir. İsteğe kısa bir mesaj ve önerilen koşullar (ör. vade) eklenebilir. İstek, günlük kotadan düşer.
3. Perakendeci bildirim alır. Yalnızca isteği gönderen toptancının profil özetini görür (ünvan, logo, kategoriler, tanıtım); ürünleri henüz göremez.
4. Perakendecinin işletme admini **Kabul**, **Reddet** veya **Engelle** seçer.
5. Kabulden sonra bağlantı **Aktif** olur. Toptancı fiyat listesini, kredi limitini, vadeyi ve sorumlu temsilciyi atar; ürünler perakendecinin ekranında görünür.

### 4. Bağlantının iptali ve yeniden kurulması

1. Herhangi bir taraf aktif bağlantıyı iptal eder. Bu işlem neden seçimi ve ikinci onay ister.
2. Perakendeci, o toptancının ürünlerini, fiyatlarını ve kampanyalarını anında görmez olur. Sepetteki o toptancıya ait kalemler kaldırılır ve kullanıcı bilgilendirilir.
3. **Açık siparişler:** Toptancının onayladığı siparişlerin teslimatı tamamlanır. Onay bekleyenler otomatik iptal edilir.
4. **Cari:** Borç kaydı salt-okunur olarak kalır. Borç kapanana kadar tahsilat girilebilir.
5. Yeni bağlantı için toptancı, bekleme süresi dolduktan sonra yeni bir istek gönderir (K6). Önceki koşullar şablon olarak önerilir.

### 5. Sipariş yaşam döngüsü

1. Perakendecinin kullanıcıları (satın almacı, şube çalışanı) **tek ortak sepete** bağlı toptancıların ürünlerini ekler. Sepet şube bazındadır.
2. Sepet ekranı ürünleri toptancıya göre gruplar. Her grup için ara toplam, minimum sipariş tutarı ve kredi limiti uyarısı gösterilir.
3. Kullanıcı "Onaya gönder" der. **Şube admini** sepeti inceler, düzeltir, onaylar veya geri gönderir (K7). Şubenin onay kuralı "her sipariş", "X AZN üstü" veya "onaysız" olabilir.
4. Onaydan sonra sepet **toptancı başına ayrı siparişlere bölünür**. Her siparişin kendi numarası, durumu, faturası ve cari kaydı olur (K8).
5. Toptancı siparişi onaylar, düzenler (stok yoksa miktarı düşürür ve perakendeciye bildirir) veya reddeder.
6. Depo hazırlar, sipariş kargocuya veya dış kargoya verilir, yola çıkar ve teslim edilir. Teslim onayı yöntemi "Teslimat" bölümünde anlatılıyor.
7. Teslimde eksik veya hasarlı ürün bildirilebilir; bu bir iade/düzeltme kaydı oluşturur.
8. Teslim edilen tutar cariye borç olarak yazılır. Tahsilat girildikçe borç kapanır.

Sipariş durumları ve geçişleri aşağıdaki diyagramda gösteriliyor.

&#91;embedded content: sipariş durumları · 6 ana durum, 2 istisna\]

Sipariş ancak tahsilat girildiğinde kapanır; red/iptal ve eksik/iade durumları cari hesaba ters kayıt olarak yansır.

## Bağlantı kuralları

Bağlantı, perakendecinin neyi göreceğini, ne sipariş edebileceğini ve hangi fiyatı ödeyeceğini belirler. Bu yüzden bağlantının durumları ve sınırları açıkça tanımlanmalıdır.

### Bağlantı durumları

| Durum | Kim yaratır | Perakendeci ürünleri görür mü | Sonraki adım |
| --- | --- | --- | --- |
| Beklemede | Toptancı istek gönderir | Hayır, yalnızca toptancının profil özetini görür | Kabul, red, engel, geri çekme veya süre dolması |
| Aktif | Perakendeci kabul eder | Evet | Taraflardan birinin iptali |
| Reddedildi | Perakendeci | Hayır | Bekleme süresinden sonra toptancı yeniden isteyebilir |
| Süresi doldu | Sistem (yanıtsız istek) | Hayır | Toptancı yeniden isteyebilir |
| Geri çekildi | Toptancı | Hayır | Toptancı yeniden isteyebilir |
| İptal – toptancı | Toptancı | Hayır | Toptancı yeni istek gönderir |
| İptal – perakendeci | Perakendeci | Hayır | Bekleme süresinden sonra toptancı yeni istek gönderir |
| Engellendi | Perakendeci | Hayır | Engeli yalnızca perakendeci kaldırır |

### Admin tarafından yönetilen ayarlar

Kararlarınız (D9, D10) doğrultusunda bu değerler kodda sabit tutulmaz. **Üç katmanlı bir ayar sistemiyle** yönetilir. Sistem önce en özel ayara bakar: **toptancıya özel ayar → abonelik planı → platform varsayılanı**.

| Ayar | Platform varsayılanı (öneri) | Plan bazında | Toptancı bazında |
| --- | --- | --- | --- |
| İsteğin geçerlilik süresi | 14 gün | — | — |
| Red sonrası bekleme süresi | 30 gün | Evet | Evet |
| Perakendeci iptali sonrası bekleme | 30 gün | Evet | Evet |
| Günlük istek kotası | 20 | Evet (ör. Başlangıç 20, Pro 100) | Evet |
| Aynı çift için bekleyen istek sayısı | 1 | — | — |
| Engellenme oranı uyarı eşiği | %10 | — | — |

**Koruma kuralları:** Bekleme süresi 7 günün altına inemez. Bu sınır, admin hatasının perakendeci tacizine dönüşmesini önler. Her ayar değişikliği kim, ne zaman ve eski/yeni değer bilgisiyle loglanır. Engellenme oranı eşiği aşan toptancının kotası otomatik düşer ve admin uyarılır.

### Perakendeci veri görünürlüğü

Kararınız (D7): **her şey varsayılan olarak kapalı; yalnızca ünvan ve faaliyet alanı görünür.** Bu kurala bir ekleme öneriyorum: **şehir ve rayon da açık olmalı.** Gerekçe şu: Toptancının dizindeki ilk sorusu "benim dağıtım bölgemde hangi dükkanlar var?" olur. Bölge bilgisi olmadan dizin, Azerbaycan'daki tüm kozmetik dükkanlarının isim listesine dönüşür ve satış temsilcisi bu listeyle çalışamaz. Rayon kişisel veri değildir ve tam adresi açık etmez.

| Bilgi | Varsayılan (bağlantı yokken) | Perakendeci değiştirebilir mi | Aktif bağlantıda |
| --- | --- | --- | --- |
| Ünvan | **Açık** | Hayır (dizinde görünmek için gerekli) | Açık |
| Faaliyet alanı (ör. kozmetik dükkanı) | **Açık** | Hayır | Açık |
| Şehir / rayon | **Açık** (önerim) | Hayır | Açık |
| Logo | Kapalı | Evet | Açık |
| Tam adres, şubeler | Kapalı | Evet | Açık |
| İşletme telefonu | Kapalı | Evet | Açık |
| VÖEN | Kapalı | Evet | Açık |
| Yetkili kişinin adı | Kapalı | Evet | Açık |
| Kişisel cep telefonu, e-posta | Kapalı | Evet | Açık |
| Diğer toptancılarla bağlantıları | **Asla** | Hayır | **Asla** |
| Diğer toptancılarla alım hacmi ve geçmişi | **Asla** | Hayır | **Asla** |

**Arama kuralı:** Toptancı, alan kapalı olsa bile tam telefon numarası veya tam VÖEN girerek o perakendeciyi bulabilir ("bu numara kayıtlı mı?" sorusu). Ancak sonuçta yalnızca açık alanları görür. Bu kural, sahada "kaydoldum, bana istek gönder" diyen perakendecinin anında bulunmasını sağlar. Kısmi numara veya VÖEN ile arama yapılamaz; bu da listenin tahmin yoluyla taranmasını engeller.

**Aktif bağlantıda** perakendecinin tüm teslimat ve iletişim bilgileri, yalnızca bağlı olduğu toptancıya açılır. Bu bilgiler sipariş ve teslimat için zorunludur ve kabul ekranında perakendeciye açıkça söylenir. İptalden sonra toptancı bu bilgileri yalnızca geçmiş siparişlerde ve belgelerde (salt-okunur) görür.

Perakendeci "dizinde görünme" ayarını tamamen kapatabilir. Bu durumda yalnızca tam telefon veya VÖEN eşleşmesiyle bulunabilir.

### Bağlantısız hesap politikası

Kararınızı (D11) değiştirmeyi öneriyorum. Perakendeci bağlantı başlatamıyor (K3), dolayısıyla bağlantısız kalması onun kusuru değil, platformun eksiğidir. Silmeden önce hesabı toptancılara görünür kılmak ve sahibine haber vermek gerekir. Süreler admin ayarıdır.

| Adım | Süre (öneri) | Ne olur |
| --- | --- | --- |
| 1. Teşvik | 7. ve 30. gün | Profil tamamlama hatırlatması. Bölgedeki toptancılara "yeni perakendeci" bildirimi gider. |
| 2. Uyarı | 90. gün | "Hesabınız 30 gün sonra pasifleşecek" mesajı (push; ileride SMS/WhatsApp kanalları eklendiğinde onlar da) |
| 3. Pasifleştirme | 120. gün | Hesap dizinden çıkar. Giriş yapılırsa tek tıkla yeniden aktifleşir. |
| 4. Silme | 180. gün | Son bildirimden sonra kişisel veriler silinir veya anonimleştirilir. |

Kural: Sipariş veya cari geçmişi olan hiçbir hesap otomatik silinmez. Bu politika yalnızca hiç bağlantı kurmamış hesaplara uygulanır. Kullanıcının giriş yapması sayacı sıfırlar.

Bağlantı durumları ve geçişleri aşağıdaki diyagramda gösteriliyor.

&#91;embedded content: bağlantı durumları · tek yönlü başlatma\]

Perakendeci hiçbir durumda bağlantı başlatamaz; her durumda toptancıyı engelleyebilir ve engel kalkana kadar o toptancı istek gönderemez.

## Fiyatlandırma modeli

Fiyat tek bir alanda saklanmaz. Sistem her ürün için **en özel kuraldan en genel kurala doğru** arar ve bulduğu ilk fiyatı kullanır. Böylece her perakendeciye ayrı fiyat verilebilir, ama toptancı 500 müşteri için 500 ayrı liste tutmak zorunda kalmaz.

### Fiyat önceliği

1. **Şubeye özel fiyat** (yalnızca toptancı bu perakendeci için açtıysa)
2. **Perakendeciye özel fiyat** (bu müşteriye özel tanımlanmış ürün fiyatı)
3. **Bağlantıya atanmış fiyat listesi** (ör. "A grubu marketler")
4. **Toptancının temel fiyat listesi**

Bulunan fiyatın üzerine sırasıyla şunlar uygulanır: **kademeli fiyat** (ör. 10 koli ve üstü −%3), **kampanya** (tarih aralıklı), **manuel indirim** (temsilcinin yetki limiti içinde).

### Şube fiyatı: önerim

Şube fiyatı **varsayılan olarak kapalı** olsun ve toptancı her perakendeci için ayrı ayrı açabilsin. Gerekçe:

- Şubeler çoğunlukla aynı VÖEN altında aynı şirkettir ve fatura aynı tüzel kişiye kesilir. Aynı şirketin şubelerine farklı fiyat vermek nadir görülür.
- Gerçek ihtiyaç farklıdır: uzak şubeye **teslimat ücreti** veya farklı **minimum sipariş** uygulanır. Bunlar fiyattan ayrı kurallar olarak modellenmelidir.
- Her şube fiyatı katmanı, "bu fiyat nereden geldi?" sorusunu zorlaştırır. Bu yüzden fiyat ekranında **fiyatın kaynağı** (hangi kural) her zaman gösterilmelidir.

**Şubeye özel indirim (D3):** Toptancı, şube fiyatını açmadan da bir şubeye **indirim kuralı** tanımlayabilir. Örneğin "Gəncə şubesine tüm ürünlerde −%2" veya "bu şubeye belirli markada −%5". İndirim, fiyat önceliğiyle bulunan fiyatın üzerine uygulanır ve sipariş satırında "şube indirimi" olarak ayrıca gösterilir. Fiyat ile indirimin ayrı tutulması bilinçli bir tercihtir: toptancı liste fiyatını bir kez günceller ve şube indirimleri otomatik olarak devam eder.

### Tasarım kuralları

- Siparişe fiyat **o anki haliyle kopyalanır**. Sonradan fiyat değişse bile eski sipariş bozulmaz.
- Her fiyat listesinin bir **para birimi** ve **geçerlilik tarihi** olur. Gelecek tarihli fiyat değişikliği planlanabilir.
- KDV dahil veya hariç bilgisi ve ƏDV oranı fiyat listesi düzeyinde tutulur (F3 kararı S2 = A, data-model `price_lists.vat_rate`); aynı listede farklı oranlı ürün gerekirse ürün düzeyinde oran sonradan eklenir. Standart oran sabit kodlanmaz.
- Fiyat Excel ile toplu yüklenebilir. Her yükleme öncesinde önizleme ve fark raporu gösterilir.
- Fiyat değişiklikleri loglanır: kim, ne zaman, eski ve yeni değer.

## Birim ve ambalaj

Önerim iki uluslararası standarda dayanıyor: ölçü birimi kodları için **UN/ECE Recommendation 20** (ambalaj kodları Recommendation 21'den gelir ve Rec 20'de "X" ön ekiyle yer alır), ürün ve ambalaj seviyeleri ile barkodlar için **GS1** (GTIN). Bu iki standart e-fatura, ERP ve dış kargo entegrasyonlarında ortak dildir. Bu yüzden ileride entegrasyon yaparken dönüşüm gerekmez.

### Üç kavram ayrı tutulmalı

1. **Temel birim:** Stoğun ve fiyatın asıl tutulduğu en küçük birim. Örnek: adet, kg, litre.
2. **Ambalaj seviyeleri (GS1 hiyerarşisi):** tüketici birimi → iç paket → koli → palet. Her seviye kaç temel birim içerdiğini, kendi barkodunu (GTIN), ağırlığını ve ölçülerini taşır.
3. **Satış birimi:** Toptancının o ürünü hangi seviyede sattığı (ör. sadece koli). Buna bağlı olarak **minimum sipariş** ve **sipariş katı** tanımlanır (ör. en az 2 koli, 1'er koli artışla).

Örnek: Bir şampuan → 1 adet (temel birim, 400 ml) → iç paket 6 adet → koli 24 adet → palet 60 koli (1.440 adet). Perakendeci "3 koli" sipariş eder; sistem bunu 72 adet olarak stoktan düşer.

### Başlangıç birim kataloğu (platform admini genişletebilir)

| Tür | Birim | UN/ECE kodu |
| --- | --- | --- |
| Sayı | Adet | H87 |
| Sayı | Bir (birimsiz) | C62 |
| Ağırlık | Gram / kilogram / ton | GRM / KGM / TNE |
| Hacim | Mililitre / litre | MLT / LTR |
| Hacim | Metreküp | MTQ |
| Uzunluk | Santimetre / metre | CMT / MTR |
| Alan | Metrekare | MTK |
| Ambalaj | Paket | XPK |
| Ambalaj | Kutu | XBX |
| Ambalaj | Koli (karton) | XCT |
| Ambalaj | Şişe | XBO |
| Ambalaj | Teneke kutu | XCA |
| Ambalaj | Torba / çuval | XBG / XSA |
| Ambalaj | Palet | XPX |

"Blok" (ör. sigara) gibi yerel adlar, standart bir koda eşlenmiş **görünen ad** olarak eklenir. Böylece kullanıcı tanıdığı adı görür, sistem ise standart kodu saklar.

### Admin tarafında yönetim

- Birim ekleme ve düzenleme: kod, tür, 4 dilde ad, kısaltma, ondalık izni (kg'da 1,5 olabilir, adette olamaz).
- Aynı türdeki birimler arasında dönüşüm oranları (1 kg = 1000 g).
- Kullanımdaki bir birim silinemez, yalnızca pasifleştirilebilir.
- Toptancılar katalogdan seçim yapar, kendileri yeni birim oluşturamaz. Bu kural veri kirliliğini önler; ihtiyaç olursa admin'e talep gönderirler.

## Stok yönetimi

Önerim şu: **stok takibi her toptancı için bir "stok modu" ayarı olsun.** Toptancıların bir kısmı stoğunu düzenli tutar, bir kısmı tutmaz. Hepsini aynı ayrıntı düzeyine zorlarsanız sistemi kullanmayı bırakırlar. MVP'de ilk üç mod yeterlidir; dördüncüsü entegrasyonla gelir.

| Mod | Toptancı ne yapar | Perakendeci ne görür | Kime uygun |
| --- | --- | --- | --- |
| 0. Takipsiz | Hiçbir şey | Her ürün sipariş edilebilir | Stoğu hiç tutmayan, siparişe göre tedarik eden |
| 1. Var / yok | Ürünü "stokta yok" olarak işaretler | "Stokta yok" etiketi, sepete eklenemez | Küçük toptancılar (MVP için en pratik mod) |
| 2. Miktarlı | Depo bazında miktar girer (elle veya Excel ile) | "Stokta" ya da "Son 5 koli"; gerçek sayı gizli tutulabilir | Düzenli depo tutan toptancılar |
| 3. Senkron | Stok 1C/ERP'den otomatik gelir | Mod 2 ile aynı | Büyük toptancılar (Faz 3) |

### Miktarlı modda temel mantık

Stok tek bir sayı değil, üç sayıdır:

- **Fiziksel stok:** Depoda gerçekten bulunan miktar.
- **Rezerve stok:** Onaylanmış ama henüz sevk edilmemiş siparişlere ayrılan miktar.
- **Satılabilir stok = fiziksel − rezerve.** Perakendeciye gösterilen ve sipariş kontrolünde kullanılan sayı budur.

Stok her değişimde bir hareket kaydıyla değişir. Doğrudan sayı üzerine yazılmaz.

| Olay | Fiziksel | Rezerve |
| --- | --- | --- |
| Mal girişi (alım) | + |  |
| Toptancı siparişi onayladı |  | + |
| Sipariş sevk edildi | − | − |
| Sipariş iptal edildi (sevk öncesi) |  | − |
| İade kabul edildi | + |  |
| Sayım farkı / fire | ± |  |

Bu yapı sayesinde "stok neden azaldı?" sorusunun cevabı her zaman bulunur. Sayım (envanter) yapıldığında fark tek bir düzeltme hareketiyle girilir.

### Önemli kurallar

- Perakendeci sepete eklediğinde stok **ayrılmaz**. Stok toptancı onayında ayrılır. Aksi halde sepette bırakılan ürünler stoğu kilitler.
- Onay anında stok yetersizse toptancı miktarı düşürür ve perakendeci bunu bildirimle görür (kısmi onay).
- İki kullanıcı aynı anda son ürünü onaylarsa veritabanı işlemi (transaction) ve satır kilidi ile yalnızca biri başarılı olur.
- Minimum stok eşiğinin altına düşen ürünler depo dashboard'unda uyarı olarak görünür.

### Kozmetik için son kullanma tarihi ve lot (D24)

Pilot kategoride son kullanma tarihi ve parti (lot) bilgisi önemlidir. Perakendeci, raf ömrü kısa ürünü almak istemez; ürün geri çağrıldığında da hangi dükkana hangi partinin gittiği bilinmelidir.

| Aşama | Kapsam |
| --- | --- |
| MVP | Ürün kartında "son kullanma tarihli ürün" işareti ve raf ömrü bilgisi. Toptancı siparişi onaylarken satıra isteğe bağlı olarak lot numarası ve son kullanma tarihi yazabilir. Bu bilgi sipariş belgesinde görünür. |
| Faz 2 | Lot bazlı stok: her girişte lot ve son kullanma tarihi kaydedilir. Sevkiyatta **ilk biten ilk çıkar** (FEFO) önerisi yapılır. Süresi yaklaşan ürünler için uyarı ve kampanya önerisi verilir. |
| Faz 2 | Geri çağırma raporu: belirli bir lotun hangi perakendecilere gittiği listelenir. |

Veri modeli bugünden hazırlanır: `stock_movements` ve `order_items` tablolarında boş bırakılabilen `lot_no` ve `expiry_date` alanları bulunur.

## Teslimat ve lojistik

Her iki teslimat yöntemini de desteklemek doğru bir hedef. Ama ikisini MVP'de tam entegrasyonla yapmak **aşırı olur**. Önerim: kendi kargocu tam çalışsın, dış kargo ilk aşamada "manuel" olsun ve API entegrasyonu sonradan bir adaptörle eklensin.

### İki yöntemin karşılaştırması

|  | Kendi kargocu | Dış kargo firması |
| --- | --- | --- |
| Kimin için | Kendi aracı ve şoförü olan toptancılar (Azerbaycan'da yaygın) | Bölge dışına veya küçük hacimli gönderen toptancılar |
| Avantaj | Tam kontrol; kapıda tahsilat; rota ve teslim kanıtı sistemde | Kendi filosu olmayan toptancıyı pazara açar; ülke genelinde erişim |
| Dezavantaj | Kargocu uygulaması, rota ve tahsilat modülü geliştirmek gerekir | Her firmanın API'si farklıdır; durum senkronu, etiket ve ücret hesabı karmaşıktır; firma API'leri değişebilir |
| MVP | **Tam destek** | **Manuel:** firma adı ve takip numarası girilir, durum elle güncellenir |
| Sonra | Rota optimizasyonu | Firma API adaptörleri (etiket, otomatik durum, ücret) |

**Mimari kural:** Sipariş modülü teslimatın nasıl yapıldığını bilmez. Yalnızca bir "teslimat sağlayıcısı" arayüzüyle konuşur. `own_courier`, `manual_carrier` ve ileride `carrier_x_api` bu arayüzün farklı uygulamalarıdır. Yeni bir kargo firması eklemek, sipariş kodunu değiştirmeyi gerektirmez.

### Teslim onayı (D23)

Kararınız: **teslim kodu (OTP) olmayacak; teslim perakendecinin uygulamadan onayıyla kesinleşecek.** Bunu kabul ediyorum. Bu karar SMS maliyetini sıfırlar ve kargocuyu hızlandırır.

Ancak bir boşluk var: Teslim anında perakendecinin telefonu yanında olmayabilir, interneti olmayabilir veya onay vermeyi unutabilir. Onay gelmezse sipariş sonsuza kadar "yolda" kalır ve borç cariye yazılmaz. Bu yüzden iki aşamalı bir akış öneriyorum:

1. **Kargocu "teslim ettim" der.** Uygulama fotoğrafı (isteğe bağlı, toptancı zorunlu yapabilir), GPS konumunu ve saati otomatik kaydeder. Sipariş **"Teslim edildi – onay bekliyor"** durumuna geçer.
2. **Perakendeci bildirimi alır** ve uygulamadan iki seçenekten birini seçer:
   - **Onayla:** Sipariş "Teslim edildi" olur ve tutar cariye yazılır.
   - **İtiraz et:** Eksik, hasarlı veya "teslim almadım". Fotoğraf eklenebilir. Sipariş inceleme durumuna geçer ve toptancı bilgilendirilir.
3. **Otomatik onay:** Perakendeci belirli bir süre içinde (öneri: 48 saat; admin ve toptancı ayarı) yanıt vermezse sipariş otomatik olarak onaylanır. Bu kural, perakendeciye kabul ekranında ve bildirimde açıkça yazılır.
4. **Konum kontrolü:** Kargocu teslim noktasından uzaktayken (ör. 300 metreden fazla) "teslim ettim" derse, kayıt toptancı panelinde "konum uyuşmazlığı" olarak işaretlenir.

Kapıda tahsilat yapılırsa tutar kargocunun üzerine yazılır. Kargocu parayı toptancıya teslim edene kadar muhasebe dashboard'unda "kargocuda bekleyen nakit" olarak görünür.

## Fatura ve e-qaimə

Evet, sorunuzu doğru anladınız: e-qaimə entegrasyonu, platformun **devletin vergi sistemiyle doğrudan veri alışverişi yapması** demektir. Önerim: **MVP'de entegrasyon yapılmasın.** Platform, e-qaiməye hazır veri üretip dışa aktarsın. Gerçek entegrasyon Faz 3'te ve büyük ihtimalle 1C üzerinden yapılsın.

### e-qaimə nedir?

- Azerbaycan'da ƏDV (KDV) ödeyicisi olan işletmeler, mal ve hizmet satışlarında faturayı kağıt yerine **elektronik qaimə-faktura** olarak düzenlemek zorundadır. Bu faturalar Dövlət Vergi Xidmətinin İnternet Vergi İdarəsi (e-taxes.gov.az) üzerinden düzenlenir ve XML formatındadır ([e-invoice.app](https://www.e-invoice.app/country/AZ), [Vergi Xidməti](https://taxes.gov.az/en/page/elektron-qaime-faktura)).
- Fatura, satıcının **güçlendirilmiş elektronik imzasıyla** (ör. ASAN İmza) imzalanır ([PwC](https://pwc.com/az/en/publications/pwc-az-times/assets/pwc-az-times-issue-03-2014-eng.pdf)).
- Alıcı faturayı onaylamalıdır. Vergi Xidmətinin açıklamasına göre 5 gün içinde onaylanmayan e-qaimə sistem tarafından iptal edilir ([Vergi Xidməti SSS](https://taxes.gov.az/en/page/suallar-ve-cavablar?page=165)).
- Faturada hem satıcının hem alıcının VÖEN'i bulunur. Bu yüzden VÖEN'i kayıtta istiyoruz.

Bugün toptancılar bu faturayı ya e-taxes portalına elle girer ya da muhasebe programından (çoğunlukla 1C) gönderir. Entegrasyon, bu işi platformun yapması anlamına gelir: sipariş teslim edilince fatura otomatik oluşturulur ve vergi sistemine gönderilir.

### Avantajlar

- Çift veri girişi ortadan kalkar: sipariş bir kez girilir, fatura otomatik oluşur.
- Elle girişteki tutar, VÖEN ve birim hataları azalır.
- Perakendeci faturayı onaylayınca sipariş, teslim ve fatura zinciri tamamlanır; mutabakat kolaylaşır.
- Rakiplere karşı güçlü bir satış argümanı olur ve daha üst bir abonelik planına konabilir.

### Zorluklar ve riskler

| Zorluk | Açıklama |
| --- | --- |
| Elektronik imza | Faturayı platform değil, **her toptancı kendi imzasıyla** imzalar. Platformun bu imza akışını güvenli şekilde yönetmesi gerekir; bu teknik ve hukuki açıdan en zor kısımdır. |
| Erişim yolu | Üçüncü taraf yazılımların sisteme nasıl bağlanacağı (otomatik mod, XML yükleme, test ortamı) Vergi Xidməti ile resmi olarak netleştirilmelidir. Bu rapor bunu doğrulamış değildir. |
| Hukuki sorumluluk | Hatalı veya geç fatura cezaya yol açar. Platform hatası durumunda sorumluluğun kimde olduğu sözleşmede yazılmalıdır. |
| Mevzuat değişikliği | Format ve kurallar değişebilir. Bu durumda platformun hızla güncellenmesi gerekir. |
| Herkes kapsamda değil | Her toptancı veya perakendeci ƏDV ödeyicisi olmayabilir. Hangi satışlarda e-qaimə gerektiği muhasebeciyle netleştirilmelidir. |
| İptal ve iade | Kısmi teslim, iade ve düzeltme faturaları ayrıca modellenmelidir. |

### Aşamalı plan

1. **MVP:** Platform kendi **sipariş belgesini** üretir (ticari belge, vergi faturası değil). Teslim edilen siparişler, e-qaimə alanlarıyla uyumlu bir Excel veya XML dosyası olarak dışa aktarılabilir. Muhasebeci bunu kendi sistemine aktarır.
2. **Faz 2:** e-qaimə numarası, sipariş ve cari kaydına elle bağlanabilir. Böylece hangi siparişin faturalandığı takip edilir.
3. **Faz 3:** 1C entegrasyonu üzerinden fatura gönderimi (1C zaten e-qaimə gönderebiliyorsa en düşük riskli yol budur) veya resmi kanal doğrulanırsa doğrudan entegrasyon.

Bu konuda Azerbaycan'da çalışan bir mali müşavirle bir toplantı yapmanız, geliştirmeye başlamadan önce en değerli adımlardan biri olur.

## Abonelik ve gelir modeli

Toptancıya aylık abonelik doğru bir model. Perakendeciden abonelik almayı ise **şimdilik önermiyorum**. Önerim: perakendecinin temel kullanımı her zaman ücretsiz olsun; ileride yalnızca isteğe bağlı "premium" özellikler ücretli olsun.

### Neden perakendeci ücretsiz kalmalı?

- Bu bir **iki taraflı ağ**dır. Toptancı abonelik parasını perakendecilere ulaşmak için öder. Perakendeci kaydı azalırsa toptancı için değer düşer ve toptancı da ayrılır.
- Perakendeci bağlantı başlatamıyor (K3), yani platformdan elde ettiği değer toptancıya bağlı. Değeri kendisi yaratamayan bir kullanıcıdan ücret almak zordur.
- Alıcı tarafından ücret almak, perakendeciyi alışkın olduğu telefon ve WhatsApp ile siparişe geri döndürür; bu sizin en büyük rakibinizdir.

### Önerilen toptancı planları (örnek yapı)

Fiyatlar sizin pazar araştırmanıza bağlıdır; aşağıdaki tablo yalnızca **neyin sınırlanacağını** gösterir.

| Sınır / özellik | Başlangıç | Pro | Kurumsal |
| --- | --- | --- | --- |
| Kullanıcı sayısı | 3 | 15 | Sınırsız |
| Aktif bağlı perakendeci | 50 | 500 | Sınırsız |
| Günlük bağlantı isteği | 20 | 100 | Anlaşmaya göre |
| Depo sayısı | 1 | 5 | Sınırsız |
| Stok modu | Var/yok | Miktarlı | Senkron (1C) |
| Kargocu uygulaması | — | Evet | Evet |
| Gelişmiş raporlar, dışa aktarma | — | Evet | Evet |
| e-qaimə / 1C entegrasyonu | — | — | Evet |
| Destek | E-posta | Öncelikli | Atanmış yönetici |

**En adil ölçüt "aktif bağlı perakendeci" sayısıdır**, çünkü toptancının platformdan aldığı değerle birlikte büyür.

### İleride perakendeci premium (opsiyonel)

Örnekler: çok şubeli işletmeler için gelişmiş onay kuralları, toptancılar arası alım raporları, bütçe ve harcama limitleri, muhasebe dışa aktarımı. Temel kullanım (istek kabulü, sipariş, cari görüntüleme) asla ücretli olmamalıdır.

### Teknik karşılığı: plan ve hak sistemi

Planlar kodda `if (plan == 'pro')` şeklinde yazılmaz. Bir **hak (entitlement)** sistemi kurulur:

- `plans` (ad, fiyat, para birimi, dönem, işletme tipi: toptancı/perakendeci)
- `plan_entitlements` (plan, özellik anahtarı, limit). Örnekler: `users.max = 15`, `connection_requests.daily = 100`, `feature.courier_app = true`.
- `subscriptions` (işletme, plan, başlangıç, bitiş, durum)
- `entitlement_overrides` (işletmeye özel istisna; admin tanımlar)

Kod yalnızca "bu işletmenin şu hakkı var mı / limiti ne?" diye sorar. Yeni plan, yeni fiyat veya perakendeci premium eklemek kod değil, admin panelinden ayar işidir. MVP'de abonelik ödemesi elle (banka havalesi) takip edilir; otomatik ödeme sonradan bu yapıya bağlanır.

## Modüller ve fonksiyonel gereksinimler

Sistem 13 modülden oluşur. MVP'de 9 modül tam, 4 modül basit haliyle yer alır.

| # | Modül | İçerik | Faz |
| --- | --- | --- | --- |
| 1 | Kimlik ve hesap | Telefon ve OTP ile giriş, adminler için 2FA, oturum ve cihaz yönetimi, işletmeler arası geçiş, perakendeci self-servis kayıt, toptancı başvuru formu | MVP |
| 2 | İşletme yönetimi | Profil, VÖEN, yetenek bayrakları (toptancı/perakendeci), şubeler, depolar, hizmet bölgeleri, para birimi, saat dilimi, veri görünürlüğü ayarları | MVP |
| 3 | Kullanıcı ve rol | Platform unvan kataloğu, rol şablonları, işletme rolleri, izin matrisi, kapsamlar | MVP |
| 4 | Bağlantı ağı | Perakendeci dizini ve arama, istek gönderme ve geri çekme, kabul/red/engel, iki taraflı iptal, süre dolumu, bekleme süresi, kota, bağlantı koşulları | MVP |
| 5 | Ürün kataloğu | Ortak kategori ve marka, ürün, varyant, barkod (GTIN), birim ve ambalaj hiyerarşisi, görseller, 4 dilde içerik, ürün görünürlüğü | MVP |
| 6 | Fiyat ve kampanya | Fiyat önceliği, fiyat listeleri, müşteriye ve (opsiyonel) şubeye özel fiyat, kademeli fiyat, kampanya, ƏDV ayarı, para birimi | MVP |
| 7 | Stok | Stok modu (takipsiz / var-yok / miktarlı), depo bazlı stok, rezervasyon, hareket kaydı, Excel ile yükleme | MVP (mod 0–2) |
| 8 | Sipariş | Ortak sepet, şube onayı, toptancı başına bölünme, sipariş düzenleme ve kısmi onay, tekrar sipariş, favoriler | MVP |
| 9 | Teslimat | Teslimat sağlayıcısı arayüzü, kendi kargocu, manuel dış kargo, uygulama içi teslim onayı ve otomatik onay, fotoğraf, GPS | MVP (temel), Faz 2 (rota, API kargo) |
| 10 | Cari ve belge | Toptancı–perakendeci çifti bazında borç/alacak, kredi limiti, vade, tahsilat, sipariş belgesi, e-qaimə uyumlu dışa aktarma, ekstre | MVP (temel), Faz 2 (yaşlandırma, mutabakat) |
| 11 | Bildirim | Bildirim kanalı arayüzü: MVP'de push ve yalnızca OTP için SMS; WhatsApp, SMS bildirimleri ve e-posta sonradan adaptörle. Şablonlar (4 dil), kullanıcı tercihleri | MVP |
| 12 | Abonelik ve haklar | Planlar, haklar, abonelikler, istisnalar, manuel ödeme takibi | MVP (temel) |
| 13 | Raporlama ve dashboard | Rol bazlı dashboardlar, Excel/PDF dışa aktarma, zamanlanmış raporlar | MVP (temel), Faz 2 |

**Toptancının perakendeci arama filtreleri:** şehir/rayon, faaliyet türü, doğrulanmış hesap, şube sayısı, kayıt tarihi, bağlantı geçmişi (hiç bağlanmamış, reddetmiş, iptal etmiş, bekleme süresi dolmuş) ve ünvan, telefon veya VÖEN ile tam eşleşme. Sonuçlar sayfalanır ve dizinde dışa aktarma yoktur.

**Perakendecinin ürün filtreleri:** bağlı toptancı, kategori, marka, fiyat aralığı, stokta olanlar, kampanyalı, yeni eklenen, daha önce aldıklarım, favoriler, kamerayla barkod arama ve satış birimi (adet/koli). Aynı ürünün bağlı toptancılar arasında barkodla karşılaştırılması bir iş kararıdır; açılırsa yalnızca bağlı toptancıları kapsar. Perakendecide toptancı arama ekranı yoktur (K3).

**Platform admin modülleri:** toptancı yönetimi ve başvuru onayı; **perakendeci yönetimi** (listeleme, askıya alma, silme/arşivleme, profil düzeltme, birleştirme, moderasyon); unvan ve rol şablonları; plan ve haklar; sistem ayarları (süreler, kotalar, bağlantısız hesap politikası, toptancı kayıt modu); ortak katalog (kategori, marka, birim, faaliyet türü, para birimi); çeviri yönetimi; bildirim şablonları; audit log; destek ve loglanan kullanıcı taklidi.

## Rol ve yetki (RBAC) modeli

Bir yetki üç parçadan oluşur: **modül × eylem × kapsam**. Rol, bu yetkilerin bir paketidir. Unvanlar ve rol şablonları platform admininde tutulur (D13). İşletme admini bir şablonu kopyalar ve izinlerini kendi ihtiyacına göre açıp kapatır.

### Eylemler

- **Görüntüle:** İzin yoksa ilgili menü hiç gösterilmez.
- **Oluştur, Düzenle, Sil:** Silme mümkün olduğunca arşivleme veya pasifleştirme olarak çalışır.
- **Onayla:** Sipariş (şube ve toptancı), iade ve indirim onayları.
- **Dışa aktar, İçe aktar:** Veri sızıntısı riski yüzünden ayrı izinlerdir.
- **Maliyeti gör:** Satış temsilcisi satış fiyatını görür, alış maliyetini ve marjı görmez.
- **Limitli indirim:** Örneğin en fazla %5.
- **Kullanıcı ve rol yönet:** Yalnızca işletme admini.
- **Finansal veriyi gör:** Cari, borç, ciro.

**Bağlantı ve onay izinleri:**

| İzin | Taraf | Açıklama |
| --- | --- | --- |
| Perakendeci dizinini gör | Toptancı | Arama ve listeleme |
| Bağlantı isteği gönder | Toptancı | Kotadan düşer; temsilci için "kendi bölgesi" kapsamı |
| Bağlantı koşullarını ata | Toptancı | Fiyat listesi, limit, vade, temsilci |
| Bağlantıyı iptal et | Her iki taraf | Kritik işlem: ikinci onay ve gerekçe zorunlu |
| Gelen isteği kabul et / reddet | Perakendeci | Yeni bir fiyat ve borç ilişkisi açar |
| Toptancıyı engelle | Perakendeci | Engeli kaldırma da aynı izinle |
| Sepeti onaya gönder | Perakendeci | Satın almacı ve şube çalışanı |
| Siparişi onayla (şube) | Perakendeci | Şube admini; tutar sınırı tanımlanabilir |

### Kapsam

Aynı izin farklı kapsamlarla verilebilir: **Tümü** (işletmenin tüm verisi), **Şube/Depo** (yalnızca kendi şubesi veya deposu), **Kendi atanan** (temsilci yalnızca kendi bölgesini ve müşterilerini, kargocu yalnızca kendi teslimatlarını görür).

### Varsayılan rol şablonları — Toptancı

| Modül | İşletme Admini | Satış Müdürü | Satış Temsilcisi | Muhasebe | Depo | Kargocu |
| --- | --- | --- | --- | --- | --- | --- |
| Kullanıcı ve rol | Tam | — | — | — | — | — |
| Ürün ve katalog | Tam | Görüntüle, düzenle | Görüntüle | Görüntüle | Görüntüle | — |
| Fiyat listeleri | Tam | Tam | Görüntüle (atanan) | Görüntüle | — | — |
| Stok | Tam | Görüntüle | Görüntüle | Görüntüle | Tam (kendi deposu) | — |
| Perakendeci dizini ve istek | Tam | Ara, istek gönder, koşul ata | Kendi bölgesinde ara ve istek gönder | — | — | — |
| Bağlantı iptali | Evet | Evet | Hayır (müdüre talep) | Hayır | — | — |
| Sipariş | Tam | Onayla, düzenle | Müşteri adına oluştur (kendi atanan) | Görüntüle | Hazırla | Kendi teslimatları |
| Teslimat | Tam | Görüntüle | Görüntüle | — | Kargocuya ata | Durum güncelle, "teslim ettim" |
| Cari ve tahsilat | Tam | Görüntüle | Kendi müşterisi, tahsilat gir | Tam | — | Kapıda tahsilat |
| Raporlar | Tam | Satış | Kendi performansı | Finans | Stok | — |
| Dışa aktar | Evet | Evet | Hayır | Evet | Hayır | Hayır |

### Varsayılan rol şablonları — Perakendeci

| Rol | Yetki |
| --- | --- |
| İşletme Admini | Tam yetki: kullanıcılar, şubeler, gelen istekler, engelleme, bağlantı iptali, veri görünürlüğü |
| Şube Admini | Kendi şubesinde sepeti onaylar ve gönderir, teslim alır, şube kullanıcılarını görür |
| Satın alma sorumlusu | Ürün görür, sepeti hazırlar ve onaya gönderir; gelen istekleri görür ama kabul edemez |
| Muhasebe | Cari, ekstre, belgeler, ödeme kayıtları (iptal edilmiş bağlantılar dahil) |
| Şube çalışanı | Kendi şubesinde sepete ekler, teslim alır |

### Platform rolleri

| Rol | Yetki |
| --- | --- |
| Süper Admin | Tam yetki, ayarlar, planlar |
| Operasyon | Toptancı ve perakendeci yönetimi, moderasyon |
| Destek | Görüntüleme, loglanan kullanıcı taklidi; değişiklik yapamaz |
| Çeviri ve içerik | Çeviriler, ortak katalog |

**Kurallar:** Son işletme admininin yetkisi kaldırılamaz. Yetki, bağlantı ve fiyat değişiklikleri audit loga yazılır. Yetki kontrolü **mutlaka backend'de** yapılır; menüyü gizlemek güvenlik sağlamaz. Bağlantı durumu da her istekte kontrol edilir: iptal edilmiş bir bağlantı üzerinden ürün veya fiyat çekilemez.

## Dashboardlar

Her dashboard kullanıcının **rolüne göre** açılır: aynı toptancıda müdür ciroyu, depocu bekleyen hazırlıkları, kargocu bugünkü rotasını görür. Her kart tıklanınca ilgili listeye filtreli gider; tarih aralığı (bugün / hafta / ay / özel) seçilebilir.

### Platform Admin

- Aktif toptancı / perakendeci sayısı, bu ay **self-servis perakendeci kaydı** sayısı
- **Hiç bağlantısı olmayan perakendeciler** (hiçbir toptancı istek göndermemiş): teşvik, uyarı, pasif ve silinecek aşamalarına göre sayılar. Bu, platformun en büyük kayıp noktasıdır; bölgesine göre toptancı satış ekiplerine yönlendirilir.
- Bağlantı istekleri: gönderilen, kabul oranı, red oranı, engelleme sayısı (toptancı bazında; yüksek engelleme = spam uyarısı)
- Toplam sipariş adedi ve hacmi (GMV, AZN), en aktif 10 toptancı
- Aboneliği bitmek üzere olan veya ödemesi geciken toptancılar, kotasını dolduranlar, plan yükseltme adayları (limitine yaklaşanlar)
- Moderasyon kuyruğu: şüpheli/mükerrer perakendeci kayıtları, şikayetler; açık destek talepleri, SMS bakiyesi

### Toptancı — Yönetim (İşletme Admini / Müdür)

- Bugün / bu ay ciro, sipariş adedi, ortalama sepet, geçen dönemle karşılaştırma
- Bekleyen işler: onay bekleyen sipariş, iade talebi, **yanıt bekleyen giden istekler**
- Aktif bağlantı sayısı ve bu ayki değişim (yeni kazanılan − iptal edilen)
- Toplam alacak, vadesi geçmiş alacak
- En çok satan ürünler, en çok alan perakendeciler, temsilci performans sıralaması

### Toptancı — Satış

- Hedef vs gerçekleşen (temsilci bazında)
- **Bağlantı hunisi:** bölgedeki perakendeci sayısı → istek gönderilen → kabul eden → ilk siparişi veren
- **Potansiyel müşteri listesi:** hizmet bölgesinde olup hiç istek gönderilmemiş yeni kayıtlı perakendeciler
- Bekleme süresi dolan (yeniden istek gönderilebilir) eski müşteriler
- **Uyuyan müşteriler** (X gündür sipariş vermeyen) ve iptal riski taşıyanlar
- Bölge bazında satış haritası, kampanya performansı, sepette bırakılan siparişler

### Toptancı — Lojistik / Depo

- Hazırlanacak siparişler (kalem adedi ile), bugün çıkacak sevkiyatlar
- Yoldaki ve geciken teslimatlar; kargocu bazında teslim sayısı ve başarı oranı
- Kritik stok seviyesindeki ve stoğu biten ürünler (kaybedilen satış)
- İade bekleyen ürünler, teslim edilemeyen siparişler ve nedenleri

### Toptancı — Muhasebe

- Toplam alacak, **yaşlandırma raporu** (0–30 / 31–60 / 61–90 / 90+ gün)
- **Bağlantısı iptal edilmiş ama borcu açık** perakendeciler — tahsilat riski en yüksek grup
- Bugün/bu ay tahsilat (nakit, havale, kart kırılımı), kredi limitini aşanlar
- Kesilmesi gereken faturalar, mutabakat bekleyen müşteriler, kargocuda bekleyen nakit

### Kargocu (mobil)

- Bugünkü teslimat listesi, harita üzerinde rota
- Her teslimatta adres, telefon, tahsil edilecek tutar, teslim onayı butonu
- Gün sonu: teslim edilen / edilemeyen, toplanan nakit

### Perakendeci

- **Gelen bağlantı istekleri** (kabul / red / engelle) en üstte; şube adminleri için ayrıca onay bekleyen sepetler
- Yeni kayıtlı ve hiç bağlantısı yoksa: "profilinizi tamamlayın, toptancılar sizi bulsun" kartı ve profil doluluk oranı
- Bağlı toptancılarım, aktif kampanyalar
- Açık siparişlerim ve durumları, bugün gelecek teslimatlar
- Toptancı bazında **borcum** (iptal edilmiş bağlantılar dahil), vadesi yaklaşan ödemeler
- Hızlı tekrar sipariş, sık aldığım ürünler, bu ayki toplam alım ve toptancı dağılımı

## Ekranlar ve rol bazlı görünüm

Web ve mobil aynı işi yapmaz. **Web yönetim ve yoğun veri girişi içindir** (katalog, fiyat, rapor, ayarlar). **Mobil, sahada ve hızlı yapılan işler içindir** (sipariş, onay, teslimat, tahsilat). Her ekranı iki platformda da yapmak MVP süresini ikiye katlar ve gereksizdir.

**Navigasyon ilkesi:** Menü sabit değildir; kullanıcının izinlerinden oluşturulur. İzni olmayan kullanıcı ekranı menüde hiç görmez. Her rolün açılış ekranı kendi dashboard'udur ("Dashboardlar" bölümü).

### Platform admini (yalnızca web)

| Ekran | İçerik |
| --- | --- |
| Dashboard | Platform metrikleri, moderasyon kuyruğu |
| Toptancılar | Liste, başvurular, hesap açma, askıya alma, yetenek onayı, plan ve hak istisnaları |
| Perakendeciler | Liste, VÖEN doğrulama, askıya alma, arşivleme, birleştirme, bağlantısız hesap aşamaları |
| Bağlantı denetimi | İstek ve engelleme istatistikleri, şikayetler |
| Katalog | Kategori, marka, birim, faaliyet alanı, para birimi, dil |
| Unvan ve roller | Unvan kataloğu, rol şablonları |
| Planlar | Plan, hak, abonelik, manuel ödeme takibi |
| Ayarlar | Süreler, kotalar, kayıt modu, otomatik onay süresi, bildirim şablonları |
| Çeviriler | Arayüz metinleri (4 dil) |
| Denetim | Audit log, kullanıcı taklidi kayıtları, destek talepleri |

### Toptancı — Web

| Ekran | İçerik | Kim görür |
| --- | --- | --- |
| Dashboard | Role göre | Herkes (rolüne göre içerik) |
| Perakendeci bul | Dizin, filtreler, istek gönderme | Admin, Satış Müdürü, Temsilci (kendi bölgesi) |
| Müşterilerim | Bağlı perakendeciler, koşullar, bağlantı geçmişi, iptal | Admin, Satış Müdürü; Temsilci (kendi atanan, salt-okunur koşullar) |
| İstekler | Gönderilen, bekleyen, reddedilen, bekleme süresi dolanlar | Admin, Satış Müdürü, Temsilci |
| Ürünler | Katalog, varyant, ambalaj, görsel, 4 dil, Excel ile yükleme | Admin, Satış Müdürü (düzenler); diğerleri görür |
| Fiyatlar | Fiyat listeleri, müşteri fiyatları, şube indirimleri, kademeli fiyat, kampanya | Admin, Satış Müdürü |
| Stok | Depo bazlı stok, hareketler, sayım, lot ve son kullanma tarihi | Admin, Depo; diğerleri görür |
| Siparişler | Gelen siparişler, onay ve düzenleme, durum, belge | Admin, Satış Müdürü, Muhasebe (görür), Depo (hazırlama) |
| Teslimat | Sevkiyat planı, kargocu ataması, itirazlar, konum uyuşmazlıkları | Admin, Depo |
| Cari | Müşteri bazında borç/alacak, tahsilat girişi, ekstre, yaşlandırma | Admin, Muhasebe; Temsilci (kendi müşterisi) |
| Raporlar | Satış, stok, finans; dışa aktarma | Role göre |
| Ekip | Kullanıcılar, roller, izinler | Yalnızca Admin |
| Ayarlar | İşletme profili, depolar, hizmet bölgeleri, stok modu, onay kuralları | Yalnızca Admin |

### Toptancı — Mobil

Mobil uygulama tektir, ama içerik role göre değişir:

| Rol | Mobil ekranlar |
| --- | --- |
| Admin / Satış Müdürü | Dashboard özeti, sipariş onayı, bağlantı istekleri, bildirimler |
| Satış Temsilcisi | Perakendeci bul (telefon/VÖEN ile hızlı arama), istek gönderme, müşterilerim, müşteri adına sipariş, müşteri borcu ve tahsilat girişi, ziyaret notu (Faz 2) |
| Depo | Hazırlanacak siparişler, barkodla toplama, stok sorgulama |
| Kargocu | Bugünkü teslimatlar, harita ve rota, "teslim ettim" (fotoğraf + GPS), kapıda tahsilat, gün sonu özeti |
| Muhasebe | Mobil gerekmez (web) |

### Perakendeci — Mobil (ana kanal)

Kozmetik dükkanı sahibi işini çoğunlukla telefondan yönetir. Bu yüzden perakendecinin ana kanalı mobildir.

| Ekran | İçerik | Kim görür |
| --- | --- | --- |
| Ana sayfa | Gelen istekler, onay bekleyen sepetler, bugünkü teslimatlar, kampanyalar | Herkes (rolüne göre) |
| Gelen istekler | Toptancı profil özeti, kabul / red / engelle | Admin (karar verir); Satın almacı (görür) |
| Ürünler | Bağlı toptancıların ürünleri, filtreler, barkod tarama | Admin, Şube Admini, Satın almacı, Şube çalışanı |
| Sepet | Toptancıya göre gruplu sepet, minimum tutar, limit uyarısı, onaya gönder | Sepet izni olanlar |
| Onaylar | Onay bekleyen sepetler, düzeltme, onayla ve gönder | Admin, Şube Admini |
| Siparişlerim | Durumlar, teslimat onayı veya itiraz, tekrar sipariş | Herkes (kendi şubesi) |
| Toptancılarım | Bağlı toptancılar, koşullar, bağlantı iptali, engellenenler | Admin |
| Cari | Toptancı bazında borç, ekstre, vade | Admin, Muhasebe |
| Profil ve gizlilik | İşletme bilgileri, VÖEN, şubeler, görünürlük ayarları | Admin |
| Ekip | Kullanıcılar ve roller | Admin |

### Perakendeci — Web

Mobildeki ekranların aynısı web'de de bulunur (aynı API ve tasarım dili; Next.js ile duyarlı sürüm). Ayrıca web'de muhasebe için ekstre indirme ve çok şubeli işletmeler için toplu sepet düzenleme kolaylığı sunulur. MVP'de perakendeci web'i, mobil ekranların web sürümüyle sınırlı tutulabilir.

## Çok dilli ve bölgesel yapı

Dil, para birimi, saat dilimi ve format **kodda sabit tutulmaz**. Hepsi ayar tablolarıyla yönetilir. Azerbaycan ilk ülkedir, ama yeni bir ülke eklemek kod değişikliği gerektirmemelidir.

### Dil

- **Diller tablosu:** kod, ad, aktif, varsayılan, sıra, yazı yönü (soldan sağa / sağdan sola). Başlangıç dilleri: az, ru, en, tr.
- **Arayüz metinleri:** anahtar–dil–değer olarak veritabanında tutulur ve admin panelinden düzenlenir. Uygulamaya JSON olarak, önbelleğe alınarak verilir. Çevirisi eksik bir metin varsayılan dilde gösterilir.
- **İçerik çevirileri:** Ürün, kategori, birim ve faaliyet türü adları ayrı çeviri kayıtlarında tutulur. Toptancı en az bir dilde girer; diğer diller için makine çevirisi önerilir ve onaylanır.
- **Bildirimler** (push, WhatsApp, SMS) kullanıcının dilinde gönderilir. Şablonlar 4 dilde tutulur.
- **Arama:** Meilisearch'e ürün adlarının tüm dillerdeki halleri eklenir. Kiril–Latin dönüşümü ("мыло" ve "sabun" gibi eş anlamlılar ile "şampun" ve "шампунь" gibi yazımlar) eş anlamlı sözlükle desteklenir.
- **Sıralama:** Azerbaycan harfleri (ə, ğ, ı, ö, ü, ş, ç) için doğru alfabetik sıralama kullanılır.

### Para birimi

- **Para birimleri tablosu:** ISO 4217 kodu (AZN, USD, EUR, TRY, RUB…), sembol, ondalık hane sayısı, aktif. Admin yeni para birimi ekleyebilir.
- **Varsayılan zinciri:** ülke → işletme → fiyat listesi. Azerbaycan'da varsayılan AZN'dir.
- Her fiyat listesi ve her sipariş **kendi para birimini taşır**. Tutar her zaman para birimiyle birlikte saklanır.
- MVP'de **kur dönüşümü yapılmaz**: bir sipariş tek para birimindedir. Raporlar para birimine göre ayrı toplam gösterir. Kur tablosu ve dönüşüm ihtiyaç olursa sonra eklenir.
- Tutarlar `decimal` tipinde saklanır, asla `float` kullanılmaz.

### Saat dilimi

- Tüm zamanlar veritabanında **UTC** olarak saklanır.
- Gösterim için saat dilimi şu sırayla seçilir: **kullanıcı → işletme → ülke** (IANA adlarıyla, ör. `Asia/Baku`, `Europe/Istanbul`).
- "Bugünkü siparişler", vade ve "14 gün sonra süresi dolar" gibi iş kuralları **işletmenin saat diliminde** hesaplanır. Aksi halde gece yarısı civarındaki siparişler yanlış güne düşer.

### Format

Tarih, sayı ve ondalık ayırıcı dile ve ülkeye göre otomatik biçimlenir (ör. `23.10.2026` ve `1 234,50 ₼`). Telefon numaraları uluslararası formatta (E.164, ör. +994…) saklanır.

## Teknik mimari

Önerim: **baştan sona TypeScript.** Backend'de NestJS, web'de Next.js, mobilde React Native (Expo), veritabanı olarak PostgreSQL. Sebebi teknik üstünlük değil, sizin durumunuz: projeyi büyük ölçüde AI ile geliştireceksiniz ve tek bir dil, bağlam kaybını ve hatayı en aza indirir.

### Önce bir düzeltme: Next.js backend değildir

Sorunuzda Next.js'i Python ve Spring Boot ile karşılaştırdınız. Önceki raporda Next.js **web arayüzü** için önerildi. Backend için önerilen **NestJS** idi. Bunlar farklı katmanlardır. Asıl soru şudur: backend'i hangi dilde yazmalısınız?

### Backend seçenekleri

| Seçenek | Güçlü yanı | Zayıf yanı (sizin için) | Değerlendirme |
| --- | --- | --- | --- |
| **NestJS (TypeScript)** | Web ve mobil ile aynı dil; tipler paylaşılır; modüler yapı RBAC ve çok kiracılı yapıya uygun; AI araçları bu ekosistemde çok güçlü | Çok yüksek trafikte Java/.NET kadar verimli değil (bu ölçekte fark edilmez) | **Önerim** |
| Spring Boot (Java/Kotlin) | Kurumsal standart; çok olgun; güvenlik ve işlem (transaction) yönetimi çok güçlü | Ayrıntılı (verbose) kod; frontend ile iki ayrı dil; tek kişi ve AI ile ilerlemek daha yavaş | Büyük ekip ve kurumsal müşteri için iyi; sizin için ağır |
| .NET (C#) | Performans, olgun ORM, iyi araçlar | Frontend ile ayrı dil; ekosistem Azerbaycan'da daha dar olabilir | İyi ama ek avantajı yok |
| Python (Django / FastAPI) | Yazması hızlı; veri ve AI özellikleri için güçlü | Dinamik tipler büyük projede AI hatalarını gizler; frontend ile ayrı dil | Raporlama veya AI servisi olarak sonradan eklenebilir |
| Laravel (PHP) | Çok hızlı başlangıç | Mobil ve web ile tip paylaşımı yok; uzun vadede ölçek ve ekip bulma riski | Önermiyorum |

**Karar ölçütü:** Bir alan (ör. sipariş tutarı) backend'de, web'de ve mobilde aynı tip tanımını kullanırsa, AI bir yeri değiştirdiğinde diğer yerlerdeki uyumsuzluk derleme anında yakalanır. Ayrı dillerde bu hata ancak çalışırken ortaya çıkar.

### Katmanlar

| Katman | Seçim | Not |
| --- | --- | --- |
| Backend | NestJS + TypeScript | Modüler monolit: her modül ayrı klasör, ileride ayrılabilir |
| ORM / veritabanı | PostgreSQL + Prisma veya Drizzle | Row-Level Security ile kiracı izolasyonu; migration'lar kodla yönetilir |
| Web | Next.js (React) | Admin, toptancı ve perakendeci panelleri; i18n desteği |
| Mobil | React Native (Expo) | Tek kodla iOS ve Android; tipler backend ile paylaşılır. Flutter da iyi bir seçenek, ama ikinci bir dil (Dart) getirir. |
| Cache ve kuyruk | **Redis** (sizin seçiminiz) + BullMQ | Doğru seçim. Oturum, çeviri önbelleği, OTP limitleri ve arka plan işleri (bildirim, rapor) için. |
| Arama | **Meilisearch** (sizin seçiminiz) | Doğru seçim. Çok dilli, yazım hatasına toleranslı ve kurulumu kolay. Kiracı filtresi her sorguda zorunlu olmalı. |
| Dosya ve CDN | **Cloudflare R2 + Cloudflare CDN** (sizin seçiminiz) | Doğru seçim. R2'de dışarı veri çıkış ücreti yoktur ve S3 uyumludur. Fatura ve ekstreler için özel (private) bucket ve süreli imzalı link kullanılmalı. |
| Bildirim | Push (Firebase/Expo) + **WhatsApp Business API** (sonra) + SMS (OTP) | MVP'de push bildirimi ve yalnızca OTP için SMS. WhatsApp Business API sonradan adaptörle eklenir (şablon onayı gerekir, mesaj başına ücretlidir). |
| Kod ve CI/CD | **GitHub** (sizin öneriniz) + GitHub Actions | Doğru, ama bir sistem katmanı değil, geliştirme altyapısıdır (bkz. "AI destekli geliştirme"). |
| Barındırma | AWS, Frankfurt bölgesi (D21) | Ayrıntılar aşağıdaki "Barındırma" başlığında. |
| İzleme | Sentry (hatalar) + uptime izleme | Başlangıç için yeterli |

### Barındırma: AWS ile düşük maliyetli başlangıç (D21)

AWS doğru bir seçim, ama AWS'de maliyeti yükselten şey genellikle sunucu değil, **gereksiz yönetilen servislerdir** (yük dengeleyici, NAT gateway, birden fazla ortam). Önerim: pilotta mimariyi sade tutun ve büyüdükçe yönetilen servislere geçin. Kod Docker ile paketlendiği için bu geçiş, yeniden yazım gerektirmez.

**Bölge:** `eu-central-1` (Frankfurt). Azerbaycan'a yakın ve çok yaygın kullanılan bir AWS bölgesidir. Cloudflare önde olduğu için statik içerik ve görseller zaten yakın noktalardan sunulur.

| Aşama | Uygulama (API, web) | Veritabanı | Redis ve Meilisearch | Ne zaman |
| --- | --- | --- | --- | --- |
| **Pilot** | 1 adet Lightsail sunucusu veya küçük bir EC2, Docker Compose ile | Yönetilen PostgreSQL (Lightsail Database veya küçük RDS), otomatik yedekli | Aynı sunucuda Docker konteyneri | 2 toptancı ve onların perakendecileri |
| **İlk büyüme** | 2 sunucu veya ECS; yük dengeleyici | RDS (daha büyük sınıf, Multi-AZ isteğe bağlı) | Ayrı küçük sunucu veya ElastiCache | Ücretli müşteriler ve kesintisizlik ihtiyacı |
| **Ölçek** | ECS / otomatik ölçekleme | RDS Multi-AZ + okuma kopyası | ElastiCache; Meilisearch ayrı sunucu | Trafik ve müşteri sayısı arttığında |

**Pilotta veritabanını kendiniz kurmayın.** Uygulama sunucusu bozulursa yeniden kurulur, ama veritabanı kaybolursa işletmelerin carisi kaybolur. Yönetilen veritabanının otomatik yedeği, ek maliyetine değer.

**Maliyet kontrolü:**

- İlk gün **AWS Budgets** ile aylık bütçe alarmı kurun. Beklenmeyen fatura riskine karşı en önemli tek adım budur.
- Pilotta **NAT gateway ve yük dengeleyici kullanmayın**. İkisi de sabit saatlik ücretlidir. Trafiği Cloudflare karşılar.
- **Staging (test) ortamı** küçük olsun ve kullanılmadığında kapatılsın.
- Görseller ve dosyalar R2'de kalsın. AWS'den dışarı veri çıkışı ücretlidir; R2'de bu ücret yoktur.
- Sunucu boyutu sabitlendikten sonra Savings Plans veya rezerve kapasiteyle indirim alınabilir.
- AWS'nin girişimlere yönelik kredi programlarının (ör. AWS Activate) koşullarını kontrol edin.

**Veri ayrımı:** Açık konu 1'deki hukuki teyit olumsuz çıkarsa diye, kişisel veriler (ad, telefon, adres) ayrı tablolarda tutulur. Böylece gerekirse yalnızca bu veriler yerel bir sunucuya taşınabilir.

### API sürümleme nedir ve nasıl yönetilir?

**Sorun:** Web sitesini güncellediğinizde herkes yeni sürümü görür. Mobil uygulamada ise öyle olmaz: kullanıcıların bir kısmı uygulamayı aylarca güncellemez. Sunucudaki API'de bir alanın adını değiştirirseniz (ör. `price` yerine `unitPrice`), eski uygulamayı kullanan perakendecinin sepeti çalışmaz.

**Çözüm:** API adresine sürüm numarası eklenir: `/api/v1/orders`. Eski uygulamayı bozacak bir değişiklik gerektiğinde `/api/v2/orders` açılır. Eski uygulamalar v1'i, yeni uygulamalar v2'yi kullanır.

**Yönetim kuralları:**

1. **Eklemek serbesttir, değiştirmek ve silmek değildir.** Yeni alan veya yeni endpoint eklemek mevcut sürümü bozmaz. Bunlar v1 içinde yapılır. Sürüm atlamak yalnızca alan silme, ad değiştirme veya anlam değiştirme durumunda gerekir.
2. **Aynı anda en fazla iki sürüm** desteklenir (ör. v1 ve v2). Eski sürüm için kaldırma tarihi duyurulur (öneri: 6 ay).
3. **Minimum uygulama sürümü:** Uygulama her açılışta `/api/app-config` adresine sorar: "benim sürümüm hâlâ destekleniyor mu?" Desteklenmiyorsa "Lütfen uygulamayı güncelleyin" ekranı gösterilir. Bu, eski sürümü kapatmanın güvenli yoludur.
4. **Sözleşme önce yazılır:** API, OpenAPI dosyasıyla tanımlanır. Web ve mobil istemci kodu bu dosyadan otomatik üretilir. AI'a da "önce OpenAPI'yi güncelle" kuralı verilir.
5. API cevapları loglarda sürüm etiketiyle izlenir. Böylece v1'i hâlâ kullanan kullanıcı sayısı görülür ve kapatma kararı veriyle alınır.

### Temel veri modeli

- `businesses` (id, name, voen, legal\_type, country, region, currency, timezone, status, created\_via: admin / self\_signup). Her işletme **tek bir kayıttır**; tipi yoktur.
- `business_capabilities` (business\_id, capability: `seller` / `buyer`, status: pending / approved / suspended, approved\_by, approved\_at). Toptancılık `seller`, perakendecilik `buyer` yeteneğidir. **Her yeteneğin kendi onay durumu vardır**: bir işletmenin perakendeciliği aktifken toptancılığı onay bekleyebilir (D20).
- `seller_profiles` (business\_id, hizmet bölgeleri, stok modu, kayıt modu, varsayılan fiyat listesi …) ve `buyer_profiles` (business\_id, faaliyet alanı, profil doluluğu …). Role özel bilgiler buradadır, `businesses` tablosunda değil.
- `business_privacy` (buyer\_id, alan bazında görünürlük, dizinde görünme)
- `person_data` (kişisel veriler: yetkili adı, kişisel telefon, e-posta). Gerekirse yerelleştirilebilmesi için ayrı tutulur.
- `branches` (onay kuralı, onay tutar sınırı), `warehouses`
- `users` ↔ `memberships` (user\_id, business\_id, role\_id, scope, branch\_id)
- `job_titles` (hangi yeteneğe ait olduğu), `role_templates`, `roles`, `permissions` (her izin bir yeteneğe bağlıdır), `role_permissions`
- `connection_requests` (seller\_id, buyer\_id, sent\_by, message, proposed\_terms, status, expires\_at, responded\_at, responded\_by)
- `connections` (seller\_id, buyer\_id, request\_id, status, price\_list\_id, credit\_limit, payment\_term\_days, sales\_rep\_id, started\_at, ended\_at, ended\_by\_side, end\_reason). Her bağlantı dönemi ayrı satırdır; aynı çift için tek aktif satır olur.
- `blocks` (buyer\_id, seller\_id)
- `settings` (scope: platform / plan / business, key, value)
- `plans` (hangi yetenek için), `plan_entitlements`, `subscriptions`, `entitlement_overrides`
- `units`, `unit_translations`, `unit_conversions`
- `categories`, `brands`, `products` (seller\_id, son kullanma tarihli mi), `product_variants`, `product_packaging`, `product_translations`, `product_visibility`
- `price_lists`, `price_list_items`, `customer_prices` (buyer\_id, opsiyonel branch\_id), `branch_discounts`, `tier_prices`, `promotions`
- `stock` (variant\_id, warehouse\_id, on\_hand, reserved), `stock_movements` (lot\_no, expiry\_date)
- `carts` (buyer\_id, branch\_id), `cart_items`, `cart_approvals`
- `orders` (**seller\_id, buyer\_id**, cart\_id, connection\_id, currency, …), `order_items` (birim, fiyat, lot\_no, expiry\_date kopyası), `order_status_history`
- `deliveries` (provider, tracking\_no, auto\_confirm\_at), `delivery_proofs` (fotoğraf, GPS, zaman, onay/itiraz)
- `ledger_entries` (seller\_id, buyer\_id, currency, …). Cari, bağlantıya değil **satıcı–alıcı çiftine** bağlıdır.
- `payments` (method, provider), `documents` (sipariş belgesi; ileride e-qaimə numarası ve durumu)
- `currencies`, `languages`, `translations`, `notification_templates`, `notifications`, `audit_logs`, `external_refs`

**Yetki kuralı (D20):** Kod hiçbir yerde "bu işletme toptancı mı?" diye sormaz. "Bu işletmenin onaylı `seller` yeteneği var mı ve kullanıcının bu yeteneğe ait izni var mı?" diye sorar. Çift rolü açmak, bir işletmeye ikinci yetenek kaydı eklemek ve onaylamaktan ibarettir. Arayüzde ise kullanıcı iki rol arasında geçiş yapar ("Satıcı paneli / Alıcı paneli").

**Tasarım ilkeleri:** Her sorguda kiracı kimliği (business\_id) zorunludur. Fiyat, ürün adı ve birim siparişe o anki haliyle kopyalanır. Tutarlar `decimal` tipinde saklanır. Zamanlar UTC'de saklanır ve kullanıcının, işletmenin veya ülkenin saat diliminde gösterilir. API sürümlüdür.

## Genişletilebilirlik ilkeleri

"Dinamik bırak" talebinin doğru karşılığı, her şeyi bugünden yapmak değil, **bugün dört dikiş yeri bırakmaktır**. Bunlar ayarlar, haklar, adaptörler ve kimlikler. Bu dördü olmadan yapılan her "dinamik" özellik sonradan pahalı bir yeniden yazıma dönüşür. Dört dikiş yeri olunca ise yeni özellik eklemek kodu bozmadan yapılır.

### Dört dikiş yeri

1. **Ayarlar (settings):** Süreler, kotalar, kayıt modu ve politikalar platform, plan ve işletme katmanlı tek bir tabloda tutulur. Kod sabit değer içermez.
2. **Haklar (entitlements):** Özellikler ve limitler plana bağlıdır. Kod yalnızca "hakkı var mı?" diye sorar.
3. **Adaptörler:** Dış sistemle konuşan her şey (ödeme, kargo, bildirim, e-qaimə, ERP) bir arayüzün arkasındadır. Yeni bir sağlayıcı eklemek, yalnızca yeni bir adaptör yazmak demektir.
4. **Harici kimlikler ve olaylar:** Her ana kayıt (ürün, perakendeci, sipariş) bir dış sistemdeki karşılığını `external_refs` tablosunda tutabilir. Önemli olaylar ("sipariş onaylandı", "stok değişti") bir olay kuyruğuna yazılır. Entegrasyonlar bu olaylardan beslenir.

### Gelecek özellikler ve bugün gereken hazırlık

| Gelecek özellik | Bugün yapılacak hazırlık | Sonra yapılacak iş |
| --- | --- | --- |
| Online ödeme | `payments.provider` alanı; ödeme sağlayıcısı arayüzü; cari ile ödeme ayrı tablolar | Banka veya ödeme sağlayıcısı adaptörü |
| Toptancı self-servis kaydı | `onboarding_mode` ayarı; plan ve hak sistemi | Ödeme adaptörü ve kayıt ekranı |
| Perakendeci premium | Plan tablosunda işletme tipi alanı | Plan tanımı ve özelliklerin geliştirilmesi |
| Dış kargo API | Teslimat sağlayıcısı arayüzü | Firma adaptörleri |
| e-qaimə | VÖEN zorunluluğu; belge tablosu; e-qaimə alan eşlemesi | Vergi sistemi veya 1C adaptörü |
| 1C / ERP | `external_refs`; olay kuyruğu; ürün, stok ve fiyat için toplu içe aktarma API'leri | 1C adaptörü (çift yönlü senkron) |
| Offline mobil | Tüm yazma işlemlerinde istemcinin ürettiği benzersiz kimlik (idempotency key); kayıtlarda `updated_at` | Mobilde yerel veritabanı ve senkron kuyruğu |
| Toptancı aynı zamanda perakendeci | `business_capabilities` tablosu | Rol ve arayüz geçişi |
| Yeni ülke | Ülke, para birimi, saat dilimi ve dil tabloları | Yerel vergi ve fatura adaptörü |
| Yeni dil | Diller ve çeviriler tablosu | Çeviri girişi |

### Yapılmaması gerekenler

- Gelecek özellik için bugünden **kullanılmayan ekran veya kod yazmak**. Bu, bakım yükü ve hata kaynağıdır. Bugün yalnızca veri modeli ve arayüz hazırlanır.
- "Her şey ayarlanabilir olsun" yaklaşımı. Her ayar test edilmesi gereken yeni bir durum demektir. Bir değer ancak gerçekten değişmesi beklendiğinde ayar yapılmalıdır.

### Özellik bayrakları (feature flags)

Yeni bir özellik önce kapalı olarak yayınlanır, pilot toptancıda açılır, sonra herkese açılır. Böylece "gelecekte ekleriz" denilen bir özellik, canlı sistemi riske atmadan adım adım devreye alınır.

## Eksikler, hatalar ve riskler

Bu revizyonla sipariş, fiyat, birim, stok, teslimat ve cari tasarımı tamamlandı. Şimdi kalan en büyük üç risk **teknik değil**: perakendeci verisinin hukuki durumu, ağın başlatılması (perakendeci boş ekranla başlıyor) ve projenin tek kişi tarafından AI ile geliştirilmesi.

### Çözülen eksikler (bu revizyonda)

Birim ve ambalaj, stok modları, fiyat önceliği, teslimat sağlayıcıları ve teslim onayı, mağaza onay akışı, ortak sepetin bölünmesi, abonelik ve haklar, para birimi ve saat dilimi, ERP ve offline hazırlığı. Bunların her biri kendi bölümünde ele alındı.

### Açık riskler

| Risk | Etki | Olasılık | Önlem |
| --- | --- | --- | --- |
| Perakendeci verisinin mevzuata aykırı paylaşılması | Yüksek | Orta | Kişisel veriler varsayılan kapalı (D7), açık onay, hukuki görüş |
| Ağ başlamıyor: perakendeci kaydolur, istek gelmez, uygulamayı siler | Yüksek | Yüksek | Pilot toptancı kendi mevcut müşterilerini getirir; yeni kayıt bildirimleri; bağlantısız hesap politikası (D11) |
| Toptancı perakendeci dizinini kazır veya spam yapar | Yüksek | Orta | Kota, bekleme süresi, engelleme oranı eşiği, dışa aktarmanın yasak olması, sayfalama ve hız sınırı |
| Tenant sızıntısı (bir toptancı diğerinin verisini görür) | Çok yüksek | Düşük–orta | Her sorguda business\_id, PostgreSQL RLS, otomatik izolasyon testleri |
| AI'ın ürettiği kodda fark edilmeyen güvenlik veya mantık hatası | Yüksek | Yüksek | Test zorunluluğu, küçük adımlar, insan incelemesi, güvenlik tarama araçları (bkz. "AI destekli geliştirme") |
| Tek geliştiriciye bağımlılık | Yüksek | Yüksek | Dokümantasyon, otomatik testler, sözleşmeye bağlı dış inceleme (code review) |
| WhatsApp ve SMS maliyetinin kontrolden çıkması | Orta | Orta | Push varsayılan, OTP limitleri, aylık maliyet raporu |
| Şube onayının küçük işletmeyi yavaşlatması | Orta | Orta | Onay kuralı şube bazında ayarlanabilir; "onaysız" seçeneği |
| e-qaimə ve elektronik imza entegrasyonunun beklenenden zor çıkması | Orta | Yüksek | MVP'de dışa aktarma, Faz 3'te 1C üzerinden |
| Mobil uygulamanın eski sürümlerinin bozulması | Orta | Orta | API sürümleme ve minimum sürüm kontrolü |
| Otomatik silmede hatalı veri kaybı | Yüksek | Düşük | Geçmişi olan hesap asla silinmez; silme öncesi yedek ve anonimleştirme |

### Mantık belirsizlikleri

- **İstek bildirimi ve K3:** Gelen istekte toptancının profili görünmek zorunda; bu bilinçli bir istisnadır. Red veya süre dolumundan sonra bu profil perakendeciden tekrar gizlenmelidir.
- **Perakendeci yeni bir toptancı istediğinde:** Sistemde yolu yok; sistem dışında iletişim beklenir. İleride perakendecinin "şu kategoride tedarikçi arıyorum" ilanı vermesi düşünülebilir. İlanı toptancılar görür, perakendeci toptancıları görmez, böylece K3 bozulmaz.
- **Ürün karşılaştırması:** Açılırsa yalnızca bağlı toptancılar arasında çalışmalıdır. Aksi halde K3 dolaylı olarak delinir.
- **Toptancı ve perakendeci aynı VÖEN'de:** Yetenek bayraklarıyla modellenir (D20). Arayüzün nasıl görüneceği sonra kararlaştırılır.

### Güvenlik kontrol listesi

- Kiracı izolasyonu: her sorguda business\_id kontrolü, PostgreSQL RLS ve otomatik testler.
- Rakip bağlantıları ve alım hacmi hiçbir API cevabında dönmemelidir.
- İptalden sonra mobil önbellekteki fiyat ve ürün verisi temizlenmeli; backend iptal edilmiş bağlantı için sipariş kabul etmemelidir.
- Yetki ve bağlantı durumu her istekte backend'de doğrulanmalıdır.
- OTP ve giriş denemelerine hız sınırı; adminler için 2FA.
- Dosyalar özel bucket'ta tutulmalı; erişim süreli imzalı linkle verilmeli.
- API anahtarları ve gizli bilgiler (secret) koda veya AI sohbetine asla yazılmamalı; ortam değişkenleri ve gizli bilgi yöneticisi kullanılmalı.
- Günlük otomatik yedek ve düzenli geri yükleme testi; audit log.

## AI destekli geliştirme süreci

Karmaşık görünen bu süreç aslında **üç farklı iş** demektir. Her işi farklı bir "şapka" gibi düşünün. Aynı anda yalnızca bir şapka takarsınız ve her şapkanın kendi aracı vardır:

| Şapka | Sorduğunuz soru | Araç | Çıktı | Nerede saklanır |
| --- | --- | --- | --- | --- |
| 🧠 **Mimar** | "Ne yapacağız? Nasıl tasarlamalıyız?" | Claude (claude.ai'de bir Proje içinde sohbet) | Modül spesifikasyonu, karar (ADR), veri modeli, görev kartı | Depoda `docs/` klasörü |
| 🔨 **Usta** | "Bunu kodla, testini yaz, çalıştır." | Antigravity (veya terminalde Claude Code) | Kod, test, migration | Git dalı (branch) |
| 🔍 **Müfettiş** | "Bu doğru mu, güvenli mi, spesifikasyona uyuyor mu?" | Kodu **yazmamış** yeni bir oturum + GitHub Actions | Bulgu listesi | Pull request yorumları |

### Hangisine ihtiyacınız olduğunu nasıl anlarsınız?

- Kafanızda soru işareti varsa, ne yapılacağı belli değilse veya iki seçenek arasında kaldıysanız → **Mimar.** Kod yazmaya başlamayın.
- Ne yapılacağı yazılı ise (görev kartı hazır ve kabul kriterleri belli) → **Usta.**
- Usta "bitti" dediyse → **Müfettiş.** Kod `main` dalına müfettişten geçmeden girmez.
- Usta aynı hatada iki kez takıldıysa veya spesifikasyonda olmayan bir karar vermesi gerekiyorsa → dur, **Mimar'a dön.** Bu en sık yapılan hatadır: usta şapkasıyla tasarım kararı vermek.

### Neden bu ayrım?

Kodu yazan AI kendi hatasını göremez, çünkü kendi varsayımlarıyla bakar. Tasarım kararı kod yazarken verilirse kayda geçmez ve bir sonraki oturumda AI farklı bir karar verir. Üç şapka bu iki sorunu çözer.

**Kullanım limitleri de bu ayrımı destekler.** Pro planında Claude ve Claude Code aynı kullanım limitini paylaşır; 5 saatlik oturum limiti ve haftalık limit vardır ([Claude destek](https://support.claude.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan)). Bu yüzden Claude'u az hacimli ama yüksek değerli işlerde (mimari ve inceleme), Antigravity'yi ise yüksek hacimli kod yazımında kullanmak limitleri en verimli kullanmanın yoludur.

### 🧠 Mimar: Claude Projesi ve oturum düzeni

claude.ai'de projeye özel bir **Proje** açın. Projenin iki parçası vardır: **talimatlar** (Claude'un nasıl davranacağı) ve **bilgi tabanı** (Claude'un bileceği dosyalar). Önemli bir kural: Proje içindeki sohbetler birbirini görmez. Kalıcı olması gereken her şey bilgi tabanına eklenmelidir ([Claude destek](https://support.anthropic.com/en/articles/9519177-how-can-i-create-and-manage-projects)).

**Proje talimatı (örnek):**

> Sen bu B2B platformunun baş mimarısın. Kaynak belgeler: product-report.md, AGENTS.md, decisions.md. Karar kayıtlarıyla (D1–D25) ve iş kurallarıyla (K1–K11) çelişen bir öneri yapma; çelişki gerekiyorsa bunu açıkça söyle ve yeni bir karar önerisi yaz. Kod yazma; spesifikasyon, veri modeli, görev kartı ve ADR üret. Her sohbetin sonunda alınan kararları "Bu sohbette alınan kararlar" başlığıyla listele.

**Bilgi tabanına yüklenecek dosyalar:** `product-report.md` (bu raporun dışa aktarılmış hali), `AGENTS.md`, `decisions.md`, `glossary.md`, `docs/modules/*.md`, veritabanı şeması ve `openapi.yaml`.

**Oturum kuralları:**

1. **Bir sohbet, bir konu.** Sohbeti numarasıyla adlandırın: "F2.3 – Bağlantı isteği spesifikasyonu".
2. Sohbet uzadığında, AI tutarsızlaşmaya başladığında veya konu değiştiğinde yeni bir sohbet açın.
3. Sohbetin sonunda Claude'dan çıktıyı **dosya halinde** isteyin (spesifikasyon, ADR, görev kartı).
4. Bu dosyaları depoya koyun ve bilgi tabanındaki eski sürümün yerine yükleyin. **Gerçek kaynak her zaman depodur**; Proje bilgi tabanı onun kopyasıdır.

**Modül spesifikasyonu şablonu:**

```
# Modül: Bağlantı ağı
## Amaç
## İlgili kurallar ve kararlar: K3, K4, K5, K6, D7, D9, D10
## Veri modeli (tablolar, alanlar, kısıtlar)
## API (endpoint, girdi, çıktı, hata kodları)
## Ekranlar (web / mobil, rol)
## Kabul kriterleri
- [ ] İptal edilmiş bağlantıda perakendeci ürün göremez
- [ ] Bekleme süresi dolmadan istek gönderilemez
## Kapsam dışı
```

### 🔨 Usta: editörde kod yazma

Antigravity, görevi bir AI ajanına verip sonucunu incelediğiniz "ajan öncelikli" bir geliştirme ortamıdır. Proje kökündeki `AGENTS.md` dosyasını kural dosyası olarak okur ([kaynak](https://docs.coingecko.com/docs/ai-agent-hub/antigravity)). Aynı dosyayı Claude Code da okuyabildiği için, kuralları tek bir dosyada tutmak yeterlidir.

**Ayarlar:**

- Ajanın her şeyi onaysız yapmasına izin vermeyin. Kontrol noktalarında durup sizin onayınızı bekleyen bir inceleme ayarı seçin.
- Birden fazla dosyayı etkileyen işlerde önce plan çıkaran **planlama modunu** kullanın.

**Bir görevin akışı:**

1. Yeni bir git dalı açın: `feature/F2.3-connection-request`.
2. Ajana **görev kartını** verin (aşağıdaki şablon). Kart, spesifikasyon dosyasına bağlantı verir.
3. Ajandan önce bir plan isteyin: hangi dosyaları değiştirecek, hangi testleri yazacak. Planı okuyup onaylayın.
4. Ajan kodu ve testleri yazar ve testleri çalıştırır.
5. Uygulamayı kendi bilgisayarınızda açıp senaryoyu elle deneyin.
6. Değişikliği commit edin ve pull request açın. Ardından müfettiş aşaması başlar.

**Görev kartı şablonu:**

```
Görev: F2.3 – Toptancı bağlantı isteği gönderir
Spesifikasyon: docs/modules/connections.md (bölüm 2)
Yapılacak: POST /api/v1/connection-requests + servis + testler
Kurallar: kota (D10), bekleme süresi (D9), engel kontrolü, tek bekleyen istek
Kabul kriterleri: spesifikasyondaki 1–6 numaralı maddeler
Dokunma: ödeme, sipariş modülleri
Bitti tanımı: testler geçiyor, OpenAPI güncellendi, CHANGELOG'a satır eklendi
```

**Usta için kurallar:**

- Bir görev = bir dal = bir pull request. Görev büyükse Mimar'a dönüp bölün.
- Kritik mantıkta önce testi yazdırın: fiyat önceliği, stok rezervasyonu, kiracı izolasyonu, bağlantı durum geçişleri, cari.
- Ajanın önerdiği her yeni paketi kontrol edin. Var olmayan veya terk edilmiş bir paket önerilebilir.
- API anahtarı, şifre ve gerçek müşteri verisi ajana verilmez. `.env` dosyası depoya girmez.
- Ajan spesifikasyonda olmayan bir karar vermek zorunda kalırsa durun ve Mimar'a dönün.

### 🔍 Müfettiş: ikinci göz incelemesi

İnceleme iki katmanlıdır: önce makine, sonra AI.

**1. Makine incelemesi (otomatik, her pull request'te):** GitHub Actions şunları çalıştırır: tip kontrolü, lint, tüm testler, kiracı izolasyonu testleri, bağımlılık güvenlik taraması. Biri başarısızsa birleştirme engellenir. Bu katman ücretsizdir ve hiç yorulmaz.

**2. AI incelemesi (kodu yazmamış yeni bir oturumda):** Claude'da yeni bir sohbet açın veya depoda yeni bir Claude Code oturumu başlatın. Şunları verin:

- Spesifikasyon dosyası
- Değişiklik (pull request farkı / diff)
- Aşağıdaki kontrol listesi

Ve şunu isteyin: **"Düzeltme yapma. Yalnızca bulgu listesi çıkar; her bulguyu kritik / önemli / küçük olarak işaretle ve dosya ile satırını belirt."** Düzeltmeleri müfettiş değil, usta yapar. Böylece müfettiş tarafsız kalır.

**Kontrol listesi:**

- [ ] Her sorgu kiracı kimliğiyle (business\_id) filtreleniyor mu?
- [ ] Yetki ve yetenek kontrolü backend'de mi yapılıyor?
- [ ] Bağlantı durumu kontrol ediliyor mu (iptal edilmiş bağlantıda erişim var mı)?
- [ ] Para `decimal` mı? Zaman UTC'de mi saklanıyor?
- [ ] Arayüz metinleri sabit yazılmış mı, yoksa çeviri anahtarı mı kullanılıyor?
- [ ] Testler spesifikasyondaki tüm kabul kriterlerini kapsıyor mu?
- [ ] API değişikliği eski mobil sürümü bozuyor mu?
- [ ] Migration geri alınabilir mi?
- [ ] Gizli bilgi veya kişisel veri loglanıyor mu?

**3. İnsan incelemesi:** Kritik bulgular kapanınca senaryoyu telefonda ve web'de kendiniz deneyin. Pilot sırasında bu adıma pilot toptancının bir çalışanı da katılır.

### Örnek: bir özelliğin baştan sona yolculuğu

1. 🧠 Mimar: "F2.3 – Bağlantı isteği" sohbeti → spesifikasyon güncellenir, görev kartları çıkar (backend, web ekranı, mobil ekran).
2. 🔨 Usta: backend kartı → dal → plan → kod ve test → pull request.
3. 🔍 Müfettiş: GitHub Actions + yeni bir Claude oturumu → 2 önemli bulgu.
4. 🔨 Usta: bulgular düzeltilir, Actions yeniden çalışır, birleştirme yapılır.
5. Web ve mobil kartlar için 2–4 tekrarlanır.
6. 🧠 Mimar: CHANGELOG ve spesifikasyon güncellenir; değişen dosyalar Proje bilgi tabanına yeniden yüklenir.

### Proje hafızası: depodaki dosyalar

AI araçlarının projeyi "hatırlaması" sohbet geçmişiyle değil, depodaki dosyalarla olur:

```
proje/
├─ AGENTS.md              ← kısa ve tek kaynak: mimari özet, kurallar, kod standartları, komutlar
├─ CLAUDE.md              ← tek satır: "AGENTS.md dosyasını oku" (+ Claude'a özel notlar)
├─ docs/
│  ├─ product-report.md   ← bu raporun güncel kopyası
│  ├─ decisions.md        ← karar kayıtları tablosu (D1…)
│  ├─ adr/                ← ADR-001-baglanti-yonu.md …
│  ├─ modules/            ← connections.md, orders.md, pricing.md …
│  ├─ tasks/              ← görev kartları (F2.3.md …)
│  ├─ api/openapi.yaml
│  └─ glossary.md
├─ CHANGELOG.md
├─ apps/ (api, web, mobile)
└─ packages/ (shared-types, ui)
```

`AGENTS.md` dosyasını **kısa** tutun (1–3 sayfa). Uzun bir kural dosyası her görevde AI'ın bağlamını doldurur ve bazı araçlarda kural dosyalarının karakter sınırı vardır. Ayrıntılar `docs/` klasöründe kalır; AGENTS.md yalnızca onlara yönlendirir.

### Yeni özellik eklerken güncelleme sırası

1. 🧠 Bu raporu güncelleyin: ilgili bölüm ve karar kayıtlarına yeni bir D-numarası.
2. 🧠 Gerekçeyi bir ADR olarak yazın; modül spesifikasyonunu güncelleyin; görev kartlarını çıkarın.
3. Kurallar değiştiyse `AGENTS.md` dosyasını güncelleyin.
4. 🔨 Kodu yazdırın. 🔍 İnceletin.
5. Aynı pull request içinde CHANGELOG ve OpenAPI güncellenir.
6. Değişen belgeleri Claude Projesinin bilgi tabanına yeniden yükleyin.

Kural: **Belgesi güncellenmemiş bir özellik bitmiş sayılmaz.** Bu kural, aylar sonra projeye döndüğünüzde hem sizin hem AI'ın kaybolmamasını sağlar. Bu rapor "ne ve neden" belgesidir ve her büyük değişiklikte sürüm numarası alır (v4, v5…). Depodaki dosyalar "nasıl" belgeleridir.

## Yol haritası

Bu yol haritasında **tarih yoktur**. AI için önemli olan takvim değil, **sıra ve bağımlılıktır**: bir adım, bağlı olduğu adımlar "bitti" olmadan başlamaz. Her adım bir görev kartıdır (`docs/tasks/F2.5.md` gibi) ve bir Mimar → Usta → Müfettiş döngüsünden geçer.

**Kurallar:**

- **Adım numarası** (F2.5) görev kartının, git dalının ve pull request'in adıdır. AI'a "F2.5'i yap" demek yeterlidir.
- **Dikey dilim:** Her adım; backend, test, web ve mobil (ilgiliyse) parçalarıyla uçtan uca biter. "Önce tüm backend, sonra tüm arayüz" yapılmaz.
- **Bitti tanımı (her adım için ortak):** kabul kriterleri testlerle karşılanmış, müfettiş bulguları kapanmış, OpenAPI ve CHANGELOG güncellenmiş, çeviri anahtarları 4 dilde girilmiş olmalı.
- Bir adım tek pull request'e sığmıyorsa Mimar onu alt adımlara böler (F3.3a, F3.3b).

### F0 — Hazırlık

| Adım | İş | Bağlı olduğu |
| --- | --- | --- |
| F0.1 | Hukuki görüş (yurt dışında barındırma, kişisel veri) ve mali müşavir görüşmesi | — |
| F0.2 | Pilot toptancılarla iş akışı görüşmesi; örnek ürün, fiyat ve müşteri verisi toplama | — |
| F0.3 | GitHub deposu, monorepo, GitHub Actions, AGENTS.md, `docs/` yapısı | — |
| F0.4 | AWS hesabı, bütçe alarmı, staging ortamı, Cloudflare ve R2 | F0.3 |
| F0.5 | Claude Projesi; modül spesifikasyonları; veri modeli taslağı | F0.2 |

### F1 — Çekirdek altyapı

| Adım | İş | Bağlı olduğu |
| --- | --- | --- |
| F1.1 | Temel şema: işletmeler, yetenekler, profiller, kullanıcılar, üyelikler; RLS ve kiracı izolasyonu testleri | F0.5 |
| F1.2 | Dil, çeviri, para birimi ve saat dilimi altyapısı | F1.1 |
| F1.3 | Kimlik: telefon + SMS OTP, oturum, cihaz, admin 2FA | F1.1 |
| F1.4 | RBAC: izinler, unvan kataloğu, rol şablonları, yetenek bazlı yetki kontrolü | F1.3 |
| F1.5 | Ayarlar (platform → plan → işletme) ve haklar (planlar, limitler) | F1.4 |
| F1.6 | Audit log | F1.4 |
| F1.7 | Bildirim altyapısı: kanal arayüzü, push, şablonlar | F1.2 |
| F1.8 | Web ve mobil uygulama iskeleti: giriş, dil seçimi, izinden oluşan menü | F1.4 |

### F2 — Hesaplar ve bağlantı ağı

| Adım | İş | Bağlı olduğu |
| --- | --- | --- |
| F2.1 | Platform admini: toptancı başvurusu ve hesap açma, `seller` yetenek onayı | F1.8 |
| F2.2 | Perakendeci self-servis kaydı, VÖEN format kontrolü ve tekillik, moderasyon | F1.8 |
| F2.3 | Şubeler, depolar, işletme profilleri, gizlilik ayarları | F2.1, F2.2 |
| F2.4 | Perakendeci dizini ve arama (Meilisearch), tam telefon/VÖEN eşleşmesi | F2.3 |
| F2.5 | Bağlantı isteği: kota, bekleme süresi, tek bekleyen istek, engel kontrolü | F2.4, F1.5 |
| F2.6 | İsteğe yanıt: kabul, red, engelleme; bağlantı koşulları | F2.5 |
| F2.7 | Bağlantı iptali ve yeniden istek | F2.6 |
| F2.8 | Zamanlanmış işler: istek süre dolumu, bağlantısız hesap aşamaları | F2.5 |
| F2.9 | Platform admini: perakendeci yönetimi (askıya alma, arşivleme, birleştirme) | F2.2 |

### F3 — Katalog, fiyat ve stok

| Adım | İş | Bağlı olduğu |
| --- | --- | --- |
| F3.1 | Birim kataloğu ve dönüşümler (UN/ECE kodları) | F1.2 |
| F3.2 | Kategori, marka, faaliyet alanı (platform kataloğu) | F1.2 |
| F3.3 | Ürün, varyant, ambalaj hiyerarşisi, son kullanma tarihi işareti, görseller (R2) | F3.1, F3.2 |
| F3.4 | Excel ile ürün içe aktarma (önizleme ve fark raporuyla) | F3.3 |
| F3.5 | Fiyat listeleri ve fiyat önceliği motoru (kapsamlı testlerle) | F3.3, F2.6 |
| F3.6 | Müşteri fiyatı, şube indirimi, kademeli fiyat | F3.5 |
| F3.7 | Stok modları 0–2, depo stoğu, hareketler | F3.3 |
| F3.8 | Perakendeci ürün ekranı ve filtreler (yalnızca bağlı toptancılar) | F3.5, F3.7 |

### F4 — Sipariş

| Adım | İş | Bağlı olduğu |
| --- | --- | --- |
| F4.1 | Ortak sepet (şube bazında), toptancıya göre gruplama, minimum tutar | F3.8 |
| F4.2 | Şube onay kuralları ve onay akışı | F4.1 |
| F4.3 | Sepetin toptancı başına siparişlere bölünmesi; fiyat ve birim kopyası | F4.2 |
| F4.4 | Toptancı sipariş onayı, düzenleme, kısmi onay, stok rezervasyonu | F4.3, F3.7 |
| F4.5 | Sipariş belgesi (PDF, 4 dil), lot ve son kullanma tarihi satırları | F4.4 |
| F4.6 | Tekrar sipariş ve favoriler | F4.3 |

### F5 — Teslimat ve cari

| Adım | İş | Bağlı olduğu |
| --- | --- | --- |
| F5.1 | Teslimat sağlayıcısı arayüzü; kargocu atama; kargocu mobil ekranları | F4.4 |
| F5.2 | "Teslim ettim" (fotoğraf + GPS), perakendeci onayı/itirazı, otomatik onay | F5.1 |
| F5.3 | Manuel dış kargo (firma ve takip numarası) | F5.1 |
| F5.4 | Cari: teslimde borç kaydı, tahsilat girişi, kapıda tahsilat, ekstre | F5.2 |
| F5.5 | e-qaimə uyumlu dışa aktarma (Excel/XML) | F5.4 |

### F6 — Dashboard ve yayın hazırlığı

| Adım | İş | Bağlı olduğu |
| --- | --- | --- |
| F6.1 | Rol bazlı temel dashboardlar | F5.4 |
| F6.2 | Platform admin paneli: ayarlar, planlar, denetim ekranları | F1.5, F1.6 |
| F6.3 | Güvenlik gözden geçirmesi, yedek ve geri yükleme testi, yük testi | F6.1 |
| F6.4 | Mobil uygulamaların mağazalara yüklenmesi, minimum sürüm kontrolü | F6.3 |

### F7 — Pilot

| Adım | İş | Bağlı olduğu |
| --- | --- | --- |
| F7.1 | Pilot toptancıların ürün, fiyat ve kullanıcı verilerinin yüklenmesi | F6.4 |
| F7.2 | Toptancı ekiplerinin eğitimi (temsilci, depo, kargocu, muhasebe) | F7.1 |
| F7.3 | Perakendecilerin kaydı ve bağlantıların kurulması (temsilci sahada yardım eder) | F7.2 |
| F7.4 | Canlı kullanım; haftalık geri bildirim ve hata düzeltme döngüsü | F7.3 |
| F7.5 | Pilot değerlendirmesi ve Faz 2 önceliklerinin belirlenmesi | F7.4 |

**Pilot başarı ölçütleri** (hedef değerleri pilot toptancılarla birlikte belirleyin):

- Hedeflenen perakendecilerin ne kadarı kaydoldu ve bağlantıyı kabul etti?
- Pilot toptancıların toplam siparişlerinin ne kadarı uygulama üzerinden geldi?
- Bir perakendecinin ilk siparişi bağlantıdan ne kadar sonra geldi?
- Siparişlerin ne kadarı düzenleme veya itiraz gerektirdi?
- Teslim onaylarının ne kadarı perakendeci tarafından, ne kadarı otomatik verildi?
- Toptancı ekibi uygulamayı telefon/WhatsApp siparişine tercih ediyor mu? (kısa anket)

### Sonraki fazlar (pilot sonuçlarına göre sıralanır)

- **Faz 2:** Satış temsilcisi ziyaret modu ve rota; kredi limiti blokajı; yaşlandırma ve mutabakat; kampanyalar; iade süreci; lot bazlı stok ve FEFO; gelişmiş raporlar; WhatsApp ve SMS bildirim kanalları; ilk dış kargo API adaptörü.
- **Faz 3:** 1C entegrasyonu; e-qaimə entegrasyonu; online ödeme; ödemeli toptancı self-servis kaydı; çift rollü işletmelerin açılması; perakendeci premium; offline mobil; açık API; yeni ülkeler.

**Sonraki adım:** Tüm kararlar kesinleşti. Geliştirme F0 adımlarıyla başlar: F0.1 hukuki ve mali görüşmeler ile F0.2 pilot toptancı görüşmeleri paralel yürür. F0.3 ve F0.5 için `AGENTS.md` dosyasını, ilk ADR'leri ve "Bağlantı ağı" modül spesifikasyonunu hazırlayabiliriz.

## Kaynaklar

- [Dövlət Vergi Xidməti — Elektron qaimə-faktura](https://taxes.gov.az/en/page/elektron-qaime-faktura)
- [Dövlət Vergi Xidməti — Suallar və cavablar (e-qaimə təsdiqi)](https://taxes.gov.az/en/page/suallar-ve-cavablar?page=165)
- [e-invoice.app — Azerbaijan e-Invoicing](https://www.e-invoice.app/country/AZ)
- [PwC Azerbaijan — e-VAT invoices and e-signature](https://pwc.com/az/en/publications/pwc-az-times/assets/pwc-az-times-issue-03-2014-eng.pdf)
- [Lookuptax — How to verify TIN (VÖEN) in Azerbaijan](https://lookuptax.com/docs/how-to-verify/tin-azerbaijan)
- [TaxDo — Azerbaijan TIN (VÖEN) guide](https://taxdo.com/resources/faq/post/azerbaijan-tin-voen-compliance-guide-saas.md)
- [Claude destek — Claude Code'u Pro veya Max planıyla kullanma](https://support.claude.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan)
- [Claude destek — Projeler nasıl oluşturulur ve yönetilir](https://support.anthropic.com/en/articles/9519177-how-can-i-create-and-manage-projects)
- [CoinGecko Docs — Antigravity kuralları ve AGENTS.md](https://docs.coingecko.com/docs/ai-agent-hub/antigravity)

VÖEN yapısı ve e-qaimə kuralları üçüncü taraf kaynaklardan derlenmiştir. Geliştirmeye başlamadan önce Dövlət Vergi Xidməti veya bir mali müşavirle doğrulanmalıdır.
