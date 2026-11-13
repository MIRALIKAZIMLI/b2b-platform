// Arşivlenen perakendecinin bağlantıları (F2.18, US-016 AC2; kullanıcı kararı D2 = A). Platform
// admininin işleminde (`withPlatformTx`, platform-admin) çağrılır: aktif bağlantılar
// `ended_by_side = platform`, `end_reason = business_archived` ile kapanır (DEFINER; durum makinesi
// geçişi active → cancelled), `ConnectionCancelledHandler` kancaları aynı işlemde çalışır,
// `connection.cancelled` olayı ve satıcının aktif adminlerine "bağlantı iptal edildi" bildirimi.
// Bekleyen istekler değişmez: süre dolumuna kalır; arşivli alıcı yanıt veremez (AccessGuard),
// satıcı arşivli alıcıya yeni istek gönderemez (VARSAYIM, Mimar notu 2).
import { Inject, Injectable } from '@nestjs/common';
import type { Tx } from '../../core/db';
import { OutboxWriter } from '../../core/outbox';
import { InvitationService } from '../access';
import { ConnectionStateMachine } from './connection.state-machine';
import {
  CONNECTION_CANCELLED_HANDLERS,
  type ConnectionCancelledHandler,
} from './connection-cancelled.handler';
import { ConnectionsRepository } from './connections.repository';

@Injectable()
export class ConnectionArchiveService {
  constructor(
    @Inject(ConnectionsRepository) private readonly repository: ConnectionsRepository,
    @Inject(CONNECTION_CANCELLED_HANDLERS)
    private readonly handlers: readonly ConnectionCancelledHandler[],
    @Inject(InvitationService) private readonly invitations: InvitationService,
    @Inject(OutboxWriter) private readonly outbox: OutboxWriter,
  ) {}

  /** Kapanan bağlantı sayısı. İşletme aynı işlemde önce `archived` yapılmış olmalı. */
  async closeForArchivedBuyerTx(
    tx: Tx,
    buyerId: string,
    userId: string,
    now: Date,
  ): Promise<number> {
    ConnectionStateMachine.assertTransition('active', 'cancelled');
    const closed = await this.repository.closeArchivedBuyerConnectionsTx(tx, buyerId, now);
    for (const { connectionId, sellerId } of closed) {
      for (const handler of this.handlers) {
        await handler.onConnectionCancelled(tx, {
          connectionId,
          sellerId,
          buyerId,
          endedBySide: 'platform',
          endedAt: now,
          endedByUserId: userId,
        });
      }
      const businessIds = [sellerId, buyerId];
      await this.outbox.write(tx, {
        type: 'connection.cancelled',
        aggregateType: 'connection',
        aggregateId: connectionId,
        businessIds,
        payload: { connectionId, sellerId, buyerId, endedBySide: 'platform' },
      });
      for (const adminId of await this.invitations.activeAdminUserIdsTx(tx, sellerId)) {
        await this.outbox.write(tx, {
          type: 'connection.cancel_notice',
          aggregateType: 'connection',
          aggregateId: connectionId,
          businessIds,
          payload: { connectionId, businessId: sellerId, userId: adminId },
        });
      }
    }
    return closed.length;
  }
}
