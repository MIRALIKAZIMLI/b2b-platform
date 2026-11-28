// Excel içe aktarma API'si (F3.5a; US-031 AC1–AC2, SF-08; kart K1–K20). Doğrulama worker'da
// (`ValidateImportJob`); bu servis iş açar, durumu ve önizlemeyi döner, şablon bağlantısı verir.
import { Inject, Injectable } from '@nestjs/common';
import {
  IMPORT_SUPPORTED_TYPES,
  type ImportCreate,
  type ImportJobView,
  type ImportTemplateLink,
  type ImportTemplateQuery,
  type ImportType,
} from '@b2b/shared';
import { Clock } from '../../core/clock';
import { type Tx, withTenantTx } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import { IdGenerator } from '../../core/id-generator';
import { OutboxWriter } from '../../core/outbox';
import type { TenantContext } from '../../core/tenant-context';
import { ProductImportLookup } from '../catalog';
import { StockImport } from '../inventory';
import { CustomerPriceImport } from '../pricing';
import { FilesService, XLSX_CONTENT_TYPE } from '../files';
import { I18nService } from '../i18n';
import { SettingsService } from '../settings';
import { type ImportJobRow, ImportsRepository, isFileInUse } from './imports.repository';
import { ImportJobStateMachine } from './import-job.state-machine';
import { CUSTOMER_PRICE_TEMPLATE_KEYS } from './jobs/customer-price-import';
import { STOCK_TEMPLATE_KEYS } from './jobs/stock-import';
import {
  buildCustomerPriceTemplate,
  buildProductTemplate,
  buildStockTemplate,
  type Translate,
} from './workbooks';

/** İstekteki Accept-Language başlığı işe yazılır (rapor dili); uzunluğu sınırlı. */
const LOCALE_MAX = 200;

export function assertSupportedType(type: ImportType): void {
  if (!IMPORT_SUPPORTED_TYPES.includes(type)) {
    throw new DomainError('VALIDATION_FAILED', { type: ['not_supported'] });
  }
}

/**
 * F3.11c (K2, R36): `stock` işini açma ve onaylama hakkı. `inventory.manage` gerekir; kapsamı
 * `warehouse` olan üye yalnız kendi deposunda.
 */
export function canWriteStock(tenant: TenantContext, warehouseId: string | null): boolean {
  const scope = tenant.permissions.get('inventory.manage');
  if (scope === undefined || warehouseId === null) return false;
  return scope !== 'warehouse' || tenant.warehouseId === warehouseId;
}

/** Çeviri anahtarı → metin; çeviri yoksa anahtar (hata atmaz). */
export async function translator(
  i18n: Pick<I18nService, 'text'>,
  keys: readonly string[],
  locale: string,
): Promise<Translate> {
  const entries = await Promise.all(
    keys.map(async (key) => [key, (await i18n.text(key, locale)) ?? key] as const),
  );
  const map = new Map(entries);
  return (key) => map.get(key) ?? key;
}

@Injectable()
export class ImportsService {
  constructor(
    @Inject(ImportsRepository) private readonly repository: ImportsRepository,
    @Inject(FilesService)
    private readonly files: Pick<FilesService, 'readyFile' | 'getReadUrl' | 'publishTransient'>,
    @Inject(ProductImportLookup) private readonly catalog: ProductImportLookup,
    @Inject(I18nService) private readonly i18n: Pick<I18nService, 'text' | 'language'>,
    @Inject(SettingsService) private readonly settings: Pick<SettingsService, 'get'>,
    @Inject(OutboxWriter) private readonly outbox: Pick<OutboxWriter, 'write'>,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(IdGenerator) private readonly ids: IdGenerator,
    @Inject(CustomerPriceImport)
    private readonly customerPrices: Pick<CustomerPriceImport, 'connectionTx' | 'currentTx'>,
    @Inject(StockImport)
    private readonly stock: Pick<
      StockImport,
      'activeWarehouseTx' | 'templateRowsTx' | 'defaultWarehouseIdTx'
    >,
  ) {}

