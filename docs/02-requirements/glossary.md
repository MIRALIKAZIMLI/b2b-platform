# Sözlük

| Alan | Değer |
| --- | --- |
| Sürüm | 1.0 |
| Tarih | 2026-10-24 |

Her kavramın **tek bir Türkçe adı** ve **tek bir kod adı** vardır. Kodda, API'de, veritabanında ve belgelerde yalnızca bu adlar kullanılır. Eş anlamlı bir kelime (ör. `customer`, `retailer`, `vendor`, `supplier`) kodda kullanılmaz. Yeni bir kavram önce bu sözlüğe eklenir.

## 1. İşletme ve kullanıcı

| Türkçe terim | Kod adı | Tanım |
| --- | --- | --- |
| Platform | `platform` | Sistemi işleten SaaS sağlayıcı (platform sahibi ve ekibi). Bir işletme değildir. |
| İşletme | `business` | Platformda kayıtlı tüzel kişi veya fərdi sahibkar. Tek bir kayıttır; tipi yoktur, yetenekleri vardır. |
| Yetenek | `capability` | İşletmenin platformdaki rolü: `seller` veya `buyer`. Her yeteneğin kendi onay durumu vardır. |
| Toptancı | `seller` | `seller` yeteneği onaylı işletme. Arayüzde "toptancı" olarak gösterilir. |
| Perakendeci | `buyer` | `buyer` yeteneği onaylı işletme. Arayüzde "perakendeci" olarak gösterilir. |
| Şube | `branch` | Perakendecinin teslimat adresi ve sipariş birimi. Her perakendecinin en az bir şubesi vardır. |
| Depo | `warehouse` | Toptancının stok tuttuğu yer. |
| Kullanıcı | `user` | Telefon numarasıyla tanımlanan kişi. Birden fazla işletmede üyeliği olabilir. |
| Üyelik | `membership` | Bir kullanıcının bir işletmedeki varlığı: rolü ve kapsamı. |
| Unvan | `job_title` | Platform kataloğundaki iş tanımı (Satış Temsilcisi, Kargocu…). |
| Rol şablonu | `role_template` | Bir unvana bağlı varsayılan izin paketi (platform düzeyi). |
| Rol | `role` | İşletmenin kullandığı izin paketi; bir şablonun kopyasıdır ve özelleştirilebilir. |
| İzin | `permission` | Modül × eylem çifti (ör. `orders.approve`). Her izin bir yeteneğe aittir. |
| Kapsam | `scope` | İznin geçerli olduğu veri sınırı: `all`, `branch`, `warehouse`, `assigned`. |
| İşletme admini | `business_admin` | İşletmenin kullanıcı ve rol yönetme yetkisi olan rolü. |
| Şube admini | `branch_admin` | Perakendecide kendi şubesinin sepetini onaylayan rol. |
| Kişisel veri | `person_data` | Gerçek bir kişiye ait ad, telefon, e-posta gibi veriler; ayrı tabloda tutulur. |
| VÖEN | `voen` | Azerbaycan vergi kimlik numarası; 10 hane; son hane 1 = tüzel kişi, 2 = fərdi sahibkar. |
| Doğrulanmış | `verified` | VÖEN'i platform moderatörünce kontrol edilmiş perakendeci. Sipariş için ön koşul değildir. |
| Faaliyet alanı | `activity_type` | Perakendecinin iş türü (kozmetik dükkanı, market, eczane…); platform kataloğu. |
| Hizmet bölgesi | `service_area` | Toptancının hizmet verdiği şehir/rayon listesi. |

## 2. Bağlantı ağı

