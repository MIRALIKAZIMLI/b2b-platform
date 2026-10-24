# Sequence Akışları

| Alan | Değer |
| --- | --- |
| Sürüm | 1.0 |
| Tarih | 2026-10-24 |
| İlgili belgeler | [state-machines.md](state-machines.md) · [api/openapi.yaml](api/openapi.yaml) · [c4-component.md](c4-component.md) |

Bu belge en kritik dokuz akışı ve her akışın hata senaryolarını tanımlar. Diyagramlardaki `API` bir NestJS isteğini, `DB` tek bir PostgreSQL işlemini (transaction) gösterir. `Worker` adımları outbox olayından sonra, isteğe yanıt döndükten sonra çalışır.

Hata kodları [api/openapi.yaml](api/openapi.yaml) içindeki `ErrorCode` listesiyle aynıdır.

## SF-01 — Telefon ve OTP ile giriş (US-001)

```mermaid
sequenceDiagram
    actor U as Kullanıcı
    participant App as Web / Mobil
    participant API
    participant R as Redis
    participant DB
    participant SMS as SmsSender (mock / gerçek)

    U->>App: Telefon numarası
    App->>API: POST /api/v1/auth/otp/request {phone}
    API->>R: Hız sınırı (numara 1/dk, 5/saat, IP 20/saat)
    alt sınır aşıldı
        API-->>App: 429 OTP_RATE_LIMITED {retryAfter}
    end
    API->>DB: otp_challenges ekle (code_hash, expires_at = +5 dk)
    API->>SMS: send(phone, kod) — dev/staging: dev_sms_outbox
    API-->>App: 202 {challengeId}
    U->>App: 6 haneli kod
    App->>API: POST /api/v1/auth/otp/verify {challengeId, code}
    API->>DB: challenge oku, attempts++
    alt kod yanlış (5. deneme)
        API->>DB: numarayı 15 dk kilitle, audit
        API-->>App: 423 OTP_LOCKED
    else kod doğru
        API->>DB: consumed_at, user_sessions ekle (refresh hash, family_id)
        API-->>App: 200 {accessToken (15 dk), refreshToken (30 gün), memberships[]}
    end
    App->>API: GET /api/v1/me (Authorization, X-Business-Id)
```

| Hata senaryosu | Davranış |
| --- | --- |
| SMS sağlayıcısı hata verir | `SmsSender` 2 kez yeniden dener (1 sn, 3 sn); başarısızsa `503 SMS_UNAVAILABLE`, challenge `consumed_at` ile kapatılır, kullanıcı 60 sn sonra tekrar isteyebilir |
| Kod süresi dolmuş | `400 OTP_EXPIRED` |
| Kayıtlı olmayan numara ile giriş | Kod yine gönderilir (numara varlığı sızdırılmaz); doğrulamadan sonra yanıt `memberships: []` ve `nextStep: "register"` |
| Kullanıcı `locked` / `deleted` | Doğrulamadan sonra `403 USER_DISABLED` |
| Yenileme anahtarı ikinci kez kullanıldı | Aynı `family_id`'deki tüm oturumlar iptal; `401 REFRESH_TOKEN_REUSED`; audit |
| Platform rolü, TOTP kurulu | Yanıt `nextStep: "totp"`; erişim anahtarı yalnızca TOTP doğrulamasından sonra verilir (US-002) |

## SF-02 — Perakendeci kaydı (US-005, US-006)

