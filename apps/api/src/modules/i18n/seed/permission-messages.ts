// İzin ve izin modülü adları (`ui_translations`, anahtar `permissions.<kod>` ve
// `permissions.module.<modül>`; F2.8 rol düzenleyici, US-014). Tip Record<PermissionCode, …>
// olduğu için yeni izin çevirisiz derlenmez. Taslak AI tarafından yazıldı; az/ru/tr onayı platform
// sahibinde. Kapsam adları `team.scope.<kapsam>` (ui-messages.ts).
import type { PermissionCode } from '@b2b/shared';
import type { ErrorMessageText } from './error-messages';

const PERMISSION_NAMES: Readonly<Record<PermissionCode, ErrorMessageText>> = {
  'business.manage': {
    az: 'Şirkət profilini idarə etmək',
    ru: 'Управление профилем компании',
    tr: 'İşletme profilini yönetmek',
  },
  'team.manage': { az: 'Komandanı idarə etmək', ru: 'Управление командой', tr: 'Ekibi yönetmek' },
  'audit.view': {
    az: 'Audit jurnalına baxmaq',
    ru: 'Просмотр журнала аудита',
    tr: 'Denetim kaydını görmek',
  },
  'reports.view': { az: 'Hesabatlara baxmaq', ru: 'Просмотр отчётов', tr: 'Raporları görmek' },
  'documents.generate': {
    az: 'Sənəd hazırlamaq',
    ru: 'Формирование документов',
    tr: 'Belge oluşturmak',
  },
  'directory.search': {
    az: 'Pərakəndəçi kataloqunda axtarış',
    ru: 'Поиск в каталоге розничных клиентов',
    tr: 'Perakendeci dizininde arama',
  },
  'connections.view': {
    az: 'Bağlantılara baxmaq',
    ru: 'Просмотр связей',
    tr: 'Bağlantıları görmek',
  },
  'connections.request.send': {
    az: 'Bağlantı sorğusu göndərmək',
    ru: 'Отправка запроса на связь',
    tr: 'Bağlantı isteği göndermek',
  },
  'connections.terms.manage': {
    az: 'Bağlantı şərtlərini idarə etmək',
    ru: 'Управление условиями связи',
    tr: 'Bağlantı koşullarını yönetmek',
  },
  'connections.request.respond': {
    az: 'Bağlantı sorğusuna cavab vermək',
    ru: 'Ответ на запрос связи',
    tr: 'Bağlantı isteğini yanıtlamak',
  },
  'connections.block': {
    az: 'Topdançını bloklamaq',
    ru: 'Блокировка оптовика',
    tr: 'Toptancıyı engellemek',
  },
  'connections.cancel': {
    az: 'Bağlantını ləğv etmək',
    ru: 'Отмена связи',
    tr: 'Bağlantıyı iptal etmek',
  },
  'catalog.view': { az: 'Kataloqa baxmaq', ru: 'Просмотр каталога', tr: 'Kataloğu görmek' },
  'catalog.manage': {
    az: 'Kataloqu idarə etmək',
    ru: 'Управление каталогом',
    tr: 'Kataloğu yönetmek',
  },
  'catalog.browse': {
    az: 'Topdançı məhsullarına baxmaq',
    ru: 'Просмотр товаров оптовиков',
    tr: 'Toptancı ürünlerine göz atmak',
  },
  'imports.run': { az: 'Məhsul idxalı', ru: 'Импорт товаров', tr: 'Ürün içe aktarma' },
  'pricing.view': { az: 'Qiymətlərə baxmaq', ru: 'Просмотр цен', tr: 'Fiyatları görmek' },
  'pricing.manage': {
    az: 'Qiymətləri idarə etmək',
    ru: 'Управление ценами',
    tr: 'Fiyatları yönetmek',
  },
  'inventory.view': { az: 'Stoka baxmaq', ru: 'Просмотр остатков', tr: 'Stoku görmek' },
  'inventory.manage': { az: 'Stoku idarə etmək', ru: 'Управление остатками', tr: 'Stoku yönetmek' },
  'cart.edit': {
    az: 'Səbəti redaktə etmək',
    ru: 'Редактирование корзины',
    tr: 'Sepeti düzenlemek',
  },
  'cart.submit': {
    az: 'Səbəti təsdiqə göndərmək',
    ru: 'Отправка корзины на утверждение',
    tr: 'Sepeti onaya göndermek',
  },
  'cart.approve': { az: 'Səbəti təsdiqləmək', ru: 'Утверждение корзины', tr: 'Sepeti onaylamak' },
  'orders.view': { az: 'Sifarişlərə baxmaq', ru: 'Просмотр заказов', tr: 'Siparişleri görmek' },
  'orders.approve': {
    az: 'Sifarişi təsdiqləmək',
    ru: 'Подтверждение заказа',
    tr: 'Siparişi onaylamak',
  },
  'orders.prepare': { az: 'Sifarişi hazırlamaq', ru: 'Сборка заказа', tr: 'Siparişi hazırlamak' },
  'orders.cancel': { az: 'Sifarişi ləğv etmək', ru: 'Отмена заказа', tr: 'Siparişi iptal etmek' },
  'orders.cancel_own': {
    az: 'Öz sifarişini ləğv etmək',
    ru: 'Отмена своего заказа',
    tr: 'Kendi siparişini iptal etmek',
  },
  'orders.confirm_delivery': {
    az: 'Çatdırılmanı təsdiqləmək',
    ru: 'Подтверждение доставки',
    tr: 'Teslimi onaylamak',
  },
  'orders.resolve_dispute': {
    az: 'Mübahisəni həll etmək',
    ru: 'Решение спора',
    tr: 'Anlaşmazlığı çözmek',
  },
  'orders.create_on_behalf': {
    az: 'Müştəri adından sifariş yaratmaq',
    ru: 'Заказ от имени клиента',
    tr: 'Müşteri adına sipariş oluşturmak',
  },
  'delivery.view': {
    az: 'Çatdırılmalara baxmaq',
    ru: 'Просмотр доставок',
    tr: 'Teslimatları görmek',
  },
  'delivery.assign': { az: 'Kuryer təyin etmək', ru: 'Назначение курьера', tr: 'Kargocu atamak' },
  'delivery.update_own': {
    az: 'Öz çatdırılmasını yeniləmək',
    ru: 'Обновление своей доставки',
    tr: 'Kendi teslimatını güncellemek',
  },
  'ledger.view': { az: 'Cari hesaba baxmaq', ru: 'Просмотр взаиморасчётов', tr: 'Cariyi görmek' },
  'ledger.payment.create': {
    az: 'Ödəniş qeyd etmək',
    ru: 'Регистрация оплаты',
    tr: 'Ödeme kaydetmek',
  },
  'ledger.payment.review': {
    az: 'Ödənişi yoxlamaq',
    ru: 'Проверка оплаты',
    tr: 'Ödemeyi incelemek',
  },
  'ledger.courier_cash.manage': {
    az: 'Kuryer nağdını idarə etmək',
    ru: 'Управление наличными курьеров',
    tr: 'Kargocu nakdini yönetmek',
  },
  'ledger.export': {
    az: 'Cari hesabı ixrac etmək',
    ru: 'Экспорт взаиморасчётов',
    tr: 'Cariyi dışa aktarmak',
  },
};