| Türkçe terim | Kod adı | Tanım |
| --- | --- | --- |
| Perakendeci dizini | `buyer_directory` | Toptancının perakendecileri aradığı liste. |
| Bağlantı isteği | `connection_request` | Toptancının bir perakendeciye gönderdiği bağlantı talebi. |
| Bağlantı | `connection` | Bir toptancı ile bir perakendeci arasındaki ticari ilişki dönemi. İptal ve yeniden kurulum yeni bir bağlantı kaydı oluşturur. |
| Aktif bağlantı | `connection.status = active` | Perakendecinin toptancının ürünlerini görüp sipariş verebildiği durum. |
| Bağlantı koşulları | `connection terms` | Bağlantıya atanan fiyat listesi, kredi limiti, ödeme vadesi ve sorumlu temsilci. |
| Engelleme | `block` | Perakendecinin bir toptancının kendisine istek göndermesini kalıcı olarak durdurması. |
| Bekleme süresi | `cooldown` | Red veya perakendeci iptalinden sonra toptancının aynı perakendeciye istek gönderemediği süre. |
| İstek kotası | `daily_request_quota` | Toptancının bir günde gönderebileceği en fazla istek sayısı (toptancının saat dilimine göre). |
| Süre dolumu | `expiry` | Yanıtsız isteğin belirlenen süre sonunda kendiliğinden kapanması. |
| Bağlantısız hesap | `dormant account` | Hiç bağlantı kurmamış perakendeci hesabı; teşvik → uyarı → pasif → silme aşamalarından geçer. |
| Görünürlük ayarı | `business_privacy` | Perakendecinin bağlantısız toptancılara hangi alanlarını gösterdiği. |

## 3. Katalog, fiyat, stok