  /** `GET /imports/template` (US-031 AC1): kullanıcının dilinde şablon, süreli bağlantı. */
  async template(
    tenant: TenantContext,
    query: ImportTemplateQuery,
    acceptLanguage: string | undefined,
  ): Promise<ImportTemplateLink> {
    assertSupportedType(query.type);
    const buyerId = this.assertBuyer(tenant, query.type, query.buyerId);
    const warehouseId = this.assertWarehouse(tenant, query.type, query.warehouseId);
    const lang = await this.i18n.language(acceptLanguage);
    if (warehouseId !== null) return await this.stockTemplate(tenant, warehouseId, lang);
    if (buyerId !== null) {
      return await this.customerPriceTemplate(tenant, buyerId, lang, query.type);
    }
    const { categories, units } = await withTenantTx(tenant, async (tx) => ({
      categories: await this.catalog.categoriesTx(tx),
      units: await this.catalog.unitsTx(tx),
    }));
    const t = await translator(this.i18n, TEMPLATE_KEYS, lang);
    const body = await buildProductTemplate({ lang, t, categories, units });
    return await this.files.publishTransient(tenant.businessId, {
      purpose: 'import',
      name: `template-${query.type.replace('_', '-')}-${lang}`,
      contentType: XLSX_CONTENT_TYPE,
      body,
    });
  }

  /**
   * F3.7a (S2 = A, K9): bir müşteri için dolu şablon: satıcının arşivli olmayan varyantları SKU, ad
   * ve bu perakendecinin bugünkü fiyatıyla; `price` boş. En çok `imports.max_rows` satır.
   */
  private async customerPriceTemplate(
    tenant: TenantContext,
    buyerId: string,
    lang: string,
    type: ImportType,
  ): Promise<ImportTemplateLink> {
    const maxRows = await this.settings.get('imports.max_rows', tenant.businessId);
    const rows = await withTenantTx(tenant, async (tx) => {
      const connection = await this.connectionTx(tx, tenant.businessId, buyerId);
      const variants = await this.catalog.priceTemplateRowsTx(tx, tenant.businessId, maxRows);
      const current = await this.customerPrices.currentTx(tx, {
        sellerId: tenant.businessId,
        buyerId,
        priceListId: connection.priceListId,
        packagingIds: variants.map((row) => row.unitPackagingId),
        now: this.clock.now(),
      });
      return variants.map((row) => ({
        sku: row.sku,
        productName: row.productName,
        currentPrice: current.get(row.unitPackagingId)?.effectivePrice ?? null,
      }));
    });
    const t = await translator(this.i18n, CUSTOMER_PRICE_TEMPLATE_KEYS, lang);
    const body = await buildCustomerPriceTemplate({ lang, t, rows });
    return await this.files.publishTransient(tenant.businessId, {
      purpose: 'import',
      name: `template-${type.replace('_', '-')}-${lang}`,
      contentType: XLSX_CONTENT_TYPE,
      body,
    });
  }

  /**
   * F3.11c (S3 = A, K3): bir depo için dolu şablon: depodaki satılabilir varyantlar SKU, ad, temel
   * birim ve bugünkü miktarla; `stock` boş. En çok `imports.max_rows` satır.
   */
  private async stockTemplate(
    tenant: TenantContext,
    warehouseId: string,
    lang: string,
  ): Promise<ImportTemplateLink> {
    const maxRows = await this.settings.get('imports.max_rows', tenant.businessId);
    const rows = await withTenantTx(tenant, async (tx) => {
      await this.activeWarehouseTx(tx, tenant.businessId, warehouseId);
      return await this.stock.templateRowsTx(tx, tenant.businessId, warehouseId, maxRows);
    });
    const t = await translator(this.i18n, STOCK_TEMPLATE_KEYS, lang);
    const body = await buildStockTemplate({ lang, t, rows });
    return await this.files.publishTransient(tenant.businessId, {
      purpose: 'import',
      name: `template-stock-${lang}`,
      contentType: XLSX_CONTENT_TYPE,
      body,
    });
  }

  /**
   * F3.11c (K1, K2): `stock` türünde `warehouseId` zorunlu ve `inventory.manage` gerekir; kapsamı
   * `warehouse` olan üye başka depoyla 403 (R36). Diğer türlerde `warehouseId` verilemez.
   */
  private assertWarehouse(
    tenant: TenantContext,
    type: ImportType,
    warehouseId: string | undefined,
  ): string | null {
    if (type !== 'stock') {
      if (warehouseId !== undefined) {
        throw new DomainError('VALIDATION_FAILED', { warehouseId: ['not_allowed'] });
      }
      return null;
    }
    if (!tenant.permissions.has('inventory.manage')) throw new DomainError('PERMISSION_DENIED');
    if (warehouseId === undefined) {
      throw new DomainError('VALIDATION_FAILED', { warehouseId: ['required'] });
    }
    if (!canWriteStock(tenant, warehouseId)) throw new DomainError('PERMISSION_DENIED');
    return warehouseId;
  }

  /** Satıcının aktif deposu; değilse (başka satıcının deposu dahil) `422 warehouseId: not_found`. */
  private async activeWarehouseTx(tx: Tx, sellerId: string, warehouseId: string): Promise<void> {
    if (!(await this.stock.activeWarehouseTx(tx, sellerId, warehouseId))) {
      throw new DomainError('VALIDATION_FAILED', { warehouseId: ['not_found'] });
    }
  }

