import { describe, expect, it } from 'vitest';
import { activityTypeOptions } from '../api';
import { canManageBusiness } from '../buyer-home';

describe('F2.3b perakendeci kayıt (web)', () => {
  it('US-005-AC1 faaliyet türleri arayüz dilinde, API sırasıyla listelenir', () => {
    const types = [
      { id: 'a', name: { az: 'Ərzaq', ru: 'Продукты', tr: 'Gıda' }, sortOrder: 1 },
      { id: 'b', name: { az: 'Kosmetika' }, sortOrder: 2 },
    ];
    expect(activityTypeOptions(types, 'ru')).toEqual([
      { id: 'a', label: 'Продукты' },
      { id: 'b', label: 'Kosmetika' },
    ]);
  });

  it('US-005-AC2 profil kartı yalnız business.manage izniyle istenir', () => {
    expect(canManageBusiness([{ code: 'orders.view' }, { code: 'business.manage' }])).toBe(true);
    expect(canManageBusiness([{ code: 'orders.view' }])).toBe(false);
    expect(canManageBusiness(undefined)).toBe(false);
  });
});
