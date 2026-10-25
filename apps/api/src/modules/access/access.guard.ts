// Global erişim guard'ı (F1.8b, APP_GUARD). Sıra: işaret → kimlik (JWT) → platform rolü veya
// kiracı bağlamı + yetenek + izin (ADR-0004). Varsayılan reddet (Mimar): işareti olmayan uç,
// geçerli anahtarla bile 403 PERMISSION_DENIED döner. Kaynak sahipliği servislerde (RLS → 404).
import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type PlatformRole } from '@b2b/shared';
import { ACCESS_METADATA, type AccessRule } from '../../core/auth/access-decorators';
import { DomainError } from '../../core/errors/domain-error';
import type { RequestUser } from '../../core/request-user';
import { attachTenant } from '../../core/tenant-context';
import { TokenService } from '../identity';
import { TenantContextService } from './tenant-context.service';

/** Aktif platform rolü (identity TotpRepository uyar). */
export interface PlatformRolePort {
  platformRole(userId: string): Promise<PlatformRole | undefined>;
}
export const PLATFORM_ROLE = Symbol('PLATFORM_ROLE');

interface GuardRequest {
  readonly headers: Record<string, string | string[] | undefined>;
  user?: RequestUser;
}

const BEARER = /^Bearer ([A-Za-z0-9._~+/=-]+)$/;

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(TokenService) private readonly tokens: Pick<TokenService, 'verifyAccess'>,
    @Inject(TenantContextService) private readonly tenants: TenantContextService,
    @Inject(PLATFORM_ROLE) private readonly platform: PlatformRolePort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const rule = this.reflector.getAllAndOverride<AccessRule | undefined>(ACCESS_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (rule?.kind === 'public') return true;

    const request = context.switchToHttp().getRequest<GuardRequest>();
    const userId = await this.authenticate(request);

    switch (rule?.kind) {
      case 'authenticated':
        return true;
      case 'platform': {
        const role = await this.platform.platformRole(userId);
        if (role === undefined || !rule.roles.includes(role)) {
          throw new DomainError('PERMISSION_DENIED');
        }
        return true;
      }
      case 'permission': {
        const { tenant } = await this.tenants.resolve(
          userId,
          request.headers['x-business-id'],
          rule.code,
        );
        attachTenant(request, tenant);
        return true;
      }
      default:
        // İşaretsiz uç: varsayılan reddet.
        throw new DomainError('PERMISSION_DENIED');
    }
  }

  /** `Authorization: Bearer <JWT>`; yalnızca erişim anahtarı. Başarısızlık 401. */
  private async authenticate(request: GuardRequest): Promise<string> {
    const header = request.headers.authorization;
    const match = typeof header === 'string' ? BEARER.exec(header) : null;
    const token = match?.[1];
    if (token === undefined) throw new DomainError('UNAUTHENTICATED');
    const claims = await this.tokens.verifyAccess(token);
    request.user = { id: claims.userId, sessionId: claims.sessionId };
    return claims.userId;
  }
}
