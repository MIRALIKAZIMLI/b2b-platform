// Perakendeci self-servis kaydı (F2.3a, US-005, SF-02, NFR-63). Kimliksiz uç; telefon OTP ile
// doğrulanmış ve kayıt anahtarında (`pendingToken`) taşınır.
// - Tek kiracı işlemi (R15): withTenantTx({ businessId: yeni, userId: yeni }). Kullanıcı, işletme,
//   `buyer` yeteneği, profil, gizlilik, kişisel veri, varsayılan şube, admin rolü ve üyeliği,
//   `buyer_free` aboneliği, outbox ve audit birlikte yazılır ya da hiçbiri yazılmaz.
// - İdempotens (R12/R13): kapsam telefon. Yanıt aynı işlemde saklanır. Eşzamanlı ikinci istek
//   `users_phone_e164_uq` satırında ilkini bekler, sonra saklanan yanıtı alır.
// - Kayıt anahtarı tek kullanımlıktır: kayıttan sonra telefonun kullanıcısı vardır; aynı anahtarla
//   yeni istek `409 PHONE_ALREADY_REGISTERED` (aynı Idempotency-Key ile tekrar → saklanan yanıt,
//   oturumsuz). Oturum yalnızca ilk başarılı yanıtta açılır (K6).
import { Inject, Injectable } from '@nestjs/common';
import { type AuditRecorder, type AuditRequestContext, AuditService } from '../../core/audit';
import { Clock } from '../../core/clock';
import { type Tx, withTenantTx } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import { IdGenerator } from '../../core/id-generator';
import { IdempotencyRepository, type PhoneLookupResult, requestHash } from '../../core/idempotency';
import { OutboxWriter } from '../../core/outbox';
import { MembershipService, RoleService } from '../access';
import { PlanService } from '../billing';
import {
  BusinessesRepository,
  IpHourlyRateLimiter,
  profileCompleteness,
  SIGNUP_FILLED_FIELDS,
} from '../businesses';
import { I18nService, ReferenceLookup } from '../i18n';
import {
  type DeviceInput,
  IpKeyService,
  isPhoneTakenError,
  SessionService,
  TokenService,
  UserDirectory,
} from '../identity';
import { SettingsService } from '../settings';

export const BUYER_REGISTER_ENDPOINT = 'POST /api/v1/buyers/register';
const BUYER_ADMIN_TEMPLATE = 'buyer_business_admin';
const BRANCH_NAME_KEY = 'branch.default_name';
const CREATED = 201;
const MS_PER_HOUR = 60 * 60 * 1000;

export interface BuyerRegistrationBody {
  readonly fullName: string;
  readonly legalName: string;
  readonly activityTypeId: string;
  readonly regionId: string;
  readonly consentVersion: string;
  readonly preferredLanguage?: string | undefined;
}

export interface RegisterBuyerInput {
  /** `Authorization: Bearer` değeri; yoksa 401. */
  readonly pendingToken: string | undefined;
  readonly idempotencyKey: string | undefined;
  readonly body: BuyerRegistrationBody;
  /** İstek özeti için ham gövde ve yol (F1.2b K4 ile aynı özet). */
  readonly rawBody: unknown;
  readonly url: string;
  readonly ip?: string | undefined;
  readonly device?: DeviceInput | undefined;
  readonly context: AuditRequestContext;
}

/** Saklanan (idempotens) yanıt gövdesi: oturum bilgisi içermez. */
export interface RegisteredBuyer {
  readonly businessId: string;
  readonly profileCompleteness: number;
}

export interface BuyerRegistrationResponse extends RegisteredBuyer {
  readonly accessToken?: string;
  readonly expiresIn?: number;
  readonly refreshToken?: string;
}

export interface BuyerRegistrationResult {
  readonly statusCode: number;
  readonly body: BuyerRegistrationResponse;
}

function invalid(field: string, reason: string): DomainError {
  return new DomainError('VALIDATION_FAILED', { [field]: [reason] });
}

interface Prepared {
  readonly businessId: string;
  readonly userId: string;
  readonly phoneE164: string;
  readonly requestHash: string;
  readonly branchName: string;
  readonly planCode: string;
  readonly ttlHours: number;
  readonly now: Date;
}

