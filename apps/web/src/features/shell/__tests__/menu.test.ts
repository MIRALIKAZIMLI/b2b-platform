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

  it('F2.1b-AC5: "Toptancılar" yalnız super_admin ve operations rolüne görünür (S1)', () => {
    // F2.2b: "Başvurular" aynı rollerle eklendi.
    expect(keys('admin', [], 'super_admin')).toEqual([
      'dashboard',
      'sellers',
      'seller_applications',
    ]);
    expect(visibleMenu('admin', [], 'operations').map((item) => item.key)).toEqual([
      'dashboard',
      'sellers',
      'seller_applications',
    ]);
    for (const role of ['support', 'content', null]) {
      expect(visibleMenu('admin', [], role).map((item) => item.key)).toEqual(['dashboard']);
    }
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
});
