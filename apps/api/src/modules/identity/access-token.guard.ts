// Kimlik guard'ı (F1.5b): `Authorization: Bearer <JWT>` doğrulanır ve `request.user` doldurulur.
// Yalnızca erişim anahtarı (`typ = access`) kabul edilir; kayıt anahtarı (pendingToken) reddedilir.
// Veritabanına bakmaz (Mimar kararı 7). Yetki (üyelik, izin) guard'ı F1.8b'de; global guard ve
// @Public() F1.8'de. Başarısızlık: 401 UNAUTHENTICATED.
import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { DomainError } from '../../core/errors/domain-error';
import type { RequestUser } from '../../core/request-user';
import type { SessionAuth } from './session.service';
import { TokenService } from './token.service';

interface AuthRequest {
  readonly headers: Record<string, string | string[] | undefined>;
  user?: RequestUser;
}

const BEARER = /^Bearer ([A-Za-z0-9._~+/=-]+)$/;

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(@Inject(TokenService) private readonly tokens: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const header = request.headers.authorization;
    const match = typeof header === 'string' ? BEARER.exec(header) : null;
    const token = match?.[1];
    if (token === undefined) throw new DomainError('UNAUTHENTICATED');
    const claims = await this.tokens.verifyAccess(token);
    request.user = { id: claims.userId, sessionId: claims.sessionId };
    return true;
  }
}

/** AccessTokenGuard'ın doldurduğu kimlik (guard'sız uçta kullanılmaz). */
export const CurrentSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionAuth => {
    const user = context.switchToHttp().getRequest<AuthRequest>().user;
    if (user?.sessionId === undefined) throw new DomainError('UNAUTHENTICATED');
    return { userId: user.id, sessionId: user.sessionId };
  },
);