```mermaid
sequenceDiagram
    actor U as Dükkan sahibi
    participant App as Mobil
    participant API
    participant DB
    participant W as Worker

    Note over U,API: SF-01 ile OTP doğrulandı, nextStep = register
    U->>App: Ad soyad, ünvan, faaliyet alanı, şehir/rayon, onay
    App->>API: POST /api/v1/buyers/register (Idempotency-Key)
    API->>DB: BEGIN
    API->>DB: users (yoksa), businesses (created_via = self_signup)
    API->>DB: business_capabilities (buyer, approved)
    API->>DB: buyer_profiles, business_privacy (hepsi false), person_data
    API->>DB: branches (varsayılan, approval_rule = every_order), carts
    API->>DB: roles (buyer_admin şablonundan), memberships
    API->>DB: outbox: buyer.registered
    API->>DB: COMMIT
    API-->>App: 201 {businessId, profileCompleteness}
    W->>W: buyer.registered → Meilisearch buyer_directory indeksine ekle
    U->>App: VÖEN gir (daha sonra)
    App->>API: PATCH /api/v1/business {voen}
    API->>API: Format: 10 rakam, son hane 1 / 2
    API->>DB: unique kontrol, legal_type, outbox: buyer.voen_submitted
    W->>W: moderasyon kuyruğuna ekle
```

| Hata senaryosu | Davranış |
| --- | --- |
| Aynı istek iki kez (zayıf ağ) | `Idempotency-Key` aynı yanıtı döner; ikinci işletme oluşmaz |
| VÖEN formatı hatalı | `422 VOEN_INVALID` |
| VÖEN başka bir alıcı işletmede kayıtlı | `409 VOEN_ALREADY_REGISTERED` |
| Zorunlu alan eksik | `422 VALIDATION_FAILED` + alan listesi |
| İndeksleme başarısız | Outbox olayı 5 kez artan beklemeyle yeniden denenir; gece tam yeniden indeksleme telafi eder |

## SF-03 — Bağlantı isteği ve kabul (US-021, US-023, US-024)

```mermaid
sequenceDiagram
    actor S as Satış temsilcisi
    participant API
    participant DB
    participant W as Worker
    participant P as PushSender
    actor B as Perakendeci admini

    S->>API: POST /api/v1/connection-requests {buyerId, message, proposedPaymentTermDays}
    API->>DB: BEGIN
    API->>DB: ConnectionPolicy.canRequest(seller, buyer)
    Note right of DB: sırayla: aktif bağlantı, bekleyen istek,<br/>engel, bekleme süresi, günlük kota (satıcı saat dilimi)
    alt kural ihlali
        API-->>S: 409 CONNECTION_* (ilgili kod)
    end
    API->>DB: connection_requests (pending, expires_at = +14 gün)
    API->>DB: outbox: connection.request_created
    API->>DB: COMMIT
    API-->>S: 201
    W->>P: buyer admin'lerine push (kendi dillerinde)
    B->>API: GET /api/v1/connection-requests/incoming
    API-->>B: satıcı profil özeti (ürün/fiyat yok)
    B->>API: POST /api/v1/connection-requests/{id}/accept
    API->>DB: BEGIN, istek pending ve süresi geçmemiş mi
    API->>DB: request → accepted, connections (active, price_list_id = null)
    API->>DB: outbox: connection.accepted, COMMIT
    API-->>B: 200
    W->>P: isteği gönderen + satıcı admin'lerine push
    W->>W: buyer_directory indeksinde bağlantı durumu güncelle (satıcı görünümü)
    S->>API: PATCH /api/v1/connections/{id}/terms {priceListId, creditLimit, paymentTermDays, salesRepMembershipId}
```

| Hata senaryosu | Davranış |
| --- | --- |
| İki temsilci aynı anda aynı perakendeciye istek gönderir | Kısmi unique indeks (`pending`) ikinciyi reddeder → `409 CONNECTION_REQUEST_ALREADY_PENDING` |
| Kabul sırasında istek süresi dolmuş | `409 CONNECTION_REQUEST_EXPIRED` |
| Kabul sırasında satıcı askıya alınmış veya aboneliği `read_only` | Kabul yine yapılır (perakendecinin kararı); satıcı yeni istek gönderemez. 📌 VARSAYIM |
| Perakendeci satın alma rolüyle kabul etmeye çalışır | `403 PERMISSION_DENIED` |
| Koşul atanırken başka satıcının fiyat listesi kimliği verilir | RLS satırı göstermez → `404 NOT_FOUND` |

