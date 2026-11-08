import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '../permissions';
import { suggestedRoleId } from '../team';
import {
  canGrantPermission,
  groupPermissionsByModule,
  permissionsBeyondActor,
  permissionsForCapability,
  roleEditorBody,
  roleEditorValues,
  roleFailure,
  rolePermissionError,
} from '../team-roles';

const actor = (entries: [string, string][], isBusinessAdmin = false) => ({
  isBusinessAdmin,
  permissions: new Map(entries),
});

describe('F2.8 özel rol kuralları', () => {
  it('US-014-AC2 permissionsForCapability buyer için seller iznini vermez', () => {
    const buyer = permissionsForCapability('buyer');
    expect(buyer).toContain('cart.approve');
    expect(buyer).toContain('team.manage');
    expect(buyer).not.toContain('orders.approve');
    expect(buyer.every((code) => PERMISSIONS[code].capability !== 'seller')).toBe(true);
    expect(permissionsForCapability('seller')).not.toContain('cart.approve');
  });

  it('US-014-AC2 rolePermissionError başka yeteneğin iznini, kapsamı ve tekrarı yakalar', () => {
    expect(rolePermissionError('buyer', [{ code: 'orders.approve', scope: 'all' }])).toEqual({
      code: 'orders.approve',
      reason: 'capability',
    });
    expect(rolePermissionError('buyer', [{ code: 'cart.edit', scope: 'all' }])?.reason).toBe(
      'scope',
    );
    expect(rolePermissionError('seller', [{ code: 'nope.x', scope: 'all' }])?.reason).toBe(
      'invalid',
    );
    expect(
      rolePermissionError('seller', [
        { code: 'catalog.view', scope: 'all' },
        { code: 'catalog.view', scope: 'all' },
      ])?.reason,
    ).toBe('duplicate');
    expect(rolePermissionError('buyer', [{ code: 'cart.edit', scope: 'branch' }])).toBeUndefined();
  });

  it('R3 canGrantPermission: admin her şeyi, diğerleri yalnız kendi izni (all ya da aynı kapsam)', () => {
    expect(canGrantPermission(actor([], true), 'orders.approve', 'all')).toBe(true);
    const manager = actor([
      ['team.manage', 'all'],
      ['orders.view', 'assigned'],
      ['reports.view', 'all'],
    ]);
    expect(canGrantPermission(manager, 'orders.approve', 'all')).toBe(false);
    expect(canGrantPermission(manager, 'orders.view', 'assigned')).toBe(true);
    expect(canGrantPermission(manager, 'orders.view', 'all')).toBe(false);
    expect(canGrantPermission(manager, 'reports.view', 'branch')).toBe(true);
  });

  it('R3 permissionsBeyondActor: admin rolü admin olmayan aktörü her zaman aşar', () => {
    const manager = actor([['team.manage', 'all']]);
    expect(
      permissionsBeyondActor(manager, {
        isBusinessAdmin: true,
        permissions: [{ code: 'team.manage', scope: 'all' }],
      }),
    ).toEqual(['*']);
    expect(
      permissionsBeyondActor(manager, {
        isBusinessAdmin: false,
        permissions: [
          { code: 'team.manage', scope: 'all' },
          { code: 'catalog.manage', scope: 'all' },
        ],
      }),
    ).toEqual(['catalog.manage']);
    expect(
      permissionsBeyondActor(actor([], true), { isBusinessAdmin: true, permissions: [] }),
    ).toEqual([]);
  });

  it('US-014-AC1 roleEditorBody: ad seçili dile, diğer diller korunur; boş izin hatası', () => {
    const values = roleEditorValues(' Kassir ', [
      { code: 'orders.view', scope: 'all' },
      { code: 'orders.approve', scope: 'all' },
    ]);
    const result = roleEditorBody(values, 'buyer', 'ru', { az: 'Kassa', en: 'x' });
    // orders.approve seller izni: buyer gövdesine girmez (AC2).
    expect(result).toEqual({
      ok: true,
      body: {
        name: { az: 'Kassa', ru: 'Kassir' },
        permissions: [{ code: 'orders.view', scope: 'all' }],
      },
    });
    expect(roleEditorBody({ name: '', permissions: {} }, 'seller', 'az')).toEqual({
      ok: false,
      errors: { name: 'required', permissions: 'required' },
    });
    expect(
      roleEditorBody(
        { name: 'x'.repeat(81), permissions: { 'team.manage': 'all' } },
        'seller',
        'az',
      ),
    ).toMatchObject({
      ok: false,
      errors: { name: 'too_long' },
    });
  });

  it('groupPermissionsByModule izinleri modüle göre sırasıyla gruplar', () => {
    const groups = groupPermissionsByModule(['orders.view', 'team.manage', 'orders.approve']);
    expect(groups).toEqual([
      { module: 'orders', codes: ['orders.view', 'orders.approve'] },
      { module: 'team', codes: ['team.manage'] },
    ]);
  });

  it('US-014-AC1 suggestedRoleId özel rolü önermez', () => {
    const roles = [
      { id: 'custom', sourceTemplateId: 't1', isCustom: true },
      { id: 'copy', sourceTemplateId: 't1', isCustom: false },
    ];
    expect(suggestedRoleId({ roleTemplateId: 't1' }, roles)).toBe('copy');
  });

  it('roleFailure: kapsam değişimi, aktörü aşan izin, doğrulama ve genel kod', () => {
    expect(
      roleFailure({ code: 'VALIDATION_FAILED', details: { permissions: ['scope_change_in_use'] } }),
    ).toEqual({ kind: 'role', reason: 'scope_change_in_use' });
    expect(
      roleFailure({ code: 'PERMISSION_DENIED', details: { permissions: ['orders.approve'] } }),
    ).toEqual({ kind: 'role', reason: 'beyond_actor' });
    expect(
      roleFailure({ code: 'VALIDATION_FAILED', details: { permissions: ['capability'] } }),
    ).toEqual({ kind: 'role', reason: 'invalid' });
    expect(roleFailure({ code: 'PERMISSION_DENIED' })).toEqual({
      kind: 'code',
      code: 'PERMISSION_DENIED',
    });
    expect(roleFailure(undefined)).toEqual({ kind: 'code', code: 'INTERNAL_ERROR' });
  });
});
