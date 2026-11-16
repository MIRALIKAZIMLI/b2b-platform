// Admin kategori, marka, faaliyet alanı kataloğu (F3.2a, US-029). Platform bağlamı
// (`withPlatformTx`) yalnız bu modülde açılır (c4 §3.7); kurallar ve audit `catalog` servislerinde
// (aynı işlem). Marka kararı bildirimi (K5) outbox'a aynı işlemde yazılır.
import { Inject, Injectable } from '@nestjs/common';
import type {
  ActivityTypeCreate,
  AdminBrandsQuery,
  BrandPatch,
  CatalogEntryPatch,
  CategoryCreate,
} from '@b2b/shared';
import type { AuditRequestContext } from '../../core/audit';
import { withPlatformTx } from '../../core/db';
import { OutboxWriter } from '../../core/outbox';
import { InvitationService } from '../access';
import {
  type ActivityTypeAdminView,
  ActivityTypesAdminService,
  type AdminBrandView,
  BrandsService,
  CategoriesService,
  type CategoryView,
} from '../catalog';
import type { PlatformActor } from './sellers.service';

@Injectable()
export class TaxonomyAdminService {
  constructor(
    @Inject(CategoriesService) private readonly categories: CategoriesService,
    @Inject(BrandsService) private readonly brands: BrandsService,
    @Inject(ActivityTypesAdminService) private readonly activityTypes: ActivityTypesAdminService,
    @Inject(InvitationService) private readonly invitations: InvitationService,
    @Inject(OutboxWriter) private readonly outbox: OutboxWriter,
  ) {}

  async listCategories(actor: PlatformActor): Promise<CategoryView[]> {
    return await withPlatformTx(actor, (tx) => this.categories.listTx(tx, false));
  }

  async createCategory(
    actor: PlatformActor,
    input: CategoryCreate,
    context: AuditRequestContext,
  ): Promise<CategoryView> {
    return await withPlatformTx(actor, (tx) => this.categories.createTx(tx, actor, input, context));
  }

  async updateCategory(
    actor: PlatformActor,
    id: string,
    input: CatalogEntryPatch,
    context: AuditRequestContext,
  ): Promise<CategoryView> {
    return await withPlatformTx(actor, (tx) =>
      this.categories.updateTx(tx, actor, id, input, context),
    );
  }

  async listBrands(actor: PlatformActor, query: AdminBrandsQuery): Promise<AdminBrandView[]> {
    return await withPlatformTx(actor, (tx) => this.brands.adminListTx(tx, query));
  }

  async createBrand(
    actor: PlatformActor,
    name: string,
    context: AuditRequestContext,
  ): Promise<AdminBrandView> {
    return await withPlatformTx(actor, (tx) => this.brands.createTx(tx, actor, name, context));
  }

  /** Onay/red: talebi gönderen (aktif üyeyse) + toptancının aktif adminlerine bildirim (K5). */
  async updateBrand(
    actor: PlatformActor,
    id: string,
    input: BrandPatch,
    context: AuditRequestContext,
  ): Promise<AdminBrandView> {
    return await withPlatformTx(actor, async (tx) => {
      const { view, decision } = await this.brands.updateTx(tx, actor, id, input, context);
      if (decision !== null) {
        const recipients = await this.invitations.requesterAndAdminUserIdsTx(
          tx,
          decision.businessId,
          decision.requestedByUserId,
        );
        for (const userId of recipients) {
          await this.outbox.write(tx, {
            type: 'brand.request_decided',
            aggregateType: 'brand',
            aggregateId: decision.brandId,
            businessIds: [decision.businessId],
            payload: {
              brandId: decision.brandId,
              businessId: decision.businessId,
              userId,
              decision: decision.decision,
            },
          });
        }
      }
      return view;
    });
  }

  async listActivityTypes(actor: PlatformActor): Promise<ActivityTypeAdminView[]> {
    return await withPlatformTx(actor, (tx) => this.activityTypes.listTx(tx));
  }

  async createActivityType(
    actor: PlatformActor,
    input: ActivityTypeCreate,
    context: AuditRequestContext,
  ): Promise<ActivityTypeAdminView> {
    return await withPlatformTx(actor, (tx) =>
      this.activityTypes.createTx(tx, actor, input, context),
    );
  }

  async updateActivityType(
    actor: PlatformActor,
    id: string,
    input: CatalogEntryPatch,
    context: AuditRequestContext,
  ): Promise<ActivityTypeAdminView> {
    return await withPlatformTx(actor, (tx) =>
      this.activityTypes.updateTx(tx, actor, id, input, context),
    );
  }
}