## SF-04 — Sepet gönderimi, şube onayı ve bölünme (US-040–US-042)

```mermaid
sequenceDiagram
    actor C as Şube çalışanı
    actor A as Şube admini
    participant API
    participant PR as PriceResolver
    participant DB
    participant W as Worker

    C->>API: POST /api/v1/cart/submit
    API->>DB: şube onay kuralı ve sepet toplamı
    alt onay gerekiyor
        API->>DB: carts.status = pending_approval, cart_approvals(submitted)
        API->>DB: outbox: cart.approval_requested
        API-->>C: 202 {status: pending_approval}
        W->>W: şube admin'lerine push
        A->>API: POST /api/v1/cart/approve (Idempotency-Key)
    end
    API->>DB: BEGIN
    API->>DB: sepet satırlarını kilitle (FOR UPDATE)
    API->>PR: resolve(kalemler, buyer, branch, miktarlar)
    PR-->>API: birim fiyat, indirimler, fiyat kaynağı
    loop her satıcı grubu
        API->>DB: bağlantı aktif mi? VÖEN var mı? minimum tutar?
        alt geçerli
            API->>DB: seller_sequences++, orders (submitted), order_items (kopya)
            API->>DB: order_status_history, outbox: order.submitted
        else geçersiz
            API->>API: grubu "gönderilemedi" listesine ekle
        end
    end
    API->>DB: gönderilen kalemleri sepetten sil, cart_approvals(approved, order_ids)
    API->>DB: COMMIT
    API-->>A: 200 {orders[], skippedGroups[]}
    W->>W: satıcılara push, sipariş özet önbelleği
```

| Hata senaryosu | Davranış |
| --- | --- |
| Herhangi bir adımda veritabanı hatası | Tek işlem geri alınır; hiçbir sipariş oluşmaz; sepet değişmez (US-042 AC5); `500` + istek kimliği |
| Onay sırasında fiyat değişti | Fiyat onay anında yeniden hesaplanır; yanıtta `priceChanged: true` olan satırlar işaretlenir. 📌 VARSAYIM: Fiyat değişikliği gönderimi engellemez, yalnızca bildirilir (şube admini zaten son ekranı görmüştür) |
| Bir grubun bağlantısı gönderimden önce iptal edildi | O grup `skippedGroups`'ta `CONNECTION_NOT_ACTIVE` ile döner; diğerleri oluşur |
| Alıcının VÖEN'i yok | Tüm gönderim `422 VOEN_REQUIRED` ile reddedilir |
| Şube admini aynı anda iki kez onaylar | `Idempotency-Key` + sepet satır kilidi; ikinci istek aynı yanıtı alır |
| 5'ten fazla satıcı veya 100'den fazla kalem | Desteklenir; NFR-12 hedefi yalnızca bu sınıra kadar geçerlidir |

## SF-05 — Toptancı sipariş onayı ve stok rezervasyonu (US-043, US-039)

```mermaid
sequenceDiagram
    actor M as Satış müdürü
    participant API
    participant INV as StockService
    participant DB
    participant W as Worker

    M->>API: POST /api/v1/orders/{id}/approve {lines: [{itemId, qtyApproved}]}
    API->>DB: BEGIN, sipariş FOR UPDATE, status = submitted mi
    API->>API: qtyApproved ≤ qty_ordered ve sipariş katına uygun mu
    alt stok modu quantity
        API->>INV: reserve(order, lines, tx)
        INV->>DB: stock FOR UPDATE (varsayılan depo)
        alt satılabilir < istenen
            INV-->>API: STOCK_INSUFFICIENT {itemId, available}
            API->>DB: ROLLBACK
            API-->>M: 409 STOCK_INSUFFICIENT
        end
        INV->>DB: stock.reserved += , stock_movements(reserve)
    end
    API->>DB: order_items.qty_approved, order_item_changes (farklıysa)
    API->>DB: toplamları yeniden hesapla, status = approved
    API->>DB: order_status_history, outbox: order.approved
    API->>DB: COMMIT
    API-->>M: 200
    W->>W: alıcıya push (değişiklik özetiyle), belge üretim işi
```

