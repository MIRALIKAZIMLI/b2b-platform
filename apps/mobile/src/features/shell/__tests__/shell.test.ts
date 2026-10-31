import type { components } from '@b2b/api-client';
import { describe, expect, it } from 'vitest';
import { defaultBusinessId, mobileAreaOf, mobileMenu, startupScreen } from '../shell-state';

type Me = components['schemas']['Me'];
type Membership = components['schemas']['MembershipSummary'];

const perms = (...codes: string[]) => codes.map((code) => ({ code, scope: 'all' as const }));

const keys = (me: Pick<Me, 'activeBusiness'>, area: 'seller' | 'buyer') =>
  mobileMenu(me, area).map((item) => item.key);

describe('mobil kabuk', () => {
  it('F1.14-AC5: izin olmayan menü öğesi görünmez', () => {
    const cashier: Me = {
      activeBusiness: {
        capability: 'buyer',
        permissions: perms('catalog.browse', 'cart.edit'),
      },
    };
    expect(keys(cashier, 'buyer')).toEqual(['dashboard', 'products', 'cart']);
    expect(keys(cashier, 'buyer')).not.toContain('approvals');
    expect(keys({}, 'buyer')).toEqual(['dashboard']);
  });

  it('F1.14-AC5: işletme değişince menü yeni işletmenin izin ve yeteneğinden gelir', () => {
    const asBuyerAdmin: Me = {
      activeBusiness: {
        id: 'b1',
        capability: 'buyer',
        permissions: perms('cart.approve', 'team.manage'),
      },
    };
    const asSellerRep: Me = {
      activeBusiness: { id: 's1', capability: 'seller', permissions: perms('orders.view') },
    };
    expect(mobileAreaOf(asBuyerAdmin)).toEqual({ kind: 'area', area: 'buyer' });
    expect(keys(asBuyerAdmin, 'buyer')).toEqual(['dashboard', 'approvals', 'team']);
    expect(mobileAreaOf(asSellerRep)).toEqual({ kind: 'area', area: 'seller' });
    expect(keys(asSellerRep, 'seller')).toEqual(['dashboard', 'orders']);
  });

  it('F1.14-AC5: mobilde platform alanı yok; işletmesiz kullanıcı bilgi ekranı', () => {
    expect(mobileAreaOf({ platformRole: 'support' })).toEqual({ kind: 'platform_only' });
    expect(mobileAreaOf({ activeBusiness: { capability: null }, platformRole: null })).toEqual({
      kind: 'none',
    });
  });

  it('US-003 AC1: varsayılan işletme ilk aktif üyelik', () => {
    const m = (businessId: string, businessStatus: Membership['businessStatus']) =>
      ({ businessId, businessStatus }) as Membership;
    expect(defaultBusinessId([m('a', 'suspended'), m('b', 'active')])).toBe('b');
    expect(defaultBusinessId([m('a', 'suspended')])).toBe('a');
    expect(defaultBusinessId([])).toBeUndefined();
  });

  it('US-060 AC1: zorunlu güncelleme oturumdan önce gelir', () => {
    expect(startupScreen({ kind: 'required', storeUrl: 'https://x.test' }, 'signed_in')).toEqual({
      kind: 'update_required',
      storeUrl: 'https://x.test',
    });
    expect(startupScreen('pending', 'signed_in')).toEqual({ kind: 'loading' });
  });

  it('F1.14-AC3: açılışta sunucuya ulaşılamazsa giriş değil "Yeniden dene"', () => {
    const none = { kind: 'none' } as const;
    expect(startupScreen(none, 'error')).toEqual({ kind: 'offline' });
    expect(startupScreen(none, 'signed_out')).toEqual({ kind: 'login' });
    expect(startupScreen(none, 'signed_in')).toEqual({ kind: 'home' });
    expect(startupScreen({ kind: 'recommended' }, 'signed_in')).toEqual({ kind: 'home' });
  });
});
