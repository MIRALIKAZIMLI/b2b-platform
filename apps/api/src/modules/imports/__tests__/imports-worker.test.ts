// F3.5c (Müfettiş 29 not 6, kart K14): `imports` kuyruğu tüketicisinin yönlendirmesi ve worker
// modül grafiği (birim). Ağ bağlantısı kurulmaz (sahte adresler, `compile` başlatma yapmaz).
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { TEST_WORKER_ENV } from '../../../../test/env';
import { OUTBOX_EVENTS } from '../../../core/outbox/event-registry';
import { WorkerModule } from '../../../worker.module';
import { ImportsProcessor } from '../imports.processor';
import { APPLY_IMPORT_EVENT, ApplyImportJob } from '../jobs/apply-import.job';
import { EXPIRE_IMPORTS_JOB, ExpireImportsJob } from '../jobs/expire-imports.job';
import { VALIDATE_IMPORT_EVENT, ValidateImportJob } from '../jobs/validate-import.job';

function processor() {
  const validate = { run: vi.fn(() => Promise.resolve('preview_ready' as const)) };
  const apply = { run: vi.fn(() => Promise.resolve('done' as const)) };
  const expire = { run: vi.fn(() => Promise.resolve({ status: 'done' as const, processed: 0 })) };
  const settings = { get: vi.fn(() => Promise.resolve(2)) };
  const log = { info: vi.fn(), warn: vi.fn() };
  return {
    validate,
    apply,
    expire,
    log,
    processor: new ImportsProcessor(validate, apply, expire, settings as never, log),
  };
}

describe('F3.5c imports kuyruğu', () => {
  it('F3.5c-WORKER olaylar imports kuyruğunda, yükte yalnız jobId', () => {
    for (const type of [VALIDATE_IMPORT_EVENT, APPLY_IMPORT_EVENT] as const) {
      expect(OUTBOX_EVENTS[type]).toEqual({ queue: 'imports', fields: { jobId: 'id' } });
    }
  });

  it('F3.5c-WORKER process iş adına göre yönlendirir; kiracı businessIds[0]; bilinmeyen iş atlanır', async () => {
    const { processor: p, validate, apply, expire, log } = processor();
    const businessId = randomUUID();
    const jobId = randomUUID();
    const data = { businessIds: [businessId], payload: { jobId } };
    await p.process({ name: VALIDATE_IMPORT_EVENT, data });
    expect(validate.run).toHaveBeenCalledWith({ businessId, jobId });
    await p.process({ name: APPLY_IMPORT_EVENT, data });
    expect(apply.run).toHaveBeenCalledWith({ businessId, jobId }, log);
    await p.process({ name: EXPIRE_IMPORTS_JOB, data: {} });
    expect(expire.run).toHaveBeenCalledOnce();
    await p.process({ name: 'başka', data: {} });
    expect(log.warn).toHaveBeenCalledWith(
      { event: 'imports.unknown_job', jobName: 'başka' },
      expect.any(String),
    );
    // Geçersiz yük reddedilir (iş yeniden denenir).
    await expect(
      p.process({ name: APPLY_IMPORT_EVENT, data: { businessIds: ['x'], payload: {} } }),
    ).rejects.toThrow();
  });

  it('F3.5c-WORKER worker modül grafiği derlenir; içe aktarma sağlayıcıları çözülür', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [WorkerModule.register(TEST_WORKER_ENV)],
    }).compile();
    try {
      for (const token of [ImportsProcessor, ValidateImportJob, ApplyImportJob, ExpireImportsJob]) {
        expect(moduleRef.get(token, { strict: false })).toBeInstanceOf(token);
      }
    } finally {
      await moduleRef.close();
    }
  });
});
