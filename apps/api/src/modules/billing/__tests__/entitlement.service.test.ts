import { randomUUID } from 'node:crypto';
import type { EntitlementKey } from '@b2b/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PlatformTxContext, Tx } from '../../../core/db';
import { DomainError } from '../../../core/errors/domain-error';
import type { EntitlementRepositoryPort, EntitlementSources } from '../billing.ports';
import { EntitlementUsageRegistry } from '../entitlement-usage.registry';
import { EntitlementService } from '../entitlement.service';

/** Bellekte hak deposu: işletme → plan, plan hakları, istisnalar. */
class FakeRepository implements EntitlementRepositoryPort {
  readonly planOf = new Map<string, string>();
  readonly planValues = new Map<string, unknown>();
  readonly overrides = new Map<string, unknown>();
  readonly writes: { kind: string; id: string; key: string; value: unknown }[] = [];
  readonly tx = {} as Tx;

  inTenantTx<T>(_businessId: string, tx: Tx | undefined, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return fn(tx ?? this.tx);
  }

  findSources(_tx: Tx, businessId: string, key: EntitlementKey): Promise<EntitlementSources> {
    const sources: { override?: unknown; plan?: unknown } = {};
    const overrideKey = `${businessId}:${key}`;
    if (this.overrides.has(overrideKey)) sources.override = this.overrides.get(overrideKey);
    const planId = this.planOf.get(businessId);
    const planKey = `${planId ?? ''}:${key}`;
    if (planId !== undefined && this.planValues.has(planKey)) {
      sources.plan = this.planValues.get(planKey);
    }
    return Promise.resolve(sources);
  }

  writePlanEntitlement(
    _ctx: PlatformTxContext,
    planId: string,
    key: EntitlementKey,
    value: unknown,
  ): Promise<void> {
    this.writes.push({ kind: 'plan', id: planId, key, value });
    this.planValues.set(`${planId}:${key}`, value);
    return Promise.resolve();
  }

  writeOverride(
    _ctx: PlatformTxContext,
    businessId: string,
    key: EntitlementKey,
    value: unknown,
  ): Promise<void> {
    this.writes.push({ kind: 'override', id: businessId, key, value });
    this.overrides.set(`${businessId}:${key}`, value);
    return Promise.resolve();
  }
}

async function errorOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  const error = await errorOf(promise);
  if (error === undefined) return undefined;
  return error instanceof DomainError ? error.code : 'not-domain-error';
}

