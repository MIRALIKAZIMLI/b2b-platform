// Perakendeci dizini araması (F2.11b; US-019 AC1–AC6, US-020 AC1–AC2, US-007 AC2, AC4, AC6).
// Akış: hız sınırı → kapsam (hizmet bölgeleri / temsilci bölgeleri) → kimlikler (Meilisearch
// veya tam eşleşme D fonksiyonu) → kart D fonksiyonundan taze alanlar → bayat indekse karşı
// süzme. Kart fonksiyonuna istemciden gelen kimlik hiç gitmez (Müfettiş 15 L1).
import { Inject, Injectable } from '@nestjs/common';
import {
  DIRECTORY_PAGE_MAX,
  type DirectoryBuyer,
  type DirectoryEmptyReason,
  type DirectoryRelation,
  type DirectorySearchQuery,
  type DirectorySearchResult,
} from '@b2b/shared';
import { Clock } from '../../core/clock';
import { type Tx, withTenantTx } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import { IdGenerator } from '../../core/id-generator';
import { BuyerDirectoryIndex, inRegionGroups } from '../../core/ports/buyer-directory-index';
import type { TenantContext } from '../../core/tenant-context';
import { SellerSetupRepository } from '../businesses';
import { ConnectionRelationsService } from '../connections';
import { FilesService } from '../files';
import { SettingsService } from '../settings';
import { DirectoryRateLimiter } from './directory-rate-limiter';
import { type DirectoryCardRow, DirectoryRepository } from './directory.repository';

/** İlişkisi okunamayan (artık istek alamayan) perakendeci. */
const NO_REQUEST: DirectoryRelation = { status: 'none', cooldownUntil: null, canRequest: false };

/**
 * `history` süzgeci (F2.12a): ilişki satıcının bağlantı verisinden geldiği için sayfa içinde
 * uygulanır; sayfa `limit`'ten kısa dönebilir, `nextCursor` indeks sırasına göredir.
 */
function matchesHistory(
  relation: DirectoryRelation,
  history: DirectorySearchQuery['history'],
): boolean {
  switch (history) {
    case undefined:
      return true;
    case 'never':
      return relation.status === 'none';
    case 'cooldown_over':
      return (
        (relation.status === 'rejected' || relation.status === 'cancelled') && relation.canRequest
      );
    default:
      return relation.status === history;
  }
}

interface Scope {
  /** Temsilci (`assigned`) ise atandığı bölgeler; aksi `undefined` (kısıt yok). */
  readonly assigned: readonly string[] | undefined;
}

@Injectable()
export class DirectorySearchService {
  constructor(
    @Inject(DirectoryRepository) private readonly repository: DirectoryRepository,
    @Inject(SellerSetupRepository) private readonly sellerSetup: SellerSetupRepository,
    @Inject(BuyerDirectoryIndex) private readonly index: BuyerDirectoryIndex,
    @Inject(FilesService) private readonly files: FilesService,
    @Inject(DirectoryRateLimiter) private readonly limiter: DirectoryRateLimiter,
    @Inject(SettingsService) private readonly settings: SettingsService,
    @Inject(IdGenerator) private readonly ids: IdGenerator,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(ConnectionRelationsService) private readonly relations: ConnectionRelationsService,
  ) {}

  async search(tenant: TenantContext, query: DirectorySearchQuery): Promise<DirectorySearchResult> {
    await this.reserve(tenant);
    const rows = await withTenantTx(tenant, async (tx) => {
      const scope = await this.scopeTx(tx, tenant);
      if (query.phone !== undefined || query.voen !== undefined) {
        return { cards: await this.exactTx(tx, query, scope), nextCursor: null, emptyReason: null };
      }
      return await this.filteredTx(tx, tenant, query, scope);
    });
    const relations = await this.relations.forSeller(
      tenant,
      rows.cards.map((card) => card.id),
    );
    const cards = rows.cards
      .map((card) => ({ card, relation: relations.get(card.id) ?? NO_REQUEST }))
      .filter((entry) => matchesHistory(entry.relation, query.history));
    const items = await Promise.all(
      cards.map((entry) => this.toBuyer(entry.card, entry.relation, tenant)),
    );
    return { items, nextCursor: rows.nextCursor, emptyReason: rows.emptyReason };
  }

  /** US-019 AC5: kullanıcı başına dakikada en fazla `directory.search_max_per_minute`. */
  private async reserve(tenant: TenantContext): Promise<void> {
    const maxPerMinute = await this.settings.get(
      'directory.search_max_per_minute',
      tenant.businessId,
    );
    const decision = await this.limiter.reserve({
      userId: tenant.userId,
      nowMs: this.clock.now().getTime(),
      maxPerMinute,
      member: this.ids.next(),
    });
    if (!decision.allowed) {
      throw new DomainError('RATE_LIMITED', { retryAfter: decision.retryAfterSeconds });
    }
  }

