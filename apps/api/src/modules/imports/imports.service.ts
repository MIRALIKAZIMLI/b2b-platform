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
import { withTenantTx } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import { IdGenerator } from '../../core/id-generator';
import { OutboxWriter } from '../../core/outbox';
import type { TenantContext } from '../../core/tenant-context';
import { ProductImportLookup } from '../catalog';
import { FilesService, XLSX_CONTENT_TYPE } from '../files';
import { I18nService } from '../i18n';
import { SettingsService } from '../settings';
import { type ImportJobRow, ImportsRepository, isFileInUse } from './imports.repository';
import { ImportJobStateMachine } from './import-job.state-machine';
import { buildProductTemplate, type Translate } from './workbooks';

/** İstekteki Accept-Language başlığı işe yazılır (rapor dili); uzunluğu sınırlı. */
const LOCALE_MAX = 200;

export function assertSupportedType(type: ImportType): void {
  if (!IMPORT_SUPPORTED_TYPES.includes(type)) {
    throw new DomainError('VALIDATION_FAILED', { type: ['not_supported'] });
  }
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
  ) {}

  /** `GET /imports/template` (US-031 AC1): kullanıcının dilinde şablon, süreli bağlantı. */
  async template(
    tenant: TenantContext,
    query: ImportTemplateQuery,
    acceptLanguage: string | undefined,
  ): Promise<ImportTemplateLink> {
    assertSupportedType(query.type);
    const lang = await this.i18n.language(acceptLanguage);
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

  /** `POST /imports` (US-031 AC2, SF-08): iş `uploaded`; doğrulama worker'da. */
  async create(
    tenant: TenantContext,
    input: ImportCreate,
    acceptLanguage: string | undefined,
  ): Promise<ImportJobView> {
    assertSupportedType(input.type);
    await this.files.readyFile(tenant, input.fileId, 'import');
    const now = this.clock.now();
    try {
      const row = await withTenantTx(tenant, async (tx) => {
        const job = await this.repository.insertTx(tx, {
          id: this.ids.next(),
          sellerId: tenant.businessId,
          type: input.type,
          fileId: input.fileId,
          // Mimar S2: fiyat sütunu yalnız fiyat yazma izni olan üyede uygulanır.
          canWritePrices: tenant.permissions.has('pricing.manage'),
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
    return {
      id: row.id,
      type: row.type,
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
      expiresAt:
        row.status === 'preview_ready'
          ? new Date(row.updatedAt.getTime() + ttlHours * 3_600_000).toISOString()
          : null,
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
