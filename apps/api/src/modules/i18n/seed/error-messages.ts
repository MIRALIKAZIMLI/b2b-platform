// Hata mesajlarının başlangıç çevirileri (`ui_translations`, anahtar `errors.<ErrorCode>`).
// Taslak AI tarafından yazıldı; platform sahibi PR'da gözden geçirir (F1.3 kartı).
// Tip Record<ErrorCode, …> olduğu için yeni bir hata kodu çevirisiz derlenmez (Mimar düzeltmesi D5).
import type { ErrorCode } from '@b2b/shared';

export interface ErrorMessageText {
  readonly az: string;
  readonly ru: string;
  readonly tr: string;
}

export const ERROR_MESSAGES: Readonly<Record<ErrorCode, ErrorMessageText>> = {
  VALIDATION_FAILED: {
    az: 'Daxil edilən məlumatlar yanlışdır.',
    ru: 'Введены неверные данные.',
    tr: 'Girilen bilgiler geçersiz.',
  },
  UNAUTHENTICATED: {
    az: 'Daxil olmaq lazımdır.',
    ru: 'Необходимо войти в систему.',
    tr: 'Giriş yapmanız gerekiyor.',
  },
  PERMISSION_DENIED: {
    az: 'Bu əməliyyat üçün icazəniz yoxdur.',
    ru: 'У вас нет прав на это действие.',
    tr: 'Bu işlem için yetkiniz yok.',
  },
  CAPABILITY_REQUIRED: {
    az: 'Bu əməliyyat sizin müəssisə növü üçün əlçatan deyil.',
    ru: 'Это действие недоступно для вашего типа предприятия.',
    tr: 'Bu işlem işletmenizin yeteneği için kullanılamaz.',
  },
  NOT_FOUND: {
    az: 'Tapılmadı.',
    ru: 'Не найдено.',
    tr: 'Bulunamadı.',
  },
  INVALID_STATE_TRANSITION: {
    az: 'Bu əməliyyat cari vəziyyətdə mümkün deyil.',
    ru: 'Это действие невозможно в текущем состоянии.',
    tr: 'Bu işlem mevcut durumda yapılamaz.',
  },
  IDEMPOTENCY_CONFLICT: {
    az: 'Bu sorğu artıq fərqli məlumatlarla göndərilib.',
    ru: 'Этот запрос уже был отправлен с другими данными.',
    tr: 'Bu istek daha önce farklı bilgilerle gönderildi.',
  },
  RATE_LIMITED: {
    az: 'Çox sayda sorğu. Bir az sonra yenidən cəhd edin.',
    ru: 'Слишком много запросов. Повторите попытку позже.',
    tr: 'Çok fazla istek. Biraz sonra tekrar deneyin.',
  },
  CONFIRMATION_REQUIRED: {
    az: 'Davam etmək üçün təsdiq lazımdır.',
    ru: 'Для продолжения требуется подтверждение.',
    tr: 'Devam etmek için onay gerekiyor.',
  },
  OTP_RATE_LIMITED: {
    az: 'Kod çox tez-tez istənilib. Bir az gözləyin.',
    ru: 'Код запрашивается слишком часто. Подождите немного.',
    tr: 'Kod çok sık istendi. Lütfen biraz bekleyin.',
  },
  OTP_INVALID: {
    az: 'Kod yanlışdır.',
    ru: 'Неверный код.',
    tr: 'Kod hatalı.',
  },
  OTP_EXPIRED: {
    az: 'Kodun müddəti bitib. Yeni kod istəyin.',
    ru: 'Срок действия кода истёк. Запросите новый код.',
    tr: 'Kodun süresi doldu. Yeni kod isteyin.',
  },
  OTP_LOCKED: {
    az: 'Çox sayda yanlış cəhd. Nömrə müvəqqəti bloklanıb.',
    ru: 'Слишком много неверных попыток. Номер временно заблокирован.',
    tr: 'Çok fazla hatalı deneme. Numara geçici olarak kilitlendi.',
  },
  SMS_UNAVAILABLE: {
    az: 'SMS hazırda göndərilə bilmir. Bir az sonra yenidən cəhd edin.',
    ru: 'Сейчас невозможно отправить SMS. Повторите попытку позже.',
    tr: 'SMS şu anda gönderilemiyor. Biraz sonra tekrar deneyin.',
  },
  TOTP_REQUIRED: {
    az: 'İki addımlı təsdiq kodu tələb olunur.',
    ru: 'Требуется код двухэтапной проверки.',
    tr: 'İki adımlı doğrulama kodu gerekiyor.',
  },
  TOTP_INVALID: {
    az: 'İki addımlı təsdiq kodu yanlışdır.',
    ru: 'Неверный код двухэтапной проверки.',
    tr: 'İki adımlı doğrulama kodu hatalı.',
  },
  REFRESH_TOKEN_REUSED: {
    az: 'Sessiya etibarsızdır. Yenidən daxil olun.',
    ru: 'Сеанс недействителен. Войдите снова.',
    tr: 'Oturum geçersiz. Lütfen tekrar giriş yapın.',
  },
  USER_DISABLED: {
    az: 'İstifadəçi deaktiv edilib.',
    ru: 'Пользователь отключён.',
    tr: 'Kullanıcı devre dışı bırakıldı.',
  },
  BUSINESS_SUSPENDED: {
    az: 'Müəssisənin fəaliyyəti dayandırılıb.',
    ru: 'Деятельность предприятия приостановлена.',
    tr: 'İşletme askıya alındı.',
  },
  SUBSCRIPTION_READ_ONLY: {
    az: 'Abunəlik yalnız oxuma rejimindədir.',
    ru: 'Подписка в режиме только для чтения.',
    tr: 'Abonelik yalnızca okuma modunda.',
  },
  ENTITLEMENT_LIMIT_REACHED: {
    az: 'Planınızın limitinə çatdınız.',
    ru: 'Достигнут лимит вашего тарифа.',
    tr: 'Planınızın sınırına ulaştınız.',
  },
  VOEN_INVALID: {
    az: 'VÖEN yanlışdır.',
    ru: 'Неверный VÖEN (ИНН).',
    tr: 'VÖEN geçersiz.',
  },
  VOEN_ALREADY_REGISTERED: {
    az: 'Bu VÖEN ilə qeydiyyatdan keçmiş müəssisə var; onun rəhbərindən dəvət istəyin.',
    ru: 'Предприятие с этим VÖEN уже зарегистрировано; попросите приглашение у его руководителя.',
    tr: 'Bu VÖEN ile kayıtlı bir işletme var; yöneticisinden davet isteyin.',
  },
  VOEN_REQUIRED: {
    az: 'Davam etmək üçün VÖEN daxil edin.',
    ru: 'Для продолжения укажите VÖEN.',
    tr: 'Devam etmek için VÖEN girin.',
  },
  SELLER_APPLICATION_ALREADY_PENDING: {
    az: 'Bu VÖEN ilə baxılmaqda olan müraciət artıq var.',
    ru: 'Заявка с этим VÖEN уже находится на рассмотрении.',
    tr: 'Bu VÖEN ile incelenmekte olan bir başvuru zaten var.',
  },
  PHONE_ALREADY_REGISTERED: {
    az: 'Bu nömrə artıq qeydiyyatdan keçib. Daxil olun.',
    ru: 'Этот номер уже зарегистрирован. Войдите в систему.',
    tr: 'Bu numara zaten kayıtlı. Giriş yapın.',
  },
  MEMBER_ALREADY_EXISTS: {
    az: 'Bu nömrə artıq komandanın üzvüdür.',
    ru: 'Этот номер уже состоит в команде.',
    tr: 'Bu numara zaten ekibin üyesi.',
  },
  LAST_ADMIN_PROTECTED: {
    az: 'Müəssisənin yeganə adminini silmək və ya rolunu dəyişmək olmaz.',
    ru: 'Нельзя удалить единственного администратора предприятия или изменить его роль.',
    tr: 'İşletmenin tek yöneticisi silinemez veya rolü değiştirilemez.',
  },
  CONNECTION_ALREADY_ACTIVE: {
    az: 'Bu bağlantı artıq aktivdir.',
    ru: 'Эта связь уже активна.',
    tr: 'Bu bağlantı zaten aktif.',
  },
  CONNECTION_REQUEST_ALREADY_PENDING: {
    az: 'Bu müəssisəyə göndərilmiş və gözləyən sorğu var.',
    ru: 'Этому предприятию уже отправлен запрос, ожидающий ответа.',
    tr: 'Bu işletmeye gönderilmiş ve bekleyen bir istek var.',
  },
  CONNECTION_REQUEST_EXPIRED: {
    az: 'Bağlantı sorğusunun müddəti bitib.',
    ru: 'Срок действия запроса на связь истёк.',
    tr: 'Bağlantı isteğinin süresi doldu.',
  },
  CONNECTION_BLOCKED: {
    az: 'Bu müəssisə ilə bağlantı mümkün deyil.',
    ru: 'Связь с этим предприятием невозможна.',
    tr: 'Bu işletmeyle bağlantı kurulamaz.',
  },
  CONNECTION_COOLDOWN_ACTIVE: {
    az: 'Yeni sorğu üçün gözləmə müddəti hələ bitməyib.',
    ru: 'Период ожидания для нового запроса ещё не истёк.',
    tr: 'Yeni istek için bekleme süresi henüz dolmadı.',
  },
  CONNECTION_DAILY_QUOTA_EXCEEDED: {
    az: 'Günlük bağlantı sorğusu limitinə çatdınız.',
    ru: 'Достигнут дневной лимит запросов на связь.',
    tr: 'Günlük bağlantı isteği sınırına ulaştınız.',
  },
  CONNECTION_NOT_ACTIVE: {
    az: 'Bu topdançı ilə aktiv bağlantınız yoxdur.',
    ru: 'У вас нет активной связи с этим оптовиком.',
    tr: 'Bu toptancıyla aktif bağlantınız yok.',
  },
  PRICE_NOT_AVAILABLE: {
    az: 'Bu məhsul üçün qiymət yoxdur.',
    ru: 'Для этого товара нет цены.',
    tr: 'Bu ürün için fiyat yok.',
  },
  QTY_NOT_MULTIPLE: {
    az: 'Miqdar qablaşdırma vahidinin misli olmalıdır.',
    ru: 'Количество должно быть кратно единице упаковки.',
    tr: 'Miktar ambalaj biriminin katı olmalı.',
  },
  BELOW_MIN_ORDER_QTY: {
    az: 'Miqdar minimum sifariş miqdarından azdır.',
    ru: 'Количество меньше минимального количества заказа.',
    tr: 'Miktar en az sipariş miktarının altında.',
  },
  BELOW_MIN_ORDER_AMOUNT: {
    az: 'Sifariş məbləği minimum məbləğdən azdır.',
    ru: 'Сумма заказа меньше минимальной.',
    tr: 'Sipariş tutarı en az tutarın altında.',
  },
  VARIANT_UNAVAILABLE: {
    az: 'Bu məhsul variantı mövcud deyil.',
    ru: 'Этот вариант товара недоступен.',
    tr: 'Bu ürün varyantı kullanılamıyor.',
  },
  CURRENCY_MISMATCH: {
    az: 'Fərqli valyutada olan məhsullar eyni sifarişdə ola bilməz.',
    ru: 'Товары в разных валютах не могут быть в одном заказе.',
    tr: 'Farklı para birimindeki ürünler aynı siparişte olamaz.',
  },
  STOCK_INSUFFICIENT: {
    az: 'Anbarda kifayət qədər məhsul yoxdur.',
    ru: 'Недостаточно товара на складе.',
    tr: 'Stok yetersiz.',
  },
  ORDER_QTY_INCREASE_NOT_ALLOWED: {
    az: 'Sifarişdə miqdarı artırmaq olmaz.',
    ru: 'Увеличивать количество в заказе нельзя.',
    tr: 'Siparişte miktar artırılamaz.',
  },
  ORDER_EMPTY_USE_REJECT: {
    az: 'Bütün sətirləri silmək olmaz; sifarişi rədd edin.',
    ru: 'Нельзя удалить все строки; отклоните заказ.',
    tr: 'Tüm satırlar silinemez; siparişi reddedin.',
  },
  DELIVERY_PHOTO_REQUIRED: {
    az: 'Təhvil üçün foto tələb olunur.',
    ru: 'Для доставки требуется фото.',
    tr: 'Teslim için fotoğraf gerekiyor.',
  },
  DELIVERY_TIMESTAMP_TOO_OLD: {
    az: 'Təhvil vaxtı çox köhnədir.',
    ru: 'Время доставки слишком старое.',
    tr: 'Teslim zamanı çok eski.',
  },
  FILE_INVALID: {
    az: 'Fayl yanlışdır və ya dəstəklənmir.',
    ru: 'Файл неверный или не поддерживается.',
    tr: 'Dosya geçersiz veya desteklenmiyor.',
  },
  IMPORT_TOO_MANY_ROWS: {
    az: 'Faylda çox sayda sətir var.',
    ru: 'В файле слишком много строк.',
    tr: 'Dosyada çok fazla satır var.',
  },
  SETTING_OUT_OF_RANGE: {
    az: 'Ayar dəyəri icazə verilən hədlərdən kənardadır.',
    ru: 'Значение настройки вне допустимых пределов.',
    tr: 'Ayar değeri izin verilen sınırların dışında.',
  },
  SETTING_SCOPE_NOT_ALLOWED: {
    az: 'Bu ayar yalnız platform səviyyəsində dəyişdirilə bilər.',
    ru: 'Эту настройку можно изменить только на уровне платформы.',
    tr: 'Bu ayar yalnızca platform düzeyinde değiştirilebilir.',
  },
  JOB_TITLE_IN_USE: {
    az: 'Bu vəzifə istifadədədir; silinə bilməz, yalnız deaktiv edilə bilər.',
    ru: 'Эта должность используется: удалить нельзя, можно только деактивировать.',
    tr: 'Bu unvan kullanımda; silinemez, yalnızca pasifleştirilebilir.',
  },
  // F3.6a: çeviriler taslak, kullanıcı onayı bekliyor.
  PRICE_LIST_IN_USE: {
    az: 'Bu qiymət siyahısı müştərilərə təyin olunub. Əvvəlcə həmin müştəriləri başqa siyahıya keçirin.',
    ru: 'Этот прайс-лист назначен клиентам. Сначала переведите их на другой прайс-лист.',
    tr: 'Bu fiyat listesi müşterilere atanmış. Önce o müşterileri başka bir listeye taşıyın.',
  },
  PRICE_LIST_DEFAULT_PROTECTED: {
    az: 'Əsas qiymət siyahısı arxivləşdirilə bilməz. Əvvəlcə başqa siyahını əsas edin.',
    ru: 'Основной прайс-лист нельзя архивировать. Сначала сделайте основным другой прайс-лист.',
    tr: 'Varsayılan fiyat listesi arşivlenemez. Önce başka bir listeyi varsayılan yapın.',
  },
  // F3.10: çeviriler taslak, kullanıcı onayı bekliyor.
  STOCK_MODE_MISMATCH: {
    az: 'Bu əməliyyat cari stok rejimində mümkün deyil. Ayarlarda stok rejimini yoxlayın.',
    ru: 'Это действие недоступно в текущем режиме учёта остатков. Проверьте режим в настройках.',
    tr: 'Bu işlem mevcut stok modunda yapılamaz. Ayarlardan stok modunu kontrol edin.',
  },
  // F3.11a: çeviriler taslak, kullanıcı onayı bekliyor.
  STOCK_UNCOUNTED_VARIANTS: {
    az: 'Bəzi məhsulların stoku hələ daxil edilməyib. Onlar pərakəndəçidə "Stokda yoxdur" görünəcək.',
    ru: 'Остатки некоторых товаров ещё не введены. У розничных покупателей они будут показаны как «Нет в наличии».',
    tr: 'Bazı ürünlerin stoğu henüz girilmedi. Bu ürünler perakendecide "Stokta yok" görünecek.',
  },
  INTERNAL_ERROR: {
    az: 'Gözlənilməz xəta baş verdi. Bir az sonra yenidən cəhd edin.',
    ru: 'Произошла непредвиденная ошибка. Повторите попытку позже.',
    tr: 'Beklenmeyen bir hata oluştu. Biraz sonra tekrar deneyin.',
  },
};
