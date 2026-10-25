import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isPermissionCode,
  isPermissionForCapability,
  isScopeAllowed,
  PERMISSION_CODES,
  PERMISSIONS,
  permissionModule,
} from '../permissions';

const C4_FILE = resolve(__dirname, '../../../../docs/03-architecture/c4-component.md');

interface DocRow {
  readonly code: string;
  readonly capability: string;
  readonly scopes: string[];
}

/** c4-component §5 izin tablosunun satırları (kod, yetenek, kapsam seçenekleri). */
function readC4Permissions(): DocRow[] {
  const text = readFileSync(C4_FILE, 'utf8');
  const start = text.indexOf('## 5. İzin kataloğu');
  const end = text.indexOf('**Rol şablonları (seed):**', start);
  const rows: DocRow[] = [];
  for (const line of text.slice(start, end).split(/\r?\n/)) {
    if (!line.startsWith('| `')) continue;
    const cells = line.split('|').map((cell) => cell.trim());
    rows.push({
      code: (cells[1] ?? '').replaceAll('`', ''),
      capability: cells[2] ?? '',
      scopes: (cells[3] ?? '').split(',').map((scope) => scope.trim()),
    });
  }
  return rows;
}

describe('izin kataloğu (shared/permissions.ts)', () => {
  it('F1.8-AC6: permissions.ts = c4-component §5 tablosu (kod, yetenek, kapsam)', () => {
    const doc = readC4Permissions();
    expect(doc.length).toBeGreaterThan(0);
    expect([...PERMISSION_CODES].sort()).toEqual(doc.map((row) => row.code).sort());
    for (const row of doc) {
      expect(isPermissionCode(row.code)).toBe(true);
      if (!isPermissionCode(row.code)) continue;
      expect(PERMISSIONS[row.code].capability).toBe(row.capability);
      expect([...PERMISSIONS[row.code].scopes]).toEqual(row.scopes);
    }
  });

  it('F1.8-AC6: modül adı kodun ilk bölümü', () => {
    expect(permissionModule('orders.approve')).toBe('orders');
    expect(permissionModule('ledger.payment.create')).toBe('ledger');
  });

  it('F1.8-AC6: kapsam ve yetenek denetimi', () => {
    expect(isScopeAllowed('cart.edit', 'branch')).toBe(true);
    expect(isScopeAllowed('cart.edit', 'all')).toBe(false);
    expect(isPermissionForCapability('team.manage', 'buyer')).toBe(true);
    expect(isPermissionForCapability('catalog.manage', 'buyer')).toBe(false);
    expect(isPermissionCode('orders.delete')).toBe(false);
  });
});