describe('EntitlementService (birim)', () => {
  let repo: FakeRepository;
  let usage: EntitlementUsageRegistry;
  let service: EntitlementService;
  let users: number;
  const actor = { userId: randomUUID() };

  /** Planlı işletme açar ve `users.max` değerini yazar. */
  function subscribed(limit: unknown): string {
    const businessId = randomUUID();
    const planId = randomUUID();
    repo.planOf.set(businessId, planId);
    repo.planValues.set(`${planId}:users.max`, limit);
    return businessId;
  }

  beforeEach(() => {
    repo = new FakeRepository();
    usage = new EntitlementUsageRegistry();
    users = 0;
    usage.register('users.max', () => Promise.resolve(users));
    service = new EntitlementService(repo, usage);
  });

  it('US-055 AC2: users.max=3, kullanım 3, delta 1 → ENTITLEMENT_LIMIT_REACHED', async () => {
    const businessId = subscribed(3);
    users = 3;

    const error = await errorOf(service.check('users.max', businessId, 1));

    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe('ENTITLEMENT_LIMIT_REACHED');
    expect((error as DomainError).details).toEqual({ key: 'users.max', limit: 3 });
  });

  it('US-055 AC2: users.max=3, kullanım 2, delta 1 → izin', async () => {
    const businessId = subscribed(3);
    users = 2;

    expect(await codeOf(service.check('users.max', businessId, 1))).toBeUndefined();
  });

  it('US-055 AC2: kullanım 2, delta 2 → ENTITLEMENT_LIMIT_REACHED', async () => {
    const businessId = subscribed(3);
    users = 2;

    expect(await codeOf(service.check('users.max', businessId, 2))).toBe(
      'ENTITLEMENT_LIMIT_REACHED',
    );
  });

  it('US-055 AC2: null = sınırsız', async () => {
    const businessId = subscribed(null);
    users = 1_000_000;

    expect(await codeOf(service.check('users.max', businessId, 5))).toBeUndefined();
  });

  it('US-055 AC2: aboneliksiz işletme → ENTITLEMENT_LIMIT_REACHED', async () => {
    expect(await codeOf(service.check('users.max', randomUUID(), 1))).toBe(
      'ENTITLEMENT_LIMIT_REACHED',
    );
  });

  it('US-055 AC2: planda anahtar yoksa → ENTITLEMENT_LIMIT_REACHED', async () => {
    const businessId = randomUUID();
    repo.planOf.set(businessId, randomUUID());

    expect(await codeOf(service.check('users.max', businessId, 1))).toBe(
      'ENTITLEMENT_LIMIT_REACHED',
    );
  });

  it('US-055 AC2: kayıtlı değer geçersizse reddedilir', async () => {
    const businessId = subscribed('bozuk');

    expect(await codeOf(service.check('users.max', businessId, 1))).toBe(
      'ENTITLEMENT_LIMIT_REACHED',
    );
  });

  it('US-055 AC3: istisna plan değerinin yerine geçer (iki yönde)', async () => {
    const higher = subscribed(3);
    repo.overrides.set(`${higher}:users.max`, 10);
    users = 5;
    expect(await codeOf(service.check('users.max', higher, 1))).toBeUndefined();

    const lower = subscribed(10);
    repo.overrides.set(`${lower}:users.max`, 2);
    users = 2;
    expect(await codeOf(service.check('users.max', lower, 1))).toBe('ENTITLEMENT_LIMIT_REACHED');
  });

  it('US-055 AC3: aboneliksiz işletmede de istisna geçerli', async () => {
    const businessId = randomUUID();
    repo.overrides.set(`${businessId}:users.max`, 1);

    expect(await codeOf(service.check('users.max', businessId, 1))).toBeUndefined();
  });

  it('check: verilen işlem sayaca iletilir', async () => {
    const businessId = subscribed(3);
    const callerTx = { caller: true } as unknown as Tx;
    const seen: Tx[] = [];
    usage = new EntitlementUsageRegistry();
    usage.register('users.max', ({ tx }) => {
      seen.push(tx);
      return Promise.resolve(0);
    });
    service = new EntitlementService(repo, usage);

    await service.check('users.max', businessId, 1, callerTx);

    expect(seen).toEqual([callerTx]);
  });

  it('check: sayacı kayıtlı olmayan anahtar programcı hatasıdır', async () => {
    const error = await errorOf(service.check('warehouses.max', randomUUID(), 1));

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(DomainError);
  });

  it('check: delta pozitif tamsayı olmalı', async () => {
    const businessId = subscribed(3);
    for (const delta of [0, -1, 1.5]) {
      await expect(service.check('users.max', businessId, delta)).rejects.toBeInstanceOf(TypeError);
    }
  });

  it('kayıt: aynı anahtara iki sayaç kaydedilemez', () => {
    expect(() => {
      usage.register('users.max', () => Promise.resolve(0));
    }).toThrow();
  });

  it('isEnabled: plan değeri; istisna önce; değer yoksa kapalı', async () => {
    const businessId = randomUUID();
    const planId = randomUUID();
    repo.planOf.set(businessId, planId);
    repo.planValues.set(`${planId}:feature.export`, true);
    repo.planValues.set(`${planId}:feature.courier_app`, true);
    repo.overrides.set(`${businessId}:feature.courier_app`, false);

    expect(await service.isEnabled('feature.export', businessId)).toBe(true);
    expect(await service.isEnabled('feature.courier_app', businessId)).toBe(false);
    expect(await service.isEnabled('feature.branch_pricing', businessId)).toBe(false);
    expect(await service.isEnabled('feature.export', randomUUID())).toBe(false);
  });

  it('D3: plan hakkı yazımında yanlış tip → VALIDATION_FAILED (yazılmaz)', async () => {
    const planId = randomUUID();
    for (const [key, value] of [
      ['users.max', -1],
      ['users.max', '3'],
      ['feature.export', 1],
      ['feature.branch_pricing', null],
    ] as const) {
      expect(await codeOf(service.setPlanEntitlement(planId, key, value, actor))).toBe(
        'VALIDATION_FAILED',
      );
    }
    expect(repo.writes).toEqual([]);
  });

  it('D3: bilinmeyen anahtar → VALIDATION_FAILED (plan ve istisna)', async () => {
    const key = 'feature.unknown' as EntitlementKey;
    expect(await codeOf(service.setPlanEntitlement(randomUUID(), key, true, actor))).toBe(
      'VALIDATION_FAILED',
    );
    expect(await codeOf(service.setOverride(randomUUID(), key, true, null, actor))).toBe(
      'VALIDATION_FAILED',
    );
    expect(repo.writes).toEqual([]);
  });

  it('D3: geçerli değerler yazılır (null sınırsız dahil)', async () => {
    const planId = randomUUID();
    const businessId = randomUUID();
    await service.setPlanEntitlement(planId, 'users.max', null, actor);
    await service.setPlanEntitlement(planId, 'feature.branch_pricing', true, actor);
    await service.setOverride(businessId, 'warehouses.max', 4, 'pilot müşteri', actor);

    expect(repo.writes).toEqual([
      { kind: 'plan', id: planId, key: 'users.max', value: null },
      { kind: 'plan', id: planId, key: 'feature.branch_pricing', value: true },
      { kind: 'override', id: businessId, key: 'warehouses.max', value: 4 },
    ]);
  });
});