  /**
   * F3.7a: `customer_prices` türünde `buyerId` zorunlu ve `pricing.manage` gerekir (fiyat yazan ve
   * fiyat gösteren tür); diğer türlerde `buyerId` verilemez. Tür `customer_prices` ise alıcı döner.
   */
  private assertBuyer(
    tenant: TenantContext,
    type: ImportType,
    buyerId: string | undefined,
  ): string | null {
    if (type !== 'customer_prices') {
      if (buyerId !== undefined) {
        throw new DomainError('VALIDATION_FAILED', { buyerId: ['not_allowed'] });
      }
      return null;
    }
    if (!tenant.permissions.has('pricing.manage')) throw new DomainError('PERMISSION_DENIED');
    if (buyerId === undefined)
      throw new DomainError('VALIDATION_FAILED', { buyerId: ['required'] });
    return buyerId;
  }

  /** Perakendeciyle aktif bağlantı (R30); yoksa `422 buyerId: not_connected`. */
  private async connectionTx(
    tx: Tx,
    sellerId: string,
    buyerId: string,
  ): Promise<{ readonly priceListId: string | null }> {
    const connection = await this.customerPrices.connectionTx(tx, sellerId, buyerId);
    if (connection === null) {
      throw new DomainError('VALIDATION_FAILED', { buyerId: ['not_connected'] });
    }
    return connection;
  }

  /** `POST /imports` (US-031 AC2, SF-08): iş `uploaded`; doğrulama worker'da. */
  async create(
    tenant: TenantContext,
    input: ImportCreate,
    acceptLanguage: string | undefined,
  ): Promise<ImportJobView> {
    assertSupportedType(input.type);
    const buyerId = this.assertBuyer(tenant, input.type, input.buyerId);
    const warehouseId = this.assertWarehouse(tenant, input.type, input.warehouseId);
    await this.files.readyFile(tenant, input.fileId, 'import');
    const now = this.clock.now();
    try {
      const row = await withTenantTx(tenant, async (tx) => {
        if (buyerId !== null) await this.connectionTx(tx, tenant.businessId, buyerId);
        if (warehouseId !== null) await this.activeWarehouseTx(tx, tenant.businessId, warehouseId);
        const job = await this.repository.insertTx(tx, {
          id: this.ids.next(),
          sellerId: tenant.businessId,
          type: input.type,
          buyerId,
          warehouseId,
          fileId: input.fileId,
          // Mimar S2: fiyat sütunu yalnız fiyat yazma izni olan üyede uygulanır (stok işi fiyat
          // yazmaz).
          canWritePrices: input.type !== 'stock' && tenant.permissions.has('pricing.manage'),
          // F3.11c (V3): ürün şablonunun stok sütunu varsayılan depoya yazılır.
          canWriteStock:
            input.type === 'products' &&
            canWriteStock(tenant, await this.stock.defaultWarehouseIdTx(tx, tenant.businessId)),
          locale: (acceptLanguage ?? '').slice(0, LOCALE_MAX),
          createdBy: tenant.userId,
          now,
        });
        await this.outbox.write(tx, {
          type: 'import.uploaded',
          aggregateType: 'import_job',
          aggregateId: job.id,
          businessIds: [tenant.businessId],
          payload: { jobId: job.id },
        });
        return job;
      });
      return await this.view(tenant, row);
    } catch (error) {
      if (isFileInUse(error)) throw new DomainError('VALIDATION_FAILED', { fileId: ['in_use'] });
      throw error;
    }
  }

