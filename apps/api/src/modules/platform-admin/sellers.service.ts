// Admin toptancı açılışı ve aktivasyon daveti (F2.1a, US-009). Platform bağlamı (`withPlatformTx`)
// yalnızca bu modülde açılır (c4 §3.7). Açılış tek işlemdedir (R15): işletme, `seller` yeteneği,
// satıcı profili, hizmet bölgeleri, abonelik, admin rolü, yetkili kullanıcı, davet ve audit.
// Diğer modüller `tx` alan fonksiyonlarla yazar. SMS işlem commit'inden sonra gönderilir (K3);
// gönderilemezse işletme kalır, yanıt `activationSmsSent: false`.
import { Inject, Injectable } from '@nestjs/common';
import { legalTypeOfVoen } from '@b2b/shared';
import { AuditService, type AuditRecorder, type AuditRequestContext } from '../../core/audit';
import { Clock } from '../../core/clock';
import { LINE_TOTAL_SCALE, toDecimalString } from '../../core/money';
import { type Tx, withPlatformTx } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import { IdGenerator } from '../../core/id-generator';
import {
  type ActivationStatus,
  activationLink,
  InvitationService,
  RoleService,
  WEB_BASE_URL,
} from '../access';
import { type Plan, PlanService } from '../billing';
import {
  BusinessesRepository,
  isVoenUniqueViolation,
  SellerApplicationsRepository,
} from '../businesses';
import { I18nService, ReferenceLookup } from '../i18n';
import { SettingsService } from '../settings';

const SELLER_ADMIN_TEMPLATE = 'seller_business_admin';
const SMS_TEMPLATE_KEY = 'sms.seller_activation_body';
const SMS_TEMPLATE_FALLBACK = 'B2B: {link}';
const DAY_MS = 24 * 60 * 60 * 1000;

export interface PlatformActor {
  readonly userId: string;
}

export interface CreateSellerInput {
  readonly legalName: string;
  readonly voen: string;
  readonly regionId: string;
  readonly addressLine?: string | undefined;
  readonly ownerPhone: string;
  readonly ownerName: string;
  readonly planId: string;
  readonly serviceAreaRegionIds: readonly string[];
  readonly currency: string;
  readonly timezone: string;
  /** Başvurudan açma (F2.2): başvuru aynı işlemde `approved` olur. */
  readonly applicationId?: string | undefined;
}

export interface ActivationResult {
  readonly invitationExpiresAt: string;
  readonly activationSmsSent: boolean;
}

export interface CreateSellerResult extends ActivationResult {
  readonly businessId: string;
}

export interface SellerView {
  readonly id: string;
  readonly legalName: string;
  readonly voen: string | null;
  readonly regionId: string;
  readonly status: string;
  readonly createdAt: string;
  readonly activation: ActivationStatus;
}

export interface PlanView {
  readonly id: string;
  readonly code: string;
  readonly name: Plan['name'];
  readonly capability: Plan['capability'];
  readonly price: string;
  readonly currencyCode: string;
  readonly period: Plan['period'];
  readonly isActive: boolean;
}

interface PendingSms {
  readonly phoneE164: string;
  readonly token: string;
  readonly language: string | null;
  readonly expiresAt: Date;
}

function invalid(field: string, reason: string): DomainError {
  return new DomainError('VALIDATION_FAILED', { [field]: [reason] });
}

@Injectable()
export class SellersService {
  constructor(
    @Inject(BusinessesRepository) private readonly businesses: BusinessesRepository,
    @Inject(SellerApplicationsRepository)
    private readonly applications: SellerApplicationsRepository,
    @Inject(PlanService) private readonly plans: PlanService,
    @Inject(RoleService) private readonly roles: RoleService,
    @Inject(InvitationService) private readonly invitations: InvitationService,
    @Inject(ReferenceLookup) private readonly references: ReferenceLookup,
    @Inject(I18nService) private readonly texts: I18nService,
    @Inject(SettingsService) private readonly settings: SettingsService,
    @Inject(AuditService) private readonly audit: AuditRecorder,
    @Inject(IdGenerator) private readonly ids: IdGenerator,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(WEB_BASE_URL) private readonly webBaseUrl: string,
  ) {}

