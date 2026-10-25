// `access` kuyruğunun tüketicisi (worker, F1.8b). `membership.role_changed` (F1.8a outbox olayı)
// geldiğinde üyeliğin izin önbelleği silinir. API de commit sonrası siler; bu iş yedektir (Redis
// geçici kapalıysa veya rol başka yoldan değiştiyse). Önbellek ayrıca rol kimliğiyle doğrulanır.
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Job } from 'bullmq';
import { z } from 'zod';
import { PermissionCache } from './permission.cache';

const roleChangedSchema = z.object({
  type: z.literal('membership.role_changed'),
  payload: z.object({ membershipId: z.uuid() }),
});

@Processor('access')
export class AccessEventsProcessor extends WorkerHost {
  constructor(
    @Inject(PermissionCache) private readonly cache: Pick<PermissionCache, 'invalidate'>,
  ) {
    super();
  }

  async process(job: Pick<Job, 'name' | 'data'>): Promise<void> {
    if (job.name !== 'membership.role_changed') return;
    const event = roleChangedSchema.parse(job.data);
    await this.cache.invalidate(event.payload.membershipId);
  }
}
