import { Injectable } from '@nestjs/common';
import { DEFAULT_PRIVACY, type PrivacySettings } from '@b2b/shared';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import {
  type PlatformTxContext,
  type TenantTxContext,
  type Tx,
  withPlatformTx,
  withTenantTx,
} from '../../core/db';
import {
  activityTypes,
  branches,
  businessCapabilities,
  businesses,
  businessPrivacy,
  buyerProfiles,
  type Capability,
  type CapabilityStatus,
  personData,
  sellerProfiles,
  serviceAreas,
} from './businesses.schema';
import { regions } from '../i18n';

export type BusinessRow = typeof businesses.$inferSelect;

/** Admin açılışında yazılan toptancı (F2.1a). Kimlik ve zaman çağırandan. */
export interface NewSellerBusiness {
  readonly id: string;
  readonly legalName: string;
  readonly voen: string;
  readonly legalType: 'legal_entity' | 'individual_entrepreneur';
  readonly regionId: string;
  readonly addressLine: string | null;
  readonly defaultLanguage: string | null;
  readonly currencyCode: string;
  readonly timezone: string;
  readonly serviceAreaRegionIds: readonly string[];
  /** Yeteneği onaylayan platform kullanıcısı. */
  readonly approvedBy: string;
  readonly now: Date;
}

/**
 * Kendi kaydolan perakendeci (F2.3a, US-005 AC1, SF-02). Kiracı bağlamında yazılır:
 * `businesses_guard_platform_columns` ve `business_capabilities_tenant_insert` yalnızca
 * `self_signup` + `active` işletmeye ve `buyer` + `approved` yeteneğe izin verir (F1.7).
 */
export interface NewBuyerBusiness {
  readonly id: string;
  readonly legalName: string;
  readonly regionId: string;
  readonly activityTypeId: string;
  readonly defaultLanguage: string | null;
  readonly currencyCode: string;
  readonly timezone: string;
  readonly contactName: string;
  readonly dataConsentVersion: string;
  readonly profileCompleteness: number;
  readonly branchId: string;
  readonly branchName: string;
  readonly personDataId: string;
  readonly now: Date;
}

/** `PATCH /api/v1/business` ile değişen `businesses` alanları (F2.4, K1). Yalnız verilenler yazılır. */
export interface OwnProfilePatch {
  readonly voen?: string | undefined;
  readonly legalName?: string | undefined;
  readonly regionId?: string | undefined;
  readonly addressLine?: string | undefined;
  readonly businessPhone?: string | undefined;
}

export interface ActivityTypeItem {
  readonly id: string;
  readonly name: unknown;
  readonly sortOrder: number;
}

export interface SellerListItem {
  readonly id: string;
  readonly legalName: string;
  readonly voen: string | null;
  readonly regionId: string;
  readonly status: string;
  readonly defaultLanguage: string | null;
  readonly createdAt: Date;
}

/** businesses_voen_uq ihlali (eşzamanlı aynı VÖEN; R12/K4). */
export function isVoenUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth++) {
    if (
      'code' in current &&
      current.code === '23505' &&
      'constraint' in current &&
      current.constraint === 'businesses_voen_uq'
    ) {
      return true;
    }
    current = 'cause' in current ? current.cause : undefined;
  }
  return false;
}

export interface CapabilityRow {
  readonly capability: Capability;
  readonly status: CapabilityStatus;
}

/**
 * İşletme çekirdek tablolarına erişim (F1.7). Sorgular kiracı filtresini açıkça yazar; RLS son
 * savunma hattıdır (ADR-0003 §5). HTTP uç noktaları F2'de (işletme açma F2.1, kayıt F2.3).
 */
@Injectable()
export class BusinessesRepository {
  /** Bağlamdaki işletmenin kendi kaydı; yoksa undefined. */
  async findOwn(ctx: TenantTxContext): Promise<BusinessRow | undefined> {
    const rows = await withTenantTx(ctx, (tx) =>
      tx.select().from(businesses).where(eq(businesses.id, ctx.businessId)),
    );
    return rows[0];
  }

