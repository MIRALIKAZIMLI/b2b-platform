// Web arayüzü başlangıç çevirileri (`ui_translations`, F1.13a: giriş ekranı ve dil seçici;
// F1.13b: kabuk, işletme seçici, menü).
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
  'auth.login.register_soon': {
    az: 'Bu nömrə ilə hesab yoxdur. Qeydiyyat tezliklə əlçatan olacaq.',
    ru: 'Аккаунт с этим номером не найден. Регистрация скоро станет доступна.',
    tr: 'Bu numarayla hesap yok. Kayıt yakında açılacak.',
  },
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
  'shell.menu.profile': {
    az: 'Profil və məxfilik',
    ru: 'Профиль и приватность',
    tr: 'Profil ve gizlilik',
  },
  'languages.az': { az: 'Azərbaycanca', ru: 'Azərbaycanca', tr: 'Azərbaycanca' },
  'languages.ru': { az: 'Русский', ru: 'Русский', tr: 'Русский' },
  'languages.tr': { az: 'Türkçe', ru: 'Türkçe', tr: 'Türkçe' },
  'languages.en': { az: 'English', ru: 'English', tr: 'English' },
};
