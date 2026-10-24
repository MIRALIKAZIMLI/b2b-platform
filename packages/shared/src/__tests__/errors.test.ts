import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES, isErrorCode } from '../errors';

const OPENAPI_FILE = resolve(__dirname, '../../../../docs/03-architecture/api/openapi.yaml');

/** openapi.yaml içindeki `components.schemas.ErrorCode.enum` listesini sırasıyla okur. */
function readOpenApiErrorCodes(): string[] {
  const lines = readFileSync(OPENAPI_FILE, 'utf8').split(/\r?\n/);
  const start = lines.findIndex((line) => line === '    ErrorCode:');
  if (start === -1) {
    throw new Error('openapi.yaml içinde ErrorCode şeması bulunamadı');
  }
  const codes: string[] = [];
  let inEnum = false;
  for (const line of lines.slice(start + 1)) {
    if (line === '      enum:') {
      inEnum = true;
      continue;
    }
    const item = /^ {8}- ([A-Z0-9_]+)$/.exec(line);
    if (inEnum && item?.[1] !== undefined) {
      codes.push(item[1]);
      continue;
    }
    if (inEnum) break;
  }
  return codes;
}

describe('ErrorCode', () => {
  it('F1.2-AC7: ErrorCode = openapi ErrorCode (sıra dahil)', () => {
    const fromOpenApi = readOpenApiErrorCodes();
    expect(fromOpenApi.length).toBeGreaterThan(0);
    expect([...ERROR_CODES]).toEqual(fromOpenApi);
  });

  it('isErrorCode yalnızca listedeki kodları kabul eder', () => {
    expect(isErrorCode('NOT_FOUND')).toBe(true);
    expect(isErrorCode('NOT_A_CODE')).toBe(false);
    expect(isErrorCode(404)).toBe(false);
  });
});
