import { describe, expect, it } from 'vitest';
import { mergeOptions, scopeAvailable, type ScopeOptions } from '../scope-options';

const X = { id: 'w1', label: 'Anbar X' };
const Y = { id: 'w2', label: 'Anbar Y' };

const options = (over: Partial<ScopeOptions>): ScopeOptions => ({
  warehouses: undefined,
  branches: undefined,
  branchChoices: undefined,
  warehouseChoices: undefined,
  branchOwnOnly: false,
  warehouseOwnOnly: false,
  regions: [],
  ...over,
});

const warehouseNeeds = { branch: false, warehouse: true, regions: false };

describe('F3.11e ekip formu kapsam seçenekleri', () => {
  it('F3.11e-WEB depo seçeneği sunucudan geldiyse business.manage olmadan form gönderilebilir', () => {
    // Tam depo listesi (business.manage) yok, yalnız scope-options var.
    expect(scopeAvailable(warehouseNeeds, options({ warehouseChoices: [X] }))).toBe(true);
    expect(scopeAvailable(warehouseNeeds, options({ warehouses: [X, Y] }))).toBe(false);
    expect(scopeAvailable(warehouseNeeds, options({ warehouseChoices: [] }))).toBe(false);
    expect(scopeAvailable({ branch: true, warehouse: false, regions: false }, options({}))).toBe(
      false,
    );
  });

  it('F3.11e-WEB üye satırı adları tam liste ile seçeneklerin birleşimi, tekrar yok', () => {
    expect(mergeOptions(undefined, [X])).toEqual([X]);
    expect(mergeOptions([X, Y], undefined)).toEqual([X, Y]);
    expect(mergeOptions([X], [X, Y])).toEqual([X, Y]);
    expect(mergeOptions(undefined, undefined)).toBeUndefined();
  });
});
