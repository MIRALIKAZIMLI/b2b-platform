// İzin kataloğu (ADR-0004, c4-component §5 — tek kaynak). Her izin bir yeteneğe (`seller`,
// `buyer` veya ikisi için `any`) bağlıdır ve verilebileceği kapsamları taşır. Liste c4 §5
// tablosuyla ve seed edilen `permissions` satırlarıyla birebir aynıdır (F1.8-AC6 testleri).
// Yeni izin: önce c4 §5, sonra bu dosya; seed `permissions` tablosuna ekler.

export const PERMISSION_SCOPES = ['all', 'branch', 'warehouse', 'assigned'] as const;
export type PermissionScope = (typeof PERMISSION_SCOPES)[number];

export function isPermissionScope(value: string): value is PermissionScope {
  return (PERMISSION_SCOPES as readonly string[]).includes(value);
}

export const PERMISSION_CAPABILITIES = ['seller', 'buyer', 'any'] as const;
export type PermissionCapability = (typeof PERMISSION_CAPABILITIES)[number];

export interface PermissionDefinition {
  readonly capability: PermissionCapability;
  readonly scopes: readonly [PermissionScope, ...PermissionScope[]];
}

export const PERMISSIONS = {
  'business.manage': { capability: 'any', scopes: ['all'] },
  'team.manage': { capability: 'any', scopes: ['all'] },
  'audit.view': { capability: 'any', scopes: ['all'] },
  'reports.view': { capability: 'any', scopes: ['all', 'branch', 'warehouse', 'assigned'] },
  'documents.generate': { capability: 'any', scopes: ['all', 'branch', 'assigned'] },
  'directory.search': { capability: 'seller', scopes: ['all', 'assigned'] },
  'connections.view': { capability: 'any', scopes: ['all', 'assigned'] },
  'connections.request.send': { capability: 'seller', scopes: ['all', 'assigned'] },
  'connections.terms.manage': { capability: 'seller', scopes: ['all'] },
  'connections.request.respond': { capability: 'buyer', scopes: ['all'] },
  'connections.block': { capability: 'buyer', scopes: ['all'] },
  'connections.cancel': { capability: 'any', scopes: ['all'] },
  'catalog.view': { capability: 'seller', scopes: ['all'] },
  'catalog.manage': { capability: 'seller', scopes: ['all'] },
  'catalog.browse': { capability: 'buyer', scopes: ['all', 'branch'] },
  'imports.run': { capability: 'seller', scopes: ['all'] },
  'pricing.view': { capability: 'seller', scopes: ['all', 'assigned'] },
  'pricing.manage': { capability: 'seller', scopes: ['all'] },
  'inventory.view': { capability: 'seller', scopes: ['all', 'warehouse'] },
  'inventory.manage': { capability: 'seller', scopes: ['all', 'warehouse'] },
  'cart.edit': { capability: 'buyer', scopes: ['branch'] },
  'cart.submit': { capability: 'buyer', scopes: ['branch'] },
  'cart.approve': { capability: 'buyer', scopes: ['branch'] },
  'orders.view': { capability: 'any', scopes: ['all', 'branch', 'assigned'] },
  'orders.approve': { capability: 'seller', scopes: ['all'] },
  'orders.prepare': { capability: 'seller', scopes: ['all', 'warehouse'] },
  'orders.cancel': { capability: 'seller', scopes: ['all'] },
  'orders.cancel_own': { capability: 'buyer', scopes: ['branch'] },
  'orders.confirm_delivery': { capability: 'buyer', scopes: ['branch'] },
  'orders.resolve_dispute': { capability: 'seller', scopes: ['all'] },
  'orders.create_on_behalf': { capability: 'seller', scopes: ['assigned'] },
  'delivery.view': { capability: 'seller', scopes: ['all', 'warehouse'] },
  'delivery.assign': { capability: 'seller', scopes: ['all', 'warehouse'] },
  'delivery.update_own': { capability: 'seller', scopes: ['assigned'] },
  'ledger.view': { capability: 'any', scopes: ['all', 'assigned'] },
  'ledger.payment.create': { capability: 'seller', scopes: ['all', 'assigned'] },
  'ledger.payment.review': { capability: 'seller', scopes: ['all'] },
  'ledger.courier_cash.manage': { capability: 'seller', scopes: ['all'] },
  'ledger.export': { capability: 'seller', scopes: ['all'] },
} as const satisfies Record<string, PermissionDefinition>;

export type PermissionCode = keyof typeof PERMISSIONS;

export const PERMISSION_CODES = Object.keys(PERMISSIONS) as PermissionCode[];

export function isPermissionCode(value: string): value is PermissionCode {
  return Object.hasOwn(PERMISSIONS, value);
}

/** İznin modülü: kodun ilk bölümü (`orders.approve` → `orders`). */
export function permissionModule(code: PermissionCode): string {
  return code.slice(0, code.indexOf('.'));
}

/** Kapsam bu izin için verilebilir mi? (role_permissions yazılırken denetlenir.) */
export function isScopeAllowed(code: PermissionCode, scope: PermissionScope): boolean {
  return (PERMISSIONS[code].scopes as readonly PermissionScope[]).includes(scope);
}

/** İzin bu yetenekteki bir role verilebilir mi? (`any` her iki yetenekte geçerli.) */
export function isPermissionForCapability(
  code: PermissionCode,
  capability: 'seller' | 'buyer',
): boolean {
  const own = PERMISSIONS[code].capability;
  return own === 'any' || own === capability;
}
