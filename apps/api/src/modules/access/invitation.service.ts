// Davetler (F2.1a; F2.7 ekip daveti aynı kabulü kullanır). Oluşturma, kapatma ve durum okuması
// çağıranın işleminde (`tx`) yapılır: toptancı açılışı tek `withPlatformTx` (R15). Kabul
// `invitation_accept` SECURITY DEFINER fonksiyonuyla, kullanıcı bağlamında (R16, R17).
import { Inject, Injectable } from '@nestjs/common';
import { AuditService, type AuditRecorder, type AuditRequestContext } from '../../core/audit';
import { Clock } from '../../core/clock';
import { type Tx, withUserTx } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import { IdGenerator } from '../../core/id-generator';
import {
  type DirectoryUser,
  parsePhoneE164,
  TransactionalSmsService,
  UserDirectory,
} from '../identity';
import { AccessRepository } from './access.repository';
import { generateInvitationToken, hashInvitationToken } from './invitation-token';

export type ActivationStatus = 'pending' | 'accepted' | 'expired';

export interface NewInvitation {
  readonly businessId: string;
  readonly phoneE164: string;
  readonly roleId: string;
  readonly jobTitleId: string;
  /** Ekip daveti kapsamı (F2.7a); toptancı aktivasyonunda yok. */
  readonly branchId?: string | null;
  readonly warehouseId?: string | null;
  readonly createdBy: string;
  readonly expiresAt: Date;
  readonly now: Date;
}

export interface CreatedInvitation {
  readonly invitationId: string;
  /** Ham token: yalnızca SMS bağlantısı için; saklanmaz, loglanmaz. */
  readonly token: string;
  readonly expiresAt: Date;
}

@Injectable()
export class InvitationService {
  constructor(
    @Inject(AccessRepository) private readonly repository: AccessRepository,
    @Inject(UserDirectory) private readonly users: UserDirectory,
    @Inject(TransactionalSmsService) private readonly sms: TransactionalSmsService,
    @Inject(AuditService) private readonly audit: AuditRecorder,
    @Inject(IdGenerator) private readonly ids: IdGenerator,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  /** Davet telefonu geçerli E.164 mü (openapi `PhoneE164`); geçerliyse normal biçimi. */
  normalizePhone(raw: string): string | undefined {
    return parsePhoneE164(raw)?.e164;
  }

  /** Davet edilen yetkilinin kullanıcı satırı (S3 = A); varsa olduğu gibi kullanılır. */
  async ensureInviteeTx(tx: Tx, phoneE164: string, fullName: string): Promise<DirectoryUser> {
    return await this.users.findOrCreateByPhoneTx(tx, phoneE164, fullName);
  }

  async createTx(tx: Tx, input: NewInvitation): Promise<CreatedInvitation> {
    const { token, hash } = generateInvitationToken();
    const invitationId = this.ids.next();
    await this.repository.insertInvitation(tx, {
      id: invitationId,
      businessId: input.businessId,
      phoneE164: input.phoneE164,
      roleId: input.roleId,
      jobTitleId: input.jobTitleId,
      branchId: input.branchId ?? null,
      warehouseId: input.warehouseId ?? null,
      tokenHash: hash,
      expiresAt: input.expiresAt,
      createdBy: input.createdBy,
      createdAt: input.now,
    });
    return { invitationId, token, expiresAt: input.expiresAt };
  }

  /** Açık admin davetlerini geçersiz kılar (`expires_at = now`; US-009 AC3 yeniden gönderim). */
  async expireOpenAdminInvitationsTx(tx: Tx, businessId: string, now: Date): Promise<void> {
    await this.repository.expireOpenAdminInvitations(tx, businessId, now);
  }

  /** İşletmenin bütün açık davetleri kapanır (F2.18 arşiv). */
  async expireOpenInvitationsTx(tx: Tx, businessId: string, now: Date): Promise<number> {
    return await this.repository.expireOpenInvitations(tx, businessId, now);
  }

  /** İşletmenin aktif admin üyeleri (platform işleminde bildirim alıcıları; F2.18). */
  async activeAdminUserIdsTx(tx: Tx, businessId: string): Promise<string[]> {
    return await this.repository.activeAdminUserIds(tx, businessId);
  }

  async hasActiveAdminTx(tx: Tx, businessId: string): Promise<boolean> {
    return (await this.repository.businessesWithActiveAdmin(tx, [businessId])).has(businessId);
  }

  /** Yeniden gönderimde kullanılacak admin rolü, unvanı ve telefon (ilk davetten). */
  async adminInvitationTargetTx(
    tx: Tx,
    businessId: string,
  ): Promise<{ roleId: string; jobTitleId: string; phoneE164: string } | undefined> {
    const role = await this.repository.adminRoleOf(tx, businessId);
    const phoneE164 = await this.repository.lastAdminInvitationPhone(tx, businessId);
    return role === undefined || phoneE164 === undefined ? undefined : { ...role, phoneE164 };
  }

  /** accepted = aktif admin üyelik var; pending = açık admin daveti var; yoksa expired. */
  async activationStatusesTx(
    tx: Tx,
    businessIds: readonly string[],
    now: Date,
  ): Promise<Map<string, ActivationStatus>> {
    const accepted = await this.repository.businessesWithActiveAdmin(tx, businessIds);
    const open = await this.repository.businessesWithOpenAdminInvitation(tx, businessIds, now);
    const result = new Map<string, ActivationStatus>();
    for (const id of businessIds) {
      result.set(id, accepted.has(id) ? 'accepted' : open.has(id) ? 'pending' : 'expired');
    }
    return result;
  }

  /** Davet SMS'i (işlem commit'inden sonra; K3). Gönderilemezse false. */
  async sendSms(phoneE164: string, body: string): Promise<boolean> {
    return await this.sms.send({ to: phoneE164, body, purpose: 'invitation' });
  }

  /**
   * Oturumdaki kullanıcı daveti kabul eder (US-009 AC2). Geçersiz, süresi dolmuş, kullanılmış,
   * başka telefona ait davet veya zaten üyelik → hepsi aynı `404 NOT_FOUND` (R16, K2).
   */
  async accept(
    userId: string,
    token: string,
    context: AuditRequestContext,
  ): Promise<{ businessId: string }> {
    const now = this.clock.now();
    const accepted = await withUserTx({ userId }, async (tx) => {
      const result = await this.repository.acceptInvitation(
        tx,
        hashInvitationToken(token),
        this.ids.next(),
        now,
      );
      if (result === undefined) return undefined;
      await this.audit.record(tx, {
        actor: { type: 'user', userId },
        businessId: result.businessId,
        action: 'invitation.accepted',
        targetType: 'invitation',
        targetId: result.invitationId,
        after: { membershipId: result.membershipId, userId },
        context,
      });
      return result;
    });
    if (accepted === undefined) throw new DomainError('NOT_FOUND');
    return { businessId: accepted.businessId };
  }
}
