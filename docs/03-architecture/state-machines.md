# Durum Makineleri

| Alan | Değer |
| --- | --- |
| Sürüm | 1.0 |
| Tarih | 2026-10-24 |

Durumu değişen her varlığın geçişleri bu belgede tanımlıdır. Kod (`*StateMachine` sınıfları) bu tablolarla birebir aynı olmalıdır: tabloda olmayan bir geçiş `409 INVALID_STATE_TRANSITION` döner. Her geçiş `audit_logs`'a, sipariş geçişleri ayrıca `order_status_history`'ye yazılır.

## 1. Bağlantı isteği (`connection_requests.status`)

```mermaid
stateDiagram-v2
    [*] --> pending: toptancı gönderir
    pending --> accepted: perakendeci kabul eder
    pending --> rejected: perakendeci reddeder / engeller
    pending --> withdrawn: toptancı geri çeker
    pending --> expired: süre doldu (sistem)
    accepted --> [*]
    rejected --> [*]
    withdrawn --> [*]
    expired --> [*]
```

| Geçiş | Kim | Koşul (guard) | Yan etki |
| --- | --- | --- | --- |
| → pending | Satıcı, `connections.request.send` izni | `ConnectionPolicy.canRequest` geçer (aktif bağlantı yok, bekleyen istek yok, engel yok, bekleme süresi yok, kota var) | Kota sayacı; olay `connection.request_created` (push) |
| pending → accepted | Alıcı, `connections.request.respond` | İstek süresi dolmamış | Yeni `connections` satırı (`active`); olay `connection.accepted` |
| pending → rejected | Alıcı, `connections.request.respond` veya `connections.block` | — | Bekleme süresi başlar; olay `connection.rejected` |
| pending → withdrawn | İsteği gönderen satıcı | — | Olay yok |
| pending → expired | Sistem (15 dk'da bir; `connection.request_expiry_interval_minutes`) | `expires_at <= now()` (kabul/red ile aynı sınır: o andan sonra yanıtlanamaz) | Olay `connection.request_expired` (gönderen + satıcı adminlerine bildirim) |

## 2. Bağlantı (`connections.status`)

```mermaid
stateDiagram-v2
    [*] --> active: istek kabul edildi
    active --> cancelled: toptancı iptal eder
    active --> cancelled: perakendeci iptal eder / engeller
    cancelled --> [*]
```

| Geçiş | Kim | Koşul | Yan etki |
| --- | --- | --- | --- |
| active → cancelled | Satıcı veya alıcı, `connections.cancel` | Gerekçe ve ikinci onay | `submitted` siparişler `cancelled`; o satıcının sepet kalemleri silinir; `ended_by_side`; alıcı iptalinde bekleme süresi başlar; olay `connection.cancelled` |

Kodda `ConnectionStateMachine` (F2.15a); tablo dışı geçiş `409 INVALID_STATE_TRANSITION`. Engel de bu geçişi kullanır (`end_reason = blocked`); sepet/sipariş yan etkileri `ConnectionCancelledHandler` kancalarıyla aynı işlemde (F4.5).

Bir iptal edilmiş bağlantı **hiçbir zaman** yeniden `active` olmaz. Yeniden bağlantı = yeni istek + yeni `connections` satırı (K6).

## 3. Sipariş (`orders.status`)

```mermaid
stateDiagram-v2
    [*] --> submitted: sepet onaylandı ve bölündü
    submitted --> approved: toptancı onaylar (tam / kısmi)
    submitted --> rejected: toptancı reddeder
    submitted --> cancelled: perakendeci iptal eder / bağlantı iptal edildi
    approved --> preparing: depo hazırlamaya başlar
    approved --> cancelled: toptancı iptal eder
    preparing --> ready_to_ship: kargocu atandı
    preparing --> cancelled: toptancı iptal eder
    ready_to_ship --> shipped: kargocu yola çıktı / dış kargoya verildi
    preparing --> shipped: dış kargoya verildi
    shipped --> delivered_pending_confirmation: kargocu "teslim ettim"
    delivered_pending_confirmation --> delivered: perakendeci onaylar / otomatik onay
    delivered_pending_confirmation --> disputed: perakendeci itiraz eder
    disputed --> delivered: toptancı itirazı çözer
    delivered --> [*]
    rejected --> [*]
    cancelled --> [*]
```

| Geçiş | Kim | Koşul | Yan etki |
| --- | --- | --- | --- |
| → submitted | Sistem (`CartService.submit`) | Bağlantı aktif; VÖEN var; minimum tutar sağlanmış | Satır kopyaları; olay `order.submitted` |
| submitted → approved | Satıcı, `orders.approve` | Stok modu `quantity` ise satılabilir stok yeterli | `qty_approved` yazılır; değişiklikler `order_item_changes`; stok `reserve`; olay `order.approved` |
| submitted → rejected | Satıcı, `orders.approve` | Gerekçe zorunlu | Olay `order.rejected` |
| submitted → cancelled | Alıcı (`orders.cancel_own`) veya sistem (bağlantı iptali) | — | Olay `order.cancelled` |
| approved/preparing → cancelled | Satıcı, `orders.cancel` | Gerekçe zorunlu | Stok `release`; olay `order.cancelled` |
| approved → preparing | Satıcı, `orders.prepare` | — | — |
| preparing → ready_to_ship | Satıcı, `delivery.assign` | Kargocu üyeliği aktif | `deliveries` (`own_courier`, `assigned`) |
| ready_to_ship → shipped | Kargocu, `delivery.update_own` | — | Stok `ship`; `deliveries.departed_at`; olay `order.shipped` |
| preparing → shipped | Satıcı, `delivery.assign` | Dış kargo firması ve takip no | `deliveries` (`manual_carrier`, `in_transit`); stok `ship` |
| shipped → delivered_pending_confirmation | Kargocu (`delivery.update_own`) veya satıcı (manuel kargoda) | Fotoğraf zorunluysa var | `delivery_proofs`; `auto_confirm_at`; konum uyuşmazlığı hesabı; olay `order.delivered_pending` |
| delivered_pending_confirmation → delivered | Alıcı (`orders.confirm_delivery`) veya sistem (`auto_confirm_at < now()`) | — | `delivered_at`; `auto_confirmed`; **aynı işlemde** cari borç kaydı; olay `order.delivered` |
| delivered_pending_confirmation → disputed | Alıcı, `orders.confirm_delivery` | Tür ve açıklama | `disputes` (`open`); olay `order.disputed` |
| disputed → delivered | Satıcı, `orders.resolve_dispute` | Çözüm notu | Kabulde satır miktarları düzeltilir; `delivered_at`; cari borç düzeltilmiş tutarla; olay `order.delivered` |

**Not — "Ödendi" durumu yok:** Analiz raporundaki taslak diyagramda yer alan "Ödendi · Kapandı" durumu bu modelde yoktur. Tahsilatlar sipariş bazında değil, satıcı–alıcı çiftinin carisinde tutulur (bir ödeme birden fazla siparişi kapatabilir). 📌 VARSAYIM: MVP'de tahsilatın siparişlere dağıtımı yapılmaz; vade ve yaşlandırma, cari hareketlerinden en eski borç ilk kapanır (FIFO) kuralıyla raporda hesaplanır.

## 4. Teslimat (`deliveries.status`)

```mermaid
stateDiagram-v2
    [*] --> assigned: kargocu atandı
    [*] --> in_transit: dış kargoya verildi
    assigned --> in_transit: kargocu yola çıktı
    in_transit --> in_transit: teslim edilemedi (deneme kaydı)
    in_transit --> delivered_pending: teslim ettim
    delivered_pending --> confirmed: perakendeci onayı / otomatik onay
    delivered_pending --> disputed: perakendeci itirazı
    disputed --> resolved: toptancı çözer
    confirmed --> [*]
    resolved --> [*]
```

Teslimat durumu sipariş durumuyla aynı işlemde güncellenir. Eşleşme:

| `deliveries.status` | `orders.status` |
| --- | --- |
| assigned | ready_to_ship |
| in_transit | shipped |
| delivered_pending | delivered_pending_confirmation |
| confirmed | delivered |
| disputed | disputed |
| resolved | delivered |

## 5. İtiraz (`disputes.status`)

```mermaid
stateDiagram-v2
    [*] --> open
    open --> accepted: toptancı itirazı kabul eder (miktar düzeltir)
    open --> rejected: toptancı reddeder (teslim kanıtıyla)
    accepted --> [*]
    rejected --> [*]
```

⚠️ AÇIK SORU: Toptancı itirazı reddederse perakendecinin başka bir itiraz yolu (platform admini hakemliği) olacak mı? 📌 VARSAYIM: MVP'de yok; anlaşmazlık taraflar arasında platform dışında çözülür.

## 6. Sepet (`carts.status`)

```mermaid
stateDiagram-v2
    [*] --> open
    open --> pending_approval: onaya gönder (kural gerektiriyorsa)
    pending_approval --> open: şube admini geri gönderir
    pending_approval --> open: şube admini onaylar ve gönderir (sepet boşalır)
    open --> open: onay gerekmiyorsa doğrudan gönder (sepet boşalır)
```

Bölünmede gönderilemeyen gruplar (minimum tutar altı, bağlantısı aktif olmayan) sepette kalır.

## 7. Ödeme (`payments.status`)

```mermaid
stateDiagram-v2
    [*] --> posted: muhasebe veya kargocu girer
    [*] --> pending_review: satış temsilcisi girer
    pending_review --> posted: muhasebe onaylar
    pending_review --> rejected: muhasebe reddeder
    posted --> [*]
    rejected --> [*]
```

`posted` olurken aynı işlemde `ledger_entries` alacak kaydı oluşur. Hatalı bir `posted` ödeme silinmez; `reversal` cari kaydıyla düzeltilir.

## 8. Abonelik (`subscriptions.status`)

```mermaid
stateDiagram-v2
    [*] --> active: admin aboneliği başlatır
    active --> active: ödeme işaretlendi (dönem uzar)
    active --> grace: dönem bitti, ödeme yok
    grace --> active: ödeme işaretlendi
    grace --> read_only: tolerans (7 gün) bitti
    read_only --> active: ödeme işaretlendi
    active --> cancelled: admin iptal eder
    read_only --> cancelled: admin iptal eder
```

`read_only`: yeni istek ve yeni sipariş onayı yok; teslimat, cari ve okuma devam eder (US-055 AC4).

## 9. İşletme (`businesses.status`) ve bağlantısız hesap aşamaları

```mermaid
stateDiagram-v2
    [*] --> active: kayıt / admin açılışı
    active --> suspended: platform admini askıya alır
    suspended --> active: platform admini kaldırır
    active --> dormant: 120. gün, hiç bağlantı yok
    dormant --> active: kullanıcı giriş yapar
    dormant --> archived: 180. gün (kişisel veri silinir)
    active --> archived: platform admini "sil" (geçmiş varsa)
    suspended --> archived: platform admini "sil"
    archived --> [*]
```

`buyer_profiles.dormant_stage`: `none` → `reminded_7` → `reminded_30` → `warned` (90. gün) → `deactivated` (120. gün). Girişte `none`'a döner. Yalnızca hiç bağlantı, sipariş veya cari kaydı olmayan alıcılara uygulanır (US-027 AC5).

## 10. İşletme yeteneği (`business_capabilities.status`)

```mermaid
stateDiagram-v2
    [*] --> approved: perakendeci kaydı (buyer) / admin açılışı (seller)
    [*] --> pending: ileride: self-servis toptancı kaydı
    pending --> approved: platform admini onaylar
    approved --> suspended: platform admini
    suspended --> approved: platform admini
```

## 11. Excel içe aktarma (`import_jobs.status`)

```mermaid
stateDiagram-v2
    [*] --> uploaded
    uploaded --> validating: worker işi alır
    validating --> preview_ready: doğrulama bitti
    validating --> failed: dosya okunamadı
    preview_ready --> applying: kullanıcı onaylar
    preview_ready --> [*]: kullanıcı vazgeçer (24 saat sonra silinir)
    applying --> done
    applying --> failed
    done --> [*]
    failed --> [*]
```

## 12. Toptancı başvurusu (`seller_applications.status`)

```mermaid
stateDiagram-v2
    [*] --> pending: ziyaretçi başvurur
    pending --> approved: admin başvurudan toptancı açar
    pending --> rejected: admin reddeder
    approved --> [*]
    rejected --> [*]
```

| Geçiş | Kim | Koşul (guard) | Yan etki |
| --- | --- | --- | --- |
| → pending | Kimliksiz ziyaretçi (`POST /seller-applications`) | IP hız sınırı (`seller_application.ip_max_per_hour`); aynı VÖEN ile `pending` başvuru yok (yoksa `409 SELLER_APPLICATION_ALREADY_PENDING`) | Yok (başvuru admin listesinde görünür, US-008 AC1) |
| pending → approved | Platform rolü `super_admin`, `operations` (`POST /admin/sellers` + `applicationId`) | Toptancı açılışı aynı işlemde başarılı (US-009) | `business_id`, `reviewed_by` yazılır; audit `seller_application.approved` |
| pending → rejected | Platform rolü `super_admin`, `operations` | — | `reviewed_by` yazılır; audit `seller_application.rejected` |

`approved` ve `rejected` son durumlardır; başka geçiş `409 INVALID_STATE_TRANSITION`. Reddedilen başvurudan sonra aynı VÖEN ile yeni başvuru yapılabilir.
