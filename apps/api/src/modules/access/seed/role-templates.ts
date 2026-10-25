// Varsayılan rol şablonları ve unvanlar (c4-component §5 "Rol şablonları", productreport
// "Varsayılan rol şablonları — Toptancı / Perakendeci"). Eşleme c4 §5'teki şablon tablosuyla
// birebir aynıdır (test: role-templates.test.ts; seed satırları access.int.test.ts). Analiz raporu ile izin kataloğu arasındaki 7 fark
// için daha dar (az yetkili) seçenek seçildi; "varsayılan, kullanıcı onayı bekliyor" (Mimar, F1.8a).
// Adlar az/ru/tr taslağıdır (AI); `en` boş bırakıldı. Her şablona aynı kodla bir unvan açılır.
import {
  isPermissionCode,
  PERMISSION_CODES,
  type PermissionCode,
  type PermissionScope,
  PERMISSIONS,
} from '@b2b/shared';

type Name = Readonly<Record<'az' | 'ru' | 'tr', string>>;

export interface SeedRoleTemplate {
  readonly code: string;
  readonly capability: 'seller' | 'buyer';
  readonly isBusinessAdmin: boolean;
  readonly name: Name;
  readonly permissions: Readonly<Partial<Record<PermissionCode, PermissionScope>>>;
}

/**
 * İşletme Admini: yeteneğine açık her izin. Kapsam `all` verilebiliyorsa `all`, değilse iznin tek
 * kapsamı (`assigned`). Yalnızca `branch` kapsamlı perakendeci izinleri (sepet, kendi siparişini
 * iptal, teslim onayı) admin şablonuna girmez (fark 1).
 */
function adminPermissions(
  capability: 'seller' | 'buyer',
): Partial<Record<PermissionCode, PermissionScope>> {
  const result: Partial<Record<PermissionCode, PermissionScope>> = {};
  for (const code of PERMISSION_CODES) {
    const definition = PERMISSIONS[code];
    if (definition.capability !== 'any' && definition.capability !== capability) continue;
    const scopes: readonly PermissionScope[] = definition.scopes;
    if (scopes.includes('all')) {
      result[code] = 'all';
    } else if (capability === 'seller' && scopes.length === 1 && scopes[0] === 'assigned') {
      result[code] = 'assigned';
    }
  }
  return result;
}

const ADMIN_NAME: Name = {
  az: 'Biznes admini',
  ru: 'Администратор бизнеса',
  tr: 'İşletme Admini',
};
const ACCOUNTANT_NAME: Name = { az: 'Mühasib', ru: 'Бухгалтер', tr: 'Muhasebe' };

