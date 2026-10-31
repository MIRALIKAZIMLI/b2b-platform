// Kimliksiz toptancı başvurusu (F2.2, US-008 AC1, AC3). Kayıt `seller_application_submit`
// SECURITY DEFINER fonksiyonuyla `pending` olarak yazılır; admin başvuru listesinde görünür.
// İnceleme (onay / ret) platform-admin modülünde.
import { Inject, Injectable } from '@nestjs/common';
import { legalTypeOfVoen } from '@b2b/shared';
import { Clock } from '../../core/clock';
import { DomainError } from '../../core/errors/domain-error';
import { IdGenerator } from '../../core/id-generator';
import { IpKeyService, parsePhoneE164 } from '../identity';
import { SettingsService } from '../settings';
import { SellerApplicationRateLimiter } from './seller-application-rate-limiter';
import {
  isPendingVoenViolation,
  isUnknownRegionViolation,
  SellerApplicationsRepository,
} from './seller-applications.repository';

export interface SubmitSellerApplicationInput {
  readonly legalName: string;
  readonly voen: string;
  readonly contactName: string;
  readonly phone: string;
  readonly regionId: string;
  readonly categoryNote?: string | undefined;
  /** İstek IP'si (Fastify `request.ip`); bilinmiyorsa IP sınırı uygulanmaz. */
  readonly ip?: string | undefined;
}

export interface SubmittedSellerApplication {
  readonly id: string;
  readonly status: 'pending';
}

function invalid(field: string, reason: string): DomainError {
  return new DomainError('VALIDATION_FAILED', { [field]: [reason] });
}

@Injectable()
export class SellerApplicationsService {
  constructor(
    @Inject(SellerApplicationsRepository) private readonly repository: SellerApplicationsRepository,
    @Inject(SellerApplicationRateLimiter) private readonly limiter: SellerApplicationRateLimiter,
    @Inject(IpKeyService) private readonly ipKeys: IpKeyService,
    @Inject(SettingsService) private readonly settings: SettingsService,
    @Inject(IdGenerator) private readonly ids: IdGenerator,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async submit(input: SubmitSellerApplicationInput): Promise<SubmittedSellerApplication> {
    const phone = parsePhoneE164(input.phone);
    if (phone === undefined) throw invalid('phone', 'invalid_phone');
    if (legalTypeOfVoen(input.voen) === undefined) throw invalid('voen', 'VOEN_INVALID');

    const id = this.ids.next();
    const now = this.clock.now();
    const ipKey = this.ipKeys.keyOf(input.ip);
    if (ipKey !== undefined) {
      const decision = await this.limiter.reserve({
        ipKey,
        nowMs: now.getTime(),
        maxPerHour: await this.settings.get('seller_application.ip_max_per_hour'),
        member: id,
      });
      if (!decision.allowed) {
        throw new DomainError('RATE_LIMITED', { retryAfter: decision.retryAfterSeconds });
      }
    }

    try {
      await this.repository.submit({
        id,
        legalName: input.legalName,
        voen: input.voen,
        contactName: input.contactName,
        phoneE164: phone.e164,
        regionId: input.regionId,
        categoryNote: input.categoryNote ?? null,
        now,
      });
    } catch (error) {
      if (isPendingVoenViolation(error)) {
        throw new DomainError('SELLER_APPLICATION_ALREADY_PENDING');
      }
      if (isUnknownRegionViolation(error)) throw invalid('regionId', 'not_found');
      throw error;
    }
    return { id, status: 'pending' };
  }
}