  /** US-009 AC1, AC4; F2.1a-AC1, AC4, AC5, AC9, AC10; başvurudan açma F2.2. */
  async create(
    actor: PlatformActor,
    input: CreateSellerInput,
    context: AuditRequestContext,
  ): Promise<CreateSellerResult> {
    const phoneE164 = this.invitations.normalizePhone(input.ownerPhone);
    if (phoneE164 === undefined) throw invalid('ownerPhone', 'invalid_phone');
    const legalType = legalTypeOfVoen(input.voen);
    if (legalType === undefined) throw invalid('voen', 'VOEN_INVALID');
    const ttlDays = await this.settings.get('invitation.seller_activation_days');
    const now = this.clock.now();
    const businessId = this.ids.next();
    const serviceAreas = [...new Set(input.serviceAreaRegionIds)];

    let pending: PendingSms;
    try {
      pending = await withPlatformTx(actor, async (tx) => {
        // F2.2: başvuru kilitlenir; yoksa 404, `pending` değilse 409 (state-machines §12).
        const application =
          input.applicationId === undefined
            ? undefined
            : await this.applications.lockTx(tx, input.applicationId);
        if (input.applicationId !== undefined && application === undefined) {
          throw new DomainError('NOT_FOUND');
        }
        if (application !== undefined && application.status !== 'pending') {
          throw new DomainError('INVALID_STATE_TRANSITION');
        }
        const plan = await this.plans.findPlanTx(tx, input.planId);
        if (plan === undefined || !plan.isActive || plan.capability !== 'seller') {
          throw invalid('planId', 'invalid_plan');
        }
        const known = await this.references.existingRegionIds(tx, [
          input.regionId,
          ...serviceAreas,
        ]);
        if (!known.has(input.regionId)) throw invalid('regionId', 'not_found');
        if (serviceAreas.some((id) => !known.has(id))) {
          throw invalid('serviceAreaRegionIds', 'not_found');
        }
        if (!(await this.references.isActiveCurrency(tx, input.currency))) {
          throw invalid('currency', 'inactive_currency');
        }
        // S7 = A: VÖEN herhangi bir işletmede (toptancı veya perakendeci) kayıtlıysa reddedilir.
        if (await this.businesses.voenTakenTx(tx, input.voen)) {
          throw new DomainError('VOEN_ALREADY_REGISTERED');
        }
        const language = (await this.references.defaultLanguage(tx)) ?? null;

        await this.businesses.insertSellerTx(tx, {
          id: businessId,
          legalName: input.legalName,
          voen: input.voen,
          legalType,
          regionId: input.regionId,
          addressLine: input.addressLine ?? null,
          defaultLanguage: language,
          currencyCode: input.currency,
          timezone: input.timezone,
          serviceAreaRegionIds: serviceAreas,
          approvedBy: actor.userId,
          now,
        });
        await this.plans.startFirstSubscriptionTx(tx, {
          businessId,
          plan,
          timeZone: input.timezone,
          now,
        });
        const role = await this.roles.createFromTemplateCodeTx(
          tx,
          businessId,
          SELLER_ADMIN_TEMPLATE,
        );
        const owner = await this.invitations.ensureInviteeTx(tx, phoneE164, input.ownerName);
        const invitation = await this.invitations.createTx(tx, {
          businessId,
          phoneE164,
          roleId: role.roleId,
          jobTitleId: role.jobTitleId,
          createdBy: actor.userId,
          expiresAt: new Date(now.getTime() + ttlDays * DAY_MS),
          now,
        });
        // 🔒 alanlar (phoneE164, fullName) AuditService'te maskelenir; token yazılmaz.
        await this.audit.record(tx, {
          actor: { type: 'platform', userId: actor.userId },
          businessId,
          action: 'seller.created',
          targetType: 'business',
          targetId: businessId,
          after: {
            legalName: input.legalName,
            voen: input.voen,
            regionId: input.regionId,
            planId: plan.id,
            serviceAreaRegionIds: serviceAreas,
            currency: input.currency,
            timezone: input.timezone,
            owner: {
              userId: owner.id,
              created: owner.created,
              phoneE164,
              fullName: input.ownerName,
            },
            invitationId: invitation.invitationId,
            invitationExpiresAt: invitation.expiresAt.toISOString(),
            ...(application === undefined ? {} : { applicationId: application.id }),
          },
          context,
        });
        if (application !== undefined) {
          await this.applications.reviewTx(
            tx,
            application,
            { to: 'approved', businessId },
            actor.userId,
            now,
          );
          await this.audit.record(tx, {
            actor: { type: 'platform', userId: actor.userId },
            businessId,
            action: 'seller_application.approved',
            targetType: 'seller_application',
            targetId: application.id,
            before: { status: application.status },
            after: { status: 'approved', businessId },
            context,
          });
        }
        return { phoneE164, token: invitation.token, language, expiresAt: invitation.expiresAt };
      });
    } catch (error) {
      // Eşzamanlı aynı VÖEN: ön kontrolü iki istek birlikte geçerse benzersiz indeks yakalar (K4).
      if (isVoenUniqueViolation(error)) throw new DomainError('VOEN_ALREADY_REGISTERED');
      throw error;
    }

    const activationSmsSent = await this.sendActivationSms(pending, ttlDays);
    return {
      businessId,
      invitationExpiresAt: pending.expiresAt.toISOString(),
      activationSmsSent,
    };
  }

