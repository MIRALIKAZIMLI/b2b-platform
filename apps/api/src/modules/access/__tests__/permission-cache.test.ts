import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AccessEventsProcessor } from '../access-events.processor';
import { PermissionCache, permissionCacheKey, type PermissionRedis } from '../permission.cache';

class MemoryRedis implements PermissionRedis {
  readonly store = new Map<string, { value: string; seconds: number }>();
  down = false;

  get(key: string): Promise<string | null> {
    if (this.down) return Promise.reject(new Error('down'));
    return Promise.resolve(this.store.get(key)?.value ?? null);
  }

  set(key: string, value: string, _mode: 'EX', seconds: number): Promise<'OK'> {
    if (this.down) return Promise.reject(new Error('down'));
    this.store.set(key, { value, seconds });
    return Promise.resolve('OK');
  }

  del(...keys: string[]): Promise<number> {
    if (this.down) return Promise.reject(new Error('down'));
    let removed = 0;
    for (const key of keys) if (this.store.delete(key)) removed += 1;
    return Promise.resolve(removed);
  }
}

const settings = { get: () => Promise.resolve(45) } as unknown as ConstructorParameters<
  typeof PermissionCache
>[1];

describe('PermissionCache (F1.8b)', () => {
  it('F1.8-AC5: rol kimliği eşleşirse döner, ömür ayardan', async () => {
    const redis = new MemoryRedis();
    const cache = new PermissionCache(redis, settings);
    const membershipId = randomUUID();
    const roleId = randomUUID();
    await cache.set(membershipId, roleId, [['orders.view', 'all']]);
    expect(redis.store.get(permissionCacheKey(membershipId))?.seconds).toBe(45);
    expect(await cache.get(membershipId, roleId)).toEqual([['orders.view', 'all']]);
  });

  it('F1.8-AC5: rol değiştiyse, kayıt bozuksa veya katalog dışı kod varsa yok sayılır', async () => {
    const redis = new MemoryRedis();
    const cache = new PermissionCache(redis, settings);
    const membershipId = randomUUID();
    const roleId = randomUUID();
    await cache.set(membershipId, roleId, [['orders.view', 'all']]);
    expect(await cache.get(membershipId, randomUUID())).toBeUndefined();
    redis.store.set(permissionCacheKey(membershipId), { value: '{bozuk', seconds: 1 });
    expect(await cache.get(membershipId, roleId)).toBeUndefined();
    redis.store.set(permissionCacheKey(membershipId), {
      value: JSON.stringify({ roleId, permissions: [['orders.delete', 'all']] }),
      seconds: 1,
    });
    expect(await cache.get(membershipId, roleId)).toBeUndefined();
  });

  it('F1.8-AC5: Redis yoksa hata atmaz (veritabanına düşülür)', async () => {
    const redis = new MemoryRedis();
    redis.down = true;
    const cache = new PermissionCache(redis, settings);
    expect(await cache.get(randomUUID(), randomUUID())).toBeUndefined();
    await expect(cache.set(randomUUID(), randomUUID(), [])).resolves.toBeUndefined();
    await expect(cache.invalidate(randomUUID())).resolves.toBeUndefined();
  });

  it('F1.8-AC5: worker tüketicisi membership.role_changed ile anahtarı siler', async () => {
    const redis = new MemoryRedis();
    const cache = new PermissionCache(redis, settings);
    const membershipId = randomUUID();
    await cache.set(membershipId, randomUUID(), []);
    const processor = new AccessEventsProcessor(cache);
    await processor.process({ name: 'test.ping', data: {} });
    expect(redis.store.size).toBe(1);
    await processor.process({
      name: 'membership.role_changed',
      data: { eventId: '1', type: 'membership.role_changed', payload: { membershipId } },
    });
    expect(redis.store.size).toBe(0);
  });
});
