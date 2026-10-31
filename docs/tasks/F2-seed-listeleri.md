# F2 seed listeleri: pilot bölgeler ve faaliyet türleri

| Alan | Değer |
| --- | --- |
| Durum | **Onaylandı** (platform sahibi, 2026-10-31; F2 faz spesifikasyonu S4, S5) |
| Kullanım | `regions` seed'i → F2.1a; `activity_types` seed'i → F2.3a |

Kurallar: `regions` şehir (`type = city`) → rayon (`type = district`, `parent_id` = şehir), `country_code = AZ`. `name` jsonb `{az, ru, tr}`. `activity_types.sort_order` aşağıdaki sıra; tümü `is_active = true`. Seed tekrar çalıştırılabilir olmalı (aynı ad varsa eklemez). Listeye ekleme/çıkarma yalnızca platform sahibinin onayıyla.

## 1. Pilot bölgeler (`regions`)

Pilot kapsamı: Bakı ve çevresi. Tüm ülke listesi sonra eklenir.

### Şehirler

| # | az | ru | tr |
| --- | --- | --- | --- |
| 1 | Bakı | Баку | Bakü |
| 2 | Sumqayıt | Сумгайыт | Sumgayıt |
| 3 | Xırdalan | Хырдалан | Hırdalan |
| 4 | Gəncə | Гянджа | Gence |

### Bakı rayonları (üst bölge: Bakı)

| # | az | ru | tr |
| --- | --- | --- | --- |
| 1 | Binəqədi rayonu | Бинагадинский район | Binegedi rayonu |
| 2 | Qaradağ rayonu | Гарадагский район | Karadağ rayonu |
| 3 | Xətai rayonu | Хатаинский район | Hatai rayonu |
| 4 | Xəzər rayonu | Хазарский район | Hazar rayonu |
| 5 | Nərimanov rayonu | Наримановский район | Nerimanov rayonu |
| 6 | Nəsimi rayonu | Насиминский район | Nesimi rayonu |
| 7 | Nizami rayonu | Низаминский район | Nizami rayonu |
| 8 | Pirallahı rayonu | Пираллахинский район | Pirallahı rayonu |
| 9 | Sabunçu rayonu | Сабунчинский район | Sabunçu rayonu |
| 10 | Səbail rayonu | Сабаильский район | Sebail rayonu |
| 11 | Suraxanı rayonu | Сураханский район | Suraxanı rayonu |
| 12 | Yasamal rayonu | Ясамальский район | Yasamal rayonu |


## 2. Faaliyet türleri (`activity_types`)

Perakendeci kaydolurken bunlardan birini seçer. Liste toptancının dizinde filtrelemesi için kullanılır.

| # | az | ru | tr |
| --- | --- | --- | --- |
| 1 | Market / ərzaq mağazası | Продуктовый магазин | Market / bakkal |
| 2 | Supermarket | Супермаркет | Süpermarket |
| 3 | Kafe | Кафе | Kafe |
| 4 | Restoran | Ресторан | Restoran |
| 5 | Otel | Гостиница | Otel |
| 6 | Aptek | Аптека | Eczane |
| 7 | Kosmetika və gigiyena mağazası | Магазин косметики и гигиены | Kozmetik ve hijyen mağazası |
| 8 | Məişət kimyası mağazası | Магазин бытовой химии | Temizlik ürünleri mağazası |
| 9 | Dəftərxana mağazası | Канцелярский магазин | Kırtasiye |
| 10 | Tikinti materialları mağazası | Магазин стройматериалов | Yapı malzemeleri mağazası |
| 11 | Digər | Другое | Diğer |
