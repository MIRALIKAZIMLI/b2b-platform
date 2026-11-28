// İzinden oluşan menü (F1.13b; web ve mobil ortak tanımı F1.14b; productreport "Ekranlar ve rol
// bazlı görünüm", "Rol ve yetki"): menü sabit değildir, `/me` → `activeBusiness.permissions` ile süzülür; izni olmayan öğe hiç
// görünmez. Bu yalnızca görünümdür; asıl yetki kontrolü API'dedir.
// Öğe → izin eşlemesi c4-component §5 kodlarıyla (tip `@b2b/shared` PermissionCode). `anyOf` boşsa
// öğe herkese açıktır (açılış sayfası = dashboard). Metin: `shell.menu.<key>` çeviri anahtarı.
import { SETTINGS_ADMIN_ROLES } from './admin-settings';
import { BUYER_ADMIN_READ_ROLES } from './buyer-moderation';
import type { PermissionCode } from './permissions';
import type { PlatformRole } from './platform-roles';
import { CATALOG_ADMIN_ROLES } from './role-catalog';

/** Kabuk alanları: platform admini, toptancı (`seller`), perakendeci (`buyer`). */
export type ShellArea = 'admin' | 'seller' | 'buyer';

export interface MenuItem {
  /** Çeviri anahtarı `shell.menu.<key>` ve adres parçası. */
  readonly key: string;
  /** Bunlardan biri varsa görünür; boş dizi = herkese açık. */
  readonly anyOf: readonly PermissionCode[];
  /** Ekran yapıldı mı? Yapılmayan öğe bağlantısız gösterilir (F2+). */
  readonly ready: boolean;
  /** Alan içindeki adres parçası (`/<dil>/<alan>/<path>`); yoksa alanın açılış sayfası. */
  readonly path?: string;
  /**
   * Yalnız platform alanı (`admin`): öğeyi görebilen platform rolleri. Platform rolleri izin kodu
   * kullanmaz (c4 §5); verilmezse her platform rolü görür.
   */
  readonly platformRoles?: readonly PlatformRole[];
}

const dashboard: MenuItem = { key: 'dashboard', anyOf: [], ready: true };

/** F2 S1 = A (platform sahibi, 2026-10-31): toptancıyı süper admin ve operasyon açar. */
export const SELLER_ADMIN_ROLES: readonly PlatformRole[] = ['super_admin', 'operations'];

function soon(key: string, anyOf: readonly PermissionCode[]): MenuItem {
  return { key, anyOf, ready: false };
}