| Hata senaryosu | Davranış |
| --- | --- |
| Miktar artırılmak istenir | `422 ORDER_QTY_INCREASE_NOT_ALLOWED` |
| Tüm satırlar 0'a düşürülür | `422 ORDER_EMPTY_USE_REJECT` (reddetme akışı kullanılmalı) |
| Sipariş zaten onaylanmış/iptal | `409 INVALID_STATE_TRANSITION` |
| Eşzamanlı iki onay son stoğa | Satır kilidi; ikinci `409 STOCK_INSUFFICIENT` |
| Abonelik `read_only` | `403 SUBSCRIPTION_READ_ONLY` |

📌 VARSAYIM: MVP'de rezervasyon toptancının varsayılan deposundan yapılır. Çok depolu toptancıda depo seçimi Faz 2'dedir.

## SF-06 — Teslim, onay, otomatik onay ve cari borç (US-047, US-048, US-050)

```mermaid
sequenceDiagram
    actor K as Kargocu
    participant API
    participant DB
    participant W as Worker
    actor B as Şube admini

    K->>API: POST /api/v1/deliveries/{id}/delivered {photoFileId?, lat, lng}
    API->>DB: BEGIN, teslimat in_transit mi, kargocu atanan kişi mi
    API->>API: fotoğraf zorunlu mu, şubeye mesafe (haversine)
    API->>DB: delivery_proofs(courier_delivered), deliveries → delivered_pending
    API->>DB: auto_confirm_at = now + 48 saat, location_mismatch
    API->>DB: orders → delivered_pending_confirmation, outbox, COMMIT
    API-->>K: 200
    W->>B: push "Teslimatı onaylayın (48 saat)"
    alt perakendeci onaylar
        B->>API: POST /api/v1/orders/{id}/confirm-delivery
    else perakendeci itiraz eder
        B->>API: POST /api/v1/orders/{id}/dispute {type, description, fileId?}
        API->>DB: disputes(open), orders → disputed, outbox
    else 48 saat yanıt yok
        W->>API: zamanlanmış iş (15 dk): auto_confirm_at < now
    end
    API->>DB: BEGIN
    API->>DB: orders → delivered (auto_confirmed?), deliveries → confirmed
    API->>DB: ledger_entries(order_delivered, debit = total, due_date)
    API->>DB: outbox: order.delivered, COMMIT
    W->>W: satıcıya push, dashboard önbelleği
```

| Hata senaryosu | Davranış |
| --- | --- |
| Kargocu çevrimdışı | Mobil istek `Idempotency-Key` ile saklanır ve bağlantı gelince gönderilir; sunucu zamanı yerine istemcinin `deliveredAt` alanı kaydedilir ve sunucu zamanından 24 saatten eskiyse reddedilir. 📌 VARSAYIM: MVP'de yalnızca bu tek uç için basit yeniden deneme kuyruğu; tam offline mod Faz 3 |
| GPS izni yok | Konum boş kaydedilir; `location_mismatch = true` olarak işaretlenir |
| Aynı sipariş için cari kaydı iki kez | `ledger_entries` kısmi unique (`order_id`, `order_delivered`) ikinciyi engeller |
| Zamanlanmış iş iki kopyada çalışır | Redis kilidi + `status = delivered_pending` koşullu güncelleme; yalnızca biri etkiler |
| İtiraz süre dolduktan sonra | Sipariş artık `delivered`; `409 INVALID_STATE_TRANSITION`; düzeltme toptancının cari düzeltme kaydıyla yapılır |

## SF-07 — Bağlantı iptali (US-025)

