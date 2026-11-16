import { randomUUID } from 'node:crypto';
import { SETTING_KEYS, type SettingKey } from '@b2b/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AuditEntry, AuditRecorder } from '../../../core/audit';
import type { Tx } from '../../../core/db';
import { DomainError } from '../../../core/errors/domain-error';
import type {
  SettingLayers,
  SettingScopeRow,
  SettingsCacheLookup,
  SettingsCachePort,
  SettingsRepositoryPort,
  SettingWriteHook,
} from '../settings.ports';
import { SettingsService, type SettingTarget } from '../settings.service';

interface Write {
  readonly target: SettingTarget;
  readonly key: SettingKey;
  readonly value: unknown;
  readonly userId: string;
}

/** Bellekte ayar deposu: platform, plan ve işletme katmanları. */
class FakeRepository implements SettingsRepositoryPort {
  readonly platform = new Map<string, unknown>();
  readonly plan = new Map<string, unknown>();
  readonly business = new Map<string, unknown>();
  /** İşletme → güncel aboneliğinin planı. */
  readonly planOf = new Map<string, string>();
  readonly writes: Write[] = [];
  reads = 0;

  read(key: SettingKey, businessId?: string): Promise<SettingLayers> {
    this.reads += 1;
    const layers: { platform?: unknown; plan?: unknown; business?: unknown } = {};
    if (this.platform.has(key)) layers.platform = this.platform.get(key);
    if (businessId !== undefined) {
      const planId = this.planOf.get(businessId);
      const planKey = `${planId ?? ''}:${key}`;
      if (planId !== undefined && this.plan.has(planKey)) layers.plan = this.plan.get(planKey);
      const businessKey = `${businessId}:${key}`;
      if (this.business.has(businessKey)) layers.business = this.business.get(businessKey);
    }
    return Promise.resolve(layers);
  }

  /** F2.19: kapsam + miras satırları (`settings_admin_list` ile aynı seçim). */
  listScopeTx(_tx: Tx, target: SettingTarget): Promise<SettingScopeRow[]> {
    const at = new Date('2026-11-15T10:00:00Z');
    const rows: SettingScopeRow[] = [...this.platform].map(([key, value]) => ({
      scope: 'platform',
      key,
      value,
      updatedAt: at,
    }));
    const planId =
      target.scope === 'plan'
        ? target.planId
        : target.scope === 'business'
          ? this.planOf.get(target.businessId)
          : undefined;
    for (const [compound, value] of this.plan) {
      const [id, key] = compound.split(':') as [string, string];
      if (id === planId) rows.push({ scope: 'plan', key, value, updatedAt: at });
    }
    if (target.scope === 'business') {
      for (const [compound, value] of this.business) {
        const [id, key] = compound.split(':') as [string, string];
        if (id === target.businessId) rows.push({ scope: 'business', key, value, updatedAt: at });
      }
    }
    return Promise.resolve(rows);
  }

  async write(
    target: SettingTarget,
    key: SettingKey,
    value: unknown,
    userId: string,
    afterWrite: SettingWriteHook,
  ): Promise<void> {
    this.writes.push({ target, key, value, userId });
    const store =
      target.scope === 'platform'
        ? this.platform
        : target.scope === 'plan'
          ? this.plan
          : this.business;
    const storeKey =
      target.scope === 'platform'
        ? key
        : `${target.scope === 'plan' ? target.planId : target.businessId}:${key}`;
    const previous = store.has(storeKey) ? store.get(storeKey) : null;
    store.set(storeKey, value);
    await afterWrite(FAKE_TX, previous);
  }
}

/** Birim testte işlem nesnesi kullanılmaz; yalnızca iletildiği doğrulanır. */
const FAKE_TX = {} as Tx;

/** Audit kayıtlarını bellekte toplar. */
class FakeAudit implements AuditRecorder {
  readonly entries: { tx: Tx; entry: AuditEntry }[] = [];

  record(tx: Tx, entry: AuditEntry): Promise<void> {
    this.entries.push({ tx, entry });
    return Promise.resolve();
  }
}

/** Önbelleksiz (her okuma veritabanına gider). */
class NoCache implements SettingsCachePort {
  readonly deleted: string[] = [];

  getLayers(): Promise<SettingsCacheLookup> {
    return Promise.resolve({ layers: undefined, planVersion: '0' });
  }

  setLayers(): Promise<void> {
    return Promise.resolve();
  }

