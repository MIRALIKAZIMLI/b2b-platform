// F3.4b birim (Müfettiş 27 #79): görsel işinde geçici/kalıcı hata ayrımı, yeniden deneme ve
// worker eşzamanlılığı. Veritabanı yok (`withTenantTx` sahte).
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { CATALOG_WORKER_CONCURRENCY, CatalogProcessor } from '../catalog.processor';
import type { CatalogJobs, ResizeRetryJob } from '../jobs/catalog-jobs';
import { RESIZE_RETRY_JOB } from '../jobs/catalog-jobs';
import { type ResizeImageLog, ResizeImageJob } from '../jobs/resize-image.job';

vi.mock('../../../core/db', () => ({
  withTenantTx: (_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) => fn({}),
}));

const BUSINESS = '11111111-1111-4111-8111-111111111111';
const IMAGE = '22222222-2222-4222-8222-222222222222';
const KEY = `${BUSINESS}/product_image/33333333-3333-4333-8333-333333333333.png`;

async function png(): Promise<Buffer> {
  return await sharp({ create: { width: 40, height: 30, channels: 3, background: '#10b981' } })
    .png()
    .toBuffer();
}

function setup(options: {
  readonly body?: Buffer;
  readonly readError?: Error;
  readonly delays?: number[];
  readonly addError?: Error;
}) {
  const finished: string[] = [];
  const retries: { data: ResizeRetryJob; delayMs: number }[] = [];
  const warnings: Record<string, unknown>[] = [];
  const repository = {
    findForJob: vi.fn(() =>
      Promise.resolve({
        id: IMAGE,
        status: 'processing' as const,
        objectKey: KEY,
        contentType: 'image/png',
        sizeBytes: 100,
      }),
    ),
    finish: vi.fn((_tx: unknown, _id: string, status: string) => {
      finished.push(status);
      return Promise.resolve(true);
    }),
  };
  const storage = {
    readRange: vi.fn(() =>
      options.readError === undefined
        ? Promise.resolve(options.body ?? Buffer.alloc(0))
        : Promise.reject(options.readError),
    ),
    put: vi.fn(() => Promise.resolve()),
  };
  const settings = {
    get: vi.fn((key: string) =>
      Promise.resolve(
        key === 'catalog.image_retry_delays_minutes' ? (options.delays ?? [1, 5, 15]) : 40,
      ),
    ),
  };
  const jobs: Pick<CatalogJobs, 'addResizeRetry'> = {
    addResizeRetry: (data, delayMs) => {
      if (options.addError !== undefined) return Promise.reject(options.addError);
      retries.push({ data, delayMs });
      return Promise.resolve();
    },
  };
  const clock = { now: () => new Date('2026-11-26T12:00:00Z') };
  const job = new ResizeImageJob(repository, storage, settings as never, clock, jobs);
  const log: ResizeImageLog = { warn: (obj) => warnings.push(obj) };
  return { job, finished, retries, warnings, storage, log };
}

describe('F3.4b görsel işi yeniden deneme (birim)', () => {
  it('F3.4b-RETRY geçici depo hatası: satır processing kalır, ilk bekleme (1 dk) ile iş eklenir', async () => {
    const s = setup({ readError: new Error('R2 503') });
    const outcome = await s.job.run({ businessId: BUSINESS, imageId: IMAGE }, s.log);
    expect(outcome).toBe('retry');
    expect(s.finished).toEqual([]);
    expect(s.retries).toEqual([
      { data: { businessId: BUSINESS, imageId: IMAGE, attempt: 1 }, delayMs: 60_000 },
    ]);
    expect(s.warnings.map((w) => w.event)).toEqual(['catalog.image_retry_scheduled']);
  });

  it('F3.4b-RETRY ikinci deneme ikinci beklemeyi kullanır; liste bitince failed', async () => {
    const second = setup({ readError: new Error('timeout') });
    expect(
      await second.job.run({ businessId: BUSINESS, imageId: IMAGE, attempt: 1 }, second.log),
    ).toBe('retry');
    expect(second.retries[0]).toEqual({
      data: { businessId: BUSINESS, imageId: IMAGE, attempt: 2 },
      delayMs: 5 * 60_000,
    });

    const last = setup({ readError: new Error('timeout') });
    expect(await last.job.run({ businessId: BUSINESS, imageId: IMAGE, attempt: 3 }, last.log)).toBe(
      'failed',
    );
    expect(last.retries).toEqual([]);
    expect(last.finished).toEqual(['failed']);
    expect(last.warnings[0]).toMatchObject({ event: 'catalog.image_failed', reason: 'storage' });
  });

  it('F3.4b-RETRY kuyruğa eklenemezse satır asılı kalmaz: failed', async () => {
    const s = setup({ readError: new Error('R2 503'), addError: new Error('redis down') });
    expect(await s.job.run({ businessId: BUSINESS, imageId: IMAGE }, s.log)).toBe('failed');
    expect(s.finished).toEqual(['failed']);
  });

  it('F3.4b-RETRY bozuk görsel kalıcı hata: ilk denemede failed, yeniden deneme yok', async () => {
    const s = setup({ body: Buffer.alloc(200, 7) });
    expect(await s.job.run({ businessId: BUSINESS, imageId: IMAGE }, s.log)).toBe('failed');
    expect(s.retries).toEqual([]);
    expect(s.finished).toEqual(['failed']);
    expect(s.warnings[0]).toMatchObject({ event: 'catalog.image_failed', reason: 'decode' });
  });

  it('F3.4b-RETRY geçerli görsel ready; üç boyut yazılır', async () => {
    const s = setup({ body: await png() });
    expect(await s.job.run({ businessId: BUSINESS, imageId: IMAGE }, s.log)).toBe('ready');
    expect(s.storage.put).toHaveBeenCalledTimes(3);
    expect(s.finished).toEqual(['ready']);
  });

  it('F3.4b-CONC catalog worker aynı anda tek iş; yeniden deneme işi işlenir', async () => {
    expect(CATALOG_WORKER_CONCURRENCY).toBe(1);
    const run = vi.fn(() => Promise.resolve('ready' as const));
    const processor = new CatalogProcessor({ run }, { info: vi.fn(), warn: vi.fn() });
    await processor.process({
      name: RESIZE_RETRY_JOB,
      data: { businessId: BUSINESS, imageId: IMAGE, attempt: 2 },
    });
    expect(run).toHaveBeenCalledWith(
      { businessId: BUSINESS, imageId: IMAGE, attempt: 2 },
      expect.anything(),
    );
  });
});
