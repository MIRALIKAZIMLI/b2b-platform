import { Controller, Get, Inject, Query } from '@nestjs/common';
import { z } from 'zod';
import { Public } from '../../core/auth/access-decorators';
import { DevSmsOutboxRepository } from '../../infrastructure/sms';

/** openapi `/api/v1/dev/sms-outbox`: son 50 mesaj. */
const OUTBOX_LIMIT = 50;

const querySchema = z.strictObject({
  phone: z
    .string()
    .regex(/^\+[1-9][0-9]{7,14}$/)
    .optional(),
});

export interface DevSmsOutboxItem {
  readonly id: string;
  readonly phone: string;
  readonly body: string;
  readonly createdAt: string;
}

/**
 * Mock SMS kutusu (NFR-96, ADR-0021). Bu controller'ı taşıyan DevModule production'da hiç
 * kaydedilmez (app.module.ts); yol yoktur → 404.
 */
@Controller('api/v1/dev')
export class DevSmsOutboxController {
  constructor(@Inject(DevSmsOutboxRepository) private readonly outbox: DevSmsOutboxRepository) {}

  @Public()
  @Get('sms-outbox')
  async list(@Query() query: unknown): Promise<{ items: DevSmsOutboxItem[] }> {
    const { phone } = querySchema.parse(query);
    const messages = await this.outbox.list(phone, OUTBOX_LIMIT);
    return {
      items: messages.map((message) => ({
        id: message.id,
        phone: message.phone,
        body: message.body,
        createdAt: message.createdAt.toISOString(),
      })),
    };
  }
}