  invalidate(key: SettingKey, target: SettingTarget): Promise<void> {
    this.deleted.push(`${target.scope}:${key}`);
    return Promise.resolve();
  }
}

async function domainErrorCode(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error: unknown) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  return undefined;
}

describe('SettingsService (birim)', () => {
  let repo: FakeRepository;
  let cache: NoCache;
  let audit: FakeAudit;
  let service: SettingsService;
  const platform: SettingTarget = { scope: 'platform' };
  const actor = { userId: randomUUID() };

  beforeEach(() => {
    repo = new FakeRepository();
    cache = new NoCache();
    audit = new FakeAudit();
    service = new SettingsService(repo, cache, audit);
  });

  describe('F1.4-AC1: çözümleme tablosu (işletme → plan → platform → varsayılan)', () => {
    const KEY = 'connection.daily_request_quota';
    const cases: {
      name: string;
      platform?: unknown;
      plan?: unknown;
      business?: unknown;
      subscribed: boolean;
      expected: number;
    }[] = [
      { name: 'hiç satır yok → kod varsayılanı', subscribed: true, expected: 20 },
      { name: 'yalnızca platform', platform: 25, subscribed: true, expected: 25 },
      {
        name: 'plan değeri platformu ezer',
        platform: 25,
        plan: 30,
        subscribed: true,
        expected: 30,
      },
      { name: 'yalnızca plan', plan: 30, subscribed: true, expected: 30 },
      {
        name: 'işletme değeri planı ezer',
        platform: 25,
        plan: 30,
        business: 40,
        subscribed: true,
        expected: 40,
      },
      {
        name: 'aboneliksiz işletmede plan katmanı yok',
        platform: 25,
        plan: 30,
        subscribed: false,
        expected: 25,
      },
      {
        name: 'geçersiz işletme değeri → plan',
        platform: 25,
        plan: 30,
        business: 'bozuk',
        subscribed: true,
        expected: 30,
      },
      {
        name: 'geçersiz plan değeri → platform',
        platform: 25,
        plan: -1,
        subscribed: true,
        expected: 25,
      },
    ];

    it.each(cases)('$name', async (c) => {
      const businessId = randomUUID();
      const planId = randomUUID();
      if (c.subscribed) repo.planOf.set(businessId, planId);
      if ('platform' in c) repo.platform.set(KEY, c.platform);
      if ('plan' in c) repo.plan.set(`${planId}:${KEY}`, c.plan);
      if ('business' in c) repo.business.set(`${businessId}:${KEY}`, c.business);

      expect(await service.get(KEY, businessId)).toBe(c.expected);
    });

    it('işletmesiz çağrıda plan katmanı yok', async () => {
      const businessId = randomUUID();
      const planId = randomUUID();
      repo.planOf.set(businessId, planId);
      repo.plan.set(`${planId}:${KEY}`, 30);

      expect(await service.get(KEY)).toBe(20);
    });
  });

  it('F1.4-AC1: işletme değeri platformu ezer', async () => {
    const businessId = randomUUID();
    repo.platform.set('connection.daily_request_quota', 25);
    repo.business.set(`${businessId}:connection.daily_request_quota`, 40);

    expect(await service.get('connection.daily_request_quota', businessId)).toBe(40);
    expect(await service.get('connection.daily_request_quota', randomUUID())).toBe(25);
    expect(await service.get('connection.daily_request_quota')).toBe(25);
  });

  it('F1.4-AC1: değer yoksa kod varsayılanı', async () => {
    expect(await service.get('connection.daily_request_quota', randomUUID())).toBe(20);
    expect(await service.get('sms.allowed_country_codes')).toEqual(['+994']);
  });

  it('F1.4-AC1: kayıtlı değer geçersizse bir alt katmana düşer', async () => {
    const businessId = randomUUID();
    repo.platform.set('delivery.auto_confirm_hours', 72);
    repo.business.set(`${businessId}:delivery.auto_confirm_hours`, 'bozuk');

    expect(await service.get('delivery.auto_confirm_hours', businessId)).toBe(72);

    repo.platform.set('delivery.auto_confirm_hours', -5);
    expect(await service.get('delivery.auto_confirm_hours', businessId)).toBe(48);
  });

  it('F1.4-AC2: cooldown 6 gün → SETTING_OUT_OF_RANGE', async () => {
    const code = await domainErrorCode(
      service.set('connection.cooldown_after_reject_days', 6, platform, actor),
    );

    expect(code).toBe('SETTING_OUT_OF_RANGE');
    expect(repo.writes).toEqual([]);
  });

  it('F1.4-AC2: yanlış tip → SETTING_OUT_OF_RANGE', async () => {
    for (const value of ['30', 30.5, null, { days: 30 }]) {
      const code = await domainErrorCode(
        service.set('connection.cooldown_after_reject_days', value, platform, actor),
      );
      expect(code).toBe('SETTING_OUT_OF_RANGE');
    }
    expect(repo.writes).toEqual([]);
  });

  it('F1.4-AC2: bilinmeyen anahtar → SETTING_OUT_OF_RANGE', async () => {
    const code = await domainErrorCode(
      service.set('connection.unknown' as SettingKey, 1, platform, actor),
    );

    expect(code).toBe('SETTING_OUT_OF_RANGE');
  });

  it('F1.4-AC2: deactivate_day ≤ warning_day → SETTING_OUT_OF_RANGE', async () => {
    expect(await domainErrorCode(service.set('dormant.deactivate_day', 90, platform, actor))).toBe(
      'SETTING_OUT_OF_RANGE',
    );
    expect(await domainErrorCode(service.set('dormant.warning_day', 120, platform, actor))).toBe(
      'SETTING_OUT_OF_RANGE',
    );
    expect(await domainErrorCode(service.set('dormant.delete_day', 100, platform, actor))).toBe(
      'SETTING_OUT_OF_RANGE',
    );
    expect(repo.writes).toEqual([]);
  });

  it('F1.4-AC2: reminder_days elemanı ≥ warning_day → SETTING_OUT_OF_RANGE', async () => {
    expect(
      await domainErrorCode(service.set('dormant.reminder_days', [7, 90], platform, actor)),
    ).toBe('SETTING_OUT_OF_RANGE');
  });

  it('F1.4-AC2: çapraz kural işletme kapsamında işletmenin geçerli değerleriyle kontrol edilir', async () => {
    const businessId = randomUUID();
    const target: SettingTarget = { scope: 'business', businessId };
    repo.business.set(`${businessId}:dormant.warning_day`, 30);

    expect(
      await domainErrorCode(service.set('dormant.reminder_days', [7, 30], target, actor)),
    ).toBe('SETTING_OUT_OF_RANGE');
    await service.set('dormant.reminder_days', [7, 20], target, actor);
    expect(await service.get('dormant.reminder_days', businessId)).toEqual([7, 20]);
  });

  it('F1.4-AC2: geçerli değer yazılır, yazan kullanıcı ve kapsam iletilir', async () => {
    await service.set('dormant.warning_day', 100, platform, actor);

    expect(repo.writes).toEqual([
      { target: platform, key: 'dormant.warning_day', value: 100, userId: actor.userId },
    ]);
    expect(await service.get('dormant.warning_day')).toBe(100);
  });

  it('F1.4-AC3: set sonrası ilgili önbellek anahtarı silinir', async () => {
    const businessId = randomUUID();

    await service.set('sms.daily_cap', 200, platform, actor);
    await service.set('sms.daily_cap', 100, { scope: 'business', businessId }, actor);

    expect(cache.deleted).toEqual(['platform:sms.daily_cap', 'business:sms.daily_cap']);
  });

  it('F1.4-AC1: plan kapsamına yazılır, plan önbelleği geçersiz kılınır', async () => {
    const businessId = randomUUID();
    const planId = randomUUID();
    repo.planOf.set(businessId, planId);
    const target: SettingTarget = { scope: 'plan', planId };

    await service.set('sms.daily_cap', 120, target, actor);

    expect(repo.writes).toEqual([
      { target, key: 'sms.daily_cap', value: 120, userId: actor.userId },
    ]);
    expect(cache.deleted).toEqual(['plan:sms.daily_cap']);
    expect(await service.get('sms.daily_cap', businessId)).toBe(120);
    expect(await service.get('sms.daily_cap')).toBe(500);
  });

  it('F1.4-AC2: plan kapsamında da sınır dışı değer → SETTING_OUT_OF_RANGE', async () => {
    const code = await domainErrorCode(
      service.set(
        'connection.cooldown_after_reject_days',
        6,
        { scope: 'plan', planId: randomUUID() },
        actor,
      ),
    );

    expect(code).toBe('SETTING_OUT_OF_RANGE');
    expect(repo.writes).toEqual([]);
  });

  it("US-017 AC2: yazım aynı işlemde eski ve yeni değerle audit'e iletilir", async () => {
    const businessId = randomUUID();
    const target: SettingTarget = { scope: 'business', businessId };
    const context = { requestId: 'req-1', ip: '198.51.100.1' };

    await service.set('sms.daily_cap', 50, target, { ...actor, context });
    await service.set('sms.daily_cap', 60, target, actor);

    expect(audit.entries).toEqual([
      {
        tx: FAKE_TX,
        entry: {
          actor: { type: 'platform', userId: actor.userId },
          businessId,
          action: 'setting.updated',
          targetType: 'setting',
          targetId: `business:${businessId}:sms.daily_cap`,
          before: null,
          after: 50,
          context,
        },
      },
      {
        tx: FAKE_TX,
        entry: expect.objectContaining({ before: 50, after: 60 }) as AuditEntry,
      },
    ]);
    expect(audit.entries[1]?.entry).not.toHaveProperty('context');
  });

  it('US-017 AC2: platform ve plan kapsamında işletme null, hedef kimliği kapsamı taşır', async () => {
    const planId = randomUUID();
    await service.set('sms.daily_cap', 200, platform, actor);
    await service.set('sms.daily_cap', 120, { scope: 'plan', planId }, actor);

    expect(audit.entries.map(({ entry }) => [entry.businessId, entry.targetId])).toEqual([
      [null, 'platform:platform:sms.daily_cap'],
      [null, `plan:${planId}:sms.daily_cap`],
    ]);
  });

  it("US-017 AC2: reddedilen değer audit'e yazılmaz", async () => {
    await domainErrorCode(service.set('connection.cooldown_after_reject_days', 6, platform, actor));

    expect(audit.entries).toEqual([]);
  });

  describe('F2.19 listForScopeTx (admin ekranı)', () => {
    const tx = {} as Tx;

    it('F2.19-AC1: platform kapsamı kendi değerini, miras olarak kod varsayılanını döner', async () => {
      repo.platform.set('connection.daily_request_quota', 40);
      const items = await service.listForScopeTx(tx, { scope: 'platform' });
      const quota = items.find((item) => item.key === 'connection.daily_request_quota');
      expect(quota).toMatchObject({
        kind: 'int',
        min: 1,
        max: 1000,
        value: 40,
        inheritedValue: 20,
        inheritedFrom: 'default',
      });
      expect(quota?.scopes).toEqual(['platform', 'plan', 'business']);
      const ttl = items.find((item) => item.key === 'otp.code_ttl_minutes');
      expect(ttl).toMatchObject({ value: null, updatedAt: null, scopes: ['platform'] });
      expect(items).toHaveLength(SETTING_KEYS.length);
    });

    it('F2.19-AC1: işletme kapsamında miras en özel kapsamdan gelir (plan → platform → varsayılan)', async () => {
      const businessId = randomUUID();
      const planId = randomUUID();
      repo.planOf.set(businessId, planId);
      repo.platform.set('connection.daily_request_quota', 40);
      repo.plan.set(`${planId}:connection.daily_request_quota`, 100);
      repo.platform.set('connection.cooldown_after_reject_days', 45);
      repo.business.set(`${businessId}:invitation.team_days`, 3);
      const items = await service.listForScopeTx(tx, { scope: 'business', businessId });
      const byKey = new Map(items.map((item) => [item.key, item]));
      expect(byKey.get('connection.daily_request_quota')).toMatchObject({
        value: null,
        inheritedValue: 100,
        inheritedFrom: 'plan',
      });
      expect(byKey.get('connection.cooldown_after_reject_days')).toMatchObject({
        inheritedValue: 45,
        inheritedFrom: 'platform',
      });
      expect(byKey.get('invitation.team_days')).toMatchObject({
        value: 3,
        inheritedValue: 7,
        inheritedFrom: 'default',
      });
    });

    it('F2.19-AC1: geçersiz kayıtlı değer ekranda yok sayılır', async () => {
      repo.platform.set('connection.cooldown_after_reject_days', 3);
      const items = await service.listForScopeTx(tx, { scope: 'plan', planId: randomUUID() });
      expect(
        items.find((item) => item.key === 'connection.cooldown_after_reject_days'),
      ).toMatchObject({
        value: null,
        inheritedValue: 30,
        inheritedFrom: 'default',
      });
    });
  });
});
