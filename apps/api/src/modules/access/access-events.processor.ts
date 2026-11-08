// `access` kuyruğunun tüketicisi (worker, F1.8b). `membership.role_changed` (F1.8a outbox olayı) ve
// `role.permissions_changed` (F2.8, R22) geldiğinde üyeliğin izin önbelleği silinir. API de commit
// sonrası siler; bu iş yedektir (Redis geçici kapalıysa veya rol başka yoldan değiştiyse). Önbellek
// ayrıca rol kimliği + rolün izin sürümüyle doğrulanır.
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Job } from 'bullmq';
import { z } from 'zod';
import { PermissionCache } from './permission.cache';

const eventSchema = z.object({
  type: z.enum(['membership.role_changed', 'role.permissions_changed']),
  payload: z.object({ membershipId: z.uuid() }),
});

const HANDLED: ReadonlySet<string> = new Set([
  'membership.role_changed',
  'role.permissions_changed',
]);

@Processor('access')
export class AccessEventsProcessor extends WorkerHost {
  constructor(
    @Inject(PermissionCache) private readonly cache: Pick<PermissionCache, 'invalidate'>,
  ) {
    super();
  }

  async process(job: Pick<Job, 'name' | 'data'>): Promise<void> {
    if (!HANDLED.has(job.name)) return;
    const event = eventSchema.parse(job.data);
    await this.cache.invalidate(event.payload.membershipId);
  }
}