  /**
   * Yeni aktivasyon daveti (US-009 AC3): açık admin davetleri kapatılır, yenisi aynı yetkiliye
   * gider. Aktif admin üyelik varsa `409 INVALID_STATE_TRANSITION`; toptancı yoksa `404`.
   */
  async resendActivation(
    actor: PlatformActor,
    businessId: string,
    context: AuditRequestContext,
  ): Promise<ActivationResult> {
    const ttlDays = await this.settings.get('invitation.seller_activation_days');
    const now = this.clock.now();
    const pending = await withPlatformTx(actor, async (tx) => {
      const seller = await this.businesses.findSellerTx(tx, businessId);
      if (seller === undefined) throw new DomainError('NOT_FOUND');
      if (await this.invitations.hasActiveAdminTx(tx, businessId)) {
        throw new DomainError('INVALID_STATE_TRANSITION');
      }
      const target = await this.invitations.adminInvitationTargetTx(tx, businessId);
      if (target === undefined) throw new DomainError('NOT_FOUND');
      await this.invitations.expireOpenAdminInvitationsTx(tx, businessId, now);
      const invitation = await this.invitations.createTx(tx, {
        businessId,
        phoneE164: target.phoneE164,
        roleId: target.roleId,
        jobTitleId: target.jobTitleId,
        createdBy: actor.userId,
        expiresAt: new Date(now.getTime() + ttlDays * DAY_MS),
        now,
      });
      await this.audit.record(tx, {
        actor: { type: 'platform', userId: actor.userId },
        businessId,
        action: 'seller.activation_resent',
        targetType: 'business',
        targetId: businessId,
        after: {
          invitationId: invitation.invitationId,
          invitationExpiresAt: invitation.expiresAt.toISOString(),
        },
        context,
      });
      return {
        phoneE164: target.phoneE164,
        token: invitation.token,
        language: seller.defaultLanguage,
        expiresAt: invitation.expiresAt,
      };
    });
    const activationSmsSent = await this.sendActivationSms(pending, ttlDays);
    return { invitationExpiresAt: pending.expiresAt.toISOString(), activationSmsSent };
  }

  async list(
    actor: PlatformActor,
    cursor: string | undefined,
    limit: number,
  ): Promise<{ items: SellerView[]; nextCursor: string | null }> {
    const now = this.clock.now();
    return await withPlatformTx(actor, async (tx) => {
      // Bir fazla okunur: sonraki sayfa var mı.
      const rows = await this.businesses.listSellersTx(tx, cursor, limit + 1);
      const page = rows.slice(0, limit);
      const statuses = await this.invitations.activationStatusesTx(
        tx,
        page.map((row) => row.id),
        now,
      );
      const last = page[page.length - 1];
      return {
        items: page.map((row) => ({
          id: row.id,
          legalName: row.legalName,
          voen: row.voen,
          regionId: row.regionId,
          status: row.status,
          createdAt: row.createdAt.toISOString(),
          activation: statuses.get(row.id) ?? 'expired',
        })),
        nextCursor: rows.length > limit && last !== undefined ? last.id : null,
      };
    });
  }

  async listPlans(actor: PlatformActor): Promise<PlanView[]> {
    const plans = await withPlatformTx(actor, (tx: Tx) => this.plans.listPlansTx(tx));
    return plans.map((plan) => ({
      id: plan.id,
      code: plan.code,
      name: plan.name,
      capability: plan.capability,
      price: toDecimalString(plan.price, LINE_TOTAL_SCALE),
      currencyCode: plan.currencyCode,
      period: plan.period,
      isActive: plan.isActive,
    }));
  }

  private async sendActivationSms(pending: PendingSms, ttlDays: number): Promise<boolean> {
    const language = pending.language ?? 'az';
    const template = (await this.texts.text(SMS_TEMPLATE_KEY, language)) ?? SMS_TEMPLATE_FALLBACK;
    const body = template
      .replaceAll('{link}', activationLink(this.webBaseUrl, language, pending.token))
      .replaceAll('{days}', String(ttlDays));
    return await this.invitations.sendSms(pending.phoneE164, body);
  }
}
