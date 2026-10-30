// openapi `/api/v1/push-tokens`, `/api/v1/notifications*` (US-054, F1.11). Kullanıcıya bağlı uçlar:
// `/me` ile aynı koruma (`@Authenticated()`: oturum zorunlu, işletme bağlamı yok); veri
// kullanıcı bağlamında (withUserTx) okunur ve yazılır.
import { Body, Controller, Get, HttpCode, Inject, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { Authenticated } from '../../core/auth/access-decorators';
import { CurrentSession, type SessionAuth } from '../identity';
import { PUSH_PLATFORMS } from './notifications.schema';
import { type NotificationPage, NotificationsService } from './notifications.service';

const pushTokenBodySchema = z.strictObject({
  token: z
    .string()
    .max(255)
    .regex(/^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/),
  platform: z.enum(PUSH_PLATFORMS),
});

const listQuerySchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const readBodySchema = z
  .strictObject({
    ids: z.array(z.uuid()).max(100).optional(),
    all: z.boolean().optional(),
  })
  .refine((body) => body.all === true || body.ids !== undefined, {
    message: 'ids veya all: true gerekli',
  });

const preferencesBodySchema = z
  .record(z.string().max(64), z.boolean())
  .refine((body) => Object.keys(body).length <= 50, { message: 'en fazla 50 tür' });

@Controller('api/v1')
export class NotificationsController {
  constructor(@Inject(NotificationsService) private readonly service: NotificationsService) {}

  @Post('push-tokens')
  @Authenticated()
  @HttpCode(204)
  async registerPushToken(
    @CurrentSession() auth: SessionAuth,
    @Body() body: unknown,
  ): Promise<void> {
    const input = pushTokenBodySchema.parse(body);
    await this.service.registerToken(auth.userId, input.token, input.platform);
  }

  @Get('notifications')
  @Authenticated()
  async list(
    @CurrentSession() auth: SessionAuth,
    @Query() query: unknown,
  ): Promise<NotificationPage> {
    const input = listQuerySchema.parse(query);
    return await this.service.list(auth.userId, input.cursor, input.limit);
  }

  @Post('notifications/read')
  @Authenticated()
  @HttpCode(204)
  async markRead(@CurrentSession() auth: SessionAuth, @Body() body: unknown): Promise<void> {
    const input = readBodySchema.parse(body);
    await this.service.markRead(
      auth.userId,
      input.all === true ? { all: true } : { ids: input.ids ?? [] },
    );
  }

  @Put('notifications/preferences')
  @Authenticated()
  @HttpCode(200)
  async preferences(
    @CurrentSession() auth: SessionAuth,
    @Body() body: unknown,
  ): Promise<Record<string, boolean>> {
    return await this.service.setPreferences(auth.userId, preferencesBodySchema.parse(body));
  }
}
