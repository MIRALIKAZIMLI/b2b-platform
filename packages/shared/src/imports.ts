// Excel içe aktarma (US-031, SF-08; F3.5a). İstemci ve sunucunun paylaştığı türler ve şemalar.
import { z } from 'zod';

/** `import_jobs.type`. F3.5a `products`; F3.7a `customer_prices`; F3.11c `stock`. */
export const IMPORT_TYPES = ['products', 'customer_prices', 'stock'] as const;
export type ImportType = (typeof IMPORT_TYPES)[number];
export const IMPORT_SUPPORTED_TYPES: readonly ImportType[] = [
  'products',
  'customer_prices',
  'stock',
];

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

/**
 * `failed` işin nedeni (K11). F3.5c: `APPLY_FAILED` uygulama partisi beklenmedik hatayla durdu;
 * `TIMED_OUT` iş `imports.stuck_after_minutes` boyunca ilerlemedi (süpürücü, F3.5c K10).
 */
export const IMPORT_FAILURE_CODES = [
  'FILE_INVALID',
  'IMPORT_TOO_MANY_ROWS',
  'APPLY_FAILED',
  'TIMED_OUT',
  // F3.7a: `customer_prices` işinin perakendecisiyle bağlantı uygulama sırasında bitti.
  'CONNECTION_INACTIVE',
  // F3.11c: `stock` işinin deposu uygulama sırasında pasifleşti.
  'WAREHOUSE_INACTIVE',
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

/**
 * Müşteri fiyatı şablonunun sütunları (F3.7a, S2 = A). Yalnız `sku` ve `price` okunur; `name` ve
 * `current_price` şablonda bilgi içindir (okuyucu tanımadığı başlığı yok sayar).
 */
export const CUSTOMER_PRICE_IMPORT_COLUMNS = [
  'sku',
  'price',
] as const satisfies readonly ProductImportColumn[];
export const CUSTOMER_PRICE_TEMPLATE_COLUMNS = ['sku', 'name', 'current_price', 'price'] as const;

/**
 * Stok sayımı şablonunun okunan sütunları (F3.11c, S3 = A bir dosya bir depo). `stock` = rafta
 * sayılan toplam (S1 = A); `current_stock` = şablon indiğindeki sistem miktarı (S2 = B: bugünkü
 * stoktan farklıysa satır uygulanmaz). `name`, `base_unit` şablonda bilgi içindir.
 */
export const STOCK_IMPORT_COLUMNS = ['sku', 'current_stock', 'stock'] as const;
export const STOCK_TEMPLATE_COLUMNS = [
  'sku',
  'name',
  'base_unit',
  'current_stock',
  'stock',
] as const;

/** Okuyucunun tanıdığı bütün sütunlar (satır sorunu hangi sütunda). */
export type ImportColumn = ProductImportColumn | (typeof STOCK_IMPORT_COLUMNS)[number];

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
  // F3.5c: güncellemede koli içi adet var olan ambalajlarla uyuşmuyor (F3.3a K4); fiyat yazılacak
  // varyantın `unit` ambalajı yok (Mimar S3); SKU yazım anında başka ürüne geçmiş (23505, K6).
  'packaging_conflict',
  'no_unit_packaging',
  'taken',
  // F3.11c: sayılan < rezerve (elle sayımdaki STOCK_INSUFFICIENT ile aynı kural); şablon indikten
  // sonra stok değişti (S2 = B, `current_stock` ≠ bugünkü stok).
  'below_reserved',
  'stock_changed',
  // F3.11c (V3): miktarlı modda ürün şablonunun stok sütunu, aktif varsayılan depo yok.
  'no_default_warehouse',
] as const;
export type ImportRowErrorCode = (typeof IMPORT_ROW_ERROR_CODES)[number];

/** Satır uyarısı: satır uygulanır, ilgili hücre yok sayılır (Mimar S2). */
export const IMPORT_ROW_WARNING_CODES = [
  'price_ignored_no_permission',
  // F3.7a: müşteri fiyatı bugünkü müşteri fiyatıyla aynı; satır yazılmaz.
  'price_unchanged',
  // F3.11c: sayılan bugünkü stokla aynı; hareket yazılmaz.
  'stock_unchanged',
  // F3.11c (V3): ürün şablonunda stok sütunu var, işi açanın stok yazma hakkı yok; sütun yok sayılır.
  'stock_ignored_no_permission',
] as const;
export type ImportRowWarningCode = (typeof IMPORT_ROW_WARNING_CODES)[number];

/** Önizleme notları (iş düzeyinde). F3.11c (V3): `stock_column_ignored` yalnız `none` stok modunda. */
export const IMPORT_NOTES = ['stock_column_ignored'] as const;
export type ImportNote = (typeof IMPORT_NOTES)[number];

export interface ImportRowIssue {
  readonly column: ImportColumn;
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
  /** F3.7a: `customer_prices` işinin perakendecisi. */
  readonly buyerId: string | null;
  /** F3.11c: `stock` işinin deposu. */
  readonly warehouseId: string | null;
  readonly status: ImportJobStatus;
  readonly stats: ImportJobStats;
  readonly notes: ImportNote[];
  /** İlk `imports.preview_problems_max` hatalı/uyarılı satır (F3.5c: ayar). */
  readonly problems: ImportRowProblem[];
  readonly failureCode: ImportFailureCode | null;
  readonly appliedUntilRow: number | null;
  /** Önizleme hata/uyarı raporu. */
  readonly errorReportUrl: string | null;
  /** F3.5c (US-031 AC3): `done` işin sonuç raporu (her satır: eklendi / güncellendi / hata). */
  readonly resultReportUrl: string | null;
  /** `preview_ready` iş bu andan sonra silinir (SF-08). */
  readonly expiresAt: string | null;
  /** F3.7a (#85 notu): iş `preview_ready` ve isteyen kullanıcı onaylayabilir. */
  readonly canApply: boolean;
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
  /** F3.7a: yalnız `customer_prices` (servis denetler: zorunlu / izinsiz). */
  buyerId: z.uuid().optional(),
  /** F3.11c: yalnız `stock` (servis denetler: zorunlu / izinsiz). */
  warehouseId: z.uuid().optional(),
});
export type ImportCreate = z.infer<typeof importCreateSchema>;

export const importTemplateQuerySchema = z.strictObject({
  type: z.enum(IMPORT_TYPES),
  buyerId: z.uuid().optional(),
  warehouseId: z.uuid().optional(),
});
export type ImportTemplateQuery = z.infer<typeof importTemplateQuerySchema>;
