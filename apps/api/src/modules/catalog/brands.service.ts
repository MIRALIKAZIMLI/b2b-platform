// Marka kuralları (F3.2a, US-029 AC1–AC2; R37, V4, V5). Admin yazmaları çağıranın platform işleminde
// (`*Tx`); toptancı talebi kiracı işleminde `brand_request_create` (DEFINER) ile. Audit aynı işlemde.
import { Inject, Injectable } from '@nestjs/common';
import {
  type AdminBrandsQuery,
  BRAND_SEARCH_LIMIT_DEFAULT,
  type BrandPatch,
  type BrandStatus,
  type BrandsQuery,
} from '@b2b/shared';
import { type AuditRequestContext, AuditService } from '../../core/audit';
import { Clock } from '../../core/clock';
import { type Tx, withTenantTx } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import { IdGenerator } from '../../core/id-generator';
import type { TenantContext } from '../../core/tenant-context';
import { SettingsService } from '../settings';
import { BrandStateMachine } from './brand.state-machine';
import {
  type AdminBrandRow,
  type BrandRow,
  BrandsRepository,
  isBrandNameTaken,
  isBrandRequestLimit,
} from './brands.repository';
import type { CatalogActor } from './categories.service';

/** openapi `BrandOption` (ürün formu listesi). */
export interface BrandOptionView {
  readonly id: string;
  readonly name: string;
}

/** openapi `BrandRequest` (toptancının kendi talebi). */
export interface BrandRequestView {
  readonly id: string;
  readonly name: string;
  readonly status: BrandStatus;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly decidedAt: string | null;
}

/** openapi `AdminBrand`. */
export interface AdminBrandView extends BrandRequestView {
  readonly requestedBy: { readonly businessId: string; readonly legalName: string | null } | null;
}

/** Onay/red sonucu: platform-admin bildirim alıcılarını çözer (K5). */
export interface BrandDecision {
  readonly brandId: string;
  readonly decision: 'approved' | 'rejected';
  readonly businessId: string;
  readonly requestedByUserId: string | null;
}

function invalid(field: string, reason: string): DomainError {
  return new DomainError('VALIDATION_FAILED', { [field]: [reason] });
}

function requestView(row: BrandRow): BrandRequestView {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
  };
}

function adminView(row: AdminBrandRow): AdminBrandView {
  return {
    ...requestView(row),
    requestedBy:
      row.requestedByBusinessId === null
        ? null
        : { businessId: row.requestedByBusinessId, legalName: row.requestedByBusinessName },
  };
}

@Injectable()
export class BrandsService {
  constructor(
    @Inject(BrandsRepository) private readonly repository: BrandsRepository,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(IdGenerator) private readonly ids: IdGenerator,
    @Inject(SettingsService) private readonly settings: SettingsService,
  ) {}

  /** `GET /catalog/brands`: aktif markalar (onay bekleyenler dönmez, V5). */
  async searchTx(tx: Tx, query: BrandsQuery): Promise<BrandOptionView[]> {
    const rows = await this.repository.searchActive(
      tx,
      query.q,
      query.limit ?? BRAND_SEARCH_LIMIT_DEFAULT,
    );
    return rows.map((row) => ({ id: row.id, name: row.name }));
  }

  /** US-029 AC2: toptancının marka talebi; durum her zaman `requested` (R37). */
  async request(
    tenant: TenantContext,
    name: string,
    context: AuditRequestContext,
  ): Promise<BrandRequestView> {
    const limit = await this.settings.get('catalog.brand_request_daily_limit', tenant.businessId);
    const id = this.ids.next();
    const now = this.clock.now();
    try {
      return await withTenantTx(tenant, async (tx) => {
        await this.repository.request(tx, { id, name, userId: tenant.userId, limit, now });
        await this.audit.record(tx, {
          actor: { type: 'user', userId: tenant.userId },
          businessId: tenant.businessId,
          action: 'brand.requested',
          targetType: 'brand',
          targetId: id,
          after: { name: name.trim(), status: 'requested' },
          context,
        });
        const row = await this.repository.find(tx, id);
        if (row === undefined) throw new Error('marka talebi okunamadı');
        return requestView(row);
      });
    } catch (error) {
      if (isBrandNameTaken(error)) throw invalid('name', 'taken');
      if (isBrandRequestLimit(error)) throw new DomainError('RATE_LIMITED', { limit });
      throw error;
    }
  }

