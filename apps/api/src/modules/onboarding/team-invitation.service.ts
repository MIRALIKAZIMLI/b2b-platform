// Ekip daveti (F2.7a, US-013 AC1–AC2). Düzenleyici: access (rol, kapsam, davet, kullanıcı satırı),
// billing (`users.max`), businesses (işletme kilidi, dil), i18n (SMS metni). c4 §1'de bu dört
// modüle birden bağlanabilen modül `onboarding`; access billing'i içe aktaramaz.
// Tek kiracı işlemi: işletme satırı kilitlenir (eşzamanlı iki davet sırayla sayılır), aynı
// telefona açık davet kapanır (VARSAYIM K3), sonra `users.max` = aktif üye + açık davet
// denetlenir (VARSAYIM K2). SMS commit'ten sonra; gönderilemezse davet kalır (`smsSent: false`).
// Ham token yalnız SMS gövdesinde; log, audit ve yanıtta yok (R16).
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { type AuditRecorder, type AuditRequestContext, AuditService } from '../../core/audit';
import { Clock } from '../../core/clock';
import { withTenantTx } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import { IdGenerator } from '../../core/id-generator';
import type { TenantContext } from '../../core/tenant-context';
import { activationLink, InvitationService, TeamService, WEB_BASE_URL } from '../access';
import { EntitlementService, EntitlementUsageRegistry } from '../billing';
import { BusinessesRepository } from '../businesses';
import { I18nService } from '../i18n';
import { SettingsService } from '../settings';

const SMS_TEMPLATE_KEY = 'sms.team_invitation_body';
const SMS_TEMPLATE_FALLBACK = 'B2B: {link}';

export interface TeamInvitationInput {
  readonly phone: string;
  readonly fullName: string;
  readonly jobTitleId: string;
  readonly roleId: string;
  readonly branchId?: string | undefined;
  readonly warehouseId?: string | undefined;
}

export interface TeamInvitationResult {
  readonly invitationId: string;
  readonly expiresAt: string;
  readonly smsSent: boolean;
}

@Injectable()
export class TeamInvitationService implements OnModuleInit {
  constructor(
    @Inject(TeamService) private readonly team: TeamService,
    @Inject(InvitationService) private readonly invitations: InvitationService,
    @Inject(EntitlementService) private readonly entitlements: EntitlementService,
    @Inject(EntitlementUsageRegistry) private readonly usage: EntitlementUsageRegistry,
    @Inject(BusinessesRepository) private readonly businesses: BusinessesRepository,
    @Inject(I18nService) private readonly texts: I18nService,
    @Inject(SettingsService) private readonly settings: SettingsService,
    @Inject(AuditService) private readonly audit: AuditRecorder,
    @Inject(IdGenerator) private readonly ids: IdGenerator,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(WEB_BASE_URL) private readonly webBaseUrl: string,
  ) {}

  /** `users.max` sayacı (US-013 AC2; F1.4b "sayaç kendi adımında"). */
  onModuleInit(): void {
    this.usage.register('users.max', ({ businessId, tx }) =>
      this.team.countSeatsTx(tx, businessId),
    );
  }

  async invite(
    tenant: TenantContext,
    input: TeamInvitationInput,
    context: AuditRequestContext,
  ): Promise<TeamInvitationResult> {
    const phoneE164 = this.invitations.normalizePhone(input.phone);
    if (phoneE164 === undefined) {
      throw new DomainError('VALIDATION_FAILED', { phone: ['invalid'] });
    }
    // İşlemden önce: işlem içinde ikinci bağlantı açan çağrılar test havuzunda kilitlenir (F2.3a).
    const ttlDays = await this.settings.get('invitation.team_days', tenant.businessId);
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);

    const created = await withTenantTx(tenant, async (tx) => {
      const business = await this.businesses.lockOwnTx(tx, tenant.businessId);
      if (business === undefined) throw new DomainError('NOT_FOUND');
      const scope = await this.team.validateInvitationTargetTx(tx, tenant, input);
      if (await this.team.isActiveMemberPhoneTx(tx, tenant.businessId, phoneE164)) {
        throw new DomainError('MEMBER_ALREADY_EXISTS');
      }
      await this.team.expireOpenInvitationsForPhoneTx(tx, tenant.businessId, phoneE164, now);
      await this.entitlements.check('users.max', tenant.businessId, 1, tx);
      await this.team.ensureInvitedUserTx(tx, {
        id: this.ids.next(),
        phoneE164,
        fullName: input.fullName,
        now,
      });
      const invitation = await this.invitations.createTx(tx, {
        businessId: tenant.businessId,
        phoneE164,
        roleId: input.roleId,
        jobTitleId: input.jobTitleId,
        branchId: scope.branchId,
        warehouseId: scope.warehouseId,
        createdBy: tenant.userId,
        expiresAt,
        now,
      });
      await this.audit.record(tx, {
        actor: { type: 'user', userId: tenant.userId },
        businessId: tenant.businessId,
        action: 'invitation.created',
        targetType: 'invitation',
        targetId: invitation.invitationId,
        after: {
          roleId: input.roleId,
          jobTitleId: input.jobTitleId,
          branchId: scope.branchId,
          warehouseId: scope.warehouseId,
        },
        context,
      });
      return {
        ...invitation,
        language: business.defaultLanguage,
        businessName: business.legalName,
      };
    });

    const language = created.language ?? 'az';
    const template = (await this.texts.text(SMS_TEMPLATE_KEY, language)) ?? SMS_TEMPLATE_FALLBACK;
    const body = template
      .replaceAll('{link}', activationLink(this.webBaseUrl, language, created.token))
      .replaceAll('{business}', created.businessName)
      .replaceAll('{days}', String(ttlDays));
    const smsSent = await this.invitations.sendSms(phoneE164, body);
    return {
      invitationId: created.invitationId,
      expiresAt: created.expiresAt.toISOString(),
      smsSent,
    };
  }
}
