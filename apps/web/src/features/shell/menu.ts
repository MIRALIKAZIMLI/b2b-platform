// İzinden oluşan menü (F1.13b; productreport "Ekranlar ve rol bazlı görünüm", "Rol ve yetki"):
// menü sabit değildir, `/me` → `activeBusiness.permissions` ile süzülür; izni olmayan öğe hiç
// görünmez. Bu yalnızca görünümdür; asıl yetki kontrolü API'dedir.
// Öğe → izin eşlemesi c4-component §5 kodlarıyla (tip `@b2b/shared` PermissionCode). `anyOf` boşsa
// öğe herkese açıktır (açılış sayfası = dashboard). Metin: `shell.menu.<key>` çeviri anahtarı.
import type { PermissionCode } from '@b2b/shared';

/** Kabuk alanları: platform admini, toptancı (`seller`), perakendeci (`buyer`). */
export type ShellArea = 'admin' | 'seller' | 'buyer';

export interface MenuItem {
  /** Çeviri anahtarı `shell.menu.<key>` ve adres parçası. */
  readonly key: string;
  /** Bunlardan biri varsa görünür; boş dizi = herkese açık. */
  readonly anyOf: readonly PermissionCode[];
  /** Ekran yapıldı mı? Yapılmayan öğe bağlantısız gösterilir (F2+). */
  readonly ready: boolean;
}

const dashboard: MenuItem = { key: 'dashboard', anyOf: [], ready: true };

function soon(key: string, anyOf: readonly PermissionCode[]): MenuItem {
  return { key, anyOf, ready: false };
}

export const MENUS: Readonly<Record<ShellArea, readonly MenuItem[]>> = {
  // Platform rolleri izin kodu kullanmaz (c4 §5); ekran → platform rolü eşlemesi belgede yok.
  // Şimdilik yalnızca dashboard; platform ekranları kendi adımlarında eklenir.
  admin: [dashboard],
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
    soon('team', ['team.manage']),
    soon('audit', ['audit.view']),
    soon('settings', ['business.manage']),
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
    soon('team', ['team.manage']),
    soon('audit', ['audit.view']),
    soon('profile', ['business.manage']),
  ],
};

/** Kullanıcının izinlerine göre görünen menü (F1.13-AC5). */
export function visibleMenu(area: ShellArea, permissions: readonly string[]): MenuItem[] {
  const granted = new Set(permissions);
  return MENUS[area].filter(
    (item) => item.anyOf.length === 0 || item.anyOf.some((code) => granted.has(code)),
  );
}
