import { describe, expect, it } from 'vitest';
import {
  branchFailure,
  branchFormValues,
  type BranchFormValues,
  EMPTY_BRANCH_FORM,
  formatCoordinate,
  validateBranch,
} from '../branches';

const filled: BranchFormValues = {
  ...EMPTY_BRANCH_FORM,
  name: ' Mərkəz ',
  regionId: 'r1',
  addressLine: ' Nizami 10 ',
};

describe('validateBranch (US-010 AC1)', () => {
  it('US-010-AC1 yeni şube: ad, bölge, adres zorunlu; kural varsayılanı every_order (AC3)', () => {
    expect(validateBranch(EMPTY_BRANCH_FORM)).toEqual({
      ok: false,
      errors: { name: 'required', regionId: 'required', addressLine: 'required' },
    });
    expect(validateBranch(filled)).toEqual({
      ok: true,
      body: {
        name: 'Mərkəz',
        regionId: 'r1',
        addressLine: 'Nizami 10',
        approvalRule: 'every_order',
      },
    });
  });

  it('US-010-AC1 above_amount eşiği zorunlu, > 0 ve en çok 2 ondalık; virgül kabul', () => {
    const rule = { ...filled, approvalRule: 'above_amount' as const };
    expect(validateBranch(rule)).toMatchObject({ errors: { approvalThreshold: 'required' } });
    expect(validateBranch({ ...rule, approvalThreshold: '0' })).toMatchObject({
      errors: { approvalThreshold: 'positive' },
    });
    expect(validateBranch({ ...rule, approvalThreshold: '1.234' })).toMatchObject({
      errors: { approvalThreshold: 'invalid_amount' },
    });
    expect(validateBranch({ ...rule, approvalThreshold: '500,5' })).toMatchObject({
      ok: true,
      body: { approvalRule: 'above_amount', approvalThreshold: '500.5' },
    });
  });

  it('US-010-AC1 konum ikisi birden, aralıkta; boşsa gönderilmez', () => {
    expect(validateBranch({ ...filled, lat: '40.4' })).toMatchObject({
      errors: { lng: 'geo_pair' },
    });
    expect(validateBranch({ ...filled, lat: '91', lng: '49' })).toMatchObject({
      errors: { lat: 'invalid_coordinate' },
    });
    expect(validateBranch({ ...filled, lat: 'abc', lng: '49' })).toMatchObject({
      errors: { lat: 'invalid_coordinate' },
    });
    expect(validateBranch({ ...filled, lat: '40,409264', lng: '49.867092' })).toMatchObject({
      ok: true,
      body: { lat: 40.409264, lng: 49.867092 },
    });
  });

  it('US-010-AC1 düzenleme: yalnız değişen alanlar; kural değişince eşik, konum silinince null', () => {
    const initial = branchFormValues({
      name: 'Mərkəz',
      regionId: 'r1',
      addressLine: 'Nizami 10',
      lat: 40.4,
      lng: 49.8,
      approvalRule: 'above_amount',
      approvalThreshold: '500.00',
    });
    expect(validateBranch(initial, initial)).toEqual({ ok: true, body: {} });
    expect(validateBranch({ ...initial, approvalThreshold: '500' }, initial)).toEqual({
      ok: true,
      body: {},
    });
    expect(validateBranch({ ...initial, approvalRule: 'none' }, initial)).toEqual({
      ok: true,
      body: { approvalRule: 'none' },
    });
    expect(validateBranch({ ...initial, approvalThreshold: '750' }, initial)).toEqual({
      ok: true,
      body: { approvalThreshold: '750' },
    });
    expect(validateBranch({ ...initial, lat: '', lng: '' }, initial)).toEqual({
      ok: true,
      body: { lat: null, lng: null },
    });
  });
});

describe('branchFailure ve formatCoordinate', () => {
  it('US-010-AC4 409 nedenleri ayrı mesaj; diğerleri genel kod', () => {
    expect(
      branchFailure({
        code: 'INVALID_STATE_TRANSITION',
        details: { reason: 'last_active_branch' },
      }),
    ).toEqual({ kind: 'last_active' });
    expect(
      branchFailure({
        code: 'INVALID_STATE_TRANSITION',
        details: { reason: 'branch_in_use', members: 2, invitations: 1 },
      }),
    ).toEqual({ kind: 'in_use', members: 2, invitations: 1 });
    expect(branchFailure({ code: 'CAPABILITY_REQUIRED' })).toEqual({
      kind: 'code',
      code: 'CAPABILITY_REQUIRED',
    });
    expect(branchFailure(undefined)).toEqual({ kind: 'code', code: 'INTERNAL_ERROR' });
  });

  it('cihaz konumu 6 haneye yuvarlanır', () => {
    expect(formatCoordinate(40.4092641234)).toBe('40.409264');
    expect(formatCoordinate(49.5)).toBe('49.5');
  });
});
