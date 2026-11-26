// Fiyat listeleri ve fiyat açıklaması (F3.6a; US-034, ADR-0019; kart K1–K10, K2 = A). Bütün yazmalar
// satıcı kilidi altında tek kiracı işleminde. Fiyat hesabı yalnız `resolvePrice` (saf çekirdek);
// bu servis girdileri veritabanından yükler.
import { Inject, Injectable } from '@nestjs/common';
import type {
  PriceExplainQuery,
  PriceExplanationView,
  PriceListCreate,
  PriceListItemPage,
  PriceListItemsQuery,
  PriceListItemsSet,
  PriceListItemView,
  PriceListPage,
  PriceListUpdate,
  PriceListView,
} from '@b2b/shared';
import { type AuditRecorder, type AuditRequestContext, AuditService } from '../../core/audit';
import { Clock } from '../../core/clock';
import { type Tx, withTenantTx } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import { IdGenerator } from '../../core/id-generator';
import {
  fromDecimalString,
  LINE_TOTAL_SCALE,
  toDecimalString,
  UNIT_PRICE_SCALE,
} from '../../core/money';
import type { TenantContext } from '../../core/tenant-context';
import { PriceListStateMachine } from './price-list.state-machine';
import { type PriceListSource, resolvePrice } from './price-resolver';
import {
  type PriceListRow,
  PriceListsRepository,
  type PriceRow,
  type SellerPricingContext,
} from './price-lists.repository';
import { isFutureDay, localMidnight } from './valid-from';

