// İzinden oluşan menü (F1.13b; web ve mobil ortak tanımı F1.14b; productreport "Ekranlar ve rol
// bazlı görünüm", "Rol ve yetki"): menü sabit değildir, `/me` → `activeBusiness.permissions` ile süzülür; izni olmayan öğe hiç
// görünmez. Bu yalnızca görünümdür; asıl yetki kontrolü API'dedir.
// Öğe → izin eşlemesi c4-component §5 kodlarıyla (tip `@b2b/shared` PermissionCode). `anyOf` boşsa
// öğe herkese açıktır (açılış sayfası = dashboard). Metin: `shell.menu.<key>` çeviri anahtarı.
import type { PermissionCode } from './permissions';
import type { PlatformRole } from './platform-roles';

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
  ],
  // productreport "Toptancı — Web"; `audit` c4 §5 (`audit.view`, US-057).
  seller: [
    dashboard,
    soon('directory', ['directory.search']),
    soon('customers', ['connections.view']),
    soon('requests', ['connections.request.send']),
    soon('products', ['catalog.view']),
    soon('prices', ['pricing.view']),
    soon('stock', ['inventory.view']),
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
    soon('incoming_requests', ['connections.view']),
    soon('products', ['catalog.browse']),
    soon('cart', ['cart.edit']),
    soon('approvals', ['cart.approve']),
    soon('orders', ['orders.view']),
    soon('suppliers', ['connections.cancel']),
    soon('ledger', ['ledger.view']),
    { key: 'team', anyOf: ['team.manage'], ready: true, path: 'team' },
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
