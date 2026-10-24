import { randomUUID } from 'node:crypto';
import type { SettingKey } from '@b2b/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { DomainError } from '../../../core/errors/domain-error';
import type {
  SettingLayers,
  SettingsCacheLookup,
  SettingsCachePort,
  SettingsRepositoryPort,
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

  write(target: SettingTarget, key: SettingKey, value: unknown, userId: string): Promise<void> {
    this.writes.push({ target, key, value, userId });
    if (target.scope === 'platform') this.platform.set(key, value);
    else if (target.scope === 'plan') this.plan.set(`${target.planId}:${key}`, value);
    else this.business.set(`${target.businessId}:${key}`, value);
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
  let service: SettingsService;
  const platform: SettingTarget = { scope: 'platform' };
  const actor = { userId: randomUUID() };

  beforeEach(() => {
    repo = new FakeRepository();
    cache = new NoCache();
    service = new SettingsService(repo, cache);
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
      { name: 'plan değeri platformu ezer', platform: 25, plan: 30, subscribed: true, expected: 30 },
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
      service.set('connection.cooldown_after_reject_days', 6, { scope: 'plan', planId: randomUUID() }, actor),
    );

    expect(code).toBe('SETTING_OUT_OF_RANGE');
    expect(repo.writes).toEqual([]);
  });
});