  /** Bağlamdaki işletmenin yetenekleri (yetki kontrolü yeteneğe göre, ADR-0004). */
  async listCapabilities(ctx: TenantTxContext): Promise<CapabilityRow[]> {
    const rows = await withTenantTx(ctx, (tx) =>
      tx
        .select({
          capability: businessCapabilities.capability,
          status: businessCapabilities.status,
        })
        .from(businessCapabilities)
        .where(eq(businessCapabilities.businessId, ctx.businessId)),
    );
    return rows as CapabilityRow[];
  }

  /**
   * Yeteneği onaylar (yalnızca platform bağlamı; K1, state-machines §10). Satır yoksa false.
   * `approvedAt` çağıran servisin Clock'undan gelir.
   */
  async approveCapability(
    ctx: PlatformTxContext,
    businessId: string,
    capability: Capability,
    approvedAt: Date,
  ): Promise<boolean> {
    const rows = await withPlatformTx(ctx, (tx) =>
      tx
        .update(businessCapabilities)
        .set({ status: 'approved', approvedBy: ctx.userId, approvedAt, updatedAt: approvedAt })
        .where(
          and(
            eq(businessCapabilities.businessId, businessId),
            eq(businessCapabilities.capability, capability),
          ),
        )
        .returning({ businessId: businessCapabilities.businessId }),
    );
    return rows.length === 1;
  }

  // --- F2.4: profil düzenleme, çağıranın kiracı işlemi içinde ---

  /** Bağlamdaki işletmenin satırı, işlem sonuna kadar kilitli (eşzamanlı PATCH sırayla). */
  async lockOwnTx(tx: Tx, businessId: string): Promise<BusinessRow | undefined> {
    const rows = await tx
      .select()
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .for('update');
    return rows[0];
  }

  /**
   * Profil alanlarını yazar; dönen satır tetikleyiciden sonraki hâldir: `legal_type` VÖEN'den
   * türetilir, VÖEN değiştiyse `verified_at/by` null olur (0016, R20). VÖEN başka işletmedeyse
   * `businesses_voen_uq` 23505 verir (`isVoenUniqueViolation`).
   */
  async updateOwnTx(
    tx: Tx,
    businessId: string,
    patch: OwnProfilePatch,
    profileCompleteness: number,
    now: Date,
  ): Promise<BusinessRow | undefined> {
    const rows = await tx
      .update(businesses)
      .set({ ...patch, profileCompleteness, updatedAt: now })
      .where(eq(businesses.id, businessId))
      .returning();
    return rows[0];
  }

  /** Doluluk için `businesses` dışındaki alanlar: faaliyet türü, yetkili adı, e-posta, şube adresi. */
  async profileExtrasTx(
    tx: Tx,
    businessId: string,
  ): Promise<{
    activityType: boolean;
    contactName: boolean;
    email: boolean;
    branchAddress: boolean;
  }> {
    const result = await tx.execute<{
      activity_type: boolean;
      contact_name: boolean;
      email: boolean;
      branch_address: boolean;
    }>(sql`
      select
        exists (select 1 from ${buyerProfiles}
                 where ${buyerProfiles.businessId} = ${businessId}
                   and ${buyerProfiles.activityTypeId} is not null) as activity_type,
        exists (select 1 from ${personData}
                 where ${personData.businessId} = ${businessId}
                   and ${personData.contactName} <> '') as contact_name,
        exists (select 1 from ${personData}
                 where ${personData.businessId} = ${businessId}
                   and ${personData.email} is not null) as email,
        exists (select 1 from ${branches}
                 where ${branches.businessId} = ${businessId}
                   and ${branches.addressLine} is not null) as branch_address`);
    const row = result.rows[0];
    return {
      activityType: row?.activity_type === true,
      contactName: row?.contact_name === true,
      email: row?.email === true,
      branchAddress: row?.branch_address === true,
    };
  }

  // --- F2.10: görünürlük ayarları (US-007), çağıranın kiracı işlemi içinde ---

