import { PERMISSION_CODES, PERMISSIONS } from '@b2b/shared';
import { describe, expect, it } from 'vitest';
import {
  MENUS,
  platformRoleAllows,
  SELLER_ADMIN_ROLES,
  type ShellArea,
  visibleMenu,
} from '../menu';

const keys = (
  area: ShellArea,
  permissions: readonly string[],
  platformRole: string | null = null,
) => visibleMenu(area, permissions, platformRole).map((item) => item.key);

describe('İzinden menü', () => {
  it('US-013 AC5: ekip ekranı yalnız team.manage izniyle menüde görünür (seller + buyer)', () => {
    for (const area of ['seller', 'buyer'] as const) {
      expect(keys(area, ['orders.view'])).not.toContain('team');
      expect(keys(area, ['team.manage'])).toContain('team');
    }
  });

  it('F1.13-AC5: izni olmayan menü öğesi görünmez (Satış Temsilcisi)', () => {
    // c4 §5 seller_sales_rep izinleri.
    const rep = [
      'directory.search',
      'connections.view',
      'connections.request.send',
      'catalog.view',
      'pricing.view',
      'orders.view',
      'ledger.view',
      'ledger.payment.create',
      'reports.view',
    ];
    expect(keys('seller', rep)).toEqual([
      'dashboard',
      'directory',
      'customers',
      'requests',
      'products',
      'prices',
      'orders',
      'ledger',
      'reports',
    ]);
    expect(keys('seller', rep)).not.toContain('team');
    expect(keys('seller', rep)).not.toContain('settings');
  });

  it('F1.13-AC5: izin yoksa yalnızca açılış sayfası (dashboard) görünür', () => {
    for (const area of ['admin', 'seller', 'buyer'] as const) {
      expect(keys(area, [])).toEqual(['dashboard']);
    }
  });

  it('F1.13-AC5: öğe izinlerden herhangi biriyle görünür (Depo: orders.prepare → Siparişler)', () => {
    expect(keys('seller', ['orders.prepare'])).toEqual(['dashboard', 'orders']);
  });

  it('F1.13-AC5: perakendeci menüsü yalnızca buyer/any izinleri kullanır; kodlar katalogda', () => {
    for (const [area, items] of Object.entries(MENUS)) {
      for (const item of items) {
        for (const code of item.anyOf) {
          expect(PERMISSION_CODES).toContain(code);
          const capability = PERMISSIONS[code].capability;
          if (area === 'buyer') expect(capability).not.toBe('seller');
          if (area === 'seller') expect(capability).not.toBe('buyer');
        }
      }
    }
  });

  it('F1.13-AC5: Şube Admini menüsü (c4 §5 buyer_branch_admin)', () => {
    const branchAdmin = [
      'catalog.browse',
      'cart.edit',
      'cart.submit',
      'cart.approve',
      'orders.view',
      'orders.cancel_own',
      'orders.confirm_delivery',
    ];
    expect(keys('buyer', branchAdmin)).toEqual([
      'dashboard',
      'products',
      'cart',
      'approvals',
      'orders',
    ]);
  });

  it('F3.2b-AC5 kategori, marka, faaliyet alanı öğeleri yalnız süper admin ve içerik ekibine görünür', () => {
    const taxonomy = ['categories', 'brands', 'activity_types'];
    for (const role of ['super_admin', 'content'] as const) {
      const visible = visibleMenu('admin', [], role).map((item) => item.key);
      expect(taxonomy.every((key) => visible.includes(key))).toBe(true);
    }
    for (const role of ['operations', 'support', null] as const) {
      const visible = visibleMenu('admin', [], role).map((item) => item.key);
      expect(taxonomy.some((key) => visible.includes(key))).toBe(false);
    }
  });

  it('F2.1b-AC5: "Toptancılar" yalnız super_admin ve operations rolüne görünür (S1)', () => {
    // F2.2b: "Başvurular" aynı rollerle eklendi. F2.9b: katalog öğeleri süper admin + içerik (V1).
    // F2.19: "Ayarlar" yalnız süper admin (T1). F3.2b-AC5: kategori, marka, faaliyet alanı
    // öğeleri F3.2a uçlarıyla aynı roller (süper admin + içerik); operasyon görmez.
    expect(keys('admin', [], 'super_admin')).toEqual([
      'dashboard',
      'sellers',
      'seller_applications',
      'buyers',
      'role_templates',
      'job_titles',
      'units',
      'categories',
      'brands',
      'activity_types',
      'settings',
    ]);
    expect(visibleMenu('admin', [], 'operations').map((item) => item.key)).toEqual([
      'dashboard',
      'sellers',
      'seller_applications',
      'buyers',
    ]);
    expect(visibleMenu('admin', [], 'content').map((item) => item.key)).toEqual([
      'dashboard',
      'role_templates',
      'job_titles',
      'units',
      'categories',
      'brands',
      'activity_types',
    ]);
    // F2.18b: destek yalnız perakendecileri görür (yazma düğmeleri ekranda gizli).
    expect(visibleMenu('admin', [], 'support').map((item) => item.key)).toEqual([
      'dashboard',
      'buyers',
    ]);
    expect(visibleMenu('admin', [], null).map((item) => item.key)).toEqual(['dashboard']);
    expect(MENUS.admin.find((item) => item.key === 'activity_types')?.path).toBe('activity-types');
    expect(MENUS.admin.find((item) => item.key === 'sellers')?.path).toBe('sellers');
    expect(MENUS.admin.find((item) => item.key === 'seller_applications')?.path).toBe(
      'seller-applications',
    );
  });

  it('F2.1b-AC5: sayfa düzeyi kontrol aynı rol listesiyle', () => {
    expect(platformRoleAllows(SELLER_ADMIN_ROLES, 'super_admin')).toBe(true);
    expect(platformRoleAllows(SELLER_ADMIN_ROLES, 'operations')).toBe(true);
    expect(platformRoleAllows(SELLER_ADMIN_ROLES, 'support')).toBe(false);
    expect(platformRoleAllows(SELLER_ADMIN_ROLES, null)).toBe(false);
  });

  it('F2.1b-AC5: işletme alanlarında platform rolü menüyü değiştirmez', () => {
    expect(visibleMenu('seller', ['team.manage'], 'super_admin').map((item) => item.key)).toEqual([
      'dashboard',
      'team',
    ]);
  });
  it('F3.3b-AC1 toptancı "Məhsullar" menüsü catalog.view ile hazır ve products yoluna gider', () => {
    const item = visibleMenu('seller', ['catalog.view']).find((entry) => entry.key === 'products');
    expect(item).toMatchObject({ ready: true, path: 'products' });
    expect(visibleMenu('seller', ['team.manage']).map((entry) => entry.key)).not.toContain(
      'products',
    );
    // Perakendecinin ürün ekranı F3.12'de: hâlâ hazır değil.
    expect(MENUS.buyer.find((entry) => entry.key === 'products')?.ready).toBe(false);
  });
});
