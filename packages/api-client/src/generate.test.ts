import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { CONTRACT_PATH, SCHEMA_PATH, generateSchema } from '../generate.ts';

describe('generate:api', () => {
  it('F1.12-AC1: openapi.yaml tiplerini üretir; iki kez üretince fark yok ve depodaki dosyayla aynı', async () => {
    const contract = await readFile(CONTRACT_PATH, 'utf8');

    const first = await generateSchema(contract);
    const second = await generateSchema(contract);

    expect(second).toBe(first);
    expect(first.startsWith('/**\n * ÜRETİLDİ — elle düzenleme.')).toBe(true);
    expect(first).toContain('"/api/health"');
    expect(await readFile(SCHEMA_PATH, 'utf8')).toBe(first);
  }, 30_000);
});