  /**
   * Perakendecinin ayarları; `buyer_profiles` satırı yoksa `undefined`. `business_privacy`
   * satırı yoksa (kayıt her zaman açar; eski veri) ek alanlar varsayılan kapalı döner. `lock`
   * ile satırlar işlem sonuna kadar kilitli (eşzamanlı PUT sırayla, audit "önce" değeri doğru).
   */
  async privacyTx(tx: Tx, businessId: string, lock: boolean): Promise<PrivacySettings | undefined> {
    const profileQuery = tx
      .select({ listedInDirectory: buyerProfiles.listedInDirectory })
      .from(buyerProfiles)
      .where(eq(buyerProfiles.businessId, businessId));
    const profile = lock ? await profileQuery.for('update') : await profileQuery;
    const listed = profile[0];
    if (listed === undefined) return undefined;
    const rows = await tx
      .select({
        showLogo: businessPrivacy.showLogo,
        showAddress: businessPrivacy.showAddress,
        showBusinessPhone: businessPrivacy.showBusinessPhone,
        showVoen: businessPrivacy.showVoen,
        showContactName: businessPrivacy.showContactName,
        showPersonalContact: businessPrivacy.showPersonalContact,
      })
      .from(businessPrivacy)
      .where(eq(businessPrivacy.businessId, businessId));
    // buyer_profiles kilidi aynı işletmenin eşzamanlı PUT'larını zaten sıraya koyar.
    return { ...DEFAULT_PRIVACY, ...rows[0], listedInDirectory: listed.listedInDirectory };
  }

  /** Ayarları yazar: `buyer_profiles.listed_in_directory` + `business_privacy` (yoksa ekler). */
  async writePrivacyTx(
    tx: Tx,
    businessId: string,
    settings: PrivacySettings,
    now: Date,
  ): Promise<void> {
    const { listedInDirectory, ...fields } = settings;
    await tx
      .update(buyerProfiles)
      .set({ listedInDirectory, updatedAt: now })
      .where(eq(buyerProfiles.businessId, businessId));
    await tx
      .insert(businessPrivacy)
      .values({ businessId, ...fields, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: businessPrivacy.businessId,
        set: { ...fields, updatedAt: now },
      });
  }

  /** Bölge var mı (G tablosu; herkes okur). */
  async regionExistsTx(tx: Tx, regionId: string): Promise<boolean> {
    const rows = await tx.select({ id: regions.id }).from(regions).where(eq(regions.id, regionId));
    return rows.length === 1;
  }

  // --- F2.1a: çağıranın işlemi içinde (platform-admin tek withPlatformTx, R15) ---

  /** Bu VÖEN herhangi bir işletmede kayıtlı mı (yetenekten bağımsız; S7 = A). */
  async voenTakenTx(tx: Tx, voen: string): Promise<boolean> {
    const rows = await tx
      .select({ id: businesses.id })
      .from(businesses)
      .where(eq(businesses.voen, voen));
    return rows.length > 0;
  }

  /**
   * İşletme (`created_via = admin`, `active`), `seller` yeteneği (`approved`), varsayılan satıcı
   * profili ve hizmet bölgeleri. Başlangıç durumları state-machines §9 ve §10 ile aynı.
   */
  async insertSellerTx(tx: Tx, input: NewSellerBusiness): Promise<void> {
    await tx.insert(businesses).values({
      id: input.id,
      legalName: input.legalName,
      voen: input.voen,
      legalType: input.legalType,
      regionId: input.regionId,
      addressLine: input.addressLine,
      defaultLanguage: input.defaultLanguage,
      currencyCode: input.currencyCode,
      timezone: input.timezone,
      status: 'active',
      createdVia: 'admin',
      createdAt: input.now,
      updatedAt: input.now,
    });
    await tx.insert(businessCapabilities).values({
      businessId: input.id,
      capability: 'seller',
      status: 'approved',
      approvedBy: input.approvedBy,
      approvedAt: input.now,
      createdAt: input.now,
      updatedAt: input.now,
    });
    await tx
      .insert(sellerProfiles)
      .values({ businessId: input.id, createdAt: input.now, updatedAt: input.now });
    if (input.serviceAreaRegionIds.length > 0) {
      await tx.insert(serviceAreas).values(
        input.serviceAreaRegionIds.map((regionId) => ({
          sellerId: input.id,
          regionId,
          createdAt: input.now,
        })),
      );
    }
  }

