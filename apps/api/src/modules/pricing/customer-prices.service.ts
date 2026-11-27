// Müşteriye özel fiyat (F3.7a; US-035 AC1, ADR-0019, R30; kart K3–K8; kullanıcı kararları S1 = A,
// S3 = A). Yazma yalnız aktif bağlantıya, bağlantı satırı `FOR SHARE` ile kilitli; okuma ve kaldırma
// bağlantı bittikten sonra da (S3 = A: fiyatlar saklanır).
import { Inject, Injectable } from '@nestjs/common';
import type {
  CustomerPricePage,
  CustomerPriceRemoveQuery,
  CustomerPricesQuery,
  CustomerPricesSet,
} from '@b2b/shared';
import { type AuditRecorder, type AuditRequestContext, AuditService } from '../../core/audit';
import { Clock } from '../../core/clock';
import { withTenantTx } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import { fromDecimalString, toDecimalString, UNIT_PRICE_SCALE } from '../../core/money';
import type { TenantContext } from '../../core/tenant-context';
import { type CustomerPriceRow, CustomerPricesRepository } from './customer-prices.repository';
import { PriceListsRepository } from './price-lists.repository';
import { isFutureDay, localMidnight } from './valid-from';

@Injectable()
export class CustomerPricesService {
  constructor(
    @Inject(CustomerPricesRepository) private readonly repository: CustomerPricesRepository,
    @Inject(PriceListsRepository) private readonly lists: PriceListsRepository,
    @Inject(AuditService) private readonly audit: AuditRecorder,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  /**
   * `GET /customer-prices` (K5): ambalaj başına geçerli ve ileri tarihli müşteri fiyatları.
   * `assigned` kapsamlı üye yalnız kendisine atanmış aktif bağlantının müşterisini görür (404).
   */
  async list(tenant: TenantContext, query: CustomerPricesQuery): Promise<CustomerPricePage> {
    return await withTenantTx(tenant, async (tx) => {
      const sellerId = tenant.businessId;
      if (tenant.permissions.get('pricing.view') === 'assigned') {
        const connection = await this.repository.activeConnectionTx(tx, sellerId, query.buyerId);
        if (connection?.salesRepMembershipId !== tenant.membershipId) {
          throw new DomainError('NOT_FOUND');
        }
      }
      const page = await this.repository.packagingPageTx(
        tx,
        sellerId,
        query.buyerId,
        query.cursor,
        query.limit + 1,
      );
      const packagings = page.slice(0, query.limit);
      const now = this.clock.now();
      const rows = await this.repository.pricesTx(
        tx,
        sellerId,
        query.buyerId,
        packagings.map((row) => row.packagingId),
        now,
      );
      const byPackaging = new Map<string, CustomerPriceRow[]>();
      for (const row of rows) {
        const bucket = byPackaging.get(row.packagingId) ?? [];
        bucket.push(row);
        byPackaging.set(row.packagingId, bucket);
      }
      return {
        items: packagings.map((packaging) => {
          const prices = byPackaging.get(packaging.packagingId) ?? [];
          const current = prices.find((row) => row.validFrom.getTime() <= now.getTime());
          return {
            ...packaging,
            current:
              current === undefined
                ? null
                : { unitPrice: current.unitPrice, validFrom: current.validFrom.toISOString() },
            scheduled: prices
              .filter((row) => row.validFrom.getTime() > now.getTime())
              .map((row) => ({
                unitPrice: row.unitPrice,
                validFrom: row.validFrom.toISOString(),
              })),
          };
        }),
        nextCursor: page.length > query.limit ? (packagings.at(-1)?.packagingId ?? null) : null,
      };
    });
  }

  /**
   * `PUT /customer-prices` (US-035 AC1, K3–K4): yalnız aktif bağlantıya (404). Gün kuralı ve
   * "geçerli olmuş fiyat değişmez" fiyat listeleriyle aynı (F3.6a K4–K5).
   */
  async set(
    tenant: TenantContext,
    input: CustomerPricesSet,
    context: AuditRequestContext,
  ): Promise<{ count: number; validFrom: string }> {
    return await withTenantTx(tenant, async (tx) => {
      const sellerId = tenant.businessId;
      const connection = await this.repository.activeConnectionTx(
        tx,
        sellerId,
        input.buyerId,
        'share',
      );
      if (connection === undefined) throw new DomainError('NOT_FOUND');
      const seller = await this.lists.sellerContextTx(tx, sellerId);
      if (seller === undefined) throw new DomainError('NOT_FOUND');
      const now = this.clock.now();
      let validFrom = now;
      if (input.validFrom !== undefined) {
        if (!isFutureDay(input.validFrom, now, seller.timezone)) {
          throw new DomainError('VALIDATION_FAILED', { validFrom: ['must_be_future_day'] });
        }
        validFrom = localMidnight(input.validFrom, seller.timezone);
      }

      const packagingIds = input.items.map((item) => item.packagingId);
      const owned = await this.lists.ownedPackagingIdsTx(tx, sellerId, packagingIds);
      const errors: Record<string, string[]> = {};
      input.items.forEach((item, index) => {
        if (!owned.has(item.packagingId))
          errors[`items.${String(index)}.packagingId`] = ['not_found'];
      });
      if (Object.keys(errors).length > 0) throw new DomainError('VALIDATION_FAILED', errors);

      const before = await this.repository.effectiveTx(
        tx,
        sellerId,
        input.buyerId,
        packagingIds,
        now,
      );
      const items = input.items.map((item) => ({
        packagingId: item.packagingId,
        unitPrice: toDecimalString(fromDecimalString(item.unitPrice), UNIT_PRICE_SCALE),
      }));
      const count = await this.repository.upsertTx(
        tx,
        items.map((item) => ({
          sellerId,
          buyerId: input.buyerId,
          packagingId: item.packagingId,
          unitPrice: item.unitPrice,
          validFrom,
          createdAt: now,
          createdBy: tenant.userId,
        })),
        now,
      );
      await this.audit.record(tx, {
        actor: { type: 'user', userId: tenant.userId },
        businessId: sellerId,
        action: 'customer_price.set',
        targetType: 'customer_price',
        targetId: input.buyerId,
        before: {
          prices: packagingIds.map((packagingId) => ({
            packagingId,
            unitPrice: before.get(packagingId)?.unitPrice ?? null,
          })),
        },
        after: { validFrom: validFrom.toISOString(), count, prices: items },
        context,
      });
      return { count, validFrom: validFrom.toISOString() };
    });
  }

  /**
   * `DELETE /customer-prices` (S1 = A, K6): bir ambalajın bu alıcıdaki bütün müşteri fiyatları silinir;
   * perakendeci yeniden liste fiyatını görür. Bağlantı aranmaz; silinecek satır yoksa 404.
   */
  async remove(
    tenant: TenantContext,
    query: CustomerPriceRemoveQuery,
    context: AuditRequestContext,
  ): Promise<{ count: number }> {
    return await withTenantTx(tenant, async (tx) => {
      const sellerId = tenant.businessId;
      const removed = await this.repository.removeTx(
        tx,
        sellerId,
        query.buyerId,
        query.packagingId,
      );
      if (removed.length === 0) throw new DomainError('NOT_FOUND');
      await this.audit.record(tx, {
        actor: { type: 'user', userId: tenant.userId },
        businessId: sellerId,
        action: 'customer_price.removed',
        targetType: 'customer_price',
        targetId: query.buyerId,
        before: {
          packagingId: query.packagingId,
          prices: removed.map((row) => ({
            unitPrice: row.unitPrice,
            validFrom: row.validFrom.toISOString(),
          })),
        },
        after: null,
        context,
      });
      return { count: removed.length };
    });
  }
}
