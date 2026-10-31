import { Body, Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { type AuditHttpRequest, requestAuditContext } from '../../core/audit';
import { Authenticated } from '../../core/auth/access-decorators';
import { CurrentSession, type SessionAuth } from '../identity';
import { InvitationService } from './invitation.service';

const acceptBodySchema = z.strictObject({ token: z.string().min(1).max(256) });

/**
 * openapi `POST /api/v1/team/invitations/accept` (F2.1a; F2.7 ekip daveti de kullanır).
 * Yalnızca giriş ister: kabul eden henüz işletmenin üyesi değildir (R17). Her başarısız durum
 * aynı 404 (R16). Token istek gövdesinde; gövde loglanmaz.
 */
@Controller('api/v1/team/invitations')
export class InvitationsController {
  constructor(@Inject(InvitationService) private readonly invitations: InvitationService) {}

  @Post('accept')
  @HttpCode(200)
  @Authenticated()
  async accept(
    @CurrentSession() auth: SessionAuth,
    @Body() body: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<{ businessId: string }> {
    const input = acceptBodySchema.parse(body);
    return await this.invitations.accept(auth.userId, input.token, requestAuditContext(req));
  }
}