```mermaid
sequenceDiagram
    actor X as Toptancı veya perakendeci admini
    participant API
    participant DB
    participant W as Worker

    X->>API: POST /api/v1/connections/{id}/cancel {reason, confirm: true}
    API->>DB: BEGIN, bağlantı active mi, çağıran tarafın izni
    API->>DB: connections → cancelled (ended_by_side, reason)
    API->>DB: submitted siparişler → cancelled (history)
    API->>DB: alıcının sepetlerinden bu satıcının kalemlerini sil
    API->>DB: outbox: connection.cancelled, COMMIT
    API-->>X: 200 {cancelledOrders: n}
    W->>W: karşı taraf admin'lerine push, ürün önbelleği temizle
```

| Hata senaryosu | Davranış |
| --- | --- |
| `confirm` alanı yok | `422 CONFIRMATION_REQUIRED` |
| Onaylı/yoldaki siparişler | Etkilenmez; teslimat ve cari normal devam eder |
| Mobil önbellekte eski ürün listesi | Sonraki ürün/sepet isteği `403 CONNECTION_NOT_ACTIVE` döner; istemci önbelleği temizler |

## SF-08 — Excel ile ürün içe aktarma (US-031)

```mermaid
sequenceDiagram
    actor U as Toptancı admini
    participant App as Web
    participant API
    participant R2
    participant W as Worker
    participant DB

    U->>App: Şablonu indir / doldur
    App->>API: POST /api/v1/files/upload-url {purpose: import, contentType, size}
    API-->>App: imzalı PUT URL (10 dk), fileId
    App->>R2: PUT dosya
    App->>API: POST /api/v1/imports {type: products, fileId}
    API->>DB: files.status = ready (imza ve boyut doğrulandı), import_jobs(uploaded)
    API-->>App: 202 {jobId}
    W->>R2: dosyayı oku
    W->>DB: satırları doğrula (birim, kategori, SKU, fiyat ≥ 0)
    W->>DB: import_jobs → preview_ready (stats), hata raporu R2'ye
    App->>API: GET /api/v1/imports/{jobId} (her 3 sn)
    U->>App: Önizlemeyi onayla
    App->>API: POST /api/v1/imports/{jobId}/apply
    W->>DB: 500'lük partilerle uygula (her parti ayrı işlem), outbox: catalog.products_changed
    W->>DB: import_jobs → done
```

| Hata senaryosu | Davranış |
| --- | --- |
| Dosya .xlsx değil veya > 10 MB | `422 FILE_INVALID` |
| 5.000 satırdan fazla | `422 IMPORT_TOO_MANY_ROWS` |
| Uygulama ortasında hata | Tamamlanan partiler kalır; iş `failed` ve hangi satıra kadar uygulandığı raporlanır; kullanıcı aynı dosyayı yeniden yükleyebilir (SKU ile güncelleme idempotendir) |
| Önizleme 24 saat onaylanmaz | İş ve dosya silinir |

## SF-09 — Dosya yükleme (görsel, teslim fotoğrafı)

```mermaid
sequenceDiagram
    participant App as Web / Mobil
    participant API
    participant R2
    App->>API: POST /api/v1/files/upload-url {purpose, contentType, size}
    API->>API: tür ve boyut sınırı (NFR-49), izin
    API-->>App: {fileId, uploadUrl (10 dk), headers}
    App->>R2: PUT
    App->>API: POST /api/v1/files/{fileId}/complete
    API->>R2: HEAD + ilk baytlar (imza kontrolü)
    alt geçerli
        API-->>App: 200 {status: ready, url?}
    else geçersiz
        API->>R2: sil
        API-->>App: 422 FILE_INVALID
    end
```

Ürün görseli `public` bucket'a, teslim fotoğrafı ve belgeler `private` bucket'a yazılır. `private` dosyalar yalnızca süreli imzalı GET URL'siyle (5 dk) okunur.

📌 VARSAYIM: Görsel küçültme (200 / 800 / 1600 px) Cloudflare'in görsel dönüştürme özelliğiyle değil, worker'da yükleme sonrası yapılır (ek ücretli özellik kullanmamak için).
