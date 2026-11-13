// Perakendeciyi "sil" (F2.18, US-016 AC2–AC3; kullanıcı kararları D1 = A, D2 = A). Çağıranın
// platform işleminde, işletme satırı kilitliyken:
// - Geçmiş yoksa (bağlantı, bağlantı isteği, engel; sipariş/belge/cari F3–F5'te eklenir)
//   `business_purge` kaydı ve kişisel veriyi kalıcı siler (AC3). Dosya nesneleri commit sonrası.
// - Geçmiş varsa işletme `archived` olur, 🔒 `person_data` silinir, açık davetler kapanır, aktif
//   bağlantılar platform tarafından kapanır (D2); bağlantı ve istek kayıtları korunur (AC2).
// Audit'te gerekçe (admin notu) ve sayılar var; kişisel veri yok (Mimar notu 5).
import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { type AuditRecorder, type AuditRequestContext, AuditService } from '../../core/audit';
import { Clock } from '../../core/clock';
import type { Tx } from '../../core/db';
import { OutboxWriter } from '../../core/outbox';
import { InvitationService } from '../access';
import { type BusinessForStatus, BuyerAdminRepository } from '../businesses';
import { ConnectionArchiveService } from '../connections';
import type { PlatformActor } from './sellers.service';

export interface ArchiveOutcome {
  readonly outcome: 'archived' | 'deleted';
  /** Kalıcı silmede silinen dosyaların depo anahtarları (commit sonrası silinir). */
  readonly objectKeys: readonly string[];
}

@Injectable()
export class BuyerArchiveService {
  constructor(
    @Inject(BuyerAdminRepository) private readonly buyers: BuyerAdminRepository,
    @Inject(InvitationService) private readonly invitations: InvitationService,
    @Inject(ConnectionArchiveService) private readonly connections: ConnectionArchiveService,
    @Inject(AuditService) private readonly audit: AuditRecorder,
    @Inject(OutboxWriter) private readonly outbox: OutboxWriter,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async archiveTx(
    tx: Tx,
    actor: PlatformActor,
    business: BusinessForStatus,
    reason: string,
    context: AuditRequestContext,
  ): Promise<ArchiveOutcome> {
    const auditBase = {
      actor: { type: 'platform' as const, userId: actor.userId },
      businessId: business.id,
      targetType: 'business' as const,
      targetId: business.id,
      context,
    };
    const purge = await tx.execute<{ purged: boolean; object_keys: string[] | null }>(
      sql`select purged, object_keys from business_purge(${business.id}::uuid)`,
    );
    const row = purge.rows[0];
    if (row?.purged === true) {
      const objectKeys = row.object_keys ?? [];
      await this.audit.record(tx, {
        ...auditBase,
        action: 'business.purged',
        before: { status: business.status },
        after: { status: null, reason, files: objectKeys.length },
      });
      // İndeks belgesi silinir (işletme yok → dizin olayı belgeyi kaldırır).
      await this.directoryChanged(tx, business.id);
      return { outcome: 'deleted', objectKeys };
    }

    const now = this.clock.now();
    await this.buyers.setStatusTx(tx, business.id, 'archived', now);
    const personRows = await this.buyers.deletePersonDataTx(tx, business.id);
    const invitations = await this.invitations.expireOpenInvitationsTx(tx, business.id, now);
    const connections = await this.connections.closeForArchivedBuyerTx(
      tx,
      business.id,
      actor.userId,
      now,
    );
    await this.audit.record(tx, {
      ...auditBase,
      action: 'business.archived',
      before: { status: business.status },
      after: {
        status: 'archived',
        reason,
        personDataDeleted: personRows > 0,
        invitationsClosed: invitations,
        connectionsClosed: connections,
      },
    });
    await this.directoryChanged(tx, business.id);
    return { outcome: 'archived', objectKeys: [] };
  }

  private async directoryChanged(tx: Tx, id: string): Promise<void> {
    await this.outbox.write(tx, {
      type: 'buyer.profile_changed',
      aggregateType: 'business',
      aggregateId: id,
      businessIds: [id],
      payload: { businessId: id },
    });
  }
}
