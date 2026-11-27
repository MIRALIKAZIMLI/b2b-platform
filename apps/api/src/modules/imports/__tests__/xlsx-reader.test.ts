// F3.5a (R32, kart K12): .xlsx okuyucu sınırları ve hücre dönüşümü.
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { cellText, readProductRows, zipUncompressedTotal } from '../xlsx-reader';

const IMPORT_CELL_MAX = 1000;

const LIMITS = { maxRows: 5000, maxUncompressedBytes: 100 * 1024 * 1024, cellMax: IMPORT_CELL_MAX };
const HEADER = ['sku', 'name_az', 'name_ru', 'name_tr', 'category', 'unit', 'price', 'barcode'];

async function workbook(rows: unknown[][], header: unknown[] = HEADER): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('products');
  sheet.addRow(header);
  for (const row of rows) sheet.addRow(row);
  book.addWorksheet('ikinci').addRow(['sku']).commit();
  return Buffer.from(await book.xlsx.writeBuffer());
}

describe('F3.5a xlsx okuyucu', () => {
  it('F3.5a-R32 formül hesaplanmaz: önbellek sonucu okunur, sonuçsuz formül boş', async () => {
    const body = await workbook([
      ['A-1', 'Ad', '', '', 'Kat', 'H87', { formula: 'B2*2', result: 25 }],
      ['A-2', 'Ad', '', '', 'Kat', 'H87', { formula: 'HYPERLINK("http://x")' }],
    ]);
    const result = await readProductRows(body, LIMITS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows[0]?.cells.price).toBe('25');
    expect(result.rows[1]?.cells.price).toBeUndefined();
  });

  it('F3.5a-R32 boş satırlar atlanır; başlık büyük/küçük harf ve sıra serbest; satır numarası korunur', async () => {
    const body = await workbook(
      [['Ad', 'A-1', 'H87', 'Kat'], [], ['Ad 2', 'A-2', 'H87', 'Kat']],
      ['NAME_AZ', 'Sku', 'unit', 'category', 'name_ru', 'name_tr'],
    );
    const result = await readProductRows(body, LIMITS);
    expect(result.ok && result.rows.map((row) => [row.row, row.cells.sku])).toEqual([
      [2, 'A-1'],
      [4, 'A-2'],
    ]);
  });

  it('F3.5a-R32 zorunlu başlık yoksa FILE_INVALID', async () => {
    const body = await workbook([['A-1']], ['sku', 'name_az']);
    expect(await readProductRows(body, LIMITS)).toMatchObject({
      ok: false,
      failure: 'FILE_INVALID',
    });
  });

  it('F3.5a-R32 satır sınırı aşılırsa IMPORT_TOO_MANY_ROWS; sınırdaki dosya okunur', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => [`S-${String(i)}`, 'Ad', '', '', 'K', 'H87']);
    const body = await workbook(rows);
    expect(await readProductRows(body, { ...LIMITS, maxRows: 2 })).toMatchObject({
      ok: false,
      failure: 'IMPORT_TOO_MANY_ROWS',
    });
    expect((await readProductRows(body, { ...LIMITS, maxRows: 3 })).ok).toBe(true);
  });

  it('F3.5a-R32 uzun hücre kesilir ve işaretlenir', async () => {
    const body = await workbook([['A-1', 'x'.repeat(IMPORT_CELL_MAX + 50), '', '', 'K', 'H87']]);
    const result = await readProductRows(body, LIMITS);
    expect(result.ok && result.rows[0]?.tooLong).toEqual(['name_az']);
    expect(result.ok && result.rows[0]?.cells.name_az?.length).toBe(IMPORT_CELL_MAX);
  });

  it('F3.5a-R32 bozuk dosya ve zip sınırını aşan dosya FILE_INVALID', async () => {
    expect(await readProductRows(Buffer.from('not a zip at all, just text'), LIMITS)).toMatchObject(
      {
        ok: false,
        failure: 'FILE_INVALID',
      },
    );
    const body = await workbook([['A-1', 'Ad', '', '', 'K', 'H87']]);
    const total = zipUncompressedTotal(body, Number.MAX_SAFE_INTEGER);
    expect(total).toBeGreaterThan(0);
    expect(zipUncompressedTotal(body, (total ?? 0) - 1)).toBeNull();
    expect(
      await readProductRows(body, { ...LIMITS, maxUncompressedBytes: (total ?? 0) - 1 }),
    ).toMatchObject({ ok: false, failure: 'FILE_INVALID', reason: 'zip' });
  });

  it('F3.5a-R32 hücre metni: tam sayı üstelsiz (barkod), zengin metin, hata değeri boş', () => {
    expect(cellText(4006381333931)).toBe('4006381333931');
    expect(cellText(12.5)).toBe('12.5');
    expect(cellText({ richText: [{ text: 'A' }, { text: 'b' }] })).toBe('Ab');
    expect(cellText({ error: '#DIV/0!' })).toBe('');
    expect(cellText({ text: 'link', hyperlink: 'http://x' })).toBe('link');
    expect(cellText(null)).toBe('');
  });
});
