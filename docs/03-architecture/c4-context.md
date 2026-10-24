# C4 Seviye 1 — Sistem Bağlamı

| Alan | Değer |
| --- | --- |
| Sürüm | 1.0 |
| Tarih | 2026-10-24 |

Bu diyagram platformu tek bir kutu olarak gösterir: kim kullanır ve hangi dış sistemlerle konuşur. İç yapı [c4-container.md](c4-container.md) dosyasındadır.

```mermaid
flowchart TB
    subgraph People[Kullanıcılar]
        PA["Platform admini<br/>(P-01)"]
        SEL["Toptancı ekibi<br/>admin, satış, temsilci,<br/>depo, kargocu, muhasebe<br/>(P-02 – P-07)"]
        BUY["Perakendeci ekibi<br/>admin, şube admini,<br/>satın alma<br/>(P-08 – P-10)"]
    end

    SYS["B2B Toptan–Perakende Platformu<br/>Bağlantı ağı, katalog, fiyat, stok,<br/>sipariş, teslimat, cari"]

    subgraph External[Dış sistemler]
        SMS["SMS sağlayıcısı<br/>(OTP; dev/staging'de mock)"]
        PUSH["Expo Push Service<br/>→ APNs / FCM"]
        CF["Cloudflare<br/>DNS, CDN, R2 dosya deposu"]
        STORE["App Store / Google Play<br/>(TestFlight, Play iç test)"]
        ETAX["e-taxes.gov.az<br/>(yalnızca moderatörün elle<br/>VÖEN sorgusu; entegrasyon yok)"]
    end

    subgraph Future[İleride — adaptör hazır, MVP'de yok]
        PAY["Ödeme sağlayıcısı"]
        EINV["e-qaimə"]
        CAR["Kargo firması API"]
        ERP["1C / ERP"]
        WA["WhatsApp Business API"]
    end

    PA -->|"Web: toptancı açar, denetler, ayarlar"| SYS
    SEL -->|"Web + mobil: ürün, fiyat, istek,<br/>sipariş onayı, teslimat, cari"| SYS
    BUY -->|"Mobil + web: kayıt, istek yanıtı,<br/>sepet, onay, teslim onayı"| SYS

    SYS -->|"OTP gönderir"| SMS
    SYS -->|"Bildirim gönderir"| PUSH
    SYS -->|"Görsel ve belge saklar"| CF
    STORE -->|"Mobil uygulamayı dağıtır"| BUY
    STORE -->|"Mobil uygulamayı dağıtır"| SEL
    PA -.->|"Elle VÖEN sorgusu"| ETAX

    SYS -.-> PAY
    SYS -.-> EINV
    SYS -.-> CAR
    SYS -.-> ERP
    SYS -.-> WA
```

## Açıklama

| Öğe | Tür | Etkileşim |
| --- | --- | --- |
| Platform admini | Kişi | Web paneli. Toptancı açar, perakendecileri denetler, ayarları, planları, katalogları ve çevirileri yönetir. Müşteri verisini (fiyat, sipariş, cari) değiştiremez. |
| Toptancı ekibi | Kişi | Web (yönetim, katalog, fiyat, cari) ve mobil (temsilci, depo, kargocu). |
| Perakendeci ekibi | Kişi | Ana kanal mobil; web sürümü aynı işlevlerle. |
| SMS sağlayıcısı | Dış sistem | Yalnızca OTP. Geliştirme ve staging'de mock gönderici (NFR-95–NFR-98). |
| Expo Push Service | Dış sistem | Push bildirimlerini APNs (iOS) ve FCM (Android) üzerinden iletir. |
| Cloudflare | Dış sistem | DNS, TLS, CDN ve R2 dosya deposu. |
| App Store / Google Play | Dış sistem | Mobil dağıtım: önce TestFlight ve Play iç test. |
| e-taxes.gov.az | Dış sistem | Sistemle entegre değildir; moderatör VÖEN'i elle sorgular. |
| İleride eklenecekler | Dış sistem | Adaptör arayüzleri tanımlıdır; MVP'de bağlantı yoktur (ADR-0008). |

**Güven sınırları:** Tüm kullanıcı trafiği Cloudflare üzerinden gelir. Platformdan dışarı giden tek MVP bağlantıları SMS sağlayıcısı, Expo Push Service ve Cloudflare R2'dir. Ayrıntı: [threat-model.md](threat-model.md).
