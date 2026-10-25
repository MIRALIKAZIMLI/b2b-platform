import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertTemplateConsistent, SEED_ROLE_TEMPLATES } from '../seed/role-templates';

const C4_FILE = resolve(__dirname, '../../../../../../docs/03-architecture/c4-component.md');

interface DocTemplate {
  readonly code: string;
  readonly capability: string;
  readonly isBusinessAdmin: boolean;
  readonly permissions: Record<string, string>;
}

/** c4-component §5 "Rol şablonları (seed)" tablosu. */
function readC4Templates(): DocTemplate[] {
  const text = readFileSync(C4_FILE, 'utf8');
  const start = text.indexOf('**Rol şablonları (seed):**');
  const end = text.indexOf('📌 VARSAYILAN, KULLANICI ONAYI BEKLİYOR', start);
  const rows: DocTemplate[] = [];
  for (const line of text.slice(start, end).split(/\r?\n/)) {
    if (!line.startsWith('| `')) continue;
    const cells = line.split('|').map((cell) => cell.trim());
    const permissions: Record<string, string> = {};
    for (const item of (cells[5] ?? '').split(/,\s*(?=`)/)) {
      const match = /^`([^`]+)`(?: \((\w+)\))?$/.exec(item.trim());
      if (match?.[1] === undefined) throw new Error(`okunamayan izin: ${item}`);
      permissions[match[1]] = match[2] ?? 'all';
    }
    rows.push({
      code: (cells[1] ?? '').replaceAll('`', ''),
      capability: cells[3] ?? '',
      isBusinessAdmin: cells[4] === 'evet',
      permissions,
    });
  }
  return rows;
}

describe('rol şablonları (seed/role-templates.ts)', () => {
  it('F1.8-AC6: c4-component §5 şablon tablosu = role-templates.ts', () => {
    const doc = readC4Templates();
    expect(doc).toHaveLength(SEED_ROLE_TEMPLATES.length);
    for (const template of SEED_ROLE_TEMPLATES) {
      const row = doc.find((item) => item.code === template.code);
      expect(row, template.code).toBeDefined();
      expect(row?.capability).toBe(template.capability);
      expect(row?.isBusinessAdmin).toBe(template.isBusinessAdmin);
      expect(row?.permissions).toEqual(template.permissions);
    }
  });

  it('F1.8-AC6: her şablon izni katalogda, yeteneğe uygun ve kapsamı izinli', () => {
    for (const template of SEED_ROLE_TEMPLATES) {
      expect(() => {
        assertTemplateConsistent(template);
      }).not.toThrow();
    }
  });

  it('F1.8-AC6: her yetenekte tam bir İşletme Admini şablonu', () => {
    for (const capability of ['seller', 'buyer'] as const) {
      const admins = SEED_ROLE_TEMPLATES.filter(
        (t) => t.capability === capability && t.isBusinessAdmin,
      );
      expect(admins).toHaveLength(1);
    }
  });

  it('F1.8-AC6: tutarsız şablon reddedilir', () => {
    expect(() => {
      assertTemplateConsistent({
        code: 'x',
        capability: 'buyer',
        isBusinessAdmin: false,
        name: { az: 'x', ru: 'x', tr: 'x' },
        permissions: { 'catalog.manage': 'all' },
      });
    }).toThrow();
    expect(() => {
      assertTemplateConsistent({
        code: 'x',
        capability: 'buyer',
        isBusinessAdmin: false,
        name: { az: 'x', ru: 'x', tr: 'x' },
        permissions: { 'cart.edit': 'all' },
      });
    }).toThrow();
  });
});
