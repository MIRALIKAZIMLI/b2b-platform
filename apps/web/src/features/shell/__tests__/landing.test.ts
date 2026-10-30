import type { components } from '@b2b/api-client';
import { describe, expect, it } from 'vitest';
import { areaOf, defaultBusinessId, landingPath } from '../landing';

type Membership = components['schemas']['MembershipSummary'];

const membership = (businessId: string, businessStatus: Membership['businessStatus']) =>
  ({ businessId, businessStatus, capability: 'seller' }) as Membership;

describe('Açılış sayfası', () => {
  it('US-003 AC1: varsayılan işletme ilk aktif üyelik; aktif yoksa ilk üyelik', () => {
    expect(defaultBusinessId([membership('a', 'suspended'), membership('b', 'active')])).toBe('b');
    expect(defaultBusinessId([membership('a', 'suspended')])).toBe('a');
    expect(defaultBusinessId([])).toBeUndefined();
  });

  it('F1.13-AC4: alan seçili işletmenin yeteneğinden; işletme yoksa platform rolü', () => {
    expect(areaOf({ activeBusiness: { capability: 'buyer' }, platformRole: null })).toBe('buyer');
    expect(areaOf({ activeBusiness: { capability: 'seller' } })).toBe('seller');
    expect(areaOf({ platformRole: 'support' })).toBe('admin');
    expect(areaOf({ activeBusiness: { capability: null }, platformRole: null })).toBeUndefined();
    expect(areaOf({})).toBeUndefined();
    expect(landingPath('ru', 'buyer')).toBe('/ru/buyer');
  });
});
