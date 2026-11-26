// Excel içe aktarma (US-031, SF-08; F3.5a). İstemci ve sunucunun paylaştığı türler ve şemalar.
import { z } from 'zod';

/** `import_jobs.type`. F3.5a yalnız `products`; `customer_prices` F3.7, `stock` F3.11a. */
export const IMPORT_TYPES = ['products', 'customer_prices', 'stock'] as const;
export type ImportType = (typeof IMPORT_TYPES)[number];
export const IMPORT_SUPPORTED_TYPES: readonly ImportType[] = ['products'];

/** state-machines §11. */
export const IMPORT_JOB_STATUSES = [
  'uploaded',
  'validating',
  'preview_ready',
  'applying',
  'done',
  'failed',
] as const;
export type ImportJobStatus = (typeof IMPORT_JOB_STATUSES)[number];

/** `failed` işin nedeni (K11). `APPLY_FAILED` F3.5c. */
export const IMPORT_FAILURE_CODES = [
  'FILE_INVALID',
  'IMPORT_TOO_MANY_ROWS',
  'APPLY_FAILED',
] as const;
export type ImportFailureCode = (typeof IMPORT_FAILURE_CODES)[number];

/**
 * Ürün şablonunun sütun anahtarları (US-031 AC1, K20): başlık satırında bu sabit anahtarlar durur,
 * açıklamalar "Təlimat" sayfasında kullanıcının dilinde. Sıra serbest; büyük/küçük harf fark etmez.
 */
export const PRODUCT_IMPORT_COLUMNS = [
  'sku',
  'barcode',
  'name_az',
  'name_ru',
  'name_tr',
  'category',
  'brand',
  'unit',
  'case_qty',
  'price',
  'stock',
] as const;
export type ProductImportColumn = (typeof PRODUCT_IMPORT_COLUMNS)[number];

/** Dosyada bulunması zorunlu başlıklar (yoksa `FILE_INVALID`, K12). */
export const PRODUCT_IMPORT_REQUIRED_COLUMNS: readonly ProductImportColumn[] = [
  'sku',
  'name_az',
  'name_ru',
  'name_tr',
  'category',
  'unit',
];

/** Satır hatası kodları (çeviri anahtarı `imports.row.<kod>`). */
export const IMPORT_ROW_ERROR_CODES = [
  'required',
  'invalid',
  'too_long',
  'duplicate_in_file',
  'archived',
  'variant_ambiguous',
  'not_found',
  'ambiguous',
  'inactive',
  'invalid_gtin',
  'not_positive',
  'not_integer',
  'must_exceed_one',
  'too_many_decimals',
  'negative',
  'cannot_change',
  'no_default_price_list',
] as const;
export type ImportRowErrorCode = (typeof IMPORT_ROW_ERROR_CODES)[number];

/** Satır uyarısı: satır uygulanır, ilgili hücre yok sayılır (Mimar S2). */
export const IMPORT_ROW_WARNING_CODES = ['price_ignored_no_permission'] as const;
export type ImportRowWarningCode = (typeof IMPORT_ROW_WARNING_CODES)[number];

/** Önizleme notları (iş düzeyinde; V3). */
export const IMPORT_NOTES = ['stock_column_ignored'] as const;
export type ImportNote = (typeof IMPORT_NOTES)[number];

/** `GET /imports/{id}` yanıtında dönen en çok hatalı satır; tamamı hata raporunda. */
export const IMPORT_PREVIEW_ERRORS_MAX = 100;

export interface ImportRowIssue {
  readonly column: ProductImportColumn;
  readonly code: ImportRowErrorCode | ImportRowWarningCode;
}

export interface ImportRowProblem {
  /** Excel satır numarası (başlık 1). */
  readonly row: number;
  readonly sku: string | null;
  readonly issues: ImportRowIssue[];
}

export interface ImportJobStats {
  readonly insert: number;
  readonly update: number;
  readonly error: number;
  readonly warning: number;
}

/** openapi `ImportJob`. */
export interface ImportJobView {
  readonly id: string;
  readonly type: ImportType;
  readonly status: ImportJobStatus;
  readonly stats: ImportJobStats;
  readonly notes: ImportNote[];
  /** İlk `IMPORT_PREVIEW_ERRORS_MAX` hatalı/uyarılı satır. */
  readonly problems: ImportRowProblem[];
  readonly failureCode: ImportFailureCode | null;
  readonly appliedUntilRow: number | null;
  readonly errorReportUrl: string | null;
  /** `preview_ready` iş bu andan sonra silinir (SF-08). */
  readonly expiresAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ImportTemplateLink {
  readonly url: string;
  readonly expiresAt: string;
}

export const importCreateSchema = z.strictObject({
  type: z.enum(IMPORT_TYPES),
  fileId: z.uuid(),
});
export type ImportCreate = z.infer<typeof importCreateSchema>;

export const importTemplateQuerySchema = z.strictObject({
  type: z.enum(IMPORT_TYPES),
});
export type ImportTemplateQuery = z.infer<typeof importTemplateQuerySchema>;
