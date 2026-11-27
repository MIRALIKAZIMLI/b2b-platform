// F3.5a (US-031 AC1, kart K13, K20): şablon ve rapor dosyaları; durum makinesi (§11).
import { PRODUCT_IMPORT_COLUMNS } from '@b2b/shared';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { DomainError } from '../../../core/errors/domain-error';
import { ImportJobStateMachine } from '../import-job.state-machine';
import { buildProblemReport, buildProductTemplate, safeText } from '../workbooks';
import { readProductRows } from '../xlsx-reader';

const t = (key: string) => `<${key}>`;

/** exceljs `load` kendi `Buffer` (ArrayBuffer) tipini ister. */
function arrayBufferOf(body: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(body.byteLength);
  new Uint8Array(copy).set(body);
  return copy;
}

async function open(body: Buffer): Promise<ExcelJS.Workbook> {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(arrayBufferOf(body));
  return book;
}

describe('F3.5a şablon ve rapor', () => {
  it('F3.5a-AC1 şablon: 11 sütun başlığı, açıklama, kategori ve birim sayfaları', async () => {
    const body = await buildProductTemplate({
      lang: 'ru',
      t,
      categories: [
        { id: 'r', parentId: null, isActive: true, name: { az: 'Kosmetika', ru: 'Косметика' } },
        { id: 'c', parentId: 'r', isActive: true, name: { az: 'Şampun', ru: 'Шампунь' } },
        { id: 'x', parentId: null, isActive: false, name: { az: 'Pasif' } },
      ],
      units: [
        {
          code: 'H87',
          allowsDecimal: false,
          isActive: true,
          name: { ru: 'Штука' },
          abbreviation: { ru: 'шт.' },
        },
        {
          code: 'OLD',
          allowsDecimal: false,
          isActive: false,
          name: { ru: 'Старая' },
          abbreviation: { ru: 'с' },
        },
      ],
    });
    const book = await open(body);
    expect(book.worksheets.map((sheet) => sheet.name)).toEqual([
      '<imports.sheet.products>',
      '<imports.sheet.instructions>',
      '<imports.sheet.categories>',
      '<imports.sheet.units>',
    ]);
    const header = book.worksheets[0]?.getRow(1).values as unknown[];
    expect(header.slice(1)).toEqual([...PRODUCT_IMPORT_COLUMNS]);
    const categories = book.worksheets[2]
      ?.getSheetValues()
      .slice(2)
      .map((row) => (row as unknown[]).slice(1));
    expect(categories).toEqual([
      ['Косметика', 'Косметика'],
      ['Шампунь', 'Косметика / Шампунь'],
    ]);
    const units = book.worksheets[3]
      ?.getSheetValues()
      .slice(2)
      .map((row) => (row as unknown[]).slice(1));
    expect(units).toEqual([['H87', 'Штука', 'шт.']]);
    // Boş şablon okuyucuya verilirse sıfır satır (başlık eksiksiz).
    expect(
      await readProductRows(body, {
        maxRows: 10,
        maxUncompressedBytes: 10 * 1024 * 1024,
        cellMax: 1000,
      }),
    ).toEqual({
      ok: true,
      rows: [],
    });
  });

  it('F3.5a-AC2 rapor: satır, SKU, sütun, tür, açıklama; formül gibi başlayan SKU kaçışlı', async () => {
    const body = await buildProblemReport({
      t,
      notes: ['stock_column_ignored'],
      outcomes: [
        { row: 2, sku: 'A-1', action: 'insert', issues: [] },
        {
          row: 3,
          sku: '=HYPERLINK("x")',
          action: 'error',
          issues: [{ column: 'category', code: 'not_found' }],
        },
        {
          row: 4,
          sku: 'B',
          action: 'insert',
          issues: [{ column: 'price', code: 'price_ignored_no_permission' }],
        },
      ],
    });
    const rows = (await open(body)).worksheets[0]
      ?.getSheetValues()
      .slice(2)
      .map((row) => (row as unknown[]).slice(1));
    expect(rows).toEqual([
      ['', '', '', '', '<imports.note.stock_column_ignored>'],
      [3, `'=HYPERLINK("x")`, 'category', '<imports.report.error>', '<imports.row.not_found>'],
      [4, 'B', 'price', '<imports.report.warning>', '<imports.row.price_ignored_no_permission>'],
    ]);
    expect(safeText('+1')).toBe("'+1");
    expect(safeText('ABC')).toBe('ABC');
  });

  it('F3.5a-SM durum makinesi state-machines §11 ile aynı', () => {
    expect(ImportJobStateMachine.canTransition('uploaded', 'validating')).toBe(true);
    expect(ImportJobStateMachine.canTransition('validating', 'preview_ready')).toBe(true);
    expect(ImportJobStateMachine.canTransition('validating', 'failed')).toBe(true);
    expect(ImportJobStateMachine.canTransition('preview_ready', 'applying')).toBe(true);
    expect(ImportJobStateMachine.canTransition('applying', 'done')).toBe(true);
    expect(ImportJobStateMachine.canTransition('applying', 'failed')).toBe(true);
    expect(ImportJobStateMachine.canTransition('uploaded', 'preview_ready')).toBe(false);
    expect(ImportJobStateMachine.canTransition('done', 'applying')).toBe(false);
    expect(() => {
      ImportJobStateMachine.assertTransition('failed', 'validating');
    }).toThrow(DomainError);
  });
});