  /** F2.3a: işletme, `buyer` yeteneği, profil, gizlilik (hepsi kapalı), kişisel veri, varsayılan şube. */
  async insertBuyerTx(tx: Tx, input: NewBuyerBusiness): Promise<void> {
    const stamps = { createdAt: input.now, updatedAt: input.now };
    await tx.insert(businesses).values({
      id: input.id,
      legalName: input.legalName,
      regionId: input.regionId,
      defaultLanguage: input.defaultLanguage,
      currencyCode: input.currencyCode,
      timezone: input.timezone,
      status: 'active',
      createdVia: 'self_signup',
      dataConsentVersion: input.dataConsentVersion,
      dataConsentAt: input.now,
      profileCompleteness: input.profileCompleteness,
      ...stamps,
    });
    await tx
      .insert(businessCapabilities)
      .values({ businessId: input.id, capability: 'buyer', status: 'approved', ...stamps });
    await tx
      .insert(buyerProfiles)
      .values({ businessId: input.id, activityTypeId: input.activityTypeId, ...stamps });
    await tx.insert(businessPrivacy).values({ businessId: input.id, ...stamps });
    await tx.insert(personData).values({
      id: input.personDataId,
      businessId: input.id,
      contactName: input.contactName,
      ...stamps,
    });
    await tx.insert(branches).values({
      id: input.branchId,
      businessId: input.id,
      name: input.branchName,
      regionId: input.regionId,
      approvalRule: 'every_order',
      status: 'active',
      ...stamps,
    });
  }

  /** Aktif faaliyet türü mü (G tablosu; herkes okur). */
  async isActiveActivityTypeTx(tx: Tx, id: string): Promise<boolean> {
    const rows = await tx
      .select({ id: activityTypes.id })
      .from(activityTypes)
      .where(and(eq(activityTypes.id, id), eq(activityTypes.isActive, true)));
    return rows.length === 1;
  }

  /** Aktif faaliyet türleri, sıra numarasına göre (GET /catalog/activity-types). */
  async listActiveActivityTypesTx(tx: Tx): Promise<ActivityTypeItem[]> {
    return await tx
      .select({
        id: activityTypes.id,
        name: activityTypes.name,
        sortOrder: activityTypes.sortOrder,
      })
      .from(activityTypes)
      .where(eq(activityTypes.isActive, true))
      .orderBy(asc(activityTypes.sortOrder), asc(activityTypes.id));
  }

  /** `seller` yeteneği olan işletme; yoksa undefined. */
  async findSellerTx(tx: Tx, businessId: string): Promise<SellerListItem | undefined> {
    const rows = await this.sellerQuery(tx).where(eq(businesses.id, businessId));
    return rows[0];
  }

  /** Toptancılar, yeniden eskiye (created_at, id). İmleç son öğenin kimliği. */
  async listSellersTx(
    tx: Tx,
    afterId: string | undefined,
    limit: number,
  ): Promise<SellerListItem[]> {
    const after =
      afterId === undefined
        ? undefined
        : sql`(${businesses.createdAt}, ${businesses.id}) <
              (select b.created_at, b.id from businesses b where b.id = ${afterId})`;
    return await this.sellerQuery(tx)
      .where(after)
      .orderBy(desc(businesses.createdAt), desc(businesses.id))
      .limit(limit);
  }

  private sellerQuery(tx: Tx) {
    return tx
      .select({
        id: businesses.id,
        legalName: businesses.legalName,
        voen: businesses.voen,
        regionId: businesses.regionId,
        status: businesses.status,
        defaultLanguage: businesses.defaultLanguage,
        createdAt: businesses.createdAt,
      })
      .from(businesses)
      .innerJoin(
        businessCapabilities,
        and(
          eq(businessCapabilities.businessId, businesses.id),
          eq(businessCapabilities.capability, 'seller'),
        ),
      )
      .$dynamic();
  }
}