export const SEED_ROLE_TEMPLATES: readonly SeedRoleTemplate[] = [
  {
    code: 'seller_business_admin',
    capability: 'seller',
    isBusinessAdmin: true,
    name: ADMIN_NAME,
    permissions: adminPermissions('seller'),
  },
  {
    code: 'seller_sales_manager',
    capability: 'seller',
    isBusinessAdmin: false,
    name: { az: 'Satış meneceri', ru: 'Менеджер по продажам', tr: 'Satış Müdürü' },
    permissions: {
      'catalog.view': 'all',
      'catalog.manage': 'all',
      'pricing.view': 'all',
      'pricing.manage': 'all',
      'inventory.view': 'all',
      'directory.search': 'all',
      'connections.view': 'all',
      'connections.request.send': 'all',
      'connections.terms.manage': 'all',
      'connections.cancel': 'all',
      'orders.view': 'all',
      'orders.approve': 'all',
      'delivery.view': 'all',
      'ledger.view': 'all',
      'reports.view': 'all',
    },
  },
  {
    code: 'seller_sales_rep',
    capability: 'seller',
    isBusinessAdmin: false,
    name: { az: 'Satış nümayəndəsi', ru: 'Торговый представитель', tr: 'Satış Temsilcisi' },
    permissions: {
      'directory.search': 'assigned',
      'connections.view': 'assigned',
      'connections.request.send': 'assigned',
      'catalog.view': 'all',
      'pricing.view': 'assigned',
      'orders.view': 'assigned',
      'ledger.view': 'assigned',
      'ledger.payment.create': 'assigned',
      'reports.view': 'assigned',
    },
  },
  {
    code: 'seller_accountant',
    capability: 'seller',
    isBusinessAdmin: false,
    name: ACCOUNTANT_NAME,
    permissions: {
      'catalog.view': 'all',
      'pricing.view': 'all',
      'inventory.view': 'all',
      'orders.view': 'all',
      'ledger.view': 'all',
      'ledger.payment.create': 'all',
      'ledger.payment.review': 'all',
      'ledger.courier_cash.manage': 'all',
      'ledger.export': 'all',
      'reports.view': 'all',
      'documents.generate': 'all',
    },
  },
  {
    code: 'seller_warehouse',
    capability: 'seller',
    isBusinessAdmin: false,
    name: { az: 'Anbar məsulu', ru: 'Ответственный за склад', tr: 'Depo Sorumlusu' },
    permissions: {
      'catalog.view': 'all',
      'inventory.view': 'warehouse',
      'inventory.manage': 'warehouse',
      'orders.prepare': 'warehouse',
      'delivery.view': 'warehouse',
      'delivery.assign': 'warehouse',
      'reports.view': 'warehouse',
    },
  },
  {
    code: 'seller_courier',
    capability: 'seller',
    isBusinessAdmin: false,
    name: { az: 'Kuryer', ru: 'Курьер', tr: 'Kargocu' },
    permissions: {
      'delivery.update_own': 'assigned',
      'orders.view': 'assigned',
      'ledger.payment.create': 'assigned',
    },
  },
  {
    code: 'buyer_business_admin',
    capability: 'buyer',
    isBusinessAdmin: true,
    name: ADMIN_NAME,
    permissions: adminPermissions('buyer'),
  },
  {
    code: 'buyer_branch_admin',
    capability: 'buyer',
    isBusinessAdmin: false,
    name: { az: 'Filial admini', ru: 'Администратор филиала', tr: 'Şube Admini' },
    permissions: {
      'catalog.browse': 'branch',
      'cart.edit': 'branch',
      'cart.submit': 'branch',
      'cart.approve': 'branch',
      'orders.view': 'branch',
      'orders.cancel_own': 'branch',
      'orders.confirm_delivery': 'branch',
    },
  },
  {
    code: 'buyer_purchaser',
    capability: 'buyer',
    isBusinessAdmin: false,
    name: { az: 'Satınalma məsulu', ru: 'Ответственный за закупки', tr: 'Satın Alma Sorumlusu' },
    permissions: {
      'catalog.browse': 'branch',
      'cart.edit': 'branch',
      'cart.submit': 'branch',
      'orders.view': 'branch',
      'connections.view': 'all',
    },
  },
  {
    code: 'buyer_accountant',
    capability: 'buyer',
    isBusinessAdmin: false,
    name: ACCOUNTANT_NAME,
    permissions: {
      'ledger.view': 'all',
      'documents.generate': 'all',
    },
  },
  {
    code: 'buyer_branch_staff',
    capability: 'buyer',
    isBusinessAdmin: false,
    name: { az: 'Filial işçisi', ru: 'Сотрудник филиала', tr: 'Şube Çalışanı' },
    permissions: {
      'catalog.browse': 'branch',
      'cart.edit': 'branch',
      'orders.view': 'branch',
      'orders.confirm_delivery': 'branch',
    },
  },
];

/** Şablon izinleri katalogla tutarlı mı? (yetenek ve kapsam). Seed bunu yazmadan önce çağırır. */
export function assertTemplateConsistent(template: SeedRoleTemplate): void {
  for (const [code, scope] of Object.entries(template.permissions)) {
    if (!isPermissionCode(code)) {
      throw new Error(`Şablon izni katalogda yok: ${template.code} ${code}`);
    }
    const definition = PERMISSIONS[code];
    if (definition.capability !== 'any' && definition.capability !== template.capability) {
      throw new Error(`Şablon izni yeteneğe uymuyor: ${template.code} ${code}`);
    }
    if (!(definition.scopes as readonly string[]).includes(scope)) {
      throw new Error(`Şablon kapsamı izinli değil: ${template.code} ${code} ${scope}`);
    }
  }
}
