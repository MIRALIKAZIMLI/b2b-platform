// `GET /api/v1/me` (F1.8b; temel profil F1.5b). Kırıcı değil: yeni alanlar eklenir.
// - memberships: list_my_memberships() + her üyelik için kendi işletme bağlamında ad ve rol adı.
//   Askıdaki işletme listede `businessStatus` ile görünür; bağlamı ise kurulamaz (Müfettiş #23 notu 2).
// - activeBusiness: `X-Business-Id` verilirse TenantContext'ten (üye değilse 403).
// - twoFactorRecommended: aktif bir admin üyeliği var ve TOTP kurulu değil (US-002 AC3).
import { Inject, Injectable } from '@nestjs/common';
import { isLanguageCode, localizedTextSchema, pickLocalizedText } from '@b2b/shared';
import type { MeView, SessionAuth } from '../identity';
import { SessionService } from '../identity';
import { MembershipService } from './membership.service';
import { TenantContextRepository } from './tenant-context.repository';
import { TenantContextService } from './tenant-context.service';

export interface MembershipSummaryView {
  readonly membershipId: string;
  readonly businessId: string;
  readonly businessName: string;
  readonly businessStatus: string;
  readonly capability: 'seller' | 'buyer';
  readonly roleName: string;
}

export interface ActiveBusinessView {
  readonly id: string;
  readonly capability: 'seller' | 'buyer' | null;
  readonly timezone: string;
  readonly currency: string | null;
  readonly permissions: readonly { readonly code: string; readonly scope: string }[];
}

export interface FullMeView extends Omit<MeView, 'memberships'> {
  readonly twoFactorRecommended: boolean;
  readonly memberships: readonly MembershipSummaryView[];
  readonly activeBusiness?: ActiveBusinessView;
}

function roleName(raw: unknown, language: string | null): string {
  const parsed = localizedTextSchema.safeParse(raw);
  if (!parsed.success) return '';
  return pickLocalizedText(parsed.data, isLanguageCode(language) ? language : 'az') ?? '';
}

@Injectable()
export class MeService {
  constructor(
    @Inject(SessionService) private readonly sessions: Pick<SessionService, 'me'>,
    @Inject(MembershipService) private readonly memberships: Pick<MembershipService, 'listMine'>,
    @Inject(TenantContextRepository) private readonly repository: TenantContextRepository,
    @Inject(TenantContextService) private readonly tenants: TenantContextService,
  ) {}

  async me(auth: SessionAuth, rawBusinessId: unknown): Promise<FullMeView> {
    const base = await this.sessions.me(auth);
    const mine = await this.memberships.listMine(auth.userId);
    const summaries: MembershipSummaryView[] = [];
    let hasAdmin = false;
    for (const item of mine) {
      const ctx = { businessId: item.businessId, userId: auth.userId };
      const summary = await this.repository.membershipSummary(ctx, item.membershipId);
      if (summary === undefined) continue;
      summaries.push({
        membershipId: item.membershipId,
        businessId: item.businessId,
        businessName: summary.businessName,
        businessStatus: summary.businessStatus,
        capability: summary.roleCapability,
        roleName: roleName(summary.roleName, base.preferredLanguage),
      });
      if (!hasAdmin) {
        const access = await this.repository.findActiveMembership(ctx);
        hasAdmin = access?.isBusinessAdmin === true;
      }
    }
    const view: FullMeView = {
      ...base,
      twoFactorRecommended: hasAdmin && !base.totpEnabled,
      memberships: summaries,
    };
    if (rawBusinessId === undefined) return view;
    const { tenant, membership } = await this.tenants.resolve(auth.userId, rawBusinessId);
    return {
      ...view,
      activeBusiness: {
        id: tenant.businessId,
        // Yetenek onaylı değilse null (openapi: string | null; Müfettiş PR #24 M1).
        capability: tenant.capabilities[0] ?? null,
        timezone: membership.businessTimezone,
        currency: membership.businessCurrency,
        permissions: [...tenant.permissions].map(([code, scope]) => ({ code, scope })),
      },
    };
  }
}