  /** `GET /catalog/brand-requests`: toptancının kendi talepleri (onaylanan, reddedilen dahil). */
  async listOwnRequests(tenant: TenantContext): Promise<BrandRequestView[]> {
    return await withTenantTx(tenant, async (tx) =>
      (await this.repository.listRequestedBy(tx, tenant.businessId)).map(requestView),
    );
  }

  async adminListTx(tx: Tx, query: AdminBrandsQuery): Promise<AdminBrandView[]> {
    return (await this.repository.listAdmin(tx, query)).map(adminView);
  }

  /** US-029 AC1: admin markası `active` açılır; ad tekliği K1 (422 `name: [taken]`). */
  async createTx(
    tx: Tx,
    actor: CatalogActor,
    name: string,
    context: AuditRequestContext,
  ): Promise<AdminBrandView> {
    const id = this.ids.next();
    try {
      await this.repository.insertActive(tx, { id, name, now: this.clock.now() });
    } catch (error) {
      if (isBrandNameTaken(error)) throw invalid('name', 'taken');
      throw error;
    }
    await this.audit.record(tx, {
      actor: { type: 'platform', userId: actor.userId },
      businessId: null,
      action: 'brand.created',
      targetType: 'brand',
      targetId: id,
      after: { name, status: 'active' },
      context,
    });
    return await this.adminViewTx(tx, id);
  }

  /**
   * Onay/red (`status`, state-machines §13), ad düzeltme ve aktiflik. Aktiflik yalnız `active`
   * markada değişir (talep ve reddedilen marka zaten listelerde yok); aksi 409.
   */
  async updateTx(
    tx: Tx,
    actor: CatalogActor,
    id: string,
    input: BrandPatch,
    context: AuditRequestContext,
  ): Promise<{ view: AdminBrandView; decision: BrandDecision | null }> {
    const current = await this.repository.lock(tx, id);
    if (current === undefined) throw new DomainError('NOT_FOUND');
    const now = this.clock.now();
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    const patch: {
      name?: string;
      status?: BrandStatus;
      isActive?: boolean;
      decidedAt?: Date;
      decidedByUserId?: string;
    } = {};
    let status = current.status;
    if (input.status !== undefined && input.status !== current.status) {
      BrandStateMachine.assertTransition(current.status, input.status);
      status = input.status;
      before.status = current.status;
      after.status = input.status;
      patch.status = input.status;
      patch.decidedAt = now;
      patch.decidedByUserId = actor.userId;
    }
    if (input.name !== undefined && input.name !== current.name) {
      before.name = current.name;
      after.name = input.name;
      patch.name = input.name;
    }
    if (input.isActive !== undefined && input.isActive !== current.isActive) {
      if (status !== 'active') throw new DomainError('INVALID_STATE_TRANSITION');
      before.isActive = current.isActive;
      after.isActive = input.isActive;
      patch.isActive = input.isActive;
    }
    if (Object.keys(patch).length === 0) {
      return { view: await this.adminViewTx(tx, id), decision: null };
    }
    try {
      await this.repository.update(tx, id, patch, now);
    } catch (error) {
      if (isBrandNameTaken(error)) throw invalid('name', 'taken');
      throw error;
    }
    const action =
      patch.status === 'active'
        ? 'brand.approved'
        : patch.status === 'rejected'
          ? 'brand.rejected'
          : 'brand.updated';
    await this.audit.record(tx, {
      actor: { type: 'platform', userId: actor.userId },
      businessId: null,
      action,
      targetType: 'brand',
      targetId: id,
      before,
      after,
      context,
    });
    const decision: BrandDecision | null =
      patch.status !== undefined && current.requestedByBusinessId !== null
        ? {
            brandId: id,
            decision: patch.status === 'active' ? 'approved' : 'rejected',
            businessId: current.requestedByBusinessId,
            requestedByUserId: current.requestedByUserId,
          }
        : null;
    return { view: await this.adminViewTx(tx, id), decision };
  }

  private async adminViewTx(tx: Tx, id: string): Promise<AdminBrandView> {
    const row = await this.repository.findAdmin(tx, id);
    if (row === undefined) throw new DomainError('NOT_FOUND');
    return adminView(row);
  }
}
