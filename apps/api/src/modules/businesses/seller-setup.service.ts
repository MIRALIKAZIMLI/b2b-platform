// Toptancı kurulumu (F2.6, US-011): depolar, satıcı profili, hizmet bölgeleri.
// - Yalnız `seller` yeteneği (yoksa `403 CAPABILITY_REQUIRED`); izin `business.manage` (controller).
// - AC1: ilk depo varsayılan olur; `seller_profiles.default_warehouse_id` aynı işlemde eşitlenir.
// - AC2: aktif depo sayısı `warehouses.max` hakkına tabi (WarehouseLimitGate → billing). Eşzamanlı
//   iki ekleme işletme satırı kilidiyle sıraya girer; ikincisi güncel sayıyı görür.
// - AC3: depo silinmez, yalnız pasifleştirilir (DELETE ucu yok). Varsayılan depo pasifleştirilemez,
//   pasif depo varsayılan yapılamaz → `409 INVALID_STATE_TRANSITION`.
import { Inject, Injectable } from '@nestjs/common';
import type { SelectableStockMode, StockMode } from '@b2b/shared';
import { type AuditRecorder, type AuditRequestContext, AuditService } from '../../core/audit';
import { Clock } from '../../core/clock';
import { type Tx, withTenantTx } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import { IdGenerator } from '../../core/id-generator';
import type { TenantContext } from '../../core/tenant-context';
import { BusinessesRepository } from './businesses.repository';
import {
  type SellerProfilePatch,
  type SellerProfileRow,
  SellerSetupRepository,
  type WarehousePatch,
  type WarehouseRow,
} from './seller-setup.repository';
import { WarehouseLimitGate } from './warehouse-limit.gate';

export interface WarehouseInput {
  readonly name: string;
  readonly addressLine?: string | undefined;
}

export interface WarehouseUpdate {
  readonly name?: string | undefined;
  readonly addressLine?: string | null | undefined;
  readonly isDefault?: true | undefined;
  readonly status?: 'active' | 'inactive' | undefined;
}

export interface SellerProfileUpdate {
  readonly description?: Record<string, string> | null | undefined;
  readonly minOrderAmount?: string | null | undefined;
  readonly requireDeliveryPhoto?: boolean | undefined;
  readonly stockMode?: SelectableStockMode | undefined;
  readonly lowStockDisplayThreshold?: string | undefined;
}

/** Profil satırı yoksa (eski veri) varsayılanlar; F2.1a her toptancıya satır açar. */
export interface SellerProfileView {
  readonly description: Record<string, string> | null;
  readonly minOrderAmount: string | null;
  readonly requireDeliveryPhoto: boolean;
  readonly defaultWarehouseId: string | null;
  readonly stockMode: StockMode;
  /** Satış biriminde tam sayı metni (F3.11b, S1 = A); satır yoksa varsayılan 5. */
  readonly lowStockDisplayThreshold: string;
}

function toProfileView(row: SellerProfileRow | undefined): SellerProfileView {
  return {
    description: (row?.description as Record<string, string> | null | undefined) ?? null,
    minOrderAmount: row?.minOrderAmount ?? null,
    requireDeliveryPhoto: row?.requireDeliveryPhoto ?? false,
    defaultWarehouseId: row?.defaultWarehouseId ?? null,
    // Kolon CHECK ile üç değerden biri (data-model §seller_profiles); satır yoksa varsayılan.
    stockMode: (row?.stockMode as StockMode | undefined) ?? 'availability',
    lowStockDisplayThreshold: normalizeThreshold(row?.lowStockDisplayThreshold ?? '5'),
  };
}

/** `numeric(14,3)` metni ("5.000") → "5"; eşik tam sayıdır (girdi şeması). */
function normalizeThreshold(value: string): string {
  return value.includes('.') ? value.replace(/\.?0+$/, '') : value;
}