@Injectable()
export class BuyerRegistrationService {
  constructor(
    @Inject(TokenService) private readonly tokens: Pick<TokenService, 'verifyPendingRegistration'>,
    @Inject(SessionService) private readonly sessions: Pick<SessionService, 'openSession'>,
    @Inject(UserDirectory) private readonly users: UserDirectory,
    @Inject(IpKeyService) private readonly ipKeys: IpKeyService,
    @Inject(IpHourlyRateLimiter) private readonly limiter: IpHourlyRateLimiter,
    @Inject(IdempotencyRepository) private readonly idempotency: IdempotencyRepository,
    @Inject(BusinessesRepository) private readonly businesses: BusinessesRepository,
    @Inject(RoleService) private readonly roles: RoleService,
    @Inject(MembershipService) private readonly memberships: MembershipService,
    @Inject(PlanService) private readonly plans: PlanService,
    @Inject(ReferenceLookup) private readonly references: ReferenceLookup,
    @Inject(I18nService) private readonly texts: I18nService,
    @Inject(SettingsService) private readonly settings: SettingsService,
    @Inject(OutboxWriter) private readonly outbox: OutboxWriter,
    @Inject(AuditService) private readonly audit: AuditRecorder,
    @Inject(IdGenerator) private readonly ids: IdGenerator,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  /** US-005 AC1, AC3, AC4; F2.3a R12/R13/R15. */
  async register(input: RegisterBuyerInput): Promise<BuyerRegistrationResult> {
    if (input.pendingToken === undefined) throw new DomainError('UNAUTHENTICATED');
    const phoneE164 = await this.tokens.verifyPendingRegistration(input.pendingToken);
    const now = this.clock.now();
    const businessId = this.ids.next();
    await this.enforceRateLimit(input.ip, businessId, now);

    const hash = requestHash({
      method: 'POST',
      url: input.url,
      businessId: undefined,
      body: input.rawBody,
    });
    const lookup = () =>
      this.idempotency.lookupByPhone({
        phoneE164,
        key: input.idempotencyKey,
        endpoint: BUYER_REGISTER_ENDPOINT,
        requestHash: hash,
        now,
      });
    const earlier = existingResult(await lookup());
    if (earlier !== undefined) return earlier;

    const [consentVersion, planCode, ttlHours] = await Promise.all([
      this.settings.get('legal.data_sharing_version'),
      this.settings.get('onboarding.buyer_plan_code'),
      this.settings.get('idempotency.ttl_hours'),
    ]);
    if (input.body.consentVersion !== consentVersion) throw invalid('consentVersion', 'outdated');

    // Çeviri işlemden önce okunur: işlem içinde ikinci bağlantı açılmaz (havuz tükenmesi).
    const branchName =
      (await this.texts.text(BRANCH_NAME_KEY, input.body.preferredLanguage)) ??
      input.body.legalName;
    const prepared: Prepared = {
      businessId,
      branchName,
      userId: this.ids.next(),
      phoneE164,
      requestHash: hash,
      planCode,
      ttlHours,
      now,
    };
    let registered: RegisteredBuyer;
    try {
      registered = await withTenantTx(
        { businessId: prepared.businessId, userId: prepared.userId },
        (tx) => this.createTx(tx, prepared, input),
      );
    } catch (error) {
      // Telefon arada kaydoldu (eşzamanlı istek veya eski anahtar): saklanan yanıt varsa o döner.
      if (!isPhoneTakenError(error)) throw error;
      const later = existingResult(await lookup());
      if (later !== undefined) return later;
      throw new DomainError('PHONE_ALREADY_REGISTERED');
    }

    const session = await this.sessions.openSession(prepared.userId, input.device);
    return {
      statusCode: CREATED,
      body: {
        ...registered,
        ...(session.nextStep === 'none'
          ? {
              accessToken: session.accessToken,
              expiresIn: session.expiresIn,
              refreshToken: session.refreshToken,
            }
          : {}),
      },
    };
  }

  private async enforceRateLimit(ip: string | undefined, member: string, now: Date): Promise<void> {
    const ipKey = this.ipKeys.keyOf(ip);
    if (ipKey === undefined) return;
    const decision = await this.limiter.reserve({
      scope: 'buyer_reg',
      ipKey,
      nowMs: now.getTime(),
      maxPerHour: await this.settings.get('buyer_registration.ip_max_per_hour'),
      member,
    });
    if (!decision.allowed) {
      throw new DomainError('RATE_LIMITED', { retryAfter: decision.retryAfterSeconds });
    }
  }

  /** Tek işlem (R15). Kullanıcı ilk yazılır: eşzamanlı ikinci kayıt bu satırda bekler (R13). */
  private async createTx(
    tx: Tx,
    prepared: Prepared,
    input: RegisterBuyerInput,
  ): Promise<RegisteredBuyer> {
    const { body } = input;
    const { businessId, userId, now } = prepared;
    const language = await this.languageTx(tx, body.preferredLanguage);

    await this.users.createSelfSignupTx(tx, {
      phoneE164: prepared.phoneE164,
      fullName: body.fullName,
      preferredLanguage: language,
      now,
    });

    const defaults = await this.references.regionDefaults(tx, body.regionId);
    if (defaults === undefined) throw invalid('regionId', 'not_found');
    if (!(await this.businesses.isActiveActivityTypeTx(tx, body.activityTypeId))) {
      throw invalid('activityTypeId', 'not_found');
    }
    const plan = await this.plans.findActivePlanByCodeTx(tx, prepared.planCode);
    if (plan === undefined) throw new Error('perakendeci kayıt planı bulunamadı');

    const completeness = profileCompleteness(SIGNUP_FILLED_FIELDS);
    await this.businesses.insertBuyerTx(tx, {
      id: businessId,
      legalName: body.legalName,
      regionId: body.regionId,
      activityTypeId: body.activityTypeId,
      defaultLanguage: language,
      currencyCode: defaults.currencyCode,
      timezone: defaults.timezone,
      contactName: body.fullName,
      dataConsentVersion: body.consentVersion,
      profileCompleteness: completeness,
      branchId: this.ids.next(),
      branchName: prepared.branchName,
      personDataId: this.ids.next(),
      now,
    });
    const role = await this.roles.createFromTemplateCodeTx(tx, businessId, BUYER_ADMIN_TEMPLATE);
    // F2.7c: ekip daveti için yeteneğin diğer rol şablonları da işletmeye kopyalanır.
    await this.roles.copyCapabilityTemplatesTx(tx, businessId, 'buyer');
    await this.memberships.addFounderAdminTx(tx, {
      id: this.ids.next(),
      businessId,
      userId,
      roleId: role.roleId,
      jobTitleId: role.jobTitleId,
      now,
    });
    await this.plans.startSelfSignupSubscriptionTx(tx, {
      plan,
      timeZone: defaults.timezone,
      now,
    });
    await this.outbox.write(tx, {
      type: 'buyer.registered',
      aggregateType: 'business',
      aggregateId: businessId,
      businessIds: [businessId],
      payload: { businessId, regionId: body.regionId },
    });
    await this.audit.record(tx, {
      actor: { type: 'user', userId },
      businessId,
      action: 'buyer.registered',
      targetType: 'business',
      targetId: businessId,
      after: {
        regionId: body.regionId,
        activityTypeId: body.activityTypeId,
        planId: plan.id,
        dataConsentVersion: body.consentVersion,
      },
      context: input.context,
    });

    const registered: RegisteredBuyer = { businessId, profileCompleteness: completeness };
    if (input.idempotencyKey !== undefined) {
      await this.idempotency.storeTx(tx, {
        key: input.idempotencyKey,
        endpoint: BUYER_REGISTER_ENDPOINT,
        requestHash: prepared.requestHash,
        statusCode: CREATED,
        body: registered,
        expiresAt: new Date(now.getTime() + prepared.ttlHours * MS_PER_HOUR),
      });
    }
    return registered;
  }

  /** İstenen dil aktif olmalı; verilmezse platform varsayılanı (K8). */
  private async languageTx(tx: Tx, preferred: string | undefined): Promise<string | null> {
    if (preferred === undefined) return (await this.references.defaultLanguage(tx)) ?? null;
    if (!(await this.references.isActiveLanguage(tx, preferred))) {
      throw invalid('preferredLanguage', 'not_found');
    }
    return preferred;
  }
}

/** Telefon zaten kayıtlıysa: saklanan yanıt, çakışma veya AC4. Kayıt yapılabilirse undefined. */
function existingResult(found: PhoneLookupResult): BuyerRegistrationResult | undefined {
  switch (found.result) {
    case 'new':
      return undefined;
    case 'replay':
      return { statusCode: found.statusCode, body: found.body as RegisteredBuyer };
    case 'conflict':
      throw new DomainError('IDEMPOTENCY_CONFLICT');
    case 'registered':
      throw new DomainError('PHONE_ALREADY_REGISTERED');
  }
}
