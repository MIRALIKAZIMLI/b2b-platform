// Excel içe aktarma şablonu ve raporu metinleri (`ui_translations`, F3.5a; US-031 AC1–AC2).
// Worker ve API bu anahtarları işi açanın dilinde okur (kart K13, K20). Taslak AI tarafından
// yazıldı; platform sahibi PR'da gözden geçirir (az/ru/tr onayı bekliyor).
import type { ErrorMessageText } from './error-messages';

const t = (az: string, ru: string, tr: string): ErrorMessageText => ({ az, ru, tr });

export const IMPORT_MESSAGES: Readonly<Record<string, ErrorMessageText>> = {
  // Sayfa adları (Excel: en çok 31 karakter).
  'imports.sheet.products': t('Məhsullar', 'Товары', 'Ürünler'),
  'imports.sheet.instructions': t('Təlimat', 'Инструкция', 'Açıklama'),
  'imports.sheet.categories': t('Kateqoriyalar', 'Категории', 'Kategoriler'),
  'imports.sheet.units': t('Vahidlər', 'Единицы', 'Birimler'),
  'imports.sheet.report': t('Hesabat', 'Отчёт', 'Rapor'),
  // Açıklama sayfası.
  'imports.template.intro': t(
    'Məhsulları birinci səhifəyə doldurun. Birinci sətirdəki sütun adlarını dəyişməyin. Eyni SKU olan məhsul yenilənir (böyük/kiçik hərf fərq etmir).',
    'Заполните товары на первом листе. Не меняйте названия столбцов в первой строке. Товар с тем же SKU обновляется (регистр не важен).',
    'Ürünleri ilk sayfaya doldurun. İlk satırdaki sütun adlarını değiştirmeyin. Aynı SKU’lu ürün güncellenir (büyük/küçük harf fark etmez).',
  ),
  'imports.template.column': t('Sütun', 'Столбец', 'Sütun'),
  'imports.template.description': t('İzah', 'Описание', 'Açıklama'),
  'imports.template.required': t('Məcburi', 'Обязательно', 'Zorunlu'),
  'imports.template.required_new': t('Yeni məhsul üçün', 'Для нового товара', 'Yeni ürün için'),
  'imports.template.required_always': t('Bəli', 'Да', 'Evet'),
  'imports.template.optional': t('Xeyr', 'Нет', 'Hayır'),
  'imports.template.category_name': t('Kateqoriya', 'Категория', 'Kategori'),
  'imports.template.category_path': t('Yol', 'Путь', 'Yol'),
  'imports.template.unit_code': t('Kod', 'Код', 'Kod'),
  'imports.template.unit_name': t('Ad', 'Название', 'Ad'),
  'imports.template.unit_abbreviation': t('Qısaltma', 'Сокращение', 'Kısaltma'),
  // Sütun açıklamaları.
  'imports.column.sku': t(
    'Məhsulun stok kodu (SKU). Hərf, rəqəm, . _ - /; boşluqsuz, ən çox 64 simvol.',
    'Артикул товара (SKU). Буквы, цифры, . _ - /; без пробелов, до 64 символов.',
    'Ürünün stok kodu (SKU). Harf, rakam, . _ - /; boşluksuz, en çok 64 karakter.',
  ),
  'imports.column.barcode': t(
    'Barkod (EAN-8, UPC-12, EAN-13 və ya GTIN-14).',
    'Штрихкод (EAN-8, UPC-12, EAN-13 или GTIN-14).',
    'Barkod (EAN-8, UPC-12, EAN-13 veya GTIN-14).',
  ),
  'imports.column.name_az': t(
    'Ad (azərbaycanca).',
    'Название (на азербайджанском).',
    'Ad (Azerbaycanca).',
  ),
  'imports.column.name_ru': t('Ad (rusca).', 'Название (на русском).', 'Ad (Rusça).'),
  'imports.column.name_tr': t('Ad (türkcə).', 'Название (на турецком).', 'Ad (Türkçe).'),
  'imports.column.category': t(
    '"Kateqoriyalar" səhifəsindəki ad və ya yol (məs. "Üst / Alt"). Eyni ad bir neçə dəfə varsa, yolu yazın.',
    'Название или путь со страницы «Категории» (напр. «Верх / Низ»). Если название повторяется, укажите путь.',
    '"Kategoriler" sayfasındaki ad veya yol (ör. "Üst / Alt"). Aynı ad birden çok varsa yolu yazın.',
  ),
  'imports.column.brand': t(
    'Təsdiqlənmiş marka adı (boş ola bilər).',
    'Название утверждённого бренда (можно оставить пустым).',
    'Onaylı marka adı (boş bırakılabilir).',
  ),
  'imports.column.unit': t(
    'Əsas vahid: "Vahidlər" səhifəsindəki kod və ya ad. Mövcud məhsulda dəyişmir.',
    'Базовая единица: код или название со страницы «Единицы». У существующего товара не меняется.',
    'Temel birim: "Birimler" sayfasındaki kod veya ad. Var olan üründe değişmez.',
  ),
  'imports.column.case_qty': t(
    'Bir qutudakı əsas vahid sayı (1-dən böyük).',
    'Количество базовых единиц в коробке (больше 1).',
    'Bir kolideki temel birim sayısı (1’den büyük).',
  ),
  'imports.column.price': t(
    'Bir əsas vahidin qiyməti; standart qiymət siyahısına yazılır. Ən çox 4 onluq.',
    'Цена одной базовой единицы; записывается в прайс-лист по умолчанию. До 4 знаков после запятой.',
    'Bir temel birimin fiyatı; varsayılan fiyat listesine yazılır. En çok 4 ondalık.',
  ),
  'imports.column.stock': t(
    'Stok sayı. Hələlik tətbiq edilmir.',
    'Остаток. Пока не применяется.',
    'Stok miktarı. Henüz uygulanmıyor.',
  ),
  // Rapor başlıkları.
  'imports.report.row': t('Sətir', 'Строка', 'Satır'),
  'imports.report.sku': t('SKU', 'SKU', 'SKU'),
  'imports.report.column': t('Sütun', 'Столбец', 'Sütun'),
  'imports.report.problem': t('Problem', 'Проблема', 'Sorun'),
  'imports.report.kind': t('Növ', 'Тип', 'Tür'),
  'imports.report.error': t('Xəta', 'Ошибка', 'Hata'),
  'imports.report.warning': t('Xəbərdarlıq', 'Предупреждение', 'Uyarı'),
  // F3.5c sonuç raporu (US-031 AC3).
  'imports.sheet.result': t('Nəticə', 'Результат', 'Sonuç'),
  'imports.report.result': t('Nəticə', 'Результат', 'Sonuç'),
  'imports.result.insert': t('Əlavə edildi', 'Добавлен', 'Eklendi'),
  'imports.result.update': t('Yeniləndi', 'Обновлён', 'Güncellendi'),
  'imports.result.error': t('Tətbiq edilmədi', 'Не применён', 'Uygulanmadı'),
  // F3.7a müşteri fiyatı (US-035 AC2): şablon, fark raporu, sonuç.
  'imports.result.unchanged': t('Dəyişməyib', 'Без изменений', 'Değişmedi'),
  'imports.sheet.customer_prices': t('Müştəri qiymətləri', 'Цены клиента', 'Müşteri fiyatları'),
  'imports.template.customer_prices_intro': t(
    'Bu fayl yalnız seçilmiş müştəri üçündür. "price" sütununa yeni qiyməti yazın; qiyməti boş olan sətirlər dəyişmir. "name" və "current_price" yalnız məlumat üçündür.',
    'Файл только для выбранного клиента. Впишите новую цену в столбец «price»; строки без цены не меняются. «name» и «current_price» — только для справки.',
    'Bu dosya yalnız seçilen müşteri içindir. "price" sütununa yeni fiyatı yazın; fiyatı boş satırlar değişmez. "name" ve "current_price" yalnız bilgi içindir.',
  ),
  'imports.column.name': t(
    'Məhsulun adı (dəyişdirilmir).',
    'Название товара (не изменяется).',
    'Ürün adı (değiştirilmez).',
  ),
  'imports.column.current_price': t(
    'Bu müştərinin bu günkü qiyməti (dəyişdirilmir).',
    'Сегодняшняя цена для этого клиента (не изменяется).',
    'Bu müşterinin bugünkü fiyatı (değiştirilmez).',
  ),
  'imports.column.customer_price': t(
    'Müştəriyə xüsusi yeni qiymət (vahid üçün); dərhal qüvvəyə minir.',
    'Новая индивидуальная цена клиента (за штуку); действует сразу.',
    'Müşteriye özel yeni fiyat (adet başına); hemen geçerli olur.',
  ),
  'imports.report.action': t('Əməliyyat', 'Действие', 'İşlem'),
  'imports.report.current_price': t('İndiki qiymət', 'Текущая цена', 'Şu anki fiyat'),
  'imports.report.new_price': t('Yeni qiymət', 'Новая цена', 'Yeni fiyat'),
  'imports.action.insert': t('Yeni qiymət', 'Новая цена', 'Yeni fiyat'),
  'imports.action.update': t('Qiymət dəyişir', 'Цена меняется', 'Fiyat değişiyor'),
  'imports.action.unchanged': t('Dəyişmir', 'Без изменений', 'Değişmiyor'),
  'imports.action.error': t('Xəta', 'Ошибка', 'Hata'),
  // Satır hataları ve uyarıları.
  'imports.row.required': t('Doldurulmalıdır.', 'Обязательное поле.', 'Doldurulmalı.'),
  'imports.row.invalid': t('Dəyər yanlışdır.', 'Неверное значение.', 'Değer geçersiz.'),
  'imports.row.too_long': t('Mətn çox uzundur.', 'Слишком длинный текст.', 'Metin çok uzun.'),
  'imports.row.duplicate_in_file': t(
    'Bu SKU faylda bir neçə dəfə var.',
    'Этот SKU встречается в файле несколько раз.',
    'Bu SKU dosyada birden çok kez var.',
  ),
  'imports.row.archived': t(
    'Bu SKU arxivdəki məhsula aiddir.',
    'Этот SKU принадлежит архивному товару.',
    'Bu SKU arşivdeki bir ürüne ait.',
  ),
  'imports.row.variant_ambiguous': t(
    'Məhsulun bir neçə variantı var; variantın SKU-sunu yazın.',
    'У товара несколько вариантов; укажите SKU варианта.',
    'Ürünün birden çok varyantı var; varyantın SKU’sunu yazın.',
  ),
  'imports.row.not_found': t('Tapılmadı.', 'Не найдено.', 'Bulunamadı.'),
  'imports.row.ambiguous': t(
    'Bir neçə uyğun qeyd var.',
    'Найдено несколько совпадений.',
    'Birden çok eşleşme var.',
  ),
  'imports.row.inactive': t('Aktiv deyil.', 'Неактивно.', 'Aktif değil.'),
  'imports.row.invalid_gtin': t('Barkod yanlışdır.', 'Неверный штрихкод.', 'Barkod geçersiz.'),
  'imports.row.not_positive': t(
    '0-dan böyük olmalıdır.',
    'Должно быть больше 0.',
    '0’dan büyük olmalı.',
  ),
  'imports.row.not_integer': t(
    'Tam ədəd olmalıdır.',
    'Должно быть целым числом.',
    'Tam sayı olmalı.',
  ),
  'imports.row.must_exceed_one': t(
    '1-dən böyük olmalıdır.',
    'Должно быть больше 1.',
    '1’den büyük olmalı.',
  ),
  'imports.row.too_many_decimals': t(
    'Ən çox 4 onluq ola bilər.',
    'Не более 4 знаков после запятой.',
    'En çok 4 ondalık olabilir.',
  ),
  'imports.row.negative': t('Mənfi ola bilməz.', 'Не может быть отрицательным.', 'Negatif olamaz.'),
  'imports.row.cannot_change': t(
    'Mövcud məhsulda dəyişdirilə bilməz.',
    'Нельзя изменить у существующего товара.',
    'Var olan üründe değiştirilemez.',
  ),
  'imports.row.no_default_price_list': t(
    'Standart qiymət siyahısı yoxdur; əvvəlcə qiymət siyahısı yaradın.',
    'Нет прайс-листа по умолчанию; сначала создайте прайс-лист.',
    'Varsayılan fiyat listesi yok; önce fiyat listesi oluşturun.',
  ),
  // F3.5c: uygulamada çıkan satır hataları.
  'imports.row.packaging_conflict': t(
    'Qutudakı say mövcud qablaşdırma ilə uyğun gəlmir (məs. daxili paketdən böyük olmalıdır).',
    'Количество в коробке не согласуется с упаковкой товара (напр. должно быть больше внутренней упаковки).',
    'Koli içi adet mevcut ambalajla uyuşmuyor (ör. iç paketten büyük olmalı).',
  ),
  'imports.row.no_unit_packaging': t(
    'Bu variantın "ədəd" qablaşdırması yoxdur; qiymət yazıla bilməz.',
    'У этого варианта нет упаковки «штука»; цену записать нельзя.',
    'Bu varyantın "adet" ambalajı yok; fiyat yazılamaz.',
  ),
  'imports.row.taken': t(
    'Bu SKU artıq başqa məhsulda istifadə olunur.',
    'Этот SKU уже используется другим товаром.',
    'Bu SKU başka bir üründe kullanılıyor.',
  ),
  'imports.row.price_ignored_no_permission': t(
    'Qiymət yazmaq icazəniz yoxdur; qiymət nəzərə alınmayacaq.',
    'У вас нет права менять цены; цена будет пропущена.',
    'Fiyat yazma yetkiniz yok; fiyat yok sayılacak.',
  ),
  'imports.row.price_unchanged': t(
    'Qiymət indiki müştəri qiyməti ilə eynidir; dəyişiklik yoxdur.',
    'Цена совпадает с текущей ценой клиента; изменений нет.',
    'Fiyat şu anki müşteri fiyatıyla aynı; değişiklik yok.',
  ),
  // İş notları (V3).
  'imports.note.stock_column_ignored': t(
    'Stok sütunu hələlik tətbiq edilmir.',
    'Столбец остатков пока не применяется.',
    'Stok sütunu henüz uygulanmıyor.',
  ),
};
