import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { AccessTokenGuard, CurrentSession } from './access-token.guard';
import { type MeView, type SessionAuth, SessionService } from './session.service';

/** openapi `GET /api/v1/me` (temel, F1.5b). F1.8b üyelik ve izinlerle genişletir (kırıcı değil). */
@Controller('api/v1/me')
export class MeController {
  constructor(@Inject(SessionService) private readonly sessions: SessionService) {}

  @Get()
  @UseGuards(AccessTokenGuard)
  async me(@CurrentSession() auth: SessionAuth): Promise<MeView> {
    return await this.sessions.me(auth);
  }
}
