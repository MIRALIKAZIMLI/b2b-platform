// BusinessesRepository (F1.7): kendi kaydı, yetenek listesi ve platform onayı.
import { sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { withTenantTx } from '../../../core/db';
import { BusinessesRepository } from '../businesses.repository';
import { createBusiness, createRefs, newTenant, PLATFORM, type Refs } from './fixtures';

describe('BusinessesRepository', () => {
  const repository = new BusinessesRepository();
  let refs: Refs;

  beforeAll(async () => {
    refs = await createRefs();
  });

  it('findOwn kendi kaydını döndürür; başka işletmenin kaydı yoksa undefined', async () => {
    const tenant = newTenant();
    await createBusiness(tenant, refs);

    const own = await repository.findOwn(tenant);
    expect(own?.id).toBe(tenant.businessId);
    expect(own?.status).toBe('active');
    expect(own?.createdVia).toBe('self_signup');

    expect(await repository.findOwn(newTenant())).toBeUndefined();
  });

  it('F1.7-AC3: approveCapability platformda seller pending → approved yapar', async () => {
    const tenant = newTenant();
    await createBusiness(tenant, refs);
    await withTenantTx(tenant, (tx) =>
      tx.execute(sql`insert into business_capabilities (business_id, capability, status)
                     values (${tenant.businessId}, 'seller', 'pending')`),
    );
    expect(await repository.listCapabilities(tenant)).toEqual([
      { capability: 'seller', status: 'pending' },
    ]);

    const at = new Date('2026-10-25T09:00:00.000Z');
    expect(await repository.approveCapability(PLATFORM, tenant.businessId, 'seller', at)).toBe(
      true,
    );
    expect(await repository.listCapabilities(tenant)).toEqual([
      { capability: 'seller', status: 'approved' },
    ]);
    expect(await repository.approveCapability(PLATFORM, tenant.businessId, 'buyer', at)).toBe(
      false,
    );
  });
});
