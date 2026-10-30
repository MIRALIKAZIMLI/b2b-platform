// BullMQ bağlantısı (Müfettiş notu b): ayarların ioredis istemcisinden ayrı, BullMQ'nun istediği seçeneklerle.
import { Test } from '@nestjs/testing';
import type { Redis } from 'ioredis';
import { afterEach, describe, expect, it } from 'vitest';
import { TEST_WORKER_ENV } from '../../../../test/env';
import { WorkerModule } from '../../../worker.module';
import { REDIS_CLIENT } from '../../redis';
import { BULLMQ_CONNECTION, createBullConnection } from '../index';

describe('BullMQ bağlantısı', () => {
  const opened: Redis[] = [];

  afterEach(() => {
    for (const client of opened.splice(0)) client.disconnect();
  });

  it('K7: maxRetriesPerRequest null, çevrimdışı kuyruk kapalı', () => {
    const client = createBullConnection({ url: 'redis://127.0.0.1:1' });
    opened.push(client);

    expect(client.options.maxRetriesPerRequest).toBeNull();
    expect(client.options.enableOfflineQueue).toBe(false);
  });

  it('K7: worker modülünde BullMQ bağlantısı ayarların istemcisinden ayrıdır', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [WorkerModule.register(TEST_WORKER_ENV)],
    }).compile();
    try {
      const bull = moduleRef.get<Redis>(BULLMQ_CONNECTION);
      const settings = moduleRef.get<Redis>(REDIS_CLIENT);

      expect(bull).not.toBe(settings);
      expect(bull.options.maxRetriesPerRequest).toBeNull();
      expect(settings.options.maxRetriesPerRequest).toBe(1);
    } finally {
      await moduleRef.close();
    }
  });
});