const MODULE_NAMES: Readonly<Record<string, ErrorMessageText>> = {
  business: { az: 'Şirkət', ru: 'Компания', tr: 'İşletme' },
  team: { az: 'Komanda', ru: 'Команда', tr: 'Ekip' },
  audit: { az: 'Audit', ru: 'Аудит', tr: 'Denetim' },
  reports: { az: 'Hesabatlar', ru: 'Отчёты', tr: 'Raporlar' },
  documents: { az: 'Sənədlər', ru: 'Документы', tr: 'Belgeler' },
  directory: { az: 'Kataloq axtarışı', ru: 'Поиск клиентов', tr: 'Dizin' },
  connections: { az: 'Bağlantılar', ru: 'Связи', tr: 'Bağlantılar' },
  catalog: { az: 'Məhsullar', ru: 'Товары', tr: 'Ürünler' },
  imports: { az: 'İdxal', ru: 'Импорт', tr: 'İçe aktarma' },
  pricing: { az: 'Qiymətlər', ru: 'Цены', tr: 'Fiyatlar' },
  inventory: { az: 'Stok', ru: 'Остатки', tr: 'Stok' },
  cart: { az: 'Səbət', ru: 'Корзина', tr: 'Sepet' },
  orders: { az: 'Sifarişlər', ru: 'Заказы', tr: 'Siparişler' },
  delivery: { az: 'Çatdırılma', ru: 'Доставка', tr: 'Teslimat' },
  ledger: { az: 'Cari hesab', ru: 'Взаиморасчёты', tr: 'Cari' },
};

export const PERMISSION_MESSAGES: Readonly<Record<string, ErrorMessageText>> = {
  ...Object.fromEntries(
    Object.entries(PERMISSION_NAMES).map(([code, text]) => [`permissions.${code}`, text]),
  ),
  ...Object.fromEntries(
    Object.entries(MODULE_NAMES).map(([module, text]) => [`permissions.module.${module}`, text]),
  ),
};