function toView(row: PriceListRow, itemCount: number): PriceListView {
  return {
    id: row.id,
    name: row.name,
    currency: row.currencyCode,
    vatIncluded: row.vatIncluded,
    vatRate: row.vatRate,
    isDefault: row.isDefault,
    status: row.status,
    itemCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function snapshot(row: PriceListRow) {
  return {
    name: row.name,
    currency: row.currencyCode,
    vatIncluded: row.vatIncluded,
    vatRate: row.vatRate,
    isDefault: row.isDefault,
    status: row.status,
  };
}

function vatRateText(value: string): string {
  return toDecimalString(fromDecimalString(value), LINE_TOTAL_SCALE);
}

@Injectable()
export class PriceListsService {
  constructor(
    @Inject(PriceListsRepository) private readonly repository: PriceListsRepository,
    @Inject(AuditService) private readonly audit: AuditRecorder,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(IdGenerator) private readonly ids: IdGenerator,
  ) {}

  /** `GET /price-lists`: önce varsayılan, sonra aktifler, ada göre. */
  async list(tenant: TenantContext): Promise<PriceListPage> {
    return await withTenantTx(tenant, async (tx) => {
      const rows = await this.repository.listTx(tx, tenant.businessId);
      return { items: rows.map((row) => toView(row, row.itemCount)) };
    });
  }

  /** `POST /price-lists` (US-034 AC1): ilk liste varsayılan olur (K1); para birimi satıcınınki (K6). */
  async create(
    tenant: TenantContext,
    input: PriceListCreate,
    context: AuditRequestContext,
  ): Promise<PriceListView> {
    return await withTenantTx(tenant, async (tx) => {
      const sellerId = tenant.businessId;
      await this.repository.lockSellerTx(tx, sellerId);
      const seller = await this.sellerTx(tx, sellerId);
      if (input.currency !== seller.currencyCode) {
        throw new DomainError('CURRENCY_MISMATCH', {
          expected: seller.currencyCode,
          actual: input.currency,
        });
      }
      const first = !(await this.repository.hasAnyTx(tx, sellerId));
      const makeDefault = first || input.isDefault === true;
      const now = this.clock.now();
      if (makeDefault && !first) await this.repository.clearDefaultTx(tx, sellerId, now);
      const row = await this.repository.insertTx(tx, {
        id: this.ids.next(),
        sellerId,
        name: input.name,
        currencyCode: input.currency,
        vatIncluded: input.vatIncluded,
        vatRate: vatRateText(input.vatRate),
        isDefault: makeDefault,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });
      if (makeDefault) await this.repository.setProfileDefaultTx(tx, sellerId, row.id, now);
      await this.audit.record(tx, {
        actor: { type: 'user', userId: tenant.userId },
        businessId: sellerId,
        action: 'price_list.created',
        targetType: 'price_list',
        targetId: row.id,
        before: null,
        after: snapshot(row),
        context,
      });
      return toView(row, 0);
    });
  }

  /**
   * `PATCH /price-lists/{id}`: ad, ƏDV, varsayılan devri, arşiv/geri alma (state-machines §15).
   * Varsayılan liste arşivlenemez (K3); aktif bağlantıya atanmış liste arşivlenemez (K2 = A).
   * Liste satırı `FOR UPDATE`: bağlantıya atama (`FOR SHARE`, port) ile yarışta biri bekler.
   */
  async update(
    tenant: TenantContext,
    id: string,
    input: PriceListUpdate,
    context: AuditRequestContext,
  ): Promise<PriceListView> {
    return await withTenantTx(tenant, async (tx) => {
      const sellerId = tenant.businessId;
      await this.repository.lockSellerTx(tx, sellerId);
      const row = await this.repository.findTx(tx, sellerId, id, 'update');
      if (row === undefined) throw new DomainError('NOT_FOUND');

      const nextStatus = input.status ?? row.status;
      const statusChanged = nextStatus !== row.status;
      if (statusChanged) {
        PriceListStateMachine.assertTransition(row.status, nextStatus);
        if (nextStatus === 'archived') {
          if (row.isDefault) throw new DomainError('PRICE_LIST_DEFAULT_PROTECTED');
          const assigned = await this.repository.activeAssignmentsTx(tx, sellerId, id);
          if (assigned > 0) {
            throw new DomainError('PRICE_LIST_IN_USE', { connections: assigned });
          }
        }
      }
      const becomesDefault = input.isDefault === true && !row.isDefault;
      if (becomesDefault && nextStatus !== 'active') {
        throw new DomainError('INVALID_STATE_TRANSITION');
      }

      const now = this.clock.now();
      if (becomesDefault) await this.repository.clearDefaultTx(tx, sellerId, now);
      const updated = await this.repository.updateTx(
        tx,
        sellerId,
        id,
        {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.vatIncluded === undefined ? {} : { vatIncluded: input.vatIncluded }),
          ...(input.vatRate === undefined ? {} : { vatRate: vatRateText(input.vatRate) }),
          ...(becomesDefault ? { isDefault: true } : {}),
          ...(statusChanged ? { status: nextStatus } : {}),
        },
        now,
      );
      if (becomesDefault) await this.repository.setProfileDefaultTx(tx, sellerId, id, now);
      await this.audit.record(tx, {
        actor: { type: 'user', userId: tenant.userId },
        businessId: sellerId,
        action: statusChanged
          ? nextStatus === 'archived'
            ? 'price_list.archived'
            : 'price_list.restored'
          : 'price_list.updated',
        targetType: 'price_list',
        targetId: id,
        before: snapshot(row),
        after: snapshot(updated),
        context,
      });
      return toView(updated, await this.repository.itemCountTx(tx, id));
    });
  }

  /** `GET /price-lists/{id}/items`: ambalaj başına geçerli ve ileri tarihli fiyatlar. */
  async items(
    tenant: TenantContext,
    id: string,
    query: PriceListItemsQuery,
  ): Promise<PriceListItemPage> {
    return await withTenantTx(tenant, async (tx) => {
      const list = await this.repository.findTx(tx, tenant.businessId, id);
      if (list === undefined) throw new DomainError('NOT_FOUND');
      const page = await this.repository.packagingPageTx(tx, id, query.cursor, query.limit + 1);
      const packagingIds = page.slice(0, query.limit);
      const now = this.clock.now();
      const rows = await this.repository.pricesTx(tx, [id], packagingIds, now);
      const byPackaging = new Map<string, PriceRow[]>();
      for (const row of rows) {
        const bucket = byPackaging.get(row.packagingId) ?? [];
        bucket.push(row);
        byPackaging.set(row.packagingId, bucket);
      }
      const items: PriceListItemView[] = packagingIds.map((packagingId) => {
        const prices = byPackaging.get(packagingId) ?? [];
        const current = prices.find((row) => row.validFrom.getTime() <= now.getTime());
        return {
          packagingId,
          current:
            current === undefined
              ? null
              : { unitPrice: current.unitPrice, validFrom: current.validFrom.toISOString() },
          scheduled: prices
            .filter((row) => row.validFrom.getTime() > now.getTime())
            .map((row) => ({ unitPrice: row.unitPrice, validFrom: row.validFrom.toISOString() })),
        };
      });
      return {
        items,
        nextCursor: page.length > query.limit ? (packagingIds.at(-1) ?? null) : null,
      };
    });
  }

  /**
   * `PUT /price-lists/{id}/items` (US-034 AC6, K4, K5): fiyat hemen veya ileri bir günden
   * (toptancının saat diliminde 00:00) geçerli. Arşivli listeye yazılmaz (409).
   */
  async setItems(
    tenant: TenantContext,
    id: string,
    input: PriceListItemsSet,
    context: AuditRequestContext,
  ): Promise<{ count: number; validFrom: string }> {
    return await withTenantTx(tenant, async (tx) => {
      const sellerId = tenant.businessId;
      const list = await this.repository.findTx(tx, sellerId, id, 'share');
      if (list === undefined) throw new DomainError('NOT_FOUND');
      if (list.status !== 'active') throw new DomainError('INVALID_STATE_TRANSITION');
      const seller = await this.sellerTx(tx, sellerId);
      const now = this.clock.now();
      let validFrom = now;
      if (input.validFrom !== undefined) {
        if (!isFutureDay(input.validFrom, now, seller.timezone)) {
          throw new DomainError('VALIDATION_FAILED', { validFrom: ['must_be_future_day'] });
        }
        validFrom = localMidnight(input.validFrom, seller.timezone);
      }

      const owned = await this.repository.ownedPackagingIdsTx(
        tx,
        sellerId,
        input.items.map((item) => item.packagingId),
      );
      const errors: Record<string, string[]> = {};
      input.items.forEach((item, index) => {
        if (!owned.has(item.packagingId))
          errors[`items.${String(index)}.packagingId`] = ['not_found'];
      });
      if (Object.keys(errors).length > 0) throw new DomainError('VALIDATION_FAILED', errors);

      const count = await this.repository.upsertItemsTx(
        tx,
        input.items.map((item) => ({
          priceListId: id,
          sellerId,
          packagingId: item.packagingId,
          unitPrice: toDecimalString(fromDecimalString(item.unitPrice), UNIT_PRICE_SCALE),
          validFrom,
          createdAt: now,
          createdBy: tenant.userId,
        })),
        now,
      );
      await this.audit.record(tx, {
        actor: { type: 'user', userId: tenant.userId },
        businessId: sellerId,
        action: 'price_list.items_set',
        targetType: 'price_list',
        targetId: id,
        before: null,
        after: { count, validFrom: validFrom.toISOString() },
        context,
      });
      return { count, validFrom: validFrom.toISOString() };
    });
  }

  /**
   * `GET /prices/explain` (US-034 AC5): bir alıcı için fiyat ve kaynağı. Aktif bağlantı yoksa 404;
   * `assigned` kapsamlı üye yalnız kendisine atanmış müşteriyi görür (404). F3.6a kaynakları:
   * atanmış liste (aktifse) ve varsayılan liste.
   */
  async explain(tenant: TenantContext, query: PriceExplainQuery): Promise<PriceExplanationView> {
    return await withTenantTx(tenant, async (tx) => {
      const sellerId = tenant.businessId;
      const connection = await this.repository.activeConnectionTx(tx, sellerId, query.buyerId);
      if (connection === undefined) throw new DomainError('NOT_FOUND');
      if (
        tenant.permissions.get('pricing.view') === 'assigned' &&
        connection.salesRepMembershipId !== tenant.membershipId
      ) {
        throw new DomainError('NOT_FOUND');
      }
      const owned = await this.repository.ownedPackagingIdsTx(tx, sellerId, [query.packagingId]);
      if (!owned.has(query.packagingId)) throw new DomainError('NOT_FOUND');

      const seller = await this.sellerTx(tx, sellerId);
      const now = this.clock.now();
      const assigned =
        connection.priceListId === null
          ? undefined
          : await this.repository.findTx(tx, sellerId, connection.priceListId);
      const assignedList = assigned?.status === 'active' ? assigned : undefined;
      const defaultList = await this.repository.defaultTx(tx, sellerId);
      const lists = [assignedList, defaultList].filter(
        (list): list is PriceListRow => list !== undefined,
      );
      const candidates = await this.repository.effectiveCandidatesTx(
        tx,
        [...new Set(lists.map((list) => list.id))],
        query.packagingId,
        now,
      );
      const source = (list: PriceListRow | undefined): PriceListSource | null =>
        list === undefined
          ? null
          : {
              listId: list.id,
              name: list.name,
              currency: list.currencyCode,
              vatIncluded: list.vatIncluded,
              vatRate: list.vatRate,
              prices: candidates
                .filter((row) => row.priceListId === list.id)
                .map((row) => ({ unitPrice: row.unitPrice, validFrom: row.validFrom })),
            };
      const resolved = resolvePrice({
        now,
        currency: seller.currencyCode,
        qty: '1',
        branchPricingEnabled: false,
        branchPrices: [],
        customerPrices: [],
        // Varsayılan liste bağlantıya açıkça atanmışsa kaynak `price_list` (ADR-0019 sırası).
        assignedList: source(assignedList),
        defaultList: source(defaultList),
        tiers: [],
        branchDiscountPercent: null,
      });
      if (resolved.source === 'none') {
        return {
          unitPrice: null,
          source: 'none',
          tierDiscountPercent: null,
          branchDiscountPercent: null,
          finalUnitPrice: null,
          vatIncluded: null,
          vatRate: null,
          priceList: null,
          validFrom: null,
        };
      }
      return {
        unitPrice: { amount: resolved.unitPrice, currency: resolved.currency },
        source: resolved.source,
        tierDiscountPercent: resolved.tierDiscountPercent,
        branchDiscountPercent: resolved.branchDiscountPercent,
        finalUnitPrice: { amount: resolved.finalUnitPrice, currency: resolved.currency },
        vatIncluded: resolved.vatIncluded,
        vatRate: resolved.vatRate,
        priceList: resolved.priceList,
        validFrom: resolved.validFrom.toISOString(),
      };
    });
  }

  private async sellerTx(tx: Tx, sellerId: string): Promise<SellerPricingContext> {
    const seller = await this.repository.sellerContextTx(tx, sellerId);
    if (seller === undefined) throw new DomainError('NOT_FOUND');
    return seller;
  }
}
