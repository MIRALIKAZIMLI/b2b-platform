// Oturum kimliği param dekoratörü. `request.user`'ı global AccessGuard doldurur (F1.8b; önceden
// AccessTokenGuard, F1.5b). Yalnızca `@Authenticated()` veya `@RequirePermission` uçlarında kullanılır.
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { DomainError } from '../../core/errors/domain-error';
import type { RequestUser } from '../../core/request-user';
import type { SessionAuth } from './session.service';

export const CurrentSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionAuth => {
    const user = context.switchToHttp().getRequest<{ user?: RequestUser }>().user;
    if (user?.sessionId === undefined) throw new DomainError('UNAUTHENTICATED');
    return { userId: user.id, sessionId: user.sessionId };
  },
);