  /**
   * `POST /imports/{id}/apply` (US-031 AC3, SF-08; F3.5c K9): yalnız işi açan kişi onaylar
   * (fiyat izni ondan alındı, S1 = A); başkası 403. `preview_ready → applying` koşullu güncelleme
   * ve outbox `import.apply_requested` aynı işlemde; ikinci onay 409. Süresi dolmuş ama henüz
   * silinmemiş önizleme silinmiş sayılır (404).
   */
  async apply(tenant: TenantContext, id: string): Promise<ImportJobView> {
    const ttlHours = await this.settings.get('imports.preview_ttl_hours');
    const row = await withTenantTx(tenant, async (tx) => {
      const job = await this.repository.findTx(tx, tenant.businessId, id, 'update');
      const now = this.clock.now();
      if (job === undefined) throw new DomainError('NOT_FOUND');
      if (
        job.status === 'preview_ready' &&
        job.updatedAt.getTime() + ttlHours * 3_600_000 <= now.getTime()
      ) {
        throw new DomainError('NOT_FOUND');
      }
      if (job.createdBy !== tenant.userId) throw new DomainError('PERMISSION_DENIED');
      // Müfettiş 29 D1: fiyat yazan iş, onay anında da fiyat iznini ister (önizlemeden sonra
      // rolü değişen kullanıcı fiyat yazamaz; iş `preview_ready` kalır).
      if (job.canWritePrices && !tenant.permissions.has('pricing.manage')) {
        throw new DomainError('PERMISSION_DENIED');
      }
      // F3.11c K2: stok işi onay anında da stok iznini ve depo kapsamını ister.
      if (job.type === 'stock' && !canWriteStock(tenant, job.warehouseId)) {
        throw new DomainError('PERMISSION_DENIED');
      }
      if (
        job.canWriteStock &&
        !canWriteStock(tenant, await this.stock.defaultWarehouseIdTx(tx, tenant.businessId))
      ) {
        throw new DomainError('PERMISSION_DENIED');
      }
      ImportJobStateMachine.assertTransition(job.status, 'applying');
      const moved = await this.repository.transitionTx(
        tx,
        job.id,
        'preview_ready',
        { status: 'applying' },
        now,
      );
      if (!moved) throw new DomainError('INVALID_STATE_TRANSITION');
      await this.outbox.write(tx, {
        type: 'import.apply_requested',
        aggregateType: 'import_job',
        aggregateId: job.id,
        businessIds: [tenant.businessId],
        payload: { jobId: job.id },
      });
      return { ...job, status: 'applying' as const, updatedAt: now };
    });
    return await this.view(tenant, row);
  }

  /** `GET /imports/{id}`: durum, sayılar, ilk sorunlu satırlar, rapor bağlantısı. */
  async get(tenant: TenantContext, id: string): Promise<ImportJobView> {
    const row = await withTenantTx(tenant, (tx) =>
      this.repository.findTx(tx, tenant.businessId, id),
    );
    if (row === undefined) throw new DomainError('NOT_FOUND');
    return await this.view(tenant, row);
  }

  private async view(tenant: TenantContext, row: ImportJobRow): Promise<ImportJobView> {
    const ttlHours = await this.settings.get('imports.preview_ttl_hours');
    const { insert, update, error, warning, notes, problems } = row.stats;
    const expiresAt =
      row.status === 'preview_ready' ? row.updatedAt.getTime() + ttlHours * 3_600_000 : null;
    return {
      id: row.id,
      type: row.type,
      buyerId: row.buyerId,
      warehouseId: row.warehouseId,
      status: row.status,
      stats: { insert, update, error, warning },
      notes,
      problems,
      failureCode: row.failureCode,
      appliedUntilRow: row.appliedUntilRow,
      errorReportUrl:
        row.errorReportFileId === null
          ? null
          : await this.files.getReadUrl(tenant, row.errorReportFileId),
      resultReportUrl:
        row.resultReportFileId === null
          ? null
          : await this.files.getReadUrl(tenant, row.resultReportFileId),
      expiresAt: expiresAt === null ? null : new Date(expiresAt).toISOString(),
      // #85 notu: `apply` ile aynı kurallar (işi açan, fiyat izni, süre dolmamış).
      canApply:
        expiresAt !== null &&
        expiresAt > this.clock.now().getTime() &&
        row.createdBy === tenant.userId &&
        (!row.canWritePrices || tenant.permissions.has('pricing.manage')) &&
        (row.type !== 'stock' || canWriteStock(tenant, row.warehouseId)) &&
        (!row.canWriteStock || tenant.permissions.has('inventory.manage')),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

/** Şablonun çeviri anahtarları (i18n/seed/import-messages.ts). */
export const TEMPLATE_KEYS: readonly string[] = [
  'imports.sheet.products',
  'imports.sheet.instructions',
  'imports.sheet.categories',
  'imports.sheet.units',
  'imports.template.intro',
  'imports.template.column',
  'imports.template.description',
  'imports.template.required',
  'imports.template.required_new',
  'imports.template.required_always',
  'imports.template.optional',
  'imports.template.category_name',
  'imports.template.category_path',
  'imports.template.unit_code',
  'imports.template.unit_name',
  'imports.template.unit_abbreviation',
  'imports.column.sku',
  'imports.column.barcode',
  'imports.column.name_az',
  'imports.column.name_ru',
  'imports.column.name_tr',
  'imports.column.category',
  'imports.column.brand',
  'imports.column.unit',
  'imports.column.case_qty',
  'imports.column.price',
  'imports.column.stock',
];
