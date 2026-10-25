import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  SettingsCache,
  type SettingsRedis,
  settingsCacheKey,
  settingsPlanVersionKey,
} from '../settings.cache';

/** Bellekte Redis karşılığı (yalnızca kullanılan komutlar). */
class MemoryRedis implements SettingsRedis {
  readonly store = new Map<string, string>();
  readonly ttls = new Map<string, number>();

  mget(...keys: string[]): Promise<(string | null)[]> {
    return Promise.resolve(keys.map((key) => this.store.get(key) ?? null));
  }

  set(key: string, value: string, _mode: 'EX', seconds: number): Promise<'OK'> {
    this.store.set(key, value);
    this.ttls.set(key, seconds);
    return Promise.resolve('OK');
  }

  del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) if (this.store.delete(key)) count += 1;
    return Promise.resolve(count);
  }

  incr(key: string): Promise<number> {
    const next = Number(this.store.get(key) ?? '0') + 1;
    this.store.set(key, String(next));
    return Promise.resolve(next);
  }
}

/** Her komutta hata veren Redis (bağlantı yok). */
class BrokenRedis implements SettingsRedis {
  mget(): Promise<(string | null)[]> {
    return Promise.reject(new Error('Connection is closed.'));
  }

  set(): Promise<'OK'> {
    return Promise.reject(new Error('Connection is closed.'));
  }

  del(): Promise<number> {
    return Promise.reject(new Error('Connection is closed.'));
  }

  incr(): Promise<number> {
    return Promise.reject(new Error('Connection is closed.'));
  }
}

describe('SettingsCache', () => {
  it('F1.4-AC3: anahtar biçimi settings:<scope>:<id>:<key>', () => {
    const businessId = randomUUID();
    const planId = randomUUID();

    expect(settingsCacheKey('sms.daily_cap', { scope: 'platform' })).toBe(
      'settings:platform:-:sms.daily_cap',
    );
    expect(settingsCacheKey('sms.daily_cap', { scope: 'business', businessId })).toBe(
      `settings:business:${businessId}:sms.daily_cap`,
    );
    expect(settingsCacheKey('sms.daily_cap', { scope: 'plan', planId })).toBe(
      `settings:plan:${planId}:sms.daily_cap`,
    );
    expect(settingsPlanVersionKey('sms.daily_cap')).toBe('settings:plan-version:sms.daily_cap');
  });

  it('F1.4-AC3: katmanlar yazılır ve aynen okunur (olmayan katman dahil)', async () => {
    const redis = new MemoryRedis();
    const cache = new SettingsCache(redis);
    const businessId = randomUUID();

    const first = await cache.getLayers('sms.daily_cap', businessId);
    expect(first).toEqual({ layers: undefined, planVersion: '0' });

    await cache.setLayers('sms.daily_cap', businessId, { platform: 300, plan: 200 }, 60, '0');

    expect(await cache.getLayers('sms.daily_cap', businessId)).toEqual({
      layers: { platform: 300, plan: 200 },
      planVersion: '0',
    });
    expect((await cache.getLayers('sms.daily_cap')).layers).toEqual({ platform: 300 });
    expect([...redis.ttls.values()]).toEqual([60, 60]);
  });

  it('F1.4-AC3: bir katman önbellekte yoksa sonuç yok (veritabanına gidilir)', async () => {
    const redis = new MemoryRedis();
    const cache = new SettingsCache(redis);
    await cache.setLayers('sms.daily_cap', undefined, { platform: 300 }, 60, '0');

    expect((await cache.getLayers('sms.daily_cap', randomUUID())).layers).toBeUndefined();
  });

  it('F1.4-AC3: invalidate yalnızca ilgili katmanı siler', async () => {
    const redis = new MemoryRedis();
    const cache = new SettingsCache(redis);
    const businessId = randomUUID();
    await cache.setLayers('sms.daily_cap', businessId, { platform: 300, business: 50 }, 60, '0');

    await cache.invalidate('sms.daily_cap', { scope: 'business', businessId });

    expect(redis.store.has(settingsCacheKey('sms.daily_cap', { scope: 'platform' }))).toBe(true);
    expect((await cache.getLayers('sms.daily_cap', businessId)).layers).toBeUndefined();
  });

  it('F1.4-AC3: plan yazımı sürümü artırır; eski sürümlü işletme kayıtları okunmaz', async () => {
    const redis = new MemoryRedis();
    const cache = new SettingsCache(redis);
    const businessId = randomUUID();
    await cache.setLayers('sms.daily_cap', businessId, { platform: 300, plan: 200 }, 60, '0');

    await cache.invalidate('sms.daily_cap', { scope: 'plan', planId: randomUUID() });

    const lookup = await cache.getLayers('sms.daily_cap', businessId);
    expect(lookup).toEqual({ layers: undefined, planVersion: '1' });
    expect((await cache.getLayers('sms.daily_cap')).layers).toEqual({ platform: 300 });

    await cache.setLayers('sms.daily_cap', businessId, { platform: 300, plan: 250 }, 60, '1');
    expect((await cache.getLayers('sms.daily_cap', businessId)).layers).toEqual({
      platform: 300,
      plan: 250,
    });
  });

  it('F1.4-AC3: okuma ile yazma arasında plan yazımı olursa kayıt kullanılmaz', async () => {
    const redis = new MemoryRedis();
    const cache = new SettingsCache(redis);
    const businessId = randomUUID();
    const lookup = await cache.getLayers('sms.daily_cap', businessId);

    await cache.invalidate('sms.daily_cap', { scope: 'plan', planId: randomUUID() });
    await cache.setLayers(
      'sms.daily_cap',
      businessId,
      { platform: 1, plan: 2 },
      60,
      lookup.planVersion,
    );

    expect((await cache.getLayers('sms.daily_cap', businessId)).layers).toBeUndefined();
  });

  it('F1.4-AC3: Redis hata verirse istisna atılmaz, sonuç yok döner', async () => {
    const cache = new SettingsCache(new BrokenRedis());

    expect((await cache.getLayers('sms.daily_cap', randomUUID())).layers).toBeUndefined();
    await expect(
      cache.setLayers('sms.daily_cap', undefined, { platform: 1 }, 60, '0'),
    ).resolves.toBeUndefined();
    await expect(cache.invalidate('sms.daily_cap', { scope: 'platform' })).resolves.toBeUndefined();
    await expect(
      cache.invalidate('sms.daily_cap', { scope: 'plan', planId: randomUUID() }),
    ).resolves.toBeUndefined();
  });
});