  /** US-019 AC3: `assigned` kapsamlı üye yalnız atandığı bölgeleri görür. */
  private async scopeTx(tx: Tx, tenant: TenantContext): Promise<Scope> {
    if (tenant.permissions.get('directory.search') !== 'assigned') return { assigned: undefined };
    return { assigned: await this.repository.memberRegionIdsTx(tx, tenant.membershipId) };
  }

  /**
   * US-020: tam telefon / VÖEN; dizinde görünme kapalı olsa da bulunur (US-007 AC4). Temsilci
   * yalnız kendi bölgesindekini bulur (Mimar K3, kullanıcı değiştirebilir varsayım).
   */
  private async exactTx(
    tx: Tx,
    query: DirectorySearchQuery,
    scope: Scope,
  ): Promise<DirectoryCardRow[]> {
    const ids = await this.repository.exactMatchTx(
      tx,
      query.phone !== undefined ? { phone: query.phone } : { voen: query.voen ?? '' },
    );
    // Kart fonksiyonu çağrı başına ≤20 kimlik alır (22023); eşleşme sayısına güvenilmez,
    // kimlikler parçalanır, bölge süzmesinden sonra yanıt tek sayfayla sınırlanır.
    const cards: DirectoryCardRow[] = [];
    for (let start = 0; start < ids.length; start += DIRECTORY_PAGE_MAX) {
      cards.push(
        ...(await this.repository.cardsTx(tx, ids.slice(start, start + DIRECTORY_PAGE_MAX))),
      );
    }
    const visible =
      scope.assigned === undefined
        ? cards
        : cards.filter((card) => inRegionGroups(card, [scope.assigned ?? []]));
    return visible.slice(0, DIRECTORY_PAGE_MAX);
  }

  /** US-019 AC1–AC2, AC6: filtreli arama; kimlik indeksten, alanlar DB'den. */
  private async filteredTx(
    tx: Tx,
    tenant: TenantContext,
    query: DirectorySearchQuery,
    scope: Scope,
  ): Promise<{
    cards: DirectoryCardRow[];
    nextCursor: string | null;
    emptyReason: DirectoryEmptyReason | null;
  }> {
    const empty = (emptyReason: DirectoryEmptyReason | null) => ({
      cards: [],
      nextCursor: null,
      emptyReason,
    });
    const groups: string[][] = [];
    if (scope.assigned !== undefined) {
      if (scope.assigned.length === 0) return empty('no_assigned_regions');
      groups.push([...scope.assigned]);
    }
    if (query.regionId !== undefined) {
      groups.push([...query.regionId]);
    } else if (scope.assigned === undefined) {
      // US-019 AC2: filtre yoksa yalnız hizmet bölgeleri.
      const areas = await this.sellerSetup.listServiceAreaIdsTx(tx, tenant.businessId);
      if (areas.length === 0) return empty('no_service_areas');
      groups.push(areas);
    }

    const offset = query.cursor === undefined ? 0 : Number(query.cursor);
    const hits = await this.index.search({
      q: query.q,
      regionGroups: groups,
      activityTypeId: query.activityTypeId,
      verified: query.verified,
      offset,
      limit: query.limit,
    });
    const fresh = new Map(
      (await this.repository.cardsTx(tx, hits.ids)).map((card) => [card.id, card]),
    );
    // İndeks bayat olabilir: gizlenen, askıya alınan veya filtreden çıkan kayıt dönmez.
    const cards = hits.ids
      .map((id) => fresh.get(id))
      .filter(
        (card): card is DirectoryCardRow =>
          card !== undefined &&
          card.listedInDirectory &&
          inRegionGroups(card, groups) &&
          (query.activityTypeId === undefined || card.activityTypeId === query.activityTypeId) &&
          (query.verified === undefined || card.verified === query.verified),
      );
    return {
      cards,
      nextCursor: hits.hasMore ? String(offset + query.limit) : null,
      emptyReason: null,
    };
  }

  private async toBuyer(
    card: DirectoryCardRow,
    relation: DirectoryRelation,
    tenant: TenantContext,
  ): Promise<DirectoryBuyer> {
    return {
      id: card.id,
      legalName: card.legalName,
      activityTypeId: card.activityTypeId,
      activityType: card.activityTypeName,
      regionId: card.regionId,
      cityId: card.cityId,
      region: card.regionName,
      verified: card.verified,
      logoUrl:
        card.logo === null ? null : await this.files.objectReadUrl(card.logo, tenant.businessId),
      addressLine: card.addressLine,
      businessPhone: card.businessPhone,
      voen: card.voen,
      contactName: card.contactName,
      personalPhone: card.personalPhone,
      email: card.email,
      relation,
    };
  }
}
