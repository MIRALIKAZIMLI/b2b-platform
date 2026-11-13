// F2.16 zamanlayıcı ve kuyruk tüketicisi (birim). İşin kendisi expire-requests.int.test.ts'te.
import { describe, expect, it, vi } from 'vitest';
import { ConnectionsProcessor } from '../jobs/connections.processor';
import {
  EXPIRE_REQUESTS_JOB,
  ExpireRequestsSchedule,
  expiryEveryMs,
} from '../jobs/expire-requests.job';

function fakeLog() {
  return { info: vi.fn(), warn: vi.fn() };
}

describe('F2.16 süre dolumu zamanlayıcısı ve tüketicisi', () => {
  it('US-026-AC1 zamanlayıcı ayardaki aralıkla (varsayılan 15 dk) tek kimlikle kurulur', async () => {
    const queue = { upsertJobScheduler: vi.fn(() => Promise.resolve(undefined as never)) };
    const settings = { get: vi.fn(() => Promise.resolve(15)) };
    await new ExpireRequestsSchedule(
      { connections: queue },
      settings as never,
    ).onApplicationBootstrap();
    expect(settings.get).toHaveBeenCalledWith('connection.request_expiry_interval_minutes');
    expect(expiryEveryMs(15)).toBe(900_000);
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      EXPIRE_REQUESTS_JOB,
      { every: 900_000 },
      { name: EXPIRE_REQUESTS_JOB, data: {} },
    );
  });

  it('F2.16-T7 kuyruk kayıtlı değilse açılış hata verir', async () => {
    const settings = { get: vi.fn(() => Promise.resolve(15)) };
    await expect(
      new ExpireRequestsSchedule({}, settings as never).onApplicationBootstrap(),
    ).rejects.toThrow('connections kuyruğu kayıtlı değil');
  });

  it('F2.16-T7 tüketici süre dolumu işini çalıştırır, bilinmeyen işi atlar; logda yalnız sayı', async () => {
    const run = vi.fn(() => Promise.resolve({ status: 'done' as const, processed: 3 }));
    const log = fakeLog();
    const processor = new ConnectionsProcessor({ run }, log);

    await processor.process({ name: EXPIRE_REQUESTS_JOB });
    await processor.process({ name: 'connections.other' });

    expect(run).toHaveBeenCalledTimes(1);
    expect(log.info).toHaveBeenCalledWith(
      { event: EXPIRE_REQUESTS_JOB, status: 'done', processed: 3 },
      'bağlantı isteği süre dolumu',
    );
    expect(log.warn).toHaveBeenCalledWith(
      { event: 'connections.unknown_job', jobName: 'connections.other' },
      'bilinmeyen iş, atlandı',
    );
  });
});
