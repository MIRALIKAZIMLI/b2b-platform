import { PERMISSION_CODES, PERMISSIONS } from '@b2b/shared';
import { describe, expect, it } from 'vitest';
import { MENUS, type ShellArea, visibleMenu } from '../menu';

const keys = (area: ShellArea, permissions: readonly string[]) =>
  visibleMenu(area, permissions).map((item) => item.key);

describe('İzinden menü', () => {
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
});
