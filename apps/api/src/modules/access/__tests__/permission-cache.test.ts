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

describe('PermissionCache (F2.8, R22)', () => {
  it('R22 rolün izin sürümü değişince önbellek yok sayılır; eski sürümsüz kayıt da', async () => {
    const redis = new MemoryRedis();
    const cache = new PermissionCache(redis, settings);
    const membershipId = randomUUID();
    const roleId = randomUUID();
    await cache.set(membershipId, roleId, [['orders.view', 'all']], 3);
    expect(await cache.get(membershipId, roleId, 3)).toEqual([['orders.view', 'all']]);
    expect(await cache.get(membershipId, roleId, 4)).toBeUndefined();
    redis.store.set(permissionCacheKey(membershipId), {
      value: JSON.stringify({ roleId, permissions: [['orders.view', 'all']] }),
      seconds: 1,
    });
    expect(await cache.get(membershipId, roleId, 1)).toBeUndefined();
  });

  it('R22 role.permissions_changed önbelleği siler; invalidateMany tek komutla', async () => {
    const redis = new MemoryRedis();
    const cache = new PermissionCache(redis, settings);
    const first = randomUUID();
    const second = randomUUID();
    await cache.set(first, randomUUID(), []);
    await cache.set(second, randomUUID(), []);
    const processor = new AccessEventsProcessor(cache);
    await processor.process({
      name: 'role.permissions_changed',
      data: {
        eventId: '1',
        type: 'role.permissions_changed',
        payload: { roleId: randomUUID(), membershipId: first, version: 2 },
      },
    });
    expect(redis.store.has(permissionCacheKey(first))).toBe(false);
    expect(redis.store.has(permissionCacheKey(second))).toBe(true);
    await cache.invalidateMany([second]);
    expect(redis.store.size).toBe(0);
    await expect(cache.invalidateMany([])).resolves.toBeUndefined();
  });
});
