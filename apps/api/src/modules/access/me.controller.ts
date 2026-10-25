import { Controller, Get, Headers, Inject } from '@nestjs/common';
import { Authenticated } from '../../core/auth/access-decorators';
import { CurrentSession, type SessionAuth } from '../identity';
import { type FullMeView, MeService } from './me.service';

/**
 * openapi `GET /api/v1/me` (F1.5b temel, F1.8b üyelik ve izinler). `X-Business-Id` isteğe bağlı
 * (BusinessIdOptional): verilirse `activeBusiness` döner. Bağımlılık yönü (access → identity)
 * nedeniyle identity'den buraya taşındı.
 */
@Controller('api/v1/me')
export class MeController {
  constructor(@Inject(MeService) private readonly service: MeService) {}

  @Get()
  @Authenticated()
  async me(
    @CurrentSession() auth: SessionAuth,
    @Headers('x-business-id') businessId: string | undefined,
  ): Promise<FullMeView> {
    return await this.service.me(auth, businessId);
  }
}
