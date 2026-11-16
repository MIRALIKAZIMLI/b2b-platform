// Web arayüzü başlangıç çevirileri (`ui_translations`, F1.13a: giriş ekranı ve dil seçici;
// F1.13b: kabuk, işletme seçici, menü; F1.14b: mobil güncelleme, bağlantı yok, platform bilgisi;
// F2.1b: admin toptancı ekranları, aktivasyon sayfası; F2.3b: perakendeci kaydı, veri paylaşım metni;
// F2.6: toptancı ayarları — satıcı profili, depolar, hizmet bölgeleri; F2.7b: ekip ekranı, ekip
// daveti kabulü; F2.11b: perakendeci dizini; F2.12b: bağlantı isteği gönderme; F2.13b: gelen istekler ve engel;
// F2.14b: toptancı müşterileri ve bağlantı koşulları; F2.15b: bağlantı iptali, toptancılarım;
// F2.5b: şubeler ve onay kuralı; F3.1: birim kataloğu).
// Taslak AI tarafından yazıldı; platform sahibi PR'da gözden geçirir (az/ru/tr onayı bekliyor).
// Yer tutucular next-intl (ICU) biçiminde: {phone}.
import type { ErrorMessageText } from './error-messages';

export const UI_MESSAGES: Readonly<Record<string, ErrorMessageText>> = {
  'auth.login.title': { az: 'Daxil ol', ru: 'Вход', tr: 'Giriş yap' },
  'auth.login.phone_label': { az: 'Telefon nömrəsi', ru: 'Номер телефона', tr: 'Telefon numarası' },
  'auth.login.send_code': { az: 'Kod göndər', ru: 'Получить код', tr: 'Kod gönder' },
  'auth.login.code_sent': {
    az: '{phone} nömrəsinə SMS kod göndərildi.',
    ru: 'SMS-код отправлен на номер {phone}.',
    tr: '{phone} numarasına SMS kodu gönderildi.',
  },
  'auth.login.code_label': { az: 'SMS kod', ru: 'Код из SMS', tr: 'SMS kodu' },
  'auth.login.verify': { az: 'Təsdiqlə', ru: 'Подтвердить', tr: 'Doğrula' },
  'auth.login.change_phone': {
    az: 'Nömrəni dəyiş',
    ru: 'Изменить номер',
    tr: 'Numarayı değiştir',
  },
  'auth.login.totp_label': {
    az: 'Autentifikator kodu və ya bərpa kodu',
    ru: 'Код аутентификатора или код восстановления',
    tr: 'Doğrulayıcı kodu veya kurtarma kodu',
  },
  'auth.login.totp_setup_hint': {
    az: 'Bu açarı autentifikator tətbiqinə əlavə edin, sonra tətbiqdəki kodu daxil edin.',
    ru: 'Добавьте этот ключ в приложение-аутентификатор и введите код из приложения.',
    tr: 'Bu anahtarı doğrulayıcı uygulamasına ekleyin, sonra uygulamadaki kodu girin.',
  },
  'auth.login.recovery_codes_title': {
    az: 'Bərpa kodları (yalnız bir dəfə göstərilir, təhlükəsiz yerdə saxlayın)',
    ru: 'Коды восстановления (показываются один раз, сохраните их в надёжном месте)',
    tr: 'Kurtarma kodları (yalnızca bir kez gösterilir, güvenli bir yerde saklayın)',
  },
  'auth.login.continue': { az: 'Davam et', ru: 'Продолжить', tr: 'Devam et' },
  'common.loading': { az: 'Yüklənir…', ru: 'Загрузка…', tr: 'Yükleniyor…' },
  'common.language': { az: 'Dil', ru: 'Язык', tr: 'Dil' },
  'common.logout': { az: 'Çıxış', ru: 'Выйти', tr: 'Çıkış' },
  'shell.business_label': { az: 'Biznes', ru: 'Компания', tr: 'İşletme' },
  'shell.menu_label': { az: 'Menyu', ru: 'Меню', tr: 'Menü' },
  'shell.no_business': {
    az: 'Hesabınız hələ heç bir biznesə bağlı deyil.',
    ru: 'Ваш аккаунт пока не привязан ни к одной компании.',
    tr: 'Hesabınız henüz bir işletmeye bağlı değil.',
  },
  'shell.platform_on_web': {
    az: 'Platform paneli yalnız veb versiyada açılır.',
    ru: 'Панель платформы доступна только в веб-версии.',
    tr: 'Platform paneli yalnızca web sürümünde açılır.',
  },
  'shell.update.required_title': {
    az: 'Zəhmət olmasa, tətbiqi yeniləyin',
    ru: 'Пожалуйста, обновите приложение',
    tr: 'Lütfen uygulamayı güncelleyin',
  },
  'shell.update.required_body': {
    az: 'Bu versiya artıq dəstəklənmir. Davam etmək üçün yeni versiyanı yükləyin.',
    ru: 'Эта версия больше не поддерживается. Установите новую версию, чтобы продолжить.',
    tr: 'Bu sürüm artık desteklenmiyor. Devam etmek için yeni sürümü yükleyin.',
  },
  'shell.update.recommended_body': {
    az: 'Tətbiqin yeni versiyası var.',
    ru: 'Доступна новая версия приложения.',
    tr: 'Uygulamanın yeni bir sürümü var.',
  },
  'shell.update.open_store': { az: 'Yenilə', ru: 'Обновить', tr: 'Güncelle' },
  'shell.update.dismiss': { az: 'Sonra', ru: 'Позже', tr: 'Sonra' },
  'shell.offline.title': {
    az: 'Serverə qoşulmaq mümkün olmadı',
    ru: 'Не удалось подключиться к серверу',
    tr: 'Sunucuya bağlanılamadı',
  },
  'shell.offline.body': {
    az: 'İnternet bağlantısını yoxlayın və yenidən cəhd edin.',
    ru: 'Проверьте подключение к интернету и попробуйте снова.',
    tr: 'İnternet bağlantınızı kontrol edip yeniden deneyin.',
  },
  'shell.offline.retry': { az: 'Yenidən cəhd et', ru: 'Повторить', tr: 'Yeniden dene' },
  'shell.dashboard_soon': {
    az: 'İdarə paneli kartları tezliklə əlavə olunacaq.',
    ru: 'Карточки панели скоро появятся.',
    tr: 'Panel kartları yakında eklenecek.',
  },
  'shell.menu.dashboard': { az: 'İdarə paneli', ru: 'Панель', tr: 'Panel' },
  'shell.menu.directory': { az: 'Pərakəndəçi tap', ru: 'Найти розницу', tr: 'Perakendeci bul' },
  'shell.menu.customers': { az: 'Müştərilərim', ru: 'Мои клиенты', tr: 'Müşterilerim' },
  'shell.menu.requests': { az: 'Sorğular', ru: 'Запросы', tr: 'İstekler' },
  'shell.menu.incoming_requests': {
    az: 'Gələn sorğular',
    ru: 'Входящие запросы',
    tr: 'Gelen istekler',
  },
  'shell.menu.products': { az: 'Məhsullar', ru: 'Товары', tr: 'Ürünler' },
  'shell.menu.prices': { az: 'Qiymətlər', ru: 'Цены', tr: 'Fiyatlar' },
  'shell.menu.stock': { az: 'Anbar qalığı', ru: 'Остатки', tr: 'Stok' },
  'shell.menu.cart': { az: 'Səbət', ru: 'Корзина', tr: 'Sepet' },
  'shell.menu.approvals': { az: 'Təsdiqlər', ru: 'Согласования', tr: 'Onaylar' },
  'shell.menu.orders': { az: 'Sifarişlər', ru: 'Заказы', tr: 'Siparişler' },
  'shell.menu.delivery': { az: 'Çatdırılma', ru: 'Доставка', tr: 'Teslimat' },
  'shell.menu.suppliers': { az: 'Topdançılarım', ru: 'Мои поставщики', tr: 'Toptancılarım' },
  'shell.menu.ledger': { az: 'Cari hesab', ru: 'Взаиморасчёты', tr: 'Cari' },
  'shell.menu.reports': { az: 'Hesabatlar', ru: 'Отчёты', tr: 'Raporlar' },
  'shell.menu.team': { az: 'Komanda', ru: 'Команда', tr: 'Ekip' },
  'shell.menu.audit': { az: 'Audit jurnalı', ru: 'Журнал аудита', tr: 'Denetim kaydı' },
  'shell.menu.settings': { az: 'Parametrlər', ru: 'Настройки', tr: 'Ayarlar' },
  'shell.menu.sellers': { az: 'Topdançılar', ru: 'Оптовики', tr: 'Toptancılar' },
  'shell.menu.profile': {
    az: 'Profil və məxfilik',
    ru: 'Профиль и приватность',
    tr: 'Profil ve gizlilik',
  },
  'adminSellers.title': { az: 'Topdançılar', ru: 'Оптовики', tr: 'Toptancılar' },
  'adminSellers.new': { az: 'Yeni topdançı', ru: 'Новый оптовик', tr: 'Yeni toptancı' },
  'adminSellers.empty': {
    az: 'Hələ topdançı yoxdur.',
    ru: 'Оптовиков пока нет.',
    tr: 'Henüz toptancı yok.',
  },
  'adminSellers.load_more': { az: 'Daha çox göstər', ru: 'Показать ещё', tr: 'Daha fazla göster' },
  'adminSellers.column.legal_name': { az: 'Hüquqi ad', ru: 'Наименование', tr: 'Unvan' },
  'adminSellers.column.voen': { az: 'VÖEN', ru: 'VÖEN', tr: 'VÖEN' },
  'adminSellers.column.status': { az: 'Status', ru: 'Статус', tr: 'Durum' },
  'adminSellers.column.activation': { az: 'Aktivləşmə', ru: 'Активация', tr: 'Aktivasyon' },
  'adminSellers.column.actions': { az: 'Əməliyyat', ru: 'Действия', tr: 'İşlem' },
  'adminSellers.status.active': { az: 'Aktiv', ru: 'Активен', tr: 'Aktif' },
  'adminSellers.status.suspended': { az: 'Dayandırılıb', ru: 'Приостановлен', tr: 'Askıda' },
  'adminSellers.status.dormant': { az: 'Passiv', ru: 'Неактивен', tr: 'Pasif' },
  'adminSellers.status.archived': { az: 'Arxivdə', ru: 'В архиве', tr: 'Arşivde' },
  'adminSellers.activation.pending': { az: 'Gözləyir', ru: 'Ожидает', tr: 'Bekliyor' },
  'adminSellers.activation.accepted': { az: 'Aktivləşib', ru: 'Активирован', tr: 'Aktifleşti' },
  'adminSellers.activation.expired': { az: 'Vaxtı keçib', ru: 'Срок истёк', tr: 'Süresi doldu' },
  'adminSellers.resend': { az: 'Yenidən göndər', ru: 'Отправить повторно', tr: 'Yeniden gönder' },
  'adminSellers.resend_done': {
    az: 'Yeni aktivləşmə linki göndərildi.',
    ru: 'Новая ссылка активации отправлена.',
    tr: 'Yeni aktivasyon bağlantısı gönderildi.',
  },
  'adminSellers.sms_not_sent': {
    az: 'Aktivləşmə SMS-i göndərilmədi. «Yenidən göndər» ilə təkrar cəhd edin.',
    ru: 'SMS активации не отправлено. Повторите через «Отправить повторно».',
    tr: "Aktivasyon SMS'i gönderilemedi. «Yeniden gönder» ile tekrar deneyin.",
  },
  'adminSellers.form.title': { az: 'Yeni topdançı', ru: 'Новый оптовик', tr: 'Yeni toptancı' },
  'adminSellers.form.legal_name': { az: 'Hüquqi ad', ru: 'Наименование', tr: 'Unvan' },
  'adminSellers.form.voen': { az: 'VÖEN', ru: 'VÖEN', tr: 'VÖEN' },
  'adminSellers.form.region': { az: 'Region', ru: 'Регион', tr: 'Bölge' },
  'adminSellers.form.address': { az: 'Ünvan', ru: 'Адрес', tr: 'Adres' },
  'adminSellers.form.owner_name': {
    az: 'Səlahiyyətli şəxsin adı',
    ru: 'Имя уполномоченного лица',
    tr: 'Yetkili adı',
  },
  'adminSellers.form.owner_phone': {
    az: 'Səlahiyyətli şəxsin telefonu',
    ru: 'Телефон уполномоченного лица',
    tr: 'Yetkili telefonu',
  },
  'adminSellers.form.plan': { az: 'Plan', ru: 'Тариф', tr: 'Plan' },
  'adminSellers.form.service_areas': {
    az: 'Xidmət regionları',
    ru: 'Регионы обслуживания',
    tr: 'Hizmet bölgeleri',
  },
  'adminSellers.form.currency': { az: 'Valyuta', ru: 'Валюта', tr: 'Para birimi' },
  'adminSellers.form.timezone': { az: 'Saat qurşağı', ru: 'Часовой пояс', tr: 'Saat dilimi' },
  'adminSellers.form.choose': { az: 'Seçin', ru: 'Выберите', tr: 'Seçin' },
  'adminSellers.form.submit': { az: 'Yarat', ru: 'Создать', tr: 'Oluştur' },
  'adminSellers.form.created': {
    az: 'Topdançı yaradıldı.',
    ru: 'Оптовик создан.',
    tr: 'Toptancı oluşturuldu.',
  },
  'adminSellers.form.back_to_list': { az: 'Siyahıya qayıt', ru: 'К списку', tr: 'Listeye dön' },
  'adminSellers.form.error.required': {
    az: 'Bu sahə mütləqdir.',
    ru: 'Обязательное поле.',
    tr: 'Bu alan zorunlu.',
  },
  'adminSellers.form.error.too_long': {
    az: 'Dəyər çox uzundur.',
    ru: 'Слишком длинное значение.',
    tr: 'Değer çok uzun.',
  },
  'adminSellers.form.error.VOEN_INVALID': {
    az: 'VÖEN 10 rəqəmdir, sonuncu rəqəm 1 və ya 2.',
    ru: 'VÖEN — 10 цифр, последняя 1 или 2.',
    tr: 'VÖEN 10 hanedir, son hane 1 veya 2.',
  },
  'adminSellers.form.error.VOEN_ALREADY_REGISTERED': {
    az: 'Bu VÖEN ilə biznes artıq qeydiyyatdadır.',
    ru: 'Компания с этим VÖEN уже зарегистрирована.',
    tr: 'Bu VÖEN ile kayıtlı bir işletme zaten var.',
  },
  'adminSellers.form.error.invalid_phone': {
    az: 'Telefon nömrəsi yanlışdır (+994…).',
    ru: 'Неверный номер телефона (+994…).',
    tr: 'Telefon numarası geçersiz (+994…).',
  },
  'adminSellers.form.error.invalid_plan': {
    az: 'Plan seçimi yanlışdır.',
    ru: 'Неверный тариф.',
    tr: 'Plan seçimi geçersiz.',
  },
  'adminSellers.form.error.not_found': {
    az: 'Seçilmiş region tapılmadı.',
    ru: 'Выбранный регион не найден.',
    tr: 'Seçilen bölge bulunamadı.',
  },
  'adminSellers.form.error.inactive_currency': {
    az: 'Bu valyuta aktiv deyil.',
    ru: 'Эта валюта не активна.',
    tr: 'Bu para birimi etkin değil.',
  },
  'adminSellers.form.error.invalid_currency': {
    az: 'Valyuta kodu 3 böyük hərfdir (AZN).',
    ru: 'Код валюты — 3 заглавные буквы (AZN).',
    tr: 'Para birimi kodu 3 büyük harftir (AZN).',
  },
  'adminSellers.form.error.invalid_timezone': {
    az: 'Saat qurşağı yanlışdır.',
    ru: 'Неверный часовой пояс.',
    tr: 'Saat dilimi geçersiz.',
  },
  'adminSellers.form.error.invalid': {
    az: 'Dəyər yanlışdır.',
    ru: 'Неверное значение.',
    tr: 'Değer geçersiz.',
  },
  // F2.2b: toptancı başvurusu (US-008).
  'shell.menu.seller_applications': { az: 'Müraciətlər', ru: 'Заявки', tr: 'Başvurular' },
  'adminSellers.form.from_application': {
    az: 'Forma müraciətdəki məlumatlarla dolduruldu. Plan və xidmət bölgələrini seçin.',
    ru: 'Форма заполнена данными заявки. Выберите тариф и зоны обслуживания.',
    tr: 'Form başvurudaki bilgilerle dolduruldu. Planı ve hizmet bölgelerini seçin.',
  },
  'sellerApplication.entry_title': {
    az: 'Topdançı olmaq istəyirəm',
    ru: 'Хочу стать оптовиком',
    tr: 'Toptancı olmak istiyorum',
  },
  'sellerApplication.entry_body': {
    az: 'Müraciət edin, komandamız sizinlə əlaqə saxlasın.',
    ru: 'Оставьте заявку, и наша команда свяжется с вами.',
    tr: 'Başvurun, ekibimiz sizinle iletişime geçsin.',
  },
  'sellerApplication.eyebrow': {
    az: 'Topdançılar üçün',
    ru: 'Для оптовиков',
    tr: 'Toptancılar için',
  },
  'sellerApplication.title': {
    az: 'Platformaya qoşulun',
    ru: 'Подключитесь к платформе',
    tr: 'Platforma katılın',
  },
  'sellerApplication.subtitle': {
    az: 'Məlumatlarınızı göndərin. Hesabınızı yoxladıqdan sonra açırıq və sizə SMS ilə xəbər veririk.',
    ru: 'Отправьте данные. Мы проверим их, откроем аккаунт и сообщим вам по SMS.',
    tr: 'Bilgilerinizi gönderin. İnceledikten sonra hesabınızı açar, size SMS ile haber veririz.',
  },
  'sellerApplication.section_business': { az: 'Müəssisə', ru: 'Предприятие', tr: 'İşletme' },
  'sellerApplication.section_contact': {
    az: 'Əlaqə şəxsi',
    ru: 'Контактное лицо',
    tr: 'Yetkili kişi',
  },
  'sellerApplication.field.legalName': { az: 'Hüquqi ad', ru: 'Наименование', tr: 'Unvan' },
  'sellerApplication.field.voen': { az: 'VÖEN', ru: 'VÖEN', tr: 'VÖEN' },
  'sellerApplication.field.regionId': {
    az: 'Şəhər / rayon',
    ru: 'Город / район',
    tr: 'Şehir / rayon',
  },
  'sellerApplication.field.contactName': { az: 'Ad və soyad', ru: 'Имя и фамилия', tr: 'Ad soyad' },
  'sellerApplication.field.phone': {
    az: 'Telefon (+994…)',
    ru: 'Телефон (+994…)',
    tr: 'Telefon (+994…)',
  },
  'sellerApplication.field.categoryNote': {
    az: 'Nə satırsınız? (istəyə bağlı)',
    ru: 'Что вы продаёте? (необязательно)',
    tr: 'Ne satıyorsunuz? (isteğe bağlı)',
  },
  'sellerApplication.category_hint': {
    az: 'Məs.: ərzaq, içkilər, təsərrüfat malları',
    ru: 'Напр.: продукты, напитки, хозтовары',
    tr: 'Ör.: gıda, içecek, temizlik ürünleri',
  },
  'sellerApplication.choose': { az: 'Seçin', ru: 'Выберите', tr: 'Seçin' },
  'sellerApplication.submit': {
    az: 'Müraciət göndər',
    ru: 'Отправить заявку',
    tr: 'Başvuruyu gönder',
  },
  'sellerApplication.submitting': { az: 'Göndərilir…', ru: 'Отправка…', tr: 'Gönderiliyor…' },
  'sellerApplication.done_title': {
    az: 'Müraciətiniz qəbul edildi',
    ru: 'Заявка принята',
    tr: 'Başvurunuz alındı',
  },
  'sellerApplication.done_body': {
    az: 'Komandamız müraciətinizə baxıb sizinlə əlaqə saxlayacaq.',
    ru: 'Наша команда рассмотрит заявку и свяжется с вами.',
    tr: 'Ekibimiz başvurunuzu inceleyip sizinle iletişime geçecek.',
  },
  'sellerApplication.back_to_login': {
    az: 'Girişə qayıt',
    ru: 'Вернуться ко входу',
    tr: 'Girişe dön',
  },
  'sellerApplication.have_account': {
    az: 'Hesabınız var?',
    ru: 'Уже есть аккаунт?',
    tr: 'Hesabınız var mı?',
  },
  'sellerApplication.login': { az: 'Daxil olun', ru: 'Войти', tr: 'Giriş yapın' },
  'sellerApplication.error.required': {
    az: 'Bu sahə mütləqdir.',
    ru: 'Обязательное поле.',
    tr: 'Bu alan zorunlu.',
  },
  'sellerApplication.error.too_long': {
    az: 'Mətn çox uzundur.',
    ru: 'Слишком длинный текст.',
    tr: 'Metin çok uzun.',
  },
  'sellerApplication.error.VOEN_INVALID': {
    az: 'VÖEN 10 rəqəmdən ibarət olmalı və 1 və ya 2 ilə bitməlidir.',
    ru: 'VÖEN должен состоять из 10 цифр и оканчиваться на 1 или 2.',
    tr: 'VÖEN 10 haneli olmalı ve 1 ya da 2 ile bitmelidir.',
  },
  'sellerApplication.error.SELLER_APPLICATION_ALREADY_PENDING': {
    az: 'Bu VÖEN ilə baxılmaqda olan müraciət artıq var.',
    ru: 'Заявка с этим VÖEN уже на рассмотрении.',
    tr: 'Bu VÖEN ile incelenmekte olan bir başvuru zaten var.',
  },
  'sellerApplication.error.invalid_phone': {
    az: 'Telefonu +994501234567 formatında yazın.',
    ru: 'Введите телефон в формате +994501234567.',
    tr: 'Telefonu +994501234567 biçiminde yazın.',
  },
  'sellerApplication.error.not_found': {
    az: 'Seçim tapılmadı.',
    ru: 'Выбор не найден.',
    tr: 'Seçim bulunamadı.',
  },
  'sellerApplication.error.invalid': {
    az: 'Dəyər yanlışdır.',
    ru: 'Неверное значение.',
    tr: 'Değer geçersiz.',
  },
  'adminApplications.eyebrow': { az: 'Moderasiya', ru: 'Модерация', tr: 'Moderasyon' },
  'adminApplications.title': {
    az: 'Topdançı müraciətləri',
    ru: 'Заявки оптовиков',
    tr: 'Toptancı başvuruları',
  },
  'adminApplications.description': {
    az: 'Müraciətə baxın: uyğundursa topdançı hesabı açın, deyilsə rədd edin.',
    ru: 'Рассмотрите заявку: если подходит, откройте аккаунт оптовика, иначе отклоните.',
    tr: 'Başvuruyu inceleyin: uygunsa toptancı hesabı açın, değilse reddedin.',
  },
  'adminApplications.status_filter': { az: 'Status', ru: 'Статус', tr: 'Durum' },
  'adminApplications.status.pending': { az: 'Gözləyən', ru: 'Ожидают', tr: 'Bekleyen' },
  'adminApplications.status.approved': { az: 'Təsdiqlənmiş', ru: 'Одобрены', tr: 'Onaylanan' },
  'adminApplications.status.rejected': { az: 'Rədd edilmiş', ru: 'Отклонены', tr: 'Reddedilen' },
  'adminApplications.voen': { az: 'VÖEN', ru: 'VÖEN', tr: 'VÖEN' },
  'adminApplications.region': { az: 'Region', ru: 'Регион', tr: 'Bölge' },
  'adminApplications.contact': { az: 'Əlaqə', ru: 'Контакт', tr: 'Yetkili' },
  'adminApplications.phone': { az: 'Telefon', ru: 'Телефон', tr: 'Telefon' },
  'adminApplications.created_at': { az: 'Tarix', ru: 'Дата', tr: 'Tarih' },
  'adminApplications.open_seller': { az: 'Topdançı aç', ru: 'Открыть оптовика', tr: 'Toptancı aç' },
  'adminApplications.reject': { az: 'Rədd et', ru: 'Отклонить', tr: 'Reddet' },
  'adminApplications.reject_confirm': {
    az: 'Müraciət rədd ediləcək. Bu geri qaytarılmır.',
    ru: 'Заявка будет отклонена. Это нельзя отменить.',
    tr: 'Başvuru reddedilecek. Bu geri alınamaz.',
  },
  'adminApplications.reject_yes': { az: 'Bəli, rədd et', ru: 'Да, отклонить', tr: 'Evet, reddet' },
  'adminApplications.reject_cancel': { az: 'İmtina', ru: 'Отмена', tr: 'Vazgeç' },
  'adminApplications.empty_title': { az: 'Müraciət yoxdur', ru: 'Заявок нет', tr: 'Başvuru yok' },
  'adminApplications.empty_body': {
    az: 'Yeni müraciət gələndə burada görünəcək.',
    ru: 'Новые заявки появятся здесь.',
    tr: 'Yeni başvurular burada görünecek.',
  },
  'adminApplications.load_more': {
    az: 'Daha çox göstər',
    ru: 'Показать ещё',
    tr: 'Daha fazla göster',
  },
  'activate.title': {
    az: 'Hesabın aktivləşdirilməsi',
    ru: 'Активация аккаунта',
    tr: 'Hesap aktivasyonu',
  },
  'activate.intro': {
    az: 'Davam etmək üçün səlahiyyətli şəxsin telefon nömrəsi ilə daxil olun.',
    ru: 'Чтобы продолжить, войдите по номеру телефона уполномоченного лица.',
    tr: 'Devam etmek için yetkilinin telefon numarasıyla giriş yapın.',
  },
  'activate.accepting': { az: 'Aktivləşdirilir…', ru: 'Активация…', tr: 'Aktifleştiriliyor…' },
  'activate.invalid': {
    az: 'Link etibarsızdır və ya vaxtı keçib; platforma administratorundan yenisini istəyin.',
    ru: 'Ссылка недействительна или устарела; запросите новую у администратора платформы.',
    tr: 'Bağlantı geçersiz veya süresi dolmuş; platform yöneticisinden yenisini isteyin.',
  },
  'activate.retry': { az: 'Yenidən cəhd et', ru: 'Повторить', tr: 'Yeniden dene' },
  'activate.team_intro': {
    az: 'Komandaya dəvət olunmusunuzsa, dəvət göndərilən telefon nömrəsi ilə daxil olun.',
    ru: 'Если вас пригласили в команду, войдите по номеру телефона, на который пришло приглашение.',
    tr: 'Ekibe davet edildiyseniz, davetin gönderildiği telefon numarasıyla giriş yapın.',
  },
  'activate.team_invalid_hint': {
    az: 'Komanda dəvəti üçün sizi dəvət edən şəxsdən yeni dəvət istəyin.',
    ru: 'Для приглашения в команду попросите пригласившего отправить новое.',
    tr: 'Ekip daveti için sizi davet eden kişiden yeni bir davet isteyin.',
  },
  'activate.open_in_app': {
    az: 'Tətbiqdə aç',
    ru: 'Открыть в приложении',
    tr: 'Uygulamada aç',
  },
  'activate.sign_in': {
    az: 'Daxil ol',
    ru: 'Войти',
    tr: 'Giriş yap',
  },
  'activate.go_home': {
    az: 'Ana səhifəyə qayıt',
    ru: 'На главную',
    tr: 'Ana sayfaya dön',
  },
  'languages.az': { az: 'Azərbaycanca', ru: 'Azərbaycanca', tr: 'Azərbaycanca' },
  'languages.ru': { az: 'Русский', ru: 'Русский', tr: 'Русский' },
  'languages.tr': { az: 'Türkçe', ru: 'Türkçe', tr: 'Türkçe' },
  'languages.en': { az: 'English', ru: 'English', tr: 'English' },
  // F2.3a: perakendeci kaydında açılan varsayılan şubenin adı (kullanıcının dilinde yazılır).
  'branch.default_name': { az: 'Əsas filial', ru: 'Основной филиал', tr: 'Ana şube' },
  // F2.3b: perakendeci kayıt ekranları (web + mobil), profil kartı (US-005).
  'register.entry_title': {
    az: 'Mağazanız var? Pulsuz qeydiyyatdan keçin',
    ru: 'У вас магазин? Зарегистрируйтесь бесплатно',
    tr: 'Mağazanız mı var? Ücretsiz kaydolun',
  },
  'register.entry_body': {
    az: 'Telefonunuzla başlayın; topdansatışçılar sizi tapsın və sifarişləri bir yerdən verin.',
    ru: 'Начните с номера телефона: оптовики найдут вас, а заказы будут в одном месте.',
    tr: 'Telefonunuzla başlayın; toptancılar sizi bulsun, siparişleri tek yerden verin.',
  },
  'register.title': { az: 'Qeydiyyat', ru: 'Регистрация', tr: 'Kayıt ol' },
  'register.intro': {
    az: 'Əvvəlcə telefon nömrənizi SMS kodla təsdiqləyin.',
    ru: 'Сначала подтвердите номер телефона кодом из SMS.',
    tr: 'Önce telefon numaranızı SMS koduyla doğrulayın.',
  },
  'register.eyebrow': { az: 'Son addım', ru: 'Последний шаг', tr: 'Son adım' },
  'register.form_title': {
    az: 'Müəssisənizi tanıdın',
    ru: 'Расскажите о своём бизнесе',
    tr: 'İşletmenizi tanıtın',
  },
  'register.form_subtitle': {
    az: '{phone} təsdiqləndi. Bu məlumatlarla hesabınız açılır.',
    ru: 'Номер {phone} подтверждён. По этим данным будет создан аккаунт.',
    tr: '{phone} doğrulandı. Hesabınız bu bilgilerle açılır.',
  },
  'register.section_you': { az: 'Siz', ru: 'Вы', tr: 'Siz' },
  'register.section_business': { az: 'Müəssisə', ru: 'Бизнес', tr: 'İşletme' },
  'register.field.fullName': { az: 'Ad və soyad', ru: 'Имя и фамилия', tr: 'Ad soyad' },
  'register.field.legalName': {
    az: 'Müəssisənin adı',
    ru: 'Название бизнеса',
    tr: 'İşletme ünvanı',
  },
  'register.field.activityTypeId': {
    az: 'Fəaliyyət sahəsi',
    ru: 'Сфера деятельности',
    tr: 'Faaliyet alanı',
  },
  'register.field.regionId': { az: 'Şəhər / rayon', ru: 'Город / район', tr: 'Şehir / rayon' },
  'register.choose': { az: 'Seçin', ru: 'Выберите', tr: 'Seçin' },
  'register.consent_read': {
    az: 'Məlumat paylaşımı mətnini oxuyun',
    ru: 'Прочитать текст о передаче данных',
    tr: 'Veri paylaşım metnini okuyun',
  },
  'register.consent_hide': { az: 'Mətni gizlət', ru: 'Скрыть текст', tr: 'Metni gizle' },
  'register.consent_version': {
    az: 'Mətn versiyası: {version}',
    ru: 'Версия текста: {version}',
    tr: 'Metin sürümü: {version}',
  },
  'register.submit': { az: 'Hesabı yarat', ru: 'Создать аккаунт', tr: 'Hesabı oluştur' },
  'register.submitting': { az: 'Yaradılır…', ru: 'Создаём…', tr: 'Oluşturuluyor…' },
  'register.error.required': {
    az: 'Bu sahə məcburidir.',
    ru: 'Обязательное поле.',
    tr: 'Bu alan zorunlu.',
  },
  'register.error.too_long': { az: 'Çox uzundur.', ru: 'Слишком длинно.', tr: 'Çok uzun.' },
  'register.error.consent_required': {
    az: 'Davam etmək üçün mətni təsdiqləyin.',
    ru: 'Чтобы продолжить, подтвердите согласие.',
    tr: 'Devam etmek için metni onaylayın.',
  },
  'register.error.not_found': {
    az: 'Bu seçim artıq keçərli deyil; yenidən seçin.',
    ru: 'Этот вариант больше недоступен; выберите снова.',
    tr: 'Bu seçim artık geçerli değil; yeniden seçin.',
  },
  'register.error.outdated': {
    az: 'Mətn yenilənib; səhifəni yeniləyin və yenidən təsdiqləyin.',
    ru: 'Текст обновлён; обновите страницу и подтвердите снова.',
    tr: 'Metin güncellendi; sayfayı yenileyip yeniden onaylayın.',
  },
  'register.error.invalid': {
    az: 'Yanlış dəyər.',
    ru: 'Неверное значение.',
    tr: 'Geçersiz değer.',
  },
  'register.already_title': {
    az: 'Bu nömrə artıq qeydiyyatdadır',
    ru: 'Этот номер уже зарегистрирован',
    tr: 'Bu numara zaten kayıtlı',
  },
  'register.already_body': {
    az: 'Daxil olun; mövcud müəssisələriniz göstəriləcək.',
    ru: 'Войдите — мы покажем ваши компании.',
    tr: 'Giriş yapın; mevcut işletmeleriniz gösterilir.',
  },
  'register.expired': {
    az: 'Təsdiqin vaxtı keçib. Nömrənizi yenidən təsdiqləyin.',
    ru: 'Время подтверждения истекло. Подтвердите номер ещё раз.',
    tr: 'Doğrulamanın süresi doldu. Numaranızı yeniden doğrulayın.',
  },
  'register.done_title': {
    az: 'Qeydiyyat tamamlandı',
    ru: 'Регистрация завершена',
    tr: 'Kaydınız tamamlandı',
  },
  'register.done_body': {
    az: 'Bağlantı kəsildiyi üçün sessiya açılmadı. Eyni nömrə ilə daxil olun.',
    ru: 'Из-за обрыва связи сессия не открылась. Войдите с тем же номером.',
    tr: 'Bağlantı kesildiği için oturum açılamadı. Aynı numarayla giriş yapın.',
  },
  'register.go_login': { az: 'Daxil ol', ru: 'Войти', tr: 'Giriş yap' },
  'register.restart': { az: 'Yenidən başla', ru: 'Начать заново', tr: 'Yeniden başla' },
  'register.have_account': {
    az: 'Hesabınız var?',
    ru: 'Уже есть аккаунт?',
    tr: 'Hesabınız var mı?',
  },
  'profile.complete_title': {
    az: 'Profilinizi tamamlayın',
    ru: 'Заполните профиль',
    tr: 'Profilinizi tamamlayın',
  },
  'profile.complete_body': {
    az: 'VÖEN, ünvan və loqo əlavə edin ki, topdansatışçılar sizi asan tapsın.',
    ru: 'Добавьте VÖEN, адрес и логотип, чтобы оптовикам было проще вас найти.',
    tr: 'VÖEN, adres ve logo ekleyin; toptancılar sizi daha kolay bulsun.',
  },
  'profile.complete_percent': {
    az: '{percent}% tamamlanıb',
    ru: 'Заполнено на {percent}%',
    tr: '%{percent} tamamlandı',
  },
  // F2.4: işletme profili ve VÖEN (US-006). Çeviriler taslak; toplu onay platform sahibinde.
  'businessProfile.title': {
    az: 'Müəssisə profili',
    ru: 'Профиль предприятия',
    tr: 'İşletme profili',
  },
  'businessProfile.description': {
    az: 'VÖEN və müəssisə məlumatları sifariş və çatdırılma üçün istifadə olunur.',
    ru: 'VÖEN и данные предприятия используются для заказов и доставки.',
    tr: 'VÖEN ve işletme bilgileri sipariş ve teslimat için kullanılır.',
  },
  'businessProfile.section.voen': {
    az: 'VÖEN',
    ru: 'VÖEN',
    tr: 'VÖEN',
  },
  'businessProfile.section.business': {
    az: 'Müəssisə',
    ru: 'Предприятие',
    tr: 'İşletme',
  },
  'businessProfile.field.voen': {
    az: 'VÖEN',
    ru: 'VÖEN (ИНН)',
    tr: 'VÖEN',
  },
  'businessProfile.field.legalName': {
    az: 'Müəssisənin adı',
    ru: 'Название предприятия',
    tr: 'İşletme ünvanı',
  },
  'businessProfile.field.regionId': {
    az: 'Şəhər / rayon',
    ru: 'Город / район',
    tr: 'Şehir / rayon',
  },
  'businessProfile.field.addressLine': {
    az: 'Ünvan',
    ru: 'Адрес',
    tr: 'Adres',
  },
  'businessProfile.field.businessPhone': {
    az: 'Müəssisə telefonu',
    ru: 'Телефон предприятия',
    tr: 'İşletme telefonu',
  },
  'businessProfile.voen_hint': {
    az: '10 rəqəm; sonuncu rəqəm 1 (hüquqi şəxs) və ya 2 (fərdi sahibkar).',
    ru: '10 цифр; последняя 1 (юридическое лицо) или 2 (индивидуальный предприниматель).',
    tr: '10 rakam; son hane 1 (tüzel kişi) veya 2 (fərdi sahibkar).',
  },
  'businessProfile.voen_change_warning': {
    az: 'VÖEN dəyişsə, təsdiq yenidən aparılır.',
    ru: 'При изменении VÖEN проверка проводится заново.',
    tr: 'VÖEN değişirse doğrulama yeniden yapılır.',
  },
  'businessProfile.voen_needed': {
    az: 'Sifariş göndərmək üçün VÖEN lazımdır.',
    ru: 'VÖEN нужен для отправки заказов.',
    tr: 'Sipariş göndermek için VÖEN gerekir.',
  },
  'businessProfile.status.missing': {
    az: 'VÖEN daxil edilməyib',
    ru: 'VÖEN не указан',
    tr: 'VÖEN girilmedi',
  },
  'businessProfile.status.pending': {
    az: 'Təsdiq gözləyir',
    ru: 'Ожидает проверки',
    tr: 'Doğrulama bekliyor',
  },
  'businessProfile.status.verified': {
    az: 'Təsdiqlənib',
    ru: 'Проверен',
    tr: 'Doğrulandı',
  },
  'businessProfile.legal_type.legal_entity': {
    az: 'Hüquqi şəxs',
    ru: 'Юридическое лицо',
    tr: 'Tüzel kişi',
  },
  'businessProfile.legal_type.individual_entrepreneur': {
    az: 'Fərdi sahibkar',
    ru: 'Индивидуальный предприниматель',
    tr: 'Fərdi sahibkar (şahıs)',
  },
  'businessProfile.choose': {
    az: 'Seçin',
    ru: 'Выберите',
    tr: 'Seçin',
  },
  'businessProfile.save': {
    az: 'Yadda saxla',
    ru: 'Сохранить',
    tr: 'Kaydet',
  },
  'businessProfile.saved': {
    az: 'Yadda saxlanıldı',
    ru: 'Сохранено',
    tr: 'Kaydedildi',
  },
  'businessProfile.open': {
    az: 'Profili tamamla',
    ru: 'Заполнить профиль',
    tr: 'Profili tamamla',
  },
  'businessProfile.back': {
    az: 'Geri',
    ru: 'Назад',
    tr: 'Geri',
  },
  'businessProfile.load_failed': {
    az: 'Profil yüklənmədi. Yenidən cəhd edin.',
    ru: 'Не удалось загрузить профиль. Попробуйте ещё раз.',
    tr: 'Profil yüklenemedi. Tekrar deneyin.',
  },
  'businessProfile.retry': {
    az: 'Yenidən cəhd et',
    ru: 'Повторить',
    tr: 'Tekrar dene',
  },
  'businessProfile.error.required': {
    az: 'Bu sahəni doldurun.',
    ru: 'Заполните это поле.',
    tr: 'Bu alanı doldurun.',
  },
  'businessProfile.error.too_long': {
    az: 'Mətn çox uzundur.',
    ru: 'Слишком длинный текст.',
    tr: 'Metin çok uzun.',
  },
  'businessProfile.error.voen_invalid': {
    az: 'VÖEN yanlışdır.',
    ru: 'Неверный VÖEN (ИНН).',
    tr: 'VÖEN geçersiz.',
  },
  'businessProfile.error.voen_taken': {
    az: 'Bu VÖEN ilə qeydiyyatdan keçmiş müəssisə var; onun rəhbərindən dəvət istəyin.',
    ru: 'Предприятие с этим VÖEN уже зарегистрировано; попросите приглашение у его руководителя.',
    tr: 'Bu VÖEN ile kayıtlı bir işletme var; yöneticisinden davet isteyin.',
  },
  'businessProfile.error.voen_locked': {
    az: 'Topdansatışçının VÖEN nömrəsini yalnız platforma dəyişir.',
    ru: 'VÖEN оптовика меняет только платформа.',
    tr: 'Toptancı VÖEN numarasını yalnızca platform değiştirir.',
  },
  'businessProfile.error.phone_invalid': {
    az: 'Telefon nömrəsi yanlışdır.',
    ru: 'Неверный номер телефона.',
    tr: 'Telefon numarası geçersiz.',
  },
  'businessProfile.error.not_found': {
    az: 'Seçim tapılmadı; yenidən seçin.',
    ru: 'Значение не найдено; выберите снова.',
    tr: 'Seçim bulunamadı; yeniden seçin.',
  },
  'businessProfile.error.invalid': {
    az: 'Dəyər yanlışdır.',
    ru: 'Неверное значение.',
    tr: 'Değer geçersiz.',
  },
  // F2.10b: yetkili, kişisel iletişim ve logo. Çeviriler taslak; onay platform sahibinde.
  'businessProfile.section.contact': {
    az: 'Səlahiyyətli şəxs və əlaqə',
    ru: 'Ответственное лицо и контакты',
    tr: 'Yetkili ve iletişim',
  },
  'businessProfile.contact_hint': {
    az: 'Bu məlumatlar topdansatışçılara yalnız görünmə ayarlarında açdıqda görünür.',
    ru: 'Эти данные видны оптовикам, только если вы откроете их в настройках видимости.',
    tr: 'Bu bilgiler toptancılara yalnızca görünürlük ayarlarında açarsanız görünür.',
  },
  'businessProfile.field.contactName': {
    az: 'Səlahiyyətli şəxsin adı',
    ru: 'Имя ответственного лица',
    tr: 'Yetkili adı',
  },
  'businessProfile.field.personalPhone': {
    az: 'Şəxsi telefon',
    ru: 'Личный телефон',
    tr: 'Kişisel telefon',
  },
  'businessProfile.personal_phone_hint': {
    az: 'Beynəlxalq formatda: +994501234567',
    ru: 'В международном формате: +994501234567',
    tr: 'Uluslararası biçimde: +994501234567',
  },
  'businessProfile.field.email': {
    az: 'E-poçt',
    ru: 'E-mail',
    tr: 'E-posta',
  },
  'businessProfile.error.email_invalid': {
    az: 'E-poçt ünvanı yanlışdır.',
    ru: 'Неверный адрес e-mail.',
    tr: 'E-posta adresi geçersiz.',
  },
  'businessProfile.logo.title': {
    az: 'Loqo',
    ru: 'Логотип',
    tr: 'Logo',
  },
  'businessProfile.logo.description': {
    az: 'PNG, JPEG və ya WebP. Kvadrat şəkil daha yaxşı görünür.',
    ru: 'PNG, JPEG или WebP. Квадратное изображение смотрится лучше.',
    tr: 'PNG, JPEG veya WebP. Kare görsel daha iyi görünür.',
  },
  'businessProfile.logo.empty': {
    az: 'Loqo yoxdur',
    ru: 'Логотипа нет',
    tr: 'Logo yok',
  },
  'businessProfile.logo.alt': {
    az: 'Müəssisə loqosu',
    ru: 'Логотип предприятия',
    tr: 'İşletme logosu',
  },
  'businessProfile.logo.upload': {
    az: 'Loqo yüklə',
    ru: 'Загрузить логотип',
    tr: 'Logo yükle',
  },
  'businessProfile.logo.replace': {
    az: 'Dəyiş',
    ru: 'Заменить',
    tr: 'Değiştir',
  },
  'businessProfile.logo.remove': {
    az: 'Sil',
    ru: 'Удалить',
    tr: 'Kaldır',
  },
  'businessProfile.logo.uploading': {
    az: 'Yüklənir…',
    ru: 'Загрузка…',
    tr: 'Yükleniyor…',
  },
  'businessProfile.logo.saved': {
    az: 'Loqo yeniləndi.',
    ru: 'Логотип обновлён.',
    tr: 'Logo güncellendi.',
  },
  'businessProfile.logo.removed': {
    az: 'Loqo silindi.',
    ru: 'Логотип удалён.',
    tr: 'Logo kaldırıldı.',
  },
  'businessProfile.logo.invalid_type': {
    az: 'Yalnız PNG, JPEG və ya WebP faylı seçin.',
    ru: 'Выберите файл PNG, JPEG или WebP.',
    tr: 'Yalnızca PNG, JPEG veya WebP dosyası seçin.',
  },
  'businessProfile.logo.failed': {
    az: 'Loqo yüklənmədi. Faylı yoxlayıb yenidən cəhd edin.',
    ru: 'Не удалось загрузить логотип. Проверьте файл и повторите.',
    tr: 'Logo yüklenemedi. Dosyayı kontrol edip yeniden deneyin.',
  },
  'businessProfile.logo.mobile_hint': {
    az: 'Loqonu veb versiyadan yükləyə bilərsiniz.',
    ru: 'Логотип можно загрузить в веб-версии.',
    tr: 'Logoyu web sürümünden yükleyebilirsiniz.',
  },
  // F2.10a: görünürlük ayarları (US-007, ADR-0014). Çeviriler taslak; onay platform sahibinde.
  'businessPrivacy.title': {
    az: 'Görünmə ayarları',
    ru: 'Настройки видимости',
    tr: 'Görünürlük ayarları',
  },
  'businessPrivacy.description': {
    az: 'Əlaqə qurmadığınız topdansatışçıların kataloqda sizin haqqınızda nə görəcəyini seçin.',
    ru: 'Выберите, что о вас увидят в каталоге оптовики, с которыми у вас нет связи.',
    tr: 'Bağlantı kurmadığınız toptancıların dizinde sizinle ilgili ne göreceğini seçin.',
  },
  'businessPrivacy.field.listedInDirectory': {
    az: 'Kataloqda görün',
    ru: 'Показывать в каталоге',
    tr: 'Dizinde görün',
  },
  'businessPrivacy.listed_on_hint': {
    az: 'Topdansatışçılar sizi bölgə və fəaliyyət sahəsinə görə tapa bilər.',
    ru: 'Оптовики могут найти вас по региону и виду деятельности.',
    tr: 'Toptancılar sizi bölge ve faaliyet alanına göre bulabilir.',
  },
  'businessPrivacy.listed_off_hint': {
    az: 'Axtarışda görünmürsünüz; sizi yalnız tam telefon və ya VÖEN ilə tapmaq olar.',
    ru: 'Вы не видны в поиске; найти вас можно только по полному номеру телефона или VÖEN.',
    tr: 'Aramada görünmezsiniz; yalnızca tam telefon veya VÖEN ile bulunabilirsiniz.',
  },
  'businessPrivacy.always_title': {
    az: 'Həmişə görünür',
    ru: 'Видно всегда',
    tr: 'Her zaman görünür',
  },
  'businessPrivacy.always_badge': {
    az: 'Həmişə açıq',
    ru: 'Всегда открыто',
    tr: 'Her zaman açık',
  },
  'businessPrivacy.always.legalName': {
    az: 'Ünvan',
    ru: 'Название',
    tr: 'Ünvan',
  },
  'businessPrivacy.always.activityType': {
    az: 'Fəaliyyət sahəsi',
    ru: 'Вид деятельности',
    tr: 'Faaliyet alanı',
  },
  'businessPrivacy.always.region': {
    az: 'Şəhər / rayon',
    ru: 'Город / район',
    tr: 'Şehir / rayon',
  },
  'businessPrivacy.optional_title': {
    az: 'İstəyə görə açın',
    ru: 'Открыть по желанию',
    tr: 'İsteğe bağlı açın',
  },
  'businessPrivacy.field.showLogo': {
    az: 'Loqo',
    ru: 'Логотип',
    tr: 'Logo',
  },
  'businessPrivacy.field.showAddress': {
    az: 'Tam ünvan',
    ru: 'Полный адрес',
    tr: 'Tam adres',
  },
  'businessPrivacy.field.showBusinessPhone': {
    az: 'Müəssisə telefonu',
    ru: 'Телефон предприятия',
    tr: 'İşletme telefonu',
  },
  'businessPrivacy.field.showVoen': {
    az: 'VÖEN',
    ru: 'VÖEN',
    tr: 'VÖEN',
  },
  'businessPrivacy.field.showContactName': {
    az: 'Səlahiyyətli şəxsin adı',
    ru: 'Имя ответственного лица',
    tr: 'Yetkili adı',
  },
  'businessPrivacy.field.showPersonalContact': {
    az: 'Şəxsi telefon və e-poçt',
    ru: 'Личный телефон и e-mail',
    tr: 'Kişisel telefon ve e-posta',
  },
  'businessPrivacy.personal_contact_hint': {
    az: 'Hər ikisi birlikdə açılır.',
    ru: 'Открываются вместе.',
    tr: 'İkisi birlikte açılır.',
  },
  'businessPrivacy.save': {
    az: 'Ayarları saxla',
    ru: 'Сохранить настройки',
    tr: 'Ayarları kaydet',
  },
  'businessPrivacy.saved': {
    az: 'Görünmə ayarları saxlanıldı.',
    ru: 'Настройки видимости применены.',
    tr: 'Görünürlük ayarları güncellendi.',
  },
  'businessPrivacy.load_failed': {
    az: 'Ayarlar yüklənmədi.',
    ru: 'Не удалось загрузить настройки.',
    tr: 'Ayarlar yüklenemedi.',
  },
  'businessPrivacy.retry': {
    az: 'Yenidən cəhd et',
    ru: 'Повторить',
    tr: 'Yeniden dene',
  },
  'buyer.home.empty_title': {
    az: 'Hələ bağlı topdansatışçınız yoxdur',
    ru: 'Пока нет связанных оптовиков',
    tr: 'Henüz bağlı toptancınız yok',
  },
  'buyer.home.empty_body': {
    az: 'Topdansatışçı sizə bağlantı sorğusu göndərib siz qəbul etdikdə məhsulları burada görünəcək.',
    ru: 'Когда оптовик отправит запрос на связь и вы его примете, его товары появятся здесь.',
    tr: 'Bir toptancı bağlantı isteği gönderip siz kabul ettiğinizde ürünleri burada görünür.',
  },
  // F2.3b: veri paylaşım metni v1 (docs/legal/data-sharing-v1.md; NFR-63). Değişirse yeni sürüm anahtarı.
  'dataSharing.v1.title': {
    az: 'Məlumatlarınızın paylaşılması haqqında',
    ru: 'О передаче ваших данных',
    tr: 'Verilerinizin paylaşımı hakkında',
  },
  'dataSharing.v1.item1_title': {
    az: 'Hansı məlumatları toplayırıq?',
    ru: 'Какие данные мы собираем?',
    tr: 'Hangi verileri topluyoruz?',
  },
  'dataSharing.v1.item1_body': {
    az: 'Telefon nömrəniz, ad və soyadınız, müəssisənin adı, fəaliyyət növü, şəhər/rayon. Sonradan: VÖEN, filial və çatdırılma ünvanı; könüllü olaraq e-poçt, loqo, iş saatları.',
    ru: 'Номер телефона, имя и фамилия, название бизнеса, вид деятельности, город/район. Позже: VÖEN, филиал и адрес доставки; по желанию — e-mail, логотип, часы работы.',
    tr: 'Telefon numaranız, adınız soyadınız, işletme ünvanı, faaliyet türü, şehir/rayon. Sonradan: VÖEN, şube ve teslimat adresi; isteğe bağlı e-posta, logo, çalışma saatleri.',
  },
  'dataSharing.v1.item2_title': {
    az: 'Əlaqəsiz topdansatışçılar nəyi görür?',
    ru: 'Что видят оптовики без связи с вами?',
    tr: 'Bağlantısız toptancılar ne görür?',
  },
  'dataSharing.v1.item2_body': {
    az: 'Susmaya görə yalnız müəssisənin adı, fəaliyyət növü və şəhər/rayon. Loqo, tam ünvan, müəssisənin telefonu, VÖEN, səlahiyyətli şəxsin adı, şəxsi telefon və e-poçt bağlıdır; Məxfilik ayarlarından tək-tək aça bilərsiniz. "Kataloqda görünmə"ni tamamilə söndürə bilərsiniz; bu halda yalnız tam telefon və ya tam VÖEN ilə tapılırsınız və nəticədə yalnız açıq sahələr görünür.',
    ru: 'По умолчанию только название бизнеса, вид деятельности и город/район. Логотип, полный адрес, рабочий телефон, VÖEN, имя уполномоченного лица, личный телефон и e-mail скрыты; вы можете открыть их по одному в настройках конфиденциальности. Можно полностью отключить «показ в каталоге»: тогда вас найдут только по точному телефону или точному VÖEN, и в результате будут видны только открытые поля.',
    tr: 'Varsayılan olarak yalnızca işletme ünvanı, faaliyet türü ve şehir/rayon. Logo, tam adres, işletme telefonu, VÖEN, yetkili adı, kişisel telefon ve e-posta kapalıdır; Gizlilik ayarlarından tek tek açabilirsiniz. "Dizinde görünme"yi tamamen kapatabilirsiniz; bu durumda yalnızca tam telefon veya tam VÖEN ile bulunursunuz ve sonuçta yalnızca açık alanlar görünür.',
  },
  'dataSharing.v1.item3_title': {
    az: 'Bağlı topdansatışçılar nəyi görür?',
    ru: 'Что видят связанные оптовики?',
    tr: 'Bağlı toptancılar ne görür?',
  },
  'dataSharing.v1.item3_body': {
    az: 'Əlaqəni qəbul etdiyiniz topdansatışçı sifariş və çatdırılma üçün lazım olan çatdırılma və əlaqə məlumatlarınızı görür.',
    ru: 'Оптовик, чью связь вы приняли, видит ваши данные доставки и контакты, необходимые для заказов и доставки.',
    tr: 'Bağlantıyı kabul ettiğiniz toptancı, sipariş ve teslimat için gereken teslimat ve iletişim bilgilerinizi görür.',
  },
  'dataSharing.v1.item4_title': {
    az: 'Heç kim görmür:',
    ru: 'Не видит никто:',
    tr: 'Kimse göremez:',
  },
  'dataSharing.v1.item4_body': {
    az: 'Digər topdansatışçılarla əlaqələriniz və alış həcminiz heç bir topdansatışçıya göstərilmir.',
    ru: 'ваши связи с другими оптовиками и объём закупок не показываются ни одному оптовику.',
    tr: 'Başka toptancılarla bağlantılarınız ve alım hacminiz hiçbir toptancıya gösterilmez.',
  },
  'dataSharing.v1.item5_title': {
    az: 'Məqsəd:',
    ru: 'Цель:',
    tr: 'Amaç:',
  },
  'dataSharing.v1.item5_body': {
    az: 'Topdansatışçıların sizi tapması, əlaqə qurulması, sifariş, çatdırılma və cari hesab izlənməsi. [Başqa məqsəd varsa yazılacaq.]',
    ru: 'чтобы оптовики могли вас найти, установить связь, оформлять заказы, доставку и вести учёт взаиморасчётов. [Другие цели, если есть.]',
    tr: 'Toptancıların sizi bulması, bağlantı kurması, sipariş, teslimat ve cari takibi. [Başka amaç varsa yazılacak.]',
  },
  'dataSharing.v1.item6_title': {
    az: 'Saxlama və silmə:',
    ru: 'Хранение и удаление:',
    tr: 'Saklama ve silme:',
  },
  'dataSharing.v1.item6_body': {
    az: 'Silmə sorğunuz 30 gün ərzində icra olunur. Sifariş və cari qeydlər qanuni saxlama üçün anonimləşdirilərək qorunur [saxlama müddəti: hüquqşünas təsdiqi]. Heç bir əlaqəsi olmayan hesablar passiv olduqda xəbərdarlıq edilir, deaktiv edilir və [180-ci gündə] şəxsi məlumatlar silinir və ya anonimləşdirilir.',
    ru: 'запрос на удаление выполняется в течение 30 дней. Записи заказов и взаиморасчётов сохраняются в обезличенном виде для законного хранения [срок хранения: подтверждение юриста]. Неактивные аккаунты без связей предупреждаются, деактивируются, а на [180-й день] персональные данные удаляются или обезличиваются.',
    tr: 'Silme talebiniz 30 gün içinde uygulanır. Sipariş ve cari kayıtları yasal saklama için anonimleştirilerek korunur [saklama süresi: hukukçu onayı]. Hiç bağlantısı olmayan hesaplar hareketsizse uyarılır, pasifleştirilir ve [180. günde] kişisel veriler silinir veya anonimleştirilir.',
  },
  'dataSharing.v1.item7_title': {
    az: 'Hüquqlarınız:',
    ru: 'Ваши права:',
    tr: 'Haklarınız:',
  },
  'dataSharing.v1.item7_body': {
    az: 'Məxfilik ayarlarını istədiyiniz vaxt dəyişə, məlumatlarınıza çıxış və silmə tələb edə bilərsiniz. [Qanuni hüquqlar siyahısı: hüquqşünas təsdiqi]',
    ru: 'вы можете в любой момент менять настройки конфиденциальности, запрашивать доступ к данным и их удаление. [Перечень прав по закону: подтверждение юриста]',
    tr: 'Gizlilik ayarlarını istediğiniz zaman değiştirebilir, verilerinize erişim ve silme talep edebilirsiniz. [Yasal haklar listesi: hukukçu onayı]',
  },
  'dataSharing.v1.item8_title': {
    az: 'Əlaqə:',
    ru: 'Контакты:',
    tr: 'İletişim:',
  },
  'dataSharing.v1.item8_body': {
    az: '[məlumat operatorunun adı, e-poçt, ünvan]',
    ru: '[наименование оператора данных, e-mail, адрес]',
    tr: '[veri sorumlusu unvanı, e-posta, adres]',
  },
  'dataSharing.v1.accept': {
    az: 'Yuxarıdakı mətni oxudum və məlumatlarımın bu şəkildə paylaşılmasına razıyam.',
    ru: 'Я прочитал(а) текст выше и согласен(на) на передачу моих данных в указанном порядке.',
    tr: 'Yukarıdaki metni okudum ve verilerimin bu şekilde paylaşılmasını kabul ediyorum.',
  },
  'sellerSettings.title': {
    az: 'Parametrlər',
    ru: 'Настройки',
    tr: 'Ayarlar',
  },
  'sellerSettings.description': {
    az: 'Satıcı profili, anbarlar və xidmət bölgələri.',
    ru: 'Профиль продавца, склады и регионы обслуживания.',
    tr: 'Satıcı profili, depolar ve hizmet bölgeleri.',
  },
  'sellerSettings.tab.profile': {
    az: 'Satıcı profili',
    ru: 'Профиль продавца',
    tr: 'Satıcı profili',
  },
  'sellerSettings.tab.warehouses': {
    az: 'Anbarlar',
    ru: 'Склады',
    tr: 'Depolar',
  },
  'sellerSettings.tab.areas': {
    az: 'Xidmət bölgələri',
    ru: 'Регионы обслуживания',
    tr: 'Hizmet bölgeleri',
  },
  'sellerSettings.load_failed': {
    az: 'Məlumat yüklənmədi.',
    ru: 'Не удалось загрузить данные.',
    tr: 'Bilgiler yüklenemedi.',
  },
  'sellerSettings.retry': {
    az: 'Yenidən cəhd et',
    ru: 'Повторить',
    tr: 'Tekrar dene',
  },
  'sellerSettings.saved': {
    az: 'Yadda saxlanıldı',
    ru: 'Сохранено',
    tr: 'Kaydedildi',
  },
  'sellerSettings.save': {
    az: 'Yadda saxla',
    ru: 'Сохранить',
    tr: 'Kaydet',
  },
  'sellerSettings.cancel': {
    az: 'Ləğv et',
    ru: 'Отмена',
    tr: 'Vazgeç',
  },
  'sellerSettings.loading': {
    az: 'Yüklənir…',
    ru: 'Загрузка…',
    tr: 'Yükleniyor…',
  },
  'sellerSettings.error.required': {
    az: 'Bu sahə məcburidir.',
    ru: 'Обязательное поле.',
    tr: 'Bu alan zorunludur.',
  },
  'sellerSettings.error.too_long': {
    az: 'Mətn çox uzundur.',
    ru: 'Слишком длинный текст.',
    tr: 'Metin çok uzun.',
  },
  'sellerSettings.error.invalid_amount': {
    az: 'Məbləği düzgün yazın (məs. 150 və ya 150.50).',
    ru: 'Введите сумму правильно (напр. 150 или 150.50).',
    tr: 'Tutarı doğru yazın (ör. 150 veya 150.50).',
  },
  'sellerSettings.error.not_found': {
    az: 'Seçim tapılmadı.',
    ru: 'Выбранное значение не найдено.',
    tr: 'Seçim bulunamadı.',
  },
  'sellerSettings.error.plan_limit': {
    az: 'Planınızın anbar limitinə çatdınız. Daha çox anbar üçün planınızı yüksəldin.',
    ru: 'Достигнут лимит складов по вашему тарифу. Чтобы добавить склад, повысьте тариф.',
    tr: 'Planınızın depo sınırına ulaştınız. Daha fazla depo için planınızı yükseltin.',
  },
  'sellerSettings.error.default_rule': {
    az: 'Əsas anbar deaktiv edilə bilməz; əvvəlcə başqa anbarı əsas edin.',
    ru: 'Основной склад нельзя деактивировать; сначала сделайте основным другой склад.',
    tr: 'Varsayılan depo pasifleştirilemez; önce başka bir depoyu varsayılan yapın.',
  },
  'sellerSettings.profile.title': {
    az: 'Satıcı profili',
    ru: 'Профиль продавца',
    tr: 'Satıcı profili',
  },
  'sellerSettings.profile.description': {
    az: 'Pərakəndəçilərin bağlantı sorğusunda gördüyü məlumatlar və sifariş qaydaları.',
    ru: 'Информация, которую видят розничные клиенты в запросе на связь, и правила заказа.',
    tr: 'Perakendecilerin bağlantı isteğinde gördüğü bilgiler ve sipariş kuralları.',
  },
  'sellerSettings.profile.about': {
    az: 'Tanıtım mətni',
    ru: 'Описание компании',
    tr: 'Tanıtım metni',
  },
  'sellerSettings.profile.about_placeholder': {
    az: 'Məhsullarınız, çatdırılma və iş qaydanız haqqında qısa məlumat',
    ru: 'Кратко о товарах, доставке и условиях работы',
    tr: 'Ürünleriniz, teslimat ve çalışma şekliniz hakkında kısa bilgi',
  },
  'sellerSettings.profile.about_hint': {
    az: 'Hər dil üçün ayrıca yazın; boş dil göstərilmir.',
    ru: 'Заполните для каждого языка; пустой язык не показывается.',
    tr: 'Her dil için ayrı yazın; boş dil gösterilmez.',
  },
  'sellerSettings.profile.min_order': {
    az: 'Minimum sifariş məbləği',
    ru: 'Минимальная сумма заказа',
    tr: 'Minimum sipariş tutarı',
  },
  'sellerSettings.profile.min_order_hint': {
    az: 'Boş buraxsanız limit olmur.',
    ru: 'Оставьте пустым, чтобы не ограничивать.',
    tr: 'Boş bırakırsanız sınır olmaz.',
  },
  'sellerSettings.profile.delivery_photo': {
    az: 'Təhvil fotosu məcburidir',
    ru: 'Фото при доставке обязательно',
    tr: 'Teslim fotoğrafı zorunlu',
  },
  'sellerSettings.profile.delivery_photo_hint': {
    az: 'Kuryer sifarişi fotosuz təhvil verə bilməz.',
    ru: 'Курьер не сможет завершить доставку без фото.',
    tr: 'Kargocu siparişi fotoğrafsız teslim edemez.',
  },
  'sellerSettings.warehouses.title': {
    az: 'Anbarlar',
    ru: 'Склады',
    tr: 'Depolar',
  },
  'sellerSettings.warehouses.count': {
    az: '{count} anbar',
    ru: 'Складов: {count}',
    tr: '{count} depo',
  },
  'sellerSettings.warehouses.new_title': {
    az: 'Yeni anbar',
    ru: 'Новый склад',
    tr: 'Yeni depo',
  },
  'sellerSettings.warehouses.first_hint': {
    az: 'İlk anbarınız əsas anbar olacaq; stok anbar üzrə saxlanılır.',
    ru: 'Первый склад станет основным; остатки ведутся по складам.',
    tr: 'İlk deponuz varsayılan depo olur; stok depo bazında tutulur.',
  },
  'sellerSettings.warehouses.new_hint': {
    az: 'Anbar sayı planınızın limitindən asılıdır.',
    ru: 'Количество складов зависит от тарифа.',
    tr: 'Depo sayısı planınızın sınırına bağlıdır.',
  },
  'sellerSettings.warehouses.name': {
    az: 'Anbarın adı',
    ru: 'Название склада',
    tr: 'Depo adı',
  },
  'sellerSettings.warehouses.address': {
    az: 'Ünvan',
    ru: 'Адрес',
    tr: 'Adres',
  },
  'sellerSettings.warehouses.address_hint': {
    az: 'İstəyə bağlı',
    ru: 'Необязательно',
    tr: 'İsteğe bağlı',
  },
  'sellerSettings.warehouses.add': {
    az: 'Anbar əlavə et',
    ru: 'Добавить склад',
    tr: 'Depo ekle',
  },
  'sellerSettings.warehouses.empty': {
    az: 'Hələ anbar yoxdur',
    ru: 'Складов пока нет',
    tr: 'Henüz depo yok',
  },
  'sellerSettings.warehouses.empty_hint': {
    az: 'Yuxarıdakı formdan ilk anbarınızı əlavə edin.',
    ru: 'Добавьте первый склад с помощью формы выше.',
    tr: 'Yukarıdaki formdan ilk deponuzu ekleyin.',
  },
  'sellerSettings.warehouses.default': {
    az: 'Əsas',
    ru: 'Основной',
    tr: 'Varsayılan',
  },
  'sellerSettings.warehouses.inactive': {
    az: 'Deaktiv',
    ru: 'Неактивен',
    tr: 'Pasif',
  },
  'sellerSettings.warehouses.no_address': {
    az: 'Ünvan yoxdur',
    ru: 'Адрес не указан',
    tr: 'Adres yok',
  },
  'sellerSettings.warehouses.edit': {
    az: 'Düzəlt',
    ru: 'Изменить',
    tr: 'Düzenle',
  },
  'sellerSettings.warehouses.make_default': {
    az: 'Əsas et',
    ru: 'Сделать основным',
    tr: 'Varsayılan yap',
  },
  'sellerSettings.warehouses.activate': {
    az: 'Aktivləşdir',
    ru: 'Активировать',
    tr: 'Etkinleştir',
  },
  'sellerSettings.warehouses.deactivate': {
    az: 'Deaktiv et',
    ru: 'Деактивировать',
    tr: 'Pasifleştir',
  },
  'sellerSettings.warehouses.no_delete_note': {
    az: 'Anbarlar silinmir, yalnız deaktiv edilir; keçmiş stok və sifariş qeydləri qorunur.',
    ru: 'Склады не удаляются, только деактивируются; история остатков и заказов сохраняется.',
    tr: 'Depolar silinmez, yalnızca pasifleştirilir; geçmiş stok ve sipariş kayıtları korunur.',
  },
  'sellerSettings.areas.title': {
    az: 'Xidmət bölgələri',
    ru: 'Регионы обслуживания',
    tr: 'Hizmet bölgeleri',
  },
  'sellerSettings.areas.description': {
    az: 'Mal çatdırdığınız bölgələri seçin; pərakəndəçi kataloqu bu bölgələrə görə süzülür.',
    ru: 'Выберите регионы, куда вы доставляете; каталог розничных клиентов фильтруется по ним.',
    tr: 'Mal teslim ettiğiniz bölgeleri seçin; perakendeci dizini bu bölgelere göre süzülür.',
  },
  'sellerSettings.areas.selected': {
    az: '{count} seçilib',
    ru: 'Выбрано: {count}',
    tr: '{count} seçili',
  },
  'sellerSettings.areas.selected_list': {
    az: 'Seçilmiş bölgələr',
    ru: 'Выбранные регионы',
    tr: 'Seçili bölgeler',
  },
  'sellerSettings.areas.remove': {
    az: '{name} çıxar',
    ru: 'Убрать {name}',
    tr: '{name} kaldır',
  },
  'sellerSettings.areas.search': {
    az: 'Bölgə axtar',
    ru: 'Поиск региона',
    tr: 'Bölge ara',
  },
  'sellerSettings.areas.no_match': {
    az: 'Uyğun bölgə tapılmadı.',
    ru: 'Регион не найден.',
    tr: 'Eşleşen bölge yok.',
  },
  'team.title': {
    az: 'Komanda',
    ru: 'Команда',
    tr: 'Ekip',
  },
  'team.description': {
    az: 'İşçiləri dəvət edin, rollarını və iş sahələrini təyin edin.',
    ru: 'Приглашайте сотрудников, назначайте им роли и зоны работы.',
    tr: 'Çalışanları davet edin, rollerini ve çalışma alanlarını belirleyin.',
  },
  'team.no_access': {
    az: 'Komandanı idarə etmək üçün icazəniz yoxdur.',
    ru: 'У вас нет прав на управление командой.',
    tr: 'Ekibi yönetme yetkiniz yok.',
  },
  'team.invite_open': {
    az: 'Dəvət et',
    ru: 'Пригласить',
    tr: 'Davet et',
  },
  'team.invite_title': {
    az: 'Yeni işçi dəvəti',
    ru: 'Пригласить сотрудника',
    tr: 'Yeni çalışan daveti',
  },
  'team.invite_hint': {
    az: 'İşçiyə SMS ilə link gedəcək; daxil olub qəbul edəndə komandaya qoşulacaq.',
    ru: 'Сотрудник получит ссылку по SMS и войдёт в команду после входа и подтверждения.',
    tr: 'Çalışana SMS ile bağlantı gider; giriş yapıp kabul edince ekibe katılır.',
  },
  'team.field.phone': {
    az: 'Telefon nömrəsi',
    ru: 'Номер телефона',
    tr: 'Telefon numarası',
  },
  'team.field.fullName': {
    az: 'Ad və soyad',
    ru: 'Имя и фамилия',
    tr: 'Ad soyad',
  },
  'team.field.jobTitleId': {
    az: 'Vəzifə',
    ru: 'Должность',
    tr: 'Unvan',
  },
  'team.field.roleId': {
    az: 'Rol',
    ru: 'Роль',
    tr: 'Rol',
  },
  'team.field.branchId': {
    az: 'Filial',
    ru: 'Филиал',
    tr: 'Şube',
  },
  'team.field.warehouseId': {
    az: 'Anbar',
    ru: 'Склад',
    tr: 'Depo',
  },
  'team.field.regionIds': {
    az: 'Bölgələr',
    ru: 'Регионы',
    tr: 'Bölgeler',
  },
  'team.phone_hint': {
    az: 'Beynəlxalq formatda, məsələn +994501234567',
    ru: 'В международном формате, например +994501234567',
    tr: 'Uluslararası biçimde, ör. +994501234567',
  },
  'team.role_hint': {
    az: 'Vəzifəyə görə təklif olunur; dəyişə bilərsiniz.',
    ru: 'Предлагается по должности; можно изменить.',
    tr: 'Unvana göre önerilir; değiştirebilirsiniz.',
  },
  'team.no_role_for_title': {
    az: 'Bu vəzifə üçün biznesdə hazır rol yoxdur; siyahıdan rol seçin.',
    ru: 'Для этой должности в бизнесе нет готовой роли; выберите роль из списка.',
    tr: 'Bu unvan için işletmede hazır rol yok; listeden bir rol seçin.',
  },
  'team.regions_after_accept': {
    az: 'Bölgələr işçi dəvəti qəbul etdikdən sonra siyahıda təyin edilir.',
    ru: 'Регионы назначаются в списке после того, как сотрудник примет приглашение.',
    tr: 'Bölgeler, çalışan daveti kabul ettikten sonra listede atanır.',
  },
  'team.branch_unavailable': {
    az: 'Filial siyahısını görmək üçün biznes parametrləri icazəsi lazımdır.',
    ru: 'Чтобы видеть филиалы, нужно право на настройки бизнеса.',
    tr: 'Şube listesini görmek için işletme ayarları yetkisi gerekir.',
  },
  'team.warehouse_unavailable': {
    az: 'Anbar siyahısını görmək üçün biznes parametrləri icazəsi lazımdır.',
    ru: 'Чтобы видеть склады, нужно право на настройки бизнеса.',
    tr: 'Depo listesini görmek için işletme ayarları yetkisi gerekir.',
  },
  'team.choose': {
    az: 'Seçin',
    ru: 'Выберите',
    tr: 'Seçin',
  },
  'team.send': {
    az: 'Dəvət göndər',
    ru: 'Отправить приглашение',
    tr: 'Davet gönder',
  },
  'team.sent': {
    az: 'Dəvət göndərildi.',
    ru: 'Приглашение отправлено.',
    tr: 'Davet gönderildi.',
  },
  'team.sent_no_sms': {
    az: 'Dəvət yaradıldı, amma SMS göndərilmədi. Bir az sonra yenidən dəvət edin.',
    ru: 'Приглашение создано, но SMS не отправлено. Повторите приглашение чуть позже.',
    tr: 'Davet oluşturuldu ama SMS gönderilemedi. Biraz sonra yeniden davet edin.',
  },
  'team.cancel': {
    az: 'Ləğv et',
    ru: 'Отмена',
    tr: 'Vazgeç',
  },
  'team.save': {
    az: 'Yadda saxla',
    ru: 'Сохранить',
    tr: 'Kaydet',
  },
  'team.saved': {
    az: 'Yadda saxlanıldı',
    ru: 'Сохранено',
    tr: 'Kaydedildi',
  },
  'team.edit': {
    az: 'Düzəliş et',
    ru: 'Изменить',
    tr: 'Düzenle',
  },
  'team.remove': {
    az: 'Komandadan çıxar',
    ru: 'Удалить из команды',
    tr: 'Ekipten çıkar',
  },
  'team.remove_confirm': {
    az: '{name} komandadan çıxarılsın? Giriş icazəsi dərhal bağlanacaq.',
    ru: 'Удалить {name} из команды? Доступ закроется сразу.',
    tr: '{name} ekipten çıkarılsın mı? Erişimi hemen kapanır.',
  },
  'team.remove_yes': {
    az: 'Bəli, çıxar',
    ru: 'Да, удалить',
    tr: 'Evet, çıkar',
  },
  'team.removed': {
    az: '{name} komandadan çıxarıldı.',
    ru: '{name} удалён(а) из команды.',
    tr: '{name} ekipten çıkarıldı.',
  },
  'team.you': {
    az: 'Siz',
    ru: 'Вы',
    tr: 'Siz',
  },
  'team.admin': {
    az: 'Admin',
    ru: 'Админ',
    tr: 'Yönetici',
  },
  'team.no_regions': {
    az: 'Bölgə təyin edilməyib',
    ru: 'Регионы не назначены',
    tr: 'Bölge atanmadı',
  },
  'team.regions_selected': {
    az: '{count} bölgə',
    ru: 'Регионов: {count}',
    tr: '{count} bölge',
  },
  'team.region_search': {
    az: 'Bölgə axtar',
    ru: 'Поиск региона',
    tr: 'Bölge ara',
  },
  'team.members.title': {
    az: 'Üzvlər',
    ru: 'Участники',
    tr: 'Üyeler',
  },
  'team.members.count': {
    az: '{count} nəfər',
    ru: '{count} чел.',
    tr: '{count} kişi',
  },
  'team.invitations.title': {
    az: 'Açıq dəvətlər',
    ru: 'Открытые приглашения',
    tr: 'Açık davetler',
  },
  'team.invitations.count': {
    az: '{count} dəvət',
    ru: 'Приглашений: {count}',
    tr: '{count} davet',
  },
  'team.invitations.empty': {
    az: 'Açıq dəvət yoxdur',
    ru: 'Открытых приглашений нет',
    tr: 'Açık davet yok',
  },
  'team.invitations.empty_hint': {
    az: 'Göndərdiyiniz və hələ qəbul edilməmiş dəvətlər burada görünəcək.',
    ru: 'Здесь появятся отправленные и ещё не принятые приглашения.',
    tr: 'Gönderdiğiniz ve henüz kabul edilmemiş davetler burada görünür.',
  },
  'team.invitations.expires': {
    az: 'Bitmə tarixi: {date}',
    ru: 'Действует до: {date}',
    tr: 'Son gün: {date}',
  },
  'team.revoke': {
    az: 'Geri çək',
    ru: 'Отозвать',
    tr: 'Geri çek',
  },
  'team.revoke_confirm': {
    az: 'Dəvət geri çəkilsin?',
    ru: 'Отозвать приглашение?',
    tr: 'Davet geri çekilsin mi?',
  },
  'team.revoke_yes': {
    az: 'Bəli, geri çək',
    ru: 'Да, отозвать',
    tr: 'Evet, geri çek',
  },
  'team.revoked': {
    az: 'Dəvət geri çəkildi.',
    ru: 'Приглашение отозвано.',
    tr: 'Davet geri çekildi.',
  },
  'team.loading': {
    az: 'Yüklənir…',
    ru: 'Загрузка…',
    tr: 'Yükleniyor…',
  },
  'team.error.required': {
    az: 'Bu sahə mütləqdir.',
    ru: 'Обязательное поле.',
    tr: 'Bu alan zorunlu.',
  },
  'team.error.phone_invalid': {
    az: 'Nömrəni +994501234567 formatında yazın.',
    ru: 'Введите номер в формате +994501234567.',
    tr: 'Numarayı +994501234567 biçiminde yazın.',
  },
  'team.error.too_long': {
    az: 'Mətn çox uzundur.',
    ru: 'Слишком длинный текст.',
    tr: 'Metin çok uzun.',
  },
  'team.error.not_found': {
    az: 'Seçim tapılmadı; siyahını yeniləyin.',
    ru: 'Значение не найдено; обновите список.',
    tr: 'Seçim bulunamadı; listeyi yenileyin.',
  },
  'team.error.inactive': {
    az: 'Bu seçim aktiv deyil.',
    ru: 'Этот вариант неактивен.',
    tr: 'Bu seçim etkin değil.',
  },
  'team.error.not_allowed': {
    az: 'Bu rol üçün bu sahə lazım deyil.',
    ru: 'Для этой роли это поле не нужно.',
    tr: 'Bu rol için bu alan gerekmiyor.',
  },
  'team.error.beyond_actor': {
    az: 'Yalnız öz filialınıza bağlaya bilərsiniz.',
    ru: 'Можно привязать только к своему филиалу.',
    tr: 'Yalnızca kendi şubenize bağlayabilirsiniz.',
  },
  'team.branch_own_only': {
    az: 'Biznes admini olmadığınız üçün yalnız öz filialınızı seçə bilərsiniz.',
    ru: 'Вы не администратор бизнеса, поэтому можно выбрать только свой филиал.',
    tr: 'İşletme admini olmadığınız için yalnızca kendi şubenizi seçebilirsiniz.',
  },
  'team.error.invalid': {
    az: 'Dəyər yanlışdır.',
    ru: 'Неверное значение.',
    tr: 'Değer geçersiz.',
  },
  'team.error.plan_limit': {
    az: 'Planınızdakı istifadəçi limiti dolub. Yer açmaq üçün dəvəti geri çəkin və ya planı yüksəldin.',
    ru: 'Лимит пользователей по тарифу исчерпан. Отзовите приглашение или повысьте тариф.',
    tr: 'Planınızdaki kullanıcı sınırı doldu. Yer açmak için bir daveti geri çekin veya planı yükseltin.',
  },
  // F2.8: özel rol düzenleyici (US-014). Taslak; az/ru/tr onayı platform sahibinde.
  'team.role.title': {
    az: 'Rollar',
    ru: 'Роли',
    tr: 'Roller',
  },
  'team.role.count': {
    az: '{count} rol',
    ru: '{count} ролей',
    tr: '{count} rol',
  },
  'team.role.create_open': {
    az: 'Şablondan yeni rol',
    ru: 'Новая роль из шаблона',
    tr: 'Şablondan yeni rol',
  },
  'team.role.badge_admin': {
    az: 'Admin',
    ru: 'Админ',
    tr: 'Admin',
  },
  'team.role.badge_custom': {
    az: 'Xüsusi',
    ru: 'Своя',
    tr: 'Özel',
  },
  'team.role.all_permissions': {
    az: 'Bütün icazələr',
    ru: 'Все права',
    tr: 'Tüm izinler',
  },
  'team.role.permission_count': {
    az: '{count} icazə',
    ru: 'Прав: {count}',
    tr: '{count} izin',
  },
  'team.role.edit': {
    az: 'Redaktə et',
    ru: 'Изменить',
    tr: 'Düzenle',
  },
  'team.role.create_title': {
    az: 'Şablondan yeni rol',
    ru: 'Новая роль из шаблона',
    tr: 'Şablondan yeni rol',
  },
  'team.role.edit_title': {
    az: 'Rolu redaktə et',
    ru: 'Изменить роль',
    tr: 'Rolü düzenle',
  },
  'team.role.editor_hint': {
    az: 'Rol yalnız bu şirkətdə istifadə olunur. İcazələri açıb-bağlayın.',
    ru: 'Роль действует только в этой компании. Включайте и отключайте права.',
    tr: 'Rol yalnızca bu işletmede kullanılır. İzinleri açıp kapatın.',
  },
  'team.role.field.template': {
    az: 'Şablon',
    ru: 'Шаблон',
    tr: 'Şablon',
  },
  'team.role.template_hint': {
    az: 'Ad və icazələr şablondan doldurulur.',
    ru: 'Название и права заполнятся из шаблона.',
    tr: 'Ad ve izinler şablondan doldurulur.',
  },
  'team.role.field.name': {
    az: 'Rolun adı',
    ru: 'Название роли',
    tr: 'Rol adı',
  },
  'team.role.name_hint': {
    az: 'Ad seçilmiş dildə saxlanılır.',
    ru: 'Название сохраняется на выбранном языке.',
    tr: 'Ad seçili dilde kaydedilir.',
  },
  'team.role.field.permissions': {
    az: 'İcazələr',
    ru: 'Права',
    tr: 'İzinler',
  },
  'team.role.permissions_hint': {
    az: 'Yalnız şirkətinizin növünə uyğun icazələr göstərilir.',
    ru: 'Показаны только права, подходящие вашему типу компании.',
    tr: 'Yalnızca işletme türünüze uygun izinler gösterilir.',
  },
  'team.role.not_grantable': {
    az: 'Bu icazə sizdə olmadığı üçün verə bilməzsiniz.',
    ru: 'Вы не можете выдать право, которого нет у вас.',
    tr: 'Sizde olmayan bir izni veremezsiniz.',
  },
  'team.role.scope.all': {
    az: 'Hamısı',
    ru: 'Все',
    tr: 'Tümü',
  },
  'team.role.scope.branch': {
    az: 'Öz filialı',
    ru: 'Свой филиал',
    tr: 'Kendi şubesi',
  },
  'team.role.scope.warehouse': {
    az: 'Öz anbarı',
    ru: 'Свой склад',
    tr: 'Kendi deposu',
  },
  'team.role.scope.assigned': {
    az: 'Təyin olunanlar',
    ru: 'Назначенные',
    tr: 'Atananlar',
  },
  'team.role.save': {
    az: 'Yadda saxla',
    ru: 'Сохранить',
    tr: 'Kaydet',
  },
  'team.role.created': {
    az: 'Rol yaradıldı.',
    ru: 'Роль создана.',
    tr: 'Rol oluşturuldu.',
  },
  'team.role.updated': {
    az: 'Rol yeniləndi.',
    ru: 'Роль обновлена.',
    tr: 'Rol güncellendi.',
  },
  'team.role.error.no_permissions': {
    az: 'Ən azı bir icazə seçin.',
    ru: 'Выберите хотя бы одно право.',
    tr: 'En az bir izin seçin.',
  },
  'team.role.error.scope_change_in_use': {
    az: 'Bu rol istifadədədir: filial, anbar və ya bölgə tələb edən icazələri dəyişmək olmaz. Yeni rol yaradın.',
    ru: 'Роль используется: нельзя менять права, требующие филиал, склад или регион. Создайте новую роль.',
    tr: 'Bu rol kullanımda: şube, depo veya bölge gerektiren izinler değiştirilemez. Yeni bir rol oluşturun.',
  },
  'team.role.error.beyond_actor': {
    az: 'Sizdə olmayan icazəni rola əlavə edə və ya belə rolu təyin edə bilməzsiniz.',
    ru: 'Нельзя добавить в роль право, которого нет у вас, или назначить такую роль.',
    tr: 'Sizde olmayan bir izni role ekleyemez veya böyle bir rolü atayamazsınız.',
  },
  'team.role.error.invalid': {
    az: 'İcazələrdən biri bu rol üçün uyğun deyil.',
    ru: 'Одно из прав не подходит для этой роли.',
    tr: 'İzinlerden biri bu rol için uygun değil.',
  },
  // F2.9b admin unvan ve rol şablonu ekranları (taslak çeviri, onay bekliyor).
  'shell.menu.role_templates': {
    az: 'Rol şablonları',
    ru: 'Шаблоны ролей',
    tr: 'Rol şablonları',
  },
  'shell.menu.job_titles': {
    az: 'Vəzifələr',
    ru: 'Должности',
    tr: 'Unvanlar',
  },
  'adminCatalog.eyebrow': {
    az: 'Ümumi kataloq',
    ru: 'Общий каталог',
    tr: 'Ortak katalog',
  },
  'adminCatalog.loading': {
    az: 'Yüklənir…',
    ru: 'Загрузка…',
    tr: 'Yükleniyor…',
  },
  'adminCatalog.cancel': {
    az: 'Ləğv et',
    ru: 'Отмена',
    tr: 'Vazgeç',
  },
  'adminCatalog.save': {
    az: 'Yadda saxla',
    ru: 'Сохранить',
    tr: 'Kaydet',
  },
  'adminCatalog.edit': {
    az: 'Düzəlt',
    ru: 'Изменить',
    tr: 'Düzenle',
  },
  'adminCatalog.choose': {
    az: 'Seçin',
    ru: 'Выберите',
    tr: 'Seçin',
  },
  'adminCatalog.count': {
    az: '{count} qeyd',
    ru: 'Записей: {count}',
    tr: '{count} kayıt',
  },
  'adminCatalog.permission_count': {
    az: '{count} icazə',
    ru: 'Прав: {count}',
    tr: '{count} izin',
  },
  'adminCatalog.code_hint': {
    az: 'Kiçik latın hərfləri, rəqəm və _ (məs. seller_cashier). Sonradan dəyişmir.',
    ru: 'Строчные латинские буквы, цифры и _ (напр. seller_cashier). Потом не меняется.',
    tr: 'Küçük Latin harfleri, rakam ve _ (ör. seller_cashier). Sonradan değişmez.',
  },
  'adminCatalog.code_locked': {
    az: 'Kod və istiqamət dəyişmir.',
    ru: 'Код и направление не меняются.',
    tr: 'Kod ve yetenek değişmez.',
  },
  'adminCatalog.name_hint': {
    az: 'Azərbaycan, rus və türk dilləri məcburidir; ingilis dili istəyə bağlıdır.',
    ru: 'Азербайджанский, русский и турецкий обязательны; английский — по желанию.',
    tr: 'Azerbaycanca, Rusça ve Türkçe zorunlu; İngilizce isteğe bağlı.',
  },
  'adminCatalog.field.name': {
    az: 'Ad',
    ru: 'Название',
    tr: 'Ad',
  },
  'adminCatalog.field.code': {
    az: 'Kod',
    ru: 'Код',
    tr: 'Kod',
  },
  'adminCatalog.field.capability': {
    az: 'İstiqamət',
    ru: 'Направление',
    tr: 'Yetenek',
  },
  'adminCatalog.field.permissions': {
    az: 'İcazələr',
    ru: 'Права',
    tr: 'İzinler',
  },
  'adminCatalog.field.template': {
    az: 'Rol şablonu',
    ru: 'Шаблон роли',
    tr: 'Rol şablonu',
  },
  'adminCatalog.lang.az': {
    az: 'Azərbaycanca',
    ru: 'Азербайджанский',
    tr: 'Azerbaycanca',
  },
  'adminCatalog.lang.ru': {
    az: 'Rusca',
    ru: 'Русский',
    tr: 'Rusça',
  },
  'adminCatalog.lang.tr': {
    az: 'Türkcə',
    ru: 'Турецкий',
    tr: 'Türkçe',
  },
  'adminCatalog.lang.en': {
    az: 'İngiliscə (istəyə bağlı)',
    ru: 'Английский (по желанию)',
    tr: 'İngilizce (isteğe bağlı)',
  },
  'adminCatalog.error.required': {
    az: 'Məcburi sahə.',
    ru: 'Обязательное поле.',
    tr: 'Zorunlu alan.',
  },
  'adminCatalog.error.too_long': {
    az: 'Çox uzundur.',
    ru: 'Слишком длинно.',
    tr: 'Çok uzun.',
  },
  'adminCatalog.error.invalid': {
    az: 'Yanlış dəyər.',
    ru: 'Неверное значение.',
    tr: 'Geçersiz değer.',
  },
  'adminCatalog.error.code_required': {
    az: 'Kodu daxil edin.',
    ru: 'Введите код.',
    tr: 'Kodu girin.',
  },
  'adminCatalog.error.code_invalid': {
    az: 'Kod yalnız kiçik latın hərfi ilə başlamalı, 3–63 simvol olmalıdır (a–z, 0–9, _).',
    ru: 'Код должен начинаться со строчной латинской буквы, 3–63 символа (a–z, 0–9, _).',
    tr: 'Kod küçük Latin harfiyle başlamalı, 3–63 karakter olmalı (a–z, 0–9, _).',
  },
  'adminCatalog.error.code_too_long': {
    az: 'Kod çox uzundur.',
    ru: 'Код слишком длинный.',
    tr: 'Kod çok uzun.',
  },
  'adminCatalog.error.no_permissions': {
    az: 'Ən azı bir icazə seçin.',
    ru: 'Выберите хотя бы одно право.',
    tr: 'En az bir izin seçin.',
  },
  'adminCatalog.capability.seller': {
    az: 'Topdançı',
    ru: 'Оптовик',
    tr: 'Toptancı',
  },
  'adminCatalog.capability.buyer': {
    az: 'Pərakəndəçi',
    ru: 'Розница',
    tr: 'Perakendeci',
  },
  'adminCatalog.scope.all': {
    az: 'Hamısı',
    ru: 'Все',
    tr: 'Tümü',
  },
  'adminCatalog.scope.branch': {
    az: 'Filial',
    ru: 'Филиал',
    tr: 'Şube',
  },
  'adminCatalog.scope.warehouse': {
    az: 'Anbar',
    ru: 'Склад',
    tr: 'Depo',
  },
  'adminCatalog.scope.assigned': {
    az: 'Təyin edilmiş',
    ru: 'Назначенные',
    tr: 'Atanmış',
  },
  'adminCatalog.failure.code_taken': {
    az: 'Bu kod artıq istifadə olunur.',
    ru: 'Этот код уже используется.',
    tr: 'Bu kod zaten kullanılıyor.',
  },
  'adminCatalog.failure.admin_template_locked': {
    az: 'Biznes admini şablonunun icazələri dəyişdirilə bilməz.',
    ru: 'Права шаблона администратора компании изменить нельзя.',
    tr: 'İşletme admini şablonunun izinleri değiştirilemez.',
  },
  'adminCatalog.failure.capability': {
    az: 'Seçim bu istiqamətə uyğun deyil.',
    ru: 'Выбор не подходит для этого направления.',
    tr: 'Seçim bu yeteneğe uygun değil.',
  },
  'adminCatalog.failure.in_use': {
    az: 'Bu vəzifə istifadədədir; silinə bilməz, yalnız deaktiv edilə bilər.',
    ru: 'Эта должность используется: удалить нельзя, можно только деактивировать.',
    tr: 'Bu unvan kullanımda; silinemez, yalnızca pasifleştirilebilir.',
  },
  'adminCatalog.failure.invalid': {
    az: 'Məlumatlardan biri yanlışdır.',
    ru: 'Одно из значений неверно.',
    tr: 'Bilgilerden biri geçersiz.',
  },
  'adminCatalog.template.title': {
    az: 'Rol şablonları',
    ru: 'Шаблоны ролей',
    tr: 'Rol şablonları',
  },
  'adminCatalog.template.description': {
    az: 'Yeni bizneslər rollarını bu şablonlardan alır. Şablonu dəyişmək mövcud rolları dəyişmir; adminlərə yeni versiya bildirişi gedir.',
    ru: 'Новые компании получают роли из этих шаблонов. Изменение шаблона не меняет существующие роли; администраторы получают уведомление о новой версии.',
    tr: 'Yeni işletmeler rollerini bu şablonlardan alır. Şablonu değiştirmek mevcut rolleri değiştirmez; adminlere yeni sürüm bildirimi gider.',
  },
  'adminCatalog.template.create_open': {
    az: 'Yeni şablon',
    ru: 'Новый шаблон',
    tr: 'Yeni şablon',
  },
  'adminCatalog.template.create_title': {
    az: 'Yeni rol şablonu',
    ru: 'Новый шаблон роли',
    tr: 'Yeni rol şablonu',
  },
  'adminCatalog.template.edit_title': {
    az: 'Şablonu düzəlt',
    ru: 'Изменить шаблон',
    tr: 'Şablonu düzenle',
  },
  'adminCatalog.template.editor_hint': {
    az: 'Yeni şablon bu istiqamətdəki bütün bizneslərə rol kimi əlavə olunur.',
    ru: 'Новый шаблон добавляется как роль всем компаниям этого направления.',
    tr: 'Yeni şablon bu yetenekteki tüm işletmelere rol olarak eklenir.',
  },
  'adminCatalog.template.permissions_hint': {
    az: 'Yalnız bu istiqamətə aid icazələr göstərilir.',
    ru: 'Показаны только права этого направления.',
    tr: 'Yalnızca bu yeteneğe ait izinler gösterilir.',
  },
  'adminCatalog.template.locked_badge': {
    az: 'Kilidli',
    ru: 'Заблокировано',
    tr: 'Kilitli',
  },
  'adminCatalog.template.locked_hint': {
    az: 'Biznes admini şablonunun icazələri dəyişmir; yalnız adı dəyişə bilərsiniz.',
    ru: 'Права шаблона администратора не меняются; можно изменить только название.',
    tr: 'İşletme admini şablonunun izinleri değişmez; yalnızca adını değiştirebilirsiniz.',
  },
  'adminCatalog.template.created': {
    az: 'Şablon yaradıldı və bizneslərə əlavə olundu.',
    ru: 'Шаблон создан и добавлен компаниям.',
    tr: 'Şablon oluşturuldu ve işletmelere eklendi.',
  },
  'adminCatalog.template.updated': {
    az: 'Şablon yadda saxlanıldı.',
    ru: 'Шаблон сохранён.',
    tr: 'Şablon kaydedildi.',
  },
  'adminCatalog.template.new_version': {
    az: 'Yeni versiya: v{version}. Bizneslərin rolları dəyişmədi; adminlərə bildiriş göndərilir.',
    ru: 'Новая версия: v{version}. Роли компаний не изменились; администраторам отправляется уведомление.',
    tr: 'Yeni sürüm: v{version}. İşletmelerin rolleri değişmedi; adminlere bildirim gönderiliyor.',
  },
  'adminCatalog.template.empty': {
    az: 'Şablon yoxdur.',
    ru: 'Шаблонов нет.',
    tr: 'Şablon yok.',
  },
  'adminCatalog.template.admin_badge': {
    az: 'Biznes admini',
    ru: 'Администратор компании',
    tr: 'İşletme admini',
  },
  'adminCatalog.template.version': {
    az: 'v{version}',
    ru: 'v{version}',
    tr: 'v{version}',
  },
  'adminCatalog.title.title': {
    az: 'Vəzifələr',
    ru: 'Должности',
    tr: 'Unvanlar',
  },
  'adminCatalog.title.description': {
    az: 'Aktiv vəzifələr bizneslərin komanda dəvəti ekranında seçilir. İstifadədə olan vəzifə silinmir, yalnız deaktiv edilir.',
    ru: 'Активные должности выбираются в окне приглашения в команду. Используемую должность нельзя удалить, только деактивировать.',
    tr: 'Aktif unvanlar işletmelerin ekip daveti ekranında seçilir. Kullanımdaki unvan silinmez, yalnızca pasifleştirilir.',
  },
  'adminCatalog.title.create_open': {
    az: 'Yeni vəzifə',
    ru: 'Новая должность',
    tr: 'Yeni unvan',
  },
  'adminCatalog.title.create_title': {
    az: 'Yeni vəzifə',
    ru: 'Новая должность',
    tr: 'Yeni unvan',
  },
  'adminCatalog.title.edit_title': {
    az: 'Vəzifəni düzəlt',
    ru: 'Изменить должность',
    tr: 'Unvanı düzenle',
  },
  'adminCatalog.title.editor_hint': {
    az: 'Vəzifə dəvət olunan şəxsə təklif olunan rolu şablondan alır.',
    ru: 'Должность берёт предлагаемую роль из шаблона.',
    tr: 'Unvan, davet edilen kişiye önerilen rolü şablondan alır.',
  },
  'adminCatalog.title.template_hint': {
    az: 'Yalnız eyni istiqamətin şablonları.',
    ru: 'Только шаблоны того же направления.',
    tr: 'Yalnızca aynı yeteneğin şablonları.',
  },
  'adminCatalog.title.created': {
    az: 'Vəzifə yaradıldı; dəvət ekranında görünür.',
    ru: 'Должность создана и видна в окне приглашения.',
    tr: 'Unvan oluşturuldu; davet ekranında görünür.',
  },
  'adminCatalog.title.updated': {
    az: 'Vəzifə yadda saxlanıldı.',
    ru: 'Должность сохранена.',
    tr: 'Unvan kaydedildi.',
  },
  'adminCatalog.title.activated': {
    az: 'Vəzifə aktiv edildi.',
    ru: 'Должность активирована.',
    tr: 'Unvan aktifleştirildi.',
  },
  'adminCatalog.title.deactivated': {
    az: 'Vəzifə deaktiv edildi; dəvət ekranında görünmür.',
    ru: 'Должность деактивирована и скрыта в окне приглашения.',
    tr: 'Unvan pasifleştirildi; davet ekranında görünmez.',
  },
  'adminCatalog.title.deleted': {
    az: 'Vəzifə silindi.',
    ru: 'Должность удалена.',
    tr: 'Unvan silindi.',
  },
  'adminCatalog.title.list_title': {
    az: 'Bütün vəzifələr',
    ru: 'Все должности',
    tr: 'Tüm unvanlar',
  },
  'adminCatalog.title.empty': {
    az: 'Vəzifə yoxdur.',
    ru: 'Должностей нет.',
    tr: 'Unvan yok.',
  },
  'adminCatalog.title.active': {
    az: 'Aktiv',
    ru: 'Активна',
    tr: 'Aktif',
  },
  'adminCatalog.title.inactive': {
    az: 'Deaktiv',
    ru: 'Неактивна',
    tr: 'Pasif',
  },
  'adminCatalog.title.in_use': {
    az: 'İstifadədə',
    ru: 'Используется',
    tr: 'Kullanımda',
  },
  'adminCatalog.title.in_use_hint': {
    az: 'İstifadədədir, silinə bilməz.',
    ru: 'Используется, удалить нельзя.',
    tr: 'Kullanımda, silinemez.',
  },
  'adminCatalog.title.delete_confirm': {
    az: 'Silinsin?',
    ru: 'Удалить?',
    tr: 'Silinsin mi?',
  },
  'adminCatalog.title.delete_yes': {
    az: 'Bəli, sil',
    ru: 'Да, удалить',
    tr: 'Evet, sil',
  },
  'adminCatalog.title.deactivate': {
    az: 'Deaktiv et',
    ru: 'Деактивировать',
    tr: 'Pasifleştir',
  },
  'adminCatalog.title.activate': {
    az: 'Aktiv et',
    ru: 'Активировать',
    tr: 'Aktifleştir',
  },
  'adminCatalog.title.delete': {
    az: 'Sil',
    ru: 'Удалить',
    tr: 'Sil',
  },
  // F2.11b: perakendeci dizini (web + mobil).
  'directory.title': {
    az: 'Pərakəndəçi tap',
    ru: 'Поиск розничных точек',
    tr: 'Perakendeci bul',
  },
  'directory.description': {
    az: 'Bölgənizdəki pərakəndəçiləri tapın. Yalnız pərakəndəçinin açıq saxladığı məlumatlar görünür.',
    ru: 'Найдите розничные точки в вашем регионе. Видны только данные, которые розничная точка сделала открытыми.',
    tr: 'Bölgenizdeki perakendecileri bulun. Yalnızca perakendecinin açık bıraktığı bilgiler görünür.',
  },
  'directory.mode.filter': {
    az: 'Süzgəclə axtar',
    ru: 'Поиск с фильтрами',
    tr: 'Filtreyle ara',
  },
  'directory.mode.exact': {
    az: 'Telefon və ya VÖEN ilə tap',
    ru: 'Найти по телефону или VÖEN',
    tr: 'Telefon veya VÖEN ile bul',
  },
  'directory.filter.q': {
    az: 'Ad',
    ru: 'Название',
    tr: 'Ünvan',
  },
  'directory.filter.q_placeholder': {
    az: 'Məsələn, Market',
    ru: 'Например, Маркет',
    tr: 'Örneğin, Market',
  },
  'directory.filter.region': {
    az: 'Şəhər / rayon',
    ru: 'Город / район',
    tr: 'Şehir / ilçe',
  },
  'directory.filter.region_default': {
    az: 'Xidmət bölgələrim',
    ru: 'Мои регионы обслуживания',
    tr: 'Hizmet bölgelerim',
  },
  'directory.filter.activity': {
    az: 'Fəaliyyət sahəsi',
    ru: 'Вид деятельности',
    tr: 'Faaliyet alanı',
  },
  'directory.filter.activity_all': {
    az: 'Hamısı',
    ru: 'Все',
    tr: 'Tümü',
  },
  'directory.filter.verified': {
    az: 'Yalnız təsdiqlənmiş',
    ru: 'Только подтверждённые',
    tr: 'Yalnızca doğrulanmış',
  },
  'directory.verified': {
    az: 'Təsdiqlənib',
    ru: 'Подтверждено',
    tr: 'Doğrulandı',
  },
  'directory.field.businessPhone': {
    az: 'Biznes telefonu',
    ru: 'Рабочий телефон',
    tr: 'İşletme telefonu',
  },
  'directory.field.personalPhone': {
    az: 'Şəxsi telefon',
    ru: 'Личный телефон',
    tr: 'Kişisel telefon',
  },
  'directory.field.email': {
    az: 'E-poçt',
    ru: 'Эл. почта',
    tr: 'E-posta',
  },
  'directory.field.voen': {
    az: 'VÖEN',
    ru: 'VÖEN',
    tr: 'VÖEN',
  },
  'directory.field.contactName': {
    az: 'Səlahiyyətli şəxs',
    ru: 'Контактное лицо',
    tr: 'Yetkili',
  },
  'directory.field.addressLine': {
    az: 'Ünvan',
    ru: 'Адрес',
    tr: 'Adres',
  },
  'directory.hidden_fields': {
    az: 'Digər məlumatları pərakəndəçi gizli saxlayıb.',
    ru: 'Остальные данные розничная точка скрыла.',
    tr: 'Diğer bilgileri perakendeci gizli tutuyor.',
  },
  'directory.more': {
    az: 'Daha çox',
    ru: 'Показать ещё',
    tr: 'Daha fazla',
  },
  'directory.loading': {
    az: 'Yüklənir…',
    ru: 'Загрузка…',
    tr: 'Yükleniyor…',
  },
  'directory.retry': {
    az: 'Yenidən cəhd et',
    ru: 'Повторить',
    tr: 'Yeniden dene',
  },
  'directory.rate_limited': {
    az: 'Çox sayda axtarış etdiniz. {seconds} saniyə sonra yenidən cəhd edin.',
    ru: 'Слишком много запросов. Повторите через {seconds} сек.',
    tr: 'Çok fazla arama yaptınız. {seconds} saniye sonra yeniden deneyin.',
  },
  'directory.empty.no_service_areas_title': {
    az: 'Xidmət bölgəsi seçilməyib',
    ru: 'Регионы обслуживания не выбраны',
    tr: 'Hizmet bölgesi seçilmemiş',
  },
  'directory.empty.no_service_areas': {
    az: 'Süzgəcsiz axtarış xidmət bölgələrinizdə aparılır. Əvvəlcə parametrlərdə bölgə əlavə edin və ya yuxarıda şəhər seçin.',
    ru: 'Поиск без фильтров идёт по вашим регионам обслуживания. Добавьте регион в настройках или выберите город выше.',
    tr: 'Filtresiz arama hizmet bölgelerinizde yapılır. Önce ayarlardan bölge ekleyin veya yukarıdan şehir seçin.',
  },
  'directory.empty.go_settings': {
    az: 'Parametrlərə keç',
    ru: 'Перейти в настройки',
    tr: 'Ayarlara git',
  },
  'directory.empty.no_regions_title': {
    az: 'Sizə bölgə təyin edilməyib',
    ru: 'Вам не назначены регионы',
    tr: 'Size bölge atanmamış',
  },
  'directory.empty.no_assigned_regions': {
    az: 'Dizin yalnız sizə təyin edilmiş bölgələri göstərir. İşletmə adminindən bölgə təyin etməsini xahiş edin.',
    ru: 'Каталог показывает только назначенные вам регионы. Попросите администратора назначить регион.',
    tr: 'Dizin yalnızca size atanmış bölgeleri gösterir. İşletme admininden bölge atamasını isteyin.',
  },
  'directory.empty.none_title': {
    az: 'Nəticə yoxdur',
    ru: 'Ничего не найдено',
    tr: 'Sonuç yok',
  },
  'directory.empty.none': {
    az: 'Süzgəcləri dəyişib yenidən yoxlayın.',
    ru: 'Измените фильтры и попробуйте снова.',
    tr: 'Filtreleri değiştirip yeniden deneyin.',
  },
  'directory.exact.label': {
    az: 'Tam telefon nömrəsi və ya VÖEN',
    ru: 'Полный номер телефона или VÖEN',
    tr: 'Tam telefon numarası veya VÖEN',
  },
  'directory.exact.hint': {
    az: 'Telefon +994 ilə, VÖEN 10 rəqəmlə. Dizində görünməyən pərakəndəçi də tapılır.',
    ru: 'Телефон с +994, VÖEN из 10 цифр. Находит и скрытые из каталога точки.',
    tr: 'Telefon +994 ile, VÖEN 10 haneyle. Dizinde görünmeyen perakendeci de bulunur.',
  },
  'directory.exact.invalid': {
    az: 'Tam nömrə (+994…) və ya 10 rəqəmli VÖEN yazın.',
    ru: 'Введите полный номер (+994…) или VÖEN из 10 цифр.',
    tr: 'Tam numara (+994…) veya 10 haneli VÖEN yazın.',
  },
  'directory.exact.submit': {
    az: 'Tap',
    ru: 'Найти',
    tr: 'Bul',
  },
  'directory.exact.none': {
    az: 'Bu nömrə və ya VÖEN ilə pərakəndəçi tapılmadı.',
    ru: 'Розничная точка с таким номером или VÖEN не найдена.',
    tr: 'Bu numara veya VÖEN ile perakendeci bulunamadı.',
  },
  'directory.mobile.back': {
    az: 'Geri',
    ru: 'Назад',
    tr: 'Geri',
  },
  'directory.mobile.search_placeholder': {
    az: 'Ad ilə axtar',
    ru: 'Поиск по названию',
    tr: 'Ünvana göre ara',
  },
  'directory.mobile.filters': {
    az: 'Süzgəclər',
    ru: 'Фильтры',
    tr: 'Filtreler',
  },
  'directory.mobile.apply': {
    az: 'Tətbiq et',
    ru: 'Применить',
    tr: 'Uygula',
  },
  'directory.mobile.clear': {
    az: 'Təmizlə',
    ru: 'Сбросить',
    tr: 'Temizle',
  },
  'connections.relation.pending': {
    az: 'Sorğu göndərilib · cavab gözlənilir',
    ru: 'Запрос отправлен · ожидается ответ',
    tr: 'İstek gönderildi · yanıt bekleniyor',
  },
  'connections.relation.active': {
    az: 'Bağlantı aktivdir',
    ru: 'Связь активна',
    tr: 'Bağlantı aktif',
  },
  'connections.relation.blocked': {
    az: 'Bu müəssisə sorğu qəbul etmir',
    ru: 'Это предприятие не принимает запросы',
    tr: 'Bu işletme istek kabul etmiyor',
  },
  'connections.relation.cooldown': {
    az: 'Yeni sorğu {date} tarixindən sonra göndərilə bilər',
    ru: 'Новый запрос можно отправить после {date}',
    tr: 'Yeni istek {date} tarihinden sonra gönderilebilir',
  },
  'connections.relation.unavailable': {
    az: 'Hazırda sorğu göndərilə bilməz',
    ru: 'Сейчас запрос отправить нельзя',
    tr: 'Şu anda istek gönderilemez',
  },
  'connections.send.open': {
    az: 'Bağlantı sorğusu göndər',
    ru: 'Отправить запрос на связь',
    tr: 'Bağlantı isteği gönder',
  },
  'connections.send.title': {
    az: 'Bağlantı sorğusu',
    ru: 'Запрос на связь',
    tr: 'Bağlantı isteği',
  },
  'connections.send.description': {
    az: 'Sorğu {name} müəssisəsinin adminlərinə bildiriş kimi gedəcək.',
    ru: 'Запрос придёт администраторам предприятия {name} в виде уведомления.',
    tr: 'İstek, {name} işletmesinin yöneticilerine bildirim olarak gidecek.',
  },
  'connections.send.message': {
    az: 'Mesaj (istəyə bağlı)',
    ru: 'Сообщение (необязательно)',
    tr: 'Mesaj (isteğe bağlı)',
  },
  'connections.send.message_placeholder': {
    az: 'Şirkətinizi qısa təqdim edin',
    ru: 'Кратко представьте вашу компанию',
    tr: 'Şirketinizi kısaca tanıtın',
  },
  'connections.send.message_count': {
    az: '{count} / {max}',
    ru: '{count} / {max}',
    tr: '{count} / {max}',
  },
  'connections.send.term': {
    az: 'Təklif olunan ödəniş möhləti, gün (istəyə bağlı)',
    ru: 'Предлагаемая отсрочка платежа, дней (необязательно)',
    tr: 'Önerilen ödeme vadesi, gün (isteğe bağlı)',
  },
  'connections.send.term_hint': {
    az: '0 ilə {max} gün arasında',
    ru: 'От 0 до {max} дней',
    tr: '0 ile {max} gün arası',
  },
  'connections.send.term_invalid': {
    az: '0 ilə {max} arasında tam ədəd yazın.',
    ru: 'Введите целое число от 0 до {max}.',
    tr: '0 ile {max} arasında tam sayı girin.',
  },
  'connections.send.submit': {
    az: 'Sorğunu göndər',
    ru: 'Отправить запрос',
    tr: 'İsteği gönder',
  },
  'connections.send.sending': {
    az: 'Göndərilir…',
    ru: 'Отправка…',
    tr: 'Gönderiliyor…',
  },
  'connections.send.close': {
    az: 'Bağla',
    ru: 'Закрыть',
    tr: 'Kapat',
  },
  'connections.send.success_title': {
    az: 'Sorğu göndərildi',
    ru: 'Запрос отправлен',
    tr: 'İstek gönderildi',
  },
  'connections.send.success_body': {
    az: '{name} cavab verənədək sorğunun vəziyyətini «Göndərilən sorğular» bölməsində izləyə bilərsiniz.',
    ru: 'Пока {name} не ответит, статус запроса можно отслеживать в разделе «Отправленные запросы».',
    tr: '{name} yanıt verene kadar isteğin durumunu «Gönderilen istekler» bölümünden izleyebilirsiniz.',
  },
  'connections.send.go_requests': {
    az: 'Sorğulara bax',
    ru: 'К запросам',
    tr: 'İsteklere git',
  },
  'connections.error.CONNECTION_REQUEST_ALREADY_PENDING': {
    az: 'Bu müəssisəyə artıq sorğu göndərilib, cavab gözlənilir.',
    ru: 'Этому предприятию уже отправлен запрос, ожидается ответ.',
    tr: 'Bu işletmeye zaten istek gönderildi, yanıt bekleniyor.',
  },
  'connections.error.CONNECTION_ALREADY_ACTIVE': {
    az: 'Bu müəssisə ilə artıq bağlısınız.',
    ru: 'Вы уже связаны с этим предприятием.',
    tr: 'Bu işletmeyle zaten bağlısınız.',
  },
  'connections.error.CONNECTION_BLOCKED': {
    az: 'Bu müəssisə sorğu qəbul etmir.',
    ru: 'Это предприятие не принимает запросы.',
    tr: 'Bu işletme istek kabul etmiyor.',
  },
  'connections.error.CONNECTION_COOLDOWN_ACTIVE': {
    az: 'Bu müəssisəyə yeni sorğunu {date} tarixindən sonra göndərə bilərsiniz.',
    ru: 'Новый запрос этому предприятию можно отправить после {date}.',
    tr: 'Bu işletmeye yeni isteği {date} tarihinden sonra gönderebilirsiniz.',
  },
  'connections.error.quota_hours': {
    az: 'Bugünkü sorğu limitiniz doldu. Yeni sorğunu {hours} saat {minutes} dəqiqə sonra göndərə bilərsiniz.',
    ru: 'Дневной лимит запросов исчерпан. Новый запрос можно отправить через {hours} ч {minutes} мин.',
    tr: 'Bugünkü istek sınırınız doldu. Yeni isteği {hours} saat {minutes} dakika sonra gönderebilirsiniz.',
  },
  'connections.error.quota_minutes': {
    az: 'Bugünkü sorğu limitiniz doldu. Yeni sorğunu {minutes} dəqiqə sonra göndərə bilərsiniz.',
    ru: 'Дневной лимит запросов исчерпан. Новый запрос можно отправить через {minutes} мин.',
    tr: 'Bugünkü istek sınırınız doldu. Yeni isteği {minutes} dakika sonra gönderebilirsiniz.',
  },
  'connections.error.SUBSCRIPTION_READ_ONLY': {
    az: 'Abunəliyiniz yalnız oxuma rejimindədir. Sorğu göndərmək üçün abunəliyi yeniləyin.',
    ru: 'Подписка в режиме только для чтения. Чтобы отправлять запросы, продлите подписку.',
    tr: 'Aboneliğiniz yalnızca okuma modunda. İstek göndermek için aboneliği yenileyin.',
  },
  'connections.error.NOT_FOUND': {
    az: 'Bu müəssisə hazırda sorğu qəbul edə bilmir.',
    ru: 'Сейчас это предприятие не может принимать запросы.',
    tr: 'Bu işletme şu anda istek alamıyor.',
  },
  'connections.status.pending': {
    az: 'Gözləyir',
    ru: 'Ожидает',
    tr: 'Bekliyor',
  },
  'connections.status.accepted': {
    az: 'Qəbul edildi',
    ru: 'Принят',
    tr: 'Kabul edildi',
  },
  'connections.status.rejected': {
    az: 'Rədd edildi',
    ru: 'Отклонён',
    tr: 'Reddedildi',
  },
  'connections.status.expired': {
    az: 'Müddəti bitdi',
    ru: 'Истёк',
    tr: 'Süresi doldu',
  },
  'connections.status.withdrawn': {
    az: 'Geri çəkildi',
    ru: 'Отозван',
    tr: 'Geri çekildi',
  },
  'connections.outgoing.title': {
    az: 'Göndərilən sorğular',
    ru: 'Отправленные запросы',
    tr: 'Gönderilen istekler',
  },
  'connections.outgoing.description': {
    az: 'Pərakəndəçilərə göndərdiyiniz bağlantı sorğuları, yenidən köhnəyə.',
    ru: 'Запросы на связь, отправленные розничным точкам, от новых к старым.',
    tr: 'Perakendecilere gönderdiğiniz bağlantı istekleri, yeniden eskiye.',
  },
  'connections.outgoing.filter_label': {
    az: 'Vəziyyət',
    ru: 'Статус',
    tr: 'Durum',
  },
  'connections.outgoing.filter_all': {
    az: 'Hamısı',
    ru: 'Все',
    tr: 'Tümü',
  },
  'connections.outgoing.sent_at': {
    az: 'Göndərilib: {date}',
    ru: 'Отправлен: {date}',
    tr: 'Gönderildi: {date}',
  },
  'connections.outgoing.expires_at': {
    az: 'Cavab üçün son tarix: {date}',
    ru: 'Ответить до: {date}',
    tr: 'Son yanıt tarihi: {date}',
  },
  'connections.outgoing.term': {
    az: 'Təklif olunan möhlət: {days} gün',
    ru: 'Предложенная отсрочка: {days} дн.',
    tr: 'Önerilen vade: {days} gün',
  },
  'connections.outgoing.closed_business': {
    az: 'Müəssisə artıq sorğu qəbul etmir',
    ru: 'Предприятие больше не принимает запросы',
    tr: 'İşletme artık istek almıyor',
  },
  'connections.outgoing.empty_title': {
    az: 'Hələ sorğu yoxdur',
    ru: 'Запросов пока нет',
    tr: 'Henüz istek yok',
  },
  'connections.outgoing.empty': {
    az: 'Dizində pərakəndəçi tapın və bağlantı sorğusu göndərin.',
    ru: 'Найдите розничную точку в каталоге и отправьте запрос на связь.',
    tr: 'Dizinde perakendeci bulun ve bağlantı isteği gönderin.',
  },
  'connections.outgoing.empty_filtered': {
    az: 'Bu vəziyyətdə sorğu yoxdur.',
    ru: 'Запросов с таким статусом нет.',
    tr: 'Bu durumda istek yok.',
  },
  'connections.outgoing.go_directory': {
    az: 'Pərakəndəçi tap',
    ru: 'Найти розничную точку',
    tr: 'Perakendeci bul',
  },
  'connections.outgoing.more': {
    az: 'Daha çox',
    ru: 'Показать ещё',
    tr: 'Daha fazla',
  },
  'connections.outgoing.loading': {
    az: 'Yüklənir…',
    ru: 'Загрузка…',
    tr: 'Yükleniyor…',
  },
  'connections.outgoing.retry': {
    az: 'Yenidən cəhd et',
    ru: 'Повторить',
    tr: 'Yeniden dene',
  },
  'connections.outgoing.no_access': {
    az: 'Bu səhifəni görmək üçün icazəniz yoxdur.',
    ru: 'У вас нет доступа к этой странице.',
    tr: 'Bu sayfayı görme izniniz yok.',
  },
  'connections.mobile.back': {
    az: 'Geri',
    ru: 'Назад',
    tr: 'Geri',
  },
  // F2.13b: gelen istekler, bloklananlar, onay pencereleri, geri çekme.
  'connections.error.IDEMPOTENCY_CONFLICT': {
    az: 'Sorğu artıq göndərilmiş ola bilər. Sorğular siyahısını yoxlayın.',
    ru: 'Запрос, возможно, уже отправлен. Проверьте список запросов.',
    tr: 'İstek zaten gönderilmiş olabilir. İstekler listesini kontrol edin.',
  },
  'connections.respond_error.CONNECTION_REQUEST_EXPIRED': {
    az: 'Bu sorğunun müddəti bitib. Siyahı yeniləndi.',
    ru: 'Срок действия этого запроса истёк. Список обновлён.',
    tr: 'Bu isteğin süresi doldu. Liste yenilendi.',
  },
  'connections.respond_error.INVALID_STATE_TRANSITION': {
    az: 'Bu sorğu artıq cavablandırılıb və ya geri çəkilib. Siyahı yeniləndi.',
    ru: 'На этот запрос уже ответили или он отозван. Список обновлён.',
    tr: 'Bu istek zaten yanıtlandı ya da geri çekildi. Liste yenilendi.',
  },
  'connections.respond_error.CONNECTION_ALREADY_ACTIVE': {
    az: 'Bu topdançı ilə artıq aktiv bağlantınız var.',
    ru: 'С этим поставщиком уже есть активная связь.',
    tr: 'Bu toptancıyla zaten aktif bağlantınız var.',
  },
  'connections.respond_error.NOT_FOUND': {
    az: 'Sorğu tapılmadı və ya artıq sizə aid deyil. Siyahı yeniləndi.',
    ru: 'Запрос не найден или больше вам недоступен. Список обновлён.',
    tr: 'İstek bulunamadı ya da artık size ait değil. Liste yenilendi.',
  },
  'connections.incoming.title': {
    az: 'Gələn sorğular',
    ru: 'Входящие запросы',
    tr: 'Gelen istekler',
  },
  'connections.incoming.description': {
    az: 'Sizinlə işləmək istəyən topdançılar. Qəbul etdikdən sonra onların məhsullarını görəcəksiniz.',
    ru: 'Поставщики, которые хотят с вами работать. После принятия вы увидите их товары.',
    tr: 'Sizinle çalışmak isteyen toptancılar. Kabul ettikten sonra ürünlerini göreceksiniz.',
  },
  'connections.incoming.tabs_label': {
    az: 'Sorğu bölmələri',
    ru: 'Разделы запросов',
    tr: 'İstek bölümleri',
  },
  'connections.incoming.tab_incoming': {
    az: 'Gələn sorğular',
    ru: 'Входящие',
    tr: 'Gelen istekler',
  },
  'connections.incoming.tab_blocked': {
    az: 'Bloklananlar',
    ru: 'Заблокированные',
    tr: 'Engellenenler',
  },
  'connections.incoming.no_description': {
    az: 'Topdançı tanıtım mətni əlavə etməyib.',
    ru: 'Поставщик не добавил описание.',
    tr: 'Toptancı tanıtım metni eklememiş.',
  },
  'connections.incoming.message': {
    az: 'Mesaj',
    ru: 'Сообщение',
    tr: 'Mesaj',
  },
  'connections.incoming.term': {
    az: 'Təklif olunan ödəniş müddəti:',
    ru: 'Предложенная отсрочка:',
    tr: 'Önerilen vade:',
  },
  'connections.incoming.term_none': {
    az: 'göstərilməyib',
    ru: 'не указана',
    tr: 'belirtilmemiş',
  },
  'connections.incoming.term_days': {
    az: '{days} gün',
    ru: '{days} дн.',
    tr: '{days} gün',
  },
  'connections.incoming.expires': {
    az: 'Son cavab tarixi:',
    ru: 'Ответить до:',
    tr: 'Son yanıt tarihi:',
  },
  'connections.incoming.accept': {
    az: 'Qəbul et',
    ru: 'Принять',
    tr: 'Kabul et',
  },
  'connections.incoming.reject': {
    az: 'Rədd et',
    ru: 'Отклонить',
    tr: 'Reddet',
  },
  'connections.incoming.block': {
    az: 'Blokla',
    ru: 'Заблокировать',
    tr: 'Engelle',
  },
  'connections.incoming.empty_title': {
    az: 'Gözləyən sorğu yoxdur',
    ru: 'Нет ожидающих запросов',
    tr: 'Bekleyen istek yok',
  },
  'connections.incoming.empty': {
    az: 'Topdançı sizə bağlantı sorğusu göndərəndə burada görünəcək.',
    ru: 'Когда поставщик отправит вам запрос на связь, он появится здесь.',
    tr: 'Bir toptancı size bağlantı isteği gönderdiğinde burada görünür.',
  },
  'connections.blocked.empty_title': {
    az: 'Bloklanan topdançı yoxdur',
    ru: 'Нет заблокированных поставщиков',
    tr: 'Engellenen toptancı yok',
  },
  'connections.blocked.empty': {
    az: 'Blokladığınız topdançılar sizə sorğu göndərə bilmir və burada görünür.',
    ru: 'Заблокированные поставщики не могут отправлять вам запросы и отображаются здесь.',
    tr: 'Engellediğiniz toptancılar size istek gönderemez ve burada görünür.',
  },
  'connections.blocked.since': {
    az: '{date} tarixindən bloklanıb',
    ru: 'Заблокирован с {date}',
    tr: '{date} tarihinden beri engelli',
  },
  'connections.blocked.unblock': {
    az: 'Bloku götür',
    ru: 'Разблокировать',
    tr: 'Engeli kaldır',
  },
  'connections.outgoing.withdraw': {
    az: 'Geri çək',
    ru: 'Отозвать',
    tr: 'Geri çek',
  },
  'connections.confirm.cancel': {
    az: 'Bağla',
    ru: 'Закрыть',
    tr: 'Kapat',
  },
  'connections.confirm.working': {
    az: 'Göndərilir…',
    ru: 'Отправка…',
    tr: 'Gönderiliyor…',
  },
  'connections.confirm.accept.eyebrow': {
    az: 'Sorğunu qəbul et',
    ru: 'Принять запрос',
    tr: 'İsteği kabul et',
  },
  'connections.confirm.accept.title': {
    az: '{name} ilə bağlantı qurulsun?',
    ru: 'Установить связь с {name}?',
    tr: '{name} ile bağlantı kurulsun mu?',
  },
  'connections.confirm.accept.point_1': {
    az: 'Bu topdançı çatdırılma və əlaqə məlumatlarınızı görəcək.',
    ru: 'Этот поставщик увидит ваши данные доставки и контакты.',
    tr: 'Bu toptancı teslimat ve iletişim bilgilerinizi görecek.',
  },
  'connections.confirm.accept.point_2': {
    az: 'Siz onun məhsullarını və sizə təyin etdiyi qiymətləri görəcəksiniz.',
    ru: 'Вы увидите его товары и назначенные вам цены.',
    tr: 'Onun ürünlerini ve size atadığı fiyatları göreceksiniz.',
  },
  'connections.confirm.accept.point_3': {
    az: 'Bağlantını istənilən vaxt bitirə və ya topdançını bloklaya bilərsiniz.',
    ru: 'Вы можете в любой момент прекратить связь или заблокировать поставщика.',
    tr: 'Bağlantıyı istediğiniz zaman bitirebilir ya da toptancıyı engelleyebilirsiniz.',
  },
  'connections.confirm.accept.submit': {
    az: 'Razıyam, qəbul et',
    ru: 'Согласен, принять',
    tr: 'Onaylıyorum, kabul et',
  },
  'connections.confirm.reject.eyebrow': {
    az: 'Sorğunu rədd et',
    ru: 'Отклонить запрос',
    tr: 'İsteği reddet',
  },
  'connections.confirm.reject.title': {
    az: '{name} sorğusu rədd edilsin?',
    ru: 'Отклонить запрос от {name}?',
    tr: '{name} isteği reddedilsin mi?',
  },
  'connections.confirm.reject.point_1': {
    az: 'Sorğu siyahınızdan çıxacaq; topdançıya bildiriş gedəcək.',
    ru: 'Запрос исчезнет из списка; поставщик получит уведомление.',
    tr: 'İstek listenizden kalkar; toptancıya bildirim gider.',
  },
  'connections.confirm.reject.point_2': {
    az: 'Topdançı bir müddət sizə yeni sorğu göndərə bilməyəcək.',
    ru: 'Некоторое время поставщик не сможет отправить вам новый запрос.',
    tr: 'Toptancı bir süre size yeni istek gönderemez.',
  },
  'connections.confirm.reject.submit': {
    az: 'Rədd et',
    ru: 'Отклонить',
    tr: 'Reddet',
  },
  'connections.confirm.block.eyebrow': {
    az: 'Topdançını blokla',
    ru: 'Заблокировать поставщика',
    tr: 'Toptancıyı engelle',
  },
  'connections.confirm.block.title': {
    az: '{name} bloklansın?',
    ru: 'Заблокировать {name}?',
    tr: '{name} engellensin mi?',
  },
  'connections.confirm.block.point_1': {
    az: 'Gözləyən sorğusu rədd ediləcək.',
    ru: 'Ожидающий запрос будет отклонён.',
    tr: 'Bekleyen isteği reddedilir.',
  },
  'connections.confirm.block.point_2': {
    az: 'Aktiv bağlantı varsa bitəcək.',
    ru: 'Активная связь, если есть, будет завершена.',
    tr: 'Aktif bağlantı varsa sona erer.',
  },
  'connections.confirm.block.point_3': {
    az: 'Bloku götürənə qədər sizə sorğu göndərə bilməyəcək.',
    ru: 'Пока вы не снимете блокировку, он не сможет отправлять вам запросы.',
    tr: 'Engeli kaldırana kadar size istek gönderemez.',
  },
  'connections.confirm.block.submit': {
    az: 'Blokla',
    ru: 'Заблокировать',
    tr: 'Engelle',
  },
  'connections.confirm.unblock.eyebrow': {
    az: 'Bloku götür',
    ru: 'Снять блокировку',
    tr: 'Engeli kaldır',
  },
  'connections.confirm.unblock.title': {
    az: '{name} üçün blok götürülsün?',
    ru: 'Разблокировать {name}?',
    tr: '{name} için engel kaldırılsın mı?',
  },
  'connections.confirm.unblock.point_1': {
    az: 'Topdançı yenidən sizə sorğu göndərə biləcək (gözləmə müddəti qaydaları ilə).',
    ru: 'Поставщик снова сможет отправлять вам запросы (с учётом периода ожидания).',
    tr: 'Toptancı size yeniden istek gönderebilir (bekleme süresi kurallarıyla).',
  },
  'connections.confirm.unblock.submit': {
    az: 'Bloku götür',
    ru: 'Разблокировать',
    tr: 'Engeli kaldır',
  },
  'connections.confirm.withdraw.eyebrow': {
    az: 'Sorğunu geri çək',
    ru: 'Отозвать запрос',
    tr: 'İsteği geri çek',
  },
  'connections.confirm.withdraw.title': {
    az: '{name} üçün sorğu geri çəkilsin?',
    ru: 'Отозвать запрос для {name}?',
    tr: '{name} için istek geri çekilsin mi?',
  },
  'connections.confirm.withdraw.point_1': {
    az: 'Sorğu pərakəndəçinin siyahısından çıxacaq. İstəsəniz sonra yenidən göndərə bilərsiniz.',
    ru: 'Запрос исчезнет у розничной точки. При желании вы сможете отправить его снова.',
    tr: 'İstek perakendecinin listesinden kalkar. İsterseniz sonra yeniden gönderebilirsiniz.',
  },
  'connections.confirm.withdraw.submit': {
    az: 'Geri çək',
    ru: 'Отозвать',
    tr: 'Geri çek',
  },
  'customers.title': {
    az: 'Müştərilərim',
    ru: 'Мои клиенты',
    tr: 'Müşterilerim',
  },
  'customers.description': {
    az: 'Bağlı pərakəndəçilər və onların şərtləri: kredit limiti, ödəniş müddəti və təmsilçi.',
    ru: 'Подключённые розничные точки и их условия: кредитный лимит, отсрочка платежа и представитель.',
    tr: 'Bağlı perakendeciler ve koşulları: kredi limiti, ödeme vadesi ve temsilci.',
  },
  'customers.tabs_label': {
    az: 'Bağlantı vəziyyəti',
    ru: 'Статус связи',
    tr: 'Bağlantı durumu',
  },
  'customers.tab.active': {
    az: 'Aktiv',
    ru: 'Активные',
    tr: 'Aktif',
  },
  'customers.tab.cancelled': {
    az: 'Ləğv edilib',
    ru: 'Отменённые',
    tr: 'İptal edilmiş',
  },
  'customers.no_access': {
    az: 'Müştəriləri görmək üçün icazəniz yoxdur.',
    ru: 'У вас нет доступа к списку клиентов.',
    tr: 'Müşterileri görme izniniz yok.',
  },
  'customers.go_directory': {
    az: 'Pərakəndəçi tap',
    ru: 'Найти розничную точку',
    tr: 'Perakendeci bul',
  },
  'customers.retry': {
    az: 'Yenidən cəhd et',
    ru: 'Повторить',
    tr: 'Yeniden dene',
  },
  'customers.empty_title': {
    az: 'Hələ müştəri yoxdur',
    ru: 'Клиентов пока нет',
    tr: 'Henüz müşteri yok',
  },
  'customers.empty_active': {
    az: 'Pərakəndəçi sorğunuzu qəbul edəndə burada görünəcək.',
    ru: 'Розничная точка появится здесь, когда примет ваш запрос.',
    tr: 'Perakendeci isteğinizi kabul edince burada görünür.',
  },
  'customers.empty_cancelled': {
    az: 'Ləğv edilmiş bağlantı yoxdur.',
    ru: 'Отменённых связей нет.',
    tr: 'İptal edilmiş bağlantı yok.',
  },
  'customers.loading': {
    az: 'Yüklənir…',
    ru: 'Загрузка…',
    tr: 'Yükleniyor…',
  },
  'customers.more': {
    az: 'Daha çox göstər',
    ru: 'Показать ещё',
    tr: 'Daha fazla göster',
  },
  'customers.closed_business': {
    az: 'Bağlanmış müəssisə',
    ru: 'Закрытое предприятие',
    tr: 'Kapanmış işletme',
  },
  'customers.row.not_assigned': {
    az: 'Şərtlər təyin edilməyib',
    ru: 'Условия не назначены',
    tr: 'Koşul atanmadı',
  },
  'customers.row.cancelled': {
    az: 'Ləğv edilib',
    ru: 'Отменена',
    tr: 'İptal edildi',
  },
  'customers.row.since': {
    az: '{date} tarixindən bağlıdır',
    ru: 'Связь с {date}',
    tr: '{date} tarihinden beri bağlı',
  },
  'customers.row.ended': {
    az: 'ləğv: {date}',
    ru: 'отменена: {date}',
    tr: 'iptal: {date}',
  },
  'customers.row.default_price_list': {
    az: 'Standart qiymət siyahınız tətbiq olunur.',
    ru: 'Действует ваш стандартный прайс-лист.',
    tr: 'Varsayılan fiyat listeniz geçerli.',
  },
  'customers.row.credit_limit': {
    az: 'Kredit limiti',
    ru: 'Кредитный лимит',
    tr: 'Kredi limiti',
  },
  'customers.row.no_limit': {
    az: 'Limitsiz',
    ru: 'Без лимита',
    tr: 'Limitsiz',
  },
  'customers.row.payment_term': {
    az: 'Ödəniş müddəti',
    ru: 'Отсрочка',
    tr: 'Ödeme vadesi',
  },
  'customers.row.days': {
    az: '{days} gün',
    ru: '{days} дн.',
    tr: '{days} gün',
  },
  'customers.row.sales_rep': {
    az: 'Təmsilçi',
    ru: 'Представитель',
    tr: 'Temsilci',
  },
  'customers.row.no_rep': {
    az: 'Yoxdur',
    ru: 'Нет',
    tr: 'Yok',
  },
  'customers.row.rep_unknown': {
    az: 'Təyin edilib',
    ru: 'Назначен',
    tr: 'Atandı',
  },
  'customers.row.assign': {
    az: 'Şərtləri təyin et',
    ru: 'Назначить условия',
    tr: 'Koşulları ata',
  },
  'customers.row.edit': {
    az: 'Şərtləri dəyiş',
    ru: 'Изменить условия',
    tr: 'Koşulları değiştir',
  },
  'customers.terms.title': {
    az: 'Bağlantı şərtləri',
    ru: 'Условия связи',
    tr: 'Bağlantı koşulları',
  },
  'customers.terms.description': {
    az: 'Şərtləri yalnız siz dəyişə bilərsiniz; pərakəndəçi kredit limitini və ödəniş müddətini görür.',
    ru: 'Условия можете менять только вы; розничная точка видит кредитный лимит и отсрочку.',
    tr: 'Koşulları yalnız siz değiştirebilirsiniz; perakendeci kredi limitini ve ödeme vadesini görür.',
  },
  'customers.terms.suggested_previous_connection': {
    az: 'Əvvəlki bağlantının şərtləri təklif olunur. Yoxlayın və yadda saxlayın.',
    ru: 'Предложены условия прошлой связи. Проверьте и сохраните.',
    tr: 'Önceki bağlantının koşulları öneriliyor. Kontrol edip kaydedin.',
  },
  'customers.terms.suggested_request': {
    az: 'Sorğuda təklif etdiyiniz ödəniş müddəti doldurulub. Yoxlayın və yadda saxlayın.',
    ru: 'Подставлена отсрочка из вашего запроса. Проверьте и сохраните.',
    tr: 'İstekte önerdiğiniz ödeme vadesi dolduruldu. Kontrol edip kaydedin.',
  },
  'customers.terms.credit_limit': {
    az: 'Kredit limiti (AZN)',
    ru: 'Кредитный лимит (AZN)',
    tr: 'Kredi limiti (AZN)',
  },
  'customers.terms.credit_limit_hint': {
    az: 'Boş qalsa limitsiz. Hələlik yalnız xəbərdarlıq üçündür.',
    ru: 'Пусто — без лимита. Пока только для предупреждения.',
    tr: 'Boş bırakılırsa limitsiz. Şimdilik yalnız uyarı amaçlı.',
  },
  'customers.terms.credit_limit_invalid': {
    az: 'Məbləğ mənfi olmamalı, ən çox 2 onluq rəqəm.',
    ru: 'Сумма должна быть неотрицательной, не более 2 знаков после запятой.',
    tr: 'Tutar negatif olamaz, en çok 2 ondalık.',
  },
  'customers.terms.credit_limit_placeholder': {
    az: 'Məs. 5000',
    ru: 'Напр. 5000',
    tr: 'Ör. 5000',
  },
  'customers.terms.payment_term': {
    az: 'Ödəniş müddəti (gün)',
    ru: 'Отсрочка (дней)',
    tr: 'Ödeme vadesi (gün)',
  },
  'customers.terms.payment_term_hint': {
    az: '0–{max} gün',
    ru: '0–{max} дней',
    tr: '0–{max} gün',
  },
  'customers.terms.payment_term_invalid': {
    az: '0 ilə {max} arasında tam ədəd daxil edin.',
    ru: 'Введите целое число от 0 до {max}.',
    tr: '0 ile {max} arasında tam sayı girin.',
  },
  'customers.terms.sales_rep': {
    az: 'Məsul təmsilçi',
    ru: 'Ответственный представитель',
    tr: 'Sorumlu temsilci',
  },
  'customers.terms.sales_rep_hint': {
    az: 'Satış nümayəndəsi rolundakı aktiv üzvlər.',
    ru: 'Активные участники с ролью торгового представителя.',
    tr: 'Satış temsilcisi rolündeki aktif üyeler.',
  },
  'customers.terms.sales_rep_unavailable': {
    az: 'Komanda siyahısı yüklənmədi.',
    ru: 'Не удалось загрузить список команды.',
    tr: 'Ekip listesi yüklenemedi.',
  },
  'customers.terms.sales_rep_none': {
    az: 'Təyin edilməyib',
    ru: 'Не назначен',
    tr: 'Atanmadı',
  },
  'customers.terms.price_list_note': {
    az: 'Qiymət siyahısı təyin etmək kataloq hazır olanda açılacaq; indi standart siyahınız tətbiq olunur.',
    ru: 'Назначение прайс-листа появится вместе с каталогом; сейчас действует стандартный.',
    tr: 'Fiyat listesi atama katalogla birlikte açılacak; şimdilik varsayılan listeniz geçerli.',
  },
  'customers.terms.cancel': {
    az: 'Bağla',
    ru: 'Закрыть',
    tr: 'Kapat',
  },
  'customers.terms.save': {
    az: 'Yadda saxla',
    ru: 'Сохранить',
    tr: 'Kaydet',
  },
  'customers.terms.saving': {
    az: 'Saxlanılır…',
    ru: 'Сохранение…',
    tr: 'Kaydediliyor…',
  },
  'customers.error.cancelled': {
    az: 'Bu bağlantı artıq ləğv edilib; şərtlər dəyişdirilə bilməz.',
    ru: 'Эта связь уже отменена; условия изменить нельзя.',
    tr: 'Bu bağlantı iptal edilmiş; koşullar değiştirilemez.',
  },
  'customers.error.not_found': {
    az: 'Bağlantı tapılmadı. Siyahını yeniləyin.',
    ru: 'Связь не найдена. Обновите список.',
    tr: 'Bağlantı bulunamadı. Listeyi yenileyin.',
  },
  'customers.error.invalid_sales_rep': {
    az: 'Seçilən təmsilçi artıq komandanızda deyil.',
    ru: 'Выбранный представитель больше не в вашей команде.',
    tr: 'Seçilen temsilci artık ekibinizde değil.',
  },
  // F2.15b: bağlantı iptali penceresi, perakendeci toptancılarım ekranı.
  'customers.row.cancel': {
    az: 'Əlaqəni ləğv et',
    ru: 'Отменить связь',
    tr: 'Bağlantıyı iptal et',
  },
  'customers.row.ended_by_you': {
    az: 'Siz ləğv etmisiniz',
    ru: 'Отменено вами',
    tr: 'Siz iptal ettiniz',
  },
  'customers.row.ended_by_other': {
    az: 'Qarşı tərəf ləğv edib',
    ru: 'Отменено другой стороной',
    tr: 'Karşı taraf iptal etti',
  },
  // F2.18 (US-016 AC2): perakendecinin hesabı platformca kapatıldı (`endedBySide = platform`).
  'customers.row.ended_by_platform': {
    az: 'Pərakəndəçinin hesabı bağlandığı üçün əlaqə sona çatıb',
    ru: 'Связь завершена, так как аккаунт розничного покупателя закрыт',
    tr: 'Perakendecinin hesabı kapatıldığı için bağlantı sona erdi',
  },
  'suppliers.title': {
    az: 'Topdançılarım',
    ru: 'Мои поставщики',
    tr: 'Toptancılarım',
  },
  'suppliers.description': {
    az: 'Əlaqədə olduğunuz topdançılar, kredit limiti və ödəniş müddəti.',
    ru: 'Поставщики, с которыми у вас есть связь, кредитный лимит и срок оплаты.',
    tr: 'Bağlı olduğunuz toptancılar, kredi limiti ve ödeme vadesi.',
  },
  'suppliers.no_access': {
    az: 'Bu səhifəyə baxmaq üçün icazəniz yoxdur.',
    ru: 'У вас нет доступа к этой странице.',
    tr: 'Bu sayfayı görme izniniz yok.',
  },
  'suppliers.empty_title': {
    az: 'Hələ topdançı yoxdur',
    ru: 'Поставщиков пока нет',
    tr: 'Henüz toptancı yok',
  },
  'suppliers.empty_active': {
    az: 'Topdançının əlaqə sorğusunu qəbul etdikdə burada görünəcək.',
    ru: 'Поставщик появится здесь, когда вы примете его запрос на связь.',
    tr: 'Bir toptancının bağlantı isteğini kabul edince burada görünür.',
  },
  'suppliers.empty_cancelled': {
    az: 'Ləğv edilmiş əlaqə yoxdur.',
    ru: 'Отменённых связей нет.',
    tr: 'İptal edilmiş bağlantı yok.',
  },
  'connections.cancel.eyebrow': {
    az: 'Əlaqəni ləğv et',
    ru: 'Отмена связи',
    tr: 'Bağlantıyı iptal et',
  },
  'connections.cancel.title': {
    az: '{name} ilə əlaqə ləğv edilsin?',
    ru: 'Отменить связь с {name}?',
    tr: '{name} ile bağlantı iptal edilsin mi?',
  },
  'connections.cancel.point_1': {
    az: 'Əlaqə dərhal bağlanır və geri qaytarılmır. Yenidən işləmək üçün topdançı yeni sorğu göndərməlidir.',
    ru: 'Связь закрывается сразу и не восстанавливается. Для новой работы поставщик должен отправить новый запрос.',
    tr: 'Bağlantı hemen kapanır ve geri alınamaz. Yeniden çalışmak için toptancının yeni istek göndermesi gerekir.',
  },
  'connections.cancel.point_2_buyer': {
    az: 'Ləğvdən sonra {name} bir müddət sizə yeni sorğu göndərə bilməz.',
    ru: 'После отмены {name} некоторое время не сможет отправить вам новый запрос.',
    tr: 'İptalden sonra {name} bir süre size yeni istek gönderemez.',
  },
  'connections.cancel.point_2_seller': {
    az: 'Gözləmə müddəti yoxdur: istədiyiniz vaxt yeni sorğu göndərə bilərsiniz.',
    ru: 'Срока ожидания нет: вы можете отправить новый запрос в любое время.',
    tr: 'Bekleme süresi yok: istediğiniz zaman yeni istek gönderebilirsiniz.',
  },
  'connections.cancel.point_3': {
    az: '{name} adminlərinə bildiriş gedir. Səbəb və qeyd onlara göstərilmir.',
    ru: 'Администраторы {name} получат уведомление. Причина и комментарий им не показываются.',
    tr: '{name} adminlerine bildirim gider. Gerekçe ve not onlara gösterilmez.',
  },
  'connections.cancel.reason_label': {
    az: 'Səbəb',
    ru: 'Причина',
    tr: 'Gerekçe',
  },
  'connections.cancel.reason.no_longer_working': {
    az: 'Artıq birlikdə işləmirik',
    ru: 'Больше не сотрудничаем',
    tr: 'Artık birlikte çalışmıyoruz',
  },
  'connections.cancel.reason.payment_issue': {
    az: 'Ödəniş problemi',
    ru: 'Проблема с оплатой',
    tr: 'Ödeme sorunu',
  },
  'connections.cancel.reason.quality_issue': {
    az: 'Keyfiyyət problemi',
    ru: 'Проблема с качеством',
    tr: 'Kalite sorunu',
  },
  'connections.cancel.reason.other': {
    az: 'Digər',
    ru: 'Другое',
    tr: 'Diğer',
  },
  'connections.cancel.note_label': {
    az: 'Qeyd (istəyə bağlı)',
    ru: 'Комментарий (необязательно)',
    tr: 'Not (isteğe bağlı)',
  },
  'connections.cancel.note_placeholder': {
    az: 'Daxili qeyd',
    ru: 'Внутренний комментарий',
    tr: 'İç not',
  },
  'connections.cancel.note_counter': {
    az: '{count} / {max}',
    ru: '{count} / {max}',
    tr: '{count} / {max}',
  },
  'connections.cancel.note_hint': {
    az: 'Qeyd yalnız biznesinizin audit jurnalında saxlanılır.',
    ru: 'Комментарий сохраняется только в журнале аудита вашей компании.',
    tr: 'Not yalnız işletmenizin denetim kaydında tutulur.',
  },
  'connections.cancel.confirm_label': {
    az: '{name} ilə əlaqənin ləğv edildiyini və bunun geri qaytarılmadığını təsdiq edirəm.',
    ru: 'Подтверждаю отмену связи с {name}; это действие необратимо.',
    tr: '{name} ile bağlantının iptal edildiğini ve bunun geri alınamadığını onaylıyorum.',
  },
  'connections.cancel.close': {
    az: 'Bağla',
    ru: 'Закрыть',
    tr: 'Kapat',
  },
  'connections.cancel.submit': {
    az: 'Ləğv et',
    ru: 'Отменить связь',
    tr: 'İptal et',
  },
  'connections.cancel.working': {
    az: 'Ləğv edilir…',
    ru: 'Отмена…',
    tr: 'İptal ediliyor…',
  },
  'connections.cancel.error.INVALID_STATE_TRANSITION': {
    az: 'Bu əlaqə artıq ləğv edilib. Siyahı yeniləndi.',
    ru: 'Эта связь уже отменена. Список обновлён.',
    tr: 'Bu bağlantı zaten iptal edilmiş. Liste yenilendi.',
  },
  'connections.cancel.error.NOT_FOUND': {
    az: 'Əlaqə tapılmadı. Siyahı yeniləndi.',
    ru: 'Связь не найдена. Список обновлён.',
    tr: 'Bağlantı bulunamadı. Liste yenilendi.',
  },
  'shell.menu.branches': {
    az: 'Filiallar',
    ru: 'Филиалы',
    tr: 'Şubeler',
  },
  'branches.title': {
    az: 'Filiallar',
    ru: 'Филиалы',
    tr: 'Şubeler',
  },
  'branches.description': {
    az: 'Filiallarınızı, ünvanlarını və hər filialın sifariş təsdiqi qaydasını idarə edin.',
    ru: 'Управляйте филиалами, их адресами и правилом согласования заказов для каждого филиала.',
    tr: 'Şubelerinizi, adreslerini ve her şubenin sipariş onay kuralını yönetin.',
  },
  'branches.new': {
    az: 'Yeni filial',
    ru: 'Новый филиал',
    tr: 'Yeni şube',
  },
  'branches.new_title': {
    az: 'Yeni filial',
    ru: 'Новый филиал',
    tr: 'Yeni şube',
  },
  'branches.new_hint': {
    az: 'Ad, region, ünvan və təsdiq qaydası mütləqdir; yer isteğe bağlıdır.',
    ru: 'Название, регион, адрес и правило согласования обязательны; координаты — по желанию.',
    tr: 'Ad, bölge, adres ve onay kuralı zorunlu; konum isteğe bağlı.',
  },
  'branches.add': {
    az: 'Filial əlavə et',
    ru: 'Добавить филиал',
    tr: 'Şube ekle',
  },
  'branches.save': {
    az: 'Yadda saxla',
    ru: 'Сохранить',
    tr: 'Kaydet',
  },
  'branches.cancel': {
    az: 'Ləğv et',
    ru: 'Отмена',
    tr: 'Vazgeç',
  },
  'branches.saved': {
    az: 'Yadda saxlanıldı.',
    ru: 'Сохранено.',
    tr: 'Kaydedildi.',
  },
  'branches.loading': {
    az: 'Yüklənir…',
    ru: 'Загрузка…',
    tr: 'Yükleniyor…',
  },
  'branches.load_failed': {
    az: 'Filiallar yüklənmədi.',
    ru: 'Не удалось загрузить филиалы.',
    tr: 'Şubeler yüklenemedi.',
  },
  'branches.retry': {
    az: 'Yenidən cəhd et',
    ru: 'Повторить',
    tr: 'Tekrar dene',
  },
  'branches.list_title': {
    az: 'Filiallarınız',
    ru: 'Ваши филиалы',
    tr: 'Şubeleriniz',
  },
  'branches.count': {
    az: '{count} filial',
    ru: 'Филиалов: {count}',
    tr: '{count} şube',
  },
  'branches.empty': {
    az: 'Hələ filial yoxdur',
    ru: 'Филиалов пока нет',
    tr: 'Henüz şube yok',
  },
  'branches.empty_hint': {
    az: 'İlk filialı "Yeni filial" ilə əlavə edin.',
    ru: 'Добавьте первый филиал кнопкой «Новый филиал».',
    tr: 'İlk şubeyi "Yeni şube" ile ekleyin.',
  },
  'branches.inactive': {
    az: 'Passiv',
    ru: 'Неактивен',
    tr: 'Pasif',
  },
  'branches.no_address': {
    az: 'Ünvan qeyd olunmayıb',
    ru: 'Адрес не указан',
    tr: 'Adres girilmedi',
  },
  'branches.no_location': {
    az: 'Yer qeyd olunmayıb',
    ru: 'Координаты не указаны',
    tr: 'Konum girilmedi',
  },
  'branches.edit': {
    az: 'Düzəliş et',
    ru: 'Изменить',
    tr: 'Düzenle',
  },
  'branches.activate': {
    az: 'Aktivləşdir',
    ru: 'Активировать',
    tr: 'Etkinleştir',
  },
  'branches.deactivate': {
    az: 'Passivləşdir',
    ru: 'Деактивировать',
    tr: 'Pasifleştir',
  },
  'branches.no_delete_note': {
    az: 'Filial silinmir, yalnız passivləşdirilir. Son aktiv filial və işçisi və ya açıq dəvəti olan filial passivləşdirilə bilməz.',
    ru: 'Филиал нельзя удалить, только деактивировать. Последний активный филиал и филиал с сотрудниками или открытыми приглашениями деактивировать нельзя.',
    tr: 'Şube silinmez, yalnız pasifleştirilir. Son aktif şube ve çalışanı veya açık daveti olan şube pasifleştirilemez.',
  },
  'branches.not_allowed': {
    az: 'Filialları yalnız biznes parametrləri icazəsi olan pərakəndəçi istifadəçisi idarə edə bilər.',
    ru: 'Филиалами может управлять только пользователь розничного бизнеса с правом на настройки бизнеса.',
    tr: 'Şubeleri yalnız işletme ayarları yetkisi olan perakendeci kullanıcısı yönetebilir.',
  },
  'branches.choose': {
    az: 'Seçin',
    ru: 'Выберите',
    tr: 'Seçin',
  },
  'branches.optional': {
    az: '(isteğe bağlı)',
    ru: '(необязательно)',
    tr: '(isteğe bağlı)',
  },
  'branches.field.name': {
    az: 'Filialın adı',
    ru: 'Название филиала',
    tr: 'Şube adı',
  },
  'branches.field.region': {
    az: 'Region',
    ru: 'Регион',
    tr: 'Bölge',
  },
  'branches.field.address': {
    az: 'Ünvan',
    ru: 'Адрес',
    tr: 'Adres',
  },
  'branches.field.rule': {
    az: 'Sifariş təsdiqi qaydası',
    ru: 'Правило согласования заказа',
    tr: 'Sipariş onay kuralı',
  },
  'branches.field.threshold': {
    az: 'Təsdiqsiz maksimum məbləğ',
    ru: 'Максимальная сумма без согласования',
    tr: 'Onaysız en yüksek tutar',
  },
  'branches.field.location': {
    az: 'Xəritə yeri',
    ru: 'Координаты',
    tr: 'Konum',
  },
  'branches.field.lat': {
    az: 'Enlik',
    ru: 'Широта',
    tr: 'Enlem',
  },
  'branches.field.lng': {
    az: 'Uzunluq',
    ru: 'Долгота',
    tr: 'Boylam',
  },
  'branches.threshold_hint': {
    az: 'Səbət bu məbləğdən çox olanda təsdiqə düşür; bərabər olanda birbaşa göndərilir.',
    ru: 'Корзина уходит на согласование, если сумма больше порога; при равенстве отправляется сразу.',
    tr: 'Sepet bu tutarın üstündeyse onaya düşer; eşitse doğrudan gönderilir.',
  },
  'branches.rule.every_order.title': {
    az: 'Hər sifariş',
    ru: 'Каждый заказ',
    tr: 'Her sipariş',
  },
  'branches.rule.every_order.hint': {
    az: 'Hər səbəti filial admini təsdiqləyir.',
    ru: 'Каждую корзину согласует администратор филиала.',
    tr: 'Her sepeti şube admini onaylar.',
  },
  'branches.rule.above_amount.title': {
    az: 'Məbləğdən yuxarı',
    ru: 'Выше суммы',
    tr: 'Tutarın üstü',
  },
  'branches.rule.above_amount.hint': {
    az: 'Yalnız həddən yuxarı səbətlər təsdiqə düşür.',
    ru: 'На согласование уходят только корзины выше порога.',
    tr: 'Yalnız eşiğin üstündeki sepetler onaya düşer.',
  },
  'branches.rule.none.title': {
    az: 'Təsdiqsiz',
    ru: 'Без согласования',
    tr: 'Onaysız',
  },
  'branches.rule.none.hint': {
    az: 'İşçilər səbəti birbaşa göndərir.',
    ru: 'Сотрудники отправляют корзину сразу.',
    tr: 'Çalışanlar sepeti doğrudan gönderir.',
  },
  'branches.rule_badge.every_order': {
    az: 'Hər sifariş təsdiqlənir',
    ru: 'Согласование каждого заказа',
    tr: 'Her sipariş onaylı',
  },
  'branches.rule_badge.above_amount': {
    az: '{amount} {currency} üstü təsdiq',
    ru: 'Согласование выше {amount} {currency}',
    tr: '{amount} {currency} üstü onaylı',
  },
  'branches.rule_badge.none': {
    az: 'Təsdiqsiz',
    ru: 'Без согласования',
    tr: 'Onaysız',
  },
  'branches.use_my_location': {
    az: 'Yerimi istifadə et',
    ru: 'Моё местоположение',
    tr: 'Konumumu kullan',
  },
  'branches.locating': {
    az: 'Yer təyin olunur…',
    ru: 'Определяем местоположение…',
    tr: 'Konum bulunuyor…',
  },
  'branches.location_denied': {
    az: 'Yerə icazə verilmədi. Koordinatları əl ilə daxil edin.',
    ru: 'Доступ к местоположению запрещён. Введите координаты вручную.',
    tr: 'Konum izni verilmedi. Koordinatları elle girin.',
  },
  'branches.location_unavailable': {
    az: 'Yer təyin oluna bilmədi. Koordinatları əl ilə daxil edin.',
    ru: 'Не удалось определить местоположение. Введите координаты вручную.',
    tr: 'Konum alınamadı. Koordinatları elle girin.',
  },
  'branches.location_hint': {
    az: 'Filialda olarkən "Yerimi istifadə et" düyməsinə basın və ya koordinatları daxil edin. Çatdırılma yerinin yoxlanması üçün lazımdır.',
    ru: 'Нажмите «Моё местоположение», находясь в филиале, или введите координаты. Нужны для проверки места доставки.',
    tr: 'Şubedeyken "Konumumu kullan"a basın veya koordinatları girin. Teslim yerinin kontrolü için kullanılır.',
  },
  'branches.error.required': {
    az: 'Bu sahə mütləqdir.',
    ru: 'Обязательное поле.',
    tr: 'Bu alan zorunlu.',
  },
  'branches.error.too_long': {
    az: 'Mətn çox uzundur.',
    ru: 'Слишком длинный текст.',
    tr: 'Metin çok uzun.',
  },
  'branches.error.invalid_amount': {
    az: 'Məbləği 150 və ya 150.50 kimi yazın.',
    ru: 'Укажите сумму как 150 или 150.50.',
    tr: 'Tutarı 150 veya 150.50 gibi yazın.',
  },
  'branches.error.positive': {
    az: 'Məbləğ sıfırdan böyük olmalıdır.',
    ru: 'Сумма должна быть больше нуля.',
    tr: 'Tutar sıfırdan büyük olmalı.',
  },
  'branches.error.invalid_coordinate': {
    az: 'Koordinat yanlışdır.',
    ru: 'Неверная координата.',
    tr: 'Koordinat geçersiz.',
  },
  'branches.error.geo_pair': {
    az: 'Enlik və uzunluğu birlikdə daxil edin.',
    ru: 'Укажите широту и долготу вместе.',
    tr: 'Enlem ve boylamı birlikte girin.',
  },
  'branches.error.last_active': {
    az: 'Son aktiv filial passivləşdirilə bilməz.',
    ru: 'Последний активный филиал нельзя деактивировать.',
    tr: 'Son aktif şube pasifleştirilemez.',
  },
  'branches.error.in_use': {
    az: 'Bu filialda {members} aktiv işçi və {invitations} açıq dəvət var. Əvvəlcə işçiləri başqa filiala keçirin və dəvətləri geri çəkin.',
    ru: 'В этом филиале активных сотрудников: {members}, открытых приглашений: {invitations}. Сначала переведите сотрудников в другой филиал и отзовите приглашения.',
    tr: 'Bu şubede {members} aktif çalışan ve {invitations} açık davet var. Önce çalışanları başka şubeye taşıyın ve davetleri geri çekin.',
  },
  // F2.18b: admin perakendeciler ekranı (US-015, US-016). Taslak çeviri (AI); kullanıcı onayı bekliyor.
  'shell.menu.buyers': {
    az: 'Pərakəndəçilər',
    ru: 'Розничные покупатели',
    tr: 'Perakendeciler',
  },
  'adminBuyers.eyebrow': {
    az: 'Platforma',
    ru: 'Платформа',
    tr: 'Platform',
  },
  'adminBuyers.title': {
    az: 'Pərakəndəçilər',
    ru: 'Розничные покупатели',
    tr: 'Perakendeciler',
  },
  'adminBuyers.description': {
    az: 'VÖEN-ləri yoxlayın, hesabları dayandırın və ya silin. Bütün dəyişikliklər audit jurnalına yazılır.',
    ru: 'Проверяйте VÖEN, приостанавливайте или удаляйте аккаунты. Все изменения записываются в журнал аудита.',
    tr: "VÖEN'leri kontrol edin, hesapları askıya alın veya silin. Tüm değişiklikler denetim kaydına yazılır.",
  },
  'adminBuyers.filters_label': {
    az: 'Süzgəc',
    ru: 'Фильтр',
    tr: 'Filtre',
  },
  'adminBuyers.filter.all': {
    az: 'Hamısı',
    ru: 'Все',
    tr: 'Tümü',
  },
  'adminBuyers.filter.voen_pending': {
    az: 'VÖEN yoxlaması',
    ru: 'Проверка VÖEN',
    tr: 'VÖEN kontrolü',
  },
  'adminBuyers.filter.dormant': {
    az: 'Passiv',
    ru: 'Неактивные',
    tr: 'Pasif',
  },
  'adminBuyers.filter.suspended': {
    az: 'Dayandırılıb',
    ru: 'Приостановлены',
    tr: 'Askıda',
  },
  'adminBuyers.retry': {
    az: 'Yenidən cəhd et',
    ru: 'Повторить',
    tr: 'Tekrar dene',
  },
  'adminBuyers.loading': {
    az: 'Yüklənir…',
    ru: 'Загрузка…',
    tr: 'Yükleniyor…',
  },
  'adminBuyers.more': {
    az: 'Daha çox göstər',
    ru: 'Показать ещё',
    tr: 'Daha fazla göster',
  },
  'adminBuyers.empty_title': {
    az: 'Burada heç kim yoxdur',
    ru: 'Здесь пока никого нет',
    tr: 'Burada kimse yok',
  },
  'adminBuyers.empty.all': {
    az: 'Hələ qeydiyyatdan keçmiş pərakəndəçi yoxdur.',
    ru: 'Зарегистрированных розничных покупателей пока нет.',
    tr: 'Henüz kayıtlı perakendeci yok.',
  },
  'adminBuyers.empty.voen_pending': {
    az: 'Yoxlama gözləyən VÖEN yoxdur. Növbə boşdur.',
    ru: 'Нет VÖEN, ожидающих проверки. Очередь пуста.',
    tr: 'Kontrol bekleyen VÖEN yok. Kuyruk boş.',
  },
  'adminBuyers.empty.dormant': {
    az: 'Passiv hesab yoxdur.',
    ru: 'Неактивных аккаунтов нет.',
    tr: 'Pasif hesap yok.',
  },
  'adminBuyers.empty.suspended': {
    az: 'Dayandırılmış hesab yoxdur.',
    ru: 'Приостановленных аккаунтов нет.',
    tr: 'Askıya alınmış hesap yok.',
  },
  'adminBuyers.voen_state.verified': {
    az: 'VÖEN təsdiqlənib',
    ru: 'VÖEN подтверждён',
    tr: 'VÖEN doğrulandı',
  },
  'adminBuyers.voen_state.pending': {
    az: 'VÖEN yoxlanılır',
    ru: 'VÖEN на проверке',
    tr: 'VÖEN kontrolde',
  },
  'adminBuyers.voen_state.missing': {
    az: 'VÖEN yoxdur',
    ru: 'Без VÖEN',
    tr: 'VÖEN yok',
  },
  'adminBuyers.status.active': {
    az: 'Aktiv',
    ru: 'Активен',
    tr: 'Aktif',
  },
  'adminBuyers.status.suspended': {
    az: 'Dayandırılıb',
    ru: 'Приостановлен',
    tr: 'Askıda',
  },
  'adminBuyers.status.dormant': {
    az: 'Passiv',
    ru: 'Неактивен',
    tr: 'Pasif',
  },
  'adminBuyers.legal_type.legal_entity': {
    az: 'Hüquqi şəxs',
    ru: 'Юридическое лицо',
    tr: 'Tüzel kişi',
  },
  'adminBuyers.legal_type.individual_entrepreneur': {
    az: 'Fərdi sahibkar',
    ru: 'Индивидуальный предприниматель',
    tr: 'Bireysel girişimci',
  },
  'adminBuyers.row.created': {
    az: 'Qeydiyyat: {date}',
    ru: 'Регистрация: {date}',
    tr: 'Kayıt: {date}',
  },
  'adminBuyers.row.profile': {
    az: 'Profil',
    ru: 'Профиль',
    tr: 'Profil',
  },
  'adminBuyers.row.completeness': {
    az: 'Profil {value}% doludur',
    ru: 'Профиль заполнен на {value}%',
    tr: 'Profil %{value} dolu',
  },
  'adminBuyers.row.open': {
    az: 'Aç',
    ru: 'Открыть',
    tr: 'Aç',
  },
  'adminBuyers.dialog.eyebrow': {
    az: 'Pərakəndəçi',
    ru: 'Розничный покупатель',
    tr: 'Perakendeci',
  },
  'adminBuyers.dialog.title': {
    az: 'Pərakəndəçi qeydi',
    ru: 'Карточка покупателя',
    tr: 'Perakendeci kaydı',
  },
  'adminBuyers.dialog.close': {
    az: 'Bağla',
    ru: 'Закрыть',
    tr: 'Kapat',
  },
  'adminBuyers.field.voen': {
    az: 'VÖEN',
    ru: 'VÖEN',
    tr: 'VÖEN',
  },
  'adminBuyers.field.none': {
    az: 'Daxil edilməyib',
    ru: 'Не указан',
    tr: 'Girilmedi',
  },
  'adminBuyers.field.e_taxes': {
    az: 'e-taxes.gov.az-da yoxla',
    ru: 'Проверить на e-taxes.gov.az',
    tr: "e-taxes.gov.az'da kontrol et",
  },
  'adminBuyers.field.legal_type': {
    az: 'Hüquqi forma',
    ru: 'Правовая форма',
    tr: 'Hukuki tip',
  },
  'adminBuyers.field.region': {
    az: 'Region',
    ru: 'Регион',
    tr: 'Bölge',
  },
  'adminBuyers.field.status': {
    az: 'Vəziyyət',
    ru: 'Статус',
    tr: 'Durum',
  },
  'adminBuyers.field.verified_at': {
    az: 'Təsdiq tarixi',
    ru: 'Дата подтверждения',
    tr: 'Doğrulama tarihi',
  },
  'adminBuyers.field.not_verified': {
    az: 'Təsdiqlənməyib',
    ru: 'Не подтверждён',
    tr: 'Doğrulanmadı',
  },
  'adminBuyers.field.created_at': {
    az: 'Qeydiyyat tarixi',
    ru: 'Дата регистрации',
    tr: 'Kayıt tarihi',
  },
  'adminBuyers.field.completeness': {
    az: 'Profilin doluluğu',
    ru: 'Заполненность профиля',
    tr: 'Profil doluluğu',
  },
  'adminBuyers.voen.title': {
    az: 'VÖEN qərarı',
    ru: 'Решение по VÖEN',
    tr: 'VÖEN kararı',
  },
  'adminBuyers.voen.hint': {
    az: 'VÖEN-i e-taxes.gov.az-da yoxlayın: ad və vəziyyət uyğun gəlirsə təsdiqləyin. Təsdiqlənmiş pərakəndəçi kataloqda nişanla və yuxarıda görünür.',
    ru: 'Проверьте VÖEN на e-taxes.gov.az: если название и статус совпадают, подтвердите. Подтверждённый покупатель отображается в каталоге со значком и выше остальных.',
    tr: "VÖEN'i e-taxes.gov.az'da kontrol edin: ünvan ve durum uyuyorsa doğrulayın. Doğrulanmış perakendeci dizinde rozetle ve üstte görünür.",
  },
  'adminBuyers.voen.verify': {
    az: 'Təsdiqlə',
    ru: 'Подтвердить',
    tr: 'Doğrula',
  },
  'adminBuyers.voen.reject': {
    az: 'Rədd et',
    ru: 'Отклонить',
    tr: 'Reddet',
  },
  'adminBuyers.voen.verified_done': {
    az: 'VÖEN təsdiqləndi.',
    ru: 'VÖEN подтверждён.',
    tr: 'VÖEN doğrulandı.',
  },
  'adminBuyers.working': {
    az: 'Göndərilir…',
    ru: 'Отправка…',
    tr: 'Gönderiliyor…',
  },
  'adminBuyers.manage.title': {
    az: 'Hesabın idarəsi',
    ru: 'Управление аккаунтом',
    tr: 'Hesap yönetimi',
  },
  'adminBuyers.read_only': {
    az: 'Sizin yalnız baxmaq hüququnuz var. Dəyişiklikləri əməliyyat komandası edir.',
    ru: 'У вас только право просмотра. Изменения вносит операционная команда.',
    tr: 'Yalnız görüntüleme yetkiniz var. Değişiklikleri operasyon ekibi yapar.',
  },
  'adminBuyers.back': {
    az: 'Geri',
    ru: 'Назад',
    tr: 'Geri',
  },
  'adminBuyers.optional': {
    az: '(istəyə bağlı)',
    ru: '(необязательно)',
    tr: '(isteğe bağlı)',
  },
  'adminBuyers.reason': {
    az: 'Səbəb',
    ru: 'Причина',
    tr: 'Gerekçe',
  },
  'adminBuyers.reason_hint': {
    az: 'Yalnız audit jurnalına yazılır, pərakəndəçi görmür.',
    ru: 'Записывается только в журнал аудита, покупатель её не видит.',
    tr: 'Yalnız denetim kaydına yazılır, perakendeci görmez.',
  },
  'adminBuyers.note_error.too_short': {
    az: 'Ən azı 3 simvol yazın.',
    ru: 'Введите не менее 3 символов.',
    tr: 'En az 3 karakter yazın.',
  },
  'adminBuyers.note_error.too_long': {
    az: 'Ən çox 500 simvol.',
    ru: 'Не более 500 символов.',
    tr: 'En fazla 500 karakter.',
  },
  'adminBuyers.reject.eyebrow': {
    az: 'VÖEN-i rədd et',
    ru: 'Отклонить VÖEN',
    tr: "VÖEN'i reddet",
  },
  'adminBuyers.reject.hint': {
    az: 'VÖEN silinəcək və pərakəndəçinin adminlərinə seçdiyiniz səbəblə bildiriş gedəcək. Onlar düzgün VÖEN-i yenidən daxil edə bilərlər.',
    ru: 'VÖEN будет удалён, администраторы покупателя получат уведомление с выбранной причиной. Они смогут ввести правильный VÖEN заново.',
    tr: "VÖEN silinir ve perakendecinin adminlerine seçtiğiniz gerekçeyle bildirim gider. Doğru VÖEN'i yeniden girebilirler.",
  },
  'adminBuyers.reject.reason': {
    az: 'Səbəb (pərakəndəçi görür)',
    ru: 'Причина (видит покупатель)',
    tr: 'Gerekçe (perakendeci görür)',
  },
  'adminBuyers.reject.reasons.voen_not_found': {
    az: 'VÖEN tapılmadı',
    ru: 'VÖEN не найден',
    tr: 'VÖEN bulunamadı',
  },
  'adminBuyers.reject.reasons.name_mismatch': {
    az: 'Ad uyğun gəlmir',
    ru: 'Название не совпадает',
    tr: 'Ünvan uyuşmuyor',
  },
  'adminBuyers.reject.reasons.voen_inactive': {
    az: 'VÖEN aktiv deyil',
    ru: 'VÖEN неактивен',
    tr: 'VÖEN aktif değil',
  },
  'adminBuyers.reject.reasons.other': {
    az: 'Digər səbəb',
    ru: 'Другая причина',
    tr: 'Diğer',
  },
  'adminBuyers.reject.note': {
    az: 'Daxili qeyd',
    ru: 'Внутренняя заметка',
    tr: 'İç not',
  },
  'adminBuyers.reject.note_hint': {
    az: 'Yalnız audit jurnalına yazılır, pərakəndəçi görmür.',
    ru: 'Записывается только в журнал аудита, покупатель её не видит.',
    tr: 'Yalnız denetim kaydına yazılır, perakendeci görmez.',
  },
  'adminBuyers.reject.submit': {
    az: 'VÖEN-i rədd et',
    ru: 'Отклонить VÖEN',
    tr: "VÖEN'i reddet",
  },
  'adminBuyers.action.suspend.open': {
    az: 'Dayandır',
    ru: 'Приостановить',
    tr: 'Askıya al',
  },
  'adminBuyers.action.suspend.eyebrow': {
    az: 'Hesabı dayandır',
    ru: 'Приостановить аккаунт',
    tr: 'Hesabı askıya al',
  },
  'adminBuyers.action.suspend.point_1': {
    az: 'İşçilər daxil ola bilər, amma heç bir əməliyyat edə bilməz; pərakəndəçi kataloqdan çıxır.',
    ru: 'Сотрудники смогут войти, но не смогут ничего делать; покупатель исчезнет из каталога.',
    tr: 'Çalışanlar giriş yapabilir ama hiçbir işlem yapamaz; perakendeci dizinden düşer.',
  },
  'adminBuyers.action.suspend.point_2': {
    az: 'Əlaqələr və sorğular olduğu kimi qalır. İstənilən vaxt geri qaytara bilərsiniz.',
    ru: 'Связи и запросы остаются без изменений. Вы сможете вернуть аккаунт в любой момент.',
    tr: 'Bağlantılar ve istekler olduğu gibi kalır. İstediğiniz zaman geri alabilirsiniz.',
  },
  'adminBuyers.action.suspend.confirm': {
    az: 'Bəli, «{name}» hesabını dayandırıram.',
    ru: 'Да, приостанавливаю аккаунт «{name}».',
    tr: 'Evet, «{name}» hesabını askıya alıyorum.',
  },
  'adminBuyers.action.suspend.submit': {
    az: 'Dayandır',
    ru: 'Приостановить',
    tr: 'Askıya al',
  },
  'adminBuyers.action.unsuspend.open': {
    az: 'Dayandırmanı götür',
    ru: 'Снять приостановку',
    tr: 'Askıdan kaldır',
  },
  'adminBuyers.action.unsuspend.eyebrow': {
    az: 'Hesabı bərpa et',
    ru: 'Восстановить аккаунт',
    tr: 'Hesabı geri aç',
  },
  'adminBuyers.action.unsuspend.point_1': {
    az: 'İşçilər yenidən işləyə bilər.',
    ru: 'Сотрудники снова смогут работать.',
    tr: 'Çalışanlar yeniden çalışabilir.',
  },
  'adminBuyers.action.unsuspend.point_2': {
    az: 'Pərakəndəçi kataloqa qayıdır.',
    ru: 'Покупатель вернётся в каталог.',
    tr: 'Perakendeci dizine geri döner.',
  },
  'adminBuyers.action.unsuspend.confirm': {
    az: 'Bəli, «{name}» hesabını bərpa edirəm.',
    ru: 'Да, восстанавливаю аккаунт «{name}».',
    tr: 'Evet, «{name}» hesabını geri açıyorum.',
  },
  'adminBuyers.action.unsuspend.submit': {
    az: 'Bərpa et',
    ru: 'Восстановить',
    tr: 'Geri aç',
  },
  'adminBuyers.action.archive.open': {
    az: 'Sil',
    ru: 'Удалить',
    tr: 'Sil',
  },
  'adminBuyers.action.archive.eyebrow': {
    az: 'Hesabı sil',
    ru: 'Удалить аккаунт',
    tr: 'Hesabı sil',
  },
  'adminBuyers.action.archive.point_1': {
    az: 'Əlaqə, sorğu və ya bloklama tarixçəsi varsa hesab arxivlənir: şəxsi məlumatlar silinir, aktiv əlaqələr bağlanır, topdançılara bildiriş gedir.',
    ru: 'Если есть история связей, запросов или блокировок, аккаунт архивируется: персональные данные удаляются, активные связи закрываются, оптовики получают уведомление.',
    tr: 'Bağlantı, istek veya engel geçmişi varsa hesap arşivlenir: kişisel veriler silinir, aktif bağlantılar kapanır, toptancılara bildirim gider.',
  },
  'adminBuyers.action.archive.point_2': {
    az: 'Tarixçə yoxdursa hesab və bütün məlumatları həmişəlik silinir. Bu addım geri qaytarılmır.',
    ru: 'Если истории нет, аккаунт и все его данные удаляются навсегда. Это действие необратимо.',
    tr: 'Geçmiş yoksa hesap ve tüm verileri kalıcı olarak silinir. Bu işlem geri alınamaz.',
  },
  'adminBuyers.action.archive.confirm': {
    az: 'Bəli, «{name}» hesabını silirəm və bunun geri qaytarılmadığını başa düşürəm.',
    ru: 'Да, удаляю аккаунт «{name}» и понимаю, что это необратимо.',
    tr: 'Evet, «{name}» hesabını siliyorum ve bunun geri alınamayacağını anlıyorum.',
  },
  'adminBuyers.action.archive.submit': {
    az: 'Hesabı sil',
    ru: 'Удалить аккаунт',
    tr: 'Hesabı sil',
  },
  'adminBuyers.done.suspended': {
    az: '«{name}» dayandırıldı.',
    ru: '«{name}» приостановлен.',
    tr: '«{name}» askıya alındı.',
  },
  'adminBuyers.done.unsuspended': {
    az: '«{name}» bərpa edildi.',
    ru: '«{name}» восстановлен.',
    tr: '«{name}» geri açıldı.',
  },
  'adminBuyers.done.archived': {
    az: '«{name}» arxivləndi: şəxsi məlumatlar silindi, tarixçə saxlanıldı.',
    ru: '«{name}» архивирован: персональные данные удалены, история сохранена.',
    tr: '«{name}» arşivlendi: kişisel veriler silindi, geçmiş korundu.',
  },
  'adminBuyers.done.deleted': {
    az: '«{name}» həmişəlik silindi.',
    ru: '«{name}» удалён навсегда.',
    tr: '«{name}» kalıcı olarak silindi.',
  },
  // F2.19: admin ayarlar ekranı (US-017). Çeviriler taslak; kullanıcı onayı bekliyor.
  'adminSettings.eyebrow': {
    az: 'Platforma',
    ru: 'Платформа',
    tr: 'Platform',
  },
  'adminSettings.title': {
    az: 'Sistem ayarları',
    ru: 'Системные настройки',
    tr: 'Sistem ayarları',
  },
  'adminSettings.description': {
    az: 'Müddətləri, kvotaları və qaydaları kodu dəyişmədən idarə edin. Ən xüsusi səviyyə qüvvədədir: müəssisə → plan → platforma.',
    ru: 'Управляйте сроками, квотами и правилами без изменения кода. Действует самый частный уровень: предприятие → план → платформа.',
    tr: 'Süreleri, kotaları ve kuralları kod değiştirmeden yönetin. En özel düzey geçerlidir: işletme → plan → platform.',
  },
  'adminSettings.scope_label': {
    az: 'Səviyyə',
    ru: 'Уровень',
    tr: 'Kapsam',
  },
  'adminSettings.scope.platform': {
    az: 'Platforma',
    ru: 'Платформа',
    tr: 'Platform',
  },
  'adminSettings.scope.plan': {
    az: 'Plan',
    ru: 'План',
    tr: 'Plan',
  },
  'adminSettings.scope.business': {
    az: 'Müəssisə',
    ru: 'Предприятие',
    tr: 'İşletme',
  },
  'adminSettings.plan_label': {
    az: 'Plan',
    ru: 'План',
    tr: 'Plan',
  },
  'adminSettings.plan_placeholder': {
    az: 'Plan seçin',
    ru: 'Выберите план',
    tr: 'Plan seçin',
  },
  'adminSettings.business_label': {
    az: 'Müəssisə',
    ru: 'Предприятие',
    tr: 'İşletme',
  },
  'adminSettings.business_placeholder': {
    az: 'Müəssisə seçin',
    ru: 'Выберите предприятие',
    tr: 'İşletme seçin',
  },
  'adminSettings.business_group.sellers': {
    az: 'Topdançılar',
    ru: 'Оптовики',
    tr: 'Toptancılar',
  },
  'adminSettings.business_group.buyers': {
    az: 'Pərakəndəçilər',
    ru: 'Розничные покупатели',
    tr: 'Perakendeciler',
  },
  'adminSettings.load_more': {
    az: 'Daha çox yüklə',
    ru: 'Загрузить ещё',
    tr: 'Daha fazla yükle',
  },
  'adminSettings.pick_target': {
    az: 'Ayarları görmək üçün yuxarıdan seçim edin.',
    ru: 'Выберите вариант выше, чтобы увидеть настройки.',
    tr: 'Ayarları görmek için yukarıdan seçim yapın.',
  },
  'adminSettings.scoped_note': {
    az: 'Bu səviyyədə yalnız plana və ya müəssisəyə görə dəyişə bilən ayarlar göstərilir. Digərləri yalnız platforma səviyyəsindədir.',
    ru: 'На этом уровне показаны только настройки, которые могут различаться по плану или предприятию. Остальные задаются только на уровне платформы.',
    tr: 'Bu kapsamda yalnızca plana veya işletmeye göre değişebilen ayarlar gösterilir. Diğerleri yalnızca platform düzeyindedir.',
  },
  'adminSettings.search_label': {
    az: 'Ayar axtar',
    ru: 'Поиск настройки',
    tr: 'Ayar ara',
  },
  'adminSettings.search_placeholder': {
    az: 'Ad və ya açar',
    ru: 'Название или ключ',
    tr: 'Ad veya anahtar',
  },
  'adminSettings.empty_search': {
    az: 'Axtarışa uyğun ayar tapılmadı.',
    ru: 'Настройки по запросу не найдены.',
    tr: 'Aramaya uygun ayar bulunamadı.',
  },
  'adminSettings.source.here': {
    az: 'Bu səviyyədə',
    ru: 'На этом уровне',
    tr: 'Bu kapsamda',
  },
  'adminSettings.source.plan': {
    az: 'Plandan',
    ru: 'Из плана',
    tr: 'Plandan',
  },
  'adminSettings.source.platform': {
    az: 'Platformadan',
    ru: 'С платформы',
    tr: 'Platformdan',
  },
  'adminSettings.source.default': {
    az: 'Standart',
    ru: 'По умолчанию',
    tr: 'Varsayılan',
  },
  'adminSettings.inherited_hint': {
    az: 'Bu səviyyədə dəyər yoxdur; qüvvədə olan: {value}',
    ru: 'На этом уровне значения нет; действует: {value}',
    tr: 'Bu kapsamda değer yok; geçerli olan: {value}',
  },
  'adminSettings.overrides_hint': {
    az: 'Bu səviyyə olmasaydı: {value} ({source})',
    ru: 'Без этого уровня: {value} ({source})',
    tr: 'Bu kapsam olmasaydı: {value} ({source})',
  },
  'adminSettings.edit': {
    az: 'Dəyişdir',
    ru: 'Изменить',
    tr: 'Değiştir',
  },
  'adminSettings.save': {
    az: 'Yadda saxla',
    ru: 'Сохранить',
    tr: 'Kaydet',
  },
  'adminSettings.saving': {
    az: 'Yadda saxlanılır…',
    ru: 'Сохранение…',
    tr: 'Kaydediliyor…',
  },
  'adminSettings.cancel': {
    az: 'Ləğv et',
    ru: 'Отмена',
    tr: 'Vazgeç',
  },
  'adminSettings.saved': {
    az: 'Yadda saxlandı',
    ru: 'Сохранено',
    tr: 'Kaydedildi',
  },
  'adminSettings.value_label': {
    az: 'Yeni dəyər',
    ru: 'Новое значение',
    tr: 'Yeni değer',
  },
  'adminSettings.hint.int': {
    az: 'Tam ədəd, {min}–{max}',
    ru: 'Целое число, {min}–{max}',
    tr: 'Tam sayı, {min}–{max}',
  },
  'adminSettings.hint.int_list': {
    az: 'Artan sıra ilə, vergüllə: {min}–{max}',
    ru: 'По возрастанию, через запятую: {min}–{max}',
    tr: 'Artan sırada, virgülle: {min}–{max}',
  },
  'adminSettings.hint.version': {
    az: 'Format: 1.2.3',
    ru: 'Формат: 1.2.3',
    tr: 'Biçim: 1.2.3',
  },
  'adminSettings.hint.url': {
    az: 'Boş və ya https:// ünvanı',
    ru: 'Пусто или адрес https://',
    tr: 'Boş veya https:// adresi',
  },
  'adminSettings.hint.country_codes': {
    az: 'Vergüllə: +994, +90',
    ru: 'Через запятую: +994, +90',
    tr: 'Virgülle: +994, +90',
  },
  'adminSettings.invalid': {
    az: 'Dəyər icazə verilən hədlərdən kənardadır.',
    ru: 'Значение вне допустимых пределов.',
    tr: 'Değer izin verilen sınırların dışında.',
  },
  'adminSettings.bool.true': {
    az: 'Bəli',
    ru: 'Да',
    tr: 'Evet',
  },
  'adminSettings.bool.false': {
    az: 'Xeyr',
    ru: 'Нет',
    tr: 'Hayır',
  },
  'adminSettings.empty_value': {
    az: '(boş)',
    ru: '(пусто)',
    tr: '(boş)',
  },
  'adminSettings.updated_at': {
    az: 'Dəyişdirilib: {date}',
    ru: 'Изменено: {date}',
    tr: 'Değiştirildi: {date}',
  },
  // F3.2a: marka talebi sınırı (taslak çeviri).
  'adminSettings.group.catalog': {
    az: 'Kataloq',
    ru: 'Каталог',
    tr: 'Katalog',
  },
  'adminSettings.group.connection': {
    az: 'Bağlantı sorğuları',
    ru: 'Запросы на связь',
    tr: 'Bağlantı istekleri',
  },
  'adminSettings.group.delivery': {
    az: 'Çatdırılma',
    ru: 'Доставка',
    tr: 'Teslimat',
  },
  'adminSettings.group.dormant': {
    az: 'Bağlantısız hesablar',
    ru: 'Аккаунты без связей',
    tr: 'Bağlantısız hesaplar',
  },
  'adminSettings.group.invitation': {
    az: 'Dəvətlər',
    ru: 'Приглашения',
    tr: 'Davetler',
  },
  'adminSettings.group.onboarding': {
    az: 'Qeydiyyat',
    ru: 'Регистрация',
    tr: 'Kayıt',
  },
  'adminSettings.group.seller_application': {
    az: 'Topdançı müraciəti',
    ru: 'Заявка оптовика',
    tr: 'Toptancı başvurusu',
  },
  'adminSettings.group.buyer_registration': {
    az: 'Pərakəndəçi qeydiyyatı',
    ru: 'Регистрация розничного покупателя',
    tr: 'Perakendeci kaydı',
  },
  'adminSettings.group.legal': {
    az: 'Hüquqi mətnlər',
    ru: 'Юридические тексты',
    tr: 'Hukuki metinler',
  },
  'adminSettings.group.sms': {
    az: 'SMS',
    ru: 'SMS',
    tr: 'SMS',
  },
  'adminSettings.group.otp': {
    az: 'Təsdiq kodu (OTP)',
    ru: 'Код подтверждения (OTP)',
    tr: 'Doğrulama kodu (OTP)',
  },
  'adminSettings.group.auth': {
    az: 'Sessiyalar',
    ru: 'Сессии',
    tr: 'Oturumlar',
  },
  'adminSettings.group.access': {
    az: 'İcazələr',
    ru: 'Права доступа',
    tr: 'İzinler',
  },
  'adminSettings.group.security': {
    az: 'Təhlükəsizlik',
    ru: 'Безопасность',
    tr: 'Güvenlik',
  },
  'adminSettings.group.mobile': {
    az: 'Mobil tətbiq',
    ru: 'Мобильное приложение',
    tr: 'Mobil uygulama',
  },
  'adminSettings.group.system': {
    az: 'Sistem',
    ru: 'Система',
    tr: 'Sistem',
  },
  'adminSettings.group.idempotency': {
    az: 'Təkrar sorğudan qoruma',
    ru: 'Защита от повторных запросов',
    tr: 'Tekrar istek koruması',
  },
  'adminSettings.group.outbox': {
    az: 'Hadisə növbəsi',
    ru: 'Очередь событий',
    tr: 'Olay kuyruğu',
  },
  'adminSettings.group.push': {
    az: 'Push bildirişləri',
    ru: 'Push-уведомления',
    tr: 'Push bildirimleri',
  },
  'adminSettings.group.files': {
    az: 'Fayllar',
    ru: 'Файлы',
    tr: 'Dosyalar',
  },
  'adminSettings.group.settings': {
    az: 'Ayarlar keşi',
    ru: 'Кэш настроек',
    tr: 'Ayar önbelleği',
  },
  'adminSettings.group.i18n': {
    az: 'Tərcümələr',
    ru: 'Переводы',
    tr: 'Çeviriler',
  },
  'adminSettings.group.directory': {
    az: 'Pərakəndəçi kataloqu',
    ru: 'Каталог розничных покупателей',
    tr: 'Perakendeci dizini',
  },
  'adminSettings.key.catalog.brand_request_daily_limit': {
    az: 'Gündəlik brend sorğusu limiti (24 saat)',
    ru: 'Лимит запросов бренда в сутки (24 часа)',
    tr: 'Günlük marka talebi sınırı (24 saat)',
  },
  'adminSettings.key.connection.request_ttl_days': {
    az: 'Sorğunun etibarlılıq müddəti (gün)',
    ru: 'Срок действия запроса (дни)',
    tr: 'İsteğin geçerlilik süresi (gün)',
  },
  'adminSettings.key.connection.cooldown_after_reject_days': {
    az: 'Rəddən sonra gözləmə (gün)',
    ru: 'Ожидание после отказа (дни)',
    tr: 'Ret sonrası bekleme (gün)',
  },
  'adminSettings.key.connection.cooldown_after_buyer_cancel_days': {
    az: 'Pərakəndəçi ləğvindən sonra gözləmə (gün)',
    ru: 'Ожидание после отмены покупателем (дни)',
    tr: 'Perakendeci iptali sonrası bekleme (gün)',
  },
  'adminSettings.key.connection.daily_request_quota': {
    az: 'Gündəlik sorğu kvotası',
    ru: 'Дневная квота запросов',
    tr: 'Günlük istek kotası',
  },
  'adminSettings.key.connection.block_rate_alert_pct': {
    az: 'Bloklanma faizi xəbərdarlıq həddi (%)',
    ru: 'Порог оповещения о блокировках (%)',
    tr: 'Engellenme oranı uyarı eşiği (%)',
  },
  'adminSettings.key.connection.request_expiry_interval_minutes': {
    az: 'Vaxtı keçən sorğuların yoxlanma aralığı (dəq)',
    ru: 'Интервал проверки просроченных запросов (мин)',
    tr: 'Süresi dolan istek kontrol aralığı (dk)',
  },
  'adminSettings.key.connection.request_expiry_batch_size': {
    az: 'Vaxtı keçən sorğular: bir dəfəyə say',
    ru: 'Просроченные запросы: за один проход',
    tr: 'Süresi dolan istekler: tek seferde sayı',
  },
  'adminSettings.key.connection.request_expiry_lock_seconds': {
    az: 'Vaxtı keçən sorğular: kilid müddəti (san)',
    ru: 'Просроченные запросы: время блокировки (с)',
    tr: 'Süresi dolan istekler: kilit süresi (sn)',
  },
  'adminSettings.key.delivery.auto_confirm_hours': {
    az: 'Avtomatik təsdiq (saat)',
    ru: 'Автоподтверждение (часы)',
    tr: 'Otomatik onay (saat)',
  },
  'adminSettings.key.delivery.location_mismatch_meters': {
    az: 'Ünvan uyğunsuzluğu həddi (metr)',
    ru: 'Порог несовпадения адреса (м)',
    tr: 'Konum uyuşmazlığı eşiği (metre)',
  },
  'adminSettings.key.dormant.reminder_days': {
    az: 'Xatırlatma günləri',
    ru: 'Дни напоминаний',
    tr: 'Hatırlatma günleri',
  },
  'adminSettings.key.dormant.warning_day': {
    az: 'Xəbərdarlıq günü',
    ru: 'День предупреждения',
    tr: 'Uyarı günü',
  },
  'adminSettings.key.dormant.deactivate_day': {
    az: 'Passivləşdirmə günü',
    ru: 'День деактивации',
    tr: 'Pasifleştirme günü',
  },
  'adminSettings.key.dormant.delete_day': {
    az: 'Silinmə günü',
    ru: 'День удаления',
    tr: 'Silme günü',
  },
  'adminSettings.key.dormant.job_hour_utc': {
    az: 'Gecə işinin saatı (UTC)',
    ru: 'Час ночной задачи (UTC)',
    tr: 'Gece işinin saati (UTC)',
  },
  'adminSettings.key.dormant.batch_size': {
    az: 'Gecə işi: bir dəfəyə say',
    ru: 'Ночная задача: за один проход',
    tr: 'Gece işi: tek seferde sayı',
  },
  'adminSettings.key.dormant.lock_seconds': {
    az: 'Gecə işi: kilid müddəti (san)',
    ru: 'Ночная задача: время блокировки (с)',
    tr: 'Gece işi: kilit süresi (sn)',
  },
  'adminSettings.key.dormant.touch_min_interval_minutes': {
    az: 'Fəaliyyət qeydinin minimum aralığı (dəq)',
    ru: 'Мин. интервал записи активности (мин)',
    tr: 'Etkinlik kaydının en kısa aralığı (dk)',
  },
  'adminSettings.key.invitation.seller_activation_days': {
    az: 'Topdançı aktivləşdirmə dəvəti (gün)',
    ru: 'Приглашение на активацию оптовика (дни)',
    tr: 'Toptancı aktivasyon daveti (gün)',
  },
  'adminSettings.key.invitation.team_days': {
    az: 'Komanda dəvəti (gün)',
    ru: 'Приглашение в команду (дни)',
    tr: 'Ekip daveti (gün)',
  },
  'adminSettings.key.onboarding.seller_mode': {
    az: 'Topdançı qeydiyyat rejimi',
    ru: 'Режим регистрации оптовика',
    tr: 'Toptancı kayıt modu',
  },
  'adminSettings.key.seller_application.ip_max_per_hour': {
    az: 'IP üzrə saatlıq müraciət limiti',
    ru: 'Лимит заявок с IP в час',
    tr: 'IP başına saatlik başvuru sınırı',
  },
  'adminSettings.key.buyer_registration.ip_max_per_hour': {
    az: 'IP üzrə saatlıq qeydiyyat limiti',
    ru: 'Лимит регистраций с IP в час',
    tr: 'IP başına saatlik kayıt sınırı',
  },
  'adminSettings.key.onboarding.buyer_plan_code': {
    az: 'Yeni pərakəndəçinin planı',
    ru: 'План нового розничного покупателя',
    tr: 'Yeni perakendecinin planı',
  },
  'adminSettings.key.legal.data_sharing_version': {
    az: 'Məlumat paylaşımı mətninin versiyası',
    ru: 'Версия текста об обмене данными',
    tr: 'Veri paylaşım metninin sürümü',
  },
  'adminSettings.key.sms.daily_cap': {
    az: 'Gündəlik SMS limiti',
    ru: 'Дневной лимит SMS',
    tr: 'Günlük SMS sınırı',
  },
  'adminSettings.key.sms.allowed_country_codes': {
    az: 'İcazəli ölkə kodları',
    ru: 'Разрешённые коды стран',
    tr: 'İzinli ülke kodları',
  },
  'adminSettings.key.otp.code_ttl_minutes': {
    az: 'Kodun etibarlılıq müddəti (dəq)',
    ru: 'Срок действия кода (мин)',
    tr: 'Kodun geçerlilik süresi (dk)',
  },
  'adminSettings.key.otp.resend_interval_seconds': {
    az: 'Təkrar göndərmə aralığı (san)',
    ru: 'Интервал повторной отправки (с)',
    tr: 'Yeniden gönderme aralığı (sn)',
  },
  'adminSettings.key.otp.max_per_hour': {
    az: 'Nömrə üzrə saatlıq kod limiti',
    ru: 'Лимит кодов на номер в час',
    tr: 'Numara başına saatlik kod sınırı',
  },
  'adminSettings.key.otp.max_attempts': {
    az: 'Səhv cəhd limiti',
    ru: 'Лимит неверных попыток',
    tr: 'Yanlış deneme sınırı',
  },
  'adminSettings.key.otp.lock_minutes': {
    az: 'Kilid müddəti (dəq)',
    ru: 'Время блокировки (мин)',
    tr: 'Kilit süresi (dk)',
  },
  'adminSettings.key.otp.ip_max_per_hour': {
    az: 'IP üzrə saatlıq kod limiti',
    ru: 'Лимит кодов с IP в час',
    tr: 'IP başına saatlik kod sınırı',
  },
  'adminSettings.key.otp.fail_window_minutes': {
    az: 'Səhv cəhdlərin sayılma pəncərəsi (dəq)',
    ru: 'Окно подсчёта неверных попыток (мин)',
    tr: 'Yanlış deneme sayım penceresi (dk)',
  },
  'adminSettings.key.auth.access_token_minutes': {
    az: 'Giriş açarının ömrü (dəq)',
    ru: 'Срок жизни токена доступа (мин)',
    tr: 'Erişim anahtarı ömrü (dk)',
  },
  'adminSettings.key.auth.refresh_token_days': {
    az: 'Yeniləmə açarının ömrü (gün)',
    ru: 'Срок жизни токена обновления (дни)',
    tr: 'Yenileme anahtarı ömrü (gün)',
  },
  'adminSettings.key.access.permission_cache_seconds': {
    az: 'İcazə keşinin ömrü (san)',
    ru: 'Срок кэша прав (с)',
    tr: 'İzin önbelleği ömrü (sn)',
  },
  'adminSettings.key.security.require_admin_2fa': {
    az: 'Admin üçün iki mərhələli giriş məcburidir',
    ru: 'Двухфакторный вход для админа обязателен',
    tr: 'Admin için iki adımlı giriş zorunlu',
  },
  'adminSettings.key.mobile.min_version.ios': {
    az: 'Minimum versiya: iOS',
    ru: 'Минимальная версия: iOS',
    tr: 'En düşük sürüm: iOS',
  },
  'adminSettings.key.mobile.min_version.android': {
    az: 'Minimum versiya: Android',
    ru: 'Минимальная версия: Android',
    tr: 'En düşük sürüm: Android',
  },
  'adminSettings.key.mobile.recommended_version.ios': {
    az: 'Tövsiyə olunan versiya: iOS',
    ru: 'Рекомендуемая версия: iOS',
    tr: 'Önerilen sürüm: iOS',
  },
  'adminSettings.key.mobile.recommended_version.android': {
    az: 'Tövsiyə olunan versiya: Android',
    ru: 'Рекомендуемая версия: Android',
    tr: 'Önerilen sürüm: Android',
  },
  'adminSettings.key.mobile.store_url.ios': {
    az: 'Mağaza ünvanı: iOS',
    ru: 'Ссылка на магазин: iOS',
    tr: 'Mağaza adresi: iOS',
  },
  'adminSettings.key.mobile.store_url.android': {
    az: 'Mağaza ünvanı: Android',
    ru: 'Ссылка на магазин: Android',
    tr: 'Mağaza adresi: Android',
  },
  'adminSettings.key.system.maintenance': {
    az: 'Texniki xidmət rejimi',
    ru: 'Режим обслуживания',
    tr: 'Bakım modu',
  },
  'adminSettings.key.idempotency.ttl_hours': {
    az: 'Cavabın saxlanma müddəti (saat)',
    ru: 'Срок хранения ответа (часы)',
    tr: 'Yanıt saklama süresi (saat)',
  },
  'adminSettings.key.idempotency.lock_seconds': {
    az: 'Kilid müddəti (san)',
    ru: 'Время блокировки (с)',
    tr: 'Kilit süresi (sn)',
  },
  'adminSettings.key.outbox.max_attempts': {
    az: 'Maksimum cəhd sayı',
    ru: 'Максимум попыток',
    tr: 'En fazla deneme',
  },
  'adminSettings.key.outbox.poll_interval_ms': {
    az: 'Yoxlama aralığı (ms)',
    ru: 'Интервал опроса (мс)',
    tr: 'Yoklama aralığı (ms)',
  },
  'adminSettings.key.outbox.batch_size': {
    az: 'Bir dəfəyə hadisə sayı',
    ru: 'Событий за один проход',
    tr: 'Tek seferde olay sayısı',
  },
  'adminSettings.key.push.retry_delays_minutes': {
    az: 'Təkrar cəhd gözləmələri (dəq)',
    ru: 'Задержки повторных попыток (мин)',
    tr: 'Yeniden deneme beklemeleri (dk)',
  },
  'adminSettings.key.push.receipt_check_minutes': {
    az: 'Çatdırılma yoxlaması (dəq)',
    ru: 'Проверка доставки (мин)',
    tr: 'Teslim kontrolü (dk)',
  },
  'adminSettings.key.push.batch_size': {
    az: 'Bir sorğuda mesaj sayı',
    ru: 'Сообщений в одном запросе',
    tr: 'Tek istekte mesaj sayısı',
  },
  'adminSettings.key.files.upload_url_ttl_minutes': {
    az: 'Yükləmə linkinin ömrü (dəq)',
    ru: 'Срок ссылки загрузки (мин)',
    tr: 'Yükleme bağlantısı ömrü (dk)',
  },
  'adminSettings.key.files.download_url_ttl_minutes': {
    az: 'Endirmə linkinin ömrü (dəq)',
    ru: 'Срок ссылки скачивания (мин)',
    tr: 'İndirme bağlantısı ömrü (dk)',
  },
  'adminSettings.key.files.image_max_mb': {
    az: 'Şəkil üçün maksimum ölçü (MB)',
    ru: 'Макс. размер изображения (МБ)',
    tr: 'Görsel için en büyük boyut (MB)',
  },
  'adminSettings.key.files.xlsx_max_mb': {
    az: 'Excel faylı üçün maksimum ölçü (MB)',
    ru: 'Макс. размер файла Excel (МБ)',
    tr: 'Excel dosyası için en büyük boyut (MB)',
  },
  'adminSettings.key.settings.cache_ttl_seconds': {
    az: 'Ayarlar keşinin ömrü (san)',
    ru: 'Срок кэша настроек (с)',
    tr: 'Ayar önbelleği ömrü (sn)',
  },
  'adminSettings.key.i18n.cache_ttl_seconds': {
    az: 'Tərcümə keşinin ömrü (san)',
    ru: 'Срок кэша переводов (с)',
    tr: 'Çeviri önbelleği ömrü (sn)',
  },
  'adminSettings.key.directory.reindex_hour_utc': {
    az: 'Gecə indeksləmə saatı (UTC)',
    ru: 'Час ночной индексации (UTC)',
    tr: 'Gece yeniden indeksleme saati (UTC)',
  },
  'adminSettings.key.directory.reindex_batch_size': {
    az: 'İndeksləmə: bir dəfəyə say',
    ru: 'Индексация: за один проход',
    tr: 'İndeksleme: tek seferde sayı',
  },
  'adminSettings.key.directory.reindex_lock_seconds': {
    az: 'İndeksləmə: kilid müddəti (san)',
    ru: 'Индексация: время блокировки (с)',
    tr: 'İndeksleme: kilit süresi (sn)',
  },
  'adminSettings.key.directory.search_max_per_minute': {
    az: 'İstifadəçi üzrə dəqiqəlik axtarış limiti',
    ru: 'Лимит поиска на пользователя в минуту',
    tr: 'Kullanıcı başına dakikalık arama sınırı',
  },
  // F3.1: admin birim kataloğu (US-028).
  'shell.menu.units': {
    az: 'Ölçü vahidləri',
    ru: 'Единицы измерения',
    tr: 'Birimler',
  },
  'adminUnits.title': {
    az: 'Ölçü vahidləri',
    ru: 'Единицы измерения',
    tr: 'Birimler',
  },
  'adminUnits.description': {
    az: 'Topdançılar məhsul formunda yalnız aktiv vahidləri seçə bilir. Kodlar UN/ECE Rec 20 standartına uyğundur.',
    ru: 'Оптовики выбирают в форме товара только активные единицы. Коды соответствуют стандарту UN/ECE Rec 20.',
    tr: 'Toptancılar ürün formunda yalnızca aktif birimleri seçebilir. Kodlar UN/ECE Rec 20 standardına uygundur.',
  },
  'adminUnits.create_open': {
    az: 'Yeni vahid',
    ru: 'Новая единица',
    tr: 'Yeni birim',
  },
  'adminUnits.loading': {
    az: 'Yüklənir…',
    ru: 'Загрузка…',
    tr: 'Yükleniyor…',
  },
  'adminUnits.list_title': {
    az: 'Vahidlər',
    ru: 'Единицы',
    tr: 'Birimler',
  },
  'adminUnits.empty': {
    az: 'Hələ vahid yoxdur.',
    ru: 'Единиц пока нет.',
    tr: 'Henüz birim yok.',
  },
  'adminUnits.kind.count': {
    az: 'Ədəd',
    ru: 'Штучные',
    tr: 'Adet',
  },
  'adminUnits.kind.weight': {
    az: 'Çəki',
    ru: 'Вес',
    tr: 'Ağırlık',
  },
  'adminUnits.kind.volume': {
    az: 'Həcm',
    ru: 'Объём',
    tr: 'Hacim',
  },
  'adminUnits.kind.length': {
    az: 'Uzunluq',
    ru: 'Длина',
    tr: 'Uzunluk',
  },
  'adminUnits.kind.area': {
    az: 'Sahə',
    ru: 'Площадь',
    tr: 'Alan',
  },
  'adminUnits.kind.package': {
    az: 'Qablaşdırma',
    ru: 'Упаковка',
    tr: 'Ambalaj',
  },
  'adminUnits.active': {
    az: 'Aktiv',
    ru: 'Активна',
    tr: 'Aktif',
  },
  'adminUnits.inactive': {
    az: 'Passiv',
    ru: 'Неактивна',
    tr: 'Pasif',
  },
  'adminUnits.decimal': {
    az: 'Onluq miqdar',
    ru: 'Дробное количество',
    tr: 'Ondalıklı miktar',
  },
  'adminUnits.edit': {
    az: 'Redaktə et',
    ru: 'Изменить',
    tr: 'Düzenle',
  },
  'adminUnits.activate': {
    az: 'Aktivləşdir',
    ru: 'Активировать',
    tr: 'Aktifleştir',
  },
  'adminUnits.deactivate': {
    az: 'Deaktiv et',
    ru: 'Деактивировать',
    tr: 'Pasifleştir',
  },
  'adminUnits.activated': {
    az: 'Vahid aktivləşdirildi.',
    ru: 'Единица активирована.',
    tr: 'Birim aktifleştirildi.',
  },
  'adminUnits.deactivated': {
    az: 'Vahid deaktiv edildi; yeni məhsullarda seçilə bilməz.',
    ru: 'Единица деактивирована; в новых товарах её выбрать нельзя.',
    tr: 'Birim pasifleştirildi; yeni ürünlerde seçilemez.',
  },
  'adminUnits.no_delete_hint': {
    az: 'Vahidlər silinmir: istifadədə ola bilərlər. Lazım olmayan vahidi deaktiv edin.',
    ru: 'Единицы не удаляются: они могут использоваться. Ненужную единицу деактивируйте.',
    tr: 'Birimler silinmez: kullanımda olabilirler. Gerekmeyen birimi pasifleştirin.',
  },
  'adminUnits.create_title': {
    az: 'Yeni vahid',
    ru: 'Новая единица',
    tr: 'Yeni birim',
  },
  'adminUnits.edit_title': {
    az: 'Vahidi redaktə et',
    ru: 'Изменить единицу',
    tr: 'Birimi düzenle',
  },
  'adminUnits.editor_hint': {
    az: 'Aktiv vahid topdançıların məhsul formunda dərhal görünür.',
    ru: 'Активная единица сразу появляется в форме товара у оптовиков.',
    tr: 'Aktif birim toptancıların ürün formunda hemen görünür.',
  },
  'adminUnits.cancel': {
    az: 'Ləğv et',
    ru: 'Отмена',
    tr: 'Vazgeç',
  },
  'adminUnits.save': {
    az: 'Yadda saxla',
    ru: 'Сохранить',
    tr: 'Kaydet',
  },
  'adminUnits.created': {
    az: 'Vahid yaradıldı.',
    ru: 'Единица создана.',
    tr: 'Birim oluşturuldu.',
  },
  'adminUnits.updated': {
    az: 'Vahid yeniləndi.',
    ru: 'Единица обновлена.',
    tr: 'Birim güncellendi.',
  },
  'adminUnits.field.code': {
    az: 'UN/ECE kodu',
    ru: 'Код UN/ECE',
    tr: 'UN/ECE kodu',
  },
  'adminUnits.field.kind': {
    az: 'Növ',
    ru: 'Тип',
    tr: 'Tür',
  },
  'adminUnits.field.decimal': {
    az: 'Miqdar',
    ru: 'Количество',
    tr: 'Miktar',
  },
  'adminUnits.field.name': {
    az: 'Ad',
    ru: 'Название',
    tr: 'Ad',
  },
  'adminUnits.field.abbreviation': {
    az: 'Qısaltma',
    ru: 'Сокращение',
    tr: 'Kısaltma',
  },
  'adminUnits.code_hint': {
    az: '2–3 böyük hərf və ya rəqəm, məsələn KGM. Sonradan dəyişmir.',
    ru: '2–3 заглавные буквы или цифры, например KGM. Позже не меняется.',
    tr: '2–3 büyük harf veya rakam, örneğin KGM. Sonradan değişmez.',
  },
  'adminUnits.code_locked': {
    az: 'Kod və növ dəyişdirilə bilməz.',
    ru: 'Код и тип изменить нельзя.',
    tr: 'Kod ve tür değiştirilemez.',
  },
  'adminUnits.decimal_label': {
    az: 'Onluq miqdara icazə ver (1,5 kq)',
    ru: 'Разрешить дробное количество (1,5 кг)',
    tr: 'Ondalıklı miktara izin ver (1,5 kg)',
  },
  'adminUnits.error.required': {
    az: 'Bu sahə mütləqdir.',
    ru: 'Обязательное поле.',
    tr: 'Bu alan zorunludur.',
  },
  'adminUnits.error.too_long': {
    az: 'Mətn çox uzundur.',
    ru: 'Слишком длинный текст.',
    tr: 'Metin çok uzun.',
  },
  'adminUnits.error.invalid': {
    az: 'Seçim yanlışdır.',
    ru: 'Неверный выбор.',
    tr: 'Seçim geçersiz.',
  },
  'adminUnits.error.code_required': {
    az: 'Kodu daxil edin.',
    ru: 'Введите код.',
    tr: 'Kodu girin.',
  },
  'adminUnits.error.code_invalid': {
    az: 'Kod 2–3 böyük hərf və ya rəqəmdən ibarət olmalıdır.',
    ru: 'Код должен состоять из 2–3 заглавных букв или цифр.',
    tr: 'Kod 2–3 büyük harf veya rakamdan oluşmalı.',
  },
  'adminUnits.error.factor_required': {
    az: 'Nisbəti daxil edin.',
    ru: 'Введите коэффициент.',
    tr: 'Oranı girin.',
  },
  'adminUnits.error.factor_invalid': {
    az: 'Nisbət 0-dan böyük, ən çox 6 onluq rəqəmli olmalıdır.',
    ru: 'Коэффициент должен быть больше 0, не более 6 знаков после запятой.',
    tr: "Oran 0'dan büyük, en çok 6 ondalık haneli olmalı.",
  },
  'adminUnits.failure.code_taken': {
    az: 'Bu kod artıq istifadə olunur.',
    ru: 'Этот код уже используется.',
    tr: 'Bu kod zaten kullanılıyor.',
  },
  'adminUnits.failure.kind_mismatch': {
    az: 'Yalnız eyni növ vahidlər arasında nisbət yazıla bilər.',
    ru: 'Коэффициент можно задать только между единицами одного типа.',
    tr: 'Oran yalnızca aynı türdeki birimler arasında girilebilir.',
  },
  'adminUnits.failure.same_unit': {
    az: 'Vahid özünə çevrilə bilməz.',
    ru: 'Единицу нельзя пересчитать в саму себя.',
    tr: 'Birim kendisine dönüştürülemez.',
  },
  'adminUnits.failure.reverse_exists': {
    az: 'Bu cüt üçün əks istiqamətdə nisbət artıq var.',
    ru: 'Для этой пары уже задан обратный коэффициент.',
    tr: 'Bu çift için ters yönde oran zaten var.',
  },
  'adminUnits.failure.not_found': {
    az: 'Vahid tapılmadı.',
    ru: 'Единица не найдена.',
    tr: 'Birim bulunamadı.',
  },
  'adminUnits.failure.invalid': {
    az: 'Məlumatlardan biri yanlışdır.',
    ru: 'Одно из значений неверно.',
    tr: 'Bilgilerden biri geçersiz.',
  },
  'adminUnits.choose': {
    az: 'Seçin',
    ru: 'Выберите',
    tr: 'Seçin',
  },
  'adminUnits.conversion.title': {
    az: 'Çevirmə nisbətləri',
    ru: 'Коэффициенты пересчёта',
    tr: 'Dönüşüm oranları',
  },
  'adminUnits.conversion.description': {
    az: 'Eyni növ vahidlər arasında: 1 kq = 1000 q.',
    ru: 'Между единицами одного типа: 1 кг = 1000 г.',
    tr: 'Aynı türdeki birimler arasında: 1 kg = 1000 g.',
  },
  'adminUnits.conversion.empty': {
    az: 'Hələ nisbət yoxdur.',
    ru: 'Коэффициентов пока нет.',
    tr: 'Henüz oran yok.',
  },
  'adminUnits.conversion.from': {
    az: '1 vahid',
    ru: '1 единица',
    tr: '1 birim',
  },
  'adminUnits.conversion.to': {
    az: 'Bərabərdir',
    ru: 'Равно',
    tr: 'Eşittir',
  },
  'adminUnits.conversion.factor': {
    az: 'Nisbət',
    ru: 'Коэффициент',
    tr: 'Oran',
  },
  'adminUnits.conversion.save': {
    az: 'Yadda saxla',
    ru: 'Сохранить',
    tr: 'Kaydet',
  },
  'adminUnits.conversion.saved': {
    az: 'Nisbət yadda saxlandı.',
    ru: 'Коэффициент сохранён.',
    tr: 'Oran kaydedildi.',
  },
  'adminUnits.conversion.deleted': {
    az: 'Nisbət silindi.',
    ru: 'Коэффициент удалён.',
    tr: 'Oran silindi.',
  },
  'adminUnits.conversion.delete': {
    az: 'Sil',
    ru: 'Удалить',
    tr: 'Sil',
  },
};
