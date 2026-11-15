// F2.11a: `directory` kuyruğu tüketicisi, yeniden indeksleme kilidi ve gece zamanlayıcısı (birim).
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { OUTBOX_EVENTS } from '../../../core/outbox/event-registry';
import { withRedisLock, type RedisLockClient } from '../../../infrastructure/redis';
import { DIRECTORY_EVENT_TYPES, DIRECTORY_REINDEX_JOB } from '../directory-events';
import { DirectoryReindexService } from '../directory-reindex.service';
import { DirectoryReindexSchedule, reindexCronPattern } from '../directory-schedule';
import { DirectoryProcessor } from '../directory.processor';
import { DORMANT_ACCOUNTS_JOB } from '../jobs/dormant-accounts.job';

class MemoryLock implements RedisLockClient {
  readonly values = new Map<string, string>();
  set(key: string, value: string): Promise<'OK' | null> {
    if (this.values.has(key)) return Promise.resolve(null);
    this.values.set(key, value);
    return Promise.resolve('OK');
  }
  eval(_script: string, _keys: number, key: string, token: string): Promise<unknown> {
    if (this.values.get(key) === token) this.values.delete(key);
    return Promise.resolve(1);
  }
}

const settings = {
  get: vi.fn((key: string) =>
    Promise.resolve(
      (
        {
          'directory.reindex_lock_seconds': 1800,
          'directory.reindex_batch_size': 500,
          'directory.reindex_hour_utc': 3,
        } as Record<string, number>
      )[key],
    ),
  ),
};

function processor() {
  const indexer = { refresh: vi.fn(() => Promise.resolve()) };
  const reindex = { run: vi.fn(() => Promise.resolve({ status: 'done' as const, indexed: 2 })) };
  const dormant = { run: vi.fn(() => Promise.resolve({ status: 'done' as const, processed: 3 })) };
  const log = { info: vi.fn(), warn: vi.fn() };
  return {
    indexer,
    reindex,
    dormant,
    log,
    processor: new DirectoryProcessor(indexer, reindex, dormant, log),
  };
}

describe('F2.11a directory kuyruğu', () => {
  it('F2.11a-AC7: dizin olayları directory kuyruğunda, yükte yalnız businessId', () => {
    for (const type of DIRECTORY_EVENT_TYPES) {
      const definition = OUTBOX_EVENTS[type as keyof typeof OUTBOX_EVENTS];
      expect(definition.queue, type).toBe('directory');
      expect(Object.keys(definition.fields), type).toContain('businessId');
    }
    expect(OUTBOX_EVENTS['buyer.profile_changed'].fields).toEqual({ businessId: 'id' });
  });

  it('F2.11a-AC8: outbox olayı yalnız kimlikle belgeyi yeniler; yükteki diğer alana bakmaz', async () => {
    const { processor: p, indexer } = processor();
    const businessId = randomUUID();
    await p.process({
      name: 'buyer.privacy_changed',
      data: { eventId: '42', type: 'buyer.privacy_changed', payload: { businessId, extra: 'x' } },
    });
    expect(indexer.refresh).toHaveBeenCalledWith([businessId]);
  });

  it('geçersiz yük reddedilir (iş yeniden denenir, indeks değişmez)', async () => {
    const { processor: p, indexer } = processor();
    await expect(
      p.process({
        name: 'buyer.registered',
        data: { eventId: '1', type: 'buyer.registered', payload: { businessId: 'x' } },
      }),
    ).rejects.toThrow();
    expect(indexer.refresh).not.toHaveBeenCalled();
  });

  it('directory.reindex işi yeniden indekslemeyi çalıştırır; bilinmeyen iş atlanır', async () => {
    const { processor: p, reindex, indexer, log } = processor();
    await p.process({ name: DIRECTORY_REINDEX_JOB, data: {} });
    expect(reindex.run).toHaveBeenCalledOnce();
    await p.process({ name: 'buyer.unknown', data: {} });
    expect(indexer.refresh).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledOnce();
  });

  it('F2.11a-AC8: yeniden indeksleme kilitliyse çalışmaz (ADR-0011 §4)', async () => {
    const lock = new MemoryLock();
    const indexer = {
      rebuild: vi.fn(() => Promise.resolve({ indexed: 5 })),
      refresh: vi.fn(() => Promise.resolve()),
    };
    const dirty = [randomUUID()];
    const tracker = { drain: vi.fn(() => Promise.resolve(dirty)) };
    const service = new DirectoryReindexService(indexer, tracker, settings as never, lock);

    expect(await service.run()).toEqual({ status: 'done', indexed: 5 });
    expect(indexer.rebuild).toHaveBeenCalledWith(500);
    // M1: takastan sonra kirli kimlikler izlenmeden yeniden işlenir.
    expect(indexer.refresh).toHaveBeenCalledWith(dirty, { track: false });
    expect(lock.values.size).toBe(0);

    await withRedisLock(lock, 'lock:directory:reindex', 60, async () => {
      expect(await service.run()).toEqual({ status: 'locked' });
    });
    expect(indexer.rebuild).toHaveBeenCalledOnce();
  });

  it('kilit fn hata verse de bırakılır', async () => {
    const lock = new MemoryLock();
    await expect(
      withRedisLock(lock, 'k', 60, () => Promise.reject(new Error('hata'))),
    ).rejects.toThrow('hata');
    expect(lock.values.size).toBe(0);
  });

  it('gece zamanlayıcısı ayardaki UTC saatiyle kurulur', async () => {
    const queue = { upsertJobScheduler: vi.fn(() => Promise.resolve(undefined as never)) };
    await new DirectoryReindexSchedule(
      { directory: queue },
      settings as never,
    ).onApplicationBootstrap();
    expect(reindexCronPattern(3)).toBe('0 3 * * *');
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      DIRECTORY_REINDEX_JOB,
      { pattern: '0 3 * * *', tz: 'UTC' },
      { name: DIRECTORY_REINDEX_JOB, data: {} },
    );
  });

  it('F2.17 directory.dormant_accounts işi bağlantısız hesap işini çalıştırır', async () => {
    const { processor: p, dormant, reindex, log } = processor();
    await p.process({ name: DORMANT_ACCOUNTS_JOB, data: {} });
    expect(dormant.run).toHaveBeenCalledOnce();
    expect(reindex.run).not.toHaveBeenCalled();
    expect(log.info).toHaveBeenCalledWith(
      { event: DORMANT_ACCOUNTS_JOB, status: 'done', processed: 3 },
      'bağlantısız hesap gece işi',
    );
  });
});
