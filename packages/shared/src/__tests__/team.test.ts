import { describe, expect, it } from 'vitest';
import {
  EMPTY_INVITATION,
  initialBusinessId,
  invitationToken,
  memberFormValues,
  memberUpdateBody,
  normalizeTeamPhone,
  roleScopeNeeds,
  suggestedRoleId,
  teamFailure,
  validateInvitation,
} from '../team';

const perms = (...scopes: string[]) => ({
  permissions: scopes.map((scope, index) => ({ code: `p${String(index)}`, scope })),
});

describe('F2.7b ekip formu', () => {
  it('US-013 AC1 kapsam rolden türetilir (branch / warehouse / assigned)', () => {
    expect(roleScopeNeeds(perms('all', 'branch'))).toEqual({
      branch: true,
      warehouse: false,
      regions: false,
    });
    expect(roleScopeNeeds(perms('warehouse'))).toMatchObject({ warehouse: true, branch: false });
    expect(roleScopeNeeds(perms('assigned')).regions).toBe(true);
    expect(roleScopeNeeds(undefined)).toEqual({ branch: false, warehouse: false, regions: false });
  });

  it('US-013 AC1 unvan seçilince rol şablondan önerilir', () => {
    const roles = [
      { id: 'r1', sourceTemplateId: 't1' },
      { id: 'r2', sourceTemplateId: 't2' },
      { id: 'r3', sourceTemplateId: null },
    ];
    expect(suggestedRoleId({ roleTemplateId: 't2' }, roles)).toBe('r2');
    expect(suggestedRoleId({ roleTemplateId: 'yok' }, roles)).toBeUndefined();
    expect(suggestedRoleId({ roleTemplateId: null }, roles)).toBeUndefined();
    expect(suggestedRoleId(undefined, roles)).toBeUndefined();
  });

  it('US-013 AC1 davet: telefon E.164, zorunlu alanlar, gereken kapsam', () => {
    expect(normalizeTeamPhone(' +994 (50) 123-45-67 ')).toBe('+994501234567');
    expect(normalizeTeamPhone('00994501234567')).toBe('+994501234567');
    const needs = { branch: true, warehouse: false, regions: false };
    const empty = validateInvitation(EMPTY_INVITATION, needs);
    expect(empty).toEqual({
      ok: false,
      errors: {
        phone: 'required',
        fullName: 'required',
        jobTitleId: 'required',
        roleId: 'required',
        branchId: 'required',
      },
    });
    const bad = validateInvitation(
      { ...EMPTY_INVITATION, phone: '0501234567', fullName: 'x'.repeat(121) },
      needs,
    );
    expect(bad.ok ? {} : bad.errors).toMatchObject({
      phone: 'phone_invalid',
      fullName: 'too_long',
    });
  });

  it('US-013 AC1 davet gövdesi gerekmeyen kapsamı içermez', () => {
    const values = {
      phone: '+994 50 123 45 67',
      fullName: '  Aysel  ',
      jobTitleId: 'j',
      roleId: 'r',
      branchId: 'b',
      warehouseId: 'w',
    };
    expect(validateInvitation(values, { branch: false, warehouse: true, regions: false })).toEqual({
      ok: true,
      body: {
        phone: '+994501234567',
        fullName: 'Aysel',
        jobTitleId: 'j',
        roleId: 'r',
        warehouseId: 'w',
      },
    });
  });

  it('US-013 AC4 düzenleme: yalnız değişen alanlar; bölgeler yalnız assigned rolde', () => {
    const member = { roleId: 'r1', branchId: null, warehouseId: null, regionIds: ['a', 'b'] };
    const values = memberFormValues(member);
    expect(values).toEqual({ roleId: 'r1', branchId: '', warehouseId: '', regionIds: ['a', 'b'] });
    const assigned = { branch: false, warehouse: false, regions: true };
    expect(memberUpdateBody(member, values, assigned)).toEqual({ ok: true, body: {} });
    expect(memberUpdateBody(member, { ...values, regionIds: ['b', 'a'] }, assigned)).toEqual({
      ok: true,
      body: {},
    });
    expect(memberUpdateBody(member, { ...values, regionIds: ['c'] }, assigned)).toEqual({
      ok: true,
      body: { regionIds: ['c'] },
    });
    const branch = { branch: true, warehouse: false, regions: false };
    expect(memberUpdateBody(member, { ...values, roleId: 'r2' }, branch)).toEqual({
      ok: false,
      errors: { branchId: 'required' },
    });
    expect(
      memberUpdateBody(member, { ...values, roleId: 'r2', branchId: 'b1', regionIds: [] }, branch),
    ).toEqual({ ok: true, body: { roleId: 'r2', branchId: 'b1' } });
  });

  it('US-013 AC2 plan sınırı ayrı mesaj; alan ayrıntıları alanlara; diğerleri kod', () => {
    const fields = ['phone', 'branchId'];
    expect(teamFailure({ code: 'ENTITLEMENT_LIMIT_REACHED' }, fields)).toEqual({
      kind: 'plan_limit',
    });
    expect(
      teamFailure(
        { code: 'NOT_FOUND', details: { branchId: ['not_found'], other: ['x'] } },
        fields,
      ),
    ).toEqual({ kind: 'fields', fields: { branchId: 'not_found' } });
    expect(
      teamFailure({ code: 'VALIDATION_FAILED', details: { phone: ['pattern'] } }, fields),
    ).toEqual({ kind: 'fields', fields: { phone: 'invalid' } });
    expect(teamFailure({ code: 'LAST_ADMIN_PROTECTED' }, fields)).toEqual({
      kind: 'code',
      code: 'LAST_ADMIN_PROTECTED',
    });
    expect(teamFailure(undefined, fields)).toEqual({ kind: 'code', code: 'INTERNAL_ERROR' });
  });

  it('F2.5 S1 + F3.11e kapsam reddi (şube / depo) anlaşılır alan hatası', () => {
    expect(
      teamFailure({ code: 'PERMISSION_DENIED', details: { branchId: ['beyond_actor'] } }, [
        'branchId',
      ]),
    ).toEqual({ kind: 'fields', fields: { branchId: 'beyond_actor' } });
    expect(
      teamFailure({ code: 'PERMISSION_DENIED', details: { warehouseId: ['beyond_actor'] } }, [
        'warehouseId',
      ]),
    ).toEqual({ kind: 'fields', fields: { warehouseId: 'beyond_actor' } });
  });

  it('F2.7b davet token: boş, eksik veya uzun token reddedilir', () => {
    expect(invitationToken('abc')).toBe('abc');
    expect(invitationToken('')).toBeUndefined();
    expect(invitationToken(undefined)).toBeUndefined();
    expect(invitationToken(['a'])).toBeUndefined();
    expect(invitationToken('x'.repeat(257))).toBeUndefined();
  });

  it('F2.7b S8 son kullanılan işletme varsayılan; üyelik değilse ilk aktif üyelik', () => {
    const list = [
      { businessId: 'a', businessStatus: 'suspended' },
      { businessId: 'b', businessStatus: 'active' },
      { businessId: 'c', businessStatus: 'active' },
    ];
    expect(initialBusinessId(list, 'c')).toBe('c');
    expect(initialBusinessId(list, 'a')).toBe('a');
    expect(initialBusinessId(list, 'yok')).toBe('b');
    expect(initialBusinessId(list, null)).toBe('b');
    expect(initialBusinessId(list, 'c', new Set(['c']))).toBe('b');
    expect(initialBusinessId([], 'c')).toBeUndefined();
  });
});