function profilePatch(input: SellerProfileUpdate): SellerProfilePatch {
  return {
    ...(input.description === undefined ? {} : { description: input.description }),
    ...(input.minOrderAmount === undefined ? {} : { minOrderAmount: input.minOrderAmount }),
    ...(input.requireDeliveryPhoto === undefined
      ? {}
      : { requireDeliveryPhoto: input.requireDeliveryPhoto }),
    ...(input.stockMode === undefined ? {} : { stockMode: input.stockMode }),
    ...(input.lowStockDisplayThreshold === undefined
      ? {}
      : { lowStockDisplayThreshold: input.lowStockDisplayThreshold }),
  };
}

function requireSeller(tenant: TenantContext): void {
  if (!tenant.capabilities.includes('seller')) throw new DomainError('CAPABILITY_REQUIRED');
}

@Injectable()
export class SellerSetupService {
  constructor(
    @Inject(SellerSetupRepository) private readonly repository: SellerSetupRepository,
    @Inject(BusinessesRepository) private readonly businesses: BusinessesRepository,
    @Inject(WarehouseLimitGate) private readonly limits: WarehouseLimitGate,
    @Inject(AuditService) private readonly audit: AuditRecorder,
    @Inject(IdGenerator) private readonly ids: IdGenerator,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  // --- depolar ---

  async listWarehouses(tenant: TenantContext): Promise<WarehouseRow[]> {
    requireSeller(tenant);
    return await withTenantTx(tenant, (tx) =>
      this.repository.listWarehousesTx(tx, tenant.businessId),
    );
  }

  /** US-011 AC1, AC2. */
  async createWarehouse(
    tenant: TenantContext,
    input: WarehouseInput,
    context: AuditRequestContext,
  ): Promise<WarehouseRow> {
    requireSeller(tenant);
    const now = this.clock.now();
    return await withTenantTx(tenant, async (tx) => {
      await this.lockBusiness(tx, tenant.businessId);
      await this.limits.assertCanAddActive(tx, tenant.businessId);
      const isDefault = !(await this.repository.hasAnyWarehouseTx(tx, tenant.businessId));
      const row = await this.repository.insertWarehouseTx(tx, {
        id: this.ids.next(),
        businessId: tenant.businessId,
        name: input.name,
        addressLine: input.addressLine ?? null,
        isDefault,
        now,
      });
      if (isDefault) {
        await this.repository.upsertSellerProfileTx(
          tx,
          tenant.businessId,
          { defaultWarehouseId: row.id },
          now,
        );
      }
      await this.audit.record(tx, {
        actor: { type: 'user', userId: tenant.userId },
        businessId: tenant.businessId,
        action: 'warehouse.created',
        targetType: 'warehouse',
        targetId: row.id,
        after: { name: row.name, isDefault: row.isDefault, status: row.status },
        context,
      });
      return row;
    });
  }

  /** Ad / adres, varsayılan yapma, pasifleştirme / etkinleştirme (US-011 AC3). */
  async updateWarehouse(
    tenant: TenantContext,
    id: string,
    input: WarehouseUpdate,
    context: AuditRequestContext,
  ): Promise<WarehouseRow> {
    requireSeller(tenant);
    const now = this.clock.now();
    return await withTenantTx(tenant, async (tx) => {
      // İşletme kilidi: etkinleştirme sayımı ve varsayılan değişimi eşzamanlı yazımlarla yarışmaz.
      await this.lockBusiness(tx, tenant.businessId);
      const current = await this.repository.lockWarehouseTx(tx, tenant.businessId, id);
      if (current === undefined) throw new DomainError('NOT_FOUND');

      const patch: WarehousePatch = {};
      const changes: Record<string, unknown> = {};
      const before: Record<string, unknown> = {};
      const note = (key: keyof WarehousePatch, value: unknown) => {
        if (current[key] === value) return;
        (patch as Record<string, unknown>)[key] = value;
        before[key] = current[key];
        changes[key] = value;
      };
      if (input.name !== undefined) note('name', input.name);
      if (input.addressLine !== undefined) note('addressLine', input.addressLine);
      if (input.status !== undefined) note('status', input.status);
      if (input.isDefault === true) note('isDefault', true);

      const finalStatus = patch.status ?? current.status;
      const finalDefault = patch.isDefault ?? current.isDefault;
      if (finalDefault && finalStatus === 'inactive') {
        throw new DomainError('INVALID_STATE_TRANSITION', { reason: 'default_warehouse_inactive' });
      }
      if (Object.keys(patch).length === 0) return current;
      if (patch.status === 'active') {
        await this.limits.assertCanAddActive(tx, tenant.businessId);
      }
      if (patch.isDefault === true) {
        await this.repository.clearDefaultWarehouseTx(tx, tenant.businessId, now);
        await this.repository.upsertSellerProfileTx(
          tx,
          tenant.businessId,
          { defaultWarehouseId: id },
          now,
        );
      }
      const updated = await this.repository.updateWarehouseTx(
        tx,
        tenant.businessId,
        id,
        patch,
        now,
      );
      if (updated === undefined) throw new DomainError('NOT_FOUND');
      await this.audit.record(tx, {
        actor: { type: 'user', userId: tenant.userId },
        businessId: tenant.businessId,
        action: 'warehouse.updated',
        targetType: 'warehouse',
        targetId: id,
        before,
        after: changes,
        context,
      });
      return updated;
    });
  }

  // --- satıcı profili ---

  async getProfile(tenant: TenantContext): Promise<SellerProfileView> {
    requireSeller(tenant);
    const row = await withTenantTx(tenant, (tx) =>
      this.repository.findSellerProfileTx(tx, tenant.businessId),
    );
    return toProfileView(row);
  }

  async updateProfile(
    tenant: TenantContext,
    input: SellerProfileUpdate,
    context: AuditRequestContext,
  ): Promise<SellerProfileView> {
    requireSeller(tenant);
    const now = this.clock.now();
    const patch = profilePatch(input);
    return await withTenantTx(tenant, async (tx) => {
      const current = toProfileView(
        await this.repository.findSellerProfileTx(tx, tenant.businessId),
      );
      const row = await this.repository.upsertSellerProfileTx(tx, tenant.businessId, patch, now);
      const before: Record<string, unknown> = {};
      for (const key of Object.keys(patch) as (keyof SellerProfilePatch &
        keyof SellerProfileView)[]) {
        before[key] = current[key];
      }
      await this.audit.record(tx, {
        actor: { type: 'user', userId: tenant.userId },
        businessId: tenant.businessId,
        action: 'seller_profile.updated',
        targetType: 'business',
        targetId: tenant.businessId,
        before,
        after: patch,
        context,
      });
      return toProfileView(row);
    });
  }

  // --- hizmet bölgeleri ---

  async listServiceAreas(tenant: TenantContext): Promise<string[]> {
    requireSeller(tenant);
    return await withTenantTx(tenant, (tx) =>
      this.repository.listServiceAreaIdsTx(tx, tenant.businessId),
    );
  }

  async replaceServiceAreas(
    tenant: TenantContext,
    regionIds: readonly string[],
    context: AuditRequestContext,
  ): Promise<string[]> {
    requireSeller(tenant);
    const now = this.clock.now();
    const unique = [...new Set(regionIds)];
    return await withTenantTx(tenant, async (tx) => {
      const known = await this.repository.existingRegionIdsTx(tx, unique);
      if (unique.some((id) => !known.has(id))) {
        throw new DomainError('VALIDATION_FAILED', { regionIds: ['not_found'] });
      }
      await this.lockBusiness(tx, tenant.businessId);
      const before = await this.repository.listServiceAreaIdsTx(tx, tenant.businessId);
      await this.repository.replaceServiceAreasTx(tx, tenant.businessId, unique, now);
      const after = await this.repository.listServiceAreaIdsTx(tx, tenant.businessId);
      await this.audit.record(tx, {
        actor: { type: 'user', userId: tenant.userId },
        businessId: tenant.businessId,
        action: 'service_areas.updated',
        targetType: 'business',
        targetId: tenant.businessId,
        before: { regionIds: before },
        after: { regionIds: after },
        context,
      });
      return after;
    });
  }

  private async lockBusiness(tx: Tx, businessId: string): Promise<void> {
    if ((await this.businesses.lockOwnTx(tx, businessId)) === undefined) {
      throw new DomainError('NOT_FOUND');
    }
  }
}