export const MENUS: Readonly<Record<ShellArea, readonly MenuItem[]>> = {
  // Platform rolleri izin kodu kullanmaz (c4 §5); öğe → platform rolü eşlemesi `platformRoles`
  // (F2 faz spesifikasyonu §4). Platform ekranları kendi adımlarında eklenir.
  admin: [
    dashboard,
    {
      key: 'sellers',
      anyOf: [],
      ready: true,
      path: 'sellers',
      platformRoles: SELLER_ADMIN_ROLES,
    },
    // F2.2b: toptancı başvuruları (US-008), aynı roller.
    {
      key: 'seller_applications',
      anyOf: [],
      ready: true,
      path: 'seller-applications',
      platformRoles: SELLER_ADMIN_ROLES,
    },
    // F2.18b: perakendeci moderasyonu (US-015, US-016); destek yalnız görür (yazma düğmeleri yok).
    {
      key: 'buyers',
      anyOf: [],
      ready: true,
      path: 'buyers',
      platformRoles: BUYER_ADMIN_READ_ROLES,
    },
    // F2.9b: unvan ve rol şablonu kataloğu (US-012), süper admin + içerik (V1).
    {
      key: 'role_templates',
      anyOf: [],
      ready: true,
      path: 'role-templates',
      platformRoles: CATALOG_ADMIN_ROLES,
    },
    {
      key: 'job_titles',
      anyOf: [],
      ready: true,
      path: 'job-titles',
      platformRoles: CATALOG_ADMIN_ROLES,
    },
    // F3.1: birim kataloğu (US-028), F2.9 V1 ile aynı roller.
    {
      key: 'units',
      anyOf: [],
      ready: true,
      path: 'units',
      platformRoles: CATALOG_ADMIN_ROLES,
    },
    // F3.2b: kategori ağacı, markalar (talep onayı), faaliyet alanları (US-029); F3.2a uçlarıyla
    // aynı roller (süper admin + içerik).
    {
      key: 'categories',
      anyOf: [],
      ready: true,
      path: 'categories',
      platformRoles: CATALOG_ADMIN_ROLES,
    },
    {
      key: 'brands',
      anyOf: [],
      ready: true,
      path: 'brands',
      platformRoles: CATALOG_ADMIN_ROLES,
    },
    {
      key: 'activity_types',
      anyOf: [],
      ready: true,
      path: 'activity-types',
      platformRoles: CATALOG_ADMIN_ROLES,
    },
    // F2.19: sistem ayarları (US-017), yalnız süper admin (T1).
    {
      key: 'settings',
      anyOf: [],
      ready: true,
      path: 'settings',
      platformRoles: SETTINGS_ADMIN_ROLES,
    },
  ],
  // productreport "Toptancı — Web"; `audit` c4 §5 (`audit.view`, US-057).
  seller: [
    dashboard,
    // F2.11b: perakendeci dizini (US-019, US-020); web + mobil (temsilci).
    { key: 'directory', anyOf: ['directory.search'], ready: true, path: 'directory' },
    // F2.14b: bağlı perakendeciler ve bağlantı koşulları (US-024); yalnız web.
    { key: 'customers', anyOf: ['connections.view'], ready: true, path: 'customers' },
    // F2.12b: gönderilen bağlantı istekleri (US-021); web + mobil.
    { key: 'requests', anyOf: ['connections.request.send'], ready: true, path: 'requests' },
    // F3.3b: ürün listesi ve formu (US-030); yalnız web.
    { key: 'products', anyOf: ['catalog.view'], ready: true, path: 'products' },
    // F3.6b: fiyat listeleri (US-034); fiyat girişi ürün formunda. Yalnız web.
    { key: 'prices', anyOf: ['pricing.view'], ready: true, path: 'prices' },
    // F3.11b: depo stok ekranı (US-039); web. F3.11d: mobil.
    { key: 'stock', anyOf: ['inventory.view'], ready: true, path: 'stock' },
    soon('orders', ['orders.view', 'orders.prepare']),
    soon('delivery', ['delivery.view']),
    soon('ledger', ['ledger.view']),
    soon('reports', ['reports.view']),
    { key: 'team', anyOf: ['team.manage'], ready: true, path: 'team' },
    soon('audit', ['audit.view']),
    // F2.6: satıcı profili, depolar, hizmet bölgeleri (US-011).
    { key: 'settings', anyOf: ['business.manage'], ready: true, path: 'settings' },
  ],
  // productreport "Perakendeci — Mobil" (web'de aynısı).
  buyer: [
    dashboard,
    // F2.13b: gelen bağlantı istekleri + engellenenler (US-023).
    {
      key: 'incoming_requests',
      anyOf: ['connections.view'],
      ready: true,
      path: 'incoming-requests',
    },
    soon('products', ['catalog.browse']),
    soon('cart', ['cart.edit']),
    soon('approvals', ['cart.approve']),
    soon('orders', ['orders.view']),
    // F2.15b: bağlı toptancılar ve iptal (US-025).
    { key: 'suppliers', anyOf: ['connections.view'], ready: true, path: 'suppliers' },
    soon('ledger', ['ledger.view']),
    { key: 'team', anyOf: ['team.manage'], ready: true, path: 'team' },
    // F2.5b: şubeler ve onay kuralı (US-010); web + mobil.
    { key: 'branches', anyOf: ['business.manage'], ready: true, path: 'branches' },
    soon('audit', ['audit.view']),
    // F2.4: işletme profili ve VÖEN (US-006); gizlilik ayarları F2.10'da aynı sayfaya eklenir.
    { key: 'profile', anyOf: ['business.manage'], ready: true, path: 'profile' },
  ],
};

/**
 * Kullanıcının izinlerine (ve platform alanında platform rolüne) göre görünen menü (F1.13-AC5,
 * F2.1b-AC5). İşletme alanlarında `platformRole` kullanılmaz.
 */
export function visibleMenu(
  area: ShellArea,
  permissions: readonly string[],
  platformRole: string | null = null,
): MenuItem[] {
  const granted = new Set(permissions);
  return MENUS[area].filter(
    (item) =>
      (item.anyOf.length === 0 || item.anyOf.some((code) => granted.has(code))) &&
      (item.platformRoles === undefined || platformRoleAllows(item.platformRoles, platformRole)),
  );
}

/** Platform rolü bu öğeyi görebilir mi? (sayfa düzeyinde yönlendirme için; F2.1b-AC5) */
export function platformRoleAllows(
  roles: readonly PlatformRole[],
  platformRole: string | null,
): boolean {
  return platformRole !== null && (roles as readonly string[]).includes(platformRole);
}
