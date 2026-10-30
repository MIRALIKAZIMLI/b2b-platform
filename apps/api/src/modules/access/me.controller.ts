import { Body, Controller, Get, Headers, Inject, Patch } from '@nestjs/common';
import { z } from 'zod';
import { Authenticated } from '../../core/auth/access-decorators';
import { CurrentSession, type SessionAuth, SessionService } from '../identity';
import { type FullMeView, MeService } from './me.service';

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}

/** openapi `PATCH /api/v1/me` gövdesi; boş gövde geçerlidir (değişiklik yok). */
const patchBodySchema = z.strictObject({
  fullName: z.string().trim().min(1).max(120).optional(),
  preferredLanguage: z.enum(['az', 'ru', 'tr', 'en']).optional(),
  timezone: z.string().max(64).refine(isTimeZone).optional(),
});

/**
 * openapi `GET /api/v1/me` (F1.5b temel, F1.8b üyelik ve izinler). `X-Business-Id` isteğe bağlı
 * (BusinessIdOptional): verilirse `activeBusiness` döner. Bağımlılık yönü (access → identity)
 * nedeniyle identity'den buraya taşındı.
 */
@Controller('api/v1/me')
export class MeController {
  constructor(
    @Inject(MeService) private readonly service: MeService,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  @Get()
  @Authenticated()
  async me(
    @CurrentSession() auth: SessionAuth,
    @Headers('x-business-id') businessId: string | undefined,
  ): Promise<FullMeView> {
    return await this.service.me(auth, businessId);
  }

  /** Ad, dil, saat dilimi (US-058 AC1: dil profilde saklanır; F1.13a). Pasif dil → 422. */
  @Patch()
  @Authenticated()
  async update(@CurrentSession() auth: SessionAuth, @Body() body: unknown): Promise<void> {
    const input = patchBodySchema.parse(body ?? {});
    await this.sessions.updateProfile(auth, {
      ...(input.fullName === undefined ? {} : { fullName: input.fullName }),
      ...(input.preferredLanguage === undefined
        ? {}
        : { preferredLanguage: input.preferredLanguage }),
      ...(input.timezone === undefined ? {} : { timezone: input.timezone }),
    });
  }
}
