// F2.11b birim testleri: uç listesi (US-019 AC4), sorgu şeması (US-020 AC2), Meilisearch filtre
// ifadesi (kullanıcı metni filtreye girmez).
import { randomUUID } from 'node:crypto';
import { directorySearchQuerySchema } from '@b2b/shared';
import { describe, expect, it } from 'vitest';
import { buyerDirectoryFilter } from '../../../infrastructure/search/meili-buyer-directory-index';
import { DirectoryController } from '../directory.controller';

describe('F2.11b dizin arama (birim)', () => {
  it('F2.11b-AC4 dizin denetleyicisinde yalnız arama var; dışa aktarma ucu yok', () => {
    const methods = Object.getOwnPropertyNames(DirectoryController.prototype).filter(
      (name) => name !== 'constructor',
    );
    expect(methods).toEqual(['buyers']);
  });

  it('F2.11b-AC7 sorgu: tam telefon/VÖEN tek başına; kısmi VÖEN ve birlikte kullanım reddedilir', () => {
    const ok = directorySearchQuerySchema.parse({ phone: '+994501234567' });
    expect(ok).toMatchObject({ phone: '+994501234567', limit: 20 });
    expect(directorySearchQuerySchema.safeParse({ voen: '123456789' }).success).toBe(false);
    expect(
      directorySearchQuerySchema.safeParse({ phone: '+994501234567', voen: '1234567891' }).success,
    ).toBe(false);
    expect(
      directorySearchQuerySchema.safeParse({ voen: '1234567891', activityTypeId: randomUUID() })
        .success,
    ).toBe(false);
    expect(directorySearchQuerySchema.safeParse({ limit: '21' }).success).toBe(false);
  });

  it('F2.11b-AC1 sorgu: regionId tekil veya dizi, verified metinden, boş q yok sayılır', () => {
    const id = randomUUID();
    expect(directorySearchQuerySchema.parse({ regionId: id }).regionId).toEqual([id]);
    expect(directorySearchQuerySchema.parse({ regionId: [id, id] }).regionId).toEqual([id, id]);
    expect(directorySearchQuerySchema.parse({ verified: 'false' }).verified).toBe(false);
    expect(directorySearchQuerySchema.parse({ q: '   ' }).q).toBeUndefined();
    expect(directorySearchQuerySchema.safeParse({ regionId: 'x' }).success).toBe(false);
  });

  it('F2.11b-AC10 Meilisearch filtresi yalnız UUID değer taşır; gruplar VE, grup içi VEYA', () => {
    const [a, b, c] = [randomUUID(), randomUUID(), randomUUID()];
    const base = { q: 'x', activityTypeId: undefined, verified: undefined, offset: 0, limit: 20 };
    expect(buyerDirectoryFilter({ ...base, regionGroups: [[a, b], [c]], verified: true })).toEqual([
      `(regionId IN ["${a}", "${b}"] OR cityId IN ["${a}", "${b}"])`,
      `(regionId IN ["${c}"] OR cityId IN ["${c}"])`,
      'verified = true',
    ]);
    expect(() =>
      buyerDirectoryFilter({ ...base, regionGroups: [], activityTypeId: '" OR 1 = 1' }),
    ).toThrow('UUID');
  });
});
