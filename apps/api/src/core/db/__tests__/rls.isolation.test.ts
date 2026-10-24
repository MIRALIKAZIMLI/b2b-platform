import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import {
  createTenantPair,
  createTestTenantTable,
  PG_INSUFFICIENT_PRIVILEGE,
  pgErrorCode,
  type TenantPair,
  testTenantItems,
} from '../../../../test/isolation';
import { withTenantTx } from '../index';

describe('RLS kiracı izolasyonu (test_tenant_items)', () => {
  let pair: TenantPair;
  let aRowId: string;

  beforeAll(async () => {
    await createTestTenantTable(inject('migratorUrl'));
  });

  beforeEach(async () => {
    pair = createTenantPair();
    aRowId = randomUUID();
    await withTenantTx(pair.a, (tx) =>
      tx.insert(testTenantItems).values({ id: aRowId, businessId: pair.a.businessId, name: 'A' }),
    );
  });

  async function readAsA(): Promise<{ name: string } | undefined> {
    const rows = await withTenantTx(pair.a, (tx) =>
      tx.select().from(testTenantItems).where(eq(testTenantItems.id, aRowId)),
    );
    return rows[0];
  }

  it("F1.1-AC4: B, A'nın satırını göremez", async () => {
    const byId = await withTenantTx(pair.b, (tx) =>
      tx.select().from(testTenantItems).where(eq(testTenantItems.id, aRowId)),
    );
    const all = await withTenantTx(pair.b, (tx) => tx.select().from(testTenantItems));

    expect(byId).toEqual([]);
    expect(all.filter((row) => row.businessId === pair.a.businessId)).toEqual([]);
    expect(await readAsA()).toMatchObject({ name: 'A' });
  });

  it("F1.1-AC4: B, A'nın satırını güncelleyemez", async () => {
    const updated = await withTenantTx(pair.b, (tx) =>
      tx
        .update(testTenantItems)
        .set({ name: 'B yazdı' })
        .where(eq(testTenantItems.id, aRowId))
        .returning({ id: testTenantItems.id }),
    );

    expect(updated).toEqual([]);
    expect(await readAsA()).toMatchObject({ name: 'A' });
  });

  it("F1.1-AC4: B, A'nın satırını silemez", async () => {
    const deleted = await withTenantTx(pair.b, (tx) =>
      tx
        .delete(testTenantItems)
        .where(eq(testTenantItems.id, aRowId))
        .returning({ id: testTenantItems.id }),
    );

    expect(deleted).toEqual([]);
    expect(await readAsA()).toMatchObject({ name: 'A' });
  });

  it('F1.1-AC4: B, A adına ekleyemez', async () => {
    const id = randomUUID();
    const error: unknown = await withTenantTx(pair.b, (tx) =>
      tx.insert(testTenantItems).values({ id, businessId: pair.a.businessId, name: 'sahte' }),
    ).then(
      () => undefined,
      (caught: unknown) => caught,
    );

    expect(pgErrorCode(error)).toBe(PG_INSUFFICIENT_PRIVILEGE);
    const aRows = await withTenantTx(pair.a, (tx) =>
      tx.select().from(testTenantItems).where(eq(testTenantItems.id, id)),
    );
    expect(aRows).toEqual([]);
  });

  it("F1.1-AC4: B kendi satırını A'ya taşıyamaz", async () => {
    const bRowId = randomUUID();
    await withTenantTx(pair.b, (tx) =>
      tx.insert(testTenantItems).values({ id: bRowId, businessId: pair.b.businessId, name: 'B' }),
    );

    const error: unknown = await withTenantTx(pair.b, (tx) =>
      tx
        .update(testTenantItems)
        .set({ businessId: pair.a.businessId })
        .where(eq(testTenantItems.id, bRowId)),
    ).then(
      () => undefined,
      (caught: unknown) => caught,
    );

    expect(pgErrorCode(error)).toBe(PG_INSUFFICIENT_PRIVILEGE);
  });
});