| Türkçe terim | Kod adı | Tanım |
| --- | --- | --- |
| Ürün | `product` | Toptancının sattığı ürünün genel kaydı (ad, kategori, marka). |
| Varyant | `variant` | Ürünün satılabilir somut hali (renk, hacim). Fiyat ve stok varyant düzeyindedir. |
| Temel birim | `base_unit` | Stok ve fiyatın asıl tutulduğu en küçük birim (ör. adet). |
| Ambalaj seviyesi | `packaging_level` | Tüketici birimi, iç paket, koli, palet; her biri kaç temel birim içerdiğini ve kendi GTIN'ini taşır. |
| Satış birimi | `sales_unit` | Perakendecinin sipariş verebildiği ambalaj seviyesi (ör. koli). |
| Sipariş katı | `order_multiple` | Satış biriminde izin verilen artış (ör. 1'er koli). |
| Minimum sipariş miktarı | `min_order_qty` | Bir varyant için en az sipariş edilebilecek satış birimi sayısı. |
| Minimum sipariş tutarı | `min_order_amount` | Bir toptancıya verilecek siparişin en düşük toplam tutarı. |
| GTIN | `gtin` | GS1 barkod numarası. |
| Birim kodu | `unit_code` | UN/ECE Recommendation 20 kodu (H87, KGM, XCT…). |
| Fiyat listesi | `price_list` | Para birimi, KDV ayarı ve geçerlilik tarihi olan fiyat kümesi. |
| Varsayılan fiyat listesi | `default_price_list` | Toptancının, başka kural yoksa uygulanan listesi. |
| Müşteri fiyatı | `customer_price` | Belirli bir perakendeciye özel varyant fiyatı. |
| Şube fiyatı | `branch_price` | Belirli bir şubeye özel varyant fiyatı; varsayılan kapalı. |
| Şube indirimi | `branch_discount` | Bir şubeye uygulanan yüzde indirim kuralı (tüm ürün / marka / kategori). |
| Kademeli fiyat | `tier_price` | Miktar eşiğine bağlı indirim. |
| Fiyat önceliği | `price resolution` | Fiyatın şube fiyatı → müşteri fiyatı → bağlantı listesi → varsayılan liste sırasıyla bulunması. |
| Fiyat kaynağı | `price_source` | Bir fiyatın hangi kuraldan geldiği; siparişe kopyalanır. |
| Stok modu | `stock_mode` | Toptancının stok takip düzeyi: `none`, `availability`, `quantity` (ileride `sync`). |
| Fiziksel stok | `on_hand` | Depoda bulunan miktar (temel birimde). |
| Rezerve stok | `reserved` | Onaylanmış ama sevk edilmemiş siparişlere ayrılan miktar. |
| Satılabilir stok | `available` | `on_hand − reserved`. |
| Stok hareketi | `stock_movement` | Stoğu değiştiren her olayın değiştirilemez kaydı. |
| Lot | `lot_no` | Üretim partisi numarası. |
| Son kullanma tarihi | `expiry_date` | Ürünün son kullanma tarihi. |

## 4. Sepet, sipariş, teslimat

| Türkçe terim | Kod adı | Tanım |
| --- | --- | --- |
| Sepet | `cart` | Bir şubenin kullanıcılarının ortak kullandığı, birden fazla toptancıdan kalem içerebilen geçici liste. |
| Şube onayı | `cart_approval` | Sepetin şube admini tarafından incelenip gönderilmesi. |
| Onay kuralı | `approval_rule` | Şubenin sepet onay kuralı: `every_order`, `above_amount`, `none`. |
| Bölünme | `split` | Onaylanan sepetin toptancı başına ayrı siparişlere dönüşmesi. |
| Sipariş | `order` | Bir satıcı ile bir alıcı arasındaki, tek para birimli sipariş. |
| Sipariş satırı | `order_item` | Siparişteki bir varyant; ad, birim, fiyat ve indirimler o anki haliyle kopyalanır. |
| Kısmi onay | `partial approval` | Toptancının satır miktarlarını düşürerek veya satır çıkararak onaylaması. |
| Sipariş belgesi | `order_document` | Siparişin PDF dökümü; vergi faturası değildir. |
| Teslimat | `delivery` | Bir siparişin taşınma kaydı. |
| Teslimat sağlayıcısı | `delivery_provider` | `own_courier`, `manual_carrier` (ileride API kargo firmaları). |
| Kargocu | `courier` | Toptancının kendi teslimat çalışanı. |
| Teslim kanıtı | `delivery_proof` | Teslimde kaydedilen fotoğraf, GPS, zaman ve perakendeci onayı/itirazı. |
| Otomatik onay | `auto_confirmation` | Perakendecinin süre içinde yanıt vermediği teslimin sistemce onaylanması. |
| İtiraz | `dispute` | Perakendecinin eksik, hasarlı veya teslim edilmemiş mal bildirimi. |
| Konum uyuşmazlığı | `location_mismatch` | Teslim konumunun şube konumundan eşik değerden uzak olması. |

## 5. Cari ve abonelik

| Türkçe terim | Kod adı | Tanım |
| --- | --- | --- |
| Cari | `ledger` | Bir satıcı–alıcı çifti arasındaki borç/alacak hareketleri. Bağlantıya değil işletme çiftine bağlıdır. |
| Cari hareketi | `ledger_entry` | Cariyi değiştiren değiştirilemez kayıt (borç veya alacak). Düzeltme ters kayıtla yapılır. |
| Tahsilat | `payment` | Alıcının satıcıya ödemesinin cariye girişi. Platform parayı tahsil etmez. |
| Kargocuda bekleyen nakit | `courier_cash` | Kapıda tahsil edilip toptancıya teslim edilmemiş nakit. |
| Vade | `payment_term_days` | Teslimden ödemeye kadar tanınan gün sayısı. |
| Kredi limiti | `credit_limit` | Toptancının perakendeciye tanıdığı en yüksek açık bakiye (MVP'de uyarı amaçlı). |
| Plan | `plan` | Abonelik paketi; bir yeteneğe (toptancı / perakendeci) aittir. |
| Hak | `entitlement` | Bir planın sağladığı özellik veya limit (ör. `users.max = 15`). |
| Hak istisnası | `entitlement_override` | Bir işletmeye özel, planı geçersiz kılan hak değeri. |
| Abonelik | `subscription` | Bir işletmenin bir plana belirli tarih aralığında bağlılığı. |

## 6. Teknik terimler

| Türkçe terim | Kod adı | Tanım |
| --- | --- | --- |
| Kiracı | `tenant` | Verisi diğerlerinden yalıtılmış işletme. Kiracı kimliği = `business_id`. |
| Kiracı izolasyonu | `tenant isolation` | Bir işletmenin başka işletmenin verisine erişememesi; RLS ve uygulama kontrolleriyle sağlanır. |
| RLS | `row level security` | PostgreSQL'in satır düzeyinde erişim kısıtı. |
| Ayar | `setting` | Platform → plan → işletme katmanlı, kodda sabit tutulmayan değer. |
| Adaptör | `adapter` | Bir dış servisi (SMS, push, ileride ödeme, kargo, e-qaimə) ortak bir arayüzün arkasına alan modül. |
| Özellik bayrağı | `feature flag` | Bir özelliği kod değiştirmeden açıp kapatan ayar. |
| Görev kartı | `task card` | Uygulama planındaki bir adımın tanımı (`docs/tasks/` veya [implementation-plan.md](../07-ai-development/implementation-plan.md)). |
| Kabul kriteri | `acceptance criterion` | Bir story'nin karşılanması gereken, test edilebilir koşulu (AC). |
