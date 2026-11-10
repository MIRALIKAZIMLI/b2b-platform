// Dizin kartındaki ilişki durumu (F2.12a; openapi `DirectoryBuyer.relation`). Yalnız bağlamdaki
// satıcının kendi istek/bağlantı satırlarından ve bu perakendecinin onu engelleyip engellemediğinden
// hesaplanır; başka satıcının bağlantısı hiçbir koşulda girmez (US-007 AC6, Mimar notu).
import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../../core/clock';
import { withTenantTx } from '../../core/db';
import type { TenantContext } from '../../core/tenant-context';
import { type Relation, relationOf } from './connection-policy';
import { ConnectionRequestsService } from './connection-requests.service';
import { BUYER_TARGETS_MAX, ConnectionsRepository } from './connections.repository';

@Injectable()
export class ConnectionRelationsService {
  constructor(
    @Inject(ConnectionsRepository) private readonly repository: ConnectionsRepository,
    @Inject(ConnectionRequestsService) private readonly requests: ConnectionRequestsService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  /** Perakendeci kimliği → ilişki. İstek alamayan (dönmeyen) perakendeci `canRequest: false`. */
  async forSeller(
    tenant: TenantContext,
    buyerIds: readonly string[],
  ): Promise<Map<string, Relation>> {
    const result = new Map<string, Relation>();
    if (buyerIds.length === 0) return result;
    const cooldown = await this.requests.cooldownSettings(tenant.businessId);
    const now = this.clock.now();
    await withTenantTx(tenant, async (tx) => {
      const blocked = new Map<string, boolean>();
      for (let start = 0; start < buyerIds.length; start += BUYER_TARGETS_MAX) {
        const chunk = buyerIds.slice(start, start + BUYER_TARGETS_MAX);
        for (const target of await this.repository.buyerTargetsTx(tx, chunk)) {
          blocked.set(target.id, target.blocked);
        }
      }
      const histories = await this.repository.pairHistoriesTx(tx, tenant.businessId, buyerIds);
      for (const id of buyerIds) {
        const history = histories.get(id);
        const isBlocked = blocked.get(id);
        if (history === undefined) continue;
        const relation = relationOf({ ...history, blocked: isBlocked ?? false }, cooldown, now);
        result.set(id, isBlocked === undefined ? { ...relation, canRequest: false } : relation);
      }
    });
    return result;
  }
}
