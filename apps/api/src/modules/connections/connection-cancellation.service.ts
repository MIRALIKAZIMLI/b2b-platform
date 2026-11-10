// Bağlantı iptali (F2.15a; US-025, SF-07, state-machines §2). API iptali ve engel (F2.13a) aynı
// `cancelLockedTx` yolundan geçer: durum makinesi, iptal alanları, `ConnectionCancelledHandler`
// kancaları, `connection.cancelled` olayı ve karşı tarafın adminlerine bildirim tek işlemde.
// Karşı taraf gerekçeyi hiçbir yoldan görmez (Mimar K2; engel bilgisi sızmaz).
import { Inject, Injectable } from '@nestjs/common';
import type { ConnectionCancelInput, ConnectionCancelResult, ConnectionStatus } from '@b2b/shared';
import { type AuditRecorder, type AuditRequestContext, AuditService } from '../../core/audit';
import { Clock } from '../../core/clock';
import { type Tx, withTenantTx } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import { OutboxWriter } from '../../core/outbox';
import type { TenantContext } from '../../core/tenant-context';
import { ConnectionStateMachine } from './connection.state-machine';
import {
  CONNECTION_CANCELLED_HANDLERS,
  type ConnectionCancelledHandler,
} from './connection-cancelled.handler';
import { type ConnectionRow, ConnectionsRepository } from './connections.repository';

export interface CancelLockedInput {
  readonly side: 'seller' | 'buyer';
  /** `ConnectionCancelReason` veya engelde `blocked`. */
  readonly endReason: string;
  readonly userId: string;
}

@Injectable()
export class ConnectionCancellationService {
  constructor(
    @Inject(ConnectionsRepository) private readonly repository: ConnectionsRepository,
    @Inject(CONNECTION_CANCELLED_HANDLERS)
    private readonly handlers: readonly ConnectionCancelledHandler[],
    @Inject(OutboxWriter) private readonly outbox: OutboxWriter,
    @Inject(AuditService) private readonly audit: AuditRecorder,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  /** `POST /api/v1/connections/{id}/cancel` (US-025 AC1): çağıranın tarafı adına iptal. */
  async cancel(
    tenant: TenantContext,
    connectionId: string,
    input: ConnectionCancelInput,
    context: AuditRequestContext,
  ): Promise<ConnectionCancelResult> {
    return await withTenantTx(tenant, async (tx) => {
      const connection = await this.repository.lockConnectionTx(tx, connectionId);
      // RLS yalnız iki tarafa gösterir; yine de taraf burada açıkça denetlenir.
      const side = sideOf(connection, tenant.businessId);
      if (connection === undefined || side === null) throw new DomainError('NOT_FOUND');
      const result = await this.cancelLockedTx(tx, connection, {
        side,
        endReason: input.reason,
        userId: tenant.userId,
      });
      await this.audit.record(tx, {
        actor: { type: 'user', userId: tenant.userId },
        businessId: tenant.businessId,
        action: 'connection.cancelled',
        targetType: 'connection',
        targetId: connection.id,
        before: { status: connection.status },
        after: {
          status: 'cancelled',
          endedBySide: side,
          endReason: input.reason,
          // Mimar K1: not yalnız audit'te (kolon yok).
          note: input.note ?? null,
          cancelledOrders: result.cancelledOrders,
        },
        context,
      });
      return result;
    });
  }

  /**
   * Kilitli (`FOR UPDATE`) bağlantıyı iptal eder; çağıran işlemin içinde. Engel (F2.13a) de bunu
   * kullanır. Kanca hatası tüm işlemi geri alır (bağlantı `active` kalır, olay yazılmaz).
   */
  async cancelLockedTx(
    tx: Tx,
    connection: ConnectionRow,
    input: CancelLockedInput,
  ): Promise<ConnectionCancelResult> {
    ConnectionStateMachine.assertTransition(connection.status as ConnectionStatus, 'cancelled');
    const endedAt = this.clock.now();
    const cancelled = await this.repository.cancelConnectionTx(tx, connection.id, {
      endedAt,
      endedBySide: input.side,
      endReason: input.endReason,
      endedByUserId: input.userId,
    });

    let cancelledOrders = 0;
    for (const handler of this.handlers) {
      const effect = await handler.onConnectionCancelled(tx, {
        connectionId: cancelled.id,
        sellerId: cancelled.sellerId,
        buyerId: cancelled.buyerId,
        endedBySide: input.side,
        endedAt,
        endedByUserId: input.userId,
      });
      cancelledOrders += effect.cancelledOrders;
    }

    const businessIds = [cancelled.sellerId, cancelled.buyerId];
    await this.outbox.write(tx, {
      type: 'connection.cancelled',
      aggregateType: 'connection',
      aggregateId: cancelled.id,
      businessIds,
      payload: {
        connectionId: cancelled.id,
        sellerId: cancelled.sellerId,
        buyerId: cancelled.buyerId,
        endedBySide: input.side,
      },
    });
    const counterpartId = input.side === 'seller' ? cancelled.buyerId : cancelled.sellerId;
    for (const userId of await this.repository.counterpartAdminsTx(tx, cancelled.id)) {
      await this.outbox.write(tx, {
        type: 'connection.cancel_notice',
        aggregateType: 'connection',
        aggregateId: cancelled.id,
        businessIds,
        payload: { connectionId: cancelled.id, businessId: counterpartId, userId },
      });
    }
    return { cancelledOrders };
  }
}

function sideOf(
  connection: ConnectionRow | undefined,
  businessId: string,
): 'seller' | 'buyer' | null {
  if (connection?.sellerId === businessId) return 'seller';
  if (connection?.buyerId === businessId) return 'buyer';
  return null;
}
