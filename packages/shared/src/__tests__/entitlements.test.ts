import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ENTITLEMENT_KEYS,
  FEATURE_ENTITLEMENT_KEYS,
  isEntitlementKey,
  LIMIT_ENTITLEMENT_KEYS,
  parseEntitlementValue,
} from '../entitlements';

const DATA_MODEL_FILE = resolve(__dirname, '../../../../docs/03-architecture/data-model.md');

/** data-model §4.6 `plan_entitlements` anahtar tablosundaki anahtarlar. */
function readDataModelKeys(): string[] {
  const text = readFileSync(DATA_MODEL_FILE, 'utf8');
  const start = text.indexOf('#### `plan_entitlements`');
  const end = text.indexOf('#### `subscriptions`');
  const section = text.slice(start, end);
  const keys: string[] = [];
  for (const line of section.split(/\r?\n/)) {
    if (!line.startsWith('| `')) continue;
    const first = line.split('|')[1] ?? '';
    keys.push(...[...first.matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? ''));
  }
  return keys;
}

describe('hak kaydı (shared/entitlements.ts)', () => {
  it('D3: data-model §4.6 anahtarları ile kayıt birebir aynı (7 anahtar)', () => {
    expect([...ENTITLEMENT_KEYS].sort()).toEqual(readDataModelKeys().sort());
    expect(ENTITLEMENT_KEYS).toHaveLength(7);
    expect(FEATURE_ENTITLEMENT_KEYS).toContain('feature.branch_pricing');
  });

  it('D3: sayısal hak tamsayı ≥ 0 veya null (sınırsız)', () => {
    for (const key of LIMIT_ENTITLEMENT_KEYS) {
      expect(parseEntitlementValue(key, 0)).toEqual({ ok: true, value: 0 });
      expect(parseEntitlementValue(key, 3)).toEqual({ ok: true, value: 3 });
      expect(parseEntitlementValue(key, null)).toEqual({ ok: true, value: null });
      for (const bad of [-1, 1.5, '3', true, undefined, {}]) {
        expect(parseEntitlementValue(key, bad)).toEqual({ ok: false });
      }
    }
  });

  it('D3: özellik hakkı yalnızca boolean', () => {
    for (const key of FEATURE_ENTITLEMENT_KEYS) {
      expect(parseEntitlementValue(key, true)).toEqual({ ok: true, value: true });
      expect(parseEntitlementValue(key, false)).toEqual({ ok: true, value: false });
      for (const bad of [null, 1, 'true', undefined]) {
        expect(parseEntitlementValue(key, bad)).toEqual({ ok: false });
      }
    }
  });

  it('D3: bilinmeyen anahtar kayıtta yok', () => {
    expect(isEntitlementKey('users.max')).toBe(true);
    expect(isEntitlementKey('feature.unknown')).toBe(false);
    expect(isEntitlementKey(42)).toBe(false);
  });
});
